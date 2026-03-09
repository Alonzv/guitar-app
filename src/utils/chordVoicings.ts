import { Chord as TonalChord, Note as TonalNote } from '@tonaljs/tonal';
import type { FretPosition } from '../types/music';
import { fretToNote, STRING_COUNT, FRET_COUNT, TUNINGS } from './musicTheory';

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
// Returns true if a voicing is physically playable on a guitar:
// – at least 4 strings used
// – non-open frets span at most 3 frets (comfortable 4-fret window)
// – no large internal string gap (≥3 consecutive unused strings between played ones)
function isPlayable(voicing: FretPosition[]): boolean {
  if (voicing.length < 4) return false;

  const nonOpen = voicing.filter(p => p.fret > 0);
  if (nonOpen.length > 1) {
    const frets = nonOpen.map(p => p.fret);
    if (Math.max(...frets) - Math.min(...frets) > 3) return false;
  }

  // Check for ≥3 consecutive muted strings between played strings
  const usedStrings = new Set(voicing.map(p => p.string));
  const minS = Math.min(...usedStrings);
  const maxS = Math.max(...usedStrings);
  let gap = 0;
  for (let s = minS; s <= maxS; s++) {
    if (!usedStrings.has(s)) { gap++; if (gap >= 3) return false; }
    else gap = 0;
  }

  return true;
}

export function findChordVoicings(
  chordName: string,
  count = 4,
  tuning: string[] = TUNINGS[0].notes,
): FretPosition[][] {
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
        const note = fretToNote(s, f, tuning);
        if (noteInChord(note, chordNotes)) {
          voicing.push({ string: s, fret: f });
          break;
        }
      }
    }

    // Required notes must all appear, and voicing must be physically playable
    const requiredCovered = required.every(rn =>
      voicing.some(p => samePitch(fretToNote(p.string, p.fret, tuning), rn))
    );
    if (!requiredCovered || !isPlayable(voicing)) continue;

    const hash = voicing.map(p => `${p.string}:${p.fret}`).join(',');
    if (!seen.has(hash)) {
      seen.add(hash);
      voicings.push([...voicing]);
    }
  }

  return voicings;
}
