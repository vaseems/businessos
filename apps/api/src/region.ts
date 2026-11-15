export type Region = 'in' | 'us';

export function parseRegion(v: unknown): Region {
  return String(v || '').toLowerCase() === 'us' ? 'us' : 'in';
}

export const countryOf = (r: Region) => (r === 'us' ? 'US' : 'IN');

/** Keep only rows for the edition. `key` holds IN / US (and optionally GLOBAL). */
export function regionRows<T extends Record<string, any>>(rows: T[] | undefined, r: Region, key = 'country', withGlobal = false): T[] {
  const want = countryOf(r);
  return (rows || []).filter((row) => {
    const v = String(row[key] ?? 'IN').toUpperCase();
    return v === want || (withGlobal && v === 'GLOBAL');
  });
}
