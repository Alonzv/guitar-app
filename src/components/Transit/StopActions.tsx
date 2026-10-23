import { useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { getActionsSlot, subscribeActionsSlot } from './actionsSlot';

// ── A stop's own actions in the shell's header ───────────────────────────────
// The shell keeps a slot on the right of the stop header (mobile) and of the
// top bar (desktop). A tool renders <StopActions> anywhere in its tree and
// its pills (SAVE, ‹ key ›, PLAY…) appear there.

export function StopActions({ children }: { children: ReactNode }) {
  const slot = useSyncExternalStore(subscribeActionsSlot, getActionsSlot, () => null);
  return slot ? createPortal(children, slot) : null;
}
