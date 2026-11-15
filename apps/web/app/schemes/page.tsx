'use client';
import { useEffect, useMemo, useState } from 'react';
import { dFull, has, s, safeUrl } from '@/lib/format';
import { stateMap, stateSlug } from '@/lib/region';
import { useApi, useApp, useSheetItems, type SheetItem } from '@/components/AppContext';
import Page from '@/components/Page';
import { Count, SearchField, SelectField } from '@/components/ui';

const STATUS_LBL: Record<string, string> = { active: 'Active', new: 'New', revamped: 'Updated', closing: 'Closing soon', closed: 'Closed' };
const CONF: Record<string, string> = { high: 'Verified', medium: 'Partly verified', low: 'Unverified' };
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const isNew = (x: any) => x.status === 'new' || x.status === 'revamped';
const forBiz = (x: any) => (x.audience || []).some((a: string) => a === 'startup' || a === 'msme');

export default function Schemes() {
  const { rc, region, state: sel, openSheet, setPaletteExtras } = useApp();
  const isUs = region === 'us';
  const { data, error } = useApi<any>('policy');
  const [tab, setTab] = useState<'central' | 'state'>('central');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [aud, setAud] = useState('');

  const AUD: Record<string, string> = {
    startup: 'Startups', msme: isUs ? 'Small businesses' : 'MSMEs', individual: 'Individuals', farmer: 'Farmers', women: 'Women', student: 'Students', worker: 'Workers',
    manufacturer: 'Manufacturers', exporter: 'Exporters', sc_st: 'SC/ST', veteran: 'Veterans', minority: 'Minority-owned', rural: 'Rural',
  };
  const audChips = isUs ? ['startup', 'msme', 'women', 'veteran', 'minority', 'rural', 'manufacturer', 'exporter', 'student', 'worker']
    : ['startup', 'msme', 'individual', 'women', 'farmer', 'student', 'worker', 'manufacturer', 'sc_st'];
  const names = useMemo(() => stateMap(region), [region]);

  const m = useMemo(() => {
    if (!data) return null;
    const all: any[] = data.schemes || [];
    const central = all.filter((x) => (x.level ?? 'Central') !== 'State');
    const stateSchemes = all.filter((x) => (x.level ?? '') === 'State' && has(x.state))
      .sort((a, b) => cmp(s(a.state), s(b.state)) || cmp(s(a.category), s(b.category)) || cmp(s(a.name), s(b.name)));
    const catsOf = (l: any[]) => [...new Set(l.map((x) => s(x.category)))].sort();
    const covered = new Set(stateSchemes.map((x) => stateSlug(s(x.state)))).size;
    return { central, stateSchemes, cats: { central: catsOf(central), state: catsOf(stateSchemes) }, covered };
  }, [data]);

  useEffect(() => {
    if (!m) return;
    setPaletteExtras([
      ...m.central.map((x) => ({ k: rc.Noun, t: s(x.name), s: s(x.category), h: `/schemes/#${x.slug}` })),
      ...m.stateSchemes.map((x) => ({ k: 'State ' + rc.noun, t: s(x.name), s: s(x.state) + ' · ' + s(x.category), h: `/schemes/#${x.slug}` })),
    ]);
    return () => setPaletteExtras([]);
  }, [m, rc, setPaletteExtras]);

  const items = useMemo<Record<string, SheetItem>>(() => {
    const out: Record<string, SheetItem> = {};
    if (!m) return out;
    const build = (x: any, isState: boolean) => {
      const audNames = (x.audience || []).map((a: string) => AUD[a] ?? a);
      const portal = safeUrl(x.portal_url), source = isState ? safeUrl(x.source_url) : '';
      out[x.slug] = {
        slug: x.slug, title: x.name,
        body: (
          <>
            <p className="sheet-lead">{s(x.highlight)}</p>
            <dl className="facts">
              <div><dt>Benefit</dt><dd>{s(x.benefit)}</dd></div>
              <div><dt>Who can apply</dt><dd>{s(x.eligibility)}</dd></div>
              <div><dt>How to apply</dt><dd>{s(x.how_to_apply)}{portal && <><br /><a className="btn sm" style={{ marginTop: 12 }} href={portal} target="_blank" rel="noopener noreferrer">Open official portal</a></>}</dd></div>
              {has(x.outlay) && <div><dt>Outlay</dt><dd>{x.outlay}</dd></div>}
              {isState && <div><dt>State</dt><dd>{s(x.state)}</dd></div>}
              <div><dt>{isState ? 'Department' : rc.dept}</dt><dd>{s(x.ministry)}</dd></div>
              <div><dt>For</dt><dd>{audNames.join(', ')}</dd></div>
              <div><dt>Launched</dt><dd>{s(x.launched ?? 'n/a')} · {STATUS_LBL[x.status] ?? x.status}</dd></div>
              {source && <div><dt>Reference</dt><dd><a href={source} target="_blank" rel="noopener noreferrer">Where this was checked</a></dd></div>}
              <div><dt>Confidence</dt><dd>{CONF[x.confidence] ?? s(x.confidence)}. Limits and amounts change, so confirm on the official portal before applying.</dd></div>
            </dl>
          </>
        ),
      };
    };
    m.central.forEach((x) => build(x, false));
    m.stateSchemes.forEach((x) => build(x, true));
    return out;
  }, [m, rc, isUs]); // eslint-disable-line react-hooks/exhaustive-deps
  useSheetItems(m ? items : null);

  // The tab can come from ?tab=state or from a link to a specific scheme.
  useEffect(() => {
    if (!m) return;
    const pick = () => {
      const h = decodeURIComponent(location.hash.slice(1)).replace(/[^\w-]/g, '');
      if (h) {
        if (m.stateSchemes.some((x) => x.slug === h)) return 'state';
        if (m.central.some((x) => x.slug === h)) return 'central';
      }
      return null;
    };
    const first = pick() ?? (new URLSearchParams(location.search).get('tab') === 'state' ? 'state' : 'central');
    setTab(first);
    const onHash = () => { const t = pick(); if (t) setTab(t); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [m]);

  const show = (t: 'central' | 'state') => {
    setTab(t);
    try { history.replaceState(null, '', location.pathname + (t === 'state' ? '?tab=state' : '')); } catch { /* ignore */ }
  };

  const list = m ? (tab === 'state' ? m.stateSchemes : m.central) : [];
  const cats = m ? m.cats[tab] : [];
  const catVal = cats.includes(cat) ? cat : '';
  const tileState = (x: any) => (tab === 'state' ? stateSlug(s(x.state)) : '');

  const calc = useMemo(() => {
    const t = q.trim().toLowerCase();
    let scope = 0, scopeNew = 0, scopeBiz = 0;
    const shown: any[] = [];
    for (const x of list) {
      const inState = tab !== 'state' || !sel || tileState(x) === sel;
      if (inState) { scope++; if (isNew(x)) scopeNew++; if (forBiz(x)) scopeBiz++; }
      const audNames = (x.audience || []).map((a: string) => AUD[a] ?? a);
      const search = [x.name, x.ministry, x.category, s(x.state), x.highlight, x.benefit, x.eligibility, audNames.join(' ')].map(s).join(' ').toLowerCase();
      const audAttr = ' ' + (x.audience || []).join(' ') + (isNew(x) ? ' _new' : '') + ' ';
      const ok = inState && (!t || search.includes(t)) && (!catVal || x.category === catVal) && (!aud || audAttr.includes(' ' + aud + ' '));
      if (ok) shown.push(x);
    }
    return { scope, scopeNew, scopeBiz, shown };
  }, [list, tab, sel, q, catVal, aud, isUs]); // eslint-disable-line react-hooks/exhaustive-deps

  const stCount = m ? (sel ? m.stateSchemes.filter((x) => stateSlug(s(x.state)) === sel).length : m.stateSchemes.length) : 0;
  const empty = tab === 'state' && !!sel && calc.scope === 0;
  const total = Object.keys(names).length;

  const n1 = tab === 'state' ? calc.scope : calc.scope;
  const l1 = tab === 'state' ? (sel ? `${rc.Noun} for ${names[sel] || ''}` : `State ${rc.noun} listed`) : `${rc.central} ${rc.noun} listed`;
  const n2 = tab === 'state' ? m?.covered ?? 0 : calc.scopeBiz;
  const l2 = tab === 'state' ? `${rc.unitShort} covered of ${total}` : `For startups and ${rc.bizWord}`;

  return (
    <Page title={isUs ? 'Government programs' : 'Government schemes'} data={m ? data : null} error={error}>
      {() => m && (
        <>
          <div className="stabs">
            <div className="seg" role="tablist" aria-label="Level" id="stabs">
              <button type="button" role="tab" aria-pressed={tab === 'central'} onClick={() => show('central')}>{rc.central} <i>{m.central.length}</i></button>
              <button type="button" role="tab" aria-pressed={tab === 'state'} onClick={() => show('state')}>State <i id="stcount">{stCount}</i></button>
            </div>
            <p className="sctx" id="sctx">
              {tab === 'state'
                ? (sel ? <>Showing <b>{names[sel] || ''}</b>. Change your state from the header.</> : 'Showing every state. Pick your state in the header to narrow this down.')
                : <>Applies {rc.everywhere}{sel ? <>. <b>{names[sel] || ''}</b> has its own {rc.noun} in the State tab.</> : '.'}</>}
            </p>
          </div>

          <section className="stats" aria-label="Summary">
            <div><Count key={`1${tab}${n1}`} end={n1} /><span className="lbl">{l1}</span></div>
            <div><Count key={`2${tab}${n2}`} end={n2} /><span className="lbl">{l2}</span></div>
            <div><Count key={`3${tab}${calc.scopeNew}`} end={calc.scopeNew} /><span className="lbl">New or recently updated</span></div>
          </section>

          <div className="toolbar">
            <SearchField id="sq" placeholder={`Search ${rc.noun}, benefits, ${isUs ? 'agencies' : 'departments'}`} value={q} onChange={setQ} />
            <SelectField id="scat" label="Category" value={catVal} onChange={setCat}>
              <option value="">All categories</option>
              {cats.map((c) => <option key={c} value={c}>{c}</option>)}
            </SelectField>
          </div>
          <div className="seg chips" role="group" aria-label="Who it is for" id="saud">
            <button type="button" aria-pressed={aud === ''} onClick={() => setAud('')}>Everyone</button>
            {audChips.map((a) => <button type="button" key={a} aria-pressed={aud === a} onClick={() => setAud(a)}>{AUD[a]}</button>)}
            <button type="button" aria-pressed={aud === '_new'} onClick={() => setAud('_new')}>New or updated</button>
          </div>
          <p className="count"><span id="scount">{calc.shown.length}</span> {rc.noun}</p>

          <ul className="tiles" id={tab === 'state' ? 'stlist' : 'slist'} data-level={tab}>
            {calc.shown.map((x) => {
              const audNames = (x.audience || []).map((a: string) => AUD[a] ?? a);
              const isState = tab === 'state';
              return (
                <li className="tile" key={x.slug} data-slug={x.slug}>
                  <button type="button" className="tile-btn" onClick={() => openSheet(items[x.slug])}>
                    <span className="tile-top"><span className="tag">{s(x.category)}</span><span className={`st st-${s(x.status)}`}>{STATUS_LBL[x.status] ?? s(x.status)}</span></span>
                    <b className="tile-name">{x.name}</b>
                    <span className="tile-sub">{s(x.highlight)}</span>
                    <span className="tile-foot">{isState
                      ? <><span className="tile-state">{s(x.state)}</span><span>{audNames.slice(0, 2).join(' · ')}</span></>
                      : <><span>{audNames.slice(0, 3).join(' · ')}</span><span>{s(x.outlay)}</span></>}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          {empty ? (
            <section className="empty inline" id="stnone">
              <h1>No {rc.noun} added for <span>{names[sel] || 'this state'}</span> yet</h1>
              <p>State coverage grows over time. {rc.central} {rc.noun} still apply there, so start with those.</p>
              <button type="button" className="btn" onClick={() => show('central')}>See {rc.centralLow} {rc.noun}</button>
            </section>
          ) : !calc.shown.length ? (
            <section className="empty inline" id="snone"><h1>No matches</h1><p>Try another audience or category.</p></section>
          ) : null}

          <p className="muted small jnote">{rc.central} {rc.noun} apply {rc.everywhere}. State {rc.noun} are listed for {m.covered} of {total} {rc.stateUnit} so far, and more are added over time. Choose your state from the header to see its {rc.noun}. Checked monthly against {rc.portalSrc}. Last refreshed {dFull(data.refreshed_at ?? new Date().toISOString())}.</p>
        </>
      )}
    </Page>
  );
}
