import React, { useState, useRef, useCallback, useEffect } from 'react';
import { T } from '../../theme';
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
import { useLang } from '../../contexts/LanguageContext';
import { icon, SoftButton, TextBtn } from '../ChordBuilder/Stage';
import { Sheet } from '../Workspace/Sheet';

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

// Drawn on the glass card: quiet string lines, bold numbers, the selected
// note a white cell like a chosen chip.
const TAB_BG   = T.bgCard;
const TAB_LINE = 'rgba(255,255,255,0.28)';
const TAB_BAR  = 'rgba(255,255,255,0.5)';
const TAB_LBL  = T.textMuted;
const TAB_SEL  = T.text;

const COL_W        = 16;
const STR_GAP      = 16;
const LEFT_PAD     = 28;

// ── Tab SVG row ───────────────────────────────────────────────────────────────

function TabSVGRow({ cols, colStart, colEnd, colMap, selectedCol, onTap }: {
  cols: number;
  colStart: number;
  colEnd: number;
  colMap: Map<number, Map<number, number>>;
  selectedCol: number | null;
  onTap: (col: number, stringIdx: number, e: React.MouseEvent) => void;
}) {
  const lineW = cols * COL_W;
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
  for (let c = 4; c < cols; c += 4) {
    const bx = LEFT_PAD + c * COL_W;
    els.push(
      <line key={`b${c}`} x1={bx} y1={TOP} x2={bx} y2={TOP + 5 * STR_GAP}
        stroke="rgba(255,255,255,0.1)" strokeWidth={1} />,
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
            fill={sel ? '#000' : T.text}
            textAnchor="middle"
            fontFamily="var(--gc-mono)" fontWeight="700">
            {lbl}
          </text>
        </g>,
      );
    }
  }

  return (
    <svg width="100%" viewBox={`0 0 ${LEFT_PAD + lineW + 4} ${svgH}`}
      preserveAspectRatio="xMinYMin meet"
      style={{ display: 'block' }}>
      {els}
    </svg>
  );
}

// ── Tab display ───────────────────────────────────────────────────────────────

function TabDisplay({ tabData, onSelectNote, clearToken, he, cols }: {
  tabData: TabData;
  /** Columns per line: fewer on a phone so the numbers stay big enough to tap. */
  cols: number;
  onSelectNote: (ev: TabEvent | null) => void;
  clearToken: number;
  he: boolean;
}) {
  const [selectedCol, setSelectedCol] = useState<number | null>(null);
  const { events, totalColumns } = tabData;

  // Clear selection when parent signals (e.g. after keyboard edit commits)
  const [seenToken, setSeenToken] = useState(clearToken);
  if (seenToken !== clearToken) { setSeenToken(clearToken); setSelectedCol(null); }

  if (totalColumns === 0) {
    return (
      <div style={{ padding: '18px 0', textAlign: 'center' }}>
        <p style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{he ? 'לא נשמעו תווים' : 'No notes heard'}</p>
        <p className="su-sub" style={{ margin: '6px 0 0', fontSize: 15 }}>{he ? 'נסו הקלטה חזקה ונקייה יותר.' : 'Try a louder, cleaner take.'}</p>
      </div>
    );
  }

  const colMap = new Map<number, Map<number, number>>();
  for (const ev of events) {
    if (!colMap.has(ev.column)) colMap.set(ev.column, new Map());
    colMap.get(ev.column)!.set(ev.string, ev.fret);
  }

  const numRows = Math.ceil(totalColumns / cols);

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
        const colStart = r * cols;
        const colEnd   = Math.min(colStart + cols, totalColumns);
        return (
          <TabSVGRow key={r} cols={cols}
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

// ── Words, in both languages ─────────────────────────────────────────────────

type Phase = 'server' | 'fallback' | 'detect' | 'ai' | 'build';
type ErrCode = 'notAudio' | 'mic' | 'failed';

const PHASE: Record<Phase, { en: string; he: string }> = {
  server:   { en: 'Sending to the transcription server…', he: 'שולח לשרת התמלול…' },
  fallback: { en: 'Server unavailable, listening in the browser…', he: 'השרת לא זמין, מאזין בדפדפן…' },
  detect:   { en: 'Finding the notes…', he: 'מחפש את התווים…' },
  ai:       { en: 'Cleaning up with AI…', he: 'מנקה עם AI…' },
  build:    { en: 'Writing the tab…', he: 'כותב את הטאב…' },
};

const ERR: Record<ErrCode, { en: string; he: string }> = {
  notAudio: { en: 'Please choose an audio file (MP3, WAV, OGG, FLAC, M4A).', he: 'בחרו קובץ אודיו (MP3, WAV, OGG, FLAC, M4A).' },
  mic:      { en: 'The microphone isn’t available. Check the permission and try again.', he: 'אין גישה למיקרופון. בדקו את ההרשאה ונסו שוב.' },
  failed:   { en: 'Something went wrong with this recording. Check the file and try again.', he: 'משהו השתבש בהקלטה הזו. בדקו את הקובץ ונסו שוב.' },
};

const STR_LETTER = ['E', 'A', 'D', 'G', 'B', 'e'];
const FRETS = Array.from({ length: 23 }, (_, i) => String(i));

// ── Main component ────────────────────────────────────────────────────────────

export const AudioToTab: React.FC<{ desktop?: boolean }> = ({ desktop }) => {
  const { lang } = useLang();
  const he = lang === 'he';
  const [stage, setStage]             = useState<Stage>('idle');
  const [progress, setProgress]       = useState(0);
  const [phase, setPhase]             = useState<Phase | null>(null);
  const [error, setError]             = useState<{ code: ErrCode; detail?: string } | null>(null);
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
  const [listening, setListening]     = useState(false);    // the original recording is playing

  const mediaRecRef  = useRef<MediaRecorder | null>(null);
  const chunksRef    = useRef<Blob[]>([]);
  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioBufRef  = useRef<AudioBuffer | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastBlobRef  = useRef<Blob | null>(null);
  const audioElRef   = useRef<HTMLAudioElement | null>(null);

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

  const rebuild = (updated: DetectedNote[]) => {
    setNotes(updated);
    setTabData(notesToTab(
      updated, 200,
      kbFileName.current.replace(/\.[^.]+$/, ''),
      audioBufRef.current?.duration ?? kbTabData.current?.duration ?? 0,
    ));
  };

  const deselect = useCallback(() => {
    if (kbFretTimer.current) { clearTimeout(kbFretTimer.current); kbFretTimer.current = null; }
    kbFretBuf.current = '';
    setFretInput('');
    setSelNote(null); kbSelNote.current = null;
    kbEditMidi.current = null;
    setEditClearToken(t => t + 1);
  }, []);

  // Set the selected note to a new fret (null deletes it), then deselect.
  // Reads only refs, so the keyboard handler and the fret picker share it.
  const commitFret = useCallback((newFret: number | null) => {
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
    rebuild(updated);
    deselect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deselect]);

  // Keyboard editing on a computer: type a fret, ⌫ deletes, Esc cancels.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!kbSelNote.current) return;
      if ((e.target as HTMLElement).tagName === 'INPUT') return;

      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        if (kbFretTimer.current) { clearTimeout(kbFretTimer.current); kbFretTimer.current = null; }

        const buf = kbFretBuf.current;
        const val = parseInt(buf + e.key);

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
          rebuild(kbNotes.current.map(n =>
            (Math.abs(n.startTime - sel.startTime) < 0.02 && n.midiNote === midi)
              ? { ...n, midiNote: newMidi, frequency: midiToFreq(newMidi) }
              : n
          ));
          kbEditMidi.current = newMidi; // track so second digit finds the updated note
          setFretInput(e.key);
          // Auto-commit after 800 ms if no second digit follows
          kbFretTimer.current = setTimeout(deselect, 800);
        }
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        commitFret(null);
      }
      // Esc closes the fret sheet, which deselects.
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
    audioElRef.current?.pause();
    setListening(false);
    setStage('idle');
    setTabData(null);
    setWaveform(null);
    setNotes([]);
    setOriginalUrl(null);
    setError(null);
    setProgress(0);
    setPhase(null);
    audioBufRef.current = null;
    deselect();
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [originalUrl, deselect]);

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
        setPhase('server');
        setProgress(5);
        try {
          rawNotes = await transcribeWithMT3Server(blob, serverUrl, p => setProgress(p));
          viaServer = true;
        } catch (serverErr) {
          console.warn('[AudioToTab] server failed, falling back to Basic Pitch:', serverErr);
          setPhase('fallback');
          setProgress(0);
          rawNotes = await transcribeAudioBuffer(audioBuf, p => setProgress(p), cfg);
        }
      } else {
        setPhase('detect');
        rawNotes = await transcribeAudioBuffer(audioBuf, p => setProgress(p), cfg);
      }

      let refined: DetectedNote[];
      if (viaServer) {
        refined = rawNotes;
        setProgress(96);
      } else {
        setPhase('ai');
        setProgress(74);
        refined = await refineNotesWithAI(rawNotes, p => setProgress(74 + Math.round(p * 0.22)));
      }

      setPhase('build');
      setProgress(97);
      setNotes(refined);
      const tab = notesToTab(refined, 200, name.replace(/\.[^.]+$/, ''), audioBuf.duration);
      setTabData(tab);
      setProgress(100);
      setStage('result');
    } catch (e) {
      console.error('[AudioToTab]', e);
      const msg = e instanceof Error ? e.message : String(e);
      setError({ code: 'failed', detail: msg || undefined });
      setStage('error');
    }
  }, []);

  // ── File handling ─────────────────────────────────────────────────────────

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('audio/') &&
        !/\.(mp3|wav|ogg|flac|m4a|aac|webm)$/i.test(file.name)) {
      setError({ code: 'notAudio' });
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
        processBlob(blob, he ? 'הקלטה.webm' : 'recording.webm');
      };
      mr.start(100);
      mediaRecRef.current = mr;
      setRecSecs(0);
      setStage('recording');
      timerRef.current = setInterval(() => setRecSecs(s => s + 1), 1000);
    } catch {
      setError({ code: 'mic' });
      setStage('error');
    }
  }, [processBlob, he]);

  const stopRecording = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    mediaRecRef.current?.stop();
    mediaRecRef.current = null;
  }, []);

  const toggleListen = () => {
    const el = audioElRef.current;
    if (!el) return;
    if (listening) el.pause(); else el.play().catch(() => setListening(false));
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const title = fileName.replace(/\.[^.]+$/, '') || (he ? 'תמלול' : 'Transcription');
  const wrap = (children: React.ReactNode) => (
    <div className="su-in" style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', maxWidth: desktop ? 900 : undefined, margin: '0 auto', paddingTop: 8 }}>
      {children}
    </div>
  );
  const card = (children: React.ReactNode, style?: React.CSSProperties) => (
    <div style={{ background: T.bgCard, borderRadius: 26, padding: desktop ? '22px 24px' : '18px 18px', minWidth: 0, ...style }}>{children}</div>
  );
  const cardHead = (label: React.ReactNode, end?: React.ReactNode) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10, minHeight: 28 }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: T.textMuted }}>{label}</span>
      {end}
    </div>
  );
  const newBtn = (
    <StopActions>
      <button onClick={reset} className="lg lg-circle gc-no-bar" aria-label={he ? 'התחלה מחדש' : 'Start over'} title={he ? 'התחלה מחדש' : 'Start over'}>
        {icon(<><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></>)}
      </button>
    </StopActions>
  );

  // The big round capture button: a glass ring around a red-ink record dot
  // (or, while recording, a white disc with a dark stop square).
  const captureBtn = (recording: boolean) => (
    <button onClick={recording ? stopRecording : startRecording} className="gc-no-bar lg"
      aria-label={recording ? (he ? 'עצירת ההקלטה' : 'Stop recording') : (he ? 'הקלטה' : 'Record')}
      style={{
        width: 104, height: 104, borderRadius: '50%', flexShrink: 0, cursor: 'pointer', padding: 0,
        background: recording ? T.text : undefined,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
      {recording
        ? <span style={{ width: 30, height: 30, borderRadius: 7, background: '#000' }} />
        : <span style={{ width: 52, height: 52, borderRadius: '50%', background: T.primary }} />}
    </button>
  );

  if (stage === 'idle') return wrap(<>
    {/* Record: the one big action, centred */}
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center', padding: desktop ? '28px 0 10px' : '16px 0 4px' }}>
      {captureBtn(false)}
      <h2 style={{ margin: '6px 0 0', fontFamily: 'var(--su-display)', fontSize: desktop ? 40 : 32, fontWeight: 700, letterSpacing: '-0.03em' }}>
        {he ? 'הקליטו קטע' : 'Record a line'}
      </h2>
      <span className="su-sub" style={{ fontSize: 15, maxWidth: 360 }}>
        {he ? 'נגנו מלודיה אחת למיקרופון, ונכתוב לכם אותה כטאב.' : 'Play one melody into the microphone and we’ll write it out as tab.'}
      </span>
    </div>

    {/* Or a file */}
    <div
      role="button" tabIndex={0}
      aria-label={he ? 'בחירת קובץ אודיו' : 'Choose an audio file'}
      onDragOver={e => e.preventDefault()}
      onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
      onClick={() => fileInputRef.current?.click()}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click(); } }}
      className="su-row"
      style={{
        border: '1.5px dashed rgba(255,255,255,0.22)', borderRadius: 26, background: T.bgCard, padding: '20px 20px', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 14,
      }}
    >
      <span aria-hidden style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
        {icon(<><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M5 20h14" /></>)}
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
        <span style={{ fontSize: 17, fontWeight: 600 }}>{desktop ? (he ? 'גררו לכאן קובץ אודיו, או לחצו לבחירה' : 'Drop an audio file here, or click to choose') : (he ? 'בחירת קובץ אודיו' : 'Choose an audio file')}</span>
        <span className="su-sub" style={{ fontSize: 13 }}><bdi dir="ltr">MP3 · WAV · OGG · M4A</bdi> · {he ? 'עד 5 דקות' : 'up to 5 min'}</span>
      </span>
      <input ref={fileInputRef} type="file" accept="audio/*" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
    </div>
  </>);

  if (stage === 'recording') return wrap(
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, textAlign: 'center', padding: desktop ? '28px 0' : '16px 0' }}>
      <span style={{ fontSize: 15, fontWeight: 600, color: T.textMuted }}>{he ? 'מקליט…' : 'Recording…'}</span>
      <p aria-live="polite" dir="ltr" style={{ margin: 0, fontFamily: 'var(--su-display)', fontSize: desktop ? 104 : 84, lineHeight: 1, fontWeight: 700, letterSpacing: '-0.045em', fontVariantNumeric: 'tabular-nums' }}>
        {String(Math.floor(recSecs / 60))}:{String(recSecs % 60).padStart(2, '0')}
      </p>
      <RecordingBars />
      {captureBtn(true)}
      <span className="su-sub" style={{ fontSize: 15 }}>{he ? 'הקישו כדי לעצור' : 'Tap to stop'}</span>
    </div>
  );

  if (stage === 'processing') return wrap(<>
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, textAlign: 'center', padding: '12px 0 4px' }}>
      <span style={{ fontSize: 15, fontWeight: 600, color: T.textMuted }}>{phase ? PHASE[phase][lang] : (he ? 'מעבד…' : 'Working…')}</span>
      <p dir="ltr" style={{ margin: 0, fontFamily: 'var(--su-display)', fontSize: desktop ? 96 : 76, lineHeight: 1.05, fontWeight: 700, letterSpacing: '-0.045em', fontVariantNumeric: 'tabular-nums' }}>{progress}%</p>
    </div>
    {card(<>
      {waveform && waveform.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <ProcessingScan data={waveform} progress={progress} />
        </div>
      )}
      <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}
        style={{ background: 'rgba(255,255,255,0.1)', height: 6, borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', background: T.text, borderRadius: 3, width: `${progress}%`, transition: 'width 0.3s' }} />
      </div>
    </>)}
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <TextBtn onClick={reset}>{he ? 'ביטול' : 'Cancel'}</TextBtn>
    </div>
  </>);

  if (stage === 'error') return wrap(
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center', padding: desktop ? '36px 0' : '20px 0' }}>
      <h2 style={{ margin: 0, fontFamily: 'var(--su-display)', fontSize: desktop ? 40 : 32, fontWeight: 700, letterSpacing: '-0.03em' }}>
        {he ? 'לא הצלחנו לתמלל' : 'Couldn’t transcribe'}
      </h2>
      <span className="su-sub" style={{ fontSize: 15, maxWidth: 420 }}>{error ? ERR[error.code][lang] : ''}</span>
      {error?.detail && (
        <span dir="auto" style={{ fontSize: 12, color: T.textMuted, maxWidth: 420, wordBreak: 'break-word' }}>{error.detail}</span>
      )}
      <button onClick={reset} className="gc-no-bar"
        style={{ marginTop: 10, height: 50, padding: '0 26px', borderRadius: 25, background: T.text, color: '#000', fontSize: 17, fontWeight: 600 }}>
        {he ? 'לנסות שוב' : 'Try again'}
      </button>
    </div>
  );

  if (!tabData) return null;

  // ── Result ────────────────────────────────────────────────────────────────

  const useAsMelody = () => {
    const cols = Math.max(1, tabData.totalColumns);
    const grid = Array.from({ length: 6 }, () => Array.from({ length: cols }, () => ({ fret: '' })));
    tabData.events.forEach(ev => { const row = 5 - ev.string; if (grid[row]?.[ev.column]) grid[row][ev.column] = { fret: String(ev.fret) }; });
    song!.update({ melody: { title: tabData.title || 'Transcription', subtitle: '', grid, bars: [] }, melodyFrom: 'audiotab' });
    flashSent();
  };

  const secs = tabData.duration.toFixed(1);

  return wrap(<>
    {newBtn}
    {originalUrl && (
      <audio ref={audioElRef} src={originalUrl} preload="auto"
        onPlay={() => setListening(true)} onPause={() => setListening(false)} onEnded={() => setListening(false)} />
    )}

    {/* Stage: the take's name, how many notes, how long */}
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, textAlign: 'center', minWidth: 0, paddingTop: 6 }}>
      <span style={{ fontSize: 15, fontWeight: 600, color: T.textMuted }}>{he ? 'התמלול מוכן' : 'Transcription ready'}</span>
      <h2 dir="auto" style={{ margin: 0, fontFamily: 'var(--su-display)', fontSize: desktop ? 52 : 40, lineHeight: 1.1, fontWeight: 700, letterSpacing: '-0.035em', maxWidth: '100%', overflowWrap: 'anywhere' }}>{title}</h2>
      <span className="su-sub" style={{ fontSize: 15 }}>
        {he ? <>{notes.length} תווים · <bdi dir="ltr">{secs}</bdi> שניות</> : <>{notes.length} notes · {secs}s</>}
      </span>
    </div>

    {/* Listen, and send it on */}
    <div style={{ display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
      {originalUrl && (
        <button onClick={toggleListen} aria-pressed={listening} className="gc-no-bar"
          style={{ height: 50, padding: '0 26px 0 22px', borderRadius: 25, background: T.text, color: '#000', display: 'flex', alignItems: 'center', gap: 8, fontSize: 17, fontWeight: 600 }}>
          {listening
            ? <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden><path d="M6 4h4v16H6zM14 4h4v16h-4z" fill="currentColor" /></svg>
            : <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden><path d="M7 4.5v15l13-7.5z" fill="currentColor" /></svg>}
          {listening ? (he ? 'עצירה' : 'Pause') : (he ? 'השמעת ההקלטה' : 'Play the recording')}
        </button>
      )}
      {song && (
        <SoftButton onClick={useAsMelody}>
          <RollLabel>{sent ? (he ? 'נשמר כמלודיה של השיר' : 'Now the song’s melody') : (he ? 'שימוש כמלודיה של השיר' : 'Use as the song’s melody')}</RollLabel>
        </SoftButton>
      )}
    </div>
    <div style={{ display: 'flex', justifyContent: 'center', gap: 4, flexWrap: 'wrap' }}>
      <SaveToLibraryButton
        size="sm" label={he ? 'שמירה לספרייה' : 'Save to Library'}
        style={{ height: 40, padding: '0 14px', borderRadius: 20, fontSize: 15, fontWeight: 500, color: T.tintLabel, background: 'transparent', border: 'none' }}
        getPayload={() => ({
          kind: 'audio',
          name: title,
          tab_content: tabDataToAscii(tabData),
          audioBlob: lastBlobRef.current,
          audioExt: (lastBlobRef.current as File | null)?.name?.split('.').pop() || 'webm',
          duration_seconds: tabData.duration,
        })}
      />
      <TextBtn onClick={() => exportTabToPDF(tabData)}>{he ? 'ייצוא PDF' : 'Export PDF'}</TextBtn>
      <TextBtn onClick={() => exportNotesMidi(notes, `${title || 'transcription'}.mid`)}>{he ? 'ייצוא MIDI' : 'Export MIDI'}</TextBtn>
    </div>

    {/* The waveform */}
    {waveform && waveform.length > 0 && card(<Waveform data={waveform} height={desktop ? 72 : 56} />, { padding: desktop ? '18px 24px' : '14px 18px' })}

    {/* The tab: tap a note to change it */}
    {card(<>
      {cardHead(he ? 'טאב' : 'Tab', <span className="su-sub" style={{ fontSize: 13 }}>{he ? 'הקישו על תו כדי לתקן אותו' : 'Tap a note to fix it'}</span>)}
      <TabDisplay tabData={tabData} onSelectNote={handleNoteSelect} clearToken={editClearToken} he={he} cols={desktop ? 20 : 10} />
    </>)}

    {/* Fix one note: pick its fret, or delete it */}
    {selNote && (
      <Sheet onClose={deselect} maxWidth={440}
        kicker={he ? <>מיתר <bdi dir="ltr">{STR_LETTER[selNote.string]}</bdi></> : <>String {STR_LETTER[selNote.string]}</>}
        title={he ? 'תיקון התו' : 'Fix this note'}>
        <span className="su-sub" style={{ fontSize: 15 }} aria-live="polite">
          {fretInput
            ? (he ? <>סריג חדש: <bdi dir="ltr">{fretInput}</bdi></> : <>New fret: {fretInput}</>)
            : (he ? <>עכשיו בסריג <bdi dir="ltr">{selNote.fret}</bdi>. בחרו סריג אחר:</> : <>Now on fret {selNote.fret}. Pick another:</>)}
        </span>
        <div role="radiogroup" aria-label={he ? 'סריג' : 'Fret'} dir="ltr"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 6 }}>
          {FRETS.map(f => {
            const on = String(selNote.fret) === f;
            return (
              <button key={f} role="radio" aria-checked={on} onClick={() => commitFret(Number(f))} className="gc-no-bar gc-notation"
                style={{ height: 44, borderRadius: 22, fontSize: 16, fontWeight: 600, background: on ? T.text : 'rgba(255,255,255,0.08)', color: on ? '#000' : T.text }}>
                {f}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <TextBtn onClick={() => commitFret(null)}>{he ? 'מחיקת התו' : 'Delete note'}</TextBtn>
          {desktop && <span className="su-sub" style={{ fontSize: 13 }}>{he ? 'אפשר גם להקליד מספר במקלדת' : 'You can also type a number'}</span>}
        </div>
      </Sheet>
    )}
  </>);
};
