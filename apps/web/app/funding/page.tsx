'use client';
import { useEffect, useMemo, useState } from 'react';
import { dFull, dMon, has, money, parseDate, s, safeUrl, today } from '@/lib/format';
import { md5 } from '@/lib/md5';
import { stateMap, stateSlug } from '@/lib/region';
import { useApi, useApp, useSheetItems, type SheetItem } from '@/components/AppContext';
import Page from '@/components/Page';
import { SearchField, Seg, SelectField } from '@/components/ui';

const GROUP_OF: Record<string, string> = {
  'Pre-Seed': 'early', Seed: 'early', 'Pre-Series A': 'early', 'Series A': 'mid', 'Pre-Series B': 'mid', 'Series B': 'mid',
  'Pre-Series C': 'late', 'Series C': 'late', 'Series D': 'late', 'Series E': 'late', 'Series F or later': 'late',
};
const CONF: Record<string, string> = { high: 'Taken from a published weekly funding table', medium: 'Partly verified', low: 'Unverified' };
const dayMs = 86400000;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const ymd = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const trimSet = (v: string) => v.replace(/^[, ]+|[, ]+$/g, '');

export default function Funding() {
  const { region, rc, state, openSheet, setPaletteExtras } = useApp();
  const { data, error } = useApi<any>('funding');
  const [q, setQ] = useState('');
  const [days, setDays] = useState('30');
  const [grp, setGrp] = useState('');
  const [sector, setSector] = useState('');
  const [mine, setMine] = useState(false);

  const m = useMemo(() => {
    if (!data) return null;
    const all = (data.deals || []).filter((d: any) => has(d.company) && has(d.announced_on));
    const totalDeals = all.length;
    const t = today();
    const ageOf = (d: string) => Math.max(0, Math.floor((t.getTime() - (parseDate(d) as Date).getTime()) / dayMs));
    const deals = all.slice(0, 400).map((d: any) => ({ ...d, _age: ageOf(d.announced_on) }));

    // Weekly totals for the last 8 weeks. Weeks with very few tracked rounds are shown as not yet covered.
    const mondayOf = (d: Date) => addDays(d, -((d.getDay() || 7) - 1));
    const monday = mondayOf(t);
    const weeks: { ts: Date; sum: number; n: number }[] = [];
    for (let i = 7; i >= 0; i--) weeks.push({ ts: addDays(monday, -i * 7), sum: 0, n: 0 });
    const byKey = new Map(weeks.map((w) => [ymd(w.ts), w]));
    for (const d of deals) {
      const w = byKey.get(ymd(mondayOf(parseDate(d.announced_on) as Date)));
      if (w) { w.sum += Number(d.amount_usd_m ?? 0); w.n++; }
    }
    let wmax = 1;
    for (const w of weeks) if (w.n >= 5) wmax = Math.max(wmax, w.sum);

    // Most active investors in the last 90 days (institutions only).
    const inv = new Map<string, { name: string; n: number }>();
    for (const d of deals) {
      if (d._age > 90 || !has(d.investors)) continue;
      const seen = new Set<string>();
      for (let name of String(d.investors).split(',')) {
        name = name.trim();
        const low = name.toLowerCase();
        if (name === '' || name.includes('(') || low.includes('family office') || low.includes('angel') || low.includes('existing investors') || low.includes('others')) continue;
        const key = name.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (key === '' || seen.has(key)) continue;
        seen.add(key);
        const e = inv.get(key) || { name, n: 0 };
        e.n++; inv.set(key, e);
      }
    }
    const topInv = [...inv.values()].sort((a, b) => b.n - a.n || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)).slice(0, 8);
    const imax = Math.max(1, topInv[0]?.n ?? 1);
    const sectors = [...new Set(deals.map((d: any) => s(d.sector)).filter(Boolean))].sort() as string[];
    const hqKnown = deals.filter((d: any) => has(d.hq_state)).length;
    return { deals, totalDeals, weeks, wmax, topInv, imax, sectors, hqKnown };
  }, [data]);

  useEffect(() => {
    if (!m) return;
    setPaletteExtras(m.deals.slice(0, 300).map((d: any) => ({
      k: 'Funding', t: s(d.company), s: money(d.amount_usd_m) + (d.stage ? ' · ' + d.stage : ''), h: `/funding/#${d.slug}`,
    })));
    return () => setPaletteExtras([]);
  }, [m, setPaletteExtras]);

  const items = useMemo<Record<string, SheetItem>>(() => {
    const out: Record<string, SheetItem> = {};
    for (const d of m?.deals || []) {
      const stage = s(d.stage);
      const sub = [s(d.sector), s(d.subsector)].filter(Boolean);
      const src = safeUrl(d.source_url);
      const amt = d.amount_usd_m !== null && d.amount_usd_m !== undefined;
      const note = s(d.amount_note);
      out[d.slug] = {
        slug: d.slug, title: s(d.company),
        body: (
          <>
            <p className="sheet-lead"><b>{amt ? money(d.amount_usd_m) : 'Amount not disclosed'}</b>{stage !== '' ? ' · ' + stage : ''} · {dFull(d.announced_on)}</p>
            <dl className="facts">
              <div><dt>Sector</dt><dd>{sub.join(' · ') || 'Not stated'}{has(d.model) ? ' · ' + d.model : ''}</dd></div>
              {has(d.lead_investors) && <div><dt>Led by</dt><dd>{d.lead_investors}</dd></div>}
              {has(d.investors) && <div><dt>Investors</dt><dd>{d.investors}</dd></div>}
              {has(d.amount_note) && <div><dt>About the amount</dt><dd>{note.charAt(0).toUpperCase() + note.slice(1)}.</dd></div>}
              {has(d.hq_state) && <div><dt>Based in</dt><dd>{trimSet(s(d.hq_city) + ', ' + d.hq_state)}</dd></div>}
              {src && <div><dt>Source</dt><dd><a href={src} target="_blank" rel="noopener noreferrer">{d.source_name ?? 'Source'}</a></dd></div>}
              <div><dt>Confidence</dt><dd>{CONF[d.confidence ?? 'high'] ?? ''}. Amounts are in US dollars as reported and can change when later filings come in.</dd></div>
            </dl>
          </>
        ),
      };
    }
    return out;
  }, [m]);
  useSheetItems(m ? items : null);

  // A deep link to an older round should still be visible behind the sheet.
  useEffect(() => {
    if (!m || !location.hash) return;
    const slug = decodeURIComponent(location.hash.slice(1)).replace(/[^\w-]/g, '');
    const d = m.deals.find((x: any) => x.slug === slug);
    if (d && d._age > 30) setDays('0');
  }, [m]);

  const names = useMemo(() => stateMap(region), [region]);
  const mineCount = useMemo(() => (state && m ? m.deals.filter((d: any) => has(d.hq_state) && stateSlug(s(d.hq_state)) === state).length : 0), [m, state]);
  const mineOn = mine && !!state;

  const shown = useMemo(() => {
    if (!m) return [];
    const term = q.trim().toLowerCase();
    const dn = parseInt(days, 10);
    return m.deals.filter((d: any) => {
      const search = [d.company, d.sector ?? '', d.subsector ?? '', s(d.stage), d.investors ?? '', d.lead_investors ?? '', d.hq_city ?? '', d.hq_state ?? ''].map(s).join(' ').toLowerCase();
      return (!term || search.includes(term)) &&
        (dn === 0 || d._age <= dn) &&
        (!grp || (GROUP_OF[s(d.stage)] ?? 'na') === grp) &&
        (!sector || s(d.sector) === sector) &&
        (!mineOn || (has(d.hq_state) && stateSlug(s(d.hq_state)) === state));
    });
  }, [m, q, days, grp, sector, mineOn, state]);

  const stats = useMemo(() => {
    let sum = 0, big: { a: number; c: string } | null = null;
    for (const d of shown) {
      const a = Number(d.amount_usd_m) || 0;
      sum += a;
      if (!big || a > big.a) big = { a, c: s(d.company) };
    }
    return { sum, big };
  }, [shown]);
  const dn = parseInt(days, 10);

  return (
    <Page title="Funding" data={m ? data : null} error={error}>
      {() => m && (
        <>
          <section className="stats" aria-label="Summary">
            <div><span className="num">{money(stats.sum)}</span><span className="lbl">Raised {dn ? `in the last ${dn} days` : 'across all tracked rounds'}</span></div>
            <div><span className="num">{shown.length}</span><span className="lbl">Rounds announced</span></div>
            <div><span className="num">{stats.big ? money(stats.big.a) : '—'}</span><span className="lbl">{stats.big ? 'Largest: ' + stats.big.c : 'Largest round'}</span></div>
          </section>

          <div className="split two">
            <section className="panel">
              <div className="panel-head"><h2>Funding by week</h2><span className="muted small">Total disclosed, USD</span></div>
              <div className="hist fhist" role="img" aria-label="Total disclosed funding in each of the last eight weeks">
                {m.weeks.map((w, idx) => {
                  const ok = w.n >= 5;
                  return (
                    <div key={idx} className={ok ? '' : 'na'} title={ok ? `${w.n} rounds` : 'Not fully covered yet'}>
                      <i style={{ ['--h' as any]: `${ok ? Math.max(4, Math.round((100 * w.sum) / m.wmax)) : 0}%` }} />
                      <b>{ok ? money(w.sum) : '—'}</b>
                      <span>{dMon(`${w.ts.getFullYear()}-${String(w.ts.getMonth() + 1).padStart(2, '0')}-${String(w.ts.getDate()).padStart(2, '0')}`)}</span>
                    </div>
                  );
                })}
              </div>
              <p className="muted small">Bars show the week starting on the date below. Weeks that are still being collected show a dash.</p>
            </section>
            <section className="panel">
              <div className="panel-head"><h2>Most active investors</h2><span className="muted small">Rounds in the last 90 days</span></div>
              {!m.topInv.length && <p className="muted">No investor data yet.</p>}
              <ul className="sectors invs">
                {m.topInv.map((i) => (
                  <li key={i.name}><span className="sn" title={i.name}>{i.name}</span>
                    <span className="sbar"><i className="k-in" style={{ ['--w' as any]: `${Math.round((1000 * i.n) / m.imax) / 10}%` }} /></span>
                    <span className="sv">{i.n}</span></li>
                ))}
              </ul>
              <p className="muted small">Funds and companies only. Angels and family offices are not counted.</p>
            </section>
          </div>

          <div className="toolbar">
            <SearchField id="fq" placeholder="Search startups, investors, sectors" value={q} onChange={setQ} />
            <SelectField id="fsec" label="Sector" value={sector} onChange={setSector}>
              <option value="">All sectors</option>
              {m.sectors.map((x) => <option key={x} value={x}>{x}</option>)}
            </SelectField>
            <Seg label="Period" id="fper" value={days} onChange={setDays} options={[['30', '30 days'], ['90', '90 days'], ['0', 'All tracked']]} />
          </div>
          <div className="seg chips" role="group" aria-label="Stage" id="fgrp">
            {([['', 'All stages'], ['early', 'Early (seed to pre-Series A)'], ['mid', 'Series A to B'], ['late', 'Series C and later'], ['na', 'Stage not stated']] as [string, string][]).map(([v, t]) => (
              <button type="button" key={v} aria-pressed={grp === v} onClick={() => setGrp(v)}>{t}</button>
            ))}
            {state && <button type="button" id="fstate" aria-pressed={mineOn} onClick={() => setMine(!mine)}>Based in {names[state] || ''} ({mineCount})</button>}
          </div>
          <p className="count"><span id="fcount">{shown.length}</span> rounds</p>

          <ul className="rows" id="flist">
            {shown.map((d: any) => {
              const stage = s(d.stage);
              const words = s(d.company).trim().split(/[\s.]+/);
              const init = (words.length > 1 ? [...words[0]][0] + [...words[1]][0] : [...words[0]].slice(0, 2).join('')).toUpperCase();
              const sub = [s(d.sector), s(d.subsector)].filter(Boolean);
              return (
                <li className="row frow" key={d.slug} data-slug={d.slug}>
                  <button type="button" className="row-btn" onClick={() => openSheet(items[d.slug])}>
                    <span className={`rkb cat-${md5(s(d.sector)).charAt(0)}`}>{init}</span>
                    <span className="row-main"><b className="row-title">{d.company}</b><span className="row-sub">{sub.join(' · ')}{sub.length ? ' · ' : ''}{dFull(d.announced_on)}</span></span>
                    <span className="famt"><b>{d.amount_usd_m !== null && d.amount_usd_m !== undefined ? money(d.amount_usd_m) : 'Undisclosed'}</b><small>{stage !== '' ? stage : 'Stage not stated'}</small></span>
                    <span className="flead">{has(d.lead_investors) ? 'Led by ' + d.lead_investors : ''}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {!shown.length && (
            <section className="empty" id="fnone"><h1>No matches</h1>
              <p>{mineOn ? `No tracked rounds from startups based in ${names[state] || 'this state'} yet. Headquarters are only known for some rounds, and more are filled in each week.` : 'Try a wider period or another sector.'}</p>
            </section>
          )}
          <p className="muted small jnote">{rc.code === 'us'
            ? 'The largest US startup funding rounds each week, taken from public weekly roundups. Smaller rounds are not listed, so weekly totals understate all US funding.'
            : 'Funding rounds of about US$0.5 million and above reported in weekly roundups of Indian startup funding. Undisclosed amounts are not listed.'}{' '}
            Headquarters are known for {m.hqKnown} of {m.totalDeals} rounds so far and are filled in as they are checked. Updated weekly{data.refreshed_at ? ', last on ' + dFull(data.refreshed_at) : ''}. For information only, not investment advice.</p>
        </>
      )}
    </Page>
  );
}
