// ── Motion ───────────────────────────────────────────────────────────────────
// App-wide feedback that every button gets without opting in, installed once
// from main.tsx. The look lives in index.css (search "Motion"); this file only
// decides *when* a surface is pressed, selected or newly enabled.
//
//   • Press      — gc-pressed is added on pointer-down and held for at least
//                  PRESS_MIN_MS, so even a quick tap shows the full sink.
//                  :active alone lasts only as long as the finger, which on a
//                  tap is too short to see.
//   • Selection  — a surface marked data-active="true|false" gets gc-fill-in /
//                  gc-fill-out when that attribute flips, and the overlay is
//                  painted in the colour it had a moment ago.
//   • Enabled    — a button whose `disabled` attribute is removed pulses once.

const PRESSABLE = 'button, [role="button"], .gc-pressable';
const PRESS_MIN_MS = 200;     // --gc-dur-fast
const FILL_MS = 280;          // --gc-dur-base
const PULSE_MS = 400;         // --gc-dur-slow
const SWIPE_CANCEL_PX = 10;   // a press that turns into a swipe lets go

let lastPressed: HTMLElement | null = null;

/** The surface the user pressed most recently — the origin for flyToDock. */
export const getLastPressed = (): HTMLElement | null =>
  lastPressed && lastPressed.isConnected ? lastPressed : null;

const reducedMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

function pressable(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const el = target.closest<HTMLElement>(PRESSABLE);
  if (!el || el.matches(':disabled, [aria-disabled="true"], .gc-no-press')) return null;
  return el;
}

/** Restart a one-shot animation class on an element. */
export function replayClass(el: Element, cls: string, ms: number) {
  el.classList.remove(cls);
  // Force a reflow so re-adding the class restarts the animation.
  void (el as HTMLElement).offsetWidth;
  el.classList.add(cls);
  window.setTimeout(() => el.classList.remove(cls), ms);
}

/** Shake an element sideways — the app's "no, try again". */
export const shake = (el: Element | null | undefined) => {
  if (el) replayClass(el, 'gc-shake', 200);
};

function installPress() {
  let current: { el: HTMLElement; t: number; x: number; y: number } | null = null;

  const release = () => {
    if (!current) return;
    const { el, t } = current;
    current = null;
    const wait = Math.max(0, PRESS_MIN_MS - (performance.now() - t));
    window.setTimeout(() => el.classList.remove('gc-pressed'), wait);
  };

  const press = (el: HTMLElement, x: number, y: number) => {
    release();
    current = { el, t: performance.now(), x, y };
    lastPressed = el;
    el.classList.add('gc-pressed');
  };

  document.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const el = pressable(e.target);
    if (!el) return;
    press(el, e.clientX, e.clientY);
    if (e.pointerType === 'touch') navigator.vibrate?.(8);
  }, { capture: true, passive: true });

  document.addEventListener('pointermove', e => {
    if (!current) return;
    if (Math.hypot(e.clientX - current.x, e.clientY - current.y) > SWIPE_CANCEL_PX) release();
  }, { capture: true, passive: true });

  for (const type of ['pointerup', 'pointercancel', 'dragstart'] as const) {
    document.addEventListener(type, release, { capture: true, passive: true });
  }
  window.addEventListener('blur', release);

  // Keyboard presses look the same as pointer presses.
  document.addEventListener('keydown', e => {
    if (e.repeat || (e.key !== 'Enter' && e.key !== ' ')) return;
    const el = pressable(e.target);
    if (el) press(el, 0, 0);
  }, true);
  document.addEventListener('keyup', e => {
    if (e.key === 'Enter' || e.key === ' ') release();
  }, true);
}

function installStateObserver() {
  const fillTimers = new WeakMap<Element, number>();

  const onActiveChange = (el: HTMLElement, oldValue: string | null) => {
    const now = el.getAttribute('data-active');
    if (oldValue === null || now === null || oldValue === now || reducedMotion()) return;
    // The background transition has only just started, so the computed colour
    // is still the old one — exactly what the withdrawing overlay should show.
    const from = getComputedStyle(el).backgroundColor;
    el.style.setProperty('--gc-fill-from', from);
    el.classList.remove('gc-fill-in', 'gc-fill-out');
    void el.offsetWidth;
    el.classList.add(now === 'true' ? 'gc-fill-in' : 'gc-fill-out');
    window.clearTimeout(fillTimers.get(el));
    fillTimers.set(el, window.setTimeout(() => el.classList.remove('gc-fill-in', 'gc-fill-out'), FILL_MS));
  };

  new MutationObserver(records => {
    for (const r of records) {
      const el = r.target as HTMLElement;
      if (r.attributeName === 'data-active') onActiveChange(el, r.oldValue);
      else if (r.attributeName === 'disabled' && r.oldValue !== null && !el.hasAttribute('disabled')
        && el.matches(PRESSABLE) && !reducedMotion()) {
        replayClass(el, 'gc-enable-pulse', PULSE_MS);
      }
    }
  }).observe(document.body, {
    subtree: true, attributes: true, attributeOldValue: true,
    attributeFilter: ['data-active', 'disabled'],
  });
}

let installed = false;
export function installMotion() {
  if (installed) return;
  installed = true;
  installPress();
  installStateObserver();
}

// ── Fly to the session bar ───────────────────────────────────────────────────
// A chip carrying `label` leaves the button the user just pressed and lands on
// the newest chord in the session bar ([data-gc-dock]). Called right after the
// progression changes, so it waits for React to paint the new chord first.

const FLY_MS = 400;   // --gc-dur-slow

export function flyToDock(label: string, origin: Element | null = getLastPressed()) {
  if (!origin || reducedMotion()) return;
  const from = origin.getBoundingClientRect();
  if (!from.width) return;

  requestAnimationFrame(() => requestAnimationFrame(() => {
    const items = document.querySelectorAll<HTMLElement>('[data-gc-dock] [data-gc-dock-item]');
    const target = items[items.length - 1];
    if (!target) return;
    const to = target.getBoundingClientRect();

    const chip = document.createElement('div');
    chip.className = 'gc-notation';
    chip.textContent = label;
    Object.assign(chip.style, {
      position: 'fixed', zIndex: '9500', pointerEvents: 'none',
      left: `${from.left + from.width / 2}px`, top: `${from.top + from.height / 2}px`,
      transform: 'translate(-50%, -50%)',
      padding: '6px 12px', background: 'var(--gc-primary)', color: 'var(--gc-white)',
      borderLeft: '3px solid var(--gc-bar-color)',
      fontFamily: 'var(--gc-font)', fontSize: '13px', fontWeight: '700', whiteSpace: 'nowrap',
    });
    document.body.appendChild(chip);

    const dx = (to.left + to.width / 2) - (from.left + from.width / 2);
    const dy = (to.top + to.height / 2) - (from.top + from.height / 2);
    const anim = chip.animate([
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.7)`, opacity: 0.85 },
    ], { duration: FLY_MS, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
    const done = () => { chip.remove(); replayClass(target, 'gc-land', 280); };
    anim.onfinish = done;
    anim.oncancel = done;
  }));
}
