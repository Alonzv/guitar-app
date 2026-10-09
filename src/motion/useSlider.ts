import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

// ── Sliding indicator ────────────────────────────────────────────────────────
// One block that travels to the active item instead of each item painting its
// own active state — tab bars and the desktop nav underline. Items register
// through `itemRef(i)`; the returned style positions the indicator (absolute,
// inside a position:relative container). It appears in place on first paint
// and only slides on later changes, so a tab never animates in from the edge.

export function useSlider(active: number) {
  const items = useRef<(HTMLElement | null)[]>([]);
  const [box, setBox] = useState<{ x: number; w: number } | null>(null);
  const [ready, setReady] = useState(false);

  const measure = useCallback(() => {
    const el = items.current[active];
    if (!el) { setBox(null); return; }
    setBox({ x: el.offsetLeft, w: el.offsetWidth });
  }, [active]);

  // ResizeObserver reports once as soon as it starts observing (still before
  // paint), so a fresh observer per active item doubles as the first measure.
  useLayoutEffect(() => {
    const parent = items.current[active]?.parentElement;
    if (!parent) return;
    const ro = new ResizeObserver(measure);
    ro.observe(parent);
    return () => ro.disconnect();
  }, [measure, active]);

  // Turn the transition on only after the first positioned paint.
  useLayoutEffect(() => {
    if (box && !ready) requestAnimationFrame(() => setReady(true));
  }, [box, ready]);

  const itemRef = (i: number) => (el: HTMLElement | null) => { items.current[i] = el; };

  const style: CSSProperties = {
    position: 'absolute', left: 0, pointerEvents: 'none',
    width: box?.w ?? 0,
    transform: `translateX(${box?.x ?? 0}px)`,
    opacity: box ? 1 : 0,
    transition: ready
      ? 'transform var(--gc-dur-slow) var(--gc-ease-snap), width var(--gc-dur-slow) var(--gc-ease-snap)'
      : 'none',
  };

  return { itemRef, style };
}
