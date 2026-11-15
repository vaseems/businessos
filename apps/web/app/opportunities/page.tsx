'use client';
import { useEffect, useMemo, useState } from 'react';
import { dFull, dMon, has, parseDate, s, today } from '@/lib/format';
import { md5 } from '@/lib/md5';
import { stateMap } from '@/lib/region';
import { KINDS, KIND_LABEL, RANK, KIND_RANK, STAGE_LABELS, STATUS_LABEL, cmp, dayMs, monogram, prepareSources, sheetBody, stSlugOf, stageText, when } from '@/lib/opps';
import { useApi, useApp, useSheetItems, type SheetItem } from '@/components/AppContext';
import Page from '@/components/Page';
import { SearchField, Seg, SelectField } from '@/components/ui';

const SETS: Record<string, string[]> = { now: ['open', 'rolling'], soon: ['upcoming', 'between'] };

export default function Opportunities() {
  const { region, rc, state, openSheet, setPaletteExtras } = useApp();
  const { data, error } = useApi<any>('opportunities');
  const [q, setQ] = useState('');
  const [stage, setStage] = useState('');
  const [view, setView] = useState('now');
  const [kind, setKind] = useState('');
  const [mine, setMine] = useState(false);

  const m = useMemo(() => {
    if (!data) return null;
    const t = today();
    const daysTo = (d: string) => Math.floor(((parseDate(d) as Date).getTime() - t.getTime()) / dayMs);
    const src = prepareSources(data.sources, daysTo);
    src.sort((a: any, b: any) => {
      const ra = RANK[a._st] ?? 9, rb = RANK[b._st] ?? 9;
      if (ra !== rb) return ra - rb;
      if (a._st === 'open') {
        const da = a.deadline ?? '9999-12-31', db = b.deadline ?? '9999-12-31';
        if (da !== db) return cmp(String(da), String(db));
      }
      const ka = KIND_RANK[a.kind] ?? 9, kb = KIND_RANK[b.kind] ?? 9;
      return ka !== kb ? ka - kb : cmp(a.name, b.name);
    });
    const nNow = src.filter((x: any) => x._st === 'open' || x._st === 'rolling').length;
    const closing = src.filter((x: any) => x._st === 'open' && has(x.deadline)).sort((a: any, b: any) => cmp(String(a.deadline), String(b.deadline)));
    const nClosing30 = closing.filter((x: any) => daysTo(x.deadline) <= 30).length;
    const coming = src.filter((x: any) => x._st === 'upcoming' || x._st === 'between');
    let checkedMax: string | null = null;
    for (const x of src) if (has(x.checked_on) && (checkedMax === null || x.checked_on > checkedMax)) checkedMax = x.checked_on;
    const stateLine = (x: any) => {
      if (x._st === 'open' && has(x.deadline)) return `Closes ${dMon(x.deadline)} · ${when(daysTo(x.deadline))}`;
      if (x._st === 'closed' && has(x.deadline)) return `Closed ${dMon(x.deadline)}`;
      return '';
    };
    return { src, nNow, closing, nClosing30, coming, checkedMax, daysTo, stateLine };
  }, [data]);

  useEffect(() => {
    if (!m) return;
    setPaletteExtras(m.src.map((x: any) => ({ k: 'Opportunities', t: s(x.name), s: (KIND_LABEL[x.kind] ?? '') + ' · ' + STATUS_LABEL[x._st], h: `/opportunities/#${x.slug}` })));
    return () => setPaletteExtras([]);
  }, [m, setPaletteExtras]);

  const items = useMemo<Record<string, SheetItem>>(() => {
    const out: Record<string, SheetItem> = {};
    if (!m) return out;
    for (const x of m.src) {
      out[x.slug] = { slug: x.slug, title: x.name, body: sheetBody(x, rc, m.stateLine(x)) };
    }
    return out;
  }, [m, rc]);
  useSheetItems(m ? items : null);

  // A deep link to an item outside the current view should still be visible behind the sheet.
  useEffect(() => {
    if (!m || !location.hash) return;
    const slug = decodeURIComponent(location.hash.slice(1)).replace(/[^\w-]/g, '');
    const x = m.src.find((r: any) => r.slug === slug);
    if (x && !SETS.now.includes(x._st)) setView('all');
  }, [m]);

  const names = useMemo(() => stateMap(region), [region]);
  const mineCount = useMemo(() => (state && m ? m.src.filter((x: any) => stSlugOf(x) === state).length : 0), [m, state]);
  const mineOn = mine && !!state;

  const shown = useMemo(() => {
    if (!m) return [];
    const term = q.trim().toLowerCase();
    return m.src.filter((x: any) => {
      const search = [x.name, x.org ?? '', KIND_LABEL[x.kind] ?? '', x.sectors ?? '', x.summary ?? '', x.hq_city ?? '', x.hq_state ?? '', x.geography ?? ''].map(s).join(' ').toLowerCase();
      return (!term || search.includes(term)) &&
        (view === 'all' || SETS[view].includes(x._st)) &&
        (!kind || x.kind === kind) &&
        (!stage || x.stages.filter((v: string) => STAGE_LABELS[v]).includes(stage)) &&
        (!mineOn || stSlugOf(x) === state);
    });
  }, [m, q, view, kind, stage, mineOn, state]);

  const msg = mineOn && !shown.length
    ? `Nothing state-specific for ${names[state] || 'this state'} in this view. Try Everything, or switch off the state filter to see programs open to startups across the country.`
    : view !== 'all' && !shown.length ? 'Nothing in this view. Try Everything, another type or a different stage.' : 'Try another type or stage.';

  return (
    <Page title="Opportunities" data={m ? data : null} error={error}>
      {() => m && (
        <>
          <section className="stats" aria-label="Summary">
            <div><span className="num">{m.nNow}</span><span className="lbl">Open or rolling now</span></div>
            <div><span className="num">{m.nClosing30}</span><span className="lbl">Closing in the next 30 days</span></div>
            <div><span className="num">{m.src.length}</span><span className="lbl">Sources tracked</span></div>
          </section>

          <div className="split two">
            <section className="panel">
              <div className="panel-head"><h2>Closing soon</h2><span className="muted small">Fixed deadlines</span></div>
              {!m.closing.length && <p className="muted">No fixed deadlines are open right now. The rolling ones below can be approached at any time.</p>}
              <ul className="olist">
                {m.closing.slice(0, 6).map((x: any) => {
                  const n = m.daysTo(x.deadline);
                  return <li key={x.slug}><button type="button" onClick={() => openSheet(items[x.slug])}><b>{x.name}</b><small className={n <= 7 ? 'hot' : ''}>{dMon(x.deadline)} · {when(n)}</small></button></li>;
                })}
              </ul>
            </section>
            <section className="panel">
              <div className="panel-head"><h2>Coming up</h2><span className="muted small">Next intakes to watch</span></div>
              {!m.coming.length && <p className="muted">Nothing is waiting on a next intake.</p>}
              <ul className="olist">
                {m.coming.slice(0, 6).map((x: any) => (
                  <li key={x.slug}><button type="button" onClick={() => openSheet(items[x.slug])}><b>{x.name}</b><small>{STATUS_LABEL[x._st]}</small></button></li>
                ))}
              </ul>
            </section>
          </div>

          <div className="toolbar">
            <SearchField id="oq" placeholder="Search funds, programs, sectors" value={q} onChange={setQ} />
            <SelectField id="ostage" label="Stage" value={stage} onChange={setStage}>
              <option value="">Any stage</option>
              {Object.entries(STAGE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </SelectField>
            <Seg label="Availability" id="owhen" value={view} onChange={setView} options={[['now', 'Open now'], ['soon', 'Coming up'], ['all', 'Everything']]} />
          </div>
          <div className="seg chips" role="group" aria-label="Type" id="okind">
            <button type="button" aria-pressed={kind === ''} onClick={() => setKind('')}>All types</button>
            {KINDS.map(([k, v]) => <button type="button" key={k} aria-pressed={kind === k} onClick={() => setKind(k)}>{v}</button>)}
            {state && <button type="button" id="ostate" aria-pressed={mineOn} onClick={() => setMine(!mine)}>Only for {names[state] || ''} ({mineCount})</button>}
          </div>
          <p className="count"><span id="ocount">{shown.length}</span> sources</p>

          <ul className="rows" id="olistrows">
            {shown.map((x: any) => {
              const init = monogram(x.name);
              const line = m.stateLine(x);
              return (
                <li className="row orow" key={x.slug} data-slug={x.slug}>
                  <button type="button" className="row-btn" onClick={() => openSheet(items[x.slug])}>
                    <span className={`rkb cat-${md5(s(x.kind)).charAt(0)}`}>{init}</span>
                    <span className="row-main"><b className="row-title">{x.name}</b><span className="row-sub">{KIND_LABEL[x.kind] ?? ''} · {stageText(x)}</span></span>
                    <span className="oinfo"><span className={`st st-o-${x._st}`}>{STATUS_LABEL[x._st]}</span>{line && <small>{line}</small>}</span>
                    <span className="ocheque">{s(x.cheque_text)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {!shown.length && <section className="empty" id="onone"><h1>No matches</h1><p id="onone-msg">{msg}</p></section>}
          <p className="muted small jnote">Funds, programs, grants and perks open to startups in {rc.name}, from official pages and reputable reports. Deadlines, {rc.code === 'us' ? 'check' : 'cheque'} sizes and terms change often, so confirm on the official page before you apply. Programs that take equity are marked in the detail view. Reviewed regularly{m.checkedMax ? ', last on ' + dFull(m.checkedMax) : ''}. For information only, not investment advice.</p>
        </>
      )}
    </Page>
  );
}
