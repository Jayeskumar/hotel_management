import { getLocale } from '../i18n';

/** ₹ amounts with Indian digit grouping (1,23,456.00). */
export function money(cents: number, currency = 'INR') {
  return new Intl.NumberFormat(getLocale(), { style: 'currency', currency }).format(cents / 100);
}

/** Compact Indian notation for chart axes, e.g. ₹1.2L, ₹3.4Cr. */
export function moneyCompact(cents: number) {
  const r = cents / 100;
  if (Math.abs(r) >= 1e7) return `₹${(r / 1e7).toFixed(1)}Cr`;
  if (Math.abs(r) >= 1e5) return `₹${(r / 1e5).toFixed(1)}L`;
  if (Math.abs(r) >= 1e3) return `₹${(r / 1e3).toFixed(1)}K`;
  return `₹${Math.round(r)}`;
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
  return new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(new Date(iso));
}

export function time(iso: string | null | undefined, timeZone?: string) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(getLocale(), { timeStyle: 'short', timeZone }).format(new Date(iso));
}

export function bpsToPct(bps: number) {
  return (bps / 100).toString();
}

export function pctToBps(pct: string) {
  return Math.round(Number(pct || 0) * 100);
}
