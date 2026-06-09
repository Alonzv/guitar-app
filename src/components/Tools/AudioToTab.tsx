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

// ── Waveform — green flowing bars ────────────────────────────────────────────

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
            <stop offset="0%"   stopColor="#69f0ae" />
            <stop offset="50%"  stopColor="#00e676" />
            <stop offset="100%" stopColor="#00c853" />
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

// ── Instrument SVG icons ──────────────────────────────────────────────────────

// Acoustic Guitar — dreadnought figure-8 body, 6 pegs (3+3), round soundhole
function IcoAcoustic({ c, bg }: { c: string; bg: string }) {
  return (
    <svg viewBox="0 0 44 78" width={40} height={70} fill="none">
      {/* Headstock */}
      <path d="M15,2 L29,2 Q31,4 31,6 L31,12 Q31,14 29,14 L15,14 Q13,14 13,12 L13,6 Q13,4 15,2Z" fill={c}/>
      {/* 3 pegs — left */}
      <circle cx="10" cy="5"   r="2.5" fill={c}/><circle cx="10" cy="5"   r="1" fill={bg} opacity={0.65}/>
      <circle cx="10" cy="9"   r="2.5" fill={c}/><circle cx="10" cy="9"   r="1" fill={bg} opacity={0.65}/>
      <circle cx="10" cy="13"  r="2.5" fill={c}/><circle cx="10" cy="13"  r="1" fill={bg} opacity={0.65}/>
      {/* 3 pegs — right */}
      <circle cx="34" cy="5"   r="2.5" fill={c}/><circle cx="34" cy="5"   r="1" fill={bg} opacity={0.65}/>
      <circle cx="34" cy="9"   r="2.5" fill={c}/><circle cx="34" cy="9"   r="1" fill={bg} opacity={0.65}/>
      <circle cx="34" cy="13"  r="2.5" fill={c}/><circle cx="34" cy="13"  r="1" fill={bg} opacity={0.65}/>
      {/* Nut */}
      <rect x="15" y="14" width="14" height="2.5" rx="0.5" fill={c} opacity={0.6}/>
      {/* Neck */}
      <rect x="18.5" y="16.5" width="7" height="28" rx="1.5" fill={c}/>
      {/* Upper bout — smaller */}
      <ellipse cx="22" cy="53" rx="10" ry="9" fill={c}/>
      {/* Lower bout — larger, overlaps upper to create hourglass */}
      <ellipse cx="22" cy="68" rx="13" ry="10" fill={c}/>
      {/* Soundhole */}
      <circle cx="22" cy="68" r="5" fill={bg}/>
      <circle cx="22" cy="68" r="3.5" fill={c} opacity={0.2}/>
    </svg>
  );
}

// Electric Guitar — SG double-horn body, 6 pegs (3+3), 2 pickups, no soundhole
function IcoElectric({ c, bg }: { c: string; bg: string }) {
  return (
    <svg viewBox="0 0 50 74" width={44} height={68} fill="none">
      {/* Headstock */}
      <path d="M16,2 L34,2 Q36,4 36,6 L36,13 Q36,15 34,15 L16,15 Q14,15 14,13 L14,6 Q14,4 16,2Z" fill={c}/>
      {/* 3 pegs — left */}
      <circle cx="11" cy="5"   r="2.5" fill={c}/><circle cx="11" cy="5"   r="1" fill={bg} opacity={0.65}/>
      <circle cx="11" cy="9.5" r="2.5" fill={c}/><circle cx="11" cy="9.5" r="1" fill={bg} opacity={0.65}/>
      <circle cx="11" cy="14"  r="2.5" fill={c}/><circle cx="11" cy="14"  r="1" fill={bg} opacity={0.65}/>
      {/* 3 pegs — right */}
      <circle cx="39" cy="5"   r="2.5" fill={c}/><circle cx="39" cy="5"   r="1" fill={bg} opacity={0.65}/>
      <circle cx="39" cy="9.5" r="2.5" fill={c}/><circle cx="39" cy="9.5" r="1" fill={bg} opacity={0.65}/>
      <circle cx="39" cy="14"  r="2.5" fill={c}/><circle cx="39" cy="14"  r="1" fill={bg} opacity={0.65}/>
      {/* Nut */}
      <rect x="16" y="15" width="18" height="2.5" rx="0.5" fill={c} opacity={0.6}/>
      {/* Neck */}
      <rect x="20" y="17.5" width="10" height="22" rx="1.5" fill={c}/>
      {/* Left horn — points up-left from neck junction */}
      <path d="M20,40 C16,38 8,32 7,27 C6,23 10,21 13,25 C15,28 17,36 20,40Z" fill={c}/>
      {/* Right horn — mirror */}
      <path d="M30,40 C34,38 42,32 43,27 C44,23 40,21 37,25 C35,28 33,36 30,40Z" fill={c}/>
      {/* Neck-to-body bridge */}
      <rect x="20" y="38" width="10" height="6" fill={c}/>
      {/* Lower body */}
      <path d="M14,42 C6,44 3,52 3,59 C3,67 10,72 25,72 C40,72 47,67 47,59 C47,52 44,44 36,42Z" fill={c}/>
      {/* Pickup 1 */}
      <rect x="14" y="50" width="22" height="5.5" rx="2" fill={bg} opacity={0.65}/>
      {/* Pickup 2 */}
      <rect x="14" y="60" width="22" height="5.5" rx="2" fill={bg} opacity={0.65}/>
    </svg>
  );
}

// Bass Guitar — neck takes >50% of height (key differentiator), compact body, 4 pegs (2+2)
function IcoBass({ c, bg }: { c: string; bg: string }) {
  return (
    <svg viewBox="0 0 40 84" width={36} height={74} fill="none">
      {/* Headstock — compact 2+2 */}
      <path d="M13,2 L27,2 Q29,4 29,6 L29,12 Q29,14 27,14 L13,14 Q11,14 11,12 L11,6 Q11,4 13,2Z" fill={c}/>
      {/* 2 pegs — left */}
      <circle cx="8"  cy="6"  r="2.6" fill={c}/><circle cx="8"  cy="6"  r="1.1" fill={bg} opacity={0.65}/>
      <circle cx="8"  cy="11" r="2.6" fill={c}/><circle cx="8"  cy="11" r="1.1" fill={bg} opacity={0.65}/>
      {/* 2 pegs — right */}
      <circle cx="32" cy="6"  r="2.6" fill={c}/><circle cx="32" cy="6"  r="1.1" fill={bg} opacity={0.65}/>
      <circle cx="32" cy="11" r="2.6" fill={c}/><circle cx="32" cy="11" r="1.1" fill={bg} opacity={0.65}/>
      {/* Nut */}
      <rect x="13" y="14" width="14" height="2.5" rx="0.5" fill={c} opacity={0.6}/>
      {/* Long neck — 44px, takes ~52% of 84px viewBox */}
      <rect x="17" y="16.5" width="6" height="44" rx="1.5" fill={c}/>
      {/* Upper bout */}
      <ellipse cx="20" cy="68" rx="11" ry="8" fill={c}/>
      {/* Lower bout */}
      <ellipse cx="20" cy="78" rx="13" ry="8" fill={c}/>
      {/* Pickup — long single-coil style */}
      <rect x="10" y="69" width="20" height="6" rx="2" fill={bg} opacity={0.65}/>
    </svg>
  );
}

// Ukulele — compact/short, clearly smaller instrument, 4 pegs (2+2), round soundhole
function IcoUkulele({ c, bg }: { c: string; bg: string }) {
  return (
    <svg viewBox="0 0 36 58" width={32} height={52} fill="none">
      {/* Headstock — small */}
      <path d="M12,2 L24,2 Q26,4 26,6 L26,10 Q26,12 24,12 L12,12 Q10,12 10,10 L10,6 Q10,4 12,2Z" fill={c}/>
      {/* 2 pegs — left */}
      <circle cx="7"  cy="5.5" r="2.2" fill={c}/><circle cx="7"  cy="5.5" r="0.9" fill={bg} opacity={0.65}/>
      <circle cx="7"  cy="10"  r="2.2" fill={c}/><circle cx="7"  cy="10"  r="0.9" fill={bg} opacity={0.65}/>
      {/* 2 pegs — right */}
      <circle cx="29" cy="5.5" r="2.2" fill={c}/><circle cx="29" cy="5.5" r="0.9" fill={bg} opacity={0.65}/>
      <circle cx="29" cy="10"  r="2.2" fill={c}/><circle cx="29" cy="10"  r="0.9" fill={bg} opacity={0.65}/>
      {/* Nut */}
      <rect x="12" y="12" width="12" height="2" rx="0.5" fill={c} opacity={0.6}/>
      {/* Short neck */}
      <rect x="14.5" y="14" width="7" height="16" rx="1.2" fill={c}/>
      {/* Upper bout — small */}
      <ellipse cx="18" cy="37" rx="9" ry="8" fill={c}/>
      {/* Lower bout — larger, hourglass waist with upper */}
      <ellipse cx="18" cy="50" rx="11" ry="9" fill={c}/>
      {/* Soundhole */}
      <circle cx="18" cy="50" r="4.5" fill={bg}/>
      <circle cx="18" cy="50" r="3"   fill={c} opacity={0.2}/>
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
    <div className="at-root" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <style>{RESPONSIVE_CSS}</style>

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
        <div className="at-instrument-grid">
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
        <div className="at-mix-row">
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

// ── Responsive styles ─────────────────────────────────────────────────────────

const RESPONSIVE_CSS = `
  .at-root { max-width: 640px; margin: 0 auto; }
  .at-instrument-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .at-mix-row { display: flex; gap: 10px; }
  .at-player-row { display: flex; gap: 10px; }
  @media (min-width: 600px) {
    .at-instrument-grid { grid-template-columns: repeat(4, 1fr); }
  }
  @media (max-width: 400px) {
    .at-mix-row { flex-direction: column; }
  }
`;

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
    if (isPlayOrig) {
      audioRef.current?.pause();
      setIsPlayOrig(false);
      return;
    }
    stopSynth(); setIsPlaySynth(false);
    // Always create a fresh element so browser doesn't reuse a stale one
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ''; }
    const el = new Audio();
    audioRef.current = el;
    el.src = originalUrl;
    el.onended = () => setIsPlayOrig(false);
    el.onerror = () => setIsPlayOrig(false);
    el.load();
    el.play()
      .then(() => setIsPlayOrig(true))
      .catch(err => { console.warn('[AudioToTab] original play failed:', err); setIsPlayOrig(false); });
  }, [originalUrl, isPlayOrig]);

  const toggleSynth = useCallback(async () => {
    if (notes.length === 0) return;
    if (isPlaySynth) { stopSynth(); setIsPlaySynth(false); return; }
    audioRef.current?.pause(); setIsPlayOrig(false);
    const ctx = getSharedContext();
    try {
      if (ctx.state !== 'running') await ctx.resume();
    } catch { /* ignore — still try to play */ }
    playSynth(notes, ctx);
    setIsPlaySynth(true);
    const dur = audioBufRef.current?.duration ?? 10;
    setTimeout(() => setIsPlaySynth(false), (dur + 1.5) * 1000);
  }, [notes, isPlaySynth]);

  const strName = (s: number) => ['E','A','D','G','B','e'][s] ?? '?';

  // ────────────────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────────────────

  // ── Idle ──────────────────────────────────────────────────────────────────

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
    <div className="at-root" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
    <div className="at-root" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={card({ padding: '22px 18px' })}>
        {waveform && waveform.length > 0 && (
          <div style={{ marginBottom: 16, borderRadius: 10, overflow: 'hidden', background: 'transparent', padding: '4px 0' }}>
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
    <div className="at-root" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
    <div className="at-root" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <style>{RESPONSIVE_CSS}</style>

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
        <div style={{ borderRadius: 12, overflow: 'hidden', background: 'transparent', padding: '4px 0' }}>
          <Waveform data={waveform} height={72} />
        </div>
      )}

      {/* Comparison player */}
      <div style={card({ padding: '14px 16px' })}>
        <p style={LABEL}>נגן השוואה</p>
        <div className="at-player-row">
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
