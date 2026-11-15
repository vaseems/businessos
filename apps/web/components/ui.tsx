'use client';
import { useEffect, useRef, type ReactNode } from 'react';

const PATHS: Record<string, ReactNode> = {
  pin: <><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.3" /></>,
  overview: <path d="M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-4H4zM14 8h6V4h-6z" />,
  ideas: <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z" />,
  startups: <path d="M5 19V9l7-5 7 5v10M9 19v-6h6v6" />,
  schemes: <path d="M4 10h16M5 10V20M19 10V20M9 10v10M15 10v10M3 20h18M12 3 3.5 8h17z" />,
  regs: <><path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6z" /><path d="m9 12 2 2 4-4" /></>,
  funding: <path d="M3.5 17.5 9.5 11l4 4 7-8M15 7h5.5v5.5" />,
  opps: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r=".9" /></>,
  directory: <><rect x="4" y="4" width="7" height="7" rx="1.8" /><rect x="13" y="4" width="7" height="7" rx="1.8" /><rect x="4" y="13" width="7" height="7" rx="1.8" /><rect x="13" y="13" width="7" height="7" rx="1.8" /></>,
  users: <><circle cx="9" cy="8.5" r="3.2" /><path d="M3.5 19.5c.4-3.2 2.8-5 5.5-5s5.1 1.8 5.5 5" /><path d="M16 5.6a3 3 0 0 1 0 5.8M17.5 14.8c1.7.5 2.8 2 3 4.2" /></>,
  account: <><circle cx="12" cy="8.5" r="3.6" /><path d="M5 20c.5-3.6 3.3-5.6 7-5.6s6.5 2 7 5.6" /></>,
  jobs: <><rect x="3.5" y="7.5" width="17" height="12" rx="2.5" /><path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5M3.5 13h17" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4-4" /></>,
  refresh: <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />,
  out: <path d="M10 4H5v16h5M15 8l4 4-4 4M19 12H9" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  download: <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />,
};

export function Icon({ name }: { name: string }) {
  return (
    <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}

export function Ring({ score, cls = '' }: { score: number; cls?: string }) {
  const s = Math.max(0, Math.min(100, Math.trunc(Number(score) || 0)));
  return (
    <span className={`ring ${cls}`} role="img" aria-label={`Score ${s} out of 100`}>
      <svg viewBox="0 0 36 36" aria-hidden="true">
        <circle className="rb" cx="18" cy="18" r="15.5" pathLength={100} />
        <circle className="rf" cx="18" cy="18" r="15.5" pathLength={100} strokeDasharray={`${s} 100`} />
      </svg>
      <b>{s}</b>
    </span>
  );
}

export function Glyph({ idea, edge }: { idea: any; edge: string }) {
  const v = (k: string) => Math.trunc(Number(idea[k]) || 0);
  return (
    <span className="glyph" role="img" aria-label={`Critical ${v('critical')}, demand ${v('demand')}, ease ${v('ease')}, ${edge} ${v('india_edge')} out of 5`}>
      {['critical', 'demand', 'ease', 'india_edge'].map((k) => (
        <i key={k} style={{ ['--h' as any]: `${v(k) * 20}%` }} />
      ))}
    </span>
  );
}

/** Number that counts up once on mount (respects reduced motion). */
export function Count({ end, dec = 0, suffix = '' }: { end: number; dec?: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fmt = (v: number) => v.toFixed(dec) + suffix;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = fmt(end); return; }
    let t0: number | null = null, raf = 0;
    const step = (t: number) => {
      if (t0 === null) t0 = t;
      const p = Math.min(1, (t - t0) / 900), e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(end * e);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [end, dec, suffix]);
  return <span ref={ref} className="num">0</span>;
}

export function Notice({ children }: { children: ReactNode }) {
  return <p className="notice">{children}</p>;
}

export function Seg({ label, id, value, options, onChange }: { label: string; id?: string; value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <div className="seg" role="group" aria-label={label} id={id}>
      {options.map(([v, text]) => (
        <button type="button" key={v} aria-pressed={value === v} onClick={() => onChange(v)}>{text}</button>
      ))}
    </div>
  );
}

export function SearchField({ id = 'q', placeholder, value, onChange }: { id?: string; placeholder: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="field search"><Icon name="search" />
      <input id={id} type="search" placeholder={placeholder} aria-label={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function SelectField({ id, label, value, onChange, children }: { id: string; label: string; value: string; onChange: (v: string) => void; children: ReactNode }) {
  return (
    <label className="field select"><select id={id} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>{children}</select></label>
  );
}
