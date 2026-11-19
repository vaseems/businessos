'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Shell from '@/components/Shell';
import { useApp } from '@/components/AppContext';
import { Seg, Notice, Icon } from '@/components/ui';
import { BigChart, Delta, PERIODS, PERIOD_NAME, Spark, changeOf, crore, dirOf, heatStyle, level, price, windowOf, type Period } from '@/components/MarketParts';
import {
  ApiError, addWatch, fetchMarket, fetchMovers, getWatchlist, removeWatch, searchStocks,
  type MarketIpo, type MarketItem, type MarketMovers, type MarketOverview, type StockHit,
} from '@/lib/api';
import { dFull, dMon } from '@/lib/format';

const PERIOD_OPTS = PERIODS.map(([k, l]) => [k, l]) as [string, string][];

export default function Markets() {
  const { region, ready } = useApp();
  const router = useRouter();
  const [data, setData] = useState<MarketOverview | null>(null);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState<Period>('1d');
  const [focus, setFocus] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const d = await fetchMarket(region);
      setData(d);
      setFocus((f) => (d.indices.some((i) => i.symbol === f) ? f : d.indices[0]?.symbol || ''));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { router.replace('/login/'); return; }
      setError(e instanceof Error ? e.message : 'Could not load market data');
    }
  }, [region, router]);

  useEffect(() => { if (ready) { setData(null); load(); } }, [ready, region, load]);

  const focusItem = useMemo(() => data?.indices.find((i) => i.symbol === focus) || null, [data, focus]);
  const vix = data?.indices.find((i) => i.symbol === 'INDIA VIX' || i.symbol === 'VIX') || null;

  return (
    <Shell title="Markets" refresh={load}>
      {error && !data ? (
        <section className="empty"><h1>Market data unavailable</h1><p>{error}</p><button className="btn" type="button" onClick={load}>Try again</button></section>
      ) : !data ? (
        <p className="muted">Loading…</p>
      ) : (
        <div className="mk">
          <StatusBar d={data} region={region} />
          {data.empty ? <Empty d={data} /> : (
            <>
              <div className="mk-bar">
                <Seg label="Period" id="mk-period" value={period} options={PERIOD_OPTS} onChange={(v) => setPeriod(v as Period)} />
                <span className="muted small">Change over the last {PERIOD_NAME[period]}{period === '1d' ? ' (latest session)' : ''}</span>
              </div>

              <div className={`mk-idx ${data.indices.length === 5 ? 'n5' : ''}`} role="list">
                {data.indices.map((it) => (
                  <IndexCard key={it.symbol} it={it} p={period} region={region} on={it.symbol === focus} pick={() => setFocus(it.symbol)} />
                ))}
              </div>

              {focusItem && (
                <section className="panel mk-focus">
                  <div className="panel-head">
                    <h2>{focusItem.name}</h2>
                    <span className="muted small">{dFull(focusItem.date)} close · {level(focusItem.close, region)}</span>
                  </div>
                  <BigChart it={focusItem} p={period} region={region} />
                </section>
              )}

              <MacroStrip macro={data.macro} vix={vix} region={region} p={period} />

              <div className="mk-two">
                <Movers d={data} region={region} />
                <Sectors items={data.sectors} p={period} region={region} />
              </div>

              <Ipos ipos={data.ipos} region={region} />
              <Startups items={data.startups} p={period} region={region} asOf={data.stocksAsOf} />
              <Watchlist region={region} />
              <p className="muted small mk-foot">
                {region === 'us'
                  ? 'End-of-day data from Yahoo Finance, the Nasdaq IPO calendar and Wikipedia (S&P 500 membership). Figures can differ slightly from a live terminal. Information only, not investment advice.'
                  : 'End-of-day data from NSE (official closing files) and Yahoo Finance for Sensex and global quotes. Figures can differ slightly from a live terminal. Information only, not investment advice.'}
              </p>
            </>
          )}
        </div>
      )}
    </Shell>
  );
}

/* ── status ─────────────────────────────────────────────────────────────── */
function StatusBar({ d, region }: { d: MarketOverview; region: string }) {
  const s = d.status;
  const open = s.state === 'open';
  const when = `${dFull(s.nextOpen.date)}, ${s.nextOpen.time} ${s.nextOpen.zone}`;
  return (
    <>
      <section className="mk-status" aria-label="Market status">
        <span className={`mk-pill ${open ? 'open' : 'closed'}`}><i className="dot" aria-hidden="true" />{open ? 'Market open' : 'Market closed'}</span>
        <span className="muted small">{s.exchange} · {s.session} · {s.reason}</span>
        <span className="mk-sp" />
        {!open && <span className="small">Next open <b>{when}</b></span>}
        {s.nextHoliday && <span className="muted small">Next holiday: {s.nextHoliday.description} ({dMon(s.nextHoliday.day)})</span>}
        {d.asOf && <span className="muted small">Data as of <b>{dFull(d.asOf)}</b> close</span>}
      </section>
      {s.stale && d.asOf && <Notice>The latest figures are from {dFull(d.asOf)}. The daily update for {dFull(s.expectedSession)} has not come in yet; it will appear here once it does.</Notice>}
      {d.run && d.run.ok === false && <Notice>The last data refresh reported a problem{d.run.note ? `: ${d.run.note}` : ''}. Showing the most recent good data.</Notice>}
      {region === 'us' && !d.empty && !s.holidaysKnown && <p className="muted small">US exchange holidays are not listed yet; weekends are handled.</p>}
    </>
  );
}

function Empty({ d }: { d: MarketOverview }) {
  const us = d.region === 'us';
  return (
    <section className="panel mk-empty">
      <h2>Market data is being loaded for the first time</h2>
      <p className="muted">{us
        ? 'The first US end-of-day update has not completed yet. It runs every weekday evening (US Eastern) after the close, and this page fills in automatically after that.'
        : 'The first end-of-day update has not completed yet. It runs every weekday evening (IST) after NSE publishes its closing files, and this page fills in automatically after that.'}</p>
    </section>
  );
}

/* ── index cards + macro ────────────────────────────────────────────────── */
function IndexCard({ it, p, region, on, pick }: { it: MarketItem; p: Period; region: any; on: boolean; pick: () => void }) {
  const w = windowOf(it, p);
  const ch = changeOf(it, p);
  const pts = it.prev !== null && it.prev !== undefined ? it.close - it.prev : null;
  return (
    <button type="button" role="listitem" className={`mk-card ${dirOf(ch)}`} aria-pressed={on} onClick={pick} aria-label={`${it.name}, ${level(it.close, region)}, ${ch === null ? 'no change figure' : (ch > 0 ? 'up ' : ch < 0 ? 'down ' : '') + Math.abs(ch).toFixed(2) + ' percent'} over the ${PERIOD_NAME[p]}`}>
      <span className="mk-name">{it.name}</span>
      <span className="mk-lvl">{level(it.close, region)}</span>
      <span className="mk-chg"><Delta v={ch} />{p === '1d' && pts !== null && <small>{pts > 0 ? '+' : ''}{level(pts, region)}</small>}</span>
      <Spark c={w.c} dir={dirOf(w.c.length > 1 ? w.c[w.c.length - 1] - w.c[0] : 0)} />
    </button>
  );
}

function MacroStrip({ macro, vix, region, p }: { macro: MarketItem[]; vix: MarketItem | null; region: any; p: Period }) {
  const items = [...macro, ...(vix ? [vix] : [])];
  if (!items.length) return null;
  const dec = (it: MarketItem) => (it.symbol === 'USDINR' || it.symbol === 'US10Y' ? 3 : 2);
  return (
    <section className="mk-macro" aria-label="Currency, commodities and volatility">
      {items.map((it) => {
        const ch = changeOf(it, p);
        return (
          <div className="mk-m" key={it.symbol}>
            <span className="muted small">{it.name}</span>
            <b>{level(it.close, region, dec(it))}</b>
            <Delta v={ch} />
          </div>
        );
      })}
    </section>
  );
}

/* ── movers ─────────────────────────────────────────────────────────────── */
function Movers({ d, region }: { d: MarketOverview; region: any }) {
  const [uni, setUni] = useState<'nifty500' | 'all'>('nifty500');
  const [alt, setAlt] = useState<MarketMovers | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (uni === 'nifty500') { setAlt(null); return; }
    let live = true; setBusy(true); setErr('');
    fetchMovers(region, 'all').then((m) => live && setAlt(m)).catch(() => live && setErr('Could not load all stocks.')).finally(() => live && setBusy(false));
    return () => { live = false; };
  }, [uni, region]);
  const m = uni === 'all' ? alt : d.movers;
  const adv = m?.advancers ?? 0, dec = m?.decliners ?? 0, tot = Math.max(1, adv + dec);
  return (
    <section className="panel mk-movers">
      <div className="panel-head">
        <h2>Top movers</h2>
        <Seg label="Stock universe" value={uni} options={region === 'us' ? [['nifty500', 'S&P 500'], ['all', 'Incl. startups & new IPOs']] : [['nifty500', 'Nifty 500'], ['all', 'All NSE stocks']]} onChange={(v) => setUni(v as any)} />
      </div>
      {err && <Notice>{err}</Notice>}
      {!m ? <p className="muted small">{busy ? 'Loading…' : 'No stock data yet.'}</p> : (
        <>
          <div className="mk-breadth" aria-label={`${adv} advancing, ${dec} declining`}>
            <span className="up">▲ {adv.toLocaleString(region === 'us' ? 'en-US' : 'en-IN')} advancing</span>
            <span className="mk-bbar" aria-hidden="true"><i style={{ width: `${(adv / tot) * 100}%` }} /></span>
            <span className="down">{dec.toLocaleString(region === 'us' ? 'en-US' : 'en-IN')} declining ▼</span>
          </div>
          <div className="mk-cols">
            <MoverList title="Gainers" rows={m.gainers} region={region} />
            <MoverList title="Losers" rows={m.losers} region={region} />
          </div>
          <p className="muted small">{dFull(m.date)} close{uni === 'all' ? ' · includes small, thinly traded stocks, so large moves are common' : ''}</p>
        </>
      )}
    </section>
  );
}
function MoverList({ title, rows, region }: { title: string; rows: MarketMovers['gainers']; region: any }) {
  return (
    <div>
      <h3 className="mk-h3">{title}</h3>
      {!rows.length ? <p className="muted small">None.</p> : (
        <ol className="mk-list">
          {rows.map((r) => (
            <li key={r.symbol}>
              <span className="mk-sym"><b>{r.symbol}</b><small title={r.name}>{r.name}</small></span>
              <span className="mk-px">{price(r.close, region)}</span>
              <Delta v={r.changePct} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/* ── sector heat map ────────────────────────────────────────────────────── */
function Sectors({ items, p, region }: { items: MarketItem[]; p: Period; region: string }) {
  const rows = useMemo(() => items.map((s) => ({ s, v: changeOf(s, p) })).sort((a, b) => (b.v ?? -999) - (a.v ?? -999)), [items, p]);
  const scale = Math.max(0.6, ...rows.map((r) => Math.abs(r.v ?? 0)).sort((a, b) => a - b).slice(0, Math.max(1, Math.ceil(rows.length * 0.9))));
  return (
    <section className="panel mk-sectors">
      <div className="panel-head"><h2>Sectors</h2><span className="muted small">{region === 'us' ? 'Sector & theme ETFs' : 'NSE sector & theme indices'} · {PERIODS.find((x) => x[0] === p)![1]}</span></div>
      {!rows.length ? <p className="muted small">No sector data yet.</p> : (
        <ul className="mk-heat">
          {rows.map(({ s, v }) => (
            <li key={s.symbol} style={heatStyle(v, scale)} title={`${s.name}: ${v === null ? 'no data' : v.toFixed(2) + '%'}`}>
              <span>{s.name.replace(/^nifty\s+/i, '').replace(/^india\s+/i, '')}</span>
              <Delta v={v} bare />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ── IPOs ───────────────────────────────────────────────────────────────── */
function Ipos({ ipos, region }: { ipos: MarketOverview['ipos']; region: any }) {
  const us = region === 'us';
  const [tab, setTab] = useState<'open' | 'upcoming' | 'listed'>(us ? 'upcoming' : 'open');
  const [seg, setSeg] = useState('all');
  useEffect(() => { if (!us && !ipos.open.length && ipos.upcoming.length) setTab('upcoming'); }, [us, ipos.open.length, ipos.upcoming.length]);
  useEffect(() => { setSeg('all'); }, [region]);
  const segs = useMemo(() => (us ? [...new Set([...ipos.upcoming, ...ipos.listed].map((x) => x.segment).filter(Boolean))].sort() : ['Mainboard', 'SME']), [us, ipos.upcoming, ipos.listed]);
  const list = ipos[tab].filter((x) => seg === 'all' || x.segment === seg);
  const band = (i: MarketIpo) => (i.price_low && i.price_high ? (i.price_low === i.price_high ? price(i.price_low, region) : `${price(i.price_low, region)} – ${price(i.price_high, region)}`) : region === 'us' ? 'Price range to be announced' : 'Price band to be announced');
  const TABS: [typeof tab, string][] = us ? [['upcoming', 'Expected pricing'], ['listed', 'Recently listed']] : [['open', 'Open now'], ['upcoming', 'Upcoming'], ['listed', 'Recently listed']];
  return (
    <section className="panel mk-ipos">
      <div className="panel-head">
        <h2>IPOs</h2>
        {segs.length > 1 && <Seg label={us ? 'Exchange' : 'Segment'} value={seg} options={[['all', 'All'], ...segs.map((x) => [x, x] as [string, string])]} onChange={setSeg} />}
      </div>
      <div className="hist-tabs" role="tablist" aria-label="IPO status">
        {TABS.map(([k, l]) => (
          <button type="button" role="tab" key={k} aria-selected={tab === k} className="hist-tab" onClick={() => setTab(k)}>{l} <span className="mk-n">{ipos[k].length}</span></button>
        ))}
      </div>
      {!list.length ? <p className="muted small mk-none">{tab === 'open' ? 'No IPO is open for subscription right now.' : tab === 'upcoming' ? us ? 'No IPOs expected to price soon.' : 'No upcoming IPOs announced.' : 'No recent listings.'}</p> : (
        <div className="mk-table" role="table" aria-label="IPOs">
          <div className={`mk-tr mk-th ${tab === 'listed' ? 'c5' : ''}`} role="row"><span role="columnheader">Company</span><span role="columnheader">{tab === 'listed' ? 'Listed' : us ? 'Expected date' : 'Subscription'}</span><span role="columnheader">{tab === 'listed' ? (us ? 'Offer price' : 'Issue price') : us ? 'Price range' : 'Price band'}</span><span role="columnheader">{tab === 'listed' ? 'On listing' : 'Size'}</span>{tab === 'listed' && <span role="columnheader">Since listing</span>}</div>
          {list.map((i) => (
            <div className={`mk-tr ${tab === 'listed' ? 'c5' : ''}`} role="row" key={i.symbol + i.open_date}>
              <span role="cell" className="mk-co"><b>{i.name}</b><small>{i.symbol} <em className={`mk-tag ${i.segment === 'SME' ? 'sme' : ''}`}>{i.segment}</em></small></span>
              <span role="cell">{tab === 'listed' ? dFull(i.listing_date) : us ? dFull(i.open_date) : `${dMon(i.open_date)} – ${dFull(i.close_date)}`}</span>
              <span role="cell">{tab === 'listed' ? price(i.issue_price, region) : band(i)}</span>
              {tab === 'listed' ? (
                <>
                  <span role="cell">{i.listing_gain_pct === null || i.listing_gain_pct === undefined ? <span className="muted">Awaiting data</span> : <Delta v={i.listing_gain_pct} />}</span>
                  <span role="cell">{i.gain_pct === null || i.gain_pct === undefined ? <span className="muted">—</span> : <Delta v={i.gain_pct} />}</span>
                </>
              ) : <span role="cell">{i.issue_size ? (us ? `$${level(i.issue_size, region, i.issue_size >= 100 ? 0 : 1)}M` : `₹${level(i.issue_size, region, i.issue_size >= 100 ? 0 : 1)} Cr`) : '—'}</span>}
            </div>
          ))}
        </div>
      )}
      <p className="muted small">{us ? 'US IPOs from the Nasdaq calendar (SPACs excluded). Expected dates can slip or be withdrawn; listing gains use the first and latest closing prices against the offer price.' : 'NSE lists mainboard and SME issues. Dates are subscription windows; listing gains use the first and latest closing prices against the issue price.'}</p>
    </section>
  );
}

/* ── listed startups ────────────────────────────────────────────────────── */
function Startups({ items, p, region, asOf }: { items: MarketItem[]; p: Period; region: any; asOf: string | null }) {
  const [cat, setCat] = useState('');
  const cats = useMemo(() => [...new Set(items.map((i) => i.category).filter(Boolean) as string[])].sort(), [items]);
  const rows = items.filter((i) => !cat || i.category === cat);
  if (!items.length) return null;
  return (
    <section className="panel mk-startups">
      <div className="panel-head"><h2>Listed startups</h2><span className="muted small">New-age companies on the exchange{asOf ? ` · ${dFull(asOf)} close` : ''}</span></div>
      <div className="mk-chips" role="group" aria-label="Category">
        <button type="button" className="chip" aria-pressed={!cat} onClick={() => setCat('')}>All <b>{items.length}</b></button>
        {cats.map((c) => <button type="button" key={c} className="chip" aria-pressed={cat === c} onClick={() => setCat(cat === c ? '' : c)}>{c} <b>{items.filter((i) => i.category === c).length}</b></button>)}
      </div>
      <div className="mk-table" role="table" aria-label="Listed startups">
        <div className="mk-tr mk-th cst" role="row"><span role="columnheader">Company</span><span role="columnheader">Price</span><span role="columnheader">1D</span><span role="columnheader">{PERIODS.find((x) => x[0] === (p === '1d' ? '1m' : p))![1]}</span><span role="columnheader" className="mk-hide">Trend</span></div>
        {rows.map((i) => {
          const q: Period = p === '1d' ? '1m' : p;
          return (
            <div className="mk-tr cst" role="row" key={i.symbol}>
              <span role="cell" className="mk-co"><b>{i.name.replace(/ (Limited|Ltd\.?)$/i, '')}</b><small>{i.symbol} · {i.category || i.industry || ''}</small></span>
              <span role="cell">{price(i.close, region)}</span>
              <span role="cell"><Delta v={i.changePct} /></span>
              <span role="cell"><Delta v={changeOf(i, q)} /></span>
              <span role="cell" className="mk-hide"><Spark c={windowOf(i, q).c} h={28} /></span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ── per-user watchlist ─────────────────────────────────────────────────── */
function Watchlist({ region }: { region: any }) {
  const [list, setList] = useState<MarketItem[] | null>(null);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<StockHit[]>([]);
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const [hi, setHi] = useState(0);
  const seq = useRef(0);
  const have = useMemo(() => new Set((list || []).map((x) => x.symbol)), [list]);

  const load = useCallback(() => getWatchlist(region).then(setList).catch(() => setMsg('Could not load your watchlist.')), [region]);
  useEffect(() => { setList(null); setMsg(''); load(); }, [load]);

  useEffect(() => {
    const t = q.trim();
    if (!t) { setHits([]); return; }
    const n = ++seq.current;
    const id = setTimeout(() => searchStocks(region, t).then((h) => { if (n === seq.current) { setHits(h); setHi(0); } }).catch(() => undefined), 180);
    return () => clearTimeout(id);
  }, [q, region]);

  const add = async (sym: string) => {
    setMsg(''); setOpen(false); setQ('');
    try { await addWatch(region, sym); await load(); } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not add that stock.'); }
  };
  const drop = async (sym: string) => {
    setMsg('');
    try { await removeWatch(region, sym); setList((l) => (l || []).filter((x) => x.symbol !== sym)); } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not remove that stock.'); }
  };
  const key = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(hits.length - 1, h + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
    else if (e.key === 'Enter' && hits[hi] && !have.has(hits[hi].symbol)) { e.preventDefault(); add(hits[hi].symbol); }
    else if (e.key === 'Escape') setOpen(false);
  };

  return (
    <section className="panel mk-watch">
      <div className="panel-head"><h2>My watchlist</h2><span className="muted small">Only you can see this · {list?.length ?? 0} of 50</span></div>
      <div className="mk-add">
        <label className="field search"><Icon name="search" />
          <input id="mk-q" type="search" placeholder="Add a stock — name or symbol" aria-label="Add a stock to your watchlist" autoComplete="off" role="combobox" aria-expanded={open && hits.length > 0} aria-controls="mk-hits"
            value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} onKeyDown={key} />
        </label>
        {open && q.trim() && (
          <ul id="mk-hits" className="mk-hits" role="listbox">
            {hits.length === 0 && <li className="muted small mk-nohit">No matching stock.</li>}
            {hits.map((h, i) => (
              <li key={h.symbol} role="option" aria-selected={i === hi}>
                <button type="button" disabled={have.has(h.symbol)} className={i === hi ? 'on' : ''} onMouseDown={(e) => e.preventDefault()} onClick={() => add(h.symbol)}>
                  <span className="mk-sym"><b>{h.symbol}</b><small>{h.name}</small></span>
                  <span className="mk-px">{h.close !== null ? price(h.close, region) : ''}</span>
                  {have.has(h.symbol) ? <span className="muted small">Added</span> : <Delta v={h.change_pct} />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {msg && <Notice>{msg}</Notice>}
      {list === null ? <p className="muted small">Loading…</p> : !list.length ? (
        <p className="muted small mk-none">Nothing here yet. Search above and add the stocks you want to follow. Their prices and trend show up here after every market close.</p>
      ) : (
        <div className="mk-table" role="table" aria-label="My watchlist">
          <div className="mk-tr mk-th cwl" role="row"><span role="columnheader">Stock</span><span role="columnheader">Price</span><span role="columnheader">1D</span><span role="columnheader" className="mk-hide">3 months</span><span role="columnheader"><span className="sr">Remove</span></span></div>
          {list.map((i) => (
            <div className="mk-tr cwl" role="row" key={i.symbol}>
              <span role="cell" className="mk-co"><b>{i.name.replace(/ (Limited|Ltd\.?)$/i, '')}</b><small>{i.symbol}{i.industry ? ' · ' + i.industry : ''}</small></span>
              <span role="cell">{price(i.close, region)}</span>
              <span role="cell"><Delta v={i.changePct} /></span>
              <span role="cell" className="mk-hide"><Spark c={windowOf(i, '3m').c} h={28} /></span>
              <span role="cell"><button type="button" className="iconbtn mk-x" aria-label={`Remove ${i.symbol} from watchlist`} onClick={() => drop(i.symbol)}><Icon name="close" /></button></span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
