import { flushSync } from 'react-dom';

type TransitionKind = 'page' | 'close';

const reducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Applies a React state update inside a View Transition so the DOM change
 * animates instead of jumping. `kind` selects the CSS (see shell.css):
 *  - 'page'  — the main content slides/crossfades, shared elements morph
 *  - 'close' — `closing` (a modal/dialog element) zooms out while it unmounts
 * Note: the page ignores input for the transition's duration, so only use this
 * for user-initiated changes, never for background updates.
 */
export function transition(
  update: () => void,
  opts: { kind?: TransitionKind; closing?: Element | null } = {}
): void {
  if (!document.startViewTransition || reducedMotion()) {
    update();
    return;
  }
  const root = document.documentElement;
  const closing = opts.closing as HTMLElement | null | undefined;
  root.dataset.vt = opts.kind ?? 'page';
  if (closing) closing.style.viewTransitionName = 'closing';
  const vt = document.startViewTransition(() => flushSync(update));
  vt.finished.finally(() => {
    delete root.dataset.vt;
    // The element may still be mounted (e.g. close was vetoed while busy).
    if (closing) closing.style.viewTransitionName = '';
  });
}

/** Close a modal/dialog with a zoom-out, given any element inside it. */
export function closeWithTransition(from: Element | null, onClose: () => void): void {
  transition(onClose, { kind: 'close', closing: from?.closest('.modal') ?? null });
}
