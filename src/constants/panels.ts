// ── Panel titles ─────────────────────────────────────────────────────────────
// One source of truth for the top-level panels. Both shells (mobile SwipePager
// and DesktopShell) derive their tab count from this array's length, so adding
// a panel here is the only edit needed — no hand-kept counter to fall behind.

export const PANEL_TITLES: string[] = [
  'CHORDS',
  'SCALES',
  'INTERVALS',
  'VOICINGS',
  'TOOLS',
];
