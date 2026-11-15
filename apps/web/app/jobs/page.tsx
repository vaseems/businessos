'use client';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { dFull, has, s, safeUrl } from '@/lib/format';
import { useApi, useApp, useSheetItems, type SheetItem } from '@/components/AppContext';
import Page from '@/components/Page';
import { Count, SearchField } from '@/components/ui';

const jslug = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const fmt1 = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).replace(/\.0$/, '');
const fmtPct = (v: any) => (Number(v) >= 0 ? '+' : '') + fmt1(Number(v)) + '%';
const fmtAbs = (v: any, unit: any) => {
  const n = Number(v), u = s(unit);
  if (u.includes('million')) return fmt1(n) + 'M';
  return n >= 1000 ? fmt1(n / 1000) + 'K' : String(Math.trunc(n));
};
const nn = (v: any) => v !== null && v !== undefined;

const OUTLOOK_TITLE: Record<string, string> = {
  growing: 'Fastest-growing roles', largest_net_growth: 'Largest net job gains', declining: 'Fastest-declining roles', largest_net_decline: 'Largest net job losses',
};
const TABS: Record<string, string[]> = { growing: ['growing', 'largest_net_growth'], declining: ['declining', 'largest_net_decline'] };
const CATS: [string, string][] = [
  ['rising', 'Fastest-rising skills'], ['shortage', 'Hardest skills to find'], ['most_sought', 'Most sought-after'],
  ['premium', 'Skills that earn a premium'], ['role_skill', 'Skills named for hot roles'], ['declining', 'Declining skills'],
];
const CONF: Record<string, string> = { high: 'Verified', medium: 'Partly verified', low: 'Unverified' };

export default function Jobs() {
  const { openSheet, setPaletteExtras } = useApp();
  const { data, error } = useApi<any>('jobs');
  const [q, setQ] = useState('');
  const [tab, setTab] = useState('growing');

  const m = useMemo(() => {
    if (!data) return null;
    const src: Record<string, any> = {};
    for (const x of data.sources || []) src[x.slug] = x;
    const skillsByRole: Record<string, string[]> = {};
    const tmp: Record<string, Record<number, string>> = {};
    for (const r of data.role_skills || []) (tmp[r.role] ||= {})[Math.trunc(r.rank_no)] = r.skill;
    for (const [role, mm] of Object.entries(tmp)) skillsByRole[role] = Object.keys(mm).map(Number).sort((a, b) => a - b).map((k) => mm[k]);
    const skillsRanked = (role: string): [number, string][] => {
      const mm = tmp[role]; return mm ? Object.keys(mm).map(Number).sort((a, b) => a - b).map((k) => [k, mm[k]]) : [];
    };
    const stat: Record<string, any> = {};
    for (const t of data.stats || []) stat[t.source_slug + '/' + t.stat_key] = t;
    const sv = (k: string) => (stat[k] ? stat[k].value : null);

    const srcLink = (slug: string): ReactNode => {
      const x = src[slug];
      if (!x) return slug;
      const u = safeUrl(x.url);
      const t = `${s(x.publisher)}: ${s(x.title)}`;
      return u ? <a href={u} target="_blank" rel="noopener noreferrer">{t}</a> : t;
    };
    const sheetBody = (role: string, details: ReactNode): ReactNode => {
      const sk = skillsRanked(role);
      return (
        <>
          <h3 className="sheet-h">Top 5 skills required</h3>
          {sk.length ? (
            <ol className="skills5">{sk.map(([i, name]) => <li key={i}><span className="n">{i}</span><span>{name}</span></li>)}</ol>
          ) : <p className="muted">No skill list yet for this role.</p>}
          <dl className="facts" style={{ marginTop: 22 }}>{details}</dl>
        </>
      );
    };

    // Sections: tab -> groups (insertion ordered) -> rows
    const sections: Record<string, Map<string, any[]>> = { growing: new Map(), declining: new Map() };
    const roles = new Map<string, { t: string; s: string; slug: string }>();
    for (const f of data.future || []) {
      for (const [tk, outs] of Object.entries(TABS)) {
        if (outs.includes(f.outlook)) {
          const key = [f.source_slug, f.outlook, f.horizon, f.region].join('|');
          if (!sections[tk].has(key)) sections[tk].set(key, []);
          sections[tk].get(key)!.push(f);
        }
      }
      if (!roles.has(f.role)) roles.set(f.role, { t: f.role, s: f.outlook === 'declining' || f.outlook === 'largest_net_decline' ? 'Declining role' : 'Growing role', slug: jslug(f.role) });
    }
    const hot: any[] = data.hot || [];
    for (const h of hot) if (skillsByRole[h.role] && !roles.has(h.role)) roles.set(h.role, { t: h.role, s: 'In demand now', slug: jslug(h.role + '-' + h.region) });

    const tabsRows: Record<string, { key: string; head: [string, string]; rows: any[] }[]> = { growing: [], declining: [], hot: [] };
    for (const tk of ['growing', 'declining']) {
      for (const [key, rows] of sections[tk]) {
        const [slug, outlook, horizon, region] = key.split('|');
        tabsRows[tk].push({
          key,
          head: [OUTLOOK_TITLE[outlook] ?? outlook, `${region} · ${horizon} · ${src[slug]?.publisher ?? slug}`],
          rows: rows.map((r) => {
            const skills = skillsByRole[r.role] || [];
            const metric = nn(r.growth_pct) ? fmtPct(r.growth_pct) : nn(r.change_abs) ? fmtAbs(r.change_abs, r.change_unit) : '';
            const details = (
              <>
                <div><dt>Outlook</dt><dd>{OUTLOOK_TITLE[outlook] ?? outlook}, {s(r.region)}, {s(r.horizon)}</dd></div>
                {nn(r.growth_pct)
                  ? <div><dt>Projected growth</dt><dd>{fmtPct(r.growth_pct)}{nn(r.change_abs) ? ` (${fmtAbs(r.change_abs, r.change_unit)} ${s(r.change_unit).replace(/^million /, '')})` : ''}</dd></div>
                  : nn(r.change_abs) ? <div><dt>Change</dt><dd>{fmtAbs(r.change_abs, r.change_unit)} {s(r.change_unit)}</dd></div> : null}
                {has(r.note) && <div><dt>Note</dt><dd>{r.note}</dd></div>}
                <div><dt>Source</dt><dd>{srcLink(r.source_slug)}</dd></div>
                <div><dt>Confidence</dt><dd>{CONF[r.confidence] ?? s(r.confidence)}</dd></div>
              </>
            );
            const slug = jslug(r.role);
            return {
              slug, title: r.role, rank: r.rank_no, sub: skills.length ? skills.slice(0, 3).join(' · ') : s(r.note), metric, neg: tk === 'declining', conf: CONF[r.confidence] ?? '',
              search: (r.role + ' ' + skills.join(' ') + ' ' + s(r.note)).toLowerCase(), item: { slug, title: r.role, body: sheetBody(r.role, details) } as SheetItem,
            };
          }),
        });
      }
    }
    const byRegion = new Map<string, any[]>();
    for (const h of hot) { if (!byRegion.has(h.region)) byRegion.set(h.region, []); byRegion.get(h.region)!.push(h); }
    for (const [region, rows] of byRegion) {
      tabsRows.hot.push({
        key: region, head: [region, 'Current hiring demand'],
        rows: rows.map((h) => {
          const skills = skillsByRole[h.role] || [];
          const metric = nn(h.metric_value) ? fmt1(Number(h.metric_value)) + ' ' + s(h.metric_unit) : '';
          const details = (
            <>
              <div><dt>Signal</dt><dd>{s(h.signal)}</dd></div>
              {metric !== '' && <div><dt>Figure</dt><dd>{metric}</dd></div>}
              {has(h.note) && <div><dt>Note</dt><dd>{h.note}</dd></div>}
              <div><dt>Region</dt><dd>{s(h.region)}</dd></div>
              <div><dt>Source</dt><dd>{srcLink(h.source_slug)}</dd></div>
              <div><dt>Confidence</dt><dd>{CONF[h.confidence] ?? s(h.confidence)}</dd></div>
            </>
          );
          const slug = jslug(h.role + '-' + region);
          return {
            slug, title: h.role, rank: h.rank_no, sub: s(h.signal), metric, neg: false, conf: CONF[h.confidence] ?? '',
            search: (h.role + ' ' + skills.join(' ') + ' ' + s(h.signal) + ' ' + s(h.note)).toLowerCase(), item: { slug, title: h.role, body: sheetBody(h.role, details) } as SheetItem,
          };
        }),
      });
    }
    const skillsBy: Record<string, any[]> = {};
    for (const k of data.skills || []) (skillsBy[k.category] ||= []).push(k);
    const slugTab: Record<string, string> = {};
    const items: Record<string, SheetItem> = {};
    for (const tk of ['growing', 'declining', 'hot']) for (const g of tabsRows[tk]) for (const r of g.rows) if (!items[r.slug]) { items[r.slug] = r.item; slugTab[r.slug] = tk; }
    const publishers = Object.values(src).filter((x: any) => x.slug !== 'compiled-role-skills').map((x: any) => s(x.publisher));
    return { src, sv, tabsRows, skillsBy, roles: [...roles.values()], items, slugTab, publishers };
  }, [data]);

  useEffect(() => {
    if (!m) return;
    setPaletteExtras(m.roles.map((r) => ({ k: 'Jobs', t: r.t, s: r.s, h: `/jobs/#${r.slug}` })));
    return () => setPaletteExtras([]);
  }, [m, setPaletteExtras]);
  useSheetItems(m ? m.items : null);

  // Deep link: open the tab that holds the role.
  useEffect(() => {
    if (!m) return;
    const h = decodeURIComponent(location.hash.slice(1)).replace(/[^\w-]/g, '');
    if (h && m.slugTab[h]) setTab(m.slugTab[h]);
  }, [m]);

  const term = q.trim().toLowerCase();
  const match = (txt: string) => !term || txt.includes(term);
  const tabGroups = useMemo(() => {
    if (!m || tab === 'skills') return [];
    return m.tabsRows[tab].map((g) => ({ ...g, rows: g.rows.filter((r) => match(r.search)) })).filter((g) => g.rows.length);
  }, [m, tab, term]); // eslint-disable-line react-hooks/exhaustive-deps
  const skillCats = useMemo(() => {
    if (!m || tab !== 'skills') return [];
    return CATS.filter(([ck]) => m.skillsBy[ck]?.length).map(([ck, title]) => ({
      ck, title, rows: m.skillsBy[ck].filter((k) => match((s(k.skill) + ' ' + s(k.note) + ' ' + s(k.region)).toLowerCase())),
    })).filter((c) => c.rows.length);
  }, [m, tab, term]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = tab === 'skills' ? skillCats.reduce((a, c) => a + c.rows.length, 0) : tabGroups.reduce((a, g) => a + g.rows.length, 0);

  const sv = (k: string) => Number(m?.sv(k) ?? 0);
  return (
    <Page title="Jobs and skills" data={m ? data : null} error={error}>
      {() => m && (
        <>
          <section className="stats jobs-stats" aria-label="Headline numbers">
            <div><Count end={sv('wef-foj-2025/net_growth')} /><span className="lbl">Net new jobs by 2030 (millions)</span></div>
            <div><Count end={sv('wef-foj-2025/skills_change')} suffix="%" /><span className="lbl">Core skills changing by 2030</span></div>
            <div><Count end={sv('pwc-aijb-2026/ai_wage_premium')} suffix="%" /><span className="lbl">Pay premium for AI skills</span></div>
          </section>

          <div className="toolbar">
            <SearchField id="jq" placeholder="Search roles and skills" value={q} onChange={setQ} />
            <div className="seg" role="tablist" aria-label="View" id="jtabs">
              {([['growing', 'Growing'], ['declining', 'Declining'], ['hot', 'In demand now'], ['skills', 'Skills']] as [string, string][]).map(([k, t]) => (
                <button type="button" role="tab" key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>{t}</button>
              ))}
            </div>
          </div>

          <div id="jobs">
            {tab !== 'skills' && (
              <div className="jtab" data-tab={tab}>
                {tabGroups.map((g) => (
                  <section className="jgroup" key={g.key}>
                    <div className="panel-head sub"><h2>{g.head[0]}</h2><span className="muted small">{g.head[1]}</span></div>
                    <ul className="rows">
                      {g.rows.map((r) => (
                        <li className="row jrow" key={g.key + r.slug} data-slug={r.slug}>
                          <button type="button" className="row-btn" onClick={() => openSheet(r.item)}>
                            <span className={`rkb${r.rank === null || r.rank === undefined ? ' none' : ''}`}>{nn(r.rank) ? Math.trunc(r.rank) : '·'}</span>
                            <span className="row-main"><b className="row-title">{r.title}</b><span className="row-sub">{r.sub}</span></span>
                            <span className={`jmetric ${r.neg ? 'neg' : 'pos'}`}>{r.metric}</span>
                            <span className="glyph"><span className="tag">{r.conf}</span></span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
            {tab === 'skills' && (
              <div className="jtab" data-tab="skills">
                <div className="skillgrid">
                  {skillCats.map((c) => (
                    <section className="panel jgroup" key={c.ck}>
                      <div className="panel-head"><h2>{c.title}</h2></div>
                      <ul className="skilllist">
                        {c.rows.map((k, idx) => {
                          const mv = nn(k.metric_value) ? fmt1(Number(k.metric_value)) + ' ' + s(k.metric_unit) : '';
                          return (
                            <li className="skillrow" key={idx}>
                              <span className={`rkb sm${k.rank_no === null || k.rank_no === undefined ? ' none' : ''}`}>{nn(k.rank_no) ? Math.trunc(k.rank_no) : '·'}</span>
                              <span className="sk-main"><b>{k.skill}</b>
                                <span className="muted small">{s(k.region)} · {m.src[k.source_slug]?.publisher ?? k.source_slug}{mv !== '' ? ' · ' + mv : ''}</span></span>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  ))}
                </div>
              </div>
            )}
            {!shown && <section className="empty" id="jnone"><h1>No matches</h1><p>Try a different role or skill.</p></section>}
          </div>

          <p className="muted small jnote">Sources: {m.publishers.join(', ')}. The top 5 skills for each role are an indicative list, not a published ranking. Data refreshed {dFull(data.refreshed_at ?? new Date().toISOString())}.</p>
        </>
      )}
    </Page>
  );
}
