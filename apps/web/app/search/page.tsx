'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, fetchSearch, type Hit, type SearchOut } from '@/lib/api';
import { dFull } from '@/lib/format';
import { useApp } from '@/components/AppContext';
import Shell from '@/components/Shell';
import { Marked } from '@/components/Marked';
import { Icon } from '@/components/ui';

const LANE_NOTE: Record<string, string> = { build: 'ideas', market: 'startups and rounds', capital: 'funds and programs', policy: 'schemes and rules', careers: 'roles and skills' };

export default function SearchPage() {
  const { region, ready } = useApp();
  const [q, setQ] = useState('');
  const [typed, setTyped] = useState('');
  const [lane, setLane] = useState('');
  const [cat, setCat] = useState('');
  const [out, setOut] = useState<SearchOut | null>(null);
  const [more, setMore] = useState<Record<string, Hit[]>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const v = new URLSearchParams(location.search).get('q') || '';
    setTyped(v); setQ(v);
    input.current?.focus();
  }, []);
  useEffect(() => {
    const t = setTimeout(() => setQ(typed.trim()), 250);
    return () => clearTimeout(t);
  }, [typed]);
  useEffect(() => {
    try { history.replaceState(null, '', q ? `/search/?q=${encodeURIComponent(q)}` : '/search/'); } catch { /* ignore */ }
  }, [q]);

  useEffect(() => {
    if (!ready) return;
    setMore({}); setLane(''); setCat('');
    if (q.length < 2) { setOut(null); setError(''); return; }
    const n = ++seq.current;
    setBusy(true);
    fetchSearch(q, region, { per: 6 })
      .then((d) => { if (n === seq.current) { setOut(d); setError(''); } })
      .catch((e) => { if (n === seq.current) setError(e instanceof ApiError && e.status === 401 ? 'Your session ended. Sign in again.' : 'Search is unavailable right now. Try again in a moment.'); })
      .finally(() => { if (n === seq.current) setBusy(false); });
  }, [q, region, ready]);

  const showMore = useCallback(async (key: string, have: number) => {
    try {
      const d = await fetchSearch(q, region, { per: 20, cat: key, offset: have });
      setMore((m) => ({ ...m, [key]: [...(m[key] || []), ...(d.results[key] || [])] }));
    } catch { setError('Could not load more. Try again.'); }
  }, [q, region]);

  const toks = out?.tokens || [];
  const visibleCats = useMemo(() => (out?.cats || []).filter((c) => c.count && (!lane || c.group === lane) && (!cat || c.key === cat)), [out, lane, cat]);
  const total = out?.total ?? 0;
  const maxLane = Math.max(1, ...(out?.groups || []).map((g) => g.count));

  return (
    <Shell title="Search">
      <section className="sp-head">
        <label className="sp-input"><Icon name="search" />
          <input ref={input} type="search" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search ideas, startups, funding, schemes, rules, roles…" aria-label="Search everything" autoComplete="off" spellCheck={false} />
        </label>
        <p className="muted small" role="status" aria-live="polite">
          {q.length < 2 ? 'Type at least two letters.' : busy && !out ? 'Searching…' : out ? `${total.toLocaleString()} ${total === 1 ? 'result' : 'results'} for “${out.q}” in ${out.cats.filter((c) => c.count).length} ${out.cats.filter((c) => c.count).length === 1 ? 'category' : 'categories'} · ${out.ms} ms` : ''}
        </p>
      </section>

      {error && <p className="notice" role="alert">{error}</p>}

      {out && total > 0 && (
        <>
          <div className="lanes" role="group" aria-label="Filter by group">
            {out.groups.map((g) => (
              <button type="button" key={g.key} className={`lane lane-${g.key}`} aria-pressed={lane === g.key} disabled={!g.count} onClick={() => { setLane(lane === g.key ? '' : g.key); setCat(''); }}>
                <span className="lane-n">{g.count}</span>
                <span className="lane-l">{g.label}</span>
                <span className="lane-b">{LANE_NOTE[g.key]}</span>
                <span className="lane-bar"><i style={{ width: `${Math.round((100 * g.count) / maxLane)}%` }} /></span>
              </button>
            ))}
          </div>

          {out.top && !lane && !cat && (
            <a className={`best lane-${out.cats.find((c) => c.key === out.top!.cat)?.group}`} href={out.top.href}>
              <span className="best-k">Best match · {out.cats.find((c) => c.key === out.top!.cat)?.label}</span>
              <b><Marked text={out.top.title} tokens={toks} /></b>
              {out.top.sub && <span className="best-s"><Marked text={out.top.sub} tokens={toks} /></span>}
              {out.top.tag && <span className="tag">{out.top.tag}</span>}
            </a>
          )}

          <div className="catchips" role="group" aria-label="Filter by category">
            {out.cats.filter((c) => c.count && (!lane || c.group === lane)).map((c) => (
              <button type="button" key={c.key} className={`chip lane-${c.group}`} aria-pressed={cat === c.key} onClick={() => setCat(cat === c.key ? '' : c.key)}>{c.label} <b>{c.count}</b></button>
            ))}
          </div>

          {visibleCats.map((c) => {
            const list = [...(out.results[c.key] || []).filter((h) => !(more[c.key] || []).some((m) => m.id === h.id)), ...(more[c.key] || [])];
            const shown = list;
            return (
              <section className={`rgroup lane-${c.group}`} key={c.key} aria-label={c.label}>
                <header><h2><i aria-hidden="true" />{c.label}</h2><span className="muted small">{c.count} {c.count === 1 ? 'match' : 'matches'}</span></header>
                <ul className="rlist">
                  {shown.map((h) => (
                    <li key={h.id}>
                      <a href={h.href} className={h.partial ? 'partial' : ''}>
                        <span className="rl-main"><b><Marked text={h.title} tokens={toks} /></b>{h.sub && <span><Marked text={h.sub} tokens={toks} /></span>}</span>
                        <span className="rl-meta">{h.tag && <span className="tag">{h.tag}</span>}{h.date && <time dateTime={h.date}>{dFull(h.date)}</time>}</span>
                      </a>
                    </li>
                  ))}
                </ul>
                {shown.length < c.count && <p className="dmore"><button type="button" className="btn quiet sm" onClick={() => showMore(c.key, shown.length)}>Show {Math.min(20, c.count - shown.length)} more {c.label.toLowerCase()}</button></p>}
              </section>
            );
          })}
        </>
      )}

      {out && total === 0 && !busy && (
        <section className="empty"><h1>No results for “{out.q}”</h1><p>Try fewer words, a company name, a regulation such as DPDP, or a topic like grants or accelerators.</p></section>
      )}
      {!out && q.length < 2 && !error && (
        <section className="empty"><h1>Search everything</h1><p>Ideas, startups, funding rounds, programs you can apply to, schemes, regulations, roles and skills, all in one place.</p></section>
      )}
    </Shell>
  );
}
