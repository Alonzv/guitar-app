import { useEffect, useRef } from 'react';

// ScaleUp motion helpers. Web Animations API only, no dependencies.
// All one-shot effects run with fill:'none' so they never fight React-owned styles.

export const EASE = 'cubic-bezier(.32,.72,0,1)';
export const SPRING =
  'linear(0, 0.06 2%, 0.23 5%, 0.5 10%, 0.74 16%, 0.9 23%, 0.99 31%, 1.02 38%, 1.025 45%, 1.012 58%, 1.002 75%, 1)';

const calm = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function anim(el: Element | null | undefined, kf: Keyframe[], o: KeyframeAnimationOptions = {}) {
  if (!el || !(el as HTMLElement).animate || calm()) return;
  (el as HTMLElement).animate(kf, { easing: EASE, fill: 'none', ...o });
}

/** Content swap: rise + unblur. Chord name, scale title. */
export const blurIn = (el?: Element | null, y = 14) =>
  anim(el, [
    { opacity: 0, transform: `translateY(${y}px)`, filter: 'blur(8px)' },
    { opacity: 1, transform: 'none', filter: 'blur(0)' },
  ], { duration: 520 });

/** Children cascade in (formula chips, list rows). */
export const stagger = (parent?: Element | null, step = 35, delay = 40) =>
  [...(parent?.children || [])].forEach((el, i) =>
    anim(el, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }],
      { duration: 480, delay: delay + i * step }));

/** Dots re-appear along the neck. Each dot needs data-f="<fret>". */
export const dotsIn = (board?: Element | null) =>
  board?.querySelectorAll<HTMLElement>('[data-f]').forEach(el =>
    anim(el, [
      { opacity: 0, scale: '0.4' },
      { opacity: getComputedStyle(el).opacity, scale: el.style.scale || '1' },
    ], { duration: 600, easing: SPRING, delay: +(el.dataset.f || 0) * 22 }));

/** Ripple ring behind a round button. ring = absolutely positioned circle, same size, opacity 0. */
export const ripple = (ring?: Element | null) =>
  anim(ring, [{ opacity: 0.7, scale: '1' }, { opacity: 0, scale: '1.7' }], { duration: 800 });

/** Notes "ring" low-to-high on strum. */
export const strumWave = (board?: Element | null, selector = 'button') =>
  [...(board?.querySelectorAll(selector) || [])].forEach((el, i) =>
    anim(el, [{ scale: '1' }, { scale: '1.25', offset: 0.25 }, { scale: '1' }],
      { duration: 560, delay: i * 35, easing: 'cubic-bezier(.25,.1,.25,1)' }));

/** Big letter enters from below (tuner string change). */
export const riseIn = (el?: Element | null) =>
  anim(el, [
    { opacity: 0, transform: 'translateY(70px)', filter: 'blur(14px)' },
    { opacity: 1, transform: 'none', filter: 'blur(0)' },
  ], { duration: 650 });

/** Gentle breath when a value locks in (tuner in tune). */
export const breathe = (el?: Element | null) =>
  anim(el, [{ scale: '1' }, { scale: '1.045' }, { scale: '1' }], { duration: 700 });

/** Confirm pop (Save → Saved). */
export const pop = (el?: Element | null) =>
  anim(el, [{ scale: '0.86' }, { scale: '1' }], { duration: 600, easing: SPRING });

/** Small element appears (tab cursor). */
export const appear = (el?: Element | null) =>
  anim(el, [{ opacity: 0, scale: '0.6' }, { opacity: 1, scale: '1' }], { duration: 420, easing: SPRING });

/** Typed value lands (tab note). */
export const land = (el?: Element | null) =>
  anim(el, [{ scale: '1.5', opacity: 0.2 }, { scale: '1', opacity: 1 }], { duration: 520, easing: SPRING });

/** Banner text change ("Next stop"). */
export const slideIn = (el?: Element | null) =>
  anim(el, [
    { opacity: 0, transform: 'translateY(12px)', filter: 'blur(4px)' },
    { opacity: 1, transform: 'none', filter: 'blur(0)' },
  ], { duration: 450 });

/** Run fn whenever `value` changes after mount (skips first render). */
export function useOnChange<T>(value: T, fn: (prev: T, next: T) => void) {
  const prev = useRef(value);
  useEffect(() => {
    if (!Object.is(prev.current, value)) fn(prev.current, value);
    prev.current = value;
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
}
