import { Chord as TonalChord, Note as TonalNote } from '@tonaljs/tonal';
import type { FretPosition } from '../types/music';
import { fretToNote, STRING_COUNT, FRET_COUNT } from './musicTheory';

// Compare pitches by chroma (0-11) — handles all enharmonics (C#=Db, E#=F, Cb=B, etc.)
function samePitch(a: string, b: string): boolean {
  const ca = TonalNote.chroma(a);
  const cb = TonalNote.chroma(b);
  return ca !== undefined && cb !== undefined && ca === cb;
}

function noteInChord(note: string, chordNotes: string[]): boolean {
  return chordNotes.some(cn => samePitch(note, cn));
}

// Shell voicing: for chords with 4+ notes, only require root + 3rd + 7th.
// This makes extended chords (9th, 11th, 13th) findable on a 4-fret window.
function getRequiredNotes(chordNotes: string[]): string[] {
  if (chordNotes.length <= 3) return chordNotes;
  // indices: 0=root, 1=3rd, 3=7th  (skip 2=5th and any extensions)
  return [chordNotes[0], chordNotes[1], chordNotes[3]].filter(Boolean);
}

// Given a Tonal.js chord name (e.g. "CM", "Am7", "Dm11"),
// returns up to `count` distinct voicings as arrays of FretPosition.
export function findChordVoicings(chordName: string, count = 8): FretPosition[][] {
  const info = TonalChord.get(chordName);
  const chordNotes = info.notes;
  if (chordNotes.length < 2) return [];

  const required = getRequiredNotes(chordNotes);
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

    // Required notes (shell voicing) must all appear, and ≥3 strings must be used
    const requiredCovered = required.every(rn =>
      voicing.some(p => samePitch(fretToNote(p.string, p.fret), rn))
    );
    if (!requiredCovered || voicing.length < 3) continue;

    const hash = voicing.map(p => `${p.string}:${p.fret}`).join(',');
    if (!seen.has(hash)) {
      seen.add(hash);
      voicings.push([...voicing]);
    }
  }

  return voicings;
}
