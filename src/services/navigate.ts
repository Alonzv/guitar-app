// ── Navigation ───────────────────────────────────────────────────────────────
// Goes to a stop (and optionally one of its views) from anywhere — the song
// map, a handoff, a tool's own link. App subscribes once and moves there.
// What the tools share (the key, the chords…) travels through the song, not
// through here.

export interface NavTarget {
  /** Stop id from data/tools.ts, or 'home' for the network map. */
  stop: string;
  sub?: string;
}

type TargetListener = (t: NavTarget) => void;
let listener: TargetListener | null = null;

/** App subscribes once to perform the actual move. */
export function subscribeNavigate(fn: TargetListener): () => void {
  listener = fn;
  return () => { if (listener === fn) listener = null; };
}

export function requestNavigate(t: NavTarget): void {
  listener?.(t);
}
