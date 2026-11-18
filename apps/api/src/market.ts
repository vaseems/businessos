import {
  BadRequestException, Body, ConflictException, Controller, Delete, Get, Injectable, Param, Post, Query, Req, ServiceUnavailableException, UseGuards,
} from '@nestjs/common';
import { AuthGuard } from './auth';
import { cfg } from './config';
import { Region, parseRegion } from './region';
import { rpc } from './rpc';

type Json = Record<string, any>;

/** Trading hours per exchange. Times are local to `tz`. */
const EXCH: Record<Region, { name: string; tz: string; zone: string; open: number; close: number; sessionLabel: string }> = {
  in: { name: 'NSE / BSE', tz: 'Asia/Kolkata', zone: 'IST', open: 9 * 60 + 15, close: 15 * 60 + 30, sessionLabel: '09:15 – 15:30 IST' },
  us: { name: 'NYSE / Nasdaq', tz: 'America/New_York', zone: 'ET', open: 9 * 60 + 30, close: 16 * 60, sessionLabel: '09:30 – 16:00 ET' },
};

const SYMBOL = /^[A-Za-z0-9&._-]{1,20}$/;

function localNow(tz: string, at = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' })
      .formatToParts(at).map((x) => [x.type, x.value]),
  );
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute), weekday: String(p.weekday) };
}
const addDay = (iso: string, n: number) => {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const isWeekend = (iso: string) => [0, 6].includes(new Date(iso + 'T00:00:00Z').getUTCDay());
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Market state from the exchange calendar and clock. `holidays` is the list the database holds (empty when unknown). */
export function marketStatus(region: Region, holidays: { day: string; description: string }[], at = new Date(), asOf: string | null = null) {
  const x = EXCH[region];
  const now = localNow(x.tz, at);
  const hol = new Map((holidays || []).map((h) => [String(h.day).slice(0, 10), h.description]));
  const trading = (d: string) => !isWeekend(d) && !hol.has(d);
  const base = { exchange: x.name, session: x.sessionLabel, zone: x.zone, holidaysKnown: hol.size > 0 || region === 'in' };

  let state: 'open' | 'closed'; let reason: string;
  if (isWeekend(now.date)) { state = 'closed'; reason = 'Weekend'; }
  else if (hol.has(now.date)) { state = 'closed'; reason = `Holiday: ${hol.get(now.date)}`; }
  else if (now.minutes < x.open) { state = 'closed'; reason = 'Opens later today'; }
  else if (now.minutes >= x.close) { state = 'closed'; reason = 'Closed for the day'; }
  else { state = 'open'; reason = 'Trading now'; }

  // next open
  let d = now.date;
  if (!(trading(d) && now.minutes < x.open)) { do { d = addDay(d, 1); } while (!trading(d)); }
  const nextOpen = { date: d, time: hhmm(x.open), zone: x.zone };

  // the latest session whose closing data should already have been published (the ingest runs ~4h after the close)
  let due = now.date;
  if (!(trading(due) && now.minutes >= x.close + 240)) { do { due = addDay(due, -1); } while (!trading(due)); }
  const stale = asOf ? String(asOf).slice(0, 10) < due : false;

  const upcoming = [...hol].filter(([day]) => day >= now.date).sort(([a], [b]) => a.localeCompare(b))[0];
  return { ...base, state, reason, nextOpen, nextHoliday: upcoming ? { day: upcoming[0], description: upcoming[1] } : null, expectedSession: due, stale };
}

@Injectable()
export class MarketService {
  private cache = new Map<string, { at: number; data: Json }>();
  private inflight = new Map<string, Promise<Json>>();

  async overview(region: Region): Promise<Json> {
    const hit = this.cache.get(region);
    if (hit && Date.now() - hit.at < Math.min(cfg.cacheTtl, 300) * 1000) return hit.data;
    let p = this.inflight.get(region);
    if (!p) {
      p = rpc<Json>('app_market_overview', { p_region: region })
        .then((d) => { this.cache.set(region, { at: Date.now(), data: d }); return d; })
        .catch((e) => { if (hit) return hit.data; throw e; }) // stale copy beats an error
        .finally(() => this.inflight.delete(region));
      this.inflight.set(region, p);
    }
    return p;
  }
}

const sym = (v: unknown) => {
  const s = String(v ?? '').trim().toUpperCase();
  if (!SYMBOL.test(s)) throw new BadRequestException('Bad symbol');
  return s;
};

@UseGuards(AuthGuard)
@Controller('market')
export class MarketController {
  constructor(private readonly m: MarketService) {}

  @Get()
  async overview(@Query('region') r: string) {
    const region = parseRegion(r);
    let d: Json;
    try { d = await this.m.overview(region); } catch { throw new ServiceUnavailableException('Market data is not available right now. Try again.'); }
    const { holidays, sectors, ...rest } = d || {};
    // the heat map only needs the period changes, not each sector's price history
    const slim = (sectors || []).map(({ c, d: _d, ...x }: Json) => x);
    return { ...rest, sectors: slim, region, holidays: holidays || [], status: marketStatus(region, holidays || [], new Date(), d?.asOf ?? null), empty: !d?.asOf };
  }

  @Get('movers')
  async movers(@Query('region') r: string, @Query('universe') u: string, @Query('limit') l: string) {
    const region = parseRegion(r);
    const universe = u === 'all' ? 'all' : 'nifty500';
    const limit = Math.max(1, Math.min(50, Number.parseInt(l, 10) || 10));
    try { return await rpc('app_market_movers', { p_region: region, p_universe: universe, p_limit: limit }); }
    catch { throw new ServiceUnavailableException('Could not load movers. Try again.'); }
  }

  @Get('search')
  async search(@Query('region') r: string, @Query('q') q: string) {
    const text = typeof q === 'string' ? q.trim().slice(0, 40) : '';
    if (!text) return [];
    try { return (await rpc('app_market_search', { p_region: parseRegion(r), p_q: text, p_limit: 8 })) || []; }
    catch { throw new ServiceUnavailableException('Search is not available right now.'); }
  }

  @Get('watchlist')
  async watchlist(@Query('region') r: string, @Req() req: any) {
    try { return (await rpc('app_market_watch_get', { p_user: req.user.id, p_region: parseRegion(r) })) || []; }
    catch { throw new ServiceUnavailableException('Could not load your watchlist. Try again.'); }
  }

  @Post('watchlist')
  async add(@Body() body: { region?: string; symbol?: string }, @Req() req: any) {
    const symbol = sym(body?.symbol);
    let out: any;
    try { out = await rpc('app_market_watch_add', { p_user: req.user.id, p_region: parseRegion(body?.region), p_symbol: symbol }); }
    catch { throw new ServiceUnavailableException('Could not update your watchlist. Try again.'); }
    if (out?.error === 'unknown_symbol') throw new BadRequestException('That symbol is not in the market list');
    if (out?.error === 'limit') throw new ConflictException('Your watchlist is full (50 stocks per market)');
    if (out?.error) throw new BadRequestException('Bad request');
    return { ok: true, already: !!out?.already };
  }

  @Delete('watchlist/:symbol')
  async remove(@Param('symbol') s: string, @Query('region') r: string, @Req() req: any) {
    try { await rpc('app_market_watch_remove', { p_user: req.user.id, p_region: parseRegion(r), p_symbol: sym(s) }); }
    catch (e) { if (e instanceof BadRequestException) throw e; throw new ServiceUnavailableException('Could not update your watchlist. Try again.'); }
    return { ok: true };
  }
}
