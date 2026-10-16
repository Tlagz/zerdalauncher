/**
 * Cursor-driven card effects, wired once for the whole app via event delegation:
 * a spotlight that follows the pointer (--mx/--my) on glass tiles, plus a subtle
 * 3D tilt (--rx/--ry) on the big cards. Updates are batched to one per frame.
 */
const SPOT = '.instance-card, .home-recent-card, .detail-tile, .skin-card, .theme-card';
const TILT = '.instance-card, .home-recent-card';
const MAX_TILT_DEG = 5;

export function installPointerFx(): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  let current: HTMLElement | null = null;
  let pending: PointerEvent | null = null;
  let frame = 0;

  const reset = (el: HTMLElement) => {
    el.style.removeProperty('--rx');
    el.style.removeProperty('--ry');
  };

  const apply = () => {
    frame = 0;
    const e = pending;
    if (!e) return;
    const { cursorfx, motion } = document.documentElement.dataset;
    if (cursorfx === 'off' || motion === 'off') {
      if (current) reset(current);
      current = null;
      return;
    }
    const el = (e.target as Element | null)?.closest?.(SPOT) as HTMLElement | null;
    if (current && current !== el) reset(current);
    current = el;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
    el.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
    if (el.matches(TILT)) {
      el.style.setProperty('--rx', `${((0.5 - y) * MAX_TILT_DEG).toFixed(2)}deg`);
      el.style.setProperty('--ry', `${((x - 0.5) * MAX_TILT_DEG * 1.4).toFixed(2)}deg`);
    }
  };

  window.addEventListener(
    'pointermove',
    (e) => {
      pending = e;
      if (!frame) frame = requestAnimationFrame(apply);
    },
    { passive: true }
  );
  document.documentElement.addEventListener('pointerleave', () => {
    if (current) reset(current);
    current = null;
  });
}
