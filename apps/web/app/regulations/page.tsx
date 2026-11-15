'use client';
import { useEffect, useMemo, useState } from 'react';
import { dFull, has, parseDate, s, safeUrl, today } from '@/lib/format';
import { md5 } from '@/lib/md5';
import { stateSlug } from '@/lib/region';
import { useApi, useApp, useSheetItems, type SheetItem } from '@/components/AppContext';
import Page from '@/components/Page';
import { PreviousResults } from '@/components/History';
import { SearchField } from '@/components/ui';

const STATUS_LBL: Record<string, string> = {
  in_force: 'In force', phased: 'Phased rollout', partly_in_force: 'Partly in force', pending_rules: 'Rules pending', draft: 'Draft', guidance: 'Guidance',
};
const CONF: Record<string, string> = { high: 'Verified', medium: 'Partly verified', low: 'Unverified' };
const dayMs = 86400000;
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function Regulations() {
  const { rc, state: sel, openSheet, setPaletteExtras } = useApp();
  const { data, error } = useApi<any>('policy');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');

  const m = useMemo(() => {
    if (!data) return null;
    const regs: any[] = data.regulations || [], ms: any[] = data.milestones || [];
    const t = today(), todayIso = iso(t);
    const yearAgo = iso(new Date(t.getFullYear(), t.getMonth() - 12, t.getDate()));
    const byReg: Record<string, any[]> = {};
    for (const x of ms) (byReg[x.reg_slug] ||= []).push(x);
    const names: Record<string, string> = {};
    for (const r of regs) names[r.slug] = r.short_name || r.name;
    const cats = [...new Set(regs.map((r) => r.category))].sort() as string[];
    const upcoming = ms.filter((x) => x.on_date >= todayIso);
    const recent = ms.filter((x) => x.on_date < todayIso && x.on_date >= yearAgo).reverse();
    const days = (d: string) => Math.round(((parseDate(d) as Date).getTime() - t.getTime()) / dayMs);
    return { regs, byReg, names, cats, upcoming, recent, days, todayIso };
  }, [data]);

  useEffect(() => {
    if (!m) return;
    setPaletteExtras(m.regs.map((r) => ({ k: 'Regulations', t: s(r.name), s: s(r.category), h: `/regulations/#${r.slug}` })));
    return () => setPaletteExtras([]);
  }, [m, setPaletteExtras]);

  const items = useMemo<Record<string, SheetItem>>(() => {
    const out: Record<string, SheetItem> = {};
    if (!m) return out;
    for (const r of m.regs) {
      const url = safeUrl(r.official_url);
      const tl = m.byReg[r.slug];
      out[r.slug] = {
        slug: r.slug, title: r.name,
        body: (
          <>
            <div className="sheet-meta"><span className={`st st-${s(r.status)}`}>{STATUS_LBL[r.status] ?? s(r.status)}</span><div className="facts-inline">
              {r.enacted_on && <span>Enacted <b>{dFull(r.enacted_on)}</b></span>}
              {r.effective_from && <span>Effective <b>{dFull(r.effective_from)}</b></span>}</div></div>
            <p className="sheet-lead">{s(r.summary)}</p>
            <dl className="facts">
              <div><dt>Applies to</dt><dd>{s(r.applies_to)}</dd></div>
              <div><dt>{rc.code === 'us' ? 'Enforced by' : 'Regulator'}</dt><dd>{s(r.regulator)}</dd></div>
              {has(r.state) && <div><dt>Jurisdiction</dt><dd>{s(r.state)} (state law)</dd></div>}
            </dl>
            {has(r.key_obligations) && <>
              <h3 className="sheet-h" style={{ marginTop: 22 }}>Key obligations</h3>
              <ul className="checks">{r.key_obligations.map((o: string, i: number) => <li key={i}>{o}</li>)}</ul></>}
            {has(r.startup_actions) && <>
              <h3 className="sheet-h" style={{ marginTop: 22 }}>What a startup should do</h3>
              <ul className="checks todo">{r.startup_actions.map((o: string, i: number) => <li key={i}>{o}</li>)}</ul></>}
            {has(r.penalties) && <>
              <h3 className="sheet-h" style={{ marginTop: 22 }}>Penalties</h3><p className="pen">{r.penalties}</p></>}
            {has(tl) && <>
              <h3 className="sheet-h" style={{ marginTop: 22 }}>Timeline</h3>
              <ol className="vtl">{tl.map((x: any, i: number) => (
                <li key={i} className={x.on_date >= m.todayIso ? 'up' : 'done'}><small>{dFull(x.on_date)}</small><b>{x.title}</b>{x.detail && <span>{x.detail}</span>}</li>
              ))}</ol></>}
            {has(r.related) && <>
              <h3 className="sheet-h" style={{ marginTop: 22 }}>Related</h3>
              <p className="rel">{r.related.filter((rs: string) => m.names[rs]).map((rs: string) => <span key={rs}><a className="tag" href={`#${rs}`}>{m.names[rs]}</a> </span>)}</p></>}
            {url && <p style={{ marginTop: 22 }}><a className="btn sm" href={url} target="_blank" rel="noopener noreferrer">Official source</a></p>}
            <p className="muted small" style={{ marginTop: 18 }}>{CONF[r.confidence] ?? ''}. A plain-language summary, not legal advice; check the official text before acting.</p>
          </>
        ),
      };
    }
    return out;
  }, [m, rc]);
  useSheetItems(m ? items : null);

  const shown = useMemo(() => {
    if (!m) return [];
    const term = q.trim().toLowerCase();
    return m.regs.filter((r) => {
      const search = [r.name, r.short_name, r.category, r.regulator, r.summary, r.applies_to, (r.key_obligations || []).join(' ')].map(s).join(' ').toLowerCase();
      const st = has(r.state) ? stateSlug(s(r.state)) : '';
      return (!term || search.includes(term)) && (!cat || r.category === cat) && (!sel || !st || st === sel);
    });
  }, [m, q, cat, sel]);

  return (
    <Page title="Regulations" data={m ? data : null} error={error}>
      {() => m && (
        <>
          <div className="split two">
            <section className="panel">
              <div className="panel-head"><h2>Coming up</h2><span className="muted small">Dates to prepare for</span></div>
              {!m.upcoming.length && <p className="muted">No upcoming dates recorded.</p>}
              <ol className="tl">
                {m.upcoming.map((x, i) => {
                  const n = m.days(x.on_date);
                  return (
                    <li key={i}><a href={`#${x.reg_slug}`} className="tl-item">
                      <span className="tl-when"><b>{n === 0 ? 'Today' : n < 60 ? `In ${n} days` : dFull(x.on_date)}</b><small>{dFull(x.on_date)}</small></span>
                      <span className="tl-what"><span className="tag">{m.names[x.reg_slug] ?? x.reg_slug}</span><b>{x.title}</b>{x.detail && <small>{x.detail}</small>}</span>
                    </a></li>
                  );
                })}
              </ol>
            </section>
            <section className="panel">
              <div className="panel-head"><h2>Changed in the last 12 months</h2></div>
              <ol className="tl past">
                {m.recent.slice(0, 6).map((x, i) => (
                  <li key={i}><a href={`#${x.reg_slug}`} className="tl-item">
                    <span className="tl-when"><small>{dFull(x.on_date)}</small></span>
                    <span className="tl-what"><span className="tag">{m.names[x.reg_slug] ?? x.reg_slug}</span><b>{x.title}</b></span>
                  </a></li>
                ))}
              </ol>
            </section>
          </div>

          <div className="toolbar">
            <SearchField id="rq" placeholder={`Search laws, duties, ${rc.code === 'us' ? 'agencies' : 'regulators'}`} value={q} onChange={setQ} />
          </div>
          <div className="seg chips" role="group" aria-label="Area" id="rcat">
            <button type="button" aria-pressed={cat === ''} onClick={() => setCat('')}>All areas</button>
            {m.cats.map((c) => <button type="button" key={c} aria-pressed={cat === c} onClick={() => setCat(c)}>{c}</button>)}
          </div>
          <p className="count"><span id="rcount">{shown.length}</span> laws and rules</p>

          <ul className="rows" id="rlist">
            {shown.map((r) => {
              const words = s(r.short_name || r.name).trim().split(/\s+/);
              const init = (words.length > 1 ? [...words[0]][0] + [...words[1]][0] : [...words[0]].slice(0, 2).join('')).toUpperCase();
              return (
                <li className="row rrow" key={r.slug} data-slug={r.slug}>
                  <button type="button" className="row-btn" onClick={() => openSheet(items[r.slug])}>
                    <span className={`rkb cat-${md5(s(r.category)).charAt(0)}`}>{init}</span>
                    <span className="row-main"><b className="row-title">{r.name}</b><span className="row-sub">{has(r.state) ? s(r.state) + ' · ' : ''}{s(r.regulator)}{r.effective_from ? ' · effective ' + dFull(r.effective_from) : ''}</span></span>
                    <span className={`st st-${s(r.status)}`}>{STATUS_LBL[r.status] ?? s(r.status)}</span>
                    <span className="glyph"><span className="tag">{s(r.category)}</span></span>
                  </button>
                </li>
              );
            })}
          </ul>
          {!shown.length && <section className="empty" id="rnone"><h1>No matches</h1><p>Try another area or search term.</p></section>}
          <p className="muted small jnote">{rc.code === 'us'
            ? 'Federal laws and rules, plus the state laws that matter most to startups and small businesses. Choose your state in the header to see its laws next to the federal ones.'
            : 'Central laws and rules that matter most to startups and small businesses.'} Reviewed monthly. Last refreshed {dFull(data.refreshed_at ?? iso(new Date()))}.</p>
          <PreviousResults section="regulations" />
        </>
      )}
    </Page>
  );
}
