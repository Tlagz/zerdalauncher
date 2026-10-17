import { marked } from 'marked';
import { openExternal } from '../links';

const TAGS = new Set([
  'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'DEL', 'CODE',
  'PRE', 'BR', 'HR', 'BLOCKQUOTE', 'SPAN', 'DIV', 'CENTER', 'SMALL', 'SUP', 'SUB', 'DETAILS', 'SUMMARY',
  'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'A', 'IMG'
]);
// Removed together with everything inside them.
const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'VIDEO', 'AUDIO', 'SVG', 'FORM', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT', 'NOSCRIPT', 'TEMPLATE', 'LINK', 'META']);

const httpsUrl = (u: string | null): string | null => {
  if (!u) return null;
  try {
    const url = new URL(u);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
};

/**
 * Rebuild third-party HTML from a tag whitelist, copying no attributes except
 * an https image source and an https link target (kept in data-href, so a click
 * never navigates the launcher window — see `bindExternalLinks`).
 */
export function safeFragment(html: string, opts: { images?: boolean; links?: boolean } = {}): DocumentFragment {
  const src = new DOMParser().parseFromString(html, 'text/html').body;
  const out = document.createDocumentFragment();
  const walk = (from: Node, to: Node) => {
    for (const n of from.childNodes) {
      if (n.nodeType === Node.TEXT_NODE) {
        to.appendChild(document.createTextNode(n.textContent ?? ''));
        continue;
      }
      if (n.nodeType !== Node.ELEMENT_NODE) continue;
      const el = n as Element;
      const tag = el.tagName;
      if (DROP.has(tag)) continue;
      if (!TAGS.has(tag)) {
        walk(el, to);
        continue;
      }
      if (tag === 'IMG') {
        const url = opts.images ? httpsUrl(el.getAttribute('src')) : null;
        if (!url) continue;
        const img = document.createElement('img');
        img.src = url;
        img.alt = el.getAttribute('alt') ?? '';
        img.loading = 'lazy';
        img.referrerPolicy = 'no-referrer';
        to.appendChild(img);
        continue;
      }
      if (tag === 'A') {
        const url = opts.links ? httpsUrl(el.getAttribute('href')) : null;
        const a = document.createElement(url ? 'a' : 'span');
        if (url) {
          a.dataset.href = url;
          a.title = url;
        }
        walk(el, a);
        to.appendChild(a);
        continue;
      }
      const copy = document.createElement(tag === 'CENTER' ? 'div' : tag);
      if (tag === 'CENTER') copy.className = 'center';
      walk(el, copy);
      to.appendChild(copy);
    }
  };
  walk(src, out);
  return out;
}

export function markdownFragment(md: string, opts: { images?: boolean; links?: boolean } = {}): DocumentFragment {
  return safeFragment(marked.parse(md, { async: false, gfm: true, breaks: false }) as string, opts);
}

/** Open sanitized links (data-href) in the system browser; returns an unbind function. */
export function bindExternalLinks(root: HTMLElement): () => void {
  const onClick = (e: MouseEvent) => {
    const a = (e.target as Element).closest<HTMLElement>('a[data-href]');
    if (!a) return;
    e.preventDefault();
    openExternal(a.dataset.href!);
  };
  root.addEventListener('click', onClick);
  return () => root.removeEventListener('click', onClick);
}
