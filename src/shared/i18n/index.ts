import { EN } from './en';

export type Lang = 'pl' | 'en';

const exact = new Map<string, string>();
const patterns: Array<{ re: RegExp; to: string }> = [];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
for (const [pl, en] of Object.entries(EN)) {
  const key = pl.replace(/\s+/g, ' ').trim();
  if (!/\{\d\}/.test(key)) exact.set(key, en);
  else {
    const re = new RegExp('^' + escape(key).replace(/\\\{(\d)\\\}/g, '([\\s\\S]+?)') + '$');
    patterns.push({ re, to: en });
  }
}
// Most specific templates first (more literal text = fewer false matches).
patterns.sort((a, b) => b.re.source.replace(/\(\[\\s\\S\]\+\?\)/g, '').length - a.re.source.replace(/\(\[\\s\\S\]\+\?\)/g, '').length);

const IPC_ERROR = /^Error invoking remote method '[^']+': (?:Error: )?([\s\S]+)$/;

/**
 * English for a Polish UI string, or null when there's none. Keeps the
 * surrounding whitespace; template parts ({0}…) are translated recursively.
 */
export function translate(text: string, depth = 0): string | null {
  const core = text.trim();
  if (!core || depth > 3) return null;
  const lead = text.slice(0, text.indexOf(core[0]));
  const trail = text.slice(lead.length + core.length);
  const norm = core.replace(/\s+/g, ' ');
  const hit = exact.get(norm);
  if (hit !== undefined) return lead + hit + trail;
  const ipc = core.match(IPC_ERROR);
  if (ipc) return lead + (translate(ipc[1], depth + 1) ?? ipc[1]) + trail;
  for (const p of patterns) {
    const m = norm.match(p.re);
    if (m) return lead + p.to.replace(/\{(\d)\}/g, (_, i) => translate(m[+i + 1], depth + 1)?.trim() ?? m[+i + 1]) + trail;
  }
  return null;
}

/** For the main process: translate when English is selected, else return as is. */
export function tr(text: string, lang: Lang): string {
  return lang === 'en' ? (translate(text) ?? text) : text;
}
