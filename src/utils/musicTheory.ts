import { Note as TonalNote, Interval } from '@tonaljs/tonal';
import type { FretPosition, Note } from '../types/music';

export const STANDARD_TUNING: Note[] = ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'];
export const FRET_COUNT = 12;
export const STRING_COUNT = 6;

// Convert string index + fret to a note name (pitch class, e.g. "C", "F#")
export function fretToNote(stringIndex: number, fret: number): Note {
  const openNote = STANDARD_TUNING[stringIndex];
  if (fret === 0) return TonalNote.pitchClass(openNote) ?? openNote;
  const transposed = TonalNote.transpose(openNote, Interval.fromSemitones(fret));
  return TonalNote.pitchClass(transposed) ?? transposed;
}

// Map an array of fret positions to their pitch class notes
export function fretPositionsToNotes(positions: FretPosition[]): Note[] {
  return positions.map(p => fretToNote(p.string, p.fret));
}

// Deduplicate and normalize pitch classes
export function notesToPitchClasses(notes: Note[]): Note[] {
  const seen = new Set<string>();
  const result: Note[] = [];
  for (const n of notes) {
    const pc = TonalNote.pitchClass(n) ?? n;
    if (!seen.has(pc)) {
      seen.add(pc);
      result.push(pc);
    }
  }
  return result;
}
