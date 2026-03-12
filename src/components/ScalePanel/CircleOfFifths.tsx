import React, { useState, useRef } from 'react';
import { Key, Chord } from '@tonaljs/tonal';
import { T, card } from '../../theme';
import type { ChordInProgression } from '../../types/music';

// ── Geometry ──────────────────────────────────────────────────────────────────

const SVG_SIZE  = 360;
const CX        = SVG_SIZE / 2;
const CY        = SVG_SIZE / 2;

const R_OUT_OUTER = 172;
const R_OUT_INNER = 116;
const R_IN_OUTER  = 116;
const R_IN_INNER  = 62;

const TOTAL   = 12;
const SLICE_A = (2 * Math.PI) / TOTAL;   // 30°
// START shifted so that slice 0 (C) is centred at exact 12 o'clock
const START   = -Math.PI / 2 - SLICE_A / 2;

const EASING = 'cubic-bezier(0.37, 0, 0.63, 1)';
function transitionFor(durationS: number) {
  return `transform ${durationS}s ${EASING}`;
}

// ── Music data ─────────────────────────────────────────────────────────────────

const COF_MAJOR       = ['C','G','D','A','E','B','F#','Db','Ab','Eb','Bb','F'];
const COF_MINOR_NAMES = ['Am','Em','Bm','F#m','C#m','G#m','Ebm','Bbm','Fm','Cm','Gm','Dm'];

const COF_IDX: Record<string,number> = {
  C:0, G:1, D:2, A:3, E:4, B:5,
  'F#':6, Gb:6, Db:7, 'C#':7, Ab:8, 'G#':8, Eb:9, 'D#':9, Bb:10, 'A#':10, F:11,
};

// ── Types ──────────────────────────────────────────────────────────────────────

type HarmonicFunc = 'tonic' | 'subdominant' | 'dominant';

const FC: Record<HarmonicFunc,{fill:string;hover:string;text:string}> = {
  tonic:       { fill:'#2E4A5A', hover:'#1e3547', text:'#F9ECC3' },
  subdominant: { fill:'#3d6b53', hover:'#2d5040', text:'#F9ECC3' },
  dominant:    { fill:'#C44900', hover:'#a33d00', text:'#F9ECC3' },
};

interface HLInfo { chord:string; roman:string; func:HarmonicFunc; }

// ── SVG helpers ───────────────────────────────────────────────────────────────

function polar(angle: number, r: number) {
  return { x: CX + r * Math.cos(angle), y: CY + r * Math.sin(angle) };
}

function arcPath(i: number, rOuter: number, rInner: number): string {
  const gap = 0.013;
  const a1 = START + i * SLICE_A + gap;
  const a2 = START + (i + 1) * SLICE_A - gap;
  const o1 = polar(a1, rOuter), o2 = polar(a2, rOuter);
  const i1 = polar(a1, rInner), i2 = polar(a2, rInner);
  return `M${o1.x} ${o1.y} A${rOuter} ${rOuter} 0 0 1 ${o2.x} ${o2.y} L${i2.x} ${i2.y} A${rInner} ${rInner} 0 0 0 ${i1.x} ${i1.y}Z`;
}

function midPt(i: number, r: number) {
  const a = START + (i + 0.5) * SLICE_A;
  return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) };
}

// Rotate a point around the SVG centre by `deg` degrees
function rotPt(x: number, y: number, deg: number) {
  const r  = deg * Math.PI / 180;
  const dx = x - CX, dy = y - CY;
  return {
    x: dx * Math.cos(r) - dy * Math.sin(r) + CX,
    y: dx * Math.sin(r) + dy * Math.cos(r) + CY,
  };
}

// Returns inline style that CSS-translates a text element from its static SVG
// position to the position it occupies after the ring is rotated by `deg`.
function tStyle(x: number, y: number, deg: number, dur: number): React.CSSProperties {
  const rp = rotPt(x, y, deg);
  return {
    transform: `translate(${rp.x - x}px,${rp.y - y}px)`,
    transition: transitionFor(dur),
  };
}

// ── Highlight logic ───────────────────────────────────────────────────────────

function computeHighlights(root: string | null) {
  const outer = new Map<number, HLInfo>();
  const inner = new Map<number, HLInfo>();
  if (!root) return { outer, inner, relMinor: null };
  const P = COF_IDX[root];
  if (P === undefined) return { outer, inner, relMinor: null };

  const t = Key.majorKey(root).triads; // [I ii iii IV V vi vii°]
  outer.set(P,             { chord: t[0], roman: 'I',    func: 'tonic'       });
  outer.set((P+11)%12,     { chord: t[3], roman: 'IV',   func: 'subdominant' });
  outer.set((P+1)%12,      { chord: t[4], roman: 'V',    func: 'dominant'    });
  inner.set(P,             { chord: t[5], roman: 'vi',   func: 'tonic'       });
  inner.set((P+11)%12,     { chord: t[1], roman: 'ii',   func: 'subdominant' });
  inner.set((P+1)%12,      { chord: t[2], roman: 'iii',  func: 'tonic'       });
  inner.set((P+2)%12,      { chord: t[6], roman: 'vii°', func: 'dominant'    });
  return { outer, inner, relMinor: t[5] };
}

// ── Shortest-path rotation ────────────────────────────────────────────────────

function shortestRotation(prev: number, targetBase: number): number {
  const prevMod    = ((prev % 360) + 360) % 360;
  const targetMod  = ((targetBase % 360) + 360) % 360;
  let delta = targetMod - prevMod;
  if (delta >  180) delta -= 360;
  if (delta < -180) delta += 360;
  return prev + delta;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  onAddToProgression?: (item: ChordInProgression) => void;
}

export const CircleOfFifths: React.FC<Props> = ({ onAddToProgression }) => {
  const [selectedRoot, setSelectedRoot] = useState<string | null>(null);
  const [rotation,     setRotation]     = useState(0);   // accumulated deg
  const [transDur,     setTransDur]     = useState(1.5); // current transition seconds
  const [hovOuter,     setHovOuter]     = useState<number | null>(null);
  const [hovInner,     setHovInner]     = useState<number | null>(null);
  const [flash,        setFlash]        = useState<string | null>(null);

  // Mirror of rotation kept in a ref so handlers can read current value synchronously
  const rotRef = useRef(0);

  const { outer: outerHL, inner: innerHL, relMinor } = computeHighlights(selectedRoot);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleOuterClick = (i: number) => {
    const note    = COF_MAJOR[i];
    const newRoot = selectedRoot === note ? null : note;
    setSelectedRoot(newRoot);
    const target  = newRoot ? -(COF_IDX[newRoot] * 30) : 0;
    const next    = shortestRotation(rotRef.current, target);
    const slices  = Math.round(Math.abs(next - rotRef.current) / 30);
    // 1-2 slices → 0.3s  |  3-4 slices → 0.6s  |  5+ slices → 1.2s
    setTransDur(slices <= 2 ? 0.3 : slices <= 4 ? 0.6 : 1.2);
    rotRef.current = next;
    setRotation(next);
  };

  const handleInnerClick = (i: number) => {
    const hl = innerHL.get(i);
    if (!hl || !onAddToProgression) return;
    const data = Chord.get(hl.chord);
    onAddToProgression({
      id: `chord-cof-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      chord: { name: hl.chord, notes: data.notes, aliases: data.aliases },
      fretPositions: [],
    });
    setFlash(hl.chord);
    setTimeout(() => setFlash(null), 700);
  };

  // ── Outer-ring mid-point radii ─────────────────────────────────────────────
  const outerMidR = (R_OUT_OUTER + R_OUT_INNER) / 2;
  const innerMidR = (R_IN_OUTER  + R_IN_INNER)  / 2;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      <svg viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`} width="100%" style={{ display: 'block' }}>

        {/* Border ring */}
        <circle cx={CX} cy={CY} r={R_OUT_OUTER + 2} fill="none" stroke={T.border} strokeWidth="1" opacity="0.5" />

        {/* ── Rotating paths ── */}
        <g style={{
          transform:       `rotate(${rotation}deg)`,
          transformOrigin: `${CX}px ${CY}px`,
          transition:      transitionFor(transDur),
        }}>
          {/* Outer ring paths */}
          {COF_MAJOR.map((_, i) => {
            const hl    = outerHL.get(i);
            const isHov = hovOuter === i;
            const fill  = hl
              ? (isHov ? FC[hl.func].hover : FC[hl.func].fill)
              : (isHov ? T.bgInput : T.bgCard);
            return (
              <g
                key={`op-${i}`}
                onClick={() => handleOuterClick(i)}
                onMouseEnter={() => setHovOuter(i)}
                onMouseLeave={() => setHovOuter(null)}
                style={{ cursor: 'pointer' }}
              >
                <path
                  d={arcPath(i, R_OUT_OUTER, R_OUT_INNER)}
                  fill={fill}
                  stroke={T.bgDeep}
                  strokeWidth="1.5"
                  style={{ transition: 'fill 0.15s' }}
                />
              </g>
            );
          })}

          {/* Inner ring paths */}
          {COF_MINOR_NAMES.map((_, i) => {
            const hl     = innerHL.get(i);
            const isHov  = hovInner === i && !!hl;
            const isFlash = hl && flash === hl.chord;
            const fill   = hl
              ? (isFlash ? '#629677' : isHov ? FC[hl.func].hover : FC[hl.func].fill)
              : T.bgInput;
            return (
              <g
                key={`ip-${i}`}
                onClick={() => handleInnerClick(i)}
                onMouseEnter={() => setHovInner(i)}
                onMouseLeave={() => setHovInner(null)}
                style={{ cursor: hl && onAddToProgression ? 'pointer' : 'default' }}
              >
                <path
                  d={arcPath(i, R_IN_OUTER, R_IN_INNER)}
                  fill={fill}
                  stroke={T.bgDeep}
                  strokeWidth="1"
                  style={{ transition: 'fill 0.15s' }}
                />
              </g>
            );
          })}
        </g>

        {/* ── Animated text labels (outside rotating group, use CSS translate) ── */}

        {/* Outer ring: note name + optional roman numeral */}
        {COF_MAJOR.map((note, i) => {
          const hl       = outerHL.get(i);
          const textColor = hl ? FC[hl.func].text : T.text;
          const fontSize  = note.length >= 3 ? 11 : 14;
          const showRoman = !!hl;
          const noteY     = showRoman ? -8 : 0;   // offset from midpoint
          const mp        = midPt(i, outerMidR);

          return (
            <g key={`ot-${i}`} style={{ pointerEvents: 'none' }}>
              <text
                x={mp.x} y={mp.y + noteY}
                textAnchor="middle" dominantBaseline="middle"
                fill={textColor} fontSize={fontSize} fontWeight={hl ? 800 : 600}
                fontFamily="system-ui, -apple-system, Arial, sans-serif"
                style={tStyle(mp.x, mp.y + noteY, rotation, transDur)}
              >{note}</text>
              {showRoman && (
                <text
                  x={mp.x} y={mp.y + 8}
                  textAnchor="middle" dominantBaseline="middle"
                  fill={textColor} fontSize={8} opacity={0.85}
                  fontFamily="system-ui, -apple-system, Arial, sans-serif"
                  style={tStyle(mp.x, mp.y + 8, rotation, transDur)}
                >{hl!.roman}</text>
              )}
            </g>
          );
        })}

        {/* Inner ring: chord name + roman numeral OR minor name */}
        {COF_MINOR_NAMES.map((minorName, i) => {
          const hl         = innerHL.get(i);
          const textColor  = hl ? FC[hl.func].text : T.textMuted;
          const displayName = hl ? hl.chord : minorName;
          const nameFontSz  = displayName.length >= 5 ? 7 : displayName.length >= 4 ? 8 : 10;
          const mp          = midPt(i, innerMidR);

          return (
            <g key={`it-${i}`} style={{ pointerEvents: 'none' }}>
              <text
                x={mp.x} y={mp.y - (hl ? 7 : 0)}
                textAnchor="middle" dominantBaseline="middle"
                fill={textColor} fontSize={nameFontSz} fontWeight={hl ? 700 : 400}
                fontFamily="system-ui, -apple-system, Arial, sans-serif"
                style={tStyle(mp.x, mp.y - (hl ? 7 : 0), rotation, transDur)}
              >{displayName}</text>
              {hl && (
                <text
                  x={mp.x} y={mp.y + 7}
                  textAnchor="middle" dominantBaseline="middle"
                  fill={textColor} fontSize={7} opacity={0.85}
                  fontFamily="system-ui, -apple-system, Arial, sans-serif"
                  style={tStyle(mp.x, mp.y + 7, rotation, transDur)}
                >{hl.roman}</text>
              )}
            </g>
          );
        })}

        {/* ── Static center circle ── */}
        <circle cx={CX} cy={CY} r={R_IN_INNER - 2} fill={T.bgCard} stroke={T.border} strokeWidth="1.5" />
        {selectedRoot ? (
          <>
            <text x={CX} y={CY - 13} textAnchor="middle" dominantBaseline="middle"
              fill={T.text} fontSize={18} fontWeight={800}
              fontFamily="system-ui, -apple-system, Arial, sans-serif">{selectedRoot}</text>
            <text x={CX} y={CY + 3} textAnchor="middle" dominantBaseline="middle"
              fill={T.textMuted} fontSize={10}
              fontFamily="system-ui, -apple-system, Arial, sans-serif">Major</text>
            <text x={CX} y={CY + 19} textAnchor="middle" dominantBaseline="middle"
              fill={T.textDim} fontSize={9}
              fontFamily="system-ui, -apple-system, Arial, sans-serif">Rel: {relMinor}</text>
          </>
        ) : (
          <>
            <text x={CX} y={CY - 7} textAnchor="middle" dominantBaseline="middle"
              fill={T.textMuted} fontSize={11} fontWeight={700}
              fontFamily="system-ui, -apple-system, Arial, sans-serif">Circle of</text>
            <text x={CX} y={CY + 9} textAnchor="middle" dominantBaseline="middle"
              fill={T.textMuted} fontSize={11} fontWeight={700}
              fontFamily="system-ui, -apple-system, Arial, sans-serif">Fifths</text>
          </>
        )}

      </svg>

      {/* ── Legend ── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {(['tonic', 'subdominant', 'dominant'] as HarmonicFunc[]).map(f => (
          <div key={f} style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: T.bgCard, borderRadius: 7,
            padding: '4px 10px', border: `1px solid ${T.border}`,
          }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: FC[f].fill }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: FC[f].fill, textTransform: 'capitalize' }}>{f}</span>
          </div>
        ))}
      </div>

      {/* ── Tip ── */}
      <div style={card({ padding: '10px 14px' })}>
        {selectedRoot ? (
          <p style={{ margin: 0, fontSize: 12, color: T.textMuted, lineHeight: 1.6 }}>
            <span style={{ color: T.text, fontWeight: 700 }}>{selectedRoot} Major</span>
            {' — outer: '}
            <span style={{ color: FC.subdominant.fill, fontWeight: 700 }}>IV</span>{', '}
            <span style={{ color: FC.tonic.fill,       fontWeight: 700 }}>I</span>{', '}
            <span style={{ color: FC.dominant.fill,    fontWeight: 700 }}>V</span>
            {'  ·  inner: '}
            <span style={{ color: FC.subdominant.fill, fontWeight: 700 }}>ii</span>{', '}
            <span style={{ color: FC.tonic.fill,       fontWeight: 700 }}>vi</span>{', '}
            <span style={{ color: FC.tonic.fill,       fontWeight: 700 }}>iii</span>{', '}
            <span style={{ color: FC.dominant.fill,    fontWeight: 700 }}>vii°</span>
          </p>
        ) : (
          <p style={{ margin: 0, fontSize: 12, color: T.textMuted, lineHeight: 1.6 }}>
            <span style={{ color: T.text, fontWeight: 700 }}>Tap a key</span> in the outer ring — it rotates to the top and highlights the 7 diatonic chords.
          </p>
        )}
      </div>

      {onAddToProgression && (
        <p style={{ margin: 0, textAlign: 'center', fontSize: 11, color: T.textDim }}>
          Tap a highlighted inner chord to add it to your progression
        </p>
      )}

    </div>
  );
};
