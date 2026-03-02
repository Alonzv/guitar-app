import { Chord as TonalChord } from '@tonaljs/tonal';
import type { FretPosition } from '../types/music';
import { fretToNote, STRING_COUNT, FRET_COUNT } from './musicTheory';

const ENHARMONICS: Record<string, string> = {
  'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb',
  'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#',
};

function samePitch(a: string, b: string): boolean {
  return a === b || ENHARMONICS[a] === b || a === ENHARMONICS[b];
}

function noteInChord(note: string, chordNotes: string[]): boolean {
  return chordNotes.some(cn => samePitch(note, cn));
}

// Given a Tonal.js chord name (e.g. "CM", "Am7", "Dm7b5"),
// returns up to `count` distinct voicings as arrays of FretPosition.
export function findChordVoicings(chordName: string, count = 8): FretPosition[][] {
  const info = TonalChord.get(chordName);
  const chordNotes = info.notes;
  if (chordNotes.length < 2) return [];

  const voicings: FretPosition[][] = [];
  const seen = new Set<string>();

  // Slide a 4-fret window across the neck
  for (let startFret = 0; startFret <= 9 && voicings.length < count; startFret++) {
    const windowMax = Math.min(startFret + 3, FRET_COUNT);
    const voicing: FretPosition[] = [];

    for (let s = 0; s < STRING_COUNT; s++) {
      // Try each fret in the window (lowest first)
      for (let f = startFret; f <= windowMax; f++) {
        const note = fretToNote(s, f);
        if (noteInChord(note, chordNotes)) {
          voicing.push({ string: s, fret: f });
          break;
        }
      }
    }

    // All chord notes must appear in the voicing, and ≥3 strings must be used
    const allCovered = chordNotes.every(cn =>
      voicing.some(p => samePitch(fretToNote(p.string, p.fret), cn))
    );
    if (!allCovered || voicing.length < 3) continue;

    const hash = voicing.map(p => `${p.string}:${p.fret}`).join(',');
    if (!seen.has(hash)) {
      seen.add(hash);
      voicings.push([...voicing]);
    }
  }

  return voicings;
}
