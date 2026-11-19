// United States end-of-day collector. Sources (all free): Yahoo Finance (indices, ETFs, macro, stock prices),
// Wikipedia (S&P 500 constituents), Nasdaq IPO calendar, and a rule-based NYSE holiday calendar.
// The universe group "nifty500" is the database's generic "index constituents" group; for the US it holds the S&P 500.
import { get, num, round, addDays, nowIn, sleep, yahooChart, mapLimit, nyseHolidays } from './lib.mjs';

const HEADLINE = [
  ['^GSPC', 'S&P 500', 1], ['^IXIC', 'Nasdaq Composite', 2], ['^DJI', 'Dow Jones', 3], ['^RUT', 'Russell 2000', 4], ['^VIX', 'VIX', 5],
].map(([yahoo, name, sort]) => ({ yahoo, name, symbol: name.toUpperCase(), sort, groups: ['headline'] }));

const SECTORS = [
  ['XLK', 'Technology'], ['XLF', 'Financials'], ['XLV', 'Health Care'], ['XLY', 'Consumer Discretionary'], ['XLP', 'Consumer Staples'], ['XLE', 'Energy'],
  ['XLI', 'Industrials'], ['XLB', 'Materials'], ['XLU', 'Utilities'], ['XLRE', 'Real Estate'], ['XLC', 'Communication Services'],
  ['FDN', 'Internet'], ['IPO', 'IPO ETF'], ['ARKK', 'Innovation (ARKK)'],
].map(([yahoo, name], i) => ({ yahoo, name, symbol: yahoo, sort: 100 + i, groups: ['sector'] }));

const MACRO = [
  { symbol: 'DXY', name: 'US Dollar Index', yahoo: 'DX-Y.NYB', sort: 1 },
  { symbol: 'US10Y', name: 'US 10-year yield (%)', yahoo: '^TNX', sort: 2 },
  { symbol: 'GOLD', name: 'Gold (USD/oz)', yahoo: 'GC=F', sort: 3 },
  { symbol: 'WTI', name: 'WTI crude (USD/bbl)', yahoo: 'CL=F', sort: 4 },
  { symbol: 'BRENT', name: 'Brent crude (USD/bbl)', yahoo: 'BZ=F', sort: 5 },
];

// US-listed startup-born / new-age companies (symbol → category). Symbols Yahoo cannot find are skipped and reported.
const STARTUPS = {
  ABNB: 'Marketplace', UBER: 'Mobility', LYFT: 'Mobility', DASH: 'Marketplace', CART: 'Marketplace', PINS: 'Social', SNAP: 'Social', RDDT: 'Social',
  COIN: 'Fintech / crypto', HOOD: 'Fintech', SOFI: 'Fintech', AFRM: 'Fintech', UPST: 'Fintech', CRCL: 'Fintech / crypto', KLAR: 'Fintech', CHYM: 'Fintech', TOST: 'Fintech',
  DUOL: 'Edtech', RBLX: 'Gaming', U: 'Gaming', NET: 'Infrastructure software', DDOG: 'Infrastructure software', SNOW: 'Data / AI', PLTR: 'Data / AI', PATH: 'Data / AI',
  MDB: 'Infrastructure software', GTLB: 'Developer tools', FIG: 'Design software', KVYO: 'SaaS', ASAN: 'SaaS', DOCU: 'SaaS', TWLO: 'SaaS', OKTA: 'Security', ZM: 'SaaS',
  RIVN: 'EV', LCID: 'EV', HIMS: 'Digital health', DKNG: 'Gaming', SPOT: 'Media', SHOP: 'E-commerce platform', APP: 'Adtech', ETSY: 'Marketplace', CHWY: 'E-commerce', W: 'E-commerce',
};

const decode = (s) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();

async function sp500() {
  const html = await get('https://en.wikipedia.org/api/rest_v1/page/html/List_of_S%26P_500_companies', { tries: 4 });
  const t = html.slice(html.indexOf('<table'));
  const rows = [...t.slice(0, t.indexOf('</table>')).matchAll(/<tr[^>]*>(.*?)<\/tr>/gs)].map((m) => [...m[1].matchAll(/<td[^>]*>(.*?)<\/td>/gs)].map((c) => decode(c[1])));
  return rows.filter((r) => r.length >= 4 && /^[A-Z][A-Z0-9.\-]{0,6}$/.test(r[0])).map((r) => ({ symbol: r[0], name: r[1], sector: r[2], industry: r[3] }));
}
const toYahoo = (s) => s.replace(/\./g, '-');
const rangeFor = (d) => (d <= 20 ? '1mo' : d <= 100 ? '6mo' : d <= 330 ? '1y' : '2y');

export async function collect({ days, stockDays, tracked, log }) {
  const now = nowIn('America/New_York');
  const warn = [];
  const universe = [];
  const quotes = [];
  const counts = {};
  const from = addDays(now.date, -days);
  const sFrom = addDays(now.date, -stockDays);
  // a bar for today is only final after the 16:00 ET close (leave 15 min for the closing auction to print)
  const settled = (bars) => (now.hour < 16.25 ? bars.filter((b) => b.date < now.date) : bars);
  const withPrev = (bars) => bars.map((b, i) => ({ ...b, prev_close: i ? bars[i - 1].close : null }));
  const toQuotes = (kind, symbol, bars, since, dec, turnoverFn) => withPrev(bars).filter((b) => b.date >= since && b.prev_close).map((b) => ({
    kind, symbol, trade_date: b.date, open: b.open, high: b.high, low: b.low, close: round(b.close, dec), prev_close: round(b.prev_close, dec), volume: b.volume, turnover: turnoverFn ? turnoverFn(b) : null,
  }));

  // ---- indices, sector ETFs, macro -----------------------------------------
  const series = [...HEADLINE.map((x) => ({ ...x, kind: 'index' })), ...SECTORS.map((x) => ({ ...x, kind: 'index' })), ...MACRO.map((x) => ({ ...x, kind: 'macro', groups: ['macro'] }))];
  const res = await mapLimit(series, 5, (d) => yahooChart(d.yahoo, rangeFor(days + 10)));
  series.forEach((d, i) => {
    const r = res[i];
    if (!r.ok) { warn.push(`${d.name} (${d.yahoo}) failed: ${r.error.message}`); return; }
    const bars = d.kind === 'macro' ? r.value.bars : settled(r.value.bars);
    const q = toQuotes(d.kind, d.symbol, bars, from, d.kind === 'macro' ? 4 : 2);
    if (!q.length) { warn.push(`${d.name}: no bars in window`); return; }
    universe.push({ kind: d.kind, symbol: d.symbol, name: d.name, groups: d.groups, sort: d.sort });
    quotes.push(...q);
  });
  for (const must of ['S&P 500', 'NASDAQ COMPOSITE', 'RUSSELL 2000']) if (!quotes.some((q) => q.symbol === must)) throw new Error(`${must} missing — Yahoo index data unavailable`);
  const spx = quotes.filter((q) => q.symbol === 'S&P 500').map((q) => q.trade_date).sort();
  const lastSession = spx[spx.length - 1];
  counts.index_sessions = new Set(spx).size;

  // ---- constituents -----------------------------------------------------------
  const members = await sp500();
  if (members.length < 495 || members.length > 510) throw new Error(`S&P 500 list looks wrong (${members.length} rows)`);
  const memberMap = new Map(members.map((m) => [m.symbol, m]));

  // ---- IPOs (Nasdaq calendar) --------------------------------------------------
  const ipos = [];
  const seg = (x) => (/nasdaq/i.test(x || '') ? 'NASDAQ' : /mkt|american/i.test(x || '') ? 'NYSE American' : /nyse/i.test(x || '') ? 'NYSE' : x || 'US');
  const usd = (v) => num(String(v || '').replace(/\$/g, ''));
  const mdy = (s) => { const m = String(s || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : null; };
  const price = (s) => { const m = String(s || '').match(/(\d[\d,]*\.?\d*)\s*-\s*(\d[\d,]*\.?\d*)/); if (m) return [num(m[1]), num(m[2])]; const n = num(s); return [n, n]; };
  const notBlankCheck = (n) => !/\b(spac|acquisition|blank check|merger corp)\b/i.test(n || '');
  const months = [];
  for (let k = -5; k <= 2; k++) { const d = new Date(now.date.slice(0, 7) + '-01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + k); months.push(d.toISOString().slice(0, 7)); }
  const priced = [];
  for (const m of months) {
    try {
      const j = await get(`https://api.nasdaq.com/api/ipo/calendar?date=${m}`, { json: true, tries: 3 });
      const d = j?.data || {};
      for (const r of d.priced?.rows || []) priced.push(r);
      for (const r of d.upcoming?.upcomingTable?.rows || []) {
        const day = mdy(r.expectedPriceDate); const [lo, hi] = price(r.proposedSharePrice);
        if (!r.proposedTickerSymbol || !day || day < addDays(now.date, -1) || !notBlankCheck(r.companyName)) continue;
        ipos.push({ symbol: r.proposedTickerSymbol, name: r.companyName, segment: seg(r.proposedExchange), status: 'upcoming', open_date: day, close_date: day, price_low: lo, price_high: hi, issue_size: usd(r.dollarValueOfSharesOffered) === null ? null : round(usd(r.dollarValueOfSharesOffered) / 1e6, 2) });
      }
    } catch (e) { warn.push(`Nasdaq IPO calendar ${m}: ${e.message}`); }
    await sleep(250);
  }
  const cutoff = addDays(now.date, -150);
  const pricedRows = priced.filter((r) => r.proposedTickerSymbol && mdy(r.pricedDate) && mdy(r.pricedDate) >= cutoff && notBlankCheck(r.companyName));
  counts.ipos_priced = pricedRows.length;

  // ---- stock prices ------------------------------------------------------------
  const startupSyms = Object.keys(STARTUPS);
  const ipoSyms = [...new Set(pricedRows.map((r) => r.proposedTickerSymbol))];
  const all = [...new Set([...members.map((m) => m.symbol), ...startupSyms, ...ipoSyms, ...(tracked || [])])];
  const ipoSet = new Set(ipoSyms);
  const rngNormal = rangeFor(stockDays + 10), rngIpo = rangeFor(Math.max(stockDays + 10, 160));
  const sres = await mapLimit(all, 6, (s) => yahooChart(toYahoo(s), ipoSet.has(s) ? rngIpo : rngNormal));
  const got = new Map();
  const missing = [];
  all.forEach((s, i) => {
    const r = sres[i];
    if (!r.ok) { missing.push(s); return; }
    const bars = settled(r.value.bars);
    if (bars.length < 2) { missing.push(s); return; }
    got.set(s, { name: r.value.name, bars });
  });
  const memberOk = members.filter((m) => got.has(m.symbol)).length;
  if (memberOk < 450) throw new Error(`only ${memberOk} of ${members.length} S&P 500 stocks returned prices`);
  const missMembers = members.filter((m) => !got.has(m.symbol)).map((m) => m.symbol);
  if (missMembers.length) warn.push(`${missMembers.length} S&P 500 symbols without prices: ${missMembers.slice(0, 20).join(', ')}`);
  const missOther = missing.filter((s) => !memberMap.has(s));
  if (missOther.length) warn.push(`startup/IPO/watchlist symbols skipped (no price data): ${missOther.join(', ')}`);
  const turn = (b) => (b.volume ? round((b.close * b.volume) / 1e6, 2) : null); // USD millions
  for (const [s, g] of got) {
    const since = ipoSet.has(s) ? (cutoff < sFrom ? cutoff : sFrom) : sFrom;
    quotes.push(...toQuotes('stock', s, g.bars, since, 2, turn));
    const m = memberMap.get(s);
    const groups = [];
    if (m) groups.push('nifty500');
    if (STARTUPS[s]) groups.push('startup');
    universe.push({ kind: 'stock', symbol: s, name: m?.name || g.name || s, industry: m?.sector || null, category: STARTUPS[s] || null, groups });
  }

  // ---- IPO rows for priced deals: listing date = first trading day we can see ----------
  for (const r of pricedRows) {
    const s = r.proposedTickerSymbol; const g = got.get(s); const pd = mdy(r.pricedDate);
    const first = g?.bars.find((b) => b.date >= pd)?.date || pd;
    const [lo, hi] = price(r.proposedSharePrice);
    ipos.push({ symbol: s, name: r.companyName, segment: seg(r.proposedExchange), status: 'listed', open_date: pd, close_date: pd, listing_date: first, price_low: lo, price_high: hi, issue_price: hi, issue_size: usd(r.dollarValueOfSharesOffered) === null ? null : round(usd(r.dollarValueOfSharesOffered) / 1e6, 2) });
  }
  // a listed symbol must also exist in the universe (search + names) even if it is not a constituent
  counts.ipos = ipos.length;

  // ---- holidays -----------------------------------------------------------------
  const y = Number(now.date.slice(0, 4));
  const calendar = [y - 1, y, y + 1].flatMap(nyseHolidays);
  counts.holidays = calendar.length;
  counts.sp500 = members.length;
  counts.stocks_latest = quotes.filter((q) => q.kind === 'stock' && q.trade_date === lastSession).length;
  counts.universe = universe.length;
  counts.quotes = quotes.length;
  const missStart = startupSyms.filter((s) => !got.has(s));
  if (missStart.length) warn.push(`startup symbols not found (skipped): ${missStart.join(', ')}`);

  return { lastSession, universe, quotes, ipos, calendar, warn, counts, today: now };
}
