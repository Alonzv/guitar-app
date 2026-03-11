import React, { useState, useRef, useMemo } from 'react';
import { Key, Chord, Note } from '@tonaljs/tonal';
import { T, card } from '../../theme';
import type { ChordInProgression, Tuning } from '../../types/music';
import { MiniFretboard } from '../Fretboard/MiniFretboard';
import { findChordVoicings } from '../../utils/chordVoicings';
import { TUNINGS } from '../../utils/musicTheory';

// ── Types ────────────────────────────────────────────────────────────────────

type HarmonicFunc = 'tonic' | 'subdominant' | 'dominant';
type ScaleMode = 'major' | 'minor';
type ChordQuality = 'triads' | 'sevenths';

interface WheelChord {
  name: string;
  roman: string;
  func: HarmonicFunc;
}

interface Props {
  onAddToProgression?: (item: ChordInProgression) => void;
  tuning?: Tuning;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const NOTES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

// Clockwise = resolution direction: I→IV→vii°→iii→vi→ii→V (→back to I)
// This makes ii(pos 5)→V(pos 6)→I(pos 0) always 3 clockwise steps
const FIFTHS_ORDER = [0, 3, 6, 2, 5, 1, 4];

const MAJOR_TRIAD_ROMAN  = ['I',     'ii',    'iii',    'IV',     'V',  'vi',    'vii°' ];
const MAJOR_7TH_ROMAN    = ['Imaj7', 'ii7',   'iii7',   'IVmaj7', 'V7', 'vi7',   'viiø7'];
const MINOR_TRIAD_ROMAN  = ['i',     'ii°',   'III',    'iv',     'v',  'VI',    'VII'  ];
const MINOR_7TH_ROMAN    = ['im7',   'iiø7',  'IIImaj7','iv7',    'v7', 'VImaj7','VII7' ];

const DEGREE_FUNC: HarmonicFunc[] = [
  'tonic', 'subdominant', 'tonic', 'subdominant', 'dominant', 'tonic', 'dominant',
];

const FUNC_COLORS: Record<HarmonicFunc, { fill: string; hover: string; text: string; light: string }> = {
  tonic:       { fill: '#2E4A5A', hover: '#1e3547', text: '#F9ECC3', light: '#d4e4ed' },
  subdominant: { fill: '#3d6b53', hover: '#2d5040', text: '#F9ECC3', light: '#c9e4d6' },
  dominant:    { fill: '#C44900', hover: '#a33d00', text: '#F9ECC3', light: '#faddcc' },
};

const FUNC_LABELS: Record<HarmonicFunc, string> = {
  tonic: 'Tonic — rest & stability',
  subdominant: 'Subdominant — movement & color',
  dominant: 'Dominant — tension & resolution',
};

// ── SVG Geometry ──────────────────────────────────────────────────────────────

const SVG_SIZE = 380;
const CX = SVG_SIZE / 2;
const CY = SVG_SIZE / 2;
const OUTER_R = 173;
const INNER_R = 66;
const MID_R   = (OUTER_R + INNER_R) / 2;
const TOTAL   = 7;
const SLICE_A = (2 * Math.PI) / TOTAL;
const START   = -Math.PI / 2;

function polar(angle: number, r: number) {
  return { x: CX + r * Math.cos(angle), y: CY + r * Math.sin(angle) };
}

function arcPath(i: number): string {
  const gap = 0.018;
  const a1 = START + i * SLICE_A + gap;
  const a2 = START + (i + 1) * SLICE_A - gap;
  const o1 = polar(a1, OUTER_R), o2 = polar(a2, OUTER_R);
  const i1 = polar(a1, INNER_R), i2 = polar(a2, INNER_R);
  return `M${o1.x} ${o1.y} A${OUTER_R} ${OUTER_R} 0 0 1 ${o2.x} ${o2.y} L${i2.x} ${i2.y} A${INNER_R} ${INNER_R} 0 0 0 ${i1.x} ${i1.y}Z`;
}

function midPt(i: number, r: number) {
  return polar(START + (i + 0.5) * SLICE_A, r);
}

// ── Music Logic ───────────────────────────────────────────────────────────────

function buildChords(
  root: string,
  mode: ScaleMode,
  quality: ChordQuality,
  harmonicV: boolean,
  secondaryDom: boolean,
): WheelChord[] {
  let names: string[];
  let romans: string[];

  if (mode === 'major') {
    const k = Key.majorKey(root);
    names  = [...(quality === 'triads' ? k.triads : k.chords)];
    romans = [...(quality === 'triads' ? MAJOR_TRIAD_ROMAN : MAJOR_7TH_ROMAN)];
  } else {
    const nat = Key.minorKey(root).natural;
    const har = Key.minorKey(root).harmonic;
    names  = [...(quality === 'triads' ? nat.triads : nat.chords)];
    romans = [...(quality === 'triads' ? MINOR_TRIAD_ROMAN : MINOR_7TH_ROMAN)];
    if (harmonicV) {
      names[4]  = quality === 'triads' ? har.triads[4] : har.chords[4];
      romans[4] = quality === 'triads' ? 'V' : 'V7';
    }
  }

  // Track which degrees become secondary dominants (to override their color)
  const secDomDegrees = new Set<number>();

  if (secondaryDom) {
    for (let deg = 0; deg < 7; deg++) {
      const data = Chord.get(names[deg]);
      if ((data.quality === 'Minor' || data.quality === 'Diminished') && data.tonic) {
        const secRoot = Note.transpose(data.tonic, '5P');
        // Strip quality suffixes to get clean base roman (e.g. "ii7" → "ii", "vii°" → "vii")
        const baseRoman = romans[deg]
          .replace(/maj7|m7b5|ø7|m7|M7|7/g, '')
          .replace('°', '');
        names[deg]  = secRoot + '7';
        romans[deg] = `V7/${baseRoman}`;
        secDomDegrees.add(deg);
      }
    }
  }

  return FIFTHS_ORDER.map(deg => ({
    name:  names[deg]  ?? '?',
    roman: romans[deg] ?? '?',
    func:  secDomDegrees.has(deg) ? 'dominant' : DEGREE_FUNC[deg],
  }));
}

// ── Shared dropdown style ─────────────────────────────────────────────────────

const SELECT_STYLE: React.CSSProperties = {
  appearance: 'none',
  WebkitAppearance: 'none',
  background: T.bgInput,
  border: `1px solid ${T.border}`,
  borderRadius: 8,
  color: T.text,
  fontFamily: 'inherit',
  fontSize: 13,
  fontWeight: 700,
  padding: '8px 28px 8px 12px',
  cursor: 'pointer',
  outline: 'none',
  flex: 1,
};

// ── Component ─────────────────────────────────────────────────────────────────

// Relative key: major → show relative minor root, minor → show relative major root
function getRelativeKey(root: string, mode: ScaleMode): string {
  if (mode === 'major') {
    const rel = Note.transpose(root, '-3m'); // minor 3rd down = relative minor
    return `rel. ${rel}m`;
  } else {
    const rel = Note.transpose(root, '3m'); // minor 3rd up = relative major
    return `rel. ${rel}`;
  }
}

export const DiatonicWheel: React.FC<Props> = ({ onAddToProgression, tuning }) => {
  const [root,        setRoot]        = useState('C');
  const [mode,        setMode]        = useState<ScaleMode>('major');
  const [quality,     setQuality]     = useState<ChordQuality>('triads');
  const [harmonicV,   setHarmonicV]   = useState(false);
  const [secondaryDom, setSecondaryDom] = useState(false);
  const [hovered,     setHovered]     = useState<number | null>(null);
  const [flash,       setFlash]       = useState<number | null>(null);
  const [addedMsg,    setAddedMsg]    = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const chords = buildChords(root, mode, quality, mode === 'minor' && harmonicV, secondaryDom);

  const handleSliceClick = (i: number) => {
    if (!onAddToProgression) return;
    const ch = chords[i];
    const data = Chord.get(ch.name);
    onAddToProgression({
      id: `chord-wheel-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      chord: { name: ch.name, notes: data.notes, aliases: data.aliases },
      fretPositions: [],
    });
    setFlash(i);
    setAddedMsg(ch.name);
    setTimeout(() => { setFlash(null); setAddedMsg(null); }, 700);
  };

  const exportPNG = () => {
    const svg = svgRef.current;
    if (!svg) return;
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width  = SVG_SIZE * scale;
    canvas.height = SVG_SIZE * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const data = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([data], { type: 'image/svg+xml;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const img  = new Image();
    img.onload = () => {
      ctx.fillStyle = '#F7F0DC';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const link = document.createElement('a');
      link.download = `diatonic-wheel-${root}-${mode}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    };
    img.src = url;
  };

  const hoveredChord = hovered !== null ? chords[hovered] : null;
  const tuningNotes = tuning?.notes ?? TUNINGS[0].notes;
  const voicings = useMemo(() => {
    if (!hoveredChord) return [];
    return findChordVoicings(hoveredChord.name, 1, tuningNotes);
  }, [hoveredChord, tuningNotes]);

  const toggleStyle = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '8px 0', border: 'none', cursor: 'pointer',
    fontWeight: 700, fontSize: 12,
    background: active ? T.secondary : T.bgInput,
    color: active ? T.white : T.textMuted,
    transition: 'background 0.12s',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── Export button — TOP ── */}
      <button
        onClick={exportPNG}
        style={{
          padding: '10px 16px', borderRadius: 10,
          border: `1px solid ${T.border}`,
          background: T.bgCard, color: T.text,
          fontSize: 13, fontWeight: 700, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}
      >
        📷 Save as PNG
      </button>

      {/* ── Controls ── */}
      <div style={card({ padding: '12px 14px', gap: 10, display: 'flex', flexDirection: 'column' })}>

        {/* Row 1: Root dropdown + Mode toggle */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>Root</span>
          <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
            <select
              value={root}
              onChange={e => setRoot(e.target.value)}
              style={SELECT_STYLE}
            >
              {NOTES.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <span style={{ position: 'absolute', right: 10, pointerEvents: 'none', fontSize: 10, color: T.textMuted }}>▾</span>
          </div>

          <div style={{ display: 'flex', borderRadius: 9, overflow: 'hidden', border: `1px solid ${T.border}`, flex: 1 }}>
            {(['major', 'minor'] as ScaleMode[]).map(m => (
              <button key={m} onClick={() => setMode(m)} style={{ ...toggleStyle(mode === m), textTransform: 'capitalize' }}>{m}</button>
            ))}
          </div>
        </div>

        {/* Row 2: Quality toggle */}
        <div style={{ display: 'flex', borderRadius: 9, overflow: 'hidden', border: `1px solid ${T.border}` }}>
          {([['triads', 'Triads'], ['sevenths', '7th Chords']] as [ChordQuality, string][]).map(([q, lbl]) => (
            <button key={q} onClick={() => setQuality(q)} style={toggleStyle(quality === q)}>{lbl}</button>
          ))}
        </div>

        {/* Row 3: Secondary Dominants + Harmonic V */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setSecondaryDom(v => !v)}
            style={{
              flex: 1, padding: '8px 10px', borderRadius: 9,
              border: `1px solid ${secondaryDom ? T.primary : T.border}`,
              background: secondaryDom ? T.primaryBg : T.bgInput,
              color: secondaryDom ? T.primary : T.textMuted,
              fontSize: 11, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            }}
          >
            <span>{secondaryDom ? '✓' : '○'}</span> Secondary Dom
          </button>

          {mode === 'minor' && (
            <button
              onClick={() => setHarmonicV(v => !v)}
              style={{
                flex: 1, padding: '8px 10px', borderRadius: 9,
                border: `1px solid ${harmonicV ? T.secondary : T.border}`,
                background: harmonicV ? T.secondaryBg : T.bgInput,
                color: harmonicV ? T.secondary : T.textMuted,
                fontSize: 11, fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              }}
            >
              <span>{harmonicV ? '✓' : '○'}</span> Harmonic V
            </button>
          )}
        </div>
      </div>

      {/* ── SVG Wheel ── */}
      <div style={{ position: 'relative' }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
          width="100%"
          style={{ display: 'block' }}
        >
          <circle cx={CX} cy={CY} r={OUTER_R + 3} fill="none" stroke={T.border} strokeWidth="1" opacity="0.6" />

          {chords.map((chord, i) => {
            const col      = FUNC_COLORS[chord.func];
            const isHov    = hovered === i;
            const isFlash  = flash === i;
            const fill     = isFlash ? '#629677' : isHov ? col.hover : col.fill;
            const mp       = midPt(i, MID_R);
            // Scale down font for longer chord names to prevent overflow
            const nameFontSize = chord.name.length >= 7 ? 10
              : chord.name.length >= 5 ? 11 : 13;

            return (
              <g
                key={i}
                onClick={() => handleSliceClick(i)}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                style={{ cursor: onAddToProgression ? 'pointer' : 'default' }}
              >
                <path d={arcPath(i)} fill={fill} style={{ transition: 'fill 0.15s' }} />
                {/* Both texts share the same x (same midPt radius) — only y differs */}
                <text
                  x={mp.x} y={mp.y - 11}
                  textAnchor="middle" dominantBaseline="middle"
                  fill={col.text} fontSize={nameFontSize} fontWeight="700"
                  fontFamily="system-ui, -apple-system, Arial, sans-serif"
                >{chord.name}</text>
                <text
                  x={mp.x} y={mp.y + 11}
                  textAnchor="middle" dominantBaseline="middle"
                  fill={col.text} fontSize={9} opacity={0.75}
                  fontFamily="system-ui, -apple-system, Arial, sans-serif"
                >{chord.roman}</text>
              </g>
            );
          })}

          <circle cx={CX} cy={CY} r={INNER_R - 2} fill={T.bgCard} stroke={T.border} strokeWidth="1.5" />
          <text x={CX} y={CY - 16} textAnchor="middle" dominantBaseline="middle"
            fill={T.text} fontSize={20} fontWeight="800"
            fontFamily="system-ui, -apple-system, Arial, sans-serif"
          >{root}</text>
          <text x={CX} y={CY + 2} textAnchor="middle" dominantBaseline="middle"
            fill={T.textMuted} fontSize={11}
            fontFamily="system-ui, -apple-system, Arial, sans-serif"
          >{mode === 'major' ? 'Major' : 'Minor'}</text>
          <text x={CX} y={CY + 18} textAnchor="middle" dominantBaseline="middle"
            fill={T.textDim} fontSize={9}
            fontFamily="system-ui, -apple-system, Arial, sans-serif"
          >{getRelativeKey(root, mode)}</text>
        </svg>

        {addedMsg && (
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            background: T.secondary, color: T.white,
            borderRadius: 10, padding: '6px 16px',
            fontSize: 13, fontWeight: 700, pointerEvents: 'none',
          }}>
            + {addedMsg}
          </div>
        )}
      </div>

      {/* ── Hovered chord info + fingering ── */}
      <div style={card({ padding: '10px 14px' })}>
        {hoveredChord ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: voicings.length > 0 ? 10 : 0 }}>
              <div style={{ width: 12, height: 12, borderRadius: 3, flexShrink: 0, background: FUNC_COLORS[hoveredChord.func].fill }} />
              <span style={{ fontWeight: 700, color: T.text, fontSize: 13 }}>{hoveredChord.name}</span>
              <span style={{ color: T.textMuted, fontSize: 12 }}>{FUNC_LABELS[hoveredChord.func]}</span>
            </div>
            {voicings.length > 0
              ? <MiniFretboard voicing={voicings[0]} tuning={tuningNotes} dotColor={FUNC_COLORS[hoveredChord.func].fill} />
              : <span style={{ color: T.textDim, fontSize: 11 }}>No standard voicing found</span>
            }
          </>
        ) : (
          <span style={{ color: T.textDim, fontSize: 12 }}>Hover over a chord to see fingering</span>
        )}
      </div>

      {/* ── Legend ── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {(['tonic', 'subdominant', 'dominant'] as HarmonicFunc[]).map(f => (
          <div key={f} style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: FUNC_COLORS[f].light, borderRadius: 7,
            padding: '4px 10px', border: `1px solid ${FUNC_COLORS[f].fill}22`,
          }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: FUNC_COLORS[f].fill }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: FUNC_COLORS[f].fill, textTransform: 'capitalize' }}>{f}</span>
          </div>
        ))}
      </div>

      {/* ── Theory tip ── */}
      <div style={card({ padding: '10px 14px' })}>
        <p style={{ margin: 0, fontSize: 12, color: T.textMuted, lineHeight: 1.6 }}>
          <span style={{ color: T.text, fontWeight: 700 }}>How to read: </span>
          Moving <span style={{ color: '#2E4A5A', fontWeight: 700 }}>clockwise</span> = resolution toward tonic.{' '}
          <span style={{ color: FUNC_COLORS.subdominant.fill, fontWeight: 700 }}>ii</span>
          <span style={{ color: T.textMuted }}> → </span>
          <span style={{ color: FUNC_COLORS.dominant.fill, fontWeight: 700 }}>V</span>
          <span style={{ color: T.textMuted }}> → </span>
          <span style={{ color: FUNC_COLORS.tonic.fill, fontWeight: 700 }}>I</span>
          {' '}are always 3 consecutive counterclockwise steps.
          {secondaryDom && (
            <span style={{ display: 'block', marginTop: 4, color: T.primary }}>
              Secondary Dominants: minor chords replaced by their V7 — enables jazz-style dominant chains.
            </span>
          )}
        </p>
      </div>

      {onAddToProgression && (
        <p style={{ margin: 0, textAlign: 'center', fontSize: 11, color: T.textDim }}>
          Tap any chord to add it to your progression
        </p>
      )}

    </div>
  );
};
