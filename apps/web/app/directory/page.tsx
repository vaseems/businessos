'use client';
import { useEffect, useMemo, useState } from 'react';
import { dFull, dMon, has, parseDate, s, today } from '@/lib/format';
import { md5 } from '@/lib/md5';
import { KIND_LABEL, KINDS, KIND_RANK, RANK, STAGE_LABELS, STATUS_LABEL, cmp, dayMs, monogram, orgHost, orgSite, prepareSources, sheetBody, stageText, trimSet, when } from '@/lib/opps';
import { useApi, useApp, useSheetItems, type SheetItem } from '@/components/AppContext';
import Page from '@/components/Page';
import { PreviousResults } from '@/components/History';
import { SearchField, SelectField, Seg } from '@/components/ui';

/** Categories in the order a founder usually works through them, with one line on what each is. */
const SECTIONS: [string, string][] = [
  ['angel', 'Groups of individual investors who screen startups together and write the first cheques. Many take a pitch each month.'],
  ['vc', 'Funds that invest from a pool of capital, usually at pre-seed to Series A, and take a board seat or observer role.'],
  ['cohort', 'Time-boxed programs from incubators, campuses and corporates, often with mentoring and a small cheque.'],
  ['grant', 'Government schemes, grants and credit lines. Many are equity-free, and some are limited to one state.'],
  ['perk', 'Cloud credits, tools and discounts that stretch the runway.'],
];
const SECTION_ORDER = Object.fromEntries(SECTIONS.map(([k], i) => [k, i]));
const FIRST = 9;

/** Logo of the organisation, with a monogram when we do not know its site or the logo fails to load. */
function OrgIcon({ x }: { x: any }) {
  const host = orgHost(x);
  const [bad, setBad] = useState(false);
  const init = monogram(x.name);
  if (!host || bad) return <span className={`dicon mono rkb cat-${md5(s(x.name)).charAt(0)}`} aria-hidden="true">{init}</span>;
  return (
    <span className="dicon" aria-hidden="true">
      <img
        src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`}
        alt="" width={46} height={46} loading="lazy" decoding="async" referrerPolicy="no-referrer"
        onLoad={(e) => { if (e.currentTarget.naturalWidth <= 16) setBad(true); }}
        onError={() => setBad(true)}
      />
    </span>
  );
}

export default function Directory() {
  const { rc, openSheet } = useApp();
  const { data, error } = useApi<any>('opportunities');
  const [q, setQ] = useState('');
  const [stage, setStage] = useState('');
  const [view, setView] = useState('all');
  const [more, setMore] = useState<Record<string, boolean>>({});

  const m = useMemo(() => {
    if (!data) return null;
    const t = today();
    const daysTo = (d: string) => Math.floor(((parseDate(d) as Date).getTime() - t.getTime()) / dayMs);
    const src = prepareSources(data.sources, daysTo);
    src.sort((a: any, b: any) => {
      const ra = RANK[a._st] ?? 9, rb = RANK[b._st] ?? 9;
      return ra !== rb ? ra - rb : cmp(String(a.name).toLowerCase(), String(b.name).toLowerCase());
    });
    const stateLine = (x: any) => {
      if (x._st === 'open' && has(x.deadline)) return `Closes ${dMon(x.deadline)} · ${when(daysTo(x.deadline))}`;
      if (x._st === 'closed' && has(x.deadline)) return `Closed ${dMon(x.deadline)}`;
      return '';
    };
    let checkedMax: string | null = null;
    for (const x of src) if (has(x.checked_on) && (checkedMax === null || x.checked_on > checkedMax)) checkedMax = x.checked_on;
    return { src, stateLine, checkedMax };
  }, [data]);

  const items = useMemo<Record<string, SheetItem>>(() => {
    const out: Record<string, SheetItem> = {};
    if (!m) return out;
    for (const x of m.src) out[x.slug] = { slug: x.slug, title: x.name, body: sheetBody(x, rc, m.stateLine(x)) };
    return out;
  }, [m, rc]);
  useSheetItems(m ? items : null);

  const shown = useMemo(() => {
    if (!m) return [];
    const term = q.trim().toLowerCase();
    return m.src.filter((x: any) => {
      const hay = [x.name, x.org ?? '', KIND_LABEL[x.kind] ?? '', x.sectors ?? '', x.summary ?? '', x.hq_city ?? '', x.hq_state ?? '', x.geography ?? ''].map(s).join(' ').toLowerCase();
      return (!term || hay.includes(term)) &&
        (view === 'all' || x._st === 'open' || x._st === 'rolling') &&
        (!stage || x.stages.includes(stage));
    });
  }, [m, q, view, stage]);

  const groups = useMemo(() => {
    const g: Record<string, any[]> = {};
    for (const x of shown) (g[x.kind] ||= []).push(x);
    return Object.entries(g).sort(([a], [b]) => (SECTION_ORDER[a] ?? KIND_RANK[a] ?? 9) - (SECTION_ORDER[b] ?? KIND_RANK[b] ?? 9));
  }, [shown]);

  useEffect(() => { // an item deep link in the URL opens its sheet; make sure its section is not collapsed behind "Show all"
    if (!m || !location.hash) return;
    const slug = decodeURIComponent(location.hash.slice(1)).replace(/[^\w-]/g, '');
    const x = m.src.find((r: any) => r.slug === slug);
    if (x) setMore((v) => ({ ...v, [x.kind]: true }));
  }, [m]);

  const jump = (k: string) => document.getElementById('dir-' + k)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  const nOrgs = m ? new Set(m.src.map((x: any) => s(x.org || x.name).toLowerCase())).size : 0;
  const nLive = m ? m.src.filter((x: any) => x._st === 'open' || x._st === 'rolling').length : 0;

  return (
    <Page title="Directory" data={m ? data : null} error={error}>
      {() => m && (
        <>
          <section className="stats" aria-label="Summary">
            <div><span className="num">{m.src.length}</span><span className="lbl">Sources listed</span></div>
            <div><span className="num">{nOrgs}</span><span className="lbl">Organisations</span></div>
            <div><span className="num">{nLive}</span><span className="lbl">Open or rolling now</span></div>
          </section>

          <div className="toolbar">
            <SearchField id="dq" placeholder="Search by name, city, sector" value={q} onChange={setQ} />
            <SelectField id="dstage" label="Stage" value={stage} onChange={setStage}>
              <option value="">Any stage</option>
              {Object.entries(STAGE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </SelectField>
            <Seg label="Availability" id="dwhen" value={view} onChange={setView} options={[['all', 'Everything'], ['now', 'Open or rolling']]} />
          </div>
          <div className="seg chips" role="group" aria-label="Jump to a category">
            {SECTIONS.map(([k]) => {
              const n = groups.find(([g]) => g === k)?.[1].length ?? 0;
              return <button type="button" key={k} disabled={!n} onClick={() => jump(k)}>{KIND_LABEL[k]} <span className="muted">{n}</span></button>;
            })}
          </div>
          <p className="count"><span id="dcount">{shown.length}</span> listed</p>

          {groups.map(([k, list]) => {
            const open = !!more[k] || !!q.trim();
            const cut = open ? list : list.slice(0, FIRST);
            const blurb = SECTIONS.find(([g]) => g === k)?.[1] ?? '';
            return (
              <section className="dsec" id={'dir-' + k} key={k} aria-labelledby={'dh-' + k}>
                <div className="dsec-head">
                  <h2 id={'dh-' + k}>{KIND_LABEL[k] ?? k} <span className="muted">{list.length}</span></h2>
                  <p className="muted small">{blurb}</p>
                </div>
                <ul className="dgrid">
                  {cut.map((x: any) => {
                    const site = orgSite(x);
                    const where = trimSet(s(x.hq_city) + ', ' + s(x.hq_state));
                    const line = m.stateLine(x);
                    return (
                      <li className="dcard" key={x.slug} data-slug={x.slug}>
                        <button type="button" className="dcard-main" onClick={() => openSheet(items[x.slug])}>
                          <span className="dcard-top">
                            <OrgIcon x={x} />
                            <span className="dcard-id">
                              <b className="dcard-name">{x.name}</b>
                              <span className="dcard-org">{[has(x.org) && x.org !== x.name ? x.org : '', where].filter(Boolean).join(' · ') || s(x.geography)}</span>
                            </span>
                          </span>
                          <span className="dcard-sum">{s(x.summary)}</span>
                          <span className="dchips">
                            <span className={`st st-o-${x._st}`}>{STATUS_LABEL[x._st]}</span>
                            {line && <small>{line}</small>}
                            {x.confidence === 'low' && <span className="dflag" title="Limited or conflicting sources">Verify first</span>}
                          </span>
                          <span className="dmeta">
                            <span><i>Stage</i>{stageText(x)}</span>
                            {has(x.cheque_text) && <span><i>{rc.code === 'us' ? 'Check' : 'Cheque'}</i>{x.cheque_text}</span>}
                          </span>
                        </button>
                        {site && <a className="dsite" href={site} target="_blank" rel="noopener noreferrer" aria-label={`Website of ${x.name}`}>Website ↗</a>}
                      </li>
                    );
                  })}
                </ul>
                {list.length > FIRST && !open && (
                  <p className="dmore"><button type="button" className="btn quiet sm" onClick={() => setMore((v) => ({ ...v, [k]: true }))}>Show all {list.length}</button></p>
                )}
              </section>
            );
          })}

          {!shown.length && <section className="empty"><h1>No matches</h1><p>Try another word, stage or availability.</p></section>}
          <p className="muted small jnote">Every organisation here comes from official pages and reputable reports. Logos are fetched from each organisation&apos;s own site when we know it. Open a card for status, terms and how to apply. Cheque sizes and windows change often, so confirm on the official page before you pitch. Reviewed regularly{m.checkedMax ? ', last on ' + dFull(m.checkedMax) : ''}. For information only, not investment advice.</p>
          <PreviousResults section="opportunities" />
        </>
      )}
    </Page>
  );
}
