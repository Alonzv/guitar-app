// The element the shell's header gives to a stop's actions (StopActions).
// The shell registers it with a ref callback; StopActions subscribes, so a
// tool that mounts in the same commit as the header still finds it.

let slot: HTMLElement | null = null;
const listeners = new Set<() => void>();

export const getActionsSlot = () => slot;
export function subscribeActionsSlot(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
export function setActionsSlot(el: HTMLElement | null) {
  if (el === slot) return;
  slot = el;
  listeners.forEach(fn => fn());
}
