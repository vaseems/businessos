// Deterministic Markets data shaped like the Supabase RPC output (used by the offline tests and the UI mock server).
let seed = 7;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const iso = (d) => d.toISOString().slice(0, 10);
const sessions = (n, end = '2026-11-17') => {
  const out = []; const d = new Date(end + 'T00:00:00Z');
  while (out.length < n) { const w = d.getUTCDay(); if (w !== 0 && w !== 6) out.unshift(iso(d)); d.setUTCDate(d.getUTCDate() - 1); }
  return out;
};
function series(base, n, vol, drift = 0.0003) {
  const c = [base]; for (let i = 1; i < n; i++) c.push(Math.round(c[i - 1] * (1 + drift + (rnd() - 0.5) * vol) * 100) / 100);
  return c;
}
const pct = (a, b) => Math.round(((a / b) - 1) * 10000) / 100;
function item(symbol, name, base, n, vol, extra = {}) {
  const d = sessions(n); const c = series(base, n, vol); const last = c[n - 1], prev = c[n - 2];
  const at = (k) => (n - 1 - k >= 0 ? pct(last, c[n - 1 - k]) : null);
  return { symbol, name, date: d[n - 1], close: last, prev, high: Math.round(last * 1.004 * 100) / 100, low: Math.round(last * 0.996 * 100) / 100, volume: null, turnover: 1000 + Math.round(rnd() * 5000),
    changePct: pct(last, prev), chg: { '1w': at(5), '1m': at(21), '3m': at(63), '6m': at(126), '1y': at(250) }, extra: {}, category: null, industry: null, ...extra, c, d };
}
const head = [
  item('NIFTY 50', 'Nifty 50', 25000, 252, 0.009), item('SENSEX', 'Sensex', 81500, 252, 0.009), item('NIFTY BANK', 'Nifty Bank', 61000, 252, 0.012),
  item('NIFTY MIDCAP 100', 'NIFTY Midcap 100', 60000, 252, 0.011), item('NIFTY SMALLCAP 100', 'NIFTY Smallcap 100', 19500, 252, 0.013), item('INDIA VIX', 'India VIX', 15.5, 252, 0.05, { turnover: null }),
];
const SECT = ['Nifty Auto', 'Nifty Bank', 'Nifty Financial Services', 'Nifty FMCG', 'Nifty IT', 'Nifty Media', 'Nifty Metal', 'Nifty Pharma', 'Nifty PSU Bank', 'Nifty Realty', 'Nifty Energy', 'Nifty Oil & Gas',
  'Nifty Healthcare Index', 'Nifty Consumer Durables', 'Nifty Capital Goods', 'Nifty Telecommunications', 'Nifty Chemicals', 'Nifty Infrastructure', 'Nifty India Internet', 'Nifty India Digital', 'Nifty IPO'];
const sectors = SECT.map((n, i) => item(n.toUpperCase(), n, 5000 + i * 900, 252, 0.013));
const ST = [['ETERNAL', 'Eternal Limited', 'Consumer internet', 'Consumer Services', 310], ['SWIGGY', 'Swiggy Limited', 'Consumer internet', 'Consumer Services', 420], ['NYKAA', 'FSN E-Commerce Ventures Limited', 'E-commerce', 'Consumer Services', 235],
  ['PAYTM', 'One 97 Communications Limited', 'Fintech', 'Financial Services', 1180], ['POLICYBZR', 'PB Fintech Limited', 'Fintech', 'Financial Services', 1850], ['DELHIVERY', 'Delhivery Limited', 'Logistics', 'Services', 430],
  ['LENSKART', 'Lenskart Solutions Limited', 'D2C / retail', 'Consumer Services', 480], ['GROWW', 'Billionbrains Garage Ventures Limited', 'Fintech', 'Financial Services', 160], ['MEESHO', 'Meesho Limited', 'E-commerce', 'Consumer Services', 170],
  ['OLAELEC', 'Ola Electric Mobility Limited', 'EV / mobility', 'Automobile', 48], ['IXIGO', 'Le Travenues Technology Limited', 'Travel tech', 'Consumer Services', 305], ['NAZARA', 'Nazara Technologies Limited', 'Gaming', 'Media', 1050],
  ['HONASA', 'Honasa Consumer Limited', 'D2C / retail', 'Fast Moving Consumer Goods', 285], ['CARTRADE', 'Cartrade Tech Limited', 'Auto marketplace', 'Consumer Services', 2300], ['URBANCO', 'Urban Company Limited', 'Consumer services', 'Consumer Services', 150]];
const startups = ST.map(([s, n, cat, ind, b]) => item(s, n, b, 100, 0.03, { category: cat, industry: ind, volume: 1000000 + Math.round(rnd() * 9e6) }));
const macro = [['USDINR', 'USD/INR', 93.4], ['GOLD', 'Gold (USD/oz)', 3775], ['BRENT', 'Brent crude (USD/bbl)', 91.6], ['WTI', 'WTI crude (USD/bbl)', 84]].map(([s, n, b]) => item(s, n, b, 40, 0.008));
const stocks = ST.map(([s, n, , ind], i) => ({ symbol: s, name: n, industry: ind, close: startups[i].close, prev: startups[i].prev, changePct: startups[i].changePct, volume: startups[i].volume, turnover: 120 + i * 13 }));
const more = [['RELIANCE', 'Reliance Industries Limited', 'Oil Gas & Consumable Fuels', 1400], ['TCS', 'Tata Consultancy Services Limited', 'Information Technology', 3250], ['HDFCBANK', 'HDFC Bank Limited', 'Financial Services', 1000], ['INFY', 'Infosys Limited', 'Information Technology', 1500],
  ['SBIN', 'State Bank of India', 'Financial Services', 880], ['TATASTEEL', 'Tata Steel Limited', 'Metals & Mining', 175], ['ITC', 'ITC Limited', 'Fast Moving Consumer Goods', 410], ['MARUTI', 'Maruti Suzuki India Limited', 'Automobile', 13000], ['SUNPHARMA', 'Sun Pharmaceutical Industries Limited', 'Healthcare', 1700], ['ADANIENT', 'Adani Enterprises Limited', 'Metals & Mining', 2400]]
  .map(([s, n, ind, b], i) => { const p = Math.round((rnd() - 0.45) * 800) / 100; return { symbol: s, name: n, industry: ind, close: b, prev: Math.round((b / (1 + p / 100)) * 100) / 100, changePct: p, volume: 2e6, turnover: 800 + i * 40 }; });
const universeAll = [...stocks, ...more];
const rank = (arr) => [...arr].sort((a, b) => b.changePct - a.changePct);
const movers = (universe, limit = 10) => {
  const r = rank(universe === 'all' ? universeAll : [...stocks, ...more]); const g = r.filter((x) => x.changePct > 0).slice(0, limit); const l = r.filter((x) => x.changePct < 0).reverse().slice(0, limit);
  return { date: '2026-11-17', universe, count: r.length, advancers: r.filter((x) => x.changePct > 0).length, decliners: r.filter((x) => x.changePct < 0).length, gainers: g, losers: l };
};
const ipos = {
  open: [{ symbol: 'CRYSTALCP', name: 'Crystal Crop Protection Limited', segment: 'Mainboard', open_date: '2026-11-18', close_date: '2026-11-20', price_low: 259, price_high: 272, issue_size: 331 }],
  upcoming: [{ symbol: 'WATRANA', name: 'Watrana Rentals Limited', segment: 'SME', open_date: '2026-11-19', close_date: '2026-11-23', price_low: 232, price_high: 245, issue_size: 12.01 },
    { symbol: 'MAHANADI', name: 'Mahanadi Coalfields Limited', segment: 'Mainboard', open_date: '2026-11-24', close_date: '2026-11-26', price_low: null, price_high: null, issue_size: null }],
  listed: [{ symbol: 'BCSSL', name: 'Bombay Coated and Special Steels Limited', segment: 'Mainboard', open_date: '2026-10-29', close_date: '2026-11-02', listing_date: '2026-11-05', issue_price: 82, listing_close: 88.4, last_close: 91.2, last_date: '2026-11-17', gain_pct: 11.22, listing_gain_pct: 7.8 },
    { symbol: 'MKJEWELS', name: 'M. K. Sons Fine Jewels Limited', segment: 'Mainboard', open_date: '2026-10-28', close_date: '2026-10-30', listing_date: '2026-11-04', issue_price: 162, listing_close: 150.1, last_close: 143.5, last_date: '2026-11-17', gain_pct: -11.42, listing_gain_pct: -7.35 },
    { symbol: 'ESFL', name: 'ESFL SME Limited', segment: 'SME', open_date: '2026-11-04', close_date: '2026-11-09', listing_date: '2026-11-13', issue_price: 115, listing_close: null, last_close: null, last_date: null, gain_pct: null, listing_gain_pct: null }],
};
const overview = () => ({ region: 'in', asOf: '2026-11-17', stocksAsOf: '2026-11-17', run: { ok: true, trade_date: '2026-11-17', finished_at: '2026-11-17T13:42:00Z', note: null },
  indices: head, sectors, movers: movers('nifty500'), startups, macro, ipos, holidays: [{ day: '2026-11-24', description: 'Prakash Gurpurb Sri Guru Nanak Dev' }, { day: '2026-12-25', description: 'Christmas' }] });
const searchable = [...startups.map((s) => ({ ...s, c: undefined, d: undefined })), ...more].map((s) => ({ symbol: s.symbol, name: s.name, industry: s.industry, close: s.close, date: '2026-11-17', change_pct: s.changePct }));

// ---- US edition (compact) ----------------------------------------------------
const US_HEAD = [item('S&P 500', 'S&P 500', 7300, 252, 0.008), item('NASDAQ COMPOSITE', 'Nasdaq Composite', 24400, 252, 0.011), item('DOW JONES', 'Dow Jones', 50000, 252, 0.007), item('RUSSELL 2000', 'Russell 2000', 2700, 252, 0.012), item('VIX', 'VIX', 24.5, 252, 0.05)];
const US_SECT = ['Technology', 'Financials', 'Health Care', 'Consumer Discretionary', 'Consumer Staples', 'Energy', 'Industrials', 'Materials', 'Utilities', 'Real Estate', 'Communication Services', 'Internet', 'IPO ETF', 'Innovation (ARKK)'].map((n, i) => item(n.toUpperCase(), n, 60 + i * 9, 252, 0.012));
const US_MACRO = [['DXY', 'US Dollar Index', 103.9], ['US10Y', 'US 10-year yield (%)', 5.066], ['GOLD', 'Gold (USD/oz)', 3726], ['WTI', 'WTI crude (USD/bbl)', 82.2], ['BRENT', 'Brent crude (USD/bbl)', 89.4]].map(([s, n, b]) => item(s, n, b, 40, 0.008));
const US_ST = [['ABNB', 'Airbnb, Inc.', 'Marketplace', 'Consumer Discretionary', 124], ['UBER', 'Uber Technologies, Inc.', 'Mobility', 'Industrials', 88], ['COIN', 'Coinbase Global, Inc.', 'Fintech / crypto', 'Financials', 260], ['PLTR', 'Palantir Technologies Inc.', 'Data / AI', 'Information Technology', 160], ['DUOL', 'Duolingo, Inc.', 'Edtech', 'Consumer Discretionary', 320], ['SHOP', 'Shopify Inc.', 'E-commerce platform', 'Information Technology', 110]];
const US_STARTUPS = US_ST.map(([s, n, cat, ind, b]) => item(s, n, b, 100, 0.03, { category: cat, industry: ind, volume: 3e6 }));
const US_MORE = [['AAPL', 'Apple Inc.', 'Information Technology', 230], ['MSFT', 'Microsoft Corporation', 'Information Technology', 480], ['NVDA', 'Nvidia Corporation', 'Information Technology', 190], ['JPM', 'JPMorgan Chase & Co.', 'Financials', 310], ['XOM', 'Exxon Mobil Corporation', 'Energy', 118], ['LLY', 'Eli Lilly and Company', 'Health Care', 900]]
  .map(([s, n, ind, b], i) => { const p = Math.round((rnd() - 0.45) * 800) / 100; return { symbol: s, name: n, industry: ind, close: b, prev: Math.round((b / (1 + p / 100)) * 100) / 100, changePct: p, volume: 2e7, turnover: 9000 + i * 400 }; });
const US_STOCKS = US_ST.map(([s, n, , ind], i) => ({ symbol: s, name: n, industry: ind, close: US_STARTUPS[i].close, prev: US_STARTUPS[i].prev, changePct: US_STARTUPS[i].changePct, volume: US_STARTUPS[i].volume, turnover: 900 + i * 31 }));
const US_ALL = [...US_STOCKS, ...US_MORE];
const usMovers = (universe, limit = 10) => { const r = rank(universe === 'all' ? US_ALL : US_MORE); return { date: '2026-11-17', universe, count: r.length, advancers: r.filter((x) => x.changePct > 0).length, decliners: r.filter((x) => x.changePct < 0).length, gainers: r.filter((x) => x.changePct > 0).slice(0, limit), losers: r.filter((x) => x.changePct < 0).reverse().slice(0, limit) }; };
const usIpos = {
  open: [],
  upcoming: [{ symbol: 'ANTH', name: 'Example Robotics, Inc.', segment: 'NASDAQ', open_date: '2026-11-20', close_date: '2026-11-20', price_low: 18, price_high: 20, issue_size: 410 }, { symbol: 'KLRN', name: 'Klarion Health Corp', segment: 'NYSE', open_date: '2026-11-21', close_date: '2026-11-21', price_low: 14, price_high: 14, issue_size: 96.5 }],
  listed: [{ symbol: 'RZAI', name: 'Razor AI Holdings', segment: 'NASDAQ', open_date: '2026-11-05', close_date: '2026-11-05', listing_date: '2026-11-06', price_low: 16, price_high: 18, issue_price: 18, listing_close: 22.4, last_close: 25.1, last_date: '2026-11-17', gain_pct: 39.44, listing_gain_pct: 24.44 }],
};
const overviewUs = () => ({ region: 'us', asOf: '2026-11-17', stocksAsOf: '2026-11-17', run: { ok: true, trade_date: '2026-11-17', finished_at: '2026-11-17T22:50:00Z', note: null },
  indices: US_HEAD, sectors: US_SECT, movers: usMovers('sp500'), startups: US_STARTUPS, macro: US_MACRO, ipos: usIpos, holidays: [{ day: '2026-11-26', description: "Thanksgiving Day" }, { day: '2026-12-25', description: 'Christmas Day' }] });
const usSearchable = [...US_STARTUPS.map((s) => ({ ...s, c: undefined, d: undefined })), ...US_MORE].map((s) => ({ symbol: s.symbol, name: s.name, industry: s.industry, close: s.close, date: '2026-11-17', change_pct: s.changePct }));
module.exports = { overview, movers, searchable, startups, overviewUs, usMovers, usSearchable, usStartups: US_STARTUPS };
