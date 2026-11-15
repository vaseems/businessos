import { BadRequestException, Controller, Get, Header, Param, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from './auth';
import { DataService } from './data.service';
import { parseRegion } from './region';

const truthy = (v: unknown) => v === '1' || v === 'true';

function csv(rows: Record<string, any>[]): string {
  const q = (v: string) => (/[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const lines = [cols.map(q).join(',')];
  for (const r of rows) {
    lines.push(
      cols
        .map((c) => {
          let v: any = r[c] ?? '';
          if (typeof v === 'boolean') v = v ? 'true' : 'false';
          else if (v !== null && typeof v === 'object') v = JSON.stringify(v);
          v = String(v);
          if (v !== '' && '=+-@\t\r'.includes(v[0])) v = "'" + v; // block spreadsheet formula injection
          return q(v);
        })
        .join(','),
    );
  }
  return lines.join('\r\n') + '\r\n';
}

@Controller()
export class ApiController {
  constructor(private readonly svc: DataService) {}

  @Get('health')
  health() {
    return { ok: true, service: 'groundwork-api' };
  }

  /** Best guess at the visitor's edition from the edge country header. */
  @Get('geo')
  geo(@Req() req: any) {
    const c = String(req.headers['x-vercel-ip-country'] || req.headers['cf-ipcountry'] || '').toUpperCase();
    return { country: c, region: c === 'US' ? 'us' : 'in', known: !!c };
  }

  @UseGuards(AuthGuard)
  @Get('data')
  data(@Query('region') r: string, @Query('refresh') f: string) {
    return this.svc.data(parseRegion(r), truthy(f));
  }

  @UseGuards(AuthGuard)
  @Get('jobs')
  jobs(@Query('region') r: string, @Query('refresh') f: string) {
    return this.svc.jobs(parseRegion(r), truthy(f));
  }

  @UseGuards(AuthGuard)
  @Get('policy')
  policy(@Query('region') r: string, @Query('refresh') f: string) {
    return this.svc.policy(parseRegion(r), truthy(f));
  }

  @UseGuards(AuthGuard)
  @Get('funding')
  funding(@Query('region') r: string, @Query('refresh') f: string) {
    return this.svc.funding(parseRegion(r), truthy(f));
  }

  @UseGuards(AuthGuard)
  @Get('opportunities')
  opportunities(@Query('region') r: string, @Query('refresh') f: string) {
    return this.svc.opportunities(parseRegion(r), truthy(f));
  }

  @UseGuards(AuthGuard)
  @Get('export/:what')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async export(@Param('what') what: string, @Query('region') r: string, @Res({ passthrough: true }) res: Response) {
    if (what !== 'ideas' && what !== 'startups') throw new BadRequestException('Bad request');
    const d = await this.svc.data(parseRegion(r));
    res.setHeader('Content-Disposition', `attachment; filename="${what}-${new Date().toISOString().slice(0, 10)}.csv"`);
    return '﻿' + csv(d[what] || []);
  }
}
