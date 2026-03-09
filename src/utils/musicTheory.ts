import { Note as TonalNote, Interval } from '@tonaljs/tonal';
import type { FretPosition, Note, Tuning } from '../types/music';

export const TUNINGS: Tuning[] = [
  { name: 'standard', label: 'E Standard', notes: ['E2','A2','D3','G3','B3','E4'], openFreqs: [82.41, 110.0, 146.83, 196.0, 246.94, 329.63] },
  { name: 'dropD',    label: 'Drop D',     notes: ['D2','A2','D3','G3','B3','E4'], openFreqs: [73.42, 110.0, 146.83, 196.0, 246.94, 329.63] },
  { name: 'dadgad',   label: 'DADGAD',     notes: ['D2','A2','D3','G3','A3','D4'], openFreqs: [73.42, 110.0, 146.83, 196.0, 220.0, 293.66] },
  { name: 'openG',    label: 'Open G',     notes: ['D2','G2','D3','G3','B3','D4'], openFreqs: [73.42, 98.0, 146.83, 196.0, 246.94, 293.66] },
];

export const STANDARD_TUNING: Note[] = TUNINGS[0].notes;
export const FRET_COUNT = 12;
export const STRING_COUNT = 6;

// Convert string index + fret to a note name (pitch class, e.g. "C", "F#")
export function fretToNote(
  stringIndex: number,
  fret: number,
  tuning: string[] = TUNINGS[0].notes,
  capo = 0,
): Note {
  const openNote = tuning[stringIndex];
  const effectiveFret = fret + capo;
  if (effectiveFret === 0) return TonalNote.pitchClass(openNote) ?? openNote;
  const transposed = TonalNote.transpose(openNote, Interval.fromSemitones(effectiveFret));
  return TonalNote.pitchClass(transposed) ?? transposed;
}

// Map an array of fret positions to their pitch class notes
export function fretPositionsToNotes(
  positions: FretPosition[],
  tuning: string[] = TUNINGS[0].notes,
  capo = 0,
): Note[] {
  return positions.map(p => fretToNote(p.string, p.fret, tuning, capo));
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
