// ── Motion ───────────────────────────────────────────────────────────────────
// App-wide feedback that every button gets without opting in, installed once
// from main.tsx. The look lives in index.css (search "Motion"); this file only
// decides *when* a surface is pressed, selected or newly enabled.
//
//   • Press      — drawn by motion.css (scale on :active); this file only
//                  remembers the last pressed surface for flyToDock.
//   • Enabled    — a button whose `disabled` attribute is removed pulses once.

const PRESSABLE = 'button, [role="button"], .gc-pressable';
const PULSE_MS = 400;         // --gc-dur-slow

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
  // The look of a press is CSS (motion.css: scale on :active). This only
  // remembers the surface pressed last — flyToDock's origin — and gives
  // touch a tiny haptic tick.
  document.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const el = pressable(e.target);
    if (!el) return;
    lastPressed = el;
    // Wide surfaces (rows, full-width buttons) barely move: motion.css gives
    // [data-press="soft"] a 98.5% press instead of 94%.
    if (!el.dataset.press && el.getBoundingClientRect().width > 240) el.dataset.press = 'soft';
    if (e.pointerType === 'touch') navigator.vibrate?.(8);
  }, { capture: true, passive: true });
  document.addEventListener('keydown', e => {
    if (e.repeat || (e.key !== 'Enter' && e.key !== ' ')) return;
    const el = pressable(e.target);
    if (el) lastPressed = el;
  }, true);
}

function installStateObserver() {
  new MutationObserver(records => {
    for (const r of records) {
      const el = r.target as HTMLElement;
      if (r.attributeName === 'disabled' && r.oldValue !== null && !el.hasAttribute('disabled')
        && el.matches(PRESSABLE) && !reducedMotion()) {
        replayClass(el, 'gc-enable-pulse', PULSE_MS);
      }
    }
  }).observe(document.body, {
    subtree: true, attributes: true, attributeOldValue: true,
    attributeFilter: ['disabled'],
  });
}

// ── Tooltips ─────────────────────────────────────────────────────────────────
// Icon buttons carry an aria-label but no visible text. On a Mac pointer,
// hovering one should name it, like a Finder toolbar item: mirror the label
// into a native tooltip the first time the pointer arrives.
function installTooltips() {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  document.addEventListener('pointerover', e => {
    const el = (e.target as Element | null)?.closest?.('button[aria-label], [role="button"][aria-label]');
    if (el && !el.hasAttribute('title')) el.setAttribute('title', el.getAttribute('aria-label')!);
  }, { passive: true });
}

let installed = false;
export function installMotion() {
  if (installed) return;
  installed = true;
  installPress();
  installStateObserver();
  installTooltips();
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
      padding: '6px 12px', background: 'var(--gc-primary)', color: 'var(--su-on-primary)',
      borderRadius: '999px',
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
