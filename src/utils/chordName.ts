// ── Chord-name spelling rules ────────────────────────────────────────────────
// House style for how chords are written in the UI:
//   • a flat is always a lowercase "b"  (Bb, m7b5 — never BB / M7B5)
//   • "major" is never abbreviated to a capital M next to a note or chord
//     (Cmaj7, never CM7; C minor-major 7 is Cm(maj7), never CmM7)
//
// tonal cannot parse "m(maj7)", so chord names are stored in a parsable form
// (mMaj7) and converted for display. Use toDisplayChord() wherever a chord name
// is rendered, and keep the stored/parsed name untouched.

/** Parsable suffix for a minor chord with a major 7th. */
export const MINOR_MAJ7 = 'mMaj7';

/** Render a chord name in house style. Safe to call on any chord name. */
export function toDisplayChord(name: string): string {
  // mMaj7 / mM7 → m(maj7); leave everything else alone.
  return name.replace(/m(?:M|Maj)7/g, 'm(maj7)');
}

/** Turn a display-form chord name back into something tonal can parse. */
export function toParsableChord(name: string): string {
  return name.replace(/m\(maj7\)/g, MINOR_MAJ7);
}
