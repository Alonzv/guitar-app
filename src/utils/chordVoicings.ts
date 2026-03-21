import { Chord as TonalChord, Note as TonalNote } from '@tonaljs/tonal';
import type { FretPosition } from '../types/music';
import { fretToNote, STRING_COUNT, FRET_COUNT, TUNINGS } from './musicTheory';

function samePitch(a: string, b: string): boolean {
  const ca = TonalNote.chroma(a);
  const cb = TonalNote.chroma(b);
  return ca !== undefined && cb !== undefined && ca === cb;
}

function noteInChord(note: string, chordNotes: string[]): boolean {
  return chordNotes.some(cn => samePitch(note, cn));
}

// Shell voicing: for chords with 4+ notes, only require root + 3rd + 7th.
function getRequiredNotes(chordNotes: string[]): string[] {
  if (chordNotes.length <= 3) return chordNotes;
  return [chordNotes[0], chordNotes[1], chordNotes[3]].filter(Boolean);
}

function isPlayable(voicing: FretPosition[]): boolean {
  if (voicing.length < 4) return false;

  const nonOpen = voicing.filter(p => p.fret > 0);
  if (nonOpen.length > 1) {
    const frets = nonOpen.map(p => p.fret);
    if (Math.max(...frets) - Math.min(...frets) > 3) return false;
  }

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

/** Average fret of non-open notes — used to measure neck position */
function avgFret(voicing: FretPosition[]): number {
  const nonOpen = voicing.filter(p => p.fret > 0);
  if (nonOpen.length === 0) return 0;
  return nonOpen.reduce((s, p) => s + p.fret, 0) / nonOpen.length;
}

export function findChordVoicings(
  chordName: string,
  count = 6,
  tuning: string[] = TUNINGS[0].notes,
): FretPosition[][] {
  const info = TonalChord.get(chordName);
  const chordNotes = info.notes;
  if (chordNotes.length < 2) return [];

  const required = getRequiredNotes(chordNotes);
  const allVoicings: FretPosition[][] = [];
  const seen = new Set<string>();

  // Scan the FULL neck — never stop early
  for (let startFret = 0; startFret <= 12; startFret++) {
    const windowMax = Math.min(startFret + 3, FRET_COUNT);
    const voicing: FretPosition[] = [];

    for (let s = 0; s < STRING_COUNT; s++) {
      for (let f = startFret; f <= windowMax; f++) {
        const note = fretToNote(s, f, tuning);
        if (noteInChord(note, chordNotes)) {
          voicing.push({ string: s, fret: f });
          break;
        }
      }
    }

    const requiredCovered = required.every(rn =>
      voicing.some(p => samePitch(fretToNote(p.string, p.fret, tuning), rn))
    );
    if (!requiredCovered || !isPlayable(voicing)) continue;

    const hash = voicing.map(p => `${p.string}:${p.fret}`).join(',');
    if (!seen.has(hash)) {
      seen.add(hash);
      allVoicings.push([...voicing]);
    }
  }

  if (allVoicings.length <= count) return allVoicings;

  // Sort by average fret position so we can pick a neck-spread selection
  allVoicings.sort((a, b) => avgFret(a) - avgFret(b));

  // Pick `count` evenly-distributed voicings across the sorted list
  const step = (allVoicings.length - 1) / (count - 1);
  const result: FretPosition[][] = [];
  for (let i = 0; i < count; i++) {
    result.push(allVoicings[Math.round(i * step)]);
  }
  return result;
}
