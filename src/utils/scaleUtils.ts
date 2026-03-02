import { Scale, Note as TonalNote } from '@tonaljs/tonal';
import type { ChordInProgression, FretPosition, Note, ScaleMatch } from '../types/music';
import { fretPositionsToNotes, notesToPitchClasses, FRET_COUNT, STRING_COUNT, fretToNote } from './musicTheory';

// Detect best-fitting scales from a set of chords
export function detectScales(chords: ChordInProgression[]): ScaleMatch[] {
  if (chords.length === 0) return [];

  const allNotes = chords.flatMap(c => fretPositionsToNotes(c.fretPositions));
  const pitchClasses = notesToPitchClasses(allNotes);
  if (pitchClasses.length === 0) return [];

  const chromatic = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const results: ScaleMatch[] = [];

  // Limit to common scale types for performance
  const COMMON_TYPES = [
    'major', 'minor', 'dorian', 'mixolydian', 'phrygian', 'lydian', 'locrian',
    'minor pentatonic', 'major pentatonic', 'blues', 'harmonic minor', 'melodic minor',
  ];

  for (const root of chromatic) {
    for (const type of COMMON_TYPES) {
      const scale = Scale.get(`${root} ${type}`);
      if (!scale || scale.empty) continue;
      const scaleNotes = scale.notes;
      const covered = pitchClasses.filter(pc => scaleNotes.includes(pc) || scaleNotes.includes(TonalNote.enharmonic(pc) ?? pc));
      const fitPercent = Math.round((covered.length / pitchClasses.length) * 100);
      if (fitPercent > 0) {
        results.push({
          name: `${root} ${type}`,
          root,
          type,
          fitPercent,
          positions: getScalePositions(root, type),
        });
      }
    }
  }

  // Sort by fit desc, then prefer common scales
  results.sort((a, b) => {
    if (b.fitPercent !== a.fitPercent) return b.fitPercent - a.fitPercent;
    return 0;
  });

  // Deduplicate scales with same notes
  const seen = new Set<string>();
  const unique: ScaleMatch[] = [];
  for (const s of results) {
    const key = Scale.get(s.name).notes.sort().join(',');
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(s);
    }
  }

  return unique.slice(0, 3);
}

// Get all fret positions for a scale across the entire fretboard
export function getScalePositions(root: Note, scaleType: string): FretPosition[] {
  const scale = Scale.get(`${root} ${scaleType}`);
  if (!scale || scale.empty) return [];

  const scaleNotes = scale.notes;
  const positions: FretPosition[] = [];

  for (let s = 0; s < STRING_COUNT; s++) {
    for (let f = 0; f <= FRET_COUNT; f++) {
      const note = fretToNote(s, f);
      const enharmonic = TonalNote.enharmonic(note) ?? note;
      if (scaleNotes.includes(note) || scaleNotes.includes(enharmonic)) {
        positions.push({ string: s, fret: f });
      }
    }
  }

  return positions;
}

// Assign CAGED position index (0-4) to each fret position
export function getPositionIndex(fret: number, totalFrets: number = FRET_COUNT): number {
  const segment = Math.floor((fret / totalFrets) * 5);
  return Math.min(segment, 4);
}
