// ── Cross-tool navigation ────────────────────────────────────────────────────
// Three tools answer the same question — "which chords belong to this key?" —
// from different angles: the Extensions table, the Chord Wheel, and harmonising
// a melody. Nothing linked them, so finding one told you nothing about the
// other two. These "see also" jumps switch tab and sub-tab, and carry the key
// you were already looking at so the destination doesn't start from scratch.

export type NavMode = 'major' | 'minor';
export interface NavKey { root: string; mode: NavMode }

export interface NavTarget {
  /** Destination id, `${tab}:${sub}` — also how a tool claims an incoming key. */
  id: string;
  tab: number;
  sub: string;
  key?: NavKey;
}

type TargetListener = (t: NavTarget) => void;
type KeyHandler = (k: NavKey) => void;

let listener: TargetListener | null = null;
const handlers = new Map<string, Set<KeyHandler>>();
// A destination on another tab isn't mounted yet when the jump is requested, so
// its key waits here until it mounts and claims it.
const pending = new Map<string, NavKey>();

/** App subscribes once to perform the actual tab/sub-tab switch. */
export function subscribeNavigate(fn: TargetListener): () => void {
  listener = fn;
  return () => { if (listener === fn) listener = null; };
}

export function requestNavigate(t: NavTarget): void {
  if (t.key) {
    const live = handlers.get(t.id);
    if (live && live.size) live.forEach(h => h(t.key!));
    else pending.set(t.id, t.key);
  }
  listener?.(t);
}

/** A destination claims keys addressed to it — on mount and while mounted. */
export function onNavKey(id: string, handler: KeyHandler): () => void {
  let set = handlers.get(id);
  if (!set) { set = new Set(); handlers.set(id, set); }
  set.add(handler);

  const waiting = pending.get(id);
  if (waiting) { pending.delete(id); handler(waiting); }

  return () => {
    const s = handlers.get(id);
    if (!s) return;
    s.delete(handler);
    if (!s.size) handlers.delete(id);
  };
}
