// India (NSE/BSE) end-of-day collector. Sources: NSE archives + NSE JSON APIs (official, free) and Yahoo (Sensex, macro).
import { get, csvObjects, num, round, isoDate, ddmmyyyy, addDays, isWeekday, nowIn, yahooDaily, sleep } from './lib.mjs';

const ARCH = 'https://nsearchives.nseindia.com';
const norm = (s) => String(s).toUpperCase().replace(/\s+/g, ' ').trim();

// Headline + sector indices. `name` must match the "Index Name" column of NSE's daily index file (case-insensitive).
const IDX = [
  ['Nifty 50', ['headline'], 1], ['SENSEX', ['headline'], 2, 'yahoo:^BSESN'], ['Nifty Bank', ['headline', 'sector'], 3],
  ['NIFTY Midcap 100', ['headline'], 4], ['NIFTY Smallcap 100', ['headline'], 5], ['India VIX', ['headline'], 6],
  ['Nifty Auto', ['sector']], ['Nifty Financial Services', ['sector']], ['Nifty FMCG', ['sector']], ['Nifty IT', ['sector']],
  ['Nifty Media', ['sector']], ['Nifty Metal', ['sector']], ['Nifty Pharma', ['sector']], ['Nifty PSU Bank', ['sector']],
  ['Nifty Realty', ['sector']], ['Nifty Energy', ['sector']], ['Nifty Oil & Gas', ['sector']], ['Nifty Healthcare Index', ['sector']],
  ['Nifty Consumer Durables', ['sector']], ['Nifty Capital Goods', ['sector']], ['Nifty Telecommunications', ['sector']],
  ['Nifty Chemicals', ['sector']], ['Nifty Infrastructure', ['sector']],
  ['Nifty India Internet', ['sector']], ['Nifty India Digital', ['sector']], ['Nifty IPO', ['sector']],
].map(([name, groups, sort, src]) => ({ name, key: norm(name), groups, sort: sort ?? 100, src }));

const MACRO = [
  { symbol: 'USDINR', name: 'USD/INR', yahoo: 'USDINR=X', sort: 1 },
  { symbol: 'GOLD', name: 'Gold (USD/oz)', yahoo: 'GC=F', sort: 2 },
  { symbol: 'BRENT', name: 'Brent crude (USD/bbl)', yahoo: 'BZ=F', sort: 3 },
  { symbol: 'WTI', name: 'WTI crude (USD/bbl)', yahoo: 'CL=F', sort: 4 },
];

// Listed new-age / startup-born companies (NSE symbol → category). Symbols not found in the exchange files are skipped and reported.
const STARTUPS = {
  ETERNAL: 'Consumer internet', SWIGGY: 'Consumer internet', URBANCO: 'Consumer services', NYKAA: 'E-commerce', MEESHO: 'E-commerce',
  FIRSTCRY: 'E-commerce', LENSKART: 'D2C / retail', HONASA: 'D2C / retail', PAYTM: 'Fintech', POLICYBZR: 'Fintech', GROWW: 'Fintech',
  PINELABS: 'Fintech', MOBIKWIK: 'Fintech', ZAGGLE: 'Fintech', DELHIVERY: 'Logistics', SHADOWFAX: 'Logistics', OLAELEC: 'EV / mobility',
  CARTRADE: 'Auto marketplace', EASEMYTRIP: 'Travel tech', IXIGO: 'Travel tech', TBOTEK: 'Travel tech', RATEGAIN: 'SaaS',
  NAZARA: 'Gaming', NAUKRI: 'Internet platform', INDIAMART: 'B2B marketplace', YATRA: 'Travel tech', PWL: 'Edtech', MAPMYINDIA: 'Deeptech', IDEAFORGE: 'Deeptech', AWFIS: 'Workspace',
};

export async function collect({ days, stockDays, tracked, log }) {
  const today = nowIn('Asia/Kolkata');
  const warn = [];
  const universe = [];
  const quotes = [];
  const counts = {};

  // ---- reference data ------------------------------------------------------
  const eq = csvObjects(await get(`${ARCH}/content/equities/EQUITY_L.csv`, { tries: 4 }));
  const names = new Map(eq.map((r) => [r['SYMBOL'], { name: r['NAME OF COMPANY'], isin: r['ISIN NUMBER'] }]));
  const n500 = csvObjects(await get(`${ARCH}/content/indices/ind_nifty500list.csv`, { tries: 4 }));
  const n500Map = new Map(n500.map((r) => [r['Symbol'], r['Industry']]));
  if (n500Map.size < 480 || n500Map.size > 520) throw new Error(`Nifty 500 list looks wrong (${n500Map.size} symbols)`);
  if (names.size < 1500) throw new Error(`EQUITY_L looks wrong (${names.size} symbols)`);

  // ---- sessions to load ----------------------------------------------------
  const dates = [];
  for (let i = 0; i < days; i++) { const d = addDays(today.date, -i); if (isWeekday(d)) dates.push(d); }
  dates.reverse(); // oldest → newest

  // ---- index closes (one small file per session) ---------------------------
  const wanted = new Map(IDX.filter((x) => !x.src).map((x) => [x.key, x]));
  const idxRows = new Map(); // key → [{date,...}]
  const sessions = [];
  let nIdxFiles = 0;
  for (const d of dates) {
    const txt = await get(`${ARCH}/content/indices/ind_close_all_${ddmmyyyy(d)}.csv`);
    if (!txt) continue; // holiday / not yet published
    nIdxFiles++;
    const rows = csvObjects(txt);
    if (rows.length < 100) { warn.push(`index file ${d}: only ${rows.length} rows`); continue; }
    sessions.push(d);
    for (const r of rows) {
      const k = norm(r['Index Name']);
      const def = wanted.get(k);
      if (!def) continue;
      const close = num(r['Closing Index Value']);
      const chg = num(r['Points Change']);
      if (close === null || close <= 0) continue;
      const prev = chg === null ? null : round(close - chg, 4);
      const pct = num(r['Change(%)']);
      if (prev && pct !== null && Math.abs(((close - prev) / prev) * 100 - pct) > 0.06) warn.push(`index ${r['Index Name']} ${d}: file says ${pct}% but close/prev give ${round(((close - prev) / prev) * 100, 2)}%`);
      const list = idxRows.get(k) || [];
      list.push({ trade_date: d, kind: 'index', symbol: k, open: num(r['Open Index Value']), high: num(r['High Index Value']), low: num(r['Low Index Value']), close, prev_close: prev, volume: num(r['Volume']), turnover: num(r['Turnover (Rs. Cr.)']) });
      idxRows.set(k, list);
    }
    await sleep(120);
  }
  if (!sessions.length) throw new Error('no index files found for the requested window');
  const lastSession = sessions[sessions.length - 1];
  for (const [k, def] of wanted) {
    const list = idxRows.get(k);
    if (!list?.length) { warn.push(`index not found in NSE file: ${def.name}`); continue; }
    universe.push({ kind: 'index', symbol: k, name: def.name, groups: def.groups, sort: def.sort });
    quotes.push(...list);
  }
  if (!idxRows.has('NIFTY 50') || !idxRows.has('NIFTY BANK')) throw new Error('Nifty 50 / Nifty Bank missing from NSE index file');
  counts.index_sessions = sessions.length;

  // ---- Sensex + macro from Yahoo ------------------------------------------
  const minDate = dates[0];
  const dropPartial = (bars, closeHourIst) => (today.hour < closeHourIst ? bars.filter((b) => b.date < today.date) : bars);
  const withPrev = (bars) => bars.map((b, i) => ({ ...b, prev_close: i ? bars[i - 1].close : null }));
  try {
    const bars = withPrev(dropPartial(await yahooDaily('^BSESN', days > 300 ? '2y' : '1y'), 16)).filter((b) => b.date >= minDate && b.prev_close);
    const def = IDX.find((x) => x.name === 'SENSEX');
    universe.push({ kind: 'index', symbol: def.key, name: 'Sensex', groups: def.groups, sort: def.sort });
    bars.forEach((b) => quotes.push({ kind: 'index', symbol: def.key, trade_date: b.date, open: b.open, high: b.high, low: b.low, close: round(b.close, 2), prev_close: round(b.prev_close, 2), volume: null, turnover: null }));
    if (!bars.length) warn.push('Sensex: no bars');
  } catch (e) { warn.push(`Sensex (Yahoo) failed: ${e.message}`); }
  for (const m of MACRO) {
    try {
      const bars = withPrev(await yahooDaily(m.yahoo, days > 300 ? '2y' : '1y')).filter((b) => b.date >= minDate && b.prev_close);
      universe.push({ kind: 'macro', symbol: m.symbol, name: m.name, groups: ['macro'], sort: m.sort });
      bars.forEach((b) => quotes.push({ kind: 'macro', symbol: m.symbol, trade_date: b.date, open: b.open, high: b.high, low: b.low, close: round(b.close, 4), prev_close: round(b.prev_close, 4), volume: null, turnover: null }));
      if (!bars.length) warn.push(`${m.name}: no bars`);
    } catch (e) { warn.push(`${m.name} (Yahoo) failed: ${e.message}`); }
    await sleep(200);
  }

  // ---- IPOs ----------------------------------------------------------------
  const ipos = [];
  const price = (s) => { const m = String(s || '').match(/(\d[\d,]*\.?\d*)\s*(?:to|-)\s*(?:Rs\.?\s*)?(\d[\d,]*\.?\d*)/i); if (m) return [num(m[1]), num(m[2])]; const one = String(s || '').match(/(\d[\d,]*\.?\d*)/); return one ? [num(one[1]), num(one[1])] : [null, null]; };
  const cr = (shares, p) => (shares && p ? round((shares * p) / 1e7, 2) : null); // ₹ Cr
  const open = new Map();
  const apiList = async (path) => { try { const j = await get(`https://www.nseindia.com/api/${path}`, { json: true, tries: 3 }); return Array.isArray(j) ? j : []; } catch (e) { warn.push(`${path}: ${e.message}`); return []; } };
  for (const r of await apiList('ipo-current-issue')) {
    if (!r.symbol || (r.category && r.category !== 'Total')) continue;
    const [lo, hi] = price(r.issuePrice);
    open.set(r.symbol, { symbol: r.symbol, name: r.companyName, segment: r.series === 'SME' ? 'SME' : 'Mainboard', status: 'open', open_date: isoDate(r.issueStartDate), close_date: isoDate(r.issueEndDate), price_low: lo, price_high: hi, issue_size: cr(num(r.issueSize), hi) });
  }
  ipos.push(...open.values());
  for (const r of await apiList('all-upcoming-issues?category=ipo')) {
    if (!r.symbol || open.has(r.symbol)) continue;
    const [lo, hi] = price(r.issuePrice);
    ipos.push({ symbol: r.symbol, name: r.companyName, segment: r.series === 'SME' ? 'SME' : 'Mainboard', status: 'upcoming', open_date: isoDate(r.issueStartDate), close_date: isoDate(r.issueEndDate), price_low: lo, price_high: hi, issue_size: cr(num(r.issueSize), hi) });
  }
  const cutoff = addDays(today.date, -150);
  for (const r of await apiList('public-past-issues')) {
    if (r.securityType !== 'Equity' && r.securityType !== 'SME') continue;
    const listing = isoDate(r.listingDate);
    if (!listing || listing < cutoff || listing > today.date) continue;
    const [lo, hi] = price(r.priceRange);
    ipos.push({ symbol: r.symbol, name: r.company, segment: r.securityType === 'SME' ? 'SME' : 'Mainboard', status: 'listed', open_date: isoDate(r.ipoStartDate), close_date: isoDate(r.ipoEndDate), listing_date: listing, price_low: lo, price_high: hi, issue_price: num(r.issuePrice) ?? hi });
  }
  counts.ipos = ipos.length;
  const ipoSyms = new Set(ipos.filter((x) => x.status === 'listed').map((x) => x.symbol));

  // ---- holidays ------------------------------------------------------------
  let calendar = [];
  try {
    const j = await get('https://www.nseindia.com/api/holiday-master?type=trading', { json: true });
    calendar = (j?.CM || []).map((h) => ({ day: isoDate(h.tradingDate), description: String(h.description).replace(/\*$/, '').trim() })).filter((h) => h.day);
  } catch (e) { warn.push(`holiday-master: ${e.message}`); }
  counts.holidays = calendar.length;

  // ---- stocks (NSE bhavcopy) ----------------------------------------------
  const startupSyms = Object.keys(STARTUPS);
  const trackSet = new Set([...n500Map.keys(), ...startupSyms, ...ipoSyms, ...(tracked || [])]);
  const stockDates = sessions.filter((d) => d >= addDays(today.date, -stockDays));
  const seen = new Set();
  let latestStocks = 0;
  for (const d of stockDates) {
    const txt = await get(`${ARCH}/products/content/sec_bhavdata_full_${ddmmyyyy(d)}.csv`, { tries: 4 });
    if (!txt) { warn.push(`bhavcopy missing for ${d}`); continue; }
    const rows = csvObjects(txt);
    const isLatest = d === lastSession;
    const best = new Map();
    for (const r of rows) {
      const s = r['SYMBOL'];
      const ser = r['SERIES'];
      const keep = ser === 'EQ' ? isLatest || trackSet.has(s) : trackSet.has(s) && ['BE', 'BZ', 'SM', 'ST', 'SZ', 'BL', 'IL'].includes(ser);
      if (!keep) continue;
      const prevBest = best.get(s);
      if (prevBest && prevBest.series === 'EQ') continue;
      const close = num(r['CLOSE_PRICE']);
      if (close === null || close <= 0) continue;
      best.set(s, { series: ser, row: { kind: 'stock', symbol: s, trade_date: d, open: num(r['OPEN_PRICE']), high: num(r['HIGH_PRICE']), low: num(r['LOW_PRICE']), close, prev_close: num(r['PREV_CLOSE']), volume: num(r['TTL_TRD_QNTY']), turnover: num(r['TURNOVER_LACS']) === null ? null : round(num(r['TURNOVER_LACS']) / 100, 2) } });
    }
    if (isLatest) {
      latestStocks = [...best.values()].filter((b) => b.series === 'EQ').length;
      if (latestStocks < 1500) throw new Error(`bhavcopy ${d}: only ${latestStocks} EQ rows`);
      for (const [s, b] of best) { seen.add(s); }
    }
    for (const b of best.values()) quotes.push(b.row);
    await sleep(150);
  }
  counts.stocks_latest = latestStocks;

  // ---- stock universe -------------------------------------------------------
  const ipoNames = new Map(ipos.map((x) => [x.symbol, x.name]));
  for (const s of seen) {
    const groups = [];
    if (n500Map.has(s)) groups.push('nifty500');
    if (STARTUPS[s]) groups.push('startup');
    const meta = names.get(s);
    universe.push({ kind: 'stock', symbol: s, name: meta?.name || ipoNames.get(s) || s, industry: n500Map.get(s) || null, category: STARTUPS[s] || null, isin: meta?.isin || null, groups });
  }
  const missingStartups = startupSyms.filter((s) => !seen.has(s));
  if (missingStartups.length) warn.push(`startup symbols not found in latest bhavcopy (skipped): ${missingStartups.join(', ')}`);
  const missing500 = [...n500Map.keys()].filter((s) => !seen.has(s));
  if (missing500.length > 15) warn.push(`${missing500.length} Nifty 500 symbols missing from bhavcopy`);
  counts.universe = universe.length;
  counts.quotes = quotes.length;
  counts.nifty500 = n500Map.size;

  return { lastSession, universe, quotes, ipos, calendar, warn, counts, today };
}
