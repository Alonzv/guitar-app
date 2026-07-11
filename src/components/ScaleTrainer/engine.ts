// ── Scale Speller — spelling engine ─────────────────────────────────────────
// The core rule here is STRICT ENHARMONIC SPELLING: a scale must use each
// letter the theory demands, so the 3rd of C minor is Eb — never D#. Spelling
// is therefore computed from letters first (each degree advances the letter),
// and the accidental is whatever bends that letter onto the required pitch.
// Roots that would need double accidentals (e.g. D# major → F##) are excluded,
// since the note bank only offers single sharps/flats.

import { SCALE_ORDER } from './data';
import type { ScaleId } from './data';

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** The full no-duplicates note bank (all valid single-accidental names). */
export const NOTE_BANK = [
  'C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B',
] as const;

export interface ScaleShape {
  /** Semitones of each degree above the root (root itself included as 0). */
  semis: number[];
  /** How many letters each degree advances past the root letter. */
  letterSteps: number[];
}

// Pentatonic spellings derive from their parent 7-note scale (degrees
// 1-2-3-5-6 of major; 1-b3-4-5-b7 of minor), which is what pins each note to
// the theoretically correct letter.
export const SHAPES: Record<ScaleId, ScaleShape> = {
  major:            { semis: [0, 2, 4, 5, 7, 9, 11], letterSteps: [0, 1, 2, 3, 4, 5, 6] },
  natural_minor:    { semis: [0, 2, 3, 5, 7, 8, 10], letterSteps: [0, 1, 2, 3, 4, 5, 6] },
  major_pentatonic: { semis: [0, 2, 4, 7, 9],        letterSteps: [0, 1, 2, 4, 5] },
  minor_pentatonic: { semis: [0, 3, 5, 7, 10],       letterSteps: [0, 2, 3, 4, 6] },
};

export function parseNote(name: string): { letter: string; acc: number } {
  const letter = name[0];
  const rest = name.slice(1);
  const acc = rest === '#' ? 1 : rest === 'b' ? -1 : rest === '##' ? 2 : rest === 'bb' ? -2 : 0;
  return { letter, acc };
}

/** Pitch class 0-11 of a spelled note name. */
export function pcOf(name: string): number {
  const { letter, acc } = parseNote(name);
  return ((LETTER_PC[letter] + acc) % 12 + 12) % 12;
}

const ACC_STR: Record<number, string> = { [-2]: 'bb', [-1]: 'b', 0: '', 1: '#', 2: '##' };

/**
 * Spell a scale from a root with theoretically correct enharmonics.
 * Returns null when any degree would need a double accidental.
 */
export function spellScale(root: string, scale: ScaleId): string[] | null {
  const { semis, letterSteps } = SHAPES[scale];
  const rootLetterIdx = LETTERS.indexOf(parseNote(root).letter as typeof LETTERS[number]);
  const rootPc = pcOf(root);
  const out: string[] = [];

  for (let i = 0; i < semis.length; i++) {
    const letter = LETTERS[(rootLetterIdx + letterSteps[i]) % 7];
    const targetPc = (rootPc + semis[i]) % 12;
    let acc = targetPc - LETTER_PC[letter];
    if (acc > 6) acc -= 12;
    if (acc < -6) acc += 12;
    if (Math.abs(acc) > 1) return null; // would need a double accidental
    out.push(letter + ACC_STR[acc]);
  }
  return out;
}

/**
 * Roots whose spelling for the given scale is fully answerable from the note
 * bank — no double accidentals, and none of E#/B#/Cb/Fb (correct in theory for
 * keys like F# major, but not offered as answers, so those keys are skipped).
 */
export function validRoots(scale: ScaleId): string[] {
  const bank = NOTE_BANK as readonly string[];
  return NOTE_BANK.filter(r => {
    const notes = spellScale(r, scale);
    return notes !== null && notes.every(n => bank.includes(n));
  });
}

// ── Practice challenges ──────────────────────────────────────────────────────
export interface Challenge {
  scale: ScaleId;
  root: string;
  notes: string[];       // the correct spelling, notes[0] === root
}

function rnd(n: number): number {
  return Math.floor(Math.random() * n);
}

export function makeChallenge(scale: ScaleId): Challenge {
  const roots = validRoots(scale);
  const root = roots[rnd(roots.length)];
  return { scale, root, notes: spellScale(root, scale)! };
}

// ── Smart practice weighting (mirrors the ear-training engine) ──────────────
export interface ScaleStat { correct: number; wrong: number }
export type StatMap = Partial<Record<ScaleId, ScaleStat>>;

/**
 * Non-linear weight per scale: scales the user misspells often — and ones
 * they've barely seen — get a bigger slice of the probability, so practice
 * self-targets weak spots.
 */
export function scaleWeight(id: ScaleId, stats: StatMap): number {
  const s = stats[id];
  const total = (s?.correct ?? 0) + (s?.wrong ?? 0);
  const errRate = total > 0 ? (s!.wrong / total) : 0.5; // unknown → medium priority
  const unseenBoost = total < 3 ? 1.2 : 0;
  return 1 + errRate * 3.5 + unseenBoost;
}

export function pickWeightedScale(stats: StatMap): ScaleId {
  const weights = SCALE_ORDER.map(id => scaleWeight(id, stats));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < SCALE_ORDER.length; i++) {
    r -= weights[i];
    if (r <= 0) return SCALE_ORDER[i];
  }
  return SCALE_ORDER[SCALE_ORDER.length - 1];
}

// ── Fretboard placement ──────────────────────────────────────────────────────
/** Standard tuning open-string MIDI, index 0 = low E (E2). */
export const OPEN_MIDI = [40, 45, 50, 55, 59, 64] as const;
export const N_STRINGS = 6;
export const BOX_WINDOW = 5;

export interface BoxPlacement {
  winStart: number;      // first fret of the 5-fret window
  rootMidi: number;      // the root the box is anchored to
}

/**
 * Anchor a one-octave box on the low E or A string so the whole window sits
 * between the nut and fret 12.
 */
export function placeBox(root: string): BoxPlacement {
  const rootPc = pcOf(root);
  // Prefer the low E string; fall back to A when the root would sit too high.
  for (const s of [0, 1]) {
    const openPc = OPEN_MIDI[s] % 12;
    const fret = ((rootPc - openPc) % 12 + 12) % 12;
    const winStart = Math.max(0, fret - 1);
    if (winStart + BOX_WINDOW - 1 <= 12 && fret <= 8) {
      return { winStart, rootMidi: OPEN_MIDI[s] + fret };
    }
  }
  // Always resolvable on the A string within fret 11.
  const fret = ((rootPc - OPEN_MIDI[1] % 12) % 12 + 12) % 12;
  return { winStart: Math.min(Math.max(0, fret - 1), 12 - BOX_WINDOW + 1), rootMidi: OPEN_MIDI[1] + fret };
}

export interface BoxDot { string: number; fret: number; label: string; isRoot: boolean }

/** Every position inside the window whose pitch class is in the scale. */
export function boxDots(notes: string[], winStart: number): BoxDot[] {
  const byPc = new Map<number, { label: string; isRoot: boolean }>();
  notes.forEach((n, i) => byPc.set(pcOf(n), { label: n, isRoot: i === 0 }));
  const out: BoxDot[] = [];
  for (let s = 0; s < N_STRINGS; s++) {
    for (let f = winStart; f < winStart + BOX_WINDOW; f++) {
      const info = byPc.get((OPEN_MIDI[s] + f) % 12);
      if (info) out.push({ string: s, fret: f, label: info.label, isRoot: info.isRoot });
    }
  }
  return out;
}

/**
 * String for the one-string (linear) Learn diagram: low E or A, whichever puts
 * the root on a fretted, low position (fret 1-7) so the pattern reads left→right.
 */
export function linearString(root: string): number {
  const rootPc = pcOf(root);
  const fretOnE = ((rootPc - OPEN_MIDI[0] % 12) % 12 + 12) % 12;
  if (fretOnE >= 1 && fretOnE <= 7) return 0;
  return 1;
}

/** One-octave MIDI run (root → octave) anchored to the box root. */
export function scaleMidiRun(scale: ScaleId, rootMidi: number): number[] {
  return [...SHAPES[scale].semis.map(s => rootMidi + s), rootMidi + 12];
}
