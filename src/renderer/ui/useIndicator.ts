import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

/**
 * Positions a single "active pill" element under whichever child of the
 * container carries data-active="true", so segmented controls/tabs can slide
 * the highlight instead of swapping backgrounds. Re-measures on resize.
 * `ready` turns true one frame after the first placement, so the pill doesn't
 * animate in from the container's origin on mount.
 */
export function useIndicator<T extends HTMLElement>(activeKey: unknown, axis: 'x' | 'y' = 'x') {
  const ref = useRef<T>(null);
  const [box, setBox] = useState<{ pos: number; size: number } | null>(null);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const active = el.querySelector<HTMLElement>('[data-active="true"]');
      if (!active) return setBox(null);
      setBox(
        axis === 'x'
          ? { pos: active.offsetLeft, size: active.offsetWidth }
          : { pos: active.offsetTop, size: active.offsetHeight }
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [activeKey, axis]);

  useEffect(() => {
    if (!box || ready) return;
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, [box, ready]);

  const style: CSSProperties = !box
    ? { opacity: 0 }
    : axis === 'x'
      ? { width: box.size, transform: `translateX(${box.pos}px)` }
      : { height: box.size, transform: `translateY(${box.pos}px)` };

  return { ref, style, ready };
}
