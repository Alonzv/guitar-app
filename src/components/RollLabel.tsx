import { useEffect, useState } from 'react';

// ── Roll label ───────────────────────────────────────────────────────────────
// Button text that rolls up to its next value instead of swapping in place —
// "+ Add" → "✓ Added" → "+ Add". The outgoing text leaves upward while the new
// one rises from below (styles: .gc-roll in index.css).

export function RollLabel({ children }: { children: string }) {
  const [roll, setRoll] = useState({ shown: children, leaving: null as string | null, n: 0 });

  // A new label starts a roll; the old one is kept just long enough to leave.
  if (children !== roll.shown) {
    setRoll({ shown: children, leaving: roll.shown, n: roll.n + 1 });
  }

  useEffect(() => {
    if (roll.leaving === null) return;
    const t = window.setTimeout(() => setRoll(r => ({ ...r, leaving: null })), 280);
    return () => window.clearTimeout(t);
  }, [roll.n, roll.leaving]);

  return (
    <span className="gc-roll">
      {roll.leaving !== null && <span key={`out-${roll.n}`} className="gc-roll-out" aria-hidden>{roll.leaving}</span>}
      <span key={`in-${roll.n}`} className={roll.n ? 'gc-roll-in' : undefined}>{roll.shown}</span>
    </span>
  );
}
