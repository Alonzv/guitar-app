// ── Model tiers ──────────────────────────────────────────────────────────────
// Every AI call in the app picks one of these two, so a version bump is one
// edit here rather than seven scattered string literals.
//
//   reasoning — the long jobs where quality shows: cleaning up a transcription,
//               harmonising a melody, reading a tab out of an image.
//   fast      — the short, cheap, high-volume ones: reharmonisation suggestions.
//
// The tiering is deliberate and predates this file; only the versions moved.

export const AI_MODEL = {
  reasoning: 'claude-sonnet-5',
  fast:      'claude-haiku-4-5-20251001',
} as const;
