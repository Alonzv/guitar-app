import React, { useState, useRef, useCallback, useEffect } from 'react';
import { T } from '../../theme';
import { Rule, Pill, Cta, PosterTitle } from '../Transit/parts';
import { StopActions } from '../Transit/StopActions';
import {
  transcribeAudioBuffer, transcribeWithMT3Server, refineNotesWithAI, notesToTab, buildWaveform,
  exportTabToPDF, midiToFreq, OPEN_MIDI, STRING_NAMES,
  type TabData, type TabEvent, type DetectedNote, type TranscribeConfig,
} from '../../utils/audioToTab';
import { unlockAudio } from '../../utils/audioPlayback';
import { exportNotesMidi } from '../../utils/midiExport';
import { SaveToLibraryButton } from '../Workspace/SaveToLibraryButton';
import { useOptionalSong } from '../../song/SongContext';
import { useFlash } from '../../motion/useFlash';
import { RollLabel } from '../RollLabel';

type Stage = 'idle' | 'recording' | 'processing' | 'result' | 'error';

// Build a 6-line ASCII tab (display order e,B,G,D,A,E) from TabData for storage.
function tabDataToAscii(td: TabData): string {
  const rows = [5, 4, 3, 2, 1, 0]; // high-e → low-E
  const labels = ['e', 'B', 'G', 'D', 'A', 'E'];
  return rows.map((stringIdx, r) => {
    const cells: string[] = [];
    for (let col = 0; col < td.totalColumns; col++) {
      const ev = td.events.find(e => e.column === col && e.string === stringIdx);
      cells.push(ev ? String(ev.fret).padStart(2, '-') : '--');
    }
    return `${labels[r]}|${cells.join('-')}|`;
  }).join('\n');
}

const DEFAULT_MT3_URL = 'https://vipapito-scaleup-transcribe.hf.space';
const DEFAULT_CFG: TranscribeConfig = { instrument: 'acoustic', mixType: 'solo' };

// ── Tab visual constants ──────────────────────────────────────────────────────

// Drawn like the Tab Writer: mono numbers on ink hairlines, the selected
// note the one cobalt cell.
const TAB_BG   = T.bgDeep;
const TAB_LINE = T.text;
const TAB_BAR  = T.text;
const TAB_LBL  = T.textMuted;
const TAB_SEL  = T.primary;

const COL_W        = 16;
const STR_GAP      = 16;
const LEFT_PAD     = 28;
const COLS_PER_ROW = 20;
const VB_W = LEFT_PAD + COLS_PER_ROW * COL_W + 4;

// ── Clear button ──────────────────────────────────────────────────────────────

function ClearBtn({ onClear }: { onClear: () => void }) {
  return <Pill size="sm" onClick={onClear} title="Reset — back to start">Clear</Pill>;
}

// ── Tab SVG row ───────────────────────────────────────────────────────────────

function TabSVGRow({ colStart, colEnd, colMap, selectedCol, onTap }: {
  colStart: number;
  colEnd: number;
  colMap: Map<number, Map<number, number>>;
  selectedCol: number | null;
  onTap: (col: number, stringIdx: number, e: React.MouseEvent) => void;
}) {
  const lineW = COLS_PER_ROW * COL_W;
  const TOP   = 10;
  const svgH  = TOP + 5 * STR_GAP + 6;
  const els: React.ReactNode[] = [];


  for (let di = 0; di < 6; di++) {
    const sy = TOP + di * STR_GAP;
    els.push(
      <line key={`l${di}`} x1={LEFT_PAD - 2} y1={sy} x2={LEFT_PAD + lineW} y2={sy}
        stroke={TAB_LINE} strokeWidth={0.75} />,
      <text key={`n${di}`} x={LEFT_PAD - 6} y={sy + 3.5}
        fontSize={9} fill={TAB_LBL} textAnchor="end"
        fontFamily="var(--gc-mono)" fontWeight="700">
        {STRING_NAMES[di]}
      </text>,
    );
  }

  els.push(
    <line key="open"  x1={LEFT_PAD - 2}    y1={TOP} x2={LEFT_PAD - 2}    y2={TOP + 5 * STR_GAP} stroke={TAB_BAR} strokeWidth={2} />,
    <line key="close" x1={LEFT_PAD + lineW} y1={TOP} x2={LEFT_PAD + lineW} y2={TOP + 5 * STR_GAP} stroke={TAB_BAR} strokeWidth={2} />,
  );
  for (let c = 4; c < COLS_PER_ROW; c += 4) {
    const bx = LEFT_PAD + c * COL_W;
    els.push(
      <line key={`b${c}`} x1={bx} y1={TOP} x2={bx} y2={TOP + 5 * STR_GAP}
        stroke={T.hairline} strokeWidth={1} />,
    );
  }

  for (let c = colStart; c < colEnd; c++) {
    const strMap = colMap.get(c);
    if (!strMap) continue;
    const cx = LEFT_PAD + (c - colStart) * COL_W + COL_W / 2;
    for (const [si, fret] of strMap.entries()) {
      const di   = 5 - si;
      const sy   = TOP + di * STR_GAP;
      const lbl  = String(fret);
      const wide = lbl.length > 1;
      const sel  = selectedCol === c;
      els.push(
        <g key={`${c}-${si}`} onClick={e => onTap(c, si, e)} style={{ cursor: 'pointer' }}>
          <rect x={cx - (wide ? 7 : 5)} y={sy - 6} width={wide ? 14 : 10} height={12}
            fill={sel ? TAB_SEL : TAB_BG} />
          <text x={cx} y={sy + 3.2} fontSize={8.5}
            fill={sel ? T.onPrimary : T.text}
            textAnchor="middle"
            fontFamily="var(--gc-mono)" fontWeight="700">
            {lbl}
          </text>
        </g>,
      );
    }
  }

  return (
    <svg width="100%" viewBox={`0 0 ${VB_W} ${svgH}`}
      preserveAspectRatio="xMinYMin meet"
      style={{ display: 'block' }}>
      {els}
    </svg>
  );
}

// ── Tab display ───────────────────────────────────────────────────────────────

function TabDisplay({ tabData, onSelectNote, clearToken }: {
  tabData: TabData;
  onSelectNote: (ev: TabEvent | null) => void;
  clearToken: number;
}) {
  const [selectedCol, setSelectedCol] = useState<number | null>(null);
  const { events, totalColumns } = tabData;

  // Clear selection when parent signals (e.g. after keyboard edit commits)
  const [seenToken, setSeenToken] = useState(clearToken);
  if (seenToken !== clearToken) { setSeenToken(clearToken); setSelectedCol(null); }

  if (totalColumns === 0) {
    return (
      <div style={{ borderTop: `var(--su-rule) solid ${T.border}`, padding: '18px 0' }}>
        <p className="su-poster" style={{ margin: 0, fontSize: 34 }}>No notes heard</p>
        <p style={{ margin: '10px 0 0', fontSize: 12.5, color: TAB_LBL }}>No notes detected in the audio — try a louder, cleaner take.</p>
      </div>
    );
  }

  const colMap = new Map<number, Map<number, number>>();
  for (const ev of events) {
    if (!colMap.has(ev.column)) colMap.set(ev.column, new Map());
    colMap.get(ev.column)!.set(ev.string, ev.fret);
  }

  const numRows = Math.ceil(totalColumns / COLS_PER_ROW);

  const handleTap = (col: number, si: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedCol === col) { setSelectedCol(null); onSelectNote(null); }
    else {
      setSelectedCol(col);
      onSelectNote(events.find(ev => ev.column === col && ev.string === si) ?? null);
    }
  };

  return (
    <div dir="ltr" style={{ padding: '6px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {Array.from({ length: numRows }, (_, r) => {
        const colStart = r * COLS_PER_ROW;
        const colEnd   = Math.min(colStart + COLS_PER_ROW, totalColumns);
        return (
          <TabSVGRow key={r}
            colStart={colStart} colEnd={colEnd}
            colMap={colMap} selectedCol={selectedCol} onTap={handleTap} />
        );
      })}
    </div>
  );
}

// ── Waveform ──────────────────────────────────────────────────────────────────

// ── Processing scan ──────────────────────────────────────────────────────────
// While a recording is transcribed: a playhead sweeps the waveform as far as
// the work has got, and wherever the sound jumps (an attack — a likely note)
// a dot drops onto a six-line tab strip under it. The dots are the recording's
// own onsets, not the final notes; the tab itself appears when it is done.
function ProcessingScan({ data, progress }: { data: Float32Array; progress: number }) {
  const W = 500, WAVE_H = 56, TAB_TOP = WAVE_H + 10, LINE_GAP = 7, N = 80;
  const step = data.length / N;
  const amp = Array.from({ length: N }, (_, i) => Math.abs(data[Math.floor(i * step)]));
  const peak = Math.max(...amp, 0.0001);
  const scanned = Math.round((progress / 100) * N);
  const barW = W / N;
  // Onsets: a bin noticeably louder than the one before it.
  const onsets = amp.map((v, i) => ({ i, v })).filter(({ i, v }) => i > 0 && v / peak > 0.25 && v > amp[i - 1] * 1.25);
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${TAB_TOP + LINE_GAP * 5 + 6}`} style={{ display: 'block' }} aria-label="Transcribing">
      {amp.map((v, i) => {
        const h = Math.max(2, (v / peak) * WAVE_H * 0.9);
        return <rect key={i} x={i * barW + 1} y={(WAVE_H - h) / 2} width={barW - 2} height={h}
          fill={i < scanned ? T.text : T.hairline} style={{ transition: 'fill var(--gc-dur-base) var(--gc-ease-out)' }} />;
      })}
      {[0, 1, 2, 3, 4, 5].map(r => (
        <line key={r} x1={0} x2={W} y1={TAB_TOP + r * LINE_GAP} y2={TAB_TOP + r * LINE_GAP} stroke="var(--gc-fretboard-str)" strokeWidth={1} />
      ))}
      {onsets.filter(o => o.i < scanned).map(({ i, v }) => (
        <circle key={i} className="gc-fall" cx={i * barW + barW / 2} cy={TAB_TOP + (Math.round((1 - v / peak) * 5)) * LINE_GAP} r={3} fill={T.text} />
      ))}
      <line x1={0} x2={0} y1={0} y2={TAB_TOP + LINE_GAP * 5 + 4} stroke={T.primary} strokeWidth={2}
        style={{ transform: `translateX(${scanned * barW}px)`, transition: 'transform var(--gc-dur-slow) var(--gc-ease-out)' }} />
    </svg>
  );
}

function Waveform({ data, height = 64 }: { data: Float32Array; height?: number }) {
  if (data.length === 0) return null;

  const W    = 500;
  const mid  = height / 2;
  const N    = 80;
  const step = data.length / N;
  const sampled = Array.from({ length: N }, (_, i) => Math.abs(data[Math.floor(i * step)]));
  const barW = W / N;
  const gap  = Math.max(1.5, barW * 0.28);
  const bw   = barW - gap;

  return (
    <>
      <style>{`
        @keyframes wv-flow {
          0%,100% { transform: scaleY(0.7); }
          50%      { transform: scaleY(1);   }
        }
        @media (prefers-reduced-motion: reduce) { .su-wv rect { animation: none !important; } }
      `}</style>
      <svg width="100%" viewBox={`0 0 ${W} ${height}`}
        preserveAspectRatio="xMidYMid meet" className="su-wv" style={{ display: 'block' }}>
        {sampled.map((v, i) => {
          const h     = Math.max(2, v * mid * 0.94);
          const cx    = i * barW + barW / 2;
          const delay = `${((i / N) * 2.0).toFixed(2)}s`;
          return (
            <rect key={i}
              x={i * barW + gap / 2} y={mid - h}
              width={Math.max(1.5, bw)} height={h * 2}
              fill={T.text}
              style={{
                transformOrigin: `${cx}px ${mid}px`,
                animation: `wv-flow 2.4s ease-in-out ${delay} infinite`,
              }}
            />
          );
        })}
      </svg>
    </>
  );
}

// ── Recording animation ───────────────────────────────────────────────────────

function RecordingBars() {
  return (
    <>
      <style>{`@keyframes at-eq{from{transform:scaleY(.1)}to{transform:scaleY(1)}} @media (prefers-reduced-motion: reduce){.su-eq rect{animation:none!important}}`}</style>
      <svg width={180} height={48} viewBox="0 0 120 40" className="su-eq" aria-hidden style={{ display: 'block' }}>
        {Array.from({ length: 10 }, (_, i) => (
          <rect key={i} x={i * 12 + 2} y={2} width={9} height={36}
            fill={T.text}
            style={{
              transformOrigin: `${i * 12 + 6.5}px 20px`,
              animation: `at-eq .7s ease-in-out ${(i * 0.08).toFixed(2)}s infinite alternate`,
            }} />
        ))}
      </svg>
    </>
  );
}

// ── Responsive styles ─────────────────────────────────────────────────────────

const RESPONSIVE_CSS = `
  .at-root { width: 100%; box-sizing: border-box; }
  .at-player-row { display: flex; gap: 10px; }
`;


// ── Main component ────────────────────────────────────────────────────────────

export const AudioToTab: React.FC<{ desktop?: boolean }> = ({ desktop }) => {
  const [stage, setStage]             = useState<Stage>('idle');
  const [progress, setProgress]       = useState(0);
  const [phaseLabel, setPhaseLabel]   = useState('');
  const [error, setError]             = useState('');
  const [tabData, setTabData]         = useState<TabData | null>(null);
  const song = useOptionalSong();
  const [sent, flashSent] = useFlash();
  const [waveform, setWaveform]       = useState<Float32Array | null>(null);
  const [notes, setNotes]             = useState<DetectedNote[]>([]);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [fileName, setFileName]       = useState('');
  const [recSecs, setRecSecs]         = useState(0);
  const [selNote, setSelNote]         = useState<TabEvent | null>(null);
  const [fretInput, setFretInput]     = useState('');       // live digit(s) being typed
  const [editClearToken, setEditClearToken] = useState(0); // incremented to deselect in TabDisplay

  const mediaRecRef  = useRef<MediaRecorder | null>(null);
  const chunksRef    = useRef<Blob[]>([]);
  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioBufRef  = useRef<AudioBuffer | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastBlobRef  = useRef<Blob | null>(null);

  // Refs for the stable keyboard handler (avoid stale closures)
  const kbSelNote   = useRef<TabEvent | null>(null);
  const kbEditMidi  = useRef<number | null>(null);
  const kbFretBuf   = useRef('');
  const kbFretTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const kbNotes     = useRef<DetectedNote[]>([]);
  const kbFileName  = useRef('');
  const kbTabData   = useRef<TabData | null>(null);

  // Keep kb data refs in sync
  useEffect(() => { kbNotes.current = notes; },    [notes]);
  useEffect(() => { kbFileName.current = fileName; }, [fileName]);
  useEffect(() => { kbTabData.current = tabData; }, [tabData]);

  // Stable keyboard handler — registered once, reads/writes via refs
  useEffect(() => {
    const commitFret = (newFret: number | null) => {
      const sel  = kbSelNote.current;
      const midi = kbEditMidi.current;
      if (!sel || midi === null) return;

      const updated: DetectedNote[] = [];
      for (const n of kbNotes.current) {
        const match = Math.abs(n.startTime - sel.startTime) < 0.02 && n.midiNote === midi;
        if (!match) { updated.push(n); continue; }
        if (newFret === null) continue; // delete note
        const newMidi = OPEN_MIDI[sel.string] + newFret;
        updated.push({ ...n, midiNote: newMidi, frequency: midiToFreq(newMidi) });
      }
      setNotes(updated);
      setTabData(notesToTab(
        updated, 200,
        kbFileName.current.replace(/\.[^.]+$/, ''),
        audioBufRef.current?.duration ?? kbTabData.current?.duration ?? 0,
      ));
      // Deselect
      setSelNote(null);       kbSelNote.current  = null;
      kbEditMidi.current = null; kbFretBuf.current  = '';
      setFretInput('');
      setEditClearToken(t => t + 1);
    };

    const onKey = (e: KeyboardEvent) => {
      if (!kbSelNote.current) return;
      if ((e.target as HTMLElement).tagName === 'INPUT') return;

      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        if (kbFretTimer.current) { clearTimeout(kbFretTimer.current); kbFretTimer.current = null; }

        const buf = kbFretBuf.current;
        const two = buf + e.key;
        const val = parseInt(two);

        if (buf.length === 1 && val <= 22) {
          // Two digits entered — commit immediately
          commitFret(val);
        } else {
          // First digit — apply live preview, wait for possible second digit
          const singleVal = parseInt(e.key);
          kbFretBuf.current = e.key;

          const sel  = kbSelNote.current!;
          const midi = kbEditMidi.current!;
          const newMidi = OPEN_MIDI[sel.string] + singleVal;
          const updated = kbNotes.current.map(n =>
            (Math.abs(n.startTime - sel.startTime) < 0.02 && n.midiNote === midi)
              ? { ...n, midiNote: newMidi, frequency: midiToFreq(newMidi) }
              : n
          );
          setNotes(updated);
          setTabData(notesToTab(
            updated, 200,
            kbFileName.current.replace(/\.[^.]+$/, ''),
            audioBufRef.current?.duration ?? kbTabData.current?.duration ?? 0,
          ));
          kbEditMidi.current = newMidi; // track so second digit finds the updated note
          setFretInput(e.key);

          // Auto-commit after 800 ms if no second digit follows
          kbFretTimer.current = setTimeout(() => {
            kbFretBuf.current = '';
            setFretInput('');
            setSelNote(null);       kbSelNote.current  = null;
            kbEditMidi.current = null;
            setEditClearToken(t => t + 1);
          }, 800);
        }
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        if (kbFretTimer.current) { clearTimeout(kbFretTimer.current); kbFretTimer.current = null; }
        commitFret(null);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (kbFretTimer.current) { clearTimeout(kbFretTimer.current); kbFretTimer.current = null; }
        kbFretBuf.current = '';
        setFretInput('');
        setSelNote(null); kbSelNote.current = null;
        kbEditMidi.current = null;
        setEditClearToken(t => t + 1);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // stable — all reads/writes go through refs and stable state setters

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (kbFretTimer.current) clearTimeout(kbFretTimer.current);
    if (originalUrl) URL.revokeObjectURL(originalUrl);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Reset to idle ─────────────────────────────────────────────────────────

  const reset = useCallback(() => {
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    setStage('idle');
    setTabData(null);
    setWaveform(null);
    setNotes([]);
    setOriginalUrl(null);
    setSelNote(null);
    setFretInput('');
    setError('');
    setProgress(0);
    setPhaseLabel('');
    audioBufRef.current  = null;
    kbSelNote.current    = null;
    kbEditMidi.current   = null;
    kbFretBuf.current    = '';
    if (kbFretTimer.current) { clearTimeout(kbFretTimer.current); kbFretTimer.current = null; }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [originalUrl]);

  // ── Called when user clicks a note in the tab display ─────────────────────

  const handleNoteSelect = useCallback((n: TabEvent | null) => {
    setSelNote(n);
    kbSelNote.current  = n;
    kbEditMidi.current = n?.midiNote ?? null;
    kbFretBuf.current  = '';
    setFretInput('');
    if (kbFretTimer.current) { clearTimeout(kbFretTimer.current); kbFretTimer.current = null; }
  }, []);

  // ── Process Blob → tab ────────────────────────────────────────────────────

  const processBlob = useCallback(async (blob: Blob, name: string, cfg: TranscribeConfig = DEFAULT_CFG) => {
    setStage('processing');
    setProgress(0);
    setFileName(name);
    setSelNote(null);
    kbSelNote.current = null; kbEditMidi.current = null;
    lastBlobRef.current = blob; // retained so it can be uploaded on "Save to Library"

    const url = URL.createObjectURL(blob);
    setOriginalUrl(prev => { if (prev) URL.revokeObjectURL(prev); return url; });

    try {
      unlockAudio();
      const ctx      = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const arrBuf   = await blob.arrayBuffer();
      const audioBuf = await ctx.decodeAudioData(arrBuf);
      audioBufRef.current = audioBuf;

      setWaveform(buildWaveform(audioBuf, 100));

      let rawNotes: DetectedNote[];
      let viaServer = false;
      const serverUrl = (localStorage.getItem('mt3ServerUrl') ?? DEFAULT_MT3_URL).trim();

      if (serverUrl) {
        setPhaseLabel('Sending to transcription server…');
        setProgress(5);
        try {
          rawNotes = await transcribeWithMT3Server(blob, serverUrl, p => setProgress(p));
          viaServer = true;
        } catch (serverErr) {
          console.warn('[AudioToTab] server failed, falling back to Basic Pitch:', serverErr);
          setPhaseLabel('Server unavailable — analysing in browser…');
          setProgress(0);
          rawNotes = await transcribeAudioBuffer(audioBuf, p => setProgress(p), cfg);
        }
      } else {
        setPhaseLabel('Detecting frequencies…');
        rawNotes = await transcribeAudioBuffer(audioBuf, p => setProgress(p), cfg);
      }

      let refined: DetectedNote[];
      if (viaServer) {
        refined = rawNotes;
        setProgress(96);
      } else {
        setPhaseLabel('Cleaning with AI…');
        setProgress(74);
        refined = await refineNotesWithAI(rawNotes, p => setProgress(74 + Math.round(p * 0.22)));
      }

      setPhaseLabel('Building tab…');
      setProgress(97);
      setNotes(refined);
      const tab = notesToTab(refined, 200, name.replace(/\.[^.]+$/, ''), audioBuf.duration);
      setTabData(tab);
      setProgress(100);
      setStage('result');
    } catch (e) {
      console.error('[AudioToTab]', e);
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg || 'Error processing audio — check the file and try again.');
      setStage('error');
    }
  }, []);

  // ── File handling ─────────────────────────────────────────────────────────

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('audio/') &&
        !/\.(mp3|wav|ogg|flac|m4a|aac|webm)$/i.test(file.name)) {
      setError('Please select an audio file (MP3, WAV, OGG, FLAC, M4A)');
      setStage('error');
      return;
    }
    processBlob(file, file.name);
  }, [processBlob]);

  // ── Mic recording ─────────────────────────────────────────────────────────

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
        ? 'audio/ogg;codecs=opus'
        : '';
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: mime || 'audio/webm' });
        processBlob(blob, 'recording.webm');
      };
      mr.start(100);
      mediaRecRef.current = mr;
      setRecSecs(0);
      setStage('recording');
      timerRef.current = setInterval(() => setRecSecs(s => s + 1), 1000);
    } catch {
      setError('Cannot access microphone — check permissions and try again.');
      setStage('error');
    }
  }, [processBlob]);

  const stopRecording = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    mediaRecRef.current?.stop();
    mediaRecRef.current = null;
  }, []);

  const strName = (s: number) => ['E','A','D','G','B','e'][s] ?? '?';

  // ── Render ────────────────────────────────────────────────────────────────

  // Desktop: capture/progress on the left, output on the right. A phone
  // stacks the two (the output used to be dropped there).
  const dt = (left: React.ReactNode, right?: React.ReactNode) => {
    if (!right) return <>{left}</>;
    if (!desktop) return <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>{left}{right}</div>;
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '420px minmax(0, 1fr)', gap: 36, alignItems: 'start' }}>
        <div>{left}</div>
        <div style={{ position: 'sticky', top: 0 }}>{right}</div>
      </div>
    );
  };

  // The big round capture button: an ink ring around the cobalt record dot
  // (or, while recording, a cobalt disc with a paper stop square).
  const captureBtn = (recording: boolean) => (
    <button onClick={recording ? stopRecording : startRecording} className="gc-no-bar"
      aria-label={recording ? 'Stop recording' : 'Record'}
      style={{
        width: 92, height: 92, borderRadius: '50%', flexShrink: 0, cursor: 'pointer', padding: 0,
        border: 'none', background: recording ? T.primary : T.bgCard,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
      {recording
        ? <span style={{ width: 26, height: 26, background: T.onPrimary }} />
        : <span style={{ width: 44, height: 44, borderRadius: '50%', background: T.primary }} />}
    </button>
  );

  // Ghost output pane shown before transcription exists
  const ghostOut = (
    <Rule label="Transcription output">
      <div aria-hidden style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '12px 0', opacity: 0.35 }}>
        {[0, 1, 2, 3, 4, 5].map(i => <div key={i} style={{ height: 1, background: T.text }} />)}
      </div>
      <p className="su-label" style={{ margin: '10px 0 0' }}>{desktop ? '← ' : ''}Record or upload audio to transcribe</p>
    </Rule>
  );

  // The empty output pane sits beside the capture panel on a desktop only.
  const ghost = desktop ? ghostOut : undefined;

  if (stage === 'idle') return dt(
    <div className="at-root" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <style>{RESPONSIVE_CSS}</style>

      {/* Capture */}
      <Rule label="Capture">
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '10px 0 4px' }}>
          {captureBtn(false)}
          <div style={{ minWidth: 0 }}>
            <p className="su-poster" style={{ margin: 0, fontSize: 44 }}>Record</p>
            <p style={{ margin: '10px 0 0', fontSize: 12.5, color: T.textMuted, lineHeight: 1.5 }}>Play a single line into the microphone</p>
          </div>
        </div>
      </Rule>

      {/* Drop zone */}
      <div
        role="button" tabIndex={0}
        aria-label="Upload an audio file"
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click(); } }}
        style={{
          border: `1px dashed ${T.border}`, borderRadius: 22, background: T.bgCard, padding: '22px 18px', cursor: 'pointer',
          display: 'flex', flexDirection: 'column', gap: 8, minHeight: 44,
        }}
      >
        <span className="su-semi" style={{ fontSize: 22, textTransform: 'uppercase' }}>Drop an audio file — or tap to choose</span>
        <span className="su-label">MP3 · WAV · OGG · M4A · up to 5 min</span>
        <input ref={fileInputRef} type="file" accept="audio/*" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
      </div>
    </div>
  , ghost);

  if (stage === 'recording') return dt(
    <div className="at-root" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Rule label="Recording">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: '8px 0 4px' }}>
          <p className="su-poster" aria-live="polite" style={{ margin: 0, fontSize: 96, fontVariantNumeric: 'tabular-nums' }}>
            {String(Math.floor(recSecs / 60))}:{String(recSecs % 60).padStart(2, '0')}
          </p>
          <RecordingBars />
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {captureBtn(true)}
            <span className="su-label">Tap to stop</span>
          </div>
        </div>
      </Rule>
    </div>
  );

  if (stage === 'processing') return dt(
    <div className="at-root" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Rule label="Transcribing" right={<ClearBtn onClear={reset} />}>
        {waveform && waveform.length > 0 && (
          <div style={{ margin: '6px 0 16px' }}>
            <ProcessingScan data={waveform} progress={progress} />
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: T.text }}>{phaseLabel || 'Processing…'}</p>
          <span className="su-poster" style={{ fontSize: 34, fontVariantNumeric: 'tabular-nums' }}>{progress}%</span>
        </div>
        <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} style={{ background: T.hairline, height: 6 }}>
          <div style={{ height: '100%', background: T.text, width: `${progress}%`, transition: 'width 0.3s' }} />
        </div>
      </Rule>
    </div>
  , ghost);

  if (stage === 'error') return dt(
    <div className="at-root" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Rule label="Error">
        <p className="su-poster" style={{ margin: '4px 0 12px', fontSize: 40 }}>Couldn’t transcribe</p>
        <p dir="auto" style={{ margin: 0, fontSize: 13, color: T.text, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{error}</p>
      </Rule>
      <Cta onClick={reset} style={{ alignSelf: 'flex-start' }}>Try again</Cta>
    </div>
  , ghost);

  if (!tabData) return null;

  // ── Result ────────────────────────────────────────────────────────────────

  const resultLeft = (
    <div className="at-root" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <style>{RESPONSIVE_CSS}</style>
      <StopActions>
        <SaveToLibraryButton
          size="sm" label="Save"
          getPayload={() => !tabData ? null : ({
            kind: 'audio',
            name: (fileName.replace(/\.[^.]+$/, '') || tabData.title || 'Transcription'),
            tab_content: tabDataToAscii(tabData),
            audioBlob: lastBlobRef.current,
            audioExt: (lastBlobRef.current as File | null)?.name?.split('.').pop() || 'webm',
            duration_seconds: tabData.duration,
          })}
        />
      </StopActions>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <PosterTitle head={fileName.replace(/\.[^.]+$/, '') || 'Transcription'} max={desktop ? 72 : 56} min={28} />
          <p className="su-label" style={{ margin: '10px 0 0' }}>
            {notes.length} notes detected · {tabData.duration.toFixed(1)}s
          </p>
        </div>
        <ClearBtn onClear={reset} />
      </div>

      {/* Waveform */}
      {waveform && waveform.length > 0 && (
        <div style={{ borderTop: `var(--su-rule) solid ${T.border}`, padding: '12px 0 0' }}>
          <Waveform data={waveform} height={72} />
        </div>
      )}
    </div>
  );

  const resultRight = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Export and hand-off */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <Pill onClick={() => exportTabToPDF(tabData)}>Export PDF</Pill>
        <Pill onClick={() => exportNotesMidi(notes, `${fileName.replace(/\.[^.]+$/, '') || 'transcription'}.mid`)}>Export MIDI</Pill>
        {/* Into the song, as its melody — Tab Writer and Harmonize pick it up. */}
        {song && tabData && (
          <Pill onClick={() => {
            const cols = Math.max(1, tabData.totalColumns);
            const grid = Array.from({ length: 6 }, () => Array.from({ length: cols }, () => ({ fret: '' })));
            tabData.events.forEach(ev => { const row = 5 - ev.string; if (grid[row]?.[ev.column]) grid[row][ev.column] = { fret: String(ev.fret) }; });
            song.update({ melody: { title: tabData.title || 'Transcription', subtitle: '', grid, bars: [] }, melodyFrom: 'audiotab' });
            flashSent();
          }}>
            <RollLabel>{sent ? '✓ The song’s melody now' : 'Use as the song’s melody'}</RollLabel>
          </Pill>
        )}
      </div>

      {/* Tab — click a note to select, then type to edit */}
      <Rule label="Tab" right={!selNote ? <span className="su-label">Tap a note to edit</span> : undefined}>
        <TabDisplay tabData={tabData} onSelectNote={handleNoteSelect} clearToken={editClearToken} />
      </Rule>

      {/* Keyboard edit hint — shown when a note is selected */}
      {selNote && (
        <div aria-live="polite" style={{
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          padding: '10px 0', borderTop: `1px solid ${T.hairline}`,
        }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: 'var(--gc-mono)' }}>
            String {strName(selNote.string)}{' '}
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>
              {fretInput ? `→ ${fretInput}` : `· Fret ${selNote.fret}`}
            </span>
          </span>
          <span className="su-label" style={{ marginInlineStart: 'auto' }}>
            Type new fret · ⌫ Delete · Esc Cancel
          </span>
        </div>
      )}
    </div>
  );

  return dt(resultLeft, resultRight);
};
