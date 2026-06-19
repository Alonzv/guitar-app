import React, { useState, useRef, useCallback, useEffect } from 'react';
import { T, card } from '../../theme';
import {
  transcribeAudioBuffer, transcribeWithMT3Server, refineNotesWithAI, notesToTab, buildWaveform,
  exportTabToPDF, midiToFreq, OPEN_MIDI, STRING_NAMES,
  type TabData, type TabEvent, type DetectedNote, type TranscribeConfig,
} from '../../utils/audioToTab';
import { unlockAudio } from '../../utils/audioPlayback';
import { exportNotesMidi } from '../../utils/midiExport';

type Stage = 'idle' | 'recording' | 'processing' | 'result' | 'error';

const DEFAULT_MT3_URL = 'https://vipapito-scaleup-transcribe.hf.space';
const DEFAULT_CFG: TranscribeConfig = { instrument: 'acoustic', mixType: 'solo' };

// ── Tab visual constants ──────────────────────────────────────────────────────

const TAB_BG   = '#F0F0F0';
const TAB_LINE = '#D0D0D0';
const TAB_BAR  = '#2D2D2D';
const TAB_NUM  = '#1A1818';
const TAB_LBL  = '#3A3A3A';
const TAB_SEL  = '#CC1C1C';

const COL_W        = 16;
const STR_GAP      = 16;
const LEFT_PAD     = 28;
const COLS_PER_ROW = 20;
const VB_W = LEFT_PAD + COLS_PER_ROW * COL_W + 4;

// ── Clear button ──────────────────────────────────────────────────────────────

function ClearBtn({ onClear }: { onClear: () => void }) {
  return (
    <button
      onClick={onClear}
      title="איפוס — חזור לתחילה"
      style={{
        padding: '7px 14px', borderRadius: 0, cursor: 'pointer', fontWeight: 700,
        fontSize: 12, border: `1px solid ${T.border}`,
        background: T.bgInput, color: T.textMuted, flexShrink: 0,
        borderLeft: '3px solid var(--gc-bar-color)',
      }}
    >
      Clear
    </button>
  );
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

  els.push(<rect key="bg" x={0} y={0} width={VB_W} height={svgH} fill={TAB_BG} />);

  for (let di = 0; di < 6; di++) {
    const sy = TOP + di * STR_GAP;
    els.push(
      <line key={`l${di}`} x1={LEFT_PAD - 2} y1={sy} x2={LEFT_PAD + lineW} y2={sy}
        stroke={TAB_LINE} strokeWidth={1.2} />,
      <text key={`n${di}`} x={LEFT_PAD - 6} y={sy + 3.5}
        fontSize={9} fill={TAB_LBL} textAnchor="end"
        fontFamily="monospace, 'Courier New', monospace" fontWeight="700">
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
        stroke={TAB_BAR} strokeWidth={1} opacity={0.5} />,
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
            fill={sel ? TAB_SEL : TAB_BG} rx={2} />
          <text x={cx} y={sy + 4.5} fontSize={8.5}
            fill={sel ? '#fff' : TAB_NUM}
            textAnchor="middle"
            fontFamily="monospace, 'Courier New', monospace" fontWeight="700">
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
  useEffect(() => { setSelectedCol(null); }, [clearToken]);

  if (totalColumns === 0) {
    return (
      <div style={{ background: TAB_BG, borderRadius: 0, padding: '20px', textAlign: 'center' }}>
        <p style={{ margin: 0, fontSize: 13, color: TAB_LBL }}>לא זוהו תווים בקטע השמע</p>
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
    <div style={{
      background: TAB_BG, borderRadius: 0, padding: '10px 8px',
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
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
          0%,100% { transform: scaleY(0.7); opacity: 0.75; }
          50%      { transform: scaleY(1);   opacity: 1;    }
        }
      `}</style>
      <svg width="100%" viewBox={`0 0 ${W} ${height}`}
        preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }}>
        <defs>
          <linearGradient id="wv-green" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%"   stopColor="#1A7A4A" />
            <stop offset="50%"  stopColor="#1A7A4A" />
            <stop offset="100%" stopColor="#136038" />
          </linearGradient>
        </defs>
        {sampled.map((v, i) => {
          const h     = Math.max(2, v * mid * 0.94);
          const cx    = i * barW + barW / 2;
          const delay = `${((i / N) * 2.0).toFixed(2)}s`;
          return (
            <rect key={i}
              x={i * barW + gap / 2} y={mid - h}
              width={Math.max(1.5, bw)} height={h * 2}
              fill="url(#wv-green)" rx={Math.min(3, bw / 2)}
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
      <style>{`@keyframes at-eq{from{transform:scaleY(.1)}to{transform:scaleY(1)}}`}</style>
      <svg width={120} height={40} viewBox="0 0 120 40" style={{ display: 'block', margin: '0 auto' }}>
        {Array.from({ length: 10 }, (_, i) => (
          <rect key={i} x={i * 12 + 2} y={2} width={9} height={36}
            fill={T.primary} rx={4.5} opacity={0.85}
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

const LABEL: React.CSSProperties = {
  margin: '0 0 10px', fontSize: 11, fontWeight: 700,
  color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em',
};

// ── Main component ────────────────────────────────────────────────────────────

export const AudioToTab: React.FC = () => {
  const [stage, setStage]             = useState<Stage>('idle');
  const [progress, setProgress]       = useState(0);
  const [phaseLabel, setPhaseLabel]   = useState('');
  const [error, setError]             = useState('');
  const [tabData, setTabData]         = useState<TabData | null>(null);
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
        setPhaseLabel('שולח לשרת תמלול…');
        setProgress(5);
        try {
          rawNotes = await transcribeWithMT3Server(blob, serverUrl, p => setProgress(p));
          viaServer = true;
        } catch (serverErr) {
          console.warn('[AudioToTab] server failed, falling back to Basic Pitch:', serverErr);
          setPhaseLabel('השרת לא זמין — מנתח בדפדפן…');
          setProgress(0);
          rawNotes = await transcribeAudioBuffer(audioBuf, p => setProgress(p), cfg);
        }
      } else {
        setPhaseLabel('מזהה תדרים…');
        rawNotes = await transcribeAudioBuffer(audioBuf, p => setProgress(p), cfg);
      }

      let refined: DetectedNote[];
      if (viaServer) {
        refined = rawNotes;
        setProgress(96);
      } else {
        setPhaseLabel('מנקה עם AI…');
        setProgress(74);
        refined = await refineNotesWithAI(rawNotes, p => setProgress(74 + Math.round(p * 0.22)));
      }

      setPhaseLabel('בונה טאב…');
      setProgress(97);
      setNotes(refined);
      const tab = notesToTab(refined, 200, name.replace(/\.[^.]+$/, ''), audioBuf.duration);
      setTabData(tab);
      setProgress(100);
      setStage('result');
    } catch (e) {
      console.error('[AudioToTab]', e);
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg || 'שגיאה בעיבוד השמע — ודא שהקובץ תקין ונסה שוב.');
      setStage('error');
    }
  }, []);

  // ── File handling ─────────────────────────────────────────────────────────

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('audio/') &&
        !/\.(mp3|wav|ogg|flac|m4a|aac|webm)$/i.test(file.name)) {
      setError('אנא בחר קובץ שמע (MP3, WAV, OGG, FLAC, M4A)');
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
      setError('לא ניתן לגשת למיקרופון — בדוק הרשאות ונסה שוב.');
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

  if (stage === 'idle') return (
    <div className="at-root" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <style>{RESPONSIVE_CSS}</style>
      <div
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
        onClick={() => fileInputRef.current?.click()}
        style={{
          ...card({ padding: '32px 20px' }),
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
          cursor: 'pointer', borderStyle: 'dashed', borderColor: T.primary, textAlign: 'center',
        }}
      >
        <svg viewBox="0 0 40 40" width={40} height={40} fill="none" stroke={T.primary} strokeWidth={2}>
          <circle cx="20" cy="20" r="18" strokeDasharray="5 3" />
          <path d="M20 28V13" strokeLinecap="round" />
          <path d="M14 19l6-6 6 6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M12 31c0 1.7 1.3 3 3 3h10c1.7 0 3-1.3 3-3" strokeLinecap="round" />
        </svg>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: T.text }}>גרור קובץ שמע לכאן</p>
        <p style={{ margin: 0, fontSize: 12, color: T.textMuted }}>MP3 · WAV · OGG · M4A · עד 5 דקות</p>
        <input ref={fileInputRef} type="file" accept="audio/*" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
      </div>

      <button
        onClick={startRecording}
        style={{
          ...card({ padding: '14px 16px' }),
          display: 'flex', alignItems: 'center', gap: 12, border: `1px solid ${T.border}`,
          cursor: 'pointer', background: T.bgCard, width: '100%',
        }}
      >
        <div style={{
          width: 38, height: 38, borderRadius: 0, background: T.coral, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="#fff" strokeWidth={2}>
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11c0 3.9 3.1 7 7 7s7-3.1 7-7" strokeLinecap="round" />
            <line x1="12" y1="18" x2="12" y2="22" />
            <line x1="9" y1="22" x2="15" y2="22" />
          </svg>
        </div>
        <div style={{ textAlign: 'left' }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: T.text }}>הקלטה מהמיקרופון</p>
          <p style={{ margin: 0, fontSize: 12, color: T.textMuted }}>נגן ציר יחיד ישירות לאפליקציה</p>
        </div>
      </button>
    </div>
  );

  if (stage === 'recording') return (
    <div className="at-root" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ ...card({ padding: '28px 20px' }), textAlign: 'center' }}>
        <RecordingBars />
        <p style={{ margin: '16px 0 4px', fontSize: 26, fontWeight: 800, color: T.primary, fontVariantNumeric: 'tabular-nums' }}>
          {String(Math.floor(recSecs / 60)).padStart(2, '0')}:{String(recSecs % 60).padStart(2, '0')}
        </p>
        <p style={{ margin: '0 0 20px', fontSize: 12, color: T.textMuted }}>מקליט…</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button onClick={stopRecording} style={{
            padding: '12px 32px', borderRadius: 0, cursor: 'pointer',
            background: T.coral, color: '#fff', fontWeight: 700, fontSize: 14,
            borderLeft: '4px solid var(--gc-bar-color)',
          }}>
            עצור ועבד
          </button>
          <ClearBtn onClear={reset} />
        </div>
      </div>
    </div>
  );

  if (stage === 'processing') return (
    <div className="at-root" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={card({ padding: '22px 18px' })}>
        {waveform && waveform.length > 0 && (
          <div style={{ marginBottom: 16, borderRadius: 0, overflow: 'hidden', padding: '4px 0' }}>
            <Waveform data={waveform} height={64} />
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: T.text }}>
            {phaseLabel || 'מעבד…'}
          </p>
          <span style={{ fontSize: 12, color: T.textMuted, fontVariantNumeric: 'tabular-nums' }}>{progress}%</span>
        </div>
        <div style={{ background: T.bgInput, borderRadius: 0, height: 8, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 0, background: T.primary,
            width: `${progress}%`, transition: 'width 0.3s',
          }} />
        </div>
        <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
          <ClearBtn onClear={reset} />
        </div>
      </div>
    </div>
  );

  if (stage === 'error') return (
    <div className="at-root" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ ...card({ padding: '18px 16px' }), borderLeft: `3px solid ${T.coral}` }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <span style={{ fontSize: 18, lineHeight: 1.4 }}>⚠️</span>
          <p style={{ margin: 0, fontSize: 13, color: T.text, direction: 'rtl', textAlign: 'right', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{error}</p>
        </div>
      </div>
      <button onClick={reset} style={{
        padding: '12px 0', borderRadius: 0, cursor: 'pointer',
        background: T.primary, color: '#fff', fontWeight: 700, fontSize: 14,
        borderLeft: '4px solid var(--gc-bar-color)',
      }}>
        נסה שוב
      </button>
    </div>
  );

  if (!tabData) return null;

  // ── Result ────────────────────────────────────────────────────────────────

  return (
    <div className="at-root" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <style>{RESPONSIVE_CSS}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: T.text,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>
            {fileName}
          </p>
          <p style={{ margin: 0, fontSize: 11, color: T.textMuted }}>
            {notes.length} תווים זוהו · {tabData.duration.toFixed(1)}s
          </p>
        </div>
        <ClearBtn onClear={reset} />
      </div>

      {/* Waveform */}
      {waveform && waveform.length > 0 && (
        <div style={{ borderRadius: 0, overflow: 'hidden', padding: '4px 0' }}>
          <Waveform data={waveform} height={72} />
        </div>
      )}

      {/* Export buttons */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={() => exportTabToPDF(tabData)}
          style={{
            flex: 1, padding: '13px 0', borderRadius: 0, cursor: 'pointer',
            background: T.secondary, color: '#fff', fontWeight: 700, fontSize: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            borderLeft: '4px solid var(--gc-bar-color)',
          }}
        >
          <svg viewBox="0 0 24 24" width={17} height={17} fill="none" stroke="currentColor" strokeWidth={2.2}>
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" strokeLinecap="round" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          ייצא ל-PDF
        </button>
        <button
          onClick={() => exportNotesMidi(notes, `${fileName.replace(/\.[^.]+$/, '') || 'transcription'}.mid`)}
          style={{
            flex: 1, padding: '13px 0', borderRadius: 0, cursor: 'pointer',
            background: T.primary, color: '#fff', fontWeight: 700, fontSize: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            borderLeft: '4px solid var(--gc-bar-color)',
          }}
        >
          <svg viewBox="0 0 24 24" width={17} height={17} fill="none" stroke="currentColor" strokeWidth={2.2}>
            <path d="M9 18V5l12-2v13" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
          ייצא ל-MIDI
        </button>
      </div>

      {/* Tab — click a note to select, then type to edit */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingLeft: 2 }}>
          <p style={{ ...LABEL, margin: 0 }}>טאב</p>
          {!selNote && (
            <span style={{ fontSize: 11, color: T.textMuted }}>לחץ על תו לעריכה</span>
          )}
        </div>
        <TabDisplay tabData={tabData} onSelectNote={handleNoteSelect} clearToken={editClearToken} />
      </div>

      {/* Keyboard edit hint — shown when a note is selected */}
      {selNote && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          padding: '9px 13px', background: T.bgInput, borderRadius: 0,
          borderLeft: `3px solid ${T.primary}`,
        }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>
            ✎ מיתר {strName(selNote.string)}{' '}
            <span style={{ color: T.primary, fontVariantNumeric: 'tabular-nums' }}>
              {fretInput ? `→ ${fretInput}` : `· פרט ${selNote.fret}`}
            </span>
          </span>
          <span style={{ fontSize: 11, color: T.textMuted, marginLeft: 'auto', direction: 'rtl' }}>
            הקלד פרט חדש · ⌫ מחיקה · Esc ביטול
          </span>
        </div>
      )}

    </div>
  );
};
