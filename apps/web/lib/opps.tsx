import type { ReactNode } from 'react';
import { dFull, has, s, safeUrl } from '@/lib/format';
import { stateSlug, type RegionCfg } from '@/lib/region';

/** Shared by the Opportunities list and the Directory so both describe a source the same way. */
export const KINDS: [string, string][] = [['cohort', 'Cohorts and accelerators'], ['vc', 'VC funds'], ['angel', 'Angel networks'], ['grant', 'Grants and government'], ['perk', 'Credits and perks']];
export const KIND_LABEL: Record<string, string> = Object.fromEntries(KINDS);
export const KIND_ONE: Record<string, string> = { cohort: 'Cohort or accelerator', vc: 'VC fund', angel: 'Angel network', grant: 'Grant or government scheme', perk: 'Credits and perks' };
export const STAGE_LABELS: Record<string, string> = { idea: 'Idea', 'pre-seed': 'Pre-seed', seed: 'Seed', 'series-a': 'Series A', growth: 'Growth' };
export const STATUS_LABEL: Record<string, string> = { open: 'Open', rolling: 'Rolling', upcoming: 'Next call due', between: 'Between intakes', closed: 'Closed', indirect: 'Via funds' };
export const STATUS_HELP: Record<string, string> = {
  open: 'Taking applications now.',
  rolling: 'No fixed window. You can approach them at any time.',
  upcoming: 'The next call is expected but has not opened yet.',
  between: 'The last intake has ended and the next one has not been announced.',
  closed: 'The latest intake has closed.',
  indirect: 'Money goes through funds or intermediaries, so founders do not apply directly.',
};
export const CONF: Record<string, string> = {
  high: 'Checked against an official page.',
  medium: 'Based on reputable reports and third-party listings. Confirm on the official page before you apply.',
  low: 'Limited or conflicting sources. Treat this as a lead and verify it yourself.',
};
export const RANK: Record<string, number> = { open: 0, rolling: 1, upcoming: 2, between: 3, indirect: 4, closed: 5 };
export const KIND_RANK: Record<string, number> = Object.fromEntries(KINDS.map(([k], i) => [k, i]));
export const dayMs = 86400000;
export const when = (n: number) => (n <= 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`);
export const cmp = (a: any, b: any) => (a < b ? -1 : a > b ? 1 : 0);
export const trimSet = (v: string) => v.replace(/^[, ]+|[, ]+$/g, '');

export const stageText = (x: any) => {
  const st = (x.stages || []).filter((v: string) => STAGE_LABELS[v]);
  return st.length ? st.map((v: string) => STAGE_LABELS[v]).join(', ') : 'Not a direct route';
};

/** The state a state-only program is limited to, as a slug ('' when it is open to everyone). */
export const stSlugOf = (x: any) => (has(x.state_only) && has(x.hq_state) ? stateSlug(s(x.hq_state)) : '');

/** Detail view shown in the sheet for one source. */
export function sheetBody(x: any, rc: RegionCfg, line: string): ReactNode {
  const apply = safeUrl(x.apply_url), source = safeUrl(x.source_url);
  return (
    <>
      <p className="sheet-lead">{s(x.summary)}</p>
      <dl className="facts">
        <div><dt>Type</dt><dd>{KIND_ONE[x.kind] ?? ''}{has(x.org) ? ' · ' + x.org : ''}</dd></div>
        <div><dt>Status</dt><dd><b>{STATUS_LABEL[x._st]}</b>{line ? ' · ' + line : ''}. {STATUS_HELP[x._st] ?? ''}{has(x.window_note) ? ' ' + x.window_note : ''}</dd></div>
        <div><dt>Stage</dt><dd>{stageText(x)}</dd></div>
        {has(x.sectors) && <div><dt>Sectors</dt><dd>{x.sectors}</dd></div>}
        {has(x.cheque_text) && <div><dt>{rc.code === 'us' ? 'Check size or value' : 'Cheque or value'}</dt><dd>{x.cheque_text}</dd></div>}
        {has(x.equity_note) && <div><dt>Terms</dt><dd>{x.equity_note}</dd></div>}
        <div><dt>Where</dt><dd>{s(x.geography ?? rc.name)}{stSlugOf(x) ? ' · only for startups in ' + s(x.hq_state) : ''}</dd></div>
        {(has(x.hq_city) || has(x.hq_state)) && <div><dt>Based in</dt><dd>{trimSet(s(x.hq_city) + ', ' + s(x.hq_state))}</dd></div>}
        {has(x.how_to_apply)
          ? <div><dt>How to apply</dt><dd>{x.how_to_apply}{apply && <> <a href={apply} target="_blank" rel="noopener noreferrer">Official page</a></>}</dd></div>
          : apply ? <div><dt>Official page</dt><dd><a href={apply} target="_blank" rel="noopener noreferrer">{apply}</a></dd></div> : null}
        {source && <div><dt>Source</dt><dd><a href={source} target="_blank" rel="noopener noreferrer">{x.source_name ?? 'Source'}</a></dd></div>}
        <div><dt>Confidence</dt><dd>{CONF[x.confidence ?? 'medium'] ?? ''}{has(x.checked_on) ? ` Last checked ${dFull(x.checked_on)}.` : ''}</dd></div>
      </dl>
    </>
  );
}

/** Hosts that are directories or social sites, not the organisation's own site. They give a useless logo. */
const NOT_ORG_HOSTS = /(^|\.)(startupgrantsindia\.com|linkedin\.com|lnkd\.in|facebook\.com|twitter\.com|x\.com|instagram\.com|youtube\.com|yourstory\.com|inc42\.com|crunchbase\.com|cbinsights\.com|tracxn\.com|medium\.com)$/i;

/** The organisation's own site host, for fetching its logo. '' when we do not know it. */
export function orgHost(x: any): string {
  for (const u of [x.website, x.apply_url]) {
    const url = safeUrl(u);
    if (!url) continue;
    try {
      const h = new URL(url).hostname.replace(/^www\./, '');
      if (h && !NOT_ORG_HOSTS.test(h)) return h;
    } catch { /* ignore */ }
  }
  return '';
}

/** Website to link to from a card ('' when none is known). */
export function orgSite(x: any): string {
  const host = orgHost(x);
  return host ? safeUrl(x.website) || safeUrl(x.apply_url) : '';
}

/** Two-letter monogram from a name. */
export function monogram(name: string): string {
  const words = s(name).trim().split(/[\s.()]+/).filter(Boolean);
  if (!words.length) return '?';
  return (words.length > 1 ? [...words[0]][0] + [...words[1]][0] : [...words[0]].slice(0, 2).join('')).toUpperCase();
}

/** Adds the computed status (a passed deadline means closed) and a safe stages array. */
export function prepareSources(raw: any[], daysTo: (d: string) => number): any[] {
  return (raw || []).filter((x: any) => has(x.slug) && has(x.name)).map((x: any) => {
    let st = String(x.status);
    if (st === 'open' && has(x.deadline) && daysTo(x.deadline) < 0) st = 'closed'; // a passed deadline means closed, whatever is stored
    return { ...x, _st: st, stages: Array.isArray(x.stages) ? x.stages : [] };
  });
}
