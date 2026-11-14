export function money(cents: number, currency = 'USD') {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
}

export function toCents(value: string): number {
  const n = Number(value.replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function fromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function minutesSince(iso: string | null | undefined, now = Date.now()): number {
  if (!iso) return 0;
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
}

export function elapsed(iso: string | null | undefined, now = Date.now()): string {
  const m = minutesSince(iso, now);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function dateTime(iso: string | null | undefined, timeZone?: string) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(new Date(iso));
}

export function time(iso: string | null | undefined, timeZone?: string) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(undefined, { timeStyle: 'short', timeZone }).format(new Date(iso));
}

const ACRONYMS = new Set(['UPI', 'SKU', 'KDS']);
export function titleCase(s: string) {
  if (ACRONYMS.has(s)) return s;
  return s.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function bpsToPct(bps: number) {
  return (bps / 100).toString();
}

export function pctToBps(pct: string) {
  return Math.round(Number(pct || 0) * 100);
}
