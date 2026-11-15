'use client';
import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { HistoryTable, SECTIONS, SECTION_ORDER } from '@/components/History';
import { useApp } from '@/components/AppContext';
import type { HistorySection } from '@/lib/api';

export default function History() {
  const { region } = useApp();
  const [section, setSection] = useState<HistorySection>('funding');

  useEffect(() => {
    const s = new URLSearchParams(location.search).get('s') as HistorySection | null;
    if (s && SECTIONS[s]) setSection(s);
  }, []);
  const pick = (s: HistorySection) => {
    setSection(s);
    try { history.replaceState(null, '', `/history/?s=${s}`); } catch { /* ignore */ }
  };

  return (
    <Shell title="History">
      <section className="panel hist-page">
        <div className="panel-head"><h2>Previous results</h2></div>
        <p className="muted small">Everything Groundwork has stored, newest first. The other pages show recent results; this is where the earlier ones are, including closed, retired and changed items.</p>
        <div className="hist-tabs" role="tablist" aria-label="Section">
          {SECTION_ORDER.map((s) => (
            <button type="button" role="tab" key={s} aria-selected={section === s} className="hist-tab" onClick={() => pick(s)}>
              {s === 'schemes' && region === 'us' ? SECTIONS[s].usLabel : SECTIONS[s].label}
            </button>
          ))}
        </div>
        <HistoryTable key={section} section={section} bare />
      </section>
    </Shell>
  );
}
