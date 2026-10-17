import { locale } from './i18n';

/** "3h 12m" / "45m"; empty below one minute. */
export function formatPlaytime(ms?: number): string {
  if (!ms || ms < 60000) return '';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** "1.2M" / "34.5k" / "812". */
export function formatDownloads(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return String(n);
}

/** "1.4 GB" / "12.3 MB" / "640 KB"; empty when unknown. */
export function formatSize(bytes?: number): string {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return (mb / 1024).toFixed(1) + ' GB';
  return mb >= 1 ? mb.toFixed(1) + ' MB' : (bytes / 1024).toFixed(0) + ' KB';
}

/** Polish plural form: 1 instancja, 2–4 instancje, 5+ (and 12–14) instancji. */
export function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  const d = n % 10;
  const dd = n % 100;
  return d >= 2 && d <= 4 && (dd < 12 || dd > 14) ? few : many;
}

/** "15 paź 2026"; empty when unknown. */
export function formatDate(ms?: number): string {
  if (!ms) return '';
  return new Date(ms).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' });
}
