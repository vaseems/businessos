'use client';
import { useMemo, useState } from 'react';
import { downloadCsv } from '@/lib/api';
import { dFull, dMon, s } from '@/lib/format';
import { useApi, useApp, useSheetItems, type SheetItem } from '@/components/AppContext';
import Page from '@/components/Page';
import { PreviousResults } from '@/components/History';
import { Glyph, Icon, Ring, Seg, SearchField } from '@/components/ui';

export default function Ideas() {
  const { rc, region } = useApp();
  const { data, error } = useApi<any>('data');
  const ideas: any[] = data?.ideas || [];
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('rank');
  const [min, setMin] = useState('0');

  const items = useMemo<Record<string, SheetItem>>(() => {
    const m: Record<string, SheetItem> = {};
    for (const i of ideas) {
      m[i.slug] = {
        slug: i.slug, title: i.name,
        body: (
          <>
            <div className="sheet-meta"><Ring score={i.score} cls="lg" /><div className="facts-inline">
              <span>Critical <b>{Math.trunc(i.critical)}</b></span><span>Demand <b>{Math.trunc(i.demand)}</b></span>
              <span>Ease to build <b>{Math.trunc(i.ease)}</b></span><span>{rc.edge} <b>{Math.trunc(i.india_edge)}</b></span></div></div>
            <dl className="facts">
              <div><dt>{rc.angle}</dt><dd>{s(i.india_angle)}</dd></div>
              <div><dt>Problem</dt><dd>{s(i.problem)}</dd></div>
              <div><dt>Solution</dt><dd>{s(i.solution)}</dd></div>
              <div><dt>First customers</dt><dd>{s(i.first_customers)}</dd></div>
              <div><dt>Rough MVP</dt><dd>{s(i.rough_mvp)}</dd></div>
              <div><dt>Main risk</dt><dd>{s(i.main_risk)}</dd></div>
            </dl>
            <p className="muted small">Added {s(i.date_added)}. Scores are analyst judgment on a 1 to 5 scale per factor.</p>
          </>
        ),
      };
    }
    return m;
  }, [ideas, rc]);
  useSheetItems(data ? items : null);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    const minN = parseInt(min, 10) || 0;
    const list = ideas.filter((i) => {
      if (term && !([i.name, i.problem, i.solution, i.first_customers, i.india_angle].map(s).join(' ').toLowerCase().includes(term))) return false;
      if (minN && Math.trunc(i.score) < minN) return false;
      return true;
    });
    const cmp: Record<string, (a: any, b: any) => number> = {
      rank: (a, b) => Math.trunc(a.rank_no) - Math.trunc(b.rank_no),
      added: (a, b) => (s(a.date_added) < s(b.date_added) ? 1 : s(a.date_added) > s(b.date_added) ? -1 : 0),
      name: (a, b) => (s(a.name).toLowerCase() < s(b.name).toLowerCase() ? -1 : s(a.name).toLowerCase() > s(b.name).toLowerCase() ? 1 : 0),
    };
    return [...list].sort(cmp[sort]);
  }, [ideas, q, sort, min]);

  const { openSheet } = useApp();
  return (
    <Page title="Ideas" data={data} error={error}>
      {() => (
        <>
          <div className="toolbar">
            <SearchField placeholder="Filter ideas" value={q} onChange={setQ} />
            <Seg label="Sort" id="sort" value={sort} onChange={setSort} options={[['rank', 'Rank'], ['added', 'Newest'], ['name', 'Name']]} />
            <Seg label="Minimum score" id="minseg" value={min} onChange={setMin} options={[['0', 'All'], ['60', '60+'], ['70', '70+'], ['80', '80+']]} />
            <button type="button" className="btn quiet sm" onClick={() => downloadCsv('ideas', region)}><Icon name="download" />CSV</button>
          </div>
          <p className="count"><span id="count">{shown.length}</span> ideas</p>
          <ul className="rows" id="list">
            {shown.map((i) => (
              <li className="row" key={i.slug} data-slug={i.slug}>
                <button type="button" className="row-btn" onClick={() => openSheet(items[i.slug])}>
                  <Ring score={i.score} />
                  <span className="row-main"><b className="row-title">{i.name}</b><span className="row-sub">{i.india_angle}</span></span>
                  <Glyph idea={i} edge={rc.edge} />
                  <time className="row-date" dateTime={i.date_added}>{dMon(i.date_added)}</time>
                </button>
              </li>
            ))}
          </ul>
          {!ideas.length && <section className="empty"><h1>No ideas yet</h1><p>New ideas will appear here soon.</p></section>}
          {!!ideas.length && !shown.length && <section className="empty" id="none"><h1>No matches</h1><p>Try a different search or lower the minimum score.</p></section>}
          <PreviousResults section="ideas" />
        </>
      )}
    </Page>
  );
}
