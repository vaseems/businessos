import { Controller, Get, Injectable, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from './auth';
import { DataService } from './data.service';
import { parseRegion, type Region } from './region';

type Json = Record<string, any>;

export type CatKey = 'ideas' | 'startups' | 'deals' | 'angel' | 'vc' | 'cohort' | 'grant' | 'perk' | 'schemes' | 'regulations' | 'roles' | 'skills';

/** Results are grouped into five lanes, each holding the categories that belong together. */
export const GROUPS: { key: string; label: string; blurb: string }[] = [
  { key: 'build', label: 'Build', blurb: 'What to start' },
  { key: 'market', label: 'Market', blurb: 'Who is already doing it' },
  { key: 'capital', label: 'Capital', blurb: 'Who can fund you' },
  { key: 'policy', label: 'Policy', blurb: 'Rules and schemes' },
  { key: 'careers', label: 'Careers', blurb: 'Roles and skills' },
];

export const CATS: Record<CatKey, { label: string; group: string }> = {
  ideas: { label: 'Ideas', group: 'build' },
  startups: { label: 'Startups', group: 'market' },
  deals: { label: 'Funding rounds', group: 'market' },
  angel: { label: 'Angel networks', group: 'capital' },
  vc: { label: 'Venture funds', group: 'capital' },
  cohort: { label: 'Accelerators', group: 'capital' },
  grant: { label: 'Grants', group: 'capital' },
  perk: { label: 'Perks and credits', group: 'capital' },
  schemes: { label: 'Schemes', group: 'policy' },
  regulations: { label: 'Regulations', group: 'policy' },
  roles: { label: 'Roles', group: 'careers' },
  skills: { label: 'Skills', group: 'careers' },
};

export interface Doc {
  id: string;
  cat: CatKey;
  title: string;
  sub: string;
  tag: string;
  date: string;
  href: string;
  /** lower-cased, accent-free title and body used for matching */
  t: string;
  hay: string;
  boost: number;
}

export interface Hit extends Doc { score: number; partial: boolean }

const fold = (v: unknown) =>
  String(v ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
const join = (...v: unknown[]) => v.map((x) => (Array.isArray(x) ? x.join(' ') : x ?? '')).join(' ');
const clip = (v: unknown, n = 140) => {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
};
const dot = (...v: unknown[]) => v.map((x) => String(x ?? '').trim()).filter(Boolean).join(' · ');
const jslug = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const money = (m: unknown) => (m === null || m === undefined || m === '' ? '' : `$${Number(m)}M`);

function doc(cat: CatKey, id: string, title: string, sub: string, tag: string, date: string, href: string, body: unknown, boost = 0): Doc {
  return { id: cat + ':' + id, cat, title, sub: clip(sub), tag, date, href, t: fold(title), hay: fold(title + ' ' + body), boost };
}

const STATUS: Record<string, string> = {
  open: 'Open', rolling: 'Rolling', upcoming: 'Upcoming', between: 'Between cohorts', closed: 'Closed', indirect: 'Indirect',
  active: 'Active', new: 'New', revamped: 'Revamped', closing: 'Closing',
  in_force: 'In force', phased: 'Phased', partly_in_force: 'Partly in force', pending_rules: 'Rules pending', draft: 'Draft', guidance: 'Guidance',
};

export const catLabel = (k: CatKey, region: Region) => (k === 'schemes' && region === 'us' ? 'Programs' : CATS[k].label);

export function buildIndex(d: { data: Json; funding: Json; opportunities: Json; policy: Json; jobs: Json }): Doc[] {
  const out: Doc[] = [];
  for (const i of d.data.ideas || []) {
    out.push(doc('ideas', i.slug, i.name, i.india_angle || i.problem, `Score ${Math.trunc(i.score ?? 0)}`, '', `/ideas/#${i.slug}`,
      join(i.india_angle, i.problem, i.solution, i.first_customers, i.rough_mvp, i.main_risk), Number(i.score ?? 0) / 50));
  }
  for (const s of d.data.startups || []) {
    out.push(doc('startups', s.slug, s.name, s.one_liner, s.stage || '', '', `/startups/#${s.slug}`,
      join(s.one_liner, s.sector, s.sub_sector, s.hq_city, s.hq_country, s.founders, s.product_summary, s.problem_solved, s.business_type, s.last_round_investors)));
  }
  for (const x of d.funding.deals || []) {
    out.push(doc('deals', x.slug, x.company, dot(money(x.amount_usd_m), x.stage, x.sector, x.hq_city), x.stage || '', x.announced_on || '', `/funding/#${x.slug}`,
      join(x.sector, x.subsector, x.model, x.stage, x.investors, x.lead_investors, x.hq_city, x.hq_state, x.round_label)));
  }
  for (const s of d.opportunities.sources || []) {
    const cat = (['angel', 'vc', 'cohort', 'grant', 'perk'].includes(s.kind) ? s.kind : 'perk') as CatKey;
    out.push(doc(cat, s.slug, s.name, dot(s.org, s.summary), STATUS[s.status] || s.status || '', s.deadline || '', `/opportunities/#${s.slug}`,
      join(s.org, s.summary, s.sectors, s.stages, s.geography, s.hq_city, s.hq_state, s.cheque_text, s.how_to_apply, s.equity_note)));
  }
  for (const s of d.policy.schemes || []) {
    out.push(doc('schemes', s.slug, s.name, dot(s.ministry, s.highlight), STATUS[s.status] || s.status || '', '', `/schemes/#${s.slug}`,
      join(s.ministry, s.category, s.audience, s.highlight, s.benefit, s.eligibility, s.state, s.level)));
  }
  for (const r of d.policy.regulations || []) {
    out.push(doc('regulations', r.slug, r.name, dot(r.short_name, r.regulator, r.summary), STATUS[r.status] || r.status || '', '', `/regulations/#${r.slug}`,
      join(r.short_name, r.regulator, r.category, r.summary, r.applies_to, r.key_obligations, r.startup_actions, r.penalties)));
  }
  const withSkills = new Set<string>((d.jobs.role_skills || []).map((x: Json) => x.role));
  const seenRole = new Set<string>();
  for (const f of d.jobs.future || []) {
    if (seenRole.has(f.role)) continue;
    seenRole.add(f.role);
    const falling = f.outlook === 'declining' || f.outlook === 'largest_net_decline';
    out.push(doc('roles', jslug(f.role), f.role, dot(falling ? 'Declining role' : 'Growing role', f.horizon, f.note), falling ? 'Declining' : 'Growing', f.as_of || '',
      `/jobs/#${jslug(f.role)}`, join(f.role, f.note, f.horizon, f.region)));
  }
  for (const h of d.jobs.hot || []) {
    if (seenRole.has(h.role)) continue;
    seenRole.add(h.role);
    out.push(doc('roles', jslug(h.role + '-' + h.region), h.role, dot('In demand now', h.signal, h.note), 'In demand', h.as_of || '',
      withSkills.has(h.role) ? `/jobs/#${jslug(h.role + '-' + h.region)}` : '/jobs/', join(h.role, h.signal, h.note, h.region)));
  }
  const seenSkill = new Set<string>();
  for (const k of d.jobs.skills || []) {
    const key = k.skill + '|' + k.category;
    if (seenSkill.has(key)) continue;
    seenSkill.add(key);
    out.push(doc('skills', jslug(key), k.skill, dot(String(k.category).replace(/_/g, ' '), k.note), String(k.category).replace(/_/g, ' '), k.as_of || '', '/jobs/', join(k.skill, k.category, k.note, k.region)));
  }
  return out;
}

const STOP = new Set(['the', 'a', 'an', 'for', 'of', 'in', 'to', 'and', 'with', 'me', 'my', 'is', 'are', 'on', 'any', 'some', 'about']);

export function tokens(q: string): string[] {
  const all = [...new Set(fold(q).split(/[^a-z0-9+#.]+/).map((w) => w.replace(/^\.+|\.+$/g, '')).filter(Boolean))];
  const keep = all.filter((w) => !STOP.has(w));
  return (keep.length ? keep : all).slice(0, 8);
}

/** Scores one document against the query tokens. Returns 0 when it does not match. */
function score(d: Doc, toks: string[], phrase: string, anyMode: boolean): number {
  let s = 0, hit = 0;
  for (const w of toks) {
    let w1 = 0;
    if (d.t === w) w1 = 12;
    else if (d.t.startsWith(w)) w1 = 8;
    else if (new RegExp('(^|[^a-z0-9])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(d.t)) w1 = 6;
    else if (d.t.includes(w)) w1 = 3;
    else if (d.hay.includes(w)) w1 = 1;
    if (w1) hit++;
    s += w1;
  }
  if (!hit || (!anyMode && hit < toks.length)) return 0;
  if (d.t === phrase) s += 20;
  else if (d.t.startsWith(phrase)) s += 8;
  else if (toks.length > 1 && d.hay.includes(phrase)) s += 5;
  return s + d.boost;
}

export function runSearch(index: Doc[], q: string): { hits: Hit[]; toks: string[] } {
  const toks = tokens(q);
  if (!toks.length) return { hits: [], toks };
  const phrase = fold(q).trim();
  let hits: Hit[] = [];
  for (const d of index) {
    const s = score(d, toks, phrase, false);
    if (s) hits.push({ ...d, score: s, partial: false });
  }
  // Too few exact matches: also offer documents that match some of the words.
  if (hits.length < 3 && toks.length > 1) {
    const have = new Set(hits.map((h) => h.id));
    for (const d of index) {
      if (have.has(d.id)) continue;
      const s = score(d, toks, phrase, true);
      if (s) hits.push({ ...d, score: s * 0.4, partial: true });
    }
  }
  hits.sort((a, b) => b.score - a.score || (a.title < b.title ? -1 : 1));
  return { hits, toks };
}

@Injectable()
export class SearchService {
  private cache = new Map<Region, { at: number; docs: Doc[] }>();
  constructor(private readonly svc: DataService) {}

  async index(region: Region): Promise<Doc[]> {
    const hit = this.cache.get(region);
    if (hit && Date.now() - hit.at < 60_000) return hit.docs;
    const [data, funding, opportunities, policy, jobs] = await Promise.all([
      this.svc.data(region), this.svc.funding(region), this.svc.opportunities(region), this.svc.policy(region), this.svc.jobs(region),
    ]);
    const docs = buildIndex({ data, funding, opportunities, policy, jobs });
    this.cache.set(region, { at: Date.now(), docs });
    return docs;
  }

  async search(q: string, region: Region, opts: { per?: number; cat?: string; offset?: number } = {}) {
    const t0 = Date.now();
    const index = await this.index(region);
    const { hits, toks } = runSearch(index, q);
    const per = Math.max(1, Math.min(50, opts.per ?? 5));
    const by = new Map<CatKey, Hit[]>();
    for (const h of hits) { if (!by.has(h.cat)) by.set(h.cat, []); by.get(h.cat)!.push(h); }
    const cats = (Object.keys(CATS) as CatKey[]).map((k) => ({
      key: k, label: catLabel(k, region), group: CATS[k].group, count: by.get(k)?.length ?? 0,
      best: by.get(k)?.[0]?.score ?? 0,
    }));
    const groups = GROUPS.map((g) => ({ ...g, count: cats.filter((c) => c.group === g.key).reduce((a, c) => a + c.count, 0) }));
    const only = opts.cat && opts.cat in CATS ? (opts.cat as CatKey) : null;
    const results: Record<string, Hit[]> = {};
    for (const c of cats) {
      if (!c.count || (only && c.key !== only)) continue;
      const list = by.get(c.key)!;
      results[c.key] = only ? list.slice(opts.offset ?? 0, (opts.offset ?? 0) + per) : list.slice(0, per);
    }
    return {
      q, tokens: toks, total: hits.length, ms: Date.now() - t0,
      top: hits[0] ? strip(hits[0]) : null,
      groups, cats, results: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, v.map(strip)])),
    };
  }
}

const strip = (h: Hit) => ({ id: h.id, cat: h.cat, title: h.title, sub: h.sub, tag: h.tag, date: h.date, href: h.href, partial: h.partial });

@UseGuards(AuthGuard)
@Controller('search')
export class SearchController {
  constructor(private readonly s: SearchService) {}

  @Get()
  async get(@Query() q: Record<string, string>) {
    const text = typeof q.q === 'string' ? q.q.trim().slice(0, 100) : '';
    const region = parseRegion(q.region);
    if (text.length < 2) return { q: text, tokens: [], total: 0, ms: 0, top: null, groups: GROUPS.map((g) => ({ ...g, count: 0 })), cats: [], results: {} };
    const per = Number.parseInt(q.per, 10);
    const off = Number.parseInt(q.offset, 10);
    return this.s.search(text, region, { per: Number.isFinite(per) ? per : 5, cat: q.cat, offset: Number.isFinite(off) && off > 0 ? off : 0 });
  }
}
