import { PitchDetector } from 'pitchy';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DetectedNote {
  startTime: number;    // seconds
  endTime: number;
  midiNote: number;     // 40–88 (guitar range)
  confidence: number;   // 0–1
  frequency: number;    // Hz
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
  gridMs: number;       // ms per column
  title: string;
  duration: number;     // seconds
  waveform: Float32Array; // normalized amplitude envelope for display
}

// ── Constants ─────────────────────────────────────────────────────────────────

// Standard tuning open-string MIDI notes: E2 A2 D3 G3 B3 e4
export const OPEN_MIDI = [40, 45, 50, 55, 59, 64] as const;
// Display string names, top-to-bottom (high e first)
export const STRING_NAMES = ['e', 'B', 'G', 'D', 'A', 'E'] as const;
// Display order: string 5 (high e) at top → string 0 (low E) at bottom
export const DISPLAY_ORDER = [5, 4, 3, 2, 1, 0] as const;

const MAX_FRET = 22;
const MIN_FREQ  = 70;   // below guitar low E (82 Hz) to catch slightly de-tuned
const MAX_FREQ  = 1500; // ~G6 — well above highest guitar fret
const CLARITY_THRESHOLD = 0.82;
const MIN_NOTE_DURATION = 0.04; // 40 ms — filter out clicks/noise
const MERGE_GAP_S = 0.06;       // merge same-pitch gaps under 60 ms

// ── Frequency ↔ MIDI ──────────────────────────────────────────────────────────

export function freqToMidi(freq: number): number {
  return Math.round(69 + 12 * Math.log2(freq / 440));
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// ── Fingering helpers ─────────────────────────────────────────────────────────

/** All valid (string, fret) positions for a MIDI note in standard tuning. */
export function findPositions(midiNote: number): Array<{ string: number; fret: number }> {
  const result: Array<{ string: number; fret: number }> = [];
  for (let s = 0; s < 6; s++) {
    const fret = midiNote - OPEN_MIDI[s];
    if (fret >= 0 && fret <= MAX_FRET) result.push({ string: s, fret });
  }
  return result;
}

/**
 * Choose the best (string, fret) for a note given the previous hand position.
 * Minimises position jump while preferring higher strings for melody.
 */
function bestPosition(
  midiNote: number,
  prevFret: number,
  prevString: number,
): { string: number; fret: number } {
  const candidates = findPositions(midiNote);
  if (candidates.length === 0) return { string: 5, fret: Math.max(0, midiNote - OPEN_MIDI[5]) };

  return candidates.reduce((best, cand) => {
    const bestDist = Math.abs(best.fret - prevFret) * 2 + Math.abs(best.string - prevString);
    const candDist = Math.abs(cand.fret - prevFret) * 2 + Math.abs(cand.string - prevString);
    // slight treble preference for single-note melody
    const treblePenalty = (5 - cand.string) * 0.2;
    return candDist + treblePenalty < bestDist ? cand : best;
  });
}

// ── Mono downmix ──────────────────────────────────────────────────────────────

function downmixToMono(buf: AudioBuffer): Float32Array {
  const len = buf.length;
  const ch  = buf.numberOfChannels;
  if (ch === 1) return buf.getChannelData(0).slice();
  const mono = new Float32Array(len);
  for (let c = 0; c < ch; c++) {
    const data = buf.getChannelData(c);
    for (let i = 0; i < len; i++) mono[i] += data[i] / ch;
  }
  return mono;
}

// ── Waveform envelope (for display) ──────────────────────────────────────────

export function buildWaveform(buf: AudioBuffer, points = 200): Float32Array {
  const mono    = downmixToMono(buf);
  const step    = Math.floor(mono.length / points);
  const result  = new Float32Array(points);
  let maxAmp    = 1e-6;

  for (let i = 0; i < points; i++) {
    let sum = 0;
    for (let j = 0; j < step; j++) {
      sum += Math.abs(mono[i * step + j] || 0);
    }
    result[i] = sum / step;
    if (result[i] > maxAmp) maxAmp = result[i];
  }
  // Normalise
  for (let i = 0; i < points; i++) result[i] /= maxAmp;
  return result;
}

// ── Main transcription ────────────────────────────────────────────────────────

/**
 * Transcribes an AudioBuffer to a list of detected notes.
 *
 * Engine: McLeod Pitch Method (pitchy) via autocorrelation.
 * Best for clean monophonic / single-note guitar lines.
 *
 * Architectural hook: swap `detector.findPitch(frame, sr)` with
 * Basic Pitch (ONNX), Magenta.js, or Essentia.js output for polyphonic
 * accuracy. The rest of the pipeline (note grouping → tab layout →
 * fingering) remains unchanged.
 */
export async function transcribeAudioBuffer(
  audioBuffer: AudioBuffer,
  onProgress?: (pct: number) => void,
): Promise<DetectedNote[]> {
  const mono       = downmixToMono(audioBuffer);
  const sr         = audioBuffer.sampleRate;
  const FRAME      = 2048;
  const HOP        = 512;
  const numFrames  = Math.max(0, Math.floor((mono.length - FRAME) / HOP));
  const frame      = new Float32Array(FRAME);
  const detector   = PitchDetector.forFloat32Array(FRAME);
  detector.minVolumeDecibels = -22;

  // Per-frame raw results
  const raw: Array<{ time: number; midi: number; clarity: number; freq: number }> = [];

  for (let i = 0; i < numFrames; i++) {
    frame.set(mono.subarray(i * HOP, i * HOP + FRAME));
    const [freq, clarity] = detector.findPitch(frame, sr);
    const time  = (i * HOP) / sr;
    const valid = freq > MIN_FREQ && freq < MAX_FREQ && clarity >= CLARITY_THRESHOLD;
    raw.push({
      time,
      midi:    valid ? freqToMidi(freq) : -1,
      clarity: valid ? clarity : 0,
      freq:    valid ? freq : 0,
    });

    if (i % 80 === 0) {
      onProgress?.(Math.round((i / numFrames) * 90));
      await new Promise(r => setTimeout(r, 0));
    }
  }

  // Group frames → note events
  const hopS    = HOP / sr;
  const notes: DetectedNote[] = [];
  let start    = -1;
  let end      = -1;
  let midi     = -1;
  let freqAcc  = 0;
  let clarAcc  = 0;
  let count    = 0;

  const flush = () => {
    if (start >= 0 && end - start >= MIN_NOTE_DURATION) {
      notes.push({
        startTime: start, endTime: end,
        midiNote: midi,
        confidence: clarAcc / count,
        frequency: freqAcc / count,
      });
    }
    start = -1; count = 0; freqAcc = 0; clarAcc = 0;
  };

  for (const f of raw) {
    if (f.midi > 0) {
      if (start < 0) {
        start = f.time; end = f.time + hopS;
        midi = f.midi; freqAcc = f.freq; clarAcc = f.clarity; count = 1;
      } else if (Math.abs(f.midi - midi) <= 1) {
        end = f.time + hopS;
        freqAcc += f.freq; clarAcc += f.clarity; count++;
        midi = Math.abs(f.midi - midi) <= 1 ? f.midi : midi;
      } else {
        flush();
        start = f.time; end = f.time + hopS;
        midi = f.midi; freqAcc = f.freq; clarAcc = f.clarity; count = 1;
      }
    } else if (start >= 0 && f.time - end > MERGE_GAP_S) {
      flush();
    }
  }
  flush();

  onProgress?.(100);
  return notes;
}

// ── Notes → tab events ────────────────────────────────────────────────────────

/**
 * Convert detected notes to tab events (string + fret) with grid quantization.
 * gridMs: column resolution in milliseconds (default 120 ms ≈ 16th @ 125 BPM).
 */
export function notesToTab(
  notes: DetectedNote[],
  gridMs = 120,
  title = 'Untitled',
  duration = 0,
): TabData {
  if (notes.length === 0) {
    return { events: [], totalColumns: 0, gridMs, title, duration, waveform: new Float32Array(0) };
  }

  const totalDuration = duration || notes[notes.length - 1].endTime;
  const totalColumns  = Math.ceil((totalDuration * 1000) / gridMs) + 1;

  // Greedy fingering: maintain hand position state
  let prevFret   = 5;
  let prevString = 4;

  const events: TabEvent[] = notes.map(note => {
    const col = Math.round((note.startTime * 1000) / gridMs);
    const pos = bestPosition(note.midiNote, prevFret, prevString);
    prevFret   = pos.fret;
    prevString = pos.string;
    return {
      column:    col,
      string:    pos.string,
      fret:      pos.fret,
      midiNote:  note.midiNote,
      startTime: note.startTime,
      duration:  note.endTime - note.startTime,
    };
  });

  return { events, totalColumns, gridMs, title, duration: totalDuration, waveform: new Float32Array(0) };
}

// ── PDF export ────────────────────────────────────────────────────────────────

export type { jsPDF } from 'jspdf';

/** Columns per tab row in the PDF layout. */
const PDF_COLS_PER_ROW = 20;
const PDF_COL_W   = 8.5;   // mm per column
const PDF_ROW_H   = 32;    // mm per tab row (6 strings + gap)
const PDF_STR_GAP = 4;     // mm between strings
const PDF_MARGIN  = 14;    // page margin mm
const PDF_FONT    = 7;     // fret number font size (pt)

export function exportTabToPDF(tabData: TabData): void {
  // Dynamic import at call-time to avoid loading jspdf at startup
  import('jspdf').then(({ jsPDF }) => {
    const { events, totalColumns, title } = tabData;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const pageW  = 210;
    const usableW = pageW - PDF_MARGIN * 2;
    const rowsPerPage = Math.floor((297 - PDF_MARGIN * 2 - 20) / PDF_ROW_H);

    const numRows = Math.ceil(totalColumns / PDF_COLS_PER_ROW);
    const totalPages = Math.ceil(numRows / rowsPerPage);

    // Build lookup: column → {string → fret}
    const colMap = new Map<number, Map<number, number>>();
    for (const ev of events) {
      if (!colMap.has(ev.column)) colMap.set(ev.column, new Map());
      colMap.get(ev.column)!.set(ev.string, ev.fret);
    }

    let row = 0;
    let page = 0;

    const ensurePage = () => {
      if (row === 0 && page === 0) {
        // Header
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
      if (r > 0 && r % rowsPerPage === 0) {
        doc.addPage();
        page++;
        row = 0;
      }

      ensurePage();
      const y0 = getRowY();
      const colStart = r * PDF_COLS_PER_ROW;
      const colEnd   = Math.min(colStart + PDF_COLS_PER_ROW, totalColumns);
      const rowCols  = colEnd - colStart;
      const lineW    = rowCols * PDF_COL_W;

      // String lines + labels
      doc.setDrawColor(160);
      doc.setLineWidth(0.25);
      for (let si = 0; si < 6; si++) {
        const sy = y0 + si * PDF_STR_GAP;
        doc.line(PDF_MARGIN + 12, sy, PDF_MARGIN + 12 + lineW, sy);
        // String name label
        doc.setFont('courier', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(100);
        doc.text(STRING_NAMES[si], PDF_MARGIN + 8, sy + 1, { align: 'right' });
        doc.setTextColor(0);
      }

      // Bar lines every 4 columns
      doc.setDrawColor(120);
      doc.setLineWidth(0.4);
      for (let c = 0; c <= rowCols; c += 4) {
        const bx = PDF_MARGIN + 12 + c * PDF_COL_W;
        doc.line(bx, y0, bx, y0 + 5 * PDF_STR_GAP);
      }

      // Fret numbers
      doc.setFont('courier', 'bold');
      doc.setFontSize(PDF_FONT);
      doc.setTextColor(0);
      for (let c = colStart; c < colEnd; c++) {
        const strMap = colMap.get(c);
        if (!strMap) continue;
        const cx = PDF_MARGIN + 12 + (c - colStart) * PDF_COL_W + PDF_COL_W / 2;
        for (const [stringIdx, fret] of strMap.entries()) {
          // Display order: string 5 (e) = line 0 (top)
          const displayLine = 5 - stringIdx;
          const sy = y0 + displayLine * PDF_STR_GAP;
          const label = String(fret);
          // Clear string behind number
          doc.setDrawColor(255);
          doc.setFillColor(255);
          const tw = label.length * 2;
          doc.rect(cx - tw - 0.5, sy - 2.5, tw * 2 + 1, 3.5, 'F');
          doc.setTextColor(0);
          doc.text(label, cx, sy + 1, { align: 'center' });
        }
      }

      row++;
    }

    // Footer
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

/** Stop any currently playing synthesized notes. */
export function stopSynth(): void {
  synthNodes.forEach(n => {
    try { (n as OscillatorNode).stop?.(); n.disconnect(); } catch { /* ignore */ }
  });
  synthNodes = [];
}

/** Play back detected notes through Web Audio API as a guitar-like sound. */
export function playSynth(notes: DetectedNote[], audioCtx: AudioContext): void {
  stopSynth();
  const now = audioCtx.currentTime;

  for (const note of notes) {
    const freq = note.frequency || midiToFreq(note.midiNote);
    const t0   = now + note.startTime;
    const dur  = Math.max(0.08, note.endTime - note.startTime);

    // Master gain (envelope)
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(0.28, t0 + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.08);
    gain.gain.setValueAtTime(0.18, t0 + dur - 0.04);
    gain.gain.linearRampToValueAtTime(0, t0 + dur);

    // Low-pass filter — guitar-like timbre
    const lpf = audioCtx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = freq * 6;
    lpf.Q.value = 0.7;

    // Fundamental + harmonics (sawtooth decomposed)
    [1, 2, 3, 4].forEach((harmonic, i) => {
      const osc = audioCtx.createOscillator();
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
