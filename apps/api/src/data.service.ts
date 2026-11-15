import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { cfg } from './config';
import { Region, regionRows } from './region';

type Json = Record<string, any>;
type Entry = { at: number; data: Json };

const SOURCES: Record<string, { fn: string; must: string }> = {
  data: { fn: 'app_get_data', must: 'ideas' },
  jobs: { fn: 'app_get_jobs', must: 'future' },
  policy: { fn: 'app_get_policy', must: 'schemes' },
  funding: { fn: 'app_get_funding', must: 'deals' },
  opportunities: { fn: 'app_get_funding_sources', must: 'sources' },
};

@Injectable()
export class DataService {
  private cache = new Map<string, Entry>();
  private inflight = new Map<string, Promise<Json>>();

  private async fetchRemote(fn: string, must: string): Promise<Json | null> {
    if (!cfg.supabaseUrl || !cfg.supabaseKey) return null;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      apikey: cfg.supabaseKey,
    };
    if (cfg.supabaseKey.startsWith('eyJ')) headers.Authorization = 'Bearer ' + cfg.supabaseKey;
    try {
      const res = await fetch(`${cfg.supabaseUrl}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ p_key: cfg.appKey }),
        signal: AbortSignal.timeout(15000),
      });
      if (res.status !== 200) return null;
      const d = await res.json();
      return d && typeof d === 'object' && !Array.isArray(d) && must in d ? d : null;
    } catch {
      return null;
    }
  }

  private fixture(name: string): Json | null {
    if (!cfg.fixtureDir) return null;
    const f = join(cfg.fixtureDir, name + '.json');
    return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
  }

  /** Raw, unfiltered payload with a TTL cache and a stale fallback. */
  async raw(name: keyof typeof SOURCES, force = false): Promise<Json> {
    const fx = this.fixture(name);
    if (fx) return fx;
    const hit = this.cache.get(name);
    if (!force && hit && Date.now() - hit.at < cfg.cacheTtl * 1000) return hit.data;
    let p = this.inflight.get(name);
    if (!p) {
      p = (async () => {
        const s = SOURCES[name];
        const d = await this.fetchRemote(s.fn, s.must);
        if (d) {
          this.cache.set(name, { at: Date.now(), data: d });
          return d;
        }
        if (hit) return { ...hit.data, _stale: true };
        throw new ServiceUnavailableException(`Could not load ${name} data from Supabase.`);
      })().finally(() => this.inflight.delete(name));
      this.inflight.set(name, p);
    }
    return p;
  }

  /** Ideas, startups and the update log for the edition. */
  async data(region: Region, force = false): Promise<Json> {
    const d = { ...(await this.raw('data', force)) };
    const us = region === 'us';
    const want = us ? 'US' : 'IN';
    d.ideas = (d.ideas || []).filter((i: Json) => String(i.region ?? 'IN').toUpperCase() === want);
    const keep = new Set<string>(d.ideas.map((i: Json) => i.slug));
    d.log = (d.log || []).filter((l: Json) => keep.has(l.idea_slug ?? ''));
    if (us) {
      d.startups = (d.startups || []).filter((s: Json) =>
        ['US', 'USA', 'UNITED STATES'].includes(String(s.hq_country ?? '').toUpperCase()),
      );
    }
    return d;
  }

  /** Jobs rows tagged with a region are kept when they fit the edition. */
  async jobs(region: Region, force = false): Promise<Json> {
    const d = { ...(await this.raw('jobs', force)) };
    const us = region === 'us';
    const usOnly = ['United States', 'Europe and United States'];
    const fit = (r: Json) => {
      const reg = String(r.region ?? 'Global');
      const isUs = usOnly.includes(reg);
      return us ? isUs || reg === 'Global' : !isUs;
    };
    for (const k of ['future', 'hot', 'skills', 'stats']) d[k] = (d[k] || []).filter(fit);
    return d;
  }

  async policy(region: Region, force = false): Promise<Json> {
    const d = { ...(await this.raw('policy', force)) };
    d.schemes = regionRows(d.schemes, region);
    d.regulations = regionRows(d.regulations, region);
    const slugs = new Set<string>(d.regulations.map((r: Json) => r.slug));
    d.milestones = (d.milestones || []).filter((m: Json) => slugs.has(m.reg_slug ?? ''));
    return d;
  }

  async funding(region: Region, force = false): Promise<Json> {
    const d = { ...(await this.raw('funding', force)) };
    d.deals = regionRows(d.deals, region);
    return d;
  }

  /** Programs for the edition, plus the ones open to startups anywhere. */
  async opportunities(region: Region, force = false): Promise<Json> {
    const d = { ...(await this.raw('opportunities', force)) };
    d.sources = regionRows(d.sources, region, 'country', true);
    return d;
  }
}
