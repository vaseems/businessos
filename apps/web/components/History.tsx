'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, fetchHistory, type HistoryPage, type HistoryRow, type HistorySection } from '@/lib/api';
import { dFull, parseDate, today } from '@/lib/format';
import { useApp } from './AppContext';

interface SectionInfo { label: string; usLabel?: string; dateLabel: string; cols: [string, string, string]; blurb: string; page: string }

export const SECTIONS: Record<HistorySection, SectionInfo> = {
  ideas: { label: 'Ideas', dateLabel: 'Added', cols: ['Idea', 'Angle', 'Status'], blurb: 'Every idea ever scored, including retired ones.', page: '/ideas/' },
  startups: { label: 'Startups', dateLabel: 'Data as of', cols: ['Startup', 'What it does', 'Stage'], blurb: 'Every startup on record.', page: '/startups/' },
  funding: { label: 'Funding rounds', dateLabel: 'Announced', cols: ['Company', 'Round', 'Stage'], blurb: 'Every funding round on record. The Funding page shows the last two years.', page: '/funding/' },
  opportunities: { label: 'Opportunities', dateLabel: 'Added', cols: ['Program', 'Details', 'Status'], blurb: 'Every program, fund and grant on record, open or closed.', page: '/opportunities/' },
  schemes: { label: 'Schemes', usLabel: 'Programs', dateLabel: 'Updated', cols: ['Name', 'Details', 'Status'], blurb: 'Every scheme on record, including closed ones.', page: '/schemes/' },
  regulations: { label: 'Regulations', dateLabel: 'Updated', cols: ['Regulation', 'Details', 'Status'], blurb: 'Every regulation on record.', page: '/regulations/' },
  jobs: { label: 'Jobs and skills', dateLabel: 'As of', cols: ['Role or skill', 'Details', 'Type'], blurb: 'Every role and skill reading on record.', page: '/jobs/' },
  changes: { label: 'Changes', dateLabel: 'When', cols: ['Item', 'What changed', 'Type'], blurb: 'Edits and removals, with the old and new values. Recorded since change tracking began, so older edits are not here.', page: '/' },
  runs: { label: 'Update runs', dateLabel: 'When', cols: ['Run', 'Result', ''], blurb: 'Each time the data was refreshed, and what changed.', page: '/' },
};
export const SECTION_ORDER: HistorySection[] = ['ideas', 'startups', 'funding', 'opportunities', 'schemes', 'regulations', 'jobs', 'changes', 'runs'];

const TAG: Record<string, string> = {
  open: 'Open', rolling: 'Rolling', upcoming: 'Next call due', between: 'Between intakes', closed: 'Closed', indirect: 'Via funds',
  active: 'Active', retired: 'Retired', new: 'New', revamped: 'Revamped', closing: 'Closing',
  in_force: 'In force', phased: 'Phased', partly_in_force: 'Partly in force', pending_rules: 'Rules pending', draft: 'Draft', guidance: 'Guidance',
  updated: 'Updated', deleted: 'Removed', run: 'Refresh', hot: 'In demand', growing: 'Growing', declining: 'Declining',
  largest_net_growth: 'Largest gain', largest_net_decline: 'Largest loss', rising: 'Rising', shortage: 'Shortage', premium: 'Premium', most_sought: 'Most sought', role_skill: 'Role skill',
};
const tagClass = (t: string) => (['open', 'rolling', 'upcoming', 'between', 'closed', 'indirect'].includes(t) ? `st-o-${t}` : ['active', 'in_force', 'new', 'phased', 'revamped', 'partly_in_force', 'pending_rules', 'guidance', 'draft'].includes(t) ? `st-${t}` : '');
const SECTION_NAME: Record<string, string> = { ideas: 'Ideas', startups: 'Startups', funding: 'Funding', opportunities: 'Opportunities', schemes: 'Schemes', regulations: 'Regulations', jobs: 'Jobs', policy: 'Policy' };
const RANGES: [string, number][] = [['All time', 0], ['24 hours', 1], ['7 days', 7], ['30 days', 30], ['90 days', 90], ['1 year', 365]];

/** A date-only value is shown without a time; timestamps get the local date and time. */
function when(d: string | null): string {
  if (!d) return '';
  if (/T00:00:00(\.0+)?(\+00:00|Z)$/.test(d) || /^\d{4}-\d{2}-\d{2}$/.test(d)) return dFull(d);
  const t = new Date(d);
  if (isNaN(t.getTime())) return dFull(d);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${dFull(`${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`)}, ${p(t.getHours())}:${p(t.getMinutes())}`;
}

/** Where a row can be opened. Rows the page no longer lists have no link. */
function linkOf(section: HistorySection, r: HistoryRow): string {
  const ref = r.ref ? encodeURIComponent(r.ref) : '';
  const tag = r.tag || '';
  switch (section) {
    case 'ideas': return tag === 'retired' || !ref ? '' : `/ideas/#${ref}`;
    case 'startups': return ref ? `/startups/#${ref}` : '';
    case 'funding': {
      const d = parseDate(r.d);
      const t = today();
      const months = d ? (t.getFullYear() - d.getFullYear()) * 12 + t.getMonth() - d.getMonth() : 99;
      return ref && months < 24 ? `/funding/#${ref}` : '';
    }
    case 'opportunities': return ref ? `/opportunities/#${ref}` : '';
    case 'schemes': return tag === 'closed' || !ref ? '' : `/schemes/#${ref}`;
    case 'regulations': return ref ? `/regulations/#${ref}` : '';
    case 'jobs': return SECTIONS.jobs.page;
    case 'changes': {
      if (tag === 'deleted' || !ref || !r.kind || r.kind === 'jobs') return '';
      const target = SECTIONS[r.kind as HistorySection];
      return target ? `${target.page}#${ref}` : '';
    }
    default: return '';
  }
}

export function HistoryTable({ section, bare = false }: { section: HistorySection; bare?: boolean }) {
  const { region } = useApp();
  const info = SECTIONS[section];
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  const [since, setSince] = useState(0);
  const [size, setSize] = useState(25);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<HistoryPage | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  useEffect(() => { const t = setTimeout(() => { setDq(q); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);
  useEffect(() => { setPage(1); }, [section, region, since, size]);

  const load = useCallback(() => {
    const n = ++seq.current;
    setBusy(true);
    fetchHistory(section, region, { page, size, q: dq, since })
      .then((d) => { if (n === seq.current) { setData(d); setError(''); } })
      .catch((e) => { if (n === seq.current) setError(e instanceof ApiError && e.status === 401 ? 'Your session ended. Sign in again.' : e instanceof Error ? e.message : 'Could not load history'); })
      .finally(() => { if (n === seq.current) setBusy(false); });
  }, [section, region, page, size, dq, since]);
  useEffect(() => { load(); }, [load]);

  const pages = data?.pages ?? 1;
  const from = data && data.total ? (data.page - 1) * data.size + 1 : 0;
  const to = data ? Math.min(data.total, data.page * data.size) : 0;
  const go = (p: number) => setPage(Math.max(1, Math.min(pages, p)));
  const label = section === 'schemes' && region === 'us' ? info.usLabel : info.label;

  return (
    <div className={bare ? 'hx' : 'hx hist-in'}>
      <div className="hist-tools">
        <label className="field search"><input type="search" placeholder={`Search ${label.toLowerCase()}`} aria-label={`Search ${label.toLowerCase()}`} value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <label className="field select"><select aria-label="Time range" value={since} onChange={(e) => setSince(Number(e.target.value))}>
          {RANGES.map(([t, v]) => <option key={v} value={v}>{t}</option>)}
        </select></label>
        <label className="field select"><select aria-label="Rows per page" value={size} onChange={(e) => setSize(Number(e.target.value))}>
          {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n} per page</option>)}
        </select></label>
      </div>
      <p className="muted small hist-note">{info.blurb}{data?.latest ? ` Latest entry ${when(data.latest)}.` : ''}</p>
      {error && <p className="notice" role="alert">{error} <button type="button" className="btn quiet sm" onClick={load}>Try again</button></p>}
      <div className={`hist-wrap${busy ? ' busy' : ''}`} aria-busy={busy}>
        <table className="htable">
          <caption className="sr">{label}, newest first. Page {data?.page ?? 1} of {pages}.</caption>
          <thead><tr><th scope="col">{info.dateLabel}</th><th scope="col">{info.cols[0]}</th><th scope="col">{info.cols[1]}</th>{info.cols[2] && <th scope="col">{info.cols[2]}</th>}</tr></thead>
          <tbody>
            {data?.rows.map((r, i) => {
              const href = linkOf(section, r);
              const tag = r.tag || '';
              return (
                <tr key={`${data.page}-${i}`}>
                  <td className="h-date"><time dateTime={r.d ?? undefined}>{when(r.d)}</time></td>
                  <td className="h-title">{href ? <a href={href}>{r.title}</a> : r.title}{r.kind && section !== 'runs' && <small>{section === 'changes' ? SECTION_NAME[r.kind] || r.kind : r.kind}</small>}</td>
                  <td className="h-sub">{r.sub}</td>
                  {info.cols[2] && <td className="h-tag">{tag && tag !== 'run' ? <span className={`st ${tagClass(tag)}`}>{TAG[tag] || tag}</span> : null}</td>}
                </tr>
              );
            })}
            {data && !data.rows.length && <tr><td colSpan={4} className="h-none">{dq || since ? 'Nothing matches. Try a longer time range or a different word.' : 'Nothing recorded yet.'}</td></tr>}
            {!data && !error && <tr><td colSpan={4} className="h-none">Loading…</td></tr>}
          </tbody>
        </table>
      </div>
      <nav className="pager" aria-label={`${label} pages`}>
        <span className="muted small" role="status" aria-live="polite">{data ? (data.total ? `${from.toLocaleString()}–${to.toLocaleString()} of ${data.total.toLocaleString()}` : '0 results') : ''}</span>
        <span className="pager-btns">
          <button type="button" className="btn quiet sm" onClick={() => go(1)} disabled={page <= 1 || busy} aria-label="First page">«</button>
          <button type="button" className="btn quiet sm" onClick={() => go(page - 1)} disabled={page <= 1 || busy}>Previous</button>
          <span className="pager-at">Page {page} of {pages}</span>
          <button type="button" className="btn quiet sm" onClick={() => go(page + 1)} disabled={page >= pages || busy}>Next</button>
          <button type="button" className="btn quiet sm" onClick={() => go(pages)} disabled={page >= pages || busy} aria-label="Last page">»</button>
        </span>
      </nav>
    </div>
  );
}
