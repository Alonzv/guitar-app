// ── Ear Training — exercise engine ──────────────────────────────────────────
// Everything here works in ABSOLUTE MIDI, never in raw fret coordinates. That
// is what lets answers validate by pitch (an octave found on an open string is
// as correct as the one five frets up) and it makes the G→B string half-step
// shift fall out for free — the shift lives in OPEN_MIDI, so any shape derived
// from these numbers is already B-string-aware.

import { INTERVAL_ORDER, SEMITONES } from './data';
import type { IntervalId } from './data';

/** Standard tuning open-string MIDI, index 0 = low E (E2). */
export const OPEN_MIDI = [40, 45, 50, 55, 59, 64] as const;
export const N_STRINGS = 6;
export const FRET_MAX = 12;          // hard ceiling — nothing is ever placed past fret 12
export const WINDOW = 5;             // frets shown in the dynamic (windowed) view

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export interface Pos { string: number; fret: number }

export const midiAt = (string: number, fret: number): number => OPEN_MIDI[string] + fret;
export const noteName = (midi: number): string => NOTE_NAMES[((midi % 12) + 12) % 12];
export const noteWithOctave = (midi: number): string => `${noteName(midi)}${Math.floor(midi / 12) - 1}`;

export type Direction = 'asc' | 'desc';
export type PlayMode = 'melodic' | 'harmonic';

export interface Exercise {
  interval: IntervalId;
  semitones: number;
  root: Pos;
  rootMidi: number;
  targetMidi: number;
  direction: Direction;   // where the second note sits relative to the root
  mode: PlayMode;
  winStart: number;       // first fret column shown (>= 0)
  winEnd: number;         // last fret column shown (<= 12)
  targetPositions: Pos[]; // every position inside the window whose pitch == target
}

function rnd(n: number): number {
  return Math.floor(Math.random() * n);
}

/** All board positions (fret 0-12) whose pitch equals `midi`. */
function positionsForMidi(midi: number): Pos[] {
  const out: Pos[] = [];
  for (let s = 0; s < N_STRINGS; s++) {
    const f = midi - OPEN_MIDI[s];
    if (f >= 0 && f <= FRET_MAX) out.push({ string: s, fret: f });
  }
  return out;
}

/**
 * Build one exercise for a given interval / direction / playback mode.
 * Retries with fresh random roots until it finds a root whose target note is
 * reachable inside a single 5-fret window (both notes ≤ fret 12).
 */
export function makeExercise(
  interval: IntervalId,
  direction: Direction,
  mode: PlayMode,
): Exercise {
  const semitones = SEMITONES[interval];
  const dirSign = direction === 'asc' ? 1 : -1;
  const maxStart = FRET_MAX - WINDOW + 1; // 8

  for (let attempt = 0; attempt < 600; attempt++) {
    const rootString = rnd(N_STRINGS);
    const rootFret = rnd(FRET_MAX + 1);
    const rootMidi = midiAt(rootString, rootFret);
    const targetMidi = rootMidi + dirSign * semitones;

    const targets = positionsForMidi(targetMidi);
    if (targets.length === 0) continue;

    // Windows (5 frets) that include the root fret AND at least one target fret.
    const valid: number[] = [];
    for (let ws = 0; ws <= maxStart; ws++) {
      const we = ws + WINDOW - 1;
      if (rootFret < ws || rootFret > we) continue;
      if (targets.some(t => t.fret >= ws && t.fret <= we)) valid.push(ws);
    }
    if (valid.length === 0) continue;

    const winStart = valid[rnd(valid.length)];
    const winEnd = winStart + WINDOW - 1;
    const targetPositions = targets.filter(t => t.fret >= winStart && t.fret <= winEnd);

    return {
      interval, semitones,
      root: { string: rootString, fret: rootFret },
      rootMidi, targetMidi, direction, mode,
      winStart, winEnd, targetPositions,
    };
  }

  // Extremely unlikely fallback: a low root on the A string always works.
  const rootMidi = midiAt(1, 3);
  const targetMidi = rootMidi + dirSign * semitones;
  const targets = positionsForMidi(targetMidi);
  const winStart = Math.max(0, Math.min(maxStart, 3 - 2));
  const winEnd = winStart + WINDOW - 1;
  return {
    interval, semitones,
    root: { string: 1, fret: 3 },
    rootMidi, targetMidi, direction, mode,
    winStart, winEnd,
    targetPositions: targets.filter(t => t.fret >= winStart && t.fret <= winEnd),
  };
}

// ── Smart practice weighting ────────────────────────────────────────────────
export interface IntervalStat { correct: number; wrong: number }
export type StatMap = Partial<Record<IntervalId, IntervalStat>>;

/**
 * Non-linear weight for an interval: intervals the user misses often (high
 * error rate) — and ones they've barely seen — get a bigger slice of the
 * probability, so mixed practice self-targets weak spots.
 */
export function intervalWeight(id: IntervalId, stats: StatMap): number {
  const s = stats[id];
  const total = (s?.correct ?? 0) + (s?.wrong ?? 0);
  const errRate = total > 0 ? (s!.wrong / total) : 0.5; // unknown → medium priority
  const unseenBoost = total < 3 ? 1.2 : 0;
  return 1 + errRate * 3.5 + unseenBoost;
}

/** Weighted-random interval pick over an enabled pool, biased to weak spots. */
export function pickWeightedInterval(pool: IntervalId[], stats: StatMap): IntervalId {
  const ids = pool.length ? pool : INTERVAL_ORDER;
  const weights = ids.map(id => intervalWeight(id, stats));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < ids.length; i++) {
    r -= weights[i];
    if (r <= 0) return ids[i];
  }
  return ids[ids.length - 1];
}
