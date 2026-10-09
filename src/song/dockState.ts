import { useSyncExternalStore } from 'react';

// ── Song dock: open or folded ────────────────────────────────────────────────
// Most visits use a tool rather than write a song, so the dock starts folded
// to one slim line and remembers what the player last chose. The sub-tab bars
// read the same switch: with the dock folded they take the room it gave back.

const KEY = 'scaleup_dock_open';
let open = (() => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } })();
const listeners = new Set<() => void>();

export function setDockOpen(next: boolean) {
  open = next;
  try { localStorage.setItem(KEY, next ? '1' : '0'); } catch { /* private mode */ }
  listeners.forEach(fn => fn());
}

export function useDockOpen(): boolean {
  return useSyncExternalStore(
    fn => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    () => open,
  );
}
