import { BadRequestException, Controller, Get, Param, Query, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { AuthGuard } from './auth';
import { countryOf, parseRegion } from './region';
import { rpc } from './rpc';

export const HISTORY_SECTIONS = ['ideas', 'startups', 'funding', 'opportunities', 'schemes', 'regulations', 'jobs', 'changes', 'runs'] as const;
const SINCE = new Set([1, 7, 30, 90, 365]);

const int = (v: unknown, d: number, lo: number, hi: number) => {
  const n = Number.parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d;
};

/**
 * Every row ever stored, newest first and paginated on the server. The pages show a window of recent results;
 * this is where older ones (including closed, retired and changed rows) can be read.
 */
@UseGuards(AuthGuard)
@Controller('history')
export class HistoryController {
  @Get(':section')
  async get(@Param('section') section: string, @Query() q: Record<string, string>) {
    if (!(HISTORY_SECTIONS as readonly string[]).includes(section)) throw new BadRequestException('Unknown section');
    const size = int(q.size, 25, 5, 100);
    const page = int(q.page, 1, 1, 100000);
    const since = SINCE.has(Number(q.since)) ? Number(q.since) : null;
    const text = typeof q.q === 'string' ? q.q.trim().slice(0, 80) : '';
    let out: any;
    try {
      out = await rpc('app_history', {
        p_section: section,
        p_country: countryOf(parseRegion(q.region)),
        p_q: text || null,
        p_since_days: since,
        p_limit: size,
        p_offset: (page - 1) * size,
      });
    } catch {
      throw new ServiceUnavailableException('Could not load history. Try again.');
    }
    if (!out || out.error) throw new BadRequestException('Unknown section');
    return { section, total: out.total, latest: out.latest, page, size, pages: Math.max(1, Math.ceil(out.total / size)), rows: out.rows };
  }
}
