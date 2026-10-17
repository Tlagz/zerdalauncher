import { translate, type Lang } from '../shared/i18n';

/**
 * English UI without touching every component: the Polish strings stay in the
 * code as keys, and while English is on, a MutationObserver swaps text nodes and
 * text attributes for their translations as React renders them. Anything
 * without a translation simply stays Polish.
 */
let lang: Lang = 'pl';
const ATTRS = ['title', 'placeholder', 'aria-label'];
// Third-party or user content never gets translated.
const SKIP = '[data-no-i18n], pre, code, textarea, .rich-text, .notes-body, .mod-desc, .server-motd, .news-text, .details-summary';
const warned = new Set<string>();

export const getLang = (): Lang => lang;
/** Locale for dates and numbers. */
export const locale = (): string => (lang === 'en' ? 'en-GB' : 'pl-PL');

function textNode(n: Text): void {
  const v = n.nodeValue;
  if (!v || !/\p{L}/u.test(v) || n.parentElement?.closest(SKIP)) return;
  const t = translate(v);
  if (t !== null) {
    if (t !== v) n.nodeValue = t;
  } else if (import.meta.env.DEV && /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(v) && !warned.has(v.trim())) {
    warned.add(v.trim());
    console.warn('[i18n] missing EN:', JSON.stringify(v.trim()));
  }
}

function attrs(el: Element): void {
  if (el.closest(SKIP)) return;
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (!v) continue;
    const t = translate(v);
    if (t !== null && t !== v) el.setAttribute(a, t);
  }
}

function walk(root: Node): void {
  if (root.nodeType === Node.TEXT_NODE) return textNode(root as Text);
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  attrs(root as Element);
  const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = it.nextNode(); n; n = it.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) textNode(n as Text);
    else attrs(n as Element);
  }
}

/** Call once before React renders. Switching language reloads the window. */
export function initI18n(l: Lang): void {
  lang = l;
  document.documentElement.lang = l;
  if (l !== 'en') return;
  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'characterData') textNode(m.target as Text);
      else if (m.type === 'attributes') attrs(m.target as Element);
      else m.addedNodes.forEach(walk);
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  walk(document.body);
}

/** Translate a string in code (e.g. text the palette searches through). */
export function t(text: string): string {
  return lang === 'en' ? (translate(text) ?? text) : text;
}
