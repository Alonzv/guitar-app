import { Chord, Note } from '@tonaljs/tonal';
import type { FretPosition } from '../../types/music';
import { fretToNote } from '../../utils/musicTheory';
import { formatChordName } from '../../utils/chordIdentifier';

// ── What the Chord Builder shows about a chord ───────────────────────────────
// The poster splits the name into its root and its suffix; the formula lists
// degree over note and picks the one tone that makes the chord what it is
// (the ♭3 of a minor chord, the 7 of a seventh…); dots on a diagram carry the
// same degrees.

export const DEGREE: Record<string, string> = {
  '1P': '1', '2m': '♭2', '2M': '2', '2A': '♯2',
  '3m': '♭3', '3M': '3', '4P': '4', '4A': '♯4',
  '5d': '♭5', '5P': '5', '5A': '♯5', '6m': '♭6',
  '6M': '6', '7d': '𝄫7', '7m': '♭7', '7M': '7', '8P': '8',
  '9m': '♭9', '9M': '9', '9A': '♯9', '11P': '11',
  '11A': '♯11', '13m': '♭13', '13M': '13',
};

export const DEGREE_NAME: Record<string, string> = {
  '1P': 'Root', '3m': 'Minor 3rd', '3M': 'Major 3rd',
  '4P': '4th', '4A': 'Tritone', '5d': 'Dim 5th',
  '5P': '5th', '5A': 'Aug 5th', '2m': '♭2nd',
  '2M': '2nd', '6m': '♭6th', '6M': '6th', '7d': 'Dim 7th',
  '7m': 'Minor 7th', '7M': 'Major 7th', '9M': '9th',
  '9m': '♭9th', '11P': '11th', '13M': '13th',
};

/** "C#m7" → ["C#", "m7"]; the root stays solid, the suffix is outlined. */
export function splitName(name: string): [string, string] {
  const shown = formatChordName(name);
  const m = shown.match(/^([A-G][#b♯♭]?)(.*)$/);
  return m ? [m[1], m[2]] : [shown, ''];
}

/** The tone that defines the chord's quality, as an index into its intervals. */
function definingIndex(intervals: string[]): number {
  const ext = intervals.map((iv, i) => ({ iv, i })).filter(({ iv }) => /^(6|7|9|11|13)/.test(iv));
  if (ext.length) return ext[ext.length - 1].i;
  const pick = (re: RegExp) => intervals.findIndex(iv => re.test(iv));
  const altered5 = pick(/^5[dA]$/);
  if (altered5 >= 0) return altered5;
  const sus = pick(/^(2M|4P)$/);
  if (sus >= 0 && pick(/^3/) < 0) return sus;
  return pick(/^3/);
}

export interface FormulaTone { degree: string; note: string; name: string }

export function chordFormula(name: string): { tones: FormulaTone[]; mark: number } | null {
  const data = Chord.get(name);
  if (data.empty || !data.notes.length) return null;
  const tones = data.notes.map((n, i) => {
    const iv = data.intervals[i] ?? '';
    return { degree: DEGREE[iv] ?? iv, note: Note.simplify(n) || n, name: DEGREE_NAME[iv] ?? '' };
  });
  return { tones, mark: definingIndex(data.intervals) };
}

/** chroma (0–11) → degree label for the chord's tones. */
export function degreeByChroma(name: string): Map<number, string> {
  const map = new Map<number, string>();
  const data = Chord.get(name);
  if (data.empty) return map;
  data.notes.forEach((n, i) => {
    const c = Note.chroma(n);
    if (c != null) map.set(c, DEGREE[data.intervals[i]] ?? '');
  });
  return map;
}

/** Degree label for each placed note of a shape (falls back to the note name). */
export function degreeLabels(voicing: FretPosition[], name: string | null | undefined, tuning?: string[], capo = 0): string[] {
  const map = name ? degreeByChroma(name) : new Map<number, string>();
  return voicing.map(p => {
    const note = fretToNote(p.string, p.fret, tuning, capo);
    const c = Note.chroma(note);
    return (c != null && map.get(c)) || note;
  });
}

/** SHAPE / FRETS / NOTES for the meta row: "x32010", "0–3", "C E G". */
export function shapeMeta(voicing: FretPosition[], tuning?: string[], capo = 0) {
  const byString = Array.from({ length: 6 }, (_, s) => voicing.find(p => p.string === s));
  const shape = byString.map(p => (p ? (p.fret > 9 ? `(${p.fret})` : String(p.fret)) : 'x')).join('');
  const frets = voicing.map(p => p.fret);
  const lo = frets.length ? Math.min(...frets) : 0, hi = frets.length ? Math.max(...frets) : 0;
  const notes = [...byString].filter((p): p is FretPosition => !!p).map(p => fretToNote(p.string, p.fret, tuning, capo));
  return { shape, frets: lo === hi ? String(lo) : `${lo}–${hi}`, notes: [...new Set(notes)].join(' ') };
}
