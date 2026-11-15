import { BadRequestException, Body, Controller, HttpCode, Injectable, Post, Req, UseGuards } from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import { AuthGuard, type SessionUser } from './auth';
import { cfg } from './config';
import { parseRegion, type Region } from './region';
import { CATS, catLabel, runSearch, SearchService, tokens, type CatKey, type Doc, type Hit } from './search';

interface Turn { role: 'user' | 'assistant'; text: string }
interface Card { cat: CatKey; label: string; title: string; sub: string; tag: string; href: string }
export interface ChatReply { reply: string; cards: Card[]; suggestions: string[]; mode: 'search' | 'llm' }

const PAGES: Record<string, string> = {
  '/': 'the overview: the ideas ranked today, what drives their scores, funding by sector and the latest updates',
  '/ideas': 'the ranked startup ideas, each scored on how critical, in demand and easy to build it is',
  '/startups': 'startups already building in this space, with sector, stage and funding',
  '/funding': 'recent funding rounds, weekly totals and the most active investors',
  '/opportunities': 'funding programs, grants, accelerators and perks you can apply to, with their deadlines',
  '/directory': 'the directory of funding sources, grouped by type',
  '/jobs': 'roles and skills that are growing or in demand',
  '/schemes': 'government schemes and programs for founders',
  '/regulations': 'regulations that apply to startups, with the actions to take',
  '/history': 'earlier results for every section',
  '/search': 'search results across every section',
};

const SUGGEST = ['Top ideas right now', 'Funding I can apply to now', 'Latest funding rounds', 'DPDP and data protection rules', 'Grants for deeptech'];

const FILLER = /\b(please|show me|find me|find|search for|search|look up|tell me about|tell me|give me|i want|i need|what is|what are|what's|whats|where can i|can you|could you|do you have|any|about|information on|info on|details of)\b/g;

const limit = new Map<string, number[]>();
function throttle(id: string) {
  const now = Date.now();
  const hits = (limit.get(id) || []).filter((t) => now - t < 60_000);
  if (hits.length >= 20) throw new HttpException('Slow down a little and try again in a moment.', 429);
  hits.push(now);
  limit.set(id, hits);
  if (limit.size > 5000) for (const [k, v] of limit) if (!v.some((t) => now - t < 60_000)) limit.delete(k);
}

const card = (d: Doc, region: Region): Card => ({ cat: d.cat, label: catLabel(d.cat, region), title: d.title, sub: d.sub, tag: d.tag, href: d.href });
const names = (xs: Doc[], n = 3) => xs.slice(0, n).map((d) => d.title).join(', ');
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** Picks a spread of results: the best few from each of the leading categories. */
function spread(hits: Hit[], cats = 4, perCat = 2, max = 6): Hit[] {
  const order: CatKey[] = [];
  for (const h of hits) if (!order.includes(h.cat)) order.push(h.cat);
  const out: Hit[] = [];
  for (const c of order.slice(0, cats)) out.push(...hits.filter((h) => h.cat === c).slice(0, perCat));
  return out.slice(0, max);
}

@Injectable()
export class ChatService {
  constructor(private readonly search: SearchService) {}

  async answer(message: string, history: Turn[], page: string, region: Region): Promise<ChatReply> {
    const index = await this.search.index(region);
    const base = await this.retrieve(message, page, region, index);
    if (!cfg.llmKey) return base;
    try {
      const text = await this.llm(message, history, page, base, index, region);
      if (text) return { ...base, reply: text, mode: 'llm' };
    } catch {
      // fall through to the plain answer
    }
    return base;
  }

  /** The answer built from the data alone. Used on its own, and as the grounding for the language model. */
  private async retrieve(message: string, page: string, region: Region, index: Doc[]): Promise<ChatReply> {
    const m = message.toLowerCase().trim();
    const of = (cats: CatKey[]) => index.filter((d) => cats.includes(d.cat));
    const reply = (text: string, docs: Doc[], suggestions: string[] = SUGGEST.slice(0, 3)): ChatReply => ({
      reply: text, cards: docs.slice(0, 6).map((d) => card(d, region)), suggestions, mode: 'search',
    });

    if (/^(hi|hello|hey|yo|good (morning|afternoon|evening))\b|^(help|what can you do|how do you work)\b/.test(m)) {
      return reply('Hi. I can search everything in Groundwork for you: ideas, startups, funding rounds, programs you can apply to, schemes, regulations, and roles and skills. Ask in plain words, or pick one below.', [], SUGGEST);
    }
    if (/\b(this page|current page|where am i|what('s| is) here|what am i looking at)\b/.test(m)) {
      const path = '/' + (page.split('/').filter(Boolean)[0] || '');
      const what = PAGES[path === '/' ? '/' : path];
      return reply(what ? `You are on ${what}.` : 'You are in Groundwork.', [], SUGGEST.slice(0, 3));
    }
    const count = /\bhow many\b.*\b(ideas?|startups?|deals?|rounds?|schemes?|programs?|regulations?|grants?|accelerators?|angels?|vcs?|funds?|roles?|skills?)\b/.exec(m);
    if (count) {
      const w = count[1];
      const map: [RegExp, CatKey[], string][] = [
        [/idea/, ['ideas'], 'idea'], [/startup/, ['startups'], 'startup'], [/deal|round/, ['deals'], 'funding round'],
        [/scheme|program/, ['schemes'], region === 'us' ? 'program' : 'scheme'], [/regulation/, ['regulations'], 'regulation'],
        [/grant/, ['grant'], 'grant'], [/accelerator/, ['cohort'], 'accelerator'], [/angel/, ['angel'], 'angel network'],
        [/vc|fund/, ['vc'], 'venture fund'], [/role/, ['roles'], 'role'], [/skill/, ['skills'], 'skill'],
      ];
      const hit = map.find(([re]) => re.test(w));
      if (hit) {
        const n = of(hit[1]).length;
        return reply(`There ${n === 1 ? 'is' : 'are'} ${plural(n, hit[2])} in this edition.`, of(hit[1]).slice(0, 3));
      }
    }
    if (/\b(top|best|highest|leading|strongest)\b.*\bideas?\b|\bideas?\b.*\b(top|best|highest)\b/.test(m)) {
      const top = of(['ideas']).slice(0, 5);
      return reply(top.length ? `The highest-ranked ideas today are ${names(top, 5)}. Open one to see the problem, the first customers and the risks.` : 'There are no ideas in this edition yet.', top);
    }
    if (/\b(recent|latest|newest|new|last)\b.*\b(deals?|rounds?|funding|raised)\b|\b(who|which).*\braised\b/.test(m) && !/apply/.test(m)) {
      const deals = of(['deals']).slice(0, 5);
      return reply(deals.length ? `The latest funding rounds are ${names(deals, 5)}.` : 'No funding rounds are recorded for this edition yet.', deals, ['Open grants', 'Top ideas right now', 'Accelerators']);
    }
    if (/\b(open|apply|applications?|deadline|deadlines|closing|can i get|raise)\b.*\b(funding|grants?|accelerators?|programs?|cohorts?|angels?|vcs?|funds?|capital|money|perks?)\b|\b(grants?|accelerators?)\b.*\b(open|apply|now)\b/.test(m)) {
      let pool = of(['grant', 'cohort', 'angel', 'vc', 'perk']);
      if (/\bgrants?\b/.test(m)) pool = of(['grant']);
      else if (/\baccelerators?|cohorts?\b/.test(m)) pool = of(['cohort']);
      else if (/\bangels?\b/.test(m)) pool = of(['angel']);
      else if (/\bvcs?|venture\b/.test(m)) pool = of(['vc']);
      const open = pool.filter((d) => d.tag === 'Open' || d.tag === 'Rolling')
        .sort((a, b) => (a.date || '9999') < (b.date || '9999') ? -1 : 1);
      if (open.length) {
        const dated = open.filter((d) => d.date).length;
        return reply(`${plural(open.length, 'option')} ${open.length === 1 ? 'is' : 'are'} open or rolling now${dated ? ', nearest deadline first' : ''}: ${names(open, 4)}.`, open, ['Latest funding rounds', 'Top ideas right now', 'Government schemes']);
      }
    }

    // General search.
    const q = m.replace(FILLER, ' ').replace(/[?!.,]+$/g, '').replace(/\s+/g, ' ').trim() || m;
    const { hits } = runSearch(index, q);
    if (!hits.length) {
      const toks = tokens(q);
      return reply(`I could not find anything for “${q}”. Try fewer or different words${toks.length > 1 ? `, for example “${toks[0]}”` : ''}.`, [], SUGGEST);
    }
    const shown = spread(hits);
    const cats = [...new Set(hits.map((h) => h.cat))];
    const where = cats.slice(0, 3).map((c) => `${hits.filter((h) => h.cat === c).length} in ${catLabel(c, region).toLowerCase()}`).join(', ');
    const partial = hits[0].partial ? ' These match some of your words, not all of them.' : '';
    return reply(`I found ${plural(hits.length, 'result')} for “${q}”: ${where}${cats.length > 3 ? ' and more' : ''}.${partial}`, shown, [`See all results for ${q}`, ...SUGGEST.slice(0, 2)]);
  }

  private async llm(message: string, history: Turn[], page: string, base: ChatReply, index: Doc[], region: Region): Promise<string> {
    const { hits } = runSearch(index, message.replace(FILLER, ' '));
    const ctx = [...base.cards.map((c) => `${c.label}: ${c.title} (${c.tag}) ${c.sub}`), ...spread(hits, 5, 2, 10).map((h) => `${catLabel(h.cat, region)}: ${h.title} (${h.tag}) ${h.sub}`)]
      .filter((v, i, a) => a.indexOf(v) === i).slice(0, 14);
    const system = [
      'You are the assistant inside Groundwork, a startup-intelligence dashboard (ideas, startups, funding rounds, programs to apply to, government schemes, regulations, jobs and skills).',
      `The edition is ${region === 'us' ? 'United States' : 'India'}. The person is on the ${page || '/'} page.`,
      'Answer in two to four short sentences using only the context below. If the context does not answer the question, say so plainly and suggest what to search for. Do not invent names, amounts, dates or links.',
      'Context:\n' + (ctx.length ? ctx.join('\n') : '(nothing matched)'),
    ].join('\n');
    const turns = [...history.slice(-6), { role: 'user' as const, text: message }].map((t) => ({ role: t.role, content: t.text }));
    const signal = AbortSignal.timeout(20_000);
    if (cfg.llmProvider === 'openai') {
      const res = await fetch(`${cfg.llmBaseUrl || 'https://api.openai.com/v1'}/chat/completions`, {
        method: 'POST', signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.llmKey}` },
        body: JSON.stringify({ model: cfg.llmModel || 'gpt-4o-mini', max_tokens: 400, messages: [{ role: 'system', content: system }, ...turns] }),
      });
      if (!res.ok) throw new Error('llm ' + res.status);
      const j: any = await res.json();
      return String(j?.choices?.[0]?.message?.content ?? '').trim().slice(0, 1200);
    }
    const res = await fetch(`${cfg.llmBaseUrl || 'https://api.anthropic.com'}/v1/messages`, {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', 'x-api-key': cfg.llmKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: cfg.llmModel || 'claude-haiku-5-5', max_tokens: 400, system, messages: turns }),
    });
    if (!res.ok) throw new Error('llm ' + res.status);
    const j: any = await res.json();
    return String((j?.content || []).filter((b: any) => b?.type === 'text').map((b: any) => b.text).join('')).trim().slice(0, 1200);
  }
}

@UseGuards(AuthGuard)
@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Post()
  @HttpCode(200)
  async post(@Body() body: { message?: string; history?: Turn[]; page?: string; region?: string }, @Req() req: any) {
    const message = typeof body?.message === 'string' ? body.message.trim() : '';
    if (!message) throw new BadRequestException('Type a question first');
    if (message.length > 500) throw new BadRequestException('Keep it under 500 characters');
    throttle((req.user as SessionUser).id);
    const history: Turn[] = (Array.isArray(body?.history) ? body.history : [])
      .filter((t) => t && (t.role === 'user' || t.role === 'assistant') && typeof t.text === 'string')
      .slice(-8).map((t) => ({ role: t.role, text: t.text.slice(0, 600) }));
    const page = typeof body?.page === 'string' ? body.page.slice(0, 60) : '/';
    return this.chat.answer(message, history, page, parseRegion(body?.region));
  }
}
