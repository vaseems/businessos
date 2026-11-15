'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, apiGet, geo, getToken, type Endpoint } from '@/lib/api';
import { guessRegionFromTimezone, regionCfg, stateMap, type RegionCode, type RegionCfg } from '@/lib/region';

export interface SheetItem { slug: string; title: string; body: ReactNode }
export interface PaletteItem { k: string; t: string; s?: string; h: string }

interface Ctx {
  ready: boolean;
  region: RegionCode;
  rc: RegionCfg;
  setRegion: (r: RegionCode) => void;
  state: string;
  setState: (slug: string) => void;
  sheet: SheetItem | null;
  openSheet: (item: SheetItem) => void;
  closeSheet: () => void;
  registerSheetItems: (items: Record<string, SheetItem>) => void;
  paletteExtras: PaletteItem[];
  setPaletteExtras: (items: PaletteItem[]) => void;
}

const AppCtx = createContext<Ctx>(null as any);
export const useApp = () => useContext(AppCtx);

const R_KEY = 'gw_region';
const S_KEY = 'gw_state';
const ls = {
  get: (k: string) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } },
  set: (k: string, v: string) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { /* ignore */ } },
};

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [region, setRegionState] = useState<RegionCode>('in');
  const [state, setStateRaw] = useState('');
  const [sheet, setSheet] = useState<SheetItem | null>(null);
  const [paletteExtras, setPaletteExtras] = useState<PaletteItem[]>([]);
  const items = useRef<Record<string, SheetItem>>({});

  // Edition: the visitor's saved choice, then the country the edge reports, then the browser time zone, then India.
  useEffect(() => {
    let live = true;
    (async () => {
      let r = ls.get(R_KEY);
      if (r !== 'in' && r !== 'us') {
        const g = await geo();
        r = g.known ? g.region : guessRegionFromTimezone();
      }
      if (!live) return;
      setRegionState(r as RegionCode);
      const s = ls.get(S_KEY);
      setStateRaw(s && stateMap(r as RegionCode)[s] ? s : '');
      setReady(true);
    })();
    return () => { live = false; };
  }, []);

  useEffect(() => { document.body.dataset.region = region; }, [region]);

  const setRegion = useCallback((r: RegionCode) => {
    ls.set(R_KEY, r);
    ls.set(S_KEY, ''); // states differ per country
    setStateRaw('');
    setRegionState(r);
    setSheet(null);
  }, []);
  const setState = useCallback((slug: string) => { ls.set(S_KEY, slug); setStateRaw(slug); }, []);

  const openSheet = useCallback((it: SheetItem) => {
    setSheet(it);
    try { history.replaceState(null, '', '#' + it.slug); } catch { /* ignore */ }
  }, []);
  const closeSheet = useCallback(() => {
    setSheet(null);
    try { history.replaceState(null, '', location.pathname + location.search); } catch { /* ignore */ }
  }, []);

  const openHash = useCallback(() => {
    const h = decodeURIComponent(location.hash.slice(1)).replace(/[^\w-]/g, '');
    if (h && items.current[h]) setSheet(items.current[h]);
  }, []);
  const registerSheetItems = useCallback((m: Record<string, SheetItem>) => { items.current = m; openHash(); }, [openHash]);
  useEffect(() => {
    window.addEventListener('hashchange', openHash);
    return () => window.removeEventListener('hashchange', openHash);
  }, [openHash]);

  const value = useMemo<Ctx>(() => ({
    ready, region, rc: regionCfg(region), setRegion, state, setState, sheet, openSheet, closeSheet, registerSheetItems, paletteExtras, setPaletteExtras,
  }), [ready, region, setRegion, state, setState, sheet, openSheet, closeSheet, registerSheetItems, paletteExtras]);

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

/** Register the detail-sheet items for the current page; opens the one named in the URL hash. */
export function useSheetItems(items: Record<string, SheetItem> | null) {
  const { registerSheetItems } = useApp();
  useEffect(() => { if (items) registerSheetItems(items); }, [items, registerSheetItems]);
}

const cache = new Map<string, { at: number; data: any }>();
const inflight = new Map<string, Promise<any>>();
const TTL = 5 * 60 * 1000;

/** Fetch one dataset for the active edition, cached for the session. */
export function useApi<T = any>(ep: Endpoint) {
  const { region, ready } = useApp();
  const router = useRouter();
  const key = `${ep}:${region}`;
  const [data, setData] = useState<T | null>(() => cache.get(key)?.data ?? null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (force = false) => {
    if (!getToken()) { router.replace('/login/'); return; }
    const hit = cache.get(key);
    if (!force && hit && Date.now() - hit.at < TTL) { setData(hit.data); setError(''); return; }
    setLoading(true);
    try {
      const fk = key + (force ? ':f' : '');
      let p = inflight.get(fk);
      if (!p) { p = apiGet<T>(ep, region, force).finally(() => inflight.delete(fk)); inflight.set(fk, p); }
      const d = await p;
      cache.set(key, { at: Date.now(), data: d });
      setData(d); setError('');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { router.replace('/login/'); return; }
      setError(e instanceof Error ? e.message : 'Request failed');
      if (!cache.get(key)) setData(null);
    } finally { setLoading(false); }
  }, [ep, region, key, router]);

  useEffect(() => {
    if (!ready) return;
    setData(cache.get(key)?.data ?? null);
    load();
  }, [ready, key, load]);

  return { data, error, loading, refresh: () => load(true) };
}
