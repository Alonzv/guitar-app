import { Chord as TonalChord } from '@tonaljs/tonal';
import type { ChordInProgression } from '../types/music';
import { findChordVoicings } from './chordVoicings';
import { TUNINGS } from './musicTheory';

// ── Progression bridge ───────────────────────────────────────────────────────
// The session's progression is a list of ChordInProgression (name + notes + a
// concrete shape on the neck). The voicing tools speak in bare chord names.
// These two helpers convert between them so an edit made in any tool can flow
// back into the one shared progression.

export function progressionToNames(p: ChordInProgression[]): string[] {
  return p.map(c => c.chord.name).filter(Boolean);
}

let seq = 0;

/**
 * Turn chord names back into progression entries. Entries from `existing` are
 * reused (matched by name, in order) so the shapes the user already picked —
 * and their ids — survive an edit that only adds, removes or reorders chords.
 */
export function namesToProgression(
  names: string[],
  tuning: string[] = TUNINGS[0].notes,
  existing: ChordInProgression[] = [],
): ChordInProgression[] {
  const pool = new Map<string, ChordInProgression[]>();
  for (const item of existing) {
    const k = item.chord.name;
    if (!pool.has(k)) pool.set(k, []);
    pool.get(k)!.push(item);
  }
  return names.map(name => {
    const reused = pool.get(name)?.shift();
    if (reused) return reused;
    const info = TonalChord.get(name);
    return {
      id: `chord-sync-${Date.now()}-${seq++}`,
      chord: { name, notes: info.notes, aliases: info.aliases ?? [] },
      fretPositions: findChordVoicings(name, 1, tuning)[0] ?? [],
    };
  });
}

/** True when two progressions hold the same chord names in the same order. */
export function sameNames(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}
