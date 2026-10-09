// ── Navigation ───────────────────────────────────────────────────────────────
// Opens a tool from anywhere — the command palette, the tools map. App
// subscribes once and switches the panel and sub-tab. What the tools share
// (the key, the chords…) travels through the song, not through here.

export interface NavTarget {
  /** Tool id, `${panel}:${sub}`. */
  id: string;
  tab: number;
  sub: string;
}

type TargetListener = (t: NavTarget) => void;
let listener: TargetListener | null = null;

/** App subscribes once to perform the actual tab/sub-tab switch. */
export function subscribeNavigate(fn: TargetListener): () => void {
  listener = fn;
  return () => { if (listener === fn) listener = null; };
}

export function requestNavigate(t: NavTarget): void {
  listener?.(t);
}
