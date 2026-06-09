import React, { useState, useRef, useCallback, useEffect } from 'react';
import { T, card } from '../../theme';
import {
  transcribeAudioBuffer, refineNotesWithAI, notesToTab, buildWaveform,
  exportTabToPDF, playSynth, stopSynth, findPositions,
  type TabData, type TabEvent, type DetectedNote, type TranscribeConfig,
  type InstrumentType, type MixType,
  STRING_NAMES,
} from '../../utils/audioToTab';
import { getSharedContext, unlockAudio } from '../../utils/audioPlayback';
import { MiniFretboard } from '../Fretboard/MiniFretboard';
import type { FretPosition } from '../../types/music';

type Stage = 'idle' | 'recording' | 'onboarding' | 'processing' | 'result' | 'error';

// ── Tab visual constants (parchment / sheet-music look) ───────────────────────

const TAB_BG   = '#f7f4ed';
const TAB_LINE = '#9a8c78';
const TAB_BAR  = '#6e6252';
const TAB_NUM  = '#1a1512';
const TAB_LBL  = '#7a6e5c';
const TAB_SEL  = '#c96219';

// SVG layout — viewBox units, width="100%" scales to container
const COL_W        = 16;
const STR_GAP      = 16;
const LEFT_PAD     = 28;
const COLS_PER_ROW = 20;
const VB_W = LEFT_PAD + COLS_PER_ROW * COL_W + 4;   // 352 viewBox units

// ── Clear button (used in multiple stages) ────────────────────────────────────

function ClearBtn({ onClear }: { onClear: () => void }) {
  return (
    <button
      onClick={onClear}
      title="איפוס — חזור לתחילה"
      style={{
        padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 700,
        fontSize: 12, border: `1px solid ${T.border}`,
        background: T.bgInput, color: T.textMuted, flexShrink: 0,
      }}
    >
      Clear
    </button>
  );
}

// ── Tab SVG row renderer ──────────────────────────────────────────────────────

function TabSVGRow({ colStart, colEnd, colMap, selectedCol, onTap }: {
  colStart: number;
  colEnd: number;
  colMap: Map<number, Map<number, number>>;
  selectedCol: number | null;
  onTap: (col: number, stringIdx: number, e: React.MouseEvent) => void;
}) {
  const lineW = COLS_PER_ROW * COL_W;
  const TOP   = 10;  // extra headroom so top-string number boxes aren't clipped
  const svgH  = TOP + 5 * STR_GAP + 6;
  const els: React.ReactNode[] = [];

  // Parchment background
  els.push(<rect key="bg" x={0} y={0} width={VB_W} height={svgH} fill={TAB_BG} />);

  // String lines + labels
  for (let di = 0; di < 6; di++) {
    const sy = TOP + di * STR_GAP;
    els.push(
      <line key={`l${di}`} x1={LEFT_PAD - 2} y1={sy} x2={LEFT_PAD + lineW} y2={sy}
        stroke={TAB_LINE} strokeWidth={0.8} />,
      <text key={`n${di}`} x={LEFT_PAD - 5} y={sy + 4.5}
        fontSize={9} fill={TAB_LBL} textAnchor="end"
        fontFamily="monospace, 'Courier New', monospace" fontWeight="700">
        {STRING_NAMES[di]}
      </text>,
    );
  }

  // Opening + closing verticals, bar lines every 4 cols
  els.push(
    <line key="open"  x1={LEFT_PAD - 2}    y1={TOP} x2={LEFT_PAD - 2}    y2={TOP + 5 * STR_GAP} stroke={TAB_BAR} strokeWidth={1.4} />,
    <line key="close" x1={LEFT_PAD + lineW} y1={TOP} x2={LEFT_PAD + lineW} y2={TOP + 5 * STR_GAP} stroke={TAB_BAR} strokeWidth={1.4} />,
  );
  for (let c = 4; c < COLS_PER_ROW; c += 4) {
    const bx = LEFT_PAD + c * COL_W;
    els.push(
      <line key={`b${c}`} x1={bx} y1={TOP} x2={bx} y2={TOP + 5 * STR_GAP}
        stroke={TAB_BAR} strokeWidth={0.7} opacity={0.5} />,
    );
  }

  // Fret numbers
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
          <rect x={cx - (wide ? 7 : 4.5)} y={sy - 6} width={wide ? 14 : 9} height={12}
            fill={sel ? TAB_SEL : TAB_BG} rx={1.5} />
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

// ── Tab display (staff rows) ──────────────────────────────────────────────────

function TabDisplay({ tabData, onSelectNote }: {
  tabData: TabData;
  onSelectNote: (ev: TabEvent | null) => void;
}) {
  const [selectedCol, setSelectedCol] = useState<number | null>(null);
  const { events, totalColumns } = tabData;

  if (totalColumns === 0) {
    return (
      <div style={{ background: TAB_BG, borderRadius: 8, padding: '20px', textAlign: 'center' }}>
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
      background: TAB_BG, borderRadius: 8, padding: '10px 8px',
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

// ── Waveform — flowing gradient ribbon ───────────────────────────────────────

function buildSmoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const cpx = ((pts[i - 1].x + pts[i].x) / 2).toFixed(1);
    d += ` C ${cpx} ${pts[i-1].y.toFixed(1)} ${cpx} ${pts[i].y.toFixed(1)} ${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)}`;
  }
  return d;
}

function Waveform({ data, height = 72 }: { data: Float32Array; height?: number }) {
  if (data.length === 0) return null;

  const W   = 400;
  const mid = height / 2;
  const N   = Math.min(90, data.length);
  const step = data.length / N;

  const sampled = Array.from({ length: N }, (_, i) => data[Math.floor(i * step)]);

  const upperPts = sampled.map((v, i) => ({ x: (i / (N - 1)) * W, y: mid - v * mid * 0.82 }));
  const lowerPts = sampled.map((v, i) => ({ x: ((N - 1 - i) / (N - 1)) * W, y: mid + v * mid * 0.82 }));

  const fillPath  = buildSmoothPath(upperPts) + ' ' + buildSmoothPath(lowerPts) + ' Z';
  const topStroke = buildSmoothPath(upperPts);
  // Offset second ribbon for depth
  const upperPts2 = sampled.map((v, i) => ({ x: (i / (N - 1)) * W, y: mid - v * mid * 0.52 - 2 }));
  const lowerPts2 = sampled.map((v, i) => ({ x: ((N - 1 - i) / (N - 1)) * W, y: mid + v * mid * 0.38 + 1 }));
  const fillPath2 = buildSmoothPath(upperPts2) + ' ' + buildSmoothPath(lowerPts2) + ' Z';

  return (
    <>
      <style>{`
        @keyframes wv-breathe {
          0%,100% { transform:scaleY(1);   opacity:.82; }
          50%      { transform:scaleY(1.07); opacity:1;  }
        }
        @keyframes wv-ribbon {
          0%,100% { transform:scaleY(.88) translateY(2px); opacity:.55; }
          50%      { transform:scaleY(.96) translateY(-1px); opacity:.72; }
        }
        @keyframes wv-glow {
          0%,100% { opacity:.22; }
          50%      { opacity:.42; }
        }
        .wv-fill   { animation: wv-breathe 3.6s ease-in-out infinite; transform-origin:50% 50%; }
        .wv-ribbon { animation: wv-ribbon  4.1s ease-in-out infinite; transform-origin:50% 50%; }
        .wv-glow   { animation: wv-glow    3.6s ease-in-out infinite; transform-origin:50% 50%; }
      `}</style>
      <svg width="100%" viewBox={`0 0 ${W} ${height}`}
        preserveAspectRatio="none" style={{ display: 'block' }}>
        <defs>
          <linearGradient id="wv-grad-main" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="#ff6b35" />
            <stop offset="28%"  stopColor="#e040fb" />
            <stop offset="58%"  stopColor="#3d5afe" />
            <stop offset="100%" stopColor="#00e5ff" />
          </linearGradient>
          <linearGradient id="wv-grad-ribbon" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="#ff4081" stopOpacity="0.7" />
            <stop offset="50%"  stopColor="#7c4dff" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#18ffff" stopOpacity="0.5" />
          </linearGradient>
          <filter id="wv-blur">
            <feGaussianBlur stdDeviation="5" />
          </filter>
        </defs>

        {/* Glow halo */}
        <path className="wv-glow" d={fillPath}
          fill="url(#wv-grad-main)" filter="url(#wv-blur)" />

        {/* Main fill */}
        <path className="wv-fill" d={fillPath}
          fill="url(#wv-grad-main)" opacity={0.78} />

        {/* Second ribbon for depth */}
        <path className="wv-ribbon" d={fillPath2}
          fill="url(#wv-grad-ribbon)" />

        {/* Highlight edge */}
        <path d={topStroke}
          fill="none" stroke="url(#wv-grad-main)"
          strokeWidth={1.4} opacity={0.9} />
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

// ── Instrument SVG icons ──────────────────────────────────────────────────────

function IcoAcoustic({ c, bg }: { c: string; bg: string }) {
  return (
    <svg viewBox="0 0 40 64" width={38} height={58} fill={c}>
      <rect x="14" y="1" width="12" height="6" rx="3" />
      <circle cx="10" cy="2.5" r="2.2" /><circle cx="10" cy="5.5" r="2.2" />
      <circle cx="30" cy="2.5" r="2.2" /><circle cx="30" cy="5.5" r="2.2" />
      <rect x="16" y="7" width="8" height="2" rx="0.5" opacity={0.55} />
      <rect x="16.5" y="9" width="7" height="16" rx="1" />
      <path d="M16,25 C5,25 3,30 3,35 C3,41 7,44 12,45 C8,46 5,49 5,54 C5,61 11,64 20,64 C29,64 35,61 35,54 C35,49 32,46 28,45 C33,44 37,41 37,35 C37,30 35,25 24,25 Z" />
      <circle cx="20" cy="53" r="5.5" fill={bg} />
    </svg>
  );
}

function IcoElectric({ c, bg }: { c: string; bg: string }) {
  return (
    <svg viewBox="0 0 40 64" width={38} height={58} fill={c}>
      <rect x="15" y="1" width="10" height="6" rx="3" />
      <circle cx="11" cy="2.5" r="2.2" /><circle cx="11" cy="5.5" r="2.2" />
      <circle cx="29" cy="2.5" r="2.2" /><circle cx="29" cy="5.5" r="2.2" />
      <rect x="16.5" y="7" width="7" height="18" rx="1" />
      {/* Offset body — upper horn left, cutaway right */}
      <path d="M16,25 C6,25 2,27 2,32 C2,35 5,37 9,38 C6,39 4,41 4,46 C4,55 10,62 20,62 C30,62 36,55 36,46 C36,41 34,38 30,37 C34,35 37,33 37,29 C37,25 34,25 24,25 Z" />
      <rect x="13" y="47" width="14" height="3.5" rx="1.5" fill={bg} opacity={0.55} />
      <rect x="13" y="53" width="14" height="3.5" rx="1.5" fill={bg} opacity={0.55} />
    </svg>
  );
}

function IcoBass({ c, bg }: { c: string; bg: string }) {
  return (
    <svg viewBox="0 0 40 70" width={36} height={58} fill={c}>
      <rect x="15" y="1" width="10" height="6" rx="3" />
      <circle cx="11" cy="2.5" r="2.2" /><circle cx="11" cy="5.5" r="2.2" />
      <circle cx="29" cy="2.5" r="2.2" /><circle cx="29" cy="5.5" r="2.2" />
      <rect x="16.5" y="7" width="7" height="24" rx="1" />
      {/* Narrower body — P-bass silhouette */}
      <path d="M16,31 C6,31 3,34 2,39 C1,44 4,47 8,49 C5,50 3,52 3,57 C3,65 10,70 20,70 C30,70 37,65 37,57 C37,52 35,50 32,49 C36,47 39,44 38,39 C37,34 34,31 24,31 Z" />
      <rect x="14" y="57" width="12" height="4" rx="1.5" fill={bg} opacity={0.55} />
    </svg>
  );
}

function IcoUkulele({ c, bg }: { c: string; bg: string }) {
  return (
    <svg viewBox="0 0 36 54" width={32} height={52} fill={c}>
      <rect x="13" y="1" width="10" height="5" rx="2.5" />
      <circle cx="9" cy="2.5" r="1.9" /><circle cx="9" cy="5" r="1.9" />
      <circle cx="27" cy="2.5" r="1.9" /><circle cx="27" cy="5" r="1.9" />
      <rect x="15" y="6" width="6" height="12" rx="1" />
      {/* Smaller rounder body */}
      <path d="M15,18 C7,18 5,22 5,26 C5,30 8,32 11,33 C8,34 6,36 6,40 C6,47 10,52 18,52 C26,52 30,47 30,40 C30,36 28,34 25,33 C28,32 31,30 31,26 C31,22 29,18 21,18 Z" />
      <circle cx="18" cy="39" r="4.5" fill={bg} />
    </svg>
  );
}

// ── Onboarding screen ─────────────────────────────────────────────────────────

const INSTRUMENTS: { id: InstrumentType; label: string; Icon: React.FC<{ c: string; bg: string }> }[] = [
  { id: 'acoustic', label: 'Acoustic Guitar', Icon: IcoAcoustic },
  { id: 'electric', label: 'Electric Guitar', Icon: IcoElectric },
  { id: 'bass',     label: 'Bass Guitar',     Icon: IcoBass     },
  { id: 'ukulele',  label: 'Ukulele',         Icon: IcoUkulele  },
];

function OnboardingScreen({
  fileName,
  onStart,
  onClear,
}: {
  fileName: string;
  onStart: (cfg: TranscribeConfig) => void;
  onClear: () => void;
}) {
  const [instrument, setInstrument] = useState<InstrumentType>('acoustic');
  const [mixType,    setMixType]    = useState<MixType>('solo');

  const stepHdr: React.CSSProperties = {
    fontSize: 11, fontWeight: 800, letterSpacing: '0.12em',
    textTransform: 'uppercase', color: T.textMuted, margin: '0 0 12px',
  };
  const stepNum: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: T.primary, marginRight: 6,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* File name */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ margin: 0, fontSize: 12, color: T.textMuted,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>
          {fileName}
        </p>
        <ClearBtn onClear={onClear} />
      </div>

      {/* Step 1 — Instrument */}
      <div style={card({ padding: '16px 14px' })}>
        <p style={stepHdr}><span style={stepNum}>01</span>WHICH INSTRUMENT?</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {INSTRUMENTS.map(({ id, label, Icon }) => {
            const active = instrument === id;
            return (
              <button key={id} onClick={() => setInstrument(id)} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 8, padding: '14px 8px 10px', borderRadius: 12, cursor: 'pointer',
                border: `2px solid ${active ? T.primary : T.border}`,
                background: active ? T.primaryBg : T.bgInput,
                transition: 'border-color 0.15s, background 0.15s',
              }}>
                <Icon
                  c={active ? T.primary : T.textMuted}
                  bg={active ? T.primaryBg : T.bgInput}
                />
                <span style={{ fontSize: 11, fontWeight: 700,
                  color: active ? T.primary : T.text, textAlign: 'center', lineHeight: 1.2 }}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Step 2 — Transcription mode */}
      <div style={card({ padding: '16px 14px' })}>
        <p style={stepHdr}><span style={stepNum}>02</span>HOW SHOULD WE TRANSCRIBE IT?</p>
        <div style={{ display: 'flex', gap: 10 }}>
          {([
            {
              id: 'solo' as MixType,
              title: 'Direct',
              desc: 'The instrument is clearly audible. We\'ll isolate and transcribe exactly what it plays.',
              tip: 'Best for recordings where the instrument is the main focus.',
            },
            {
              id: 'full_mix' as MixType,
              title: 'Full Mix',
              desc: 'A full song or band recording. We\'ll detect the instrument\'s part in the mix.',
              tip: 'Use when other instruments or vocals are present.',
            },
          ] as const).map(opt => {
            const active = mixType === opt.id;
            return (
              <button key={opt.id} onClick={() => setMixType(opt.id)} style={{
                flex: 1, textAlign: 'left', padding: '12px 12px 10px', borderRadius: 12,
                cursor: 'pointer', border: `2px solid ${active ? T.primary : T.border}`,
                background: active ? T.primaryBg : T.bgInput,
                transition: 'border-color 0.15s, background 0.15s',
                display: 'flex', flexDirection: 'column', gap: 6,
              }}>
                <span style={{ fontSize: 13, fontWeight: 800,
                  color: active ? T.primary : T.text }}>{opt.title}</span>
                <span style={{ fontSize: 11, color: T.textMuted, lineHeight: 1.4 }}>{opt.desc}</span>
                <div style={{
                  marginTop: 4, padding: '6px 8px', borderRadius: 8,
                  background: active ? 'rgba(var(--gc-primary-rgb, 99,102,241),.10)' : T.bgCard,
                  border: `1px solid ${active ? T.primary : T.border}`,
                }}>
                  <span style={{ fontSize: 10, color: active ? T.primary : T.textMuted, lineHeight: 1.3 }}>
                    {opt.tip}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Start button */}
      <button onClick={() => onStart({ instrument, mixType })} style={{
        padding: '14px 0', borderRadius: 12, border: 'none', cursor: 'pointer',
        background: T.primary, color: '#fff', fontWeight: 800, fontSize: 15,
      }}>
        Start Analysis
      </button>
    </div>
  );
}

// ── Label style ───────────────────────────────────────────────────────────────

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
  const [isPlayOrig, setIsPlayOrig]   = useState(false);
  const [isPlaySynth, setIsPlaySynth] = useState(false);
  const [selNote, setSelNote]         = useState<TabEvent | null>(null);

  const pendingBlobRef = useRef<{ blob: Blob; name: string } | null>(null);

  const mediaRecRef  = useRef<MediaRecorder | null>(null);
  const chunksRef    = useRef<Blob[]>([]);
  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef     = useRef<HTMLAudioElement | null>(null);
  const audioBufRef  = useRef<AudioBuffer | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    stopSynth();
    if (timerRef.current) clearInterval(timerRef.current);
    audioRef.current?.pause();
    if (originalUrl) URL.revokeObjectURL(originalUrl);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Reset to idle ─────────────────────────────────────────────────────────

  const reset = useCallback(() => {
    stopSynth();
    audioRef.current?.pause();
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    setStage('idle');
    setTabData(null);
    setWaveform(null);
    setNotes([]);
    setOriginalUrl(null);
    setSelNote(null);
    setIsPlayOrig(false);
    setIsPlaySynth(false);
    setError('');
    setProgress(0);
    setPhaseLabel('');
    audioBufRef.current  = null;
    pendingBlobRef.current = null;
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [originalUrl]);

  // ── Process Blob → tab ────────────────────────────────────────────────────

  const processBlob = useCallback(async (blob: Blob, name: string, cfg: TranscribeConfig) => {
    setStage('processing');
    setProgress(0);
    setFileName(name);
    setSelNote(null);

    const url = URL.createObjectURL(blob);
    setOriginalUrl(prev => { if (prev) URL.revokeObjectURL(prev); return url; });

    try {
      unlockAudio();
      const ctx      = getSharedContext();
      const arrBuf   = await blob.arrayBuffer();
      const audioBuf = await ctx.decodeAudioData(arrBuf);
      audioBufRef.current = audioBuf;

      setWaveform(buildWaveform(audioBuf, 100));

      setPhaseLabel('מזהה תדרים…');
      const rawNotes = await transcribeAudioBuffer(audioBuf, p => setProgress(p), cfg);

      setPhaseLabel('מנקה עם AI…');
      setProgress(78);
      const refined = await refineNotesWithAI(rawNotes, p => setProgress(75 + Math.round(p * 0.2)));

      setPhaseLabel('בונה טאב…');
      setProgress(97);
      setNotes(refined);
      const tab = notesToTab(refined, 200, name.replace(/\.[^.]+$/, ''), audioBuf.duration);
      setTabData(tab);
      setProgress(100);
      setStage('result');
    } catch (e) {
      console.error('[AudioToTab]', e);
      setError('שגיאה בעיבוד השמע — ודא שהקובץ תקין ונסה שוב.');
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
    pendingBlobRef.current = { blob: file, name: file.name };
    setFileName(file.name);
    setStage('onboarding');
  }, []);

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
        pendingBlobRef.current = { blob, name: 'recording.webm' };
        setFileName('recording.webm');
        setStage('onboarding');
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

  // ── Playback ──────────────────────────────────────────────────────────────

  const toggleOriginal = useCallback(() => {
    if (!originalUrl) return;
    unlockAudio();
    if (isPlayOrig) { audioRef.current?.pause(); setIsPlayOrig(false); return; }
    stopSynth(); setIsPlaySynth(false);
    if (!audioRef.current) audioRef.current = new Audio();
    audioRef.current.src = originalUrl;
    audioRef.current.onended = () => setIsPlayOrig(false);
    audioRef.current.play().catch(() => setIsPlayOrig(false));
    setIsPlayOrig(true);
  }, [originalUrl, isPlayOrig]);

  const toggleSynth = useCallback(() => {
    if (!audioBufRef.current || notes.length === 0) return;
    unlockAudio();
    if (isPlaySynth) { stopSynth(); setIsPlaySynth(false); return; }
    audioRef.current?.pause(); setIsPlayOrig(false);
    const ctx = getSharedContext();
    if (ctx.state === 'suspended') ctx.resume();
    playSynth(notes, ctx);
    setIsPlaySynth(true);
    setTimeout(() => setIsPlaySynth(false), (audioBufRef.current.duration + 1.5) * 1000);
  }, [notes, isPlaySynth]);

  const strName = (s: number) => ['E','A','D','G','B','e'][s] ?? '?';

  // ────────────────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────────────────

  // ── Idle ──────────────────────────────────────────────────────────────────

  if (stage === 'idle') return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
          width: 38, height: 38, borderRadius: '50%', background: T.coral, flexShrink: 0,
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

  // ── Recording ─────────────────────────────────────────────────────────────

  if (stage === 'recording') return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ ...card({ padding: '28px 20px' }), textAlign: 'center' }}>
        <RecordingBars />
        <p style={{ margin: '16px 0 4px', fontSize: 26, fontWeight: 800, color: T.primary, fontVariantNumeric: 'tabular-nums' }}>
          {String(Math.floor(recSecs / 60)).padStart(2, '0')}:{String(recSecs % 60).padStart(2, '0')}
        </p>
        <p style={{ margin: '0 0 20px', fontSize: 12, color: T.textMuted }}>מקליט…</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button onClick={stopRecording} style={{
            padding: '12px 32px', borderRadius: 10, border: 'none', cursor: 'pointer',
            background: T.coral, color: '#fff', fontWeight: 700, fontSize: 14,
          }}>
            עצור ועבד
          </button>
          <ClearBtn onClear={reset} />
        </div>
      </div>
    </div>
  );

  // ── Onboarding ───────────────────────────────────────────────────────────

  if (stage === 'onboarding') return (
    <OnboardingScreen
      fileName={fileName}
      onStart={cfg => {
        const p = pendingBlobRef.current;
        if (p) processBlob(p.blob, p.name, cfg);
      }}
      onClear={reset}
    />
  );

  // ── Processing ────────────────────────────────────────────────────────────

  if (stage === 'processing') return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={card({ padding: '22px 18px' })}>
        {waveform && waveform.length > 0 && (
          <div style={{ marginBottom: 16, borderRadius: 10, overflow: 'hidden', background: '#0d0d14', padding: '6px 4px' }}>
            <Waveform data={waveform} height={64} />
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: T.text }}>
            {phaseLabel || 'מעבד…'}
          </p>
          <span style={{ fontSize: 12, color: T.textMuted, fontVariantNumeric: 'tabular-nums' }}>{progress}%</span>
        </div>
        <div style={{ background: T.bgInput, borderRadius: 10, height: 8, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 10, background: T.primary,
            width: `${progress}%`, transition: 'width 0.3s',
          }} />
        </div>
        <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
          <ClearBtn onClear={reset} />
        </div>
      </div>
    </div>
  );

  // ── Error ─────────────────────────────────────────────────────────────────

  if (stage === 'error') return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ ...card({ padding: '18px 16px' }), borderLeft: `3px solid ${T.coral}` }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <span style={{ fontSize: 18, lineHeight: 1.4 }}>⚠️</span>
          <p style={{ margin: 0, fontSize: 13, color: T.text, direction: 'rtl', textAlign: 'right' }}>{error}</p>
        </div>
      </div>
      <button onClick={reset} style={{
        padding: '12px 0', borderRadius: 10, border: 'none', cursor: 'pointer',
        background: T.primary, color: '#fff', fontWeight: 700, fontSize: 14,
      }}>
        נסה שוב
      </button>
    </div>
  );

  if (!tabData) return null;

  // ── Result ────────────────────────────────────────────────────────────────

  const selPositions: FretPosition[] = selNote ? findPositions(selNote.midiNote) : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Header: file info + Clear */}
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
        <div style={{ borderRadius: 12, overflow: 'hidden', background: '#0d0d14', padding: '6px 4px' }}>
          <Waveform data={waveform} height={72} />
        </div>
      )}

      {/* Comparison player */}
      <div style={card({ padding: '14px 16px' })}>
        <p style={LABEL}>נגן השוואה</p>
        <div style={{ display: 'flex', gap: 10 }}>
          {[
            { label: 'מקורי', active: isPlayOrig,  onToggle: toggleOriginal, bg: T.primary   },
            { label: 'סינטזייזר', active: isPlaySynth, onToggle: toggleSynth,   bg: T.secondary },
          ].map(({ label, active, onToggle, bg }) => (
            <button key={label} onClick={onToggle} style={{
              flex: 1, padding: '10px 6px', borderRadius: 10, fontSize: 13, fontWeight: 700,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              border: active ? 'none' : `1px solid ${T.border}`,
              background: active ? bg : T.bgInput,
              color: active ? '#fff' : T.textMuted,
            }}>
              <span style={{ fontSize: 11 }}>{active ? '⏹' : '▶'}</span>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab display */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingLeft: 2 }}>
          <p style={{ ...LABEL, margin: 0 }}>טאב</p>
          <span style={{ fontSize: 11, color: T.textMuted }}>לחץ על תו לאפשרויות אצבוע</span>
        </div>
        <TabDisplay tabData={tabData} onSelectNote={setSelNote} />
      </div>

      {/* Fingering alternatives */}
      {selNote && selPositions.length > 0 && (
        <div style={card({ padding: '14px 14px' })}>
          <p style={LABEL}>
            אפשרויות אצבוע — מיתר {strName(selNote.string)} · פרט {selNote.fret}
          </p>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
            {selPositions.map((pos, i) => {
              const active = pos.string === selNote.string && pos.fret === selNote.fret;
              return (
                <div key={i} style={{
                  flexShrink: 0, textAlign: 'center', padding: '8px 10px', borderRadius: 10,
                  border: `1.5px solid ${active ? T.primary : T.border}`,
                  background: active ? T.primaryBg : T.bgInput,
                }}>
                  <MiniFretboard voicing={[pos]} dotColor={active ? T.primary : T.secondary} showStringLabels />
                  <p style={{ margin: '5px 0 0', fontSize: 11, color: active ? T.primary : T.textMuted, fontWeight: 700 }}>
                    {strName(pos.string)} · {pos.fret === 0 ? 'פתוח' : `פרט ${pos.fret}`}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* PDF export */}
      <button
        onClick={() => exportTabToPDF(tabData)}
        style={{
          padding: '13px 0', borderRadius: 10, border: 'none', cursor: 'pointer',
          background: T.secondary, color: '#fff', fontWeight: 700, fontSize: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}
      >
        <svg viewBox="0 0 24 24" width={17} height={17} fill="none" stroke="currentColor" strokeWidth={2.2}>
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" strokeLinecap="round" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        ייצא ל-PDF
      </button>

    </div>
  );
};
