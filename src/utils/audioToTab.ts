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
const INSTRUMENT_PARAMS: Record<InstrumentType, {
  minFreq: number; maxFreq: number; minMidi: number; maxMidi: number;
  onsetThresh: number; frameThresh: number; minNoteLen: number; minAmp: number;
}> = {
  acoustic: { minFreq: 70,  maxFreq: 1400, minMidi: 40, maxMidi: 88, onsetThresh: 0.58, frameThresh: 0.38, minNoteLen: 8,  minAmp: 0.42 },
  electric: { minFreq: 70,  maxFreq: 1400, minMidi: 40, maxMidi: 88, onsetThresh: 0.52, frameThresh: 0.32, minNoteLen: 7,  minAmp: 0.38 },
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
  const HIGH_FRET_PEN = 0.4; // prefer positions with fret ≤ 12 (avoid spurious high frets)

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

  return cleanupNotes(raw);
}

// ── AI note refinement ────────────────────────────────────────────────────────

/**
 * Uses Claude haiku to clean up raw pitch-detected notes.
 * Removes noise spikes, fixes octave errors, merges closely-held sustains.
 * Falls back to raw notes if the API key is absent or the call fails.
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

  try {
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

    // Compact representation: [startTime, midiNote, duration]
    const input = notes.slice(0, 120).map(n => [
      Math.round(n.startTime * 100) / 100,
      n.midiNote,
      Math.round((n.endTime - n.startTime) * 100) / 100,
    ]);

    const msg = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: `You are a guitar transcription expert cleaning up pitch-detector output.
Guitar MIDI range: 40 (low E2) to 88 (high e, 22nd fret).
Input format: [startTime_s, midiNote, duration_s]

Raw detected notes:
${JSON.stringify(input)}

Clean up by applying these rules IN ORDER:
1. REMOVE notes with midiNote outside 40–88
2. REMOVE notes with duration < 0.05 s that are isolated (no adjacent note within 0.3 s)
3. FIX octave errors: if a note is 12 semitones away from its neighbours and the neighbour pitch fits the guitar context better, move it by ±12
4. MERGE consecutive identical pitches separated by gap < 0.1 s → extend the first note's duration and drop the second
5. KEEP everything else — do not add or invent notes

Return ONLY a JSON array, no markdown, no explanation:
[[startTime, midiNote, duration], ...]`,
      }],
    });

    const text = (msg.content[0] as { type: string; text: string }).text.trim();
    const s = text.indexOf('[');
    const e = text.lastIndexOf(']');
    if (s === -1 || e === -1) throw new Error('no JSON array in response');

    const cleaned = JSON.parse(text.slice(s, e + 1)) as [number, number, number][];

    onProgress?.(100);
    return cleaned
      .filter(([, m]) => m >= 40 && m <= 88)
      .map(([t, m, d]) => ({
        startTime:  t,
        endTime:    t + Math.max(0.05, d),
        midiNote:   m,
        confidence: 0.9,
        frequency:  midiToFreq(m),
      }));
  } catch (err) {
    console.warn('[refineNotesWithAI] API call failed, using raw notes:', err);
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

  const sorted = cleanupNotes([...notes].sort((a, b) => a.startTime - b.startTime));

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
      // Chord: assign each note to a different string
      const usedStrings = new Set<number>();
      const chordNotes = [...group.notes].sort((a, b) => a.midiNote - b.midiNote);

      for (const note of chordNotes) {
        const cands = findPositions(note.midiNote)
          .filter(p => !usedStrings.has(p.string))
          .sort((a, b) => {
            const cost = (p: typeof a) =>
              Math.abs(p.fret - prevFret) * 2 + Math.abs(p.string - prevString);
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
