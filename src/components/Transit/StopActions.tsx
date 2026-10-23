import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

// ── A stop's own actions in the shell's header ───────────────────────────────
// The shell keeps a slot on the right of the stop header (mobile) and of the
// top bar (desktop). A tool renders <StopActions> anywhere in its tree and
// its pills (SAVE, ‹ key ›, PLAY…) appear there.

export const ACTIONS_SLOT_ID = 'su-actions';

export function StopActions({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => { setSlot(document.getElementById(ACTIONS_SLOT_ID)); }, []);
  return slot ? createPortal(children, slot) : null;
}
