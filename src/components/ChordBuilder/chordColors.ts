import { Chord, Note } from '@tonaljs/tonal';
import type { FretPosition } from '../../types/music';
import { fretToNote } from '../../utils/musicTheory';
import { T } from '../../theme';

// Monochrome by interval: the root is the cobalt one on a neck, the chord's
// core tones (3rds, 5ths) are ink, colour tones (2, 4, 6, 7, 9, 11, 13) grey.
export const INTERVAL_COLOR: Record<string, string> = {
  '1P': T.primary,   '8P': T.primary,
  '3m': T.secondary, '3M': T.secondary,
  '5P': T.secondary, '5A': T.secondary, '5d': T.secondary,
  '4P': T.coral,     '4A': T.coral,
  '2m': T.coral,     '2M': T.coral,     '2A': T.coral,
  '6m': T.coral,     '6M': T.coral,
  '7d': T.coral,     '7m': T.coral,     '7M': T.coral,
  '9m': T.coral,     '9M': T.coral,     '9A': T.coral,
  '11P': T.coral,    '11A': T.coral,
  '13m': T.coral,    '13M': T.coral,
};

/** Returns a chroma (0–11) → color map for the given chord */
export function buildChromaColorMap(chordName: string): Map<number, string> {
  const map = new Map<number, string>();
  const data = Chord.get(chordName);
  if (data.empty) return map;
  data.notes.forEach((note, i) => {
    const chroma = Note.chroma(note);
    if (chroma != null) map.set(chroma, INTERVAL_COLOR[data.intervals[i]] ?? T.secondary);
  });
  return map;
}

/** One colour per placed note of a shape (ink when the chord is unknown). */
export function rootColors(voicing: FretPosition[], chordName: string | null | undefined, tuning?: string[]): string[] {
  const map = chordName ? buildChromaColorMap(chordName) : new Map<number, string>();
  return voicing.map(p => {
    const c = Note.chroma(fretToNote(p.string, p.fret, tuning));
    return (c != null && map.get(c)) || T.secondary;
  });
}

