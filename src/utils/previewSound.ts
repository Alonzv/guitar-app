import { Note as TonalNote, Chord as TonalChord } from '@tonaljs/tonal';
import { playChord, playMidi, playInterval, unlockAudio, getSharedContext, getOutputNode, emitNotes } from './audioPlayback';
import type { FretPosition } from '../types/music';

// ── Selection sounds ─────────────────────────────────────────────────────────
// What a choice sounds like the moment you make it: tapping a root plays the
// note, picking a chord plays the chord, landing on an interval plays both
// notes. These are previews — the speaker toggle in the header silences them
// without touching the explicit PLAY buttons, the metronome or the tuner.

const KEY = 'scaleup_sound';
let enabled = (() => { try { return localStorage.getItem(KEY) !== '0'; } catch { return true; } })();
const listeners = new Set<(on: boolean) => void>();

export const soundEnabled = () => enabled;

export function setSoundEnabled(on: boolean) {
  enabled = on;
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* private mode */ }
  listeners.forEach(fn => fn(on));
}

export function subscribeSound(fn: (on: boolean) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** MIDI number for a pitch class placed in a given octave ("Eb", 3 → 51). */
export function pcToMidi(pc: string, octave = 3): number | null {
  const m = TonalNote.midi(`${pc}${octave}`);
  return m ?? null;
}

/** A single note by name — the root you just tapped. */
export function previewNote(pc: string, octave = 3) {
  if (!enabled) return;
  const m = pcToMidi(pc, octave);
  if (m != null) playMidi(m, 0.7);
}

/** A single note by MIDI. */
export function previewMidi(midi: number, dur = 0.7) {
  if (enabled) playMidi(midi, dur);
}

/** A fretted note — the dot you just placed on the neck. */
export function previewFret(pos: FretPosition, openFreqs: number[], capo = 0) {
  if (enabled) playChord([pos], openFreqs, capo);
}

/** A shaped chord on the neck. */
export function previewVoicing(positions: FretPosition[], openFreqs?: number[], capo = 0) {
  if (enabled && positions.length) playChord(positions, openFreqs, capo);
}

/** Two notes by MIDI, one after the other. */
export function previewInterval(a: number, b: number, mode: 'melodic' | 'harmonic' = 'melodic') {
  if (enabled) playInterval(a, b, mode);
}

/**
 * A chord by name, with no shape to play — stacked close above its root and
 * strummed low → high. Used where a tool knows the chord but not a voicing
 * (the extensions table, the wheel, a progression row).
 */
export function previewChordName(name: string, octave = 3) {
  if (!enabled) return;
  const notes = chordMidis(name, octave);
  if (notes.length) strum(notes);
}

/** MIDI notes of a chord name, stacked ascending from its root. */
export function chordMidis(name: string, octave = 3): number[] {
  const c = TonalChord.get(name.replace(/^([A-G][b#]?)M$/, '$1'));
  if (c.empty || !c.tonic) return [];
  const root = pcToMidi(c.tonic, octave);
  if (root == null) return [];
  let prev = root - 1;
  return c.notes.map(n => {
    let m = pcToMidi(TonalNote.pitchClass(n), octave) ?? root;
    while (m <= prev) m += 12;
    prev = m;
    return m;
  });
}

/** A quick run up a set of notes — a scale heard the moment it is picked. */
export function previewRun(midis: number[]) {
  if (enabled && midis.length) strum(midis, 0.11);
}

/** Strum MIDI notes low → high with a soft plucked voice. */
export function strum(midis: number[], gap = 0.05) {
  unlockAudio().then(() => {
    const ctx = getSharedContext();
    const t0 = ctx.currentTime + 0.05;
    midis.forEach((m, i) => pluck(ctx, m, t0 + i * gap));
    emitNotes(midis.map((midi, i) => ({ midi, delayMs: 50 + i * gap * 1000, durMs: Math.max(260, gap * 1000) })));
  });
}

function pluck(ctx: AudioContext, midi: number, t: number) {
  const freq = 440 * Math.pow(2, (midi - 69) / 12);
  const osc = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.value = freq;
  filter.type = 'lowpass';
  filter.frequency.value = Math.min(freq * 5, 4500);
  gain.gain.setValueAtTime(0.001, t);
  gain.gain.linearRampToValueAtTime(0.13, t + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
  osc.connect(filter); filter.connect(gain); gain.connect(getOutputNode());
  osc.start(t); osc.stop(t + 1.25);
}
