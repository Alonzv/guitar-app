import React, { useState, useRef } from 'react';
import { Key } from '@tonaljs/tonal';
import { T, card } from '../../theme';

// ── Geometry ──────────────────────────────────────────────────────────────────
const SVG_SIZE  = 360;
const CX        = SVG_SIZE / 2;
const CY        = SVG_SIZE / 2;
const R_OUT_OUTER = 172;
const R_OUT_INNER = 116;
const R_IN_OUTER  = 116;
const R_IN_INNER  = 62;
const TOTAL   = 12;
const SLICE_A = (2 * Math.PI) / TOTAL;
const START   = -Math.PI / 2 - SLICE_A / 2;
const EASING  = 'cubic-bezier(0.37, 0, 0.63, 1)';
function transitionFor(s: number) { return `transform ${s}s ${EASING}`; }

// ── Music data ─────────────────────────────────────────────────────────────────
const COF_MAJOR       = ['C','G','D','A','E','B','F#','Db','Ab','Eb','Bb','F'];
const COF_MINOR_NAMES = ['Am','Em','Bm','F#m','C#m','G#m','Ebm','Bbm','Fm','Cm','Gm','Dm'];

// ── Types ──────────────────────────────────────────────────────────────────────
type HarmonicFunc = 'tonic' | 'subdominant' | 'dominant';
type Mode = 'major' | 'minor';

const FC: Record<HarmonicFunc, { fill: string; hover: string; text: string }> = {
  tonic:       { fill: '#2E4A5A', hover: '#1e3547', text: '#F9ECC3' },
  subdominant: { fill: '#3d6b53', hover: '#2d5040', text: '#F9ECC3' },
  dominant:    { fill: '#C44900', hover: '#a33d00', text: '#F9ECC3' },
};

interface HLInfo { chord: string; roman: string; func: HarmonicFunc }

// ── SVG helpers ───────────────────────────────────────────────────────────────
function polar(a: number, r: number) { return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) }; }

function arcPath(i: number, rOuter: number, rInner: number): string {
  const gap = 0.013;
  const a1 = START + i * SLICE_A + gap, a2 = START + (i + 1) * SLICE_A - gap;
  const o1 = polar(a1, rOuter), o2 = polar(a2, rOuter);
  const i1 = polar(a1, rInner), i2 = polar(a2, rInner);
  return `M${o1.x} ${o1.y} A${rOuter} ${rOuter} 0 0 1 ${o2.x} ${o2.y} L${i2.x} ${i2.y} A${rInner} ${rInner} 0 0 0 ${i1.x} ${i1.y}Z`;
}

function midPt(i: number, r: number) {
  const a = START + (i + 0.5) * SLICE_A;
  return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) };
}

function rotPt(x: number, y: number, deg: number) {
  const r = deg * Math.PI / 180, dx = x - CX, dy = y - CY;
  return { x: dx * Math.cos(r) - dy * Math.sin(r) + CX, y: dx * Math.sin(r) + dy * Math.cos(r) + CY };
}

function tStyle(x: number, y: number, deg: number, dur: number): React.CSSProperties {
  const rp = rotPt(x, y, deg);
  return { transform: `translate(${rp.x - x}px,${rp.y - y}px)`, transition: transitionFor(dur) };
}

function shortestRotation(prev: number, targetBase: number): number {
  const pm = ((prev % 360) + 360) % 360, tm = ((targetBase % 360) + 360) % 360;
  let d = tm - pm;
  if (d >  180) d -= 360;
  if (d < -180) d += 360;
  return prev + d;
}

// ── Highlight logic ───────────────────────────────────────────────────────────
// For both modes, derive highlights from the relative major's triads at position P.
// Major at position P:  I=t[0], ii=t[1], iii=t[2], IV=t[3], V=t[4], vi=t[5], vii°=t[6]
// Minor at position P:  III=t[0], IV→VI=t[3], V→VII=t[4], vi→i=t[5], ii=t[1], iii→v=t[2], vii°→ii°=t[6]
function computeHighlights(idx: number | null, mode: Mode) {
  const outer = new Map<number, HLInfo>();
  const inner = new Map<number, HLInfo>();
  if (idx === null) return { outer, inner };

  const P  = idx;
  const t  = Key.majorKey(COF_MAJOR[P]).triads; // relative-major triads

  if (mode === 'major') {
    outer.set(P,          { chord: t[0], roman: 'I',    func: 'tonic'       });
    outer.set((P+11)%12,  { chord: t[3], roman: 'IV',   func: 'subdominant' });
    outer.set((P+1)%12,   { chord: t[4], roman: 'V',    func: 'dominant'    });
    inner.set(P,          { chord: t[5], roman: 'vi',   func: 'tonic'       });
    inner.set((P+11)%12,  { chord: t[1], roman: 'ii',   func: 'subdominant' });
    inner.set((P+1)%12,   { chord: t[2], roman: 'iii',  func: 'tonic'       });
    inner.set((P+2)%12,   { chord: t[6], roman: 'vii°', func: 'dominant'    });
  } else {
    // Minor key: same triads reinterpreted from the minor tonic
    inner.set(P,          { chord: t[5], roman: 'i',    func: 'tonic'       });
    inner.set((P+11)%12,  { chord: t[1], roman: 'iv',   func: 'subdominant' });
    inner.set((P+1)%12,   { chord: t[2], roman: 'v',    func: 'dominant'    });
    inner.set((P+2)%12,   { chord: t[6], roman: 'ii°',  func: 'subdominant' });
    outer.set(P,          { chord: t[0], roman: 'III',  func: 'tonic'       });
    outer.set((P+11)%12,  { chord: t[3], roman: 'VI',   func: 'subdominant' });
    outer.set((P+1)%12,   { chord: t[4], roman: 'VII',  func: 'dominant'    });
  }

  return { outer, inner };
}

// ── Component ─────────────────────────────────────────────────────────────────
interface Props {
  onAddToProgression?: (item: never) => void; // kept for prop-compat, unused
}

export const CircleOfFifths: React.FC<Props> = () => {
  const [selectedIdx,  setSelectedIdx]  = useState<number | null>(null);
  const [selectedMode, setSelectedMode] = useState<Mode>('major');
  const [rotation,     setRotation]     = useState(0);
  const [transDur,     setTransDur]     = useState(1.5);
  const [hovOuter,     setHovOuter]     = useState<number | null>(null);
  const [hovInner,     setHovInner]     = useState<number | null>(null);
  const rotRef = useRef(0);

  const { outer: outerHL, inner: innerHL } = computeHighlights(selectedIdx, selectedMode);
  const outerMidR = (R_OUT_OUTER + R_OUT_INNER) / 2;
  const innerMidR = (R_IN_OUTER  + R_IN_INNER)  / 2;

  const rotateToIdx = (idx: number | null) => {
    const target = idx !== null ? -(idx * 30) : 0;
    const next   = shortestRotation(rotRef.current, target);
    const slices = Math.round(Math.abs(next - rotRef.current) / 30);
    setTransDur(slices <= 2 ? 0.3 : slices <= 4 ? 0.6 : 1.2);
    rotRef.current = next;
    setRotation(next);
  };

  const handleOuterClick = (i: number) => {
    const same = selectedIdx === i && selectedMode === 'major';
    const next = same ? null : i;
    setSelectedIdx(next);
    setSelectedMode('major');
    rotateToIdx(next);
  };

  const handleInnerClick = (i: number) => {
    const same = selectedIdx === i && selectedMode === 'minor';
    const next = same ? null : i;
    setSelectedIdx(next);
    setSelectedMode('minor');
    rotateToIdx(next);
  };

  // Center display values
  const hasSelection = selectedIdx !== null;
  const minorRoot    = hasSelection && selectedMode === 'minor'
    ? COF_MINOR_NAMES[selectedIdx!].slice(0, -1)  // 'F#m' → 'F#'
    : null;
  const centerRoot  = hasSelection
    ? selectedMode === 'major' ? COF_MAJOR[selectedIdx!] : minorRoot!
    : null;
  const centerLabel = hasSelection ? (selectedMode === 'major' ? 'Major' : 'minor') : null;
  const relLabel    = hasSelection
    ? selectedMode === 'major'
      ? `Rel: ${Key.majorKey(COF_MAJOR[selectedIdx!]).triads[5]}`
      : `Rel: ${COF_MAJOR[selectedIdx!]}`
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      <div style={{ width: 'min(400px, 90vw)', margin: '0 auto' }}>
        <svg viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`} style={{ display: 'block', width: '100%' }}>

          {/* Border ring */}
          <circle cx={CX} cy={CY} r={R_OUT_OUTER + 2} fill="none" stroke={T.border} strokeWidth="1" opacity="0.5" />

          {/* ── Rotating group ── */}
          <g style={{ transform: `rotate(${rotation}deg)`, transformOrigin: `${CX}px ${CY}px`, transition: transitionFor(transDur) }}>

            {/* Outer ring paths */}
            {COF_MAJOR.map((_, i) => {
              const hl   = outerHL.get(i);
              const isHov = hovOuter === i;
              const fill  = hl
                ? (isHov ? FC[hl.func].hover : FC[hl.func].fill)
                : (isHov ? T.bgInput : T.bgCard);
              return (
                <g key={`op-${i}`}
                  onClick={() => handleOuterClick(i)}
                  onMouseEnter={() => setHovOuter(i)}
                  onMouseLeave={() => setHovOuter(null)}
                  style={{ cursor: 'pointer' }}>
                  <path d={arcPath(i, R_OUT_OUTER, R_OUT_INNER)} fill={fill}
                    stroke={T.bgDeep} strokeWidth="1.5" style={{ transition: 'fill 0.15s' }} />
                </g>
              );
            })}

            {/* Inner ring paths */}
            {COF_MINOR_NAMES.map((_, i) => {
              const hl    = innerHL.get(i);
              const isHov = hovInner === i;
              // Highlight the selected minor tonic with a slightly brighter shade
              const isSelectedTonic = selectedMode === 'minor' && selectedIdx === i;
              const fill  = hl
                ? (isHov ? FC[hl.func].hover : FC[hl.func].fill)
                : (isHov ? T.bgInput : T.bgCard);
              return (
                <g key={`ip-${i}`}
                  onClick={() => handleInnerClick(i)}
                  onMouseEnter={() => setHovInner(i)}
                  onMouseLeave={() => setHovInner(null)}
                  style={{ cursor: 'pointer' }}>
                  <path d={arcPath(i, R_IN_OUTER, R_IN_INNER)} fill={fill}
                    stroke={isSelectedTonic ? T.secondary : T.bgDeep}
                    strokeWidth={isSelectedTonic ? 2 : 1}
                    style={{ transition: 'fill 0.15s' }} />
                </g>
              );
            })}
          </g>

          {/* ── Animated text labels ── */}

          {/* Outer ring: note name + roman numeral */}
          {COF_MAJOR.map((note, i) => {
            const hl        = outerHL.get(i);
            const textColor = hl ? FC[hl.func].text : T.text;
            const fontSize  = note.length >= 3 ? 11 : 14;
            const showRoman = !!hl;
            const mp        = midPt(i, outerMidR);
            const noteY     = showRoman ? -8 : 0;
            return (
              <g key={`ot-${i}`} style={{ pointerEvents: 'none' }}>
                <text x={mp.x} y={mp.y + noteY}
                  textAnchor="middle" dominantBaseline="middle"
                  fill={textColor} fontSize={fontSize} fontWeight={hl ? 800 : 600}
                  fontFamily="system-ui, -apple-system, Arial, sans-serif"
                  style={tStyle(mp.x, mp.y + noteY, rotation, transDur)}>{note}</text>
                {showRoman && (
                  <text x={mp.x} y={mp.y + 8}
                    textAnchor="middle" dominantBaseline="middle"
                    fill={textColor} fontSize={8} opacity={0.85}
                    fontFamily="system-ui, -apple-system, Arial, sans-serif"
                    style={tStyle(mp.x, mp.y + 8, rotation, transDur)}>{hl!.roman}</text>
                )}
              </g>
            );
          })}

          {/* Inner ring: chord name + roman numeral or minor key name */}
          {COF_MINOR_NAMES.map((minorName, i) => {
            const hl          = innerHL.get(i);
            const textColor   = hl ? FC[hl.func].text : T.textMuted;
            const displayName = hl ? hl.chord : minorName;
            const nameFontSz  = displayName.length >= 5 ? 7 : displayName.length >= 4 ? 8 : 10;
            const mp          = midPt(i, innerMidR);
            return (
              <g key={`it-${i}`} style={{ pointerEvents: 'none' }}>
                <text x={mp.x} y={mp.y - (hl ? 7 : 0)}
                  textAnchor="middle" dominantBaseline="middle"
                  fill={textColor} fontSize={nameFontSz} fontWeight={hl ? 700 : 400}
                  fontFamily="system-ui, -apple-system, Arial, sans-serif"
                  style={tStyle(mp.x, mp.y - (hl ? 7 : 0), rotation, transDur)}>{displayName}</text>
                {hl && (
                  <text x={mp.x} y={mp.y + 7}
                    textAnchor="middle" dominantBaseline="middle"
                    fill={textColor} fontSize={7} opacity={0.85}
                    fontFamily="system-ui, -apple-system, Arial, sans-serif"
                    style={tStyle(mp.x, mp.y + 7, rotation, transDur)}>{hl.roman}</text>
                )}
              </g>
            );
          })}

          {/* ── Static center ── */}
          <circle cx={CX} cy={CY} r={R_IN_INNER - 2} fill={T.bgCard} stroke={T.border} strokeWidth="1.5" />
          {hasSelection ? (
            <>
              <text x={CX} y={CY - 13} textAnchor="middle" dominantBaseline="middle"
                fill={T.text} fontSize={18} fontWeight={800}
                fontFamily="system-ui, -apple-system, Arial, sans-serif">{centerRoot}</text>
              <text x={CX} y={CY + 3} textAnchor="middle" dominantBaseline="middle"
                fill={selectedMode === 'minor' ? T.textMuted : T.textMuted} fontSize={10}
                fontFamily="system-ui, -apple-system, Arial, sans-serif">{centerLabel}</text>
              <text x={CX} y={CY + 19} textAnchor="middle" dominantBaseline="middle"
                fill={T.textDim} fontSize={9}
                fontFamily="system-ui, -apple-system, Arial, sans-serif">{relLabel}</text>
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
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {(['tonic', 'subdominant', 'dominant'] as HarmonicFunc[]).map(f => (
          <div key={f} style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: T.bgCard, borderRadius: 7, padding: '4px 10px', border: `1px solid ${T.border}`,
          }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: FC[f].fill }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: FC[f].fill, textTransform: 'capitalize' }}>{f}</span>
          </div>
        ))}
      </div>

      {/* Tip */}
      <div style={card({ padding: '10px 14px' })}>
        {hasSelection ? (
          <p style={{ margin: 0, fontSize: 12, color: T.textMuted, lineHeight: 1.6 }}>
            <span style={{ color: T.text, fontWeight: 700 }}>{centerRoot} {centerLabel}</span>
            {selectedMode === 'major' ? (
              <>
                {' — outer: '}
                <span style={{ color: FC.subdominant.fill, fontWeight: 700 }}>IV</span>{', '}
                <span style={{ color: FC.tonic.fill,       fontWeight: 700 }}>I</span>{', '}
                <span style={{ color: FC.dominant.fill,    fontWeight: 700 }}>V</span>
                {'  ·  inner: '}
                <span style={{ color: FC.subdominant.fill, fontWeight: 700 }}>ii</span>{', '}
                <span style={{ color: FC.tonic.fill,       fontWeight: 700 }}>vi</span>{', '}
                <span style={{ color: FC.tonic.fill,       fontWeight: 700 }}>iii</span>{', '}
                <span style={{ color: FC.dominant.fill,    fontWeight: 700 }}>vii°</span>
              </>
            ) : (
              <>
                {' — inner: '}
                <span style={{ color: FC.subdominant.fill, fontWeight: 700 }}>iv</span>{', '}
                <span style={{ color: FC.tonic.fill,       fontWeight: 700 }}>i</span>{', '}
                <span style={{ color: FC.dominant.fill,    fontWeight: 700 }}>v</span>{', '}
                <span style={{ color: FC.subdominant.fill, fontWeight: 700 }}>ii°</span>
                {'  ·  outer: '}
                <span style={{ color: FC.subdominant.fill, fontWeight: 700 }}>VI</span>{', '}
                <span style={{ color: FC.tonic.fill,       fontWeight: 700 }}>III</span>{', '}
                <span style={{ color: FC.dominant.fill,    fontWeight: 700 }}>VII</span>
              </>
            )}
          </p>
        ) : (
          <p style={{ margin: 0, fontSize: 12, color: T.textMuted, lineHeight: 1.6 }}>
            Tap a key in the <span style={{ color: T.text, fontWeight: 700 }}>outer ring</span> for major,
            or the <span style={{ color: T.text, fontWeight: 700 }}>inner ring</span> for minor —
            highlights the 7 diatonic chords with Roman numerals.
          </p>
        )}
      </div>

    </div>
  );
};
