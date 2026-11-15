'use client';
import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useApi, useApp } from '@/components/AppContext';
import Page from '@/components/Page';
import { Count } from '@/components/ui';
import { Constellation } from '@/components/Vendor';
import { dMon, money } from '@/lib/format';

export default function Overview() {
  const { rc, region } = useApp();
  const { data, error, refresh } = useApi<any>('data');
  const isUs = region === 'us';

  const m = useMemo(() => {
    if (!data) return null;
    const ideas: any[] = data.ideas || [], startups: any[] = data.startups || [], log: any[] = data.log || [];
    const n = ideas.length;
    const scores = ideas.map((i) => Math.trunc(i.score));
    const avg = n ? scores.reduce((a, b) => a + b, 0) / n : 0;
    const names: Record<string, string> = {};
    ideas.forEach((i) => { names[i.slug] = i.name; });
    const factors: [string, string][] = [['critical', 'Critical'], ['demand', 'Demand'], ['ease', 'Ease to build'], ['india_edge', rc.edge]];
    const fav: Record<string, number> = {};
    factors.forEach(([k]) => { fav[k] = n ? ideas.reduce((a, i) => a + Math.trunc(i[k]), 0) / n : 0; });
    const buckets: [string, number][] = [['Under 50', 0], ['50s', 0], ['60s', 0], ['70s', 0], ['80+', 0]];
    scores.forEach((s) => { buckets[s < 50 ? 0 : s < 60 ? 1 : s < 70 ? 2 : s < 80 ? 3 : 4][1]++; });
    const bmax = Math.max(1, ...buckets.map((b) => b[1]));
    const sec: Record<string, { in?: number; gl?: number }> = {};
    startups.forEach((s) => {
      if (s.last_round_amount_usd_m !== null && s.last_round_amount_usd_m !== undefined) {
        const k = s.sector || 'Other';
        const r = isUs || (s.region ?? '') === 'India' ? 'in' : 'gl';
        sec[k] = sec[k] || {};
        sec[k][r] = (sec[k][r] || 0) + Number(s.last_round_amount_usd_m);
      }
    });
    const tot = (v: { in?: number; gl?: number }) => (v.in || 0) + (v.gl || 0);
    const secList = Object.entries(sec).sort((a, b) => tot(b[1]) - tot(a[1])).slice(0, 8);
    const smax = Math.max(1, ...secList.map(([, v]) => tot(v)));
    const nodes = ideas.map((i) => ({ n: i.name, s: Math.trunc(i.score), k: i.slug }));
    return { ideas, startups, log, n, ns: startups.length, avg, names, factors, fav, buckets, bmax, secList, smax, nodes, top: ideas[0] };
  }, [data, isUs, rc.edge]);

  // One load moment: hero text first.
  useEffect(() => {
    if (!m) return;
    const id = requestAnimationFrame(() => document.getElementById('hero')?.classList.add('load'));
    return () => cancelAnimationFrame(id);
  }, [m]);

  return (
    <Page title="Overview" data={data} error={error} refresh={refresh}>
      {() => m && (
        <>
          <section className="hero" id="hero">
            <Constellation key={region + m.n} nodes={m.nodes} />
            <div className="hero-copy">
              {m.top ? (
                <>
                  <p className="hero-note">{m.n} ideas ranked today</p>
                  <h1>{m.top.name} leads at {Math.trunc(m.top.score)}.</h1>
                  <p className="hero-sub">{m.top.india_angle}</p>
                  <div className="hero-actions">
                    <a className="btn" href={`/ideas/#${m.top.slug}`}>Open idea</a>
                    <Link className="btn quiet" href="/ideas/">See all ideas</Link>
                  </div>
                </>
              ) : (<><h1>No ideas yet.</h1><p className="hero-sub">New ideas will appear here soon.</p></>)}
            </div>
            <p className="hero-hint">Each point is an idea. Larger means a higher score.</p>
          </section>

          <section className="stats" aria-label="Summary">
            <div><Count end={m.n} /><span className="lbl">Ideas</span></div>
            <div><Count end={Number(m.avg.toFixed(1))} dec={1} /><span className="lbl">Average score</span></div>
            <div><Count end={m.ns} /><span className="lbl">Startups</span></div>
          </section>

          <div className="split">
            <section className="panel">
              <div className="panel-head"><h2>Top ideas</h2><Link href="/ideas/">All {m.n}</Link></div>
              <ol className="rank">
                {m.ideas.slice(0, 10).map((i) => (
                  <li key={i.slug}><a href={`/ideas/#${i.slug}`}>
                    <span className="rk">{Math.trunc(i.rank_no)}</span>
                    <span className="rn">{i.name}</span>
                    <span className="rbar"><i style={{ ['--w' as any]: `${Math.trunc(i.score)}%` }} /></span>
                    <span className="rs">{Math.trunc(i.score)}</span>
                  </a></li>
                ))}
              </ol>
            </section>

            <section className="panel">
              <div className="panel-head"><h2>What drives the scores</h2></div>
              <div className="meters">
                {m.factors.map(([k, label]) => (
                  <div className="meter" key={k}>
                    <div className="mh"><span>{label}</span><b>{m.fav[k].toFixed(1)} of 5</b></div>
                    <div className="track"><i style={{ ['--w' as any]: `${Math.round(m.fav[k] * 20)}%` }} /></div>
                  </div>
                ))}
              </div>
              <div className="panel-head sub"><h2>Score spread</h2></div>
              <div className="hist" role="img" aria-label="Number of ideas in each score band">
                {m.buckets.map(([label, c]) => (
                  <div key={label}><i style={{ ['--h' as any]: `${Math.round((100 * c) / m.bmax)}%` }} /><b>{c}</b><span>{label}</span></div>
                ))}
              </div>
            </section>
          </div>

          <div className="split">
            <section className="panel">
              <div className="panel-head"><h2>Funding by sector</h2>
                <span className="legend">{isUs ? <><i className="k-in" />United States</> : <><i className="k-in" />India <i className="k-gl" />Global</>}</span>
              </div>
              {!m.secList.length && <p className="muted">No funding rounds yet.</p>}
              <ul className="sectors">
                {m.secList.map(([name, v]) => {
                  const a = v.in || 0, g = v.gl || 0;
                  return (
                    <li key={name}><span className="sn">{name}</span>
                      <span className="sbar" title={isUs ? `United States ${money(a)}` : `India ${money(a)}, Global ${money(g)}`}>
                        <i className="k-in" style={{ ['--w' as any]: `${Math.round((1000 * a) / m.smax) / 10}%` }} />
                        <i className="k-gl" style={{ ['--w' as any]: `${Math.round((1000 * g) / m.smax) / 10}%` }} />
                      </span>
                      <span className="sv">{money(a + g)}</span></li>
                  );
                })}
              </ul>
              <p className="muted small">Based on each company&apos;s latest disclosed round.</p>
            </section>
          </div>

          <section className="panel">
            <div className="panel-head"><h2>Recent updates</h2></div>
            {!m.log.length ? <p className="muted">No updates yet.</p> : (
              <ul className="feed">
                {m.log.slice(0, 10).map((l, idx) => {
                  const nm = m.names[l.idea_slug] ?? l.idea_slug;
                  const what = l.change === 'added' ? 'Added'
                    : l.change === 'rescored' ? 'Re-scored ' + (l.old_score !== null && l.old_score !== undefined ? Math.trunc(l.old_score) + ' to ' : '') + Math.trunc(l.new_score)
                    : l.change === 'retired' ? 'Retired' : 'Edited';
                  return (
                    <li key={idx}><time dateTime={l.logged_on}>{dMon(l.logged_on)}</time>
                      <div><b>{nm}</b><span>{what}{l.note ? ' · ' + l.note : ''}</span></div></li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </Page>
  );
}
