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
  if (nonOpen.length === 0) return true;

  const frets   = nonOpen.map(p => p.fret);
  const minFret = Math.min(...frets);
  const maxFret = Math.max(...frets);

  // Index barre covers minFret; everything above needs separate fingers.
  if (maxFret - minFret > 3) return false;

  // Count fingers needed above the barre fret.
  // Consecutive strings at the same fret share one finger (barre/barre-fragment).
  const aboveMin = nonOpen.filter(p => p.fret > minFret);
  const byFret = new Map<number, number[]>();
  for (const p of aboveMin) {
    if (!byFret.has(p.fret)) byFret.set(p.fret, []);
    byFret.get(p.fret)!.push(p.string);
  }

  let extraFingers = 0;
  for (const strings of byFret.values()) {
    const sorted = [...strings].sort((a, b) => a - b);
    let j = 0;
    while (j < sorted.length) {
      let end = j;
      while (end + 1 < sorted.length && sorted[end + 1] === sorted[end] + 1) end++;
      extraFingers++;
      j = end + 1;
    }
  }
  if (extraFingers > 3) return false;

  // Above-barre notes at different frets spanning >3 strings is physically unreachable.
  if (aboveMin.length >= 2) {
    const minStr    = Math.min(...aboveMin.map(p => p.string));
    const maxStr    = Math.max(...aboveMin.map(p => p.string));
    const multiFret = new Set(aboveMin.map(p => p.fret)).size > 1;
    if (maxStr - minStr > 3 && multiFret) return false;
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

  // Always lead with the fullest (most strings), lowest-fret voicing —
  // this guarantees the standard barre chord is never skipped by sampling.
  const maxStrings = Math.max(...allVoicings.map(v => v.length));
  const primaryIdx = allVoicings.findIndex(v => v.length === maxStrings);
  const primary = allVoicings[primaryIdx];
  const rest = allVoicings.filter((_, i) => i !== primaryIdx);

  const result: FretPosition[][] = [primary];
  const need = count - 1;
  if (rest.length <= need) {
    result.push(...rest);
  } else {
    const step = (rest.length - 1) / need;
    for (let i = 0; i < need; i++) {
      result.push(rest[Math.round(i * step)]);
    }
  }
  return result;
}
