const trim = (n: number) => String(parseFloat(n.toFixed(1)));

/** USD millions -> "$12.5M" / "$1.2B"; empty -> em dash. */
export function money(m: number | string | null | undefined): string {
  if (m === '' || m === null || m === undefined) return '—';
  const v = Number(m);
  if (!isFinite(v)) return '—';
  return v >= 1000 ? '$' + trim(v / 1000) + 'B' : '$' + trim(v) + 'M';
}

export const num = (n: number | string | null | undefined, dec = 0) =>
  Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });

export const safeUrl = (u: unknown): string => {
  const s = String(u ?? '');
  return /^https?:\/\/[^\s<>"']+$/.test(s) ? s : '';
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Parse a YYYY-MM-DD (or ISO) string as a calendar date, without timezone drift. */
export function parseDate(s: unknown): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s ?? ''));
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3]);
}

/** "5 Nov" */
export function dMon(s: unknown): string {
  const d = parseDate(s);
  return d ? `${d.getDate()} ${MONTHS[d.getMonth()]}` : '';
}
/** "5 Nov 2026" */
export function dFull(s: unknown): string {
  const d = parseDate(s);
  return d ? `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : '';
}
/** "Nov 2026" */
export function dMonYear(s: unknown): string {
  const d = parseDate(s);
  return d ? `${MONTHS[d.getMonth()]} ${d.getFullYear()}` : '';
}
export const today = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

/** PHP's !empty(): null, '', 0, '0' and false all count as empty. */
export const has = (v: unknown): boolean => !(v === null || v === undefined || v === '' || v === 0 || v === '0' || v === false);
/** String value, '' for null/undefined (what PHP echo of h() does). */
export const s = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
