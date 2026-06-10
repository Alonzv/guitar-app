import {
  BasicPitch,
  noteFramesToTime,
  outputToNotesPoly,
  addPitchBendsToNoteEvents,
} from '@spotify/basic-pitch';
import Anthropic from '@anthropic-ai/sdk';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DetectedNote {
  startTime: number;
  endTime: number;
  midiNote: number;
  confidence: number;
  frequency: number;
}

export type InstrumentType = 'acoustic' | 'electric' | 'bass' | 'ukulele';
export type MixType        = 'solo' | 'full_mix';

export interface TranscribeConfig {
  instrument: InstrumentType;
  mixType:    MixType;
}

export interface TabEvent {
  column: number;       // x-index in the tab grid
  string: number;       // 0 = low E, 5 = high e
  fret: number;         // 0–22
  midiNote: number;
  startTime: number;
  duration: number;
}

export interface TabData {
  events: TabEvent[];
  totalColumns: number;
  gridMs: number;
  title: string;
  duration: number;
  waveform: Float32Array;
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const OPEN_MIDI    = [40, 45, 50, 55, 59, 64] as const;
export const STRING_NAMES = ['e', 'B', 'G', 'D', 'A', 'E'] as const;
export const DISPLAY_ORDER = [5, 4, 3, 2, 1, 0] as const;

const MAX_FRET = 22;

// Basic Pitch model path (served from public/)
const MODEL_URL = '/basic-pitch/model.json';

// Singleton — model loads once, reused across calls
let _bp: BasicPitch | null = null;
function getBasicPitch(): BasicPitch {
  if (!_bp) _bp = new BasicPitch(MODEL_URL);
  return _bp;
}

// Per-instrument Basic Pitch params
// minNoteLen is in frames at 86 fps (22050/256): 8 ≈ 93 ms, avoids glitch notes
// maxMidi = 81 (A5, fret 17 on high e) — notes above this are almost always octave errors
const INSTRUMENT_PARAMS: Record<InstrumentType, {
  minFreq: number; maxFreq: number; minMidi: number; maxMidi: number;
  onsetThresh: number; frameThresh: number; minNoteLen: number; minAmp: number;
}> = {
  acoustic: { minFreq: 70,  maxFreq: 1109, minMidi: 40, maxMidi: 81, onsetThresh: 0.58, frameThresh: 0.38, minNoteLen: 8,  minAmp: 0.42 },
  electric: { minFreq: 70,  maxFreq: 1109, minMidi: 40, maxMidi: 81, onsetThresh: 0.52, frameThresh: 0.32, minNoteLen: 7,  minAmp: 0.38 },
  bass:     { minFreq: 30,  maxFreq: 430,  minMidi: 28, maxMidi: 67, onsetThresh: 0.46, frameThresh: 0.28, minNoteLen: 8,  minAmp: 0.32 },
  ukulele:  { minFreq: 240, maxFreq: 1000, minMidi: 48, maxMidi: 84, onsetThresh: 0.62, frameThresh: 0.40, minNoteLen: 6,  minAmp: 0.45 },
};

// ── Frequency helpers ─────────────────────────────────────────────────────────

export function freqToMidi(freq: number): number {
  return Math.round(69 + 12 * Math.log2(freq / 440));
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// ── Fingering helpers ─────────────────────────────────────────────────────────

export function findPositions(midiNote: number): Array<{ string: number; fret: number }> {
  const result: Array<{ string: number; fret: number }> = [];
  for (let s = 0; s < 6; s++) {
    const fret = midiNote - OPEN_MIDI[s];
    if (fret >= 0 && fret <= MAX_FRET) result.push({ string: s, fret });
  }
  return result;
}

/**
 * Heuristic note cleanup applied before fingering:
 *  1. Merge consecutive same-pitch notes separated by < 80 ms (sustain re-triggers)
 *  2. Deduplicate notes at the same pitch within a 100 ms window (phantom detections)
 */
export function cleanupNotes(notes: DetectedNote[]): DetectedNote[] {
  if (notes.length === 0) return notes;

  const MERGE_GAP_S = 0.08;
  const DEDUP_WIN_S = 0.10;

  const sorted = [...notes].sort((a, b) => a.startTime - b.startTime);

  // Pass 1 — merge consecutive same-pitch notes with tiny gaps
  const merged: DetectedNote[] = [];
  for (const note of sorted) {
    const prev = merged[merged.length - 1];
    if (prev && prev.midiNote === note.midiNote && note.startTime - prev.endTime < MERGE_GAP_S) {
      prev.endTime = Math.max(prev.endTime, note.endTime);
    } else {
      merged.push({ ...note });
    }
  }

  // Pass 2 — deduplicate: same MIDI within 100 ms window → keep higher confidence
  const out: DetectedNote[] = [];
  for (const note of merged) {
    const idx = out.findIndex(n =>
      n.midiNote === note.midiNote &&
      Math.abs(n.startTime - note.startTime) < DEDUP_WIN_S,
    );
    if (idx === -1) {
      out.push(note);
    } else if (note.confidence > out[idx].confidence) {
      out[idx] = note;
    }
  }

  return out;
}

/**
 * Harmonic-phantom suppression for piano_transcription server output.
 *
 * A plucked guitar string rings with strong overtones (2nd/3rd/4th/5th
 * harmonics = +12/+19/+24/+28 semitones). The piano model often transcribes
 * these as separate simultaneous notes. A note is considered a phantom when
 * a lower note exists at one of those exact offsets, starting within 80 ms,
 * and the upper note is not clearly louder than its fundamental.
 */
export function suppressHarmonics(notes: DetectedNote[]): DetectedNote[] {
  const HARMONIC_OFFSETS = [12, 19, 24, 28];
  const ONSET_WIN_S = 0.08;

  const sorted = [...notes].sort((a, b) => a.startTime - b.startTime);
  return sorted.filter(n => {
    const isPhantom = sorted.some(base =>
      base !== n &&
      HARMONIC_OFFSETS.includes(n.midiNote - base.midiNote) &&
      Math.abs(base.startTime - n.startTime) < ONSET_WIN_S &&
      base.confidence >= n.confidence * 0.9,
    );
    return !isPhantom;
  });
}

/**
 * Octave-constrain: if a note can only be played above fret 12 on every string,
 * drop it one octave (−12 semitones). This catches Basic Pitch octave errors
 * before they reach the fingering engine.
 * Notes that still can't land on fret ≤ 15 after the shift are removed entirely.
 */
export function constrainOctaves(notes: DetectedNote[]): DetectedNote[] {
  const MAX_OK_FRET = 12;
  const out: DetectedNote[] = [];
  for (const note of notes) {
    const positions = findPositions(note.midiNote);
    if (positions.some(p => p.fret <= MAX_OK_FRET)) {
      out.push(note);
      continue;
    }
    // All positions require fret > 12 → try one octave down
    const lower = note.midiNote - 12;
    if (lower >= 40) {
      const lowerPos = findPositions(lower);
      if (lowerPos.some(p => p.fret <= MAX_OK_FRET)) {
        out.push({ ...note, midiNote: lower, frequency: midiToFreq(lower) });
        continue;
      }
    }
    // Can't be played reasonably — discard
  }
  return out;
}

/**
 * Beam-search fingering optimiser.
 * Evaluates all possible (string, fret) sequences for a note sequence and
 * returns the path with minimum total hand-movement cost.
 * Penalises position shifts > 4 frets (hand repositioning).
 */
export function optimizeFingeringPath(
  notes: DetectedNote[],
): Array<{ string: number; fret: number }> {
  if (notes.length === 0) return [];

  const BEAM         = 4;
  const SPAN         = 4;
  const SHIFT_PEN    = 5;    // per-fret penalty for moves beyond SPAN
  const TREBLE_W     = 0.3;  // prefer higher strings for single-note melody
  const HIGH_FRET_PEN = 3.0; // strongly prefer positions with fret ≤ 12 (octave errors land high)

  type State = { pos: { string: number; fret: number }; cost: number; prev: State | null };

  const allCands = notes.map(n => {
    const p = findPositions(n.midiNote);
    return p.length > 0 ? p : [{ string: 5, fret: Math.max(0, n.midiNote - OPEN_MIDI[5]) }];
  });

  const posCost = (pos: { string: number; fret: number }) =>
    (5 - pos.string) * TREBLE_W + Math.max(0, pos.fret - 12) * HIGH_FRET_PEN;

  let beam: State[] = allCands[0]
    .map(pos => ({ pos, cost: posCost(pos), prev: null }))
    .sort((a, b) => a.cost - b.cost)
    .slice(0, BEAM);

  for (let i = 1; i < allCands.length; i++) {
    const next: State[] = [];
    for (const s of beam) {
      for (const pos of allCands[i]) {
        const fd    = Math.abs(pos.fret - s.pos.fret);
        const sd    = Math.abs(pos.string - s.pos.string);
        const extra = Math.max(0, fd - SPAN) * SHIFT_PEN;
        next.push({ pos, cost: s.cost + fd * 2 + sd + extra + posCost(pos), prev: s });
      }
    }
    beam = next.sort((a, b) => a.cost - b.cost).slice(0, BEAM);
  }

  // Reconstruct best path
  const path: Array<{ string: number; fret: number }> = [];
  let cur: State | null = beam[0] ?? null;
  while (cur) { path.unshift(cur.pos); cur = cur.prev; }
  return path;
}

// ── Mono downmix (for waveform display) ──────────────────────────────────────

function downmixToMono(buf: AudioBuffer): Float32Array {
  const len  = buf.length;
  const ch   = buf.numberOfChannels;
  const mono = new Float32Array(len);
  if (ch === 1) {
    mono.set(buf.getChannelData(0));
  } else {
    for (let c = 0; c < ch; c++) {
      const data = buf.getChannelData(c);
      for (let i = 0; i < len; i++) mono[i] += data[i] / ch;
    }
  }
  let peak = 0;
  for (let i = 0; i < len; i++) { const a = Math.abs(mono[i]); if (a > peak) peak = a; }
  if (peak > 1e-6) for (let i = 0; i < len; i++) mono[i] /= peak;
  return mono;
}

// ── Waveform envelope (for display) ──────────────────────────────────────────

export function buildWaveform(buf: AudioBuffer, points = 200): Float32Array {
  const mono   = downmixToMono(buf);
  const step   = Math.floor(mono.length / points);
  const result = new Float32Array(points);
  let maxAmp   = 1e-6;
  for (let i = 0; i < points; i++) {
    let sum = 0;
    for (let j = 0; j < step; j++) sum += Math.abs(mono[i * step + j] || 0);
    result[i] = sum / step;
    if (result[i] > maxAmp) maxAmp = result[i];
  }
  for (let i = 0; i < points; i++) result[i] /= maxAmp;
  return result;
}

// ── Main transcription (Basic Pitch neural network) ───────────────────────────

export async function transcribeAudioBuffer(
  audioBuffer: AudioBuffer,
  onProgress?: (pct: number) => void,
  config: TranscribeConfig = { instrument: 'acoustic', mixType: 'solo' },
): Promise<DetectedNote[]> {
  const TARGET_SR    = 22050;
  const targetLength = Math.ceil(audioBuffer.duration * TARGET_SR);

  // Basic Pitch requires mono Float32Array at exactly 22050 Hz
  const offlineCtx = new OfflineAudioContext(1, targetLength, TARGET_SR);
  const source     = offlineCtx.createBufferSource();
  source.buffer    = audioBuffer;
  source.connect(offlineCtx.destination);
  source.start();
  const resampled = await offlineCtx.startRendering();
  const mono      = resampled.getChannelData(0);

  const bp = getBasicPitch();

  const frames:   number[][] = [];
  const onsets:   number[][] = [];
  const contours: number[][] = [];

  await bp.evaluateModel(
    mono,
    (f, o, c) => { frames.push(...f); onsets.push(...o); contours.push(...c); },
    (pct) => onProgress?.(Math.round(pct * 72)),
  );

  const p = INSTRUMENT_PARAMS[config.instrument];

  const noteEvents = outputToNotesPoly(
    frames,
    onsets,
    p.onsetThresh,
    p.frameThresh,
    p.minNoteLen,
    true,                          // inferOnsets
    p.maxFreq,
    p.minFreq,
    config.mixType === 'solo',     // melodiaTrick — on for solo, off for full mix
  );

  const timedNotes = noteFramesToTime(addPitchBendsToNoteEvents(contours, noteEvents));

  onProgress?.(75);

  const raw = timedNotes
    .filter(n =>
      n.pitchMidi >= p.minMidi && n.pitchMidi <= p.maxMidi &&
      n.amplitude >= p.minAmp &&        // reject weak phantom detections
      n.durationSeconds >= 0.06,        // reject sub-60 ms glitch notes
    )
    .map(n => ({
      startTime:  n.startTimeSeconds,
      endTime:    n.startTimeSeconds + n.durationSeconds,
      midiNote:   n.pitchMidi,
      confidence: n.amplitude,
      frequency:  midiToFreq(n.pitchMidi),
    }));

  return constrainOctaves(cleanupNotes(raw));
}

// ── AI note refinement ────────────────────────────────────────────────────────

const MIDI_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'] as const;
function midiName(midi: number): string {
  return MIDI_NAMES[midi % 12] + (Math.floor(midi / 12) - 1);
}

/**
 * Uses Claude Sonnet to correct Basic Pitch systematic errors:
 * octave shifts, harmonic phantoms, ghost notes, sustain re-triggers.
 * Input includes note names + confidence so Claude has richer context.
 * Falls back to raw notes if API key absent or call fails.
 */
export async function refineNotesWithAI(
  notes: DetectedNote[],
  onProgress?: (pct: number) => void,
): Promise<DetectedNote[]> {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey || notes.length === 0) {
    onProgress?.(100);
    return notes;
  }

  // Process in slices so very long recordings don't exceed context
  const SLICE = 200;
  const allCleaned: DetectedNote[] = [];

  try {
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

    for (let offset = 0; offset < notes.length; offset += SLICE) {
      const slice = notes.slice(offset, offset + SLICE);

      // [startTime, noteName, midiNote, duration, confidence]
      const input = slice.map(n => [
        Math.round(n.startTime * 100) / 100,
        midiName(n.midiNote),
        n.midiNote,
        Math.round((n.endTime - n.startTime) * 100) / 100,
        Math.round(n.confidence * 100) / 100,
      ]);

      const msg = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        messages: [{
          role: 'user',
          content: `You are an expert guitar transcription editor. A neural pitch detector (Basic Pitch) scanned a solo guitar recording and produced the note sequence below. Your task is to correct its systematic errors and return a clean, musically accurate note list.

GUITAR STANDARD TUNING: E2(40) A2(45) D3(50) G3(55) B3(59) E4(64)
PRACTICAL MELODY RANGE: MIDI 47–84 (frets 0–13 on typical strings). Notes outside this range are suspicious.

BASIC PITCH SYSTEMATIC ERRORS TO FIX:
1. HIGH-FRET OCTAVE ERRORS (most critical): notes with midiNote > 76 (E5) almost
   always represent real notes detected one octave too high. If midiNote > 76,
   subtract 12 unless the result would be < 40. Apply unconditionally — these
   are never correct for standard guitar melodic playing.
2. OCTAVE ERRORS (general): a note jumps ±12 from both its predecessor AND successor.
   Fix: move it ±12 to restore the stepwise melodic line.
3. HARMONIC PHANTOMS: a ghost note appears at exactly +12 or +24 above a real note
   and starts within 60 ms of it. Remove the phantom, keep the lower real note.
4. GHOST NOTES: duration < 0.08 s, confidence < 0.45, and no note within 0.40 s.
   Remove completely.
5. SUSTAIN RE-TRIGGERS: same pitch again within 90 ms of previous note ending.
   Merge (extend first, remove second).
6. MELODIC OUTLIERS: single isolated note jumps > 14 semitones from BOTH neighbours,
   confidence < 0.55. Remove it.

INPUT FORMAT: [startTime_s, noteName, midiNote, duration_s, confidence_0-1]
${JSON.stringify(input)}

Rules:
- Do NOT invent or add notes that were not in the input
- Do NOT change a note's pitch unless fixing an octave error (rule 1)
- Apply rules 1–5 strictly; otherwise preserve all notes unchanged
- Return ONLY valid JSON, no markdown, no explanation

Output format — JSON array only:
[[startTime, midiNote, duration], ...]`,
        }],
      });

      const text = (msg.content[0] as { type: string; text: string }).text.trim();
      const s = text.indexOf('[');
      const e = text.lastIndexOf(']');
      if (s === -1 || e === -1) throw new Error('no JSON array in response');

      const cleaned = JSON.parse(text.slice(s, e + 1)) as [number, number, number][];
      allCleaned.push(
        ...cleaned
          .filter(([, m]) => m >= 40 && m <= 88)
          .map(([t, m, d]) => ({
            startTime:  t,
            endTime:    t + Math.max(0.06, d),
            midiNote:   m,
            confidence: 0.9,
            frequency:  midiToFreq(m),
          })),
      );

      onProgress?.(Math.round(((offset + slice.length) / notes.length) * 100));
    }

    return allCleaned;
  } catch (err) {
    console.warn('[refineNotesWithAI] failed, using raw notes:', err);
    onProgress?.(100);
    return notes;
  }
}

// ── Notes → tab events ────────────────────────────────────────────────────────

/**
 * Converts detected notes to a compact, playable guitar tab.
 *
 * Column mapping is NOTE-RELATIVE (not time-absolute):
 *   - Notes within 80 ms → same column (chord)
 *   - Gaps → proportional but capped at 4 columns max
 *
 * Fingering uses beam-search optimisation for single-note runs and
 * conflict-free greedy assignment for chords.
 */
export function notesToTab(
  notes: DetectedNote[],
  gridMs = 200,
  title = 'Untitled',
  duration = 0,
): TabData {
  if (notes.length === 0) {
    return { events: [], totalColumns: 0, gridMs, title, duration, waveform: new Float32Array(0) };
  }

  const CHORD_MERGE_S = 0.08;
  const MIN_GAP       = 1;
  const MAX_GAP       = 2;

  const sorted = constrainOctaves(cleanupNotes([...notes].sort((a, b) => a.startTime - b.startTime)));

  // Group into simultaneous "chords"
  interface Group { time: number; notes: DetectedNote[] }
  const groups: Group[] = [];
  for (const note of sorted) {
    const last = groups[groups.length - 1];
    if (last && note.startTime - last.time <= CHORD_MERGE_S) {
      last.notes.push(note);
    } else {
      groups.push({ time: note.startTime, notes: [note] });
    }
  }

  // Assign sequential columns
  let col = 0;
  const colByGroup: number[] = [];
  for (let gi = 0; gi < groups.length; gi++) {
    if (gi > 0) {
      const gapMs = (groups[gi].time - groups[gi - 1].time) * 1000;
      col += Math.max(MIN_GAP, Math.min(MAX_GAP, Math.round(gapMs / gridMs)));
    }
    colByGroup.push(col);
  }

  // Run beam-search on single-note melody groups
  const melodyIdxs = groups.map((g, i) => g.notes.length === 1 ? i : -1).filter(i => i >= 0);
  const melodyNotes = melodyIdxs.map(i => groups[i].notes[0]);
  const melodyPath  = optimizeFingeringPath(melodyNotes);

  // Build events
  const events: TabEvent[] = [];
  let prevFret = 5, prevString = 4;

  for (let gi = 0; gi < groups.length; gi++) {
    const c     = colByGroup[gi];
    const group = groups[gi];

    if (group.notes.length === 1) {
      const mi  = melodyIdxs.indexOf(gi);
      const pos = melodyPath[mi] ?? { string: prevString, fret: prevFret };
      prevFret   = pos.fret;
      prevString = pos.string;
      events.push({
        column: c, string: pos.string, fret: pos.fret,
        midiNote: group.notes[0].midiNote,
        startTime: group.notes[0].startTime,
        duration:  group.notes[0].endTime - group.notes[0].startTime,
      });
    } else {
      // Chord: assign each note to a different string.
      // Highest pitch first → it claims the highest string (natural guitar
      // voicing); ascending order starves the top note of low-fret options.
      const usedStrings = new Set<number>();
      const chordNotes = [...group.notes].sort((a, b) => b.midiNote - a.midiNote);

      for (const note of chordNotes) {
        const cands = findPositions(note.midiNote)
          .filter(p => !usedStrings.has(p.string))
          .sort((a, b) => {
            const cost = (p: typeof a) =>
              Math.abs(p.fret - prevFret) * 2 + Math.abs(p.string - prevString) +
              Math.max(0, p.fret - 12) * 6;   // keep chord shapes out of the high frets
            return cost(a) - cost(b);
          });

        const pos = cands[0];
        if (!pos) continue;
        usedStrings.add(pos.string);
        prevFret   = pos.fret;
        prevString = pos.string;
        events.push({
          column: c, string: pos.string, fret: pos.fret,
          midiNote: note.midiNote,
          startTime: note.startTime,
          duration:  note.endTime - note.startTime,
        });
      }
    }
  }

  const totalDuration = duration || sorted[sorted.length - 1].endTime;
  const totalColumns  = col + MAX_GAP;

  return { events, totalColumns, gridMs, title, duration: totalDuration, waveform: new Float32Array(0) };
}

// ── AlphaTex export ──────────────────────────────────────────────────────────

/**
 * Converts TabData to alphaTab's alphaTex format.
 * 1 grid column = 1 sixteenth note; BPM derived from gridMs.
 * String mapping: our 0=low E → alphaTab 6; our 5=high e → alphaTab 1.
 */
export function tabDataToAlphaTex(tabData: TabData): string {
  const { events, totalColumns, gridMs, title } = tabData;

  // 1 column = 1 sixteenth note → BPM for quarter = 60000 / (gridMs * 4)
  const bpm = Math.max(40, Math.min(280, Math.round(60000 / (gridMs * 4))));

  const colMap = new Map<number, Array<{ string: number; fret: number }>>();
  for (const ev of events) {
    if (!colMap.has(ev.column)) colMap.set(ev.column, []);
    colMap.get(ev.column)!.push({ string: ev.string, fret: ev.fret });
  }

  const atStr = (s: number) => 6 - s; // our 0→6(low E), our 5→1(high e)

  const parts: string[] = [':16']; // duration set once; inherited by all notes
  for (let col = 0; col < totalColumns; col++) {
    if (col > 0 && col % 16 === 0) parts.push('|');
    const notes = colMap.get(col);
    if (!notes || notes.length === 0) {
      parts.push('r');
    } else if (notes.length === 1) {
      parts.push(`${notes[0].fret}.${atStr(notes[0].string)}`);
    } else {
      parts.push(`(${notes.map(n => `${n.fret}.${atStr(n.string)}`).join(' ')})`);
    }
  }

  return [
    `\\title "${(title || 'Guitar Tab').replace(/"/g, "'")}"`,
    `\\tempo ${bpm}`,
    '.',
    parts.join(' '),
  ].join('\n');
}

// ── PDF export ────────────────────────────────────────────────────────────────

export type { jsPDF } from 'jspdf';

const PDF_COLS_PER_ROW = 20;
const PDF_COL_W   = 8.5;
const PDF_ROW_H   = 32;
const PDF_STR_GAP = 4;
const PDF_MARGIN  = 14;
const PDF_FONT    = 7;

export function exportTabToPDF(tabData: TabData): void {
  import('jspdf').then(({ jsPDF }) => {
    const { events, totalColumns, title } = tabData;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const pageW       = 210;
    const rowsPerPage = Math.floor((297 - PDF_MARGIN * 2 - 20) / PDF_ROW_H);
    const numRows     = Math.ceil(totalColumns / PDF_COLS_PER_ROW);
    const totalPages  = Math.ceil(numRows / rowsPerPage);

    const colMap = new Map<number, Map<number, number>>();
    for (const ev of events) {
      if (!colMap.has(ev.column)) colMap.set(ev.column, new Map());
      colMap.get(ev.column)!.set(ev.string, ev.fret);
    }

    let row = 0, page = 0;

    const ensurePage = () => {
      if (row === 0 && page === 0) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.text(title || 'Guitar Tab', pageW / 2, PDF_MARGIN - 2, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(140);
        doc.text(new Date().toLocaleDateString(), pageW / 2, PDF_MARGIN + 3, { align: 'center' });
        doc.text('Generated by ScaleUp', pageW / 2, PDF_MARGIN + 7, { align: 'center' });
        doc.setTextColor(0);
      }
    };

    const getRowY = () => PDF_MARGIN + 20 + (row % rowsPerPage) * PDF_ROW_H;

    for (let r = 0; r < numRows; r++) {
      if (r > 0 && r % rowsPerPage === 0) { doc.addPage(); page++; row = 0; }
      ensurePage();
      const y0       = getRowY();
      const colStart = r * PDF_COLS_PER_ROW;
      const colEnd   = Math.min(colStart + PDF_COLS_PER_ROW, totalColumns);
      const rowCols  = colEnd - colStart;
      const lineW    = rowCols * PDF_COL_W;

      doc.setDrawColor(160);
      doc.setLineWidth(0.25);
      for (let si = 0; si < 6; si++) {
        const sy = y0 + si * PDF_STR_GAP;
        doc.line(PDF_MARGIN + 12, sy, PDF_MARGIN + 12 + lineW, sy);
        doc.setFont('courier', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(100);
        doc.text(STRING_NAMES[si], PDF_MARGIN + 8, sy + 1, { align: 'right' });
        doc.setTextColor(0);
      }

      doc.setDrawColor(120);
      doc.setLineWidth(0.4);
      for (let c = 0; c <= rowCols; c += 4) {
        const bx = PDF_MARGIN + 12 + c * PDF_COL_W;
        doc.line(bx, y0, bx, y0 + 5 * PDF_STR_GAP);
      }

      doc.setFont('courier', 'bold');
      doc.setFontSize(PDF_FONT);
      doc.setTextColor(0);
      for (let c = colStart; c < colEnd; c++) {
        const strMap = colMap.get(c);
        if (!strMap) continue;
        const cx = PDF_MARGIN + 12 + (c - colStart) * PDF_COL_W + PDF_COL_W / 2;
        for (const [stringIdx, fret] of strMap.entries()) {
          const displayLine = 5 - stringIdx;
          const sy    = y0 + displayLine * PDF_STR_GAP;
          const label = String(fret);
          doc.setFillColor(255, 255, 255);
          const tw = label.length * 2;
          doc.rect(cx - tw - 0.5, sy - 2.5, tw * 2 + 1, 3.5, 'F');
          doc.setTextColor(0);
          doc.text(label, cx, sy + 1, { align: 'center' });
        }
      }
      row++;
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(160);
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.text(`Page ${p} / ${totalPages}`, pageW / 2, 290, { align: 'center' });
    }
    doc.save(`${(title || 'tab').replace(/\s+/g, '-')}.pdf`);
  });
}

// ── MT3 server transcription ──────────────────────────────────────────────────

/**
 * Sends audio blob to a remote MT3 FastAPI server (e.g. Google Colab + ngrok)
 * and returns DetectedNote[].  Falls back gracefully — caller must handle throws.
 *
 * Expected response: { notes: [{startTime, endTime, midiNote, confidence, frequency?}] }
 */
export async function transcribeWithMT3Server(
  blob: Blob,
  serverUrl: string,
  onProgress?: (pct: number) => void,
): Promise<DetectedNote[]> {
  onProgress?.(5);

  const form = new FormData();
  const ext  = blob.type.includes('mp3') ? 'mp3'
             : blob.type.includes('mpeg') ? 'mp3'
             : blob.type.includes('ogg') ? 'ogg'
             : blob.type.includes('webm') ? 'webm'
             : blob.type.includes('flac') ? 'flac'
             : blob.type.includes('m4a') || blob.type.includes('mp4') ? 'm4a'
             : 'wav';
  form.append('audio', blob, `audio.${ext}`);

  const base = serverUrl.replace(/\/+$/, '');

  // Bypass Cloudflare/ngrok browser-interstitial pages that block API calls
  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'ngrok-skip-browser-warning': 'true',
    'bypass-tunnel-reminder': 'true',
    'User-Agent': 'ScaleUpGuitarApp/1.0',
  };

  const res = await fetch(`${base}/transcribe`, { method: 'POST', body: form, headers });

  if (!res.ok) {
    const body = await res.text().catch(() => res.statusText);
    // Detect HTML interstitial pages (Cloudflare / ngrok warning pages)
    if (body.includes('<!DOCTYPE') || body.includes('<html')) {
      throw new Error(
        `שרת ה-MT3 החזיר דף HTML (${res.status}) במקום JSON.\n` +
        `פתח את ה-URL בדפדפן וודא שאין עמוד אזהרה של Cloudflare/ngrok,\n` +
        `ואז נסה שוב. URL: ${base}`,
      );
    }
    throw new Error(`MT3 server ${res.status}: ${body.slice(0, 200)}`);
  }

  // Verify we got JSON and not an interstitial
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    await res.text().catch(() => '');
    throw new Error(
      `שרת ה-MT3 החזיר ${contentType || 'תוכן לא ידוע'} במקום JSON.\n` +
      `פתח ${base}/health בדפדפן — אם מופיע עמוד אזהרה, לחץ "Accept" ואז נסה שוב.`,
    );
  }

  onProgress?.(72);

  const data = await res.json() as {
    notes: Array<{ startTime: number; endTime: number; midiNote: number; confidence: number; frequency?: number }>;
  };

  onProgress?.(80);

  // Raw model output in console — essential for diagnosing quality issues
  console.log('[MT3 raw notes]', JSON.stringify(data.notes));

  const MAX_MELODY_MIDI = 81; // A5 — above this is almost always a guitar overtone

  const notes: DetectedNote[] = data.notes
    .filter(n => Math.round(n.midiNote) <= MAX_MELODY_MIDI)
    .map(n => ({
      startTime:  n.startTime,
      endTime:    n.endTime,
      midiNote:   Math.round(n.midiNote),
      confidence: n.confidence,
      frequency:  n.frequency ?? midiToFreq(Math.round(n.midiNote)),
    }));

  // Harmonic suppression must run BEFORE constrainOctaves — otherwise
  // out-of-range harmonics get folded down an octave and masquerade as
  // real notes inside the melody.
  return constrainOctaves(cleanupNotes(suppressHarmonics(notes)));
}

// ── MIDI synth playback ───────────────────────────────────────────────────────

let synthNodes: AudioNode[] = [];

export function stopSynth(): void {
  synthNodes.forEach(n => {
    try { (n as OscillatorNode).stop?.(); n.disconnect(); } catch { /* ignore */ }
  });
  synthNodes = [];
}

export function playSynth(notes: DetectedNote[], audioCtx: AudioContext): void {
  stopSynth();
  const now = audioCtx.currentTime;

  for (const note of notes) {
    const freq = note.frequency || midiToFreq(note.midiNote);
    const t0   = now + note.startTime;
    const dur  = Math.max(0.08, note.endTime - note.startTime);

    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(0.28, t0 + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.08);
    gain.gain.setValueAtTime(0.18, t0 + dur - 0.04);
    gain.gain.linearRampToValueAtTime(0, t0 + dur);

    const lpf = audioCtx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = freq * 6;
    lpf.Q.value = 0.7;

    [1, 2, 3, 4].forEach((harmonic, i) => {
      const osc   = audioCtx.createOscillator();
      const hGain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq * harmonic;
      hGain.gain.value = [0.6, 0.25, 0.1, 0.05][i];
      osc.connect(hGain);
      hGain.connect(lpf);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
      synthNodes.push(osc, hGain);
    });

    lpf.connect(gain);
    gain.connect(audioCtx.destination);
    synthNodes.push(lpf, gain);
  }
}
