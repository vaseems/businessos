'use client';
import { useMemo, useRef, useState } from 'react';
import type { MarketItem } from '@/lib/api';
import type { RegionCode } from '@/lib/region';
import { dFull, dMon } from '@/lib/format';

export type Period = '1d' | '1w' | '1m' | '3m' | '6m' | '1y';
/** [key, label, calendar days shown on the trend line]. 1D shows a short run-up so the line has something to draw. */
export const PERIODS: [Period, string, number][] = [['1d', '1D', 14], ['1w', '1W', 7], ['1m', '1M', 30], ['3m', '3M', 91], ['6m', '6M', 182], ['1y', '1Y', 366]];
export const PERIOD_NAME: Record<Period, string> = { '1d': 'day', '1w': 'week', '1m': 'month', '3m': '3 months', '6m': '6 months', '1y': 'year' };

const loc = (r: RegionCode) => (r === 'us' ? 'en-US' : 'en-IN');
export const level = (n: number | null | undefined, r: RegionCode, dec = 2) =>
  n === null || n === undefined ? '—' : n.toLocaleString(loc(r), { minimumFractionDigits: dec, maximumFractionDigits: dec });
export const price = (n: number | null | undefined, r: RegionCode) => (n === null || n === undefined ? '—' : (r === 'us' ? '$' : '₹') + level(n, r));
export const pctText = (v: number | null | undefined, dec = 2) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(dec)}%`);
export const crore = (n: number | null | undefined, r: RegionCode) => (n === null || n === undefined ? '—' : r === 'us' ? '$' + level(n / 1000, r, 1) + 'B' : '₹' + level(n, r, n >= 100 ? 0 : 1) + ' Cr');
export const dirOf = (v: number | null | undefined) => (v === null || v === undefined || Math.abs(v) < 0.005 ? 'flat' : v > 0 ? 'up' : 'down');

/** Signed change with an arrow, so direction never relies on colour alone. */
export function Delta({ v, dec = 2, bare = false }: { v: number | null | undefined; dec?: number; bare?: boolean }) {
  const d = dirOf(v);
  return <span className={`mk-d ${d}`} title={d === 'flat' ? 'Unchanged' : d === 'up' ? 'Up' : 'Down'}>{!bare && <i aria-hidden="true">{d === 'up' ? '▲' : d === 'down' ? '▼' : '•'}</i>}{pctText(v, dec)}</span>;
}

const parse = (s: string) => new Date(s + 'T00:00:00Z').getTime();

/** The part of an item's price history inside the period window, ending at its latest date. */
export function windowOf(it: MarketItem, p: Period): { c: number[]; d: string[] } {
  const c = it.c || [], d = it.d || [];
  if (c.length < 2) return { c, d };
  const days = PERIODS.find((x) => x[0] === p)![2];
  const cut = parse(d[d.length - 1]) - days * 86400000;
  let i = d.findIndex((x) => parse(x) >= cut);
  if (i < 0 || i > c.length - 2) i = Math.max(0, c.length - 2);
  return { c: c.slice(i), d: d.slice(i) };
}
/** Percent change over the period; the 1D figure is the last session's move. */
export function changeOf(it: MarketItem, p: Period): number | null {
  if (p === '1d') return it.changePct;
  const v = it.chg?.[p];
  if (v !== undefined && v !== null) return v;
  const w = windowOf(it, p);
  return w.c.length > 1 && w.c[0] ? Math.round((w.c[w.c.length - 1] / w.c[0] - 1) * 10000) / 100 : null;
}

function pathFor(c: number[], w: number, h: number, pad = 2) {
  const lo = Math.min(...c), hi = Math.max(...c), span = hi - lo || 1;
  const pts = c.map((v, i) => [(i / (c.length - 1)) * w, pad + (1 - (v - lo) / span) * (h - pad * 2)]);
  return { pts, line: pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ') };
}

/** Small trend line. Direction comes from first vs last point. */
export function Spark({ c, h = 38, dir }: { c: number[]; h?: number; dir?: 'up' | 'down' | 'flat' }) {
  if (!c || c.length < 2) return <div className="mk-spark" style={{ height: h }} aria-hidden="true" />;
  const w = 100;
  const { line } = pathFor(c, w, h);
  const d = dir || dirOf(c[c.length - 1] - c[0]);
  return (
    <svg className={`mk-spark ${d}`} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ height: h }} aria-hidden="true">
      <path className="area" d={`${line} L${w} ${h} L0 ${h} Z`} />
      <path className="ln" d={line} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Larger chart with a hover / touch read-out. */
export function BigChart({ it, p, region }: { it: MarketItem; p: Period; region: RegionCode }) {
  const { c, d } = useMemo(() => windowOf(it, p), [it, p]);
  const [at, setAt] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const W = 640, H = 220, PX = 8;
  if (c.length < 2) return <p className="muted small">Not enough history to draw this yet.</p>;
  const lo = Math.min(...c), hi = Math.max(...c), span = hi - lo || 1;
  const x = (i: number) => PX + (i / (c.length - 1)) * (W - PX * 2);
  const y = (v: number) => 12 + (1 - (v - lo) / span) * (H - 36);
  const line = c.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const dir = dirOf(c[c.length - 1] - c[0]);
  const i = at ?? c.length - 1;
  const move = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    setAt(Math.round(f * (c.length - 1)));
  };
  return (
    <div className="mk-big">
      <div className="mk-read" aria-live="polite">
        <b>{level(c[i], region)}</b>
        <span className="muted small">{dFull(d[i])}</span>
        {i > 0 && <Delta v={Math.round((c[i] / c[i - 1] - 1) * 10000) / 100} />}
      </div>
      <svg ref={ref} className={`mk-bigsvg ${dir}`} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img"
        aria-label={`${it.name} price history, ${dMon(d[0])} to ${dMon(d[d.length - 1])}, from ${level(c[0], region)} to ${level(c[c.length - 1], region)}`}
        onPointerMove={move} onPointerDown={move} onPointerLeave={() => setAt(null)}>
        <path className="area" d={`${line} L${x(c.length - 1)} ${H - 22} L${x(0)} ${H - 22} Z`} />
        <path className="ln" d={line} vectorEffect="non-scaling-stroke" />
        {at !== null && <line className="cross" x1={x(at)} x2={x(at)} y1="8" y2={H - 22} vectorEffect="non-scaling-stroke" />}
        <circle className="dot" cx={x(i)} cy={y(c[i])} r="4.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mk-axis small muted"><span>{dMon(d[0])}</span><span>Low {level(lo, region)} · High {level(hi, region)}</span><span>{dMon(d[d.length - 1])}</span></div>
    </div>
  );
}

/** Heat map tile colour: intensity grows with the size of the move, capped so one outlier doesn't wash out the rest. */
export function heatStyle(v: number | null, scale: number): React.CSSProperties {
  if (v === null || Math.abs(v) < 0.005) return { background: 'var(--pane-hi)' };
  const k = Math.min(1, Math.abs(v) / scale);
  const col = v > 0 ? 'var(--good)' : 'var(--bad)';
  return { background: `color-mix(in srgb, ${col} ${Math.round(14 + k * 52)}%, var(--pane-hi))` };
}
