import React, { useState } from 'react';
import { Key } from '@tonaljs/tonal';
import { T } from '../../theme';
import { playChord } from '../../utils/audioPlayback';
import type { ChordInProgression } from '../../types/music';
import { findChordVoicings } from '../../utils/chordVoicings';

// ── Music data ─────────────────────────────────────────────────────────────────
const ALL_ROOTS = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

const COF_ORDER  = ['C','G','D','A','E','B','F#','Db','Ab','Eb','Bb','F'];
const COF_MINOR  = ['Am','Em','Bm','F#m','C#m','G#m','Ebm','Bbm','Fm','Cm','Gm','Dm'];

const MAJOR_ROMANS = ['I','ii','iii','IV','V','vi','vii°'] as const;
const MAJOR_FUNCS  = ['tonic','subdominant','tonic','subdominant','dominant','tonic','dominant'] as const;
type Func = 'tonic' | 'subdominant' | 'dominant';

const FUNC_COLOR: Record<Func, string> = {
  tonic:       T.primary,
  subdominant: '#5C5650',
  dominant:    T.secondary,
};

const PROG_TEMPLATES = [
  { label: 'I – V – vi – IV', indices: [0, 4, 5, 3] },
  { label: 'I – vi – IV – V', indices: [0, 5, 3, 4] },
  { label: 'ii – V – I',      indices: [1, 4, 0]    },
  { label: 'I – IV – V – I',  indices: [0, 3, 4, 0] },
];

// ── Geometry ───────────────────────────────────────────────────────────────────
const SIZE   = 320;
const CX     = SIZE / 2;
const CY     = SIZE / 2;
const R_O_O  = 152;  // outer ring outer radius
const R_O_I  = 104;  // outer ring inner radius
const R_I_O  = 100;  // inner ring outer radius
const R_I_I  = 58;   // inner ring inner radius
const TOTAL  = 12;
const SLICE  = (2 * Math.PI) / TOTAL;
const GAP    = 0.013;

function polar(a: number, r: number) {
  return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) };
}
function arcPath(startAngle: number, rOuter: number, rInner: number): string {
  const a1 = startAngle + GAP, a2 = startAngle + SLICE - GAP;
  const o1 = polar(a1, rOuter), o2 = polar(a2, rOuter);
  const i1 = polar(a1, rInner), i2 = polar(a2, rInner);
  return `M${o1.x} ${o1.y} A${rOuter} ${rOuter} 0 0 1 ${o2.x} ${o2.y} L${i2.x} ${i2.y} A${rInner} ${rInner} 0 0 0 ${i1.x} ${i1.y}Z`;
}
function midPt(startAngle: number, r: number) {
  const a = startAngle + SLICE / 2;
  return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) };
}

const OPEN_FREQS = [82.41, 110.0, 146.83, 196.0, 246.94, 329.63];

const MONO_LBL: React.CSSProperties = {
  fontSize: 10, fontFamily: 'var(--gc-mono)', letterSpacing: '0.14em',
  textTransform: 'uppercase', color: '#9C958C', margin: '0 0 8px',
};

interface Props {
  onAddToProgression?: (item: ChordInProgression) => void;
  desktop?: boolean;
}

export const ChordWheel: React.FC<Props> = ({ onAddToProgression }) => {
  const [root, setRoot] = useState<string>('C');

  // Map display root → CoF canonical name (COF_ORDER uses flats for some enharmonics)
  const SHARP_TO_COF: Record<string, string> = { 'C#':'Db', 'D#':'Eb', 'G#':'Ab', 'A#':'Bb' };
  const cofRoot = COF_ORDER.includes(root) ? root : (SHARP_TO_COF[root] ?? root);

  const keyData  = Key.majorKey(cofRoot);
  const triads   = keyData.triads;  // ['C','Dm','Em','F','G','Am','Bdim'] for C major

  // CoF index for the selected key (outer ring)
  const cofIdx   = COF_ORDER.indexOf(cofRoot);

  // Build position map: CoF position → diatonic info
  // Outer positions with diatonic chords for this key
  const outerMap = new Map<number, { chord: string; roman: string; func: Func }>();
  const innerMap = new Map<number, { chord: string; roman: string; func: Func }>();
  if (cofIdx >= 0) {
    outerMap.set(cofIdx,           { chord: triads[0], roman: 'I',    func: 'tonic'       });
    outerMap.set((cofIdx+11)%12,   { chord: triads[3], roman: 'IV',   func: 'subdominant' });
    outerMap.set((cofIdx+1)%12,    { chord: triads[4], roman: 'V',    func: 'dominant'    });
    innerMap.set(cofIdx,           { chord: triads[5], roman: 'vi',   func: 'tonic'       });
    innerMap.set((cofIdx+11)%12,   { chord: triads[1], roman: 'ii',   func: 'subdominant' });
    innerMap.set((cofIdx+1)%12,    { chord: triads[2], roman: 'iii',  func: 'tonic'       });
    innerMap.set((cofIdx+2)%12,    { chord: triads[6], roman: 'vii°', func: 'dominant'    });
  }

  // Build diatonic chord list with roman/func
  const diatonic = triads.map((chord, i) => ({
    chord,
    roman: MAJOR_ROMANS[i],
    func:  MAJOR_FUNCS[i] as Func,
  }));

  const byFunc = {
    tonic:       diatonic.filter(c => c.func === 'tonic'),
    subdominant: diatonic.filter(c => c.func === 'subdominant'),
    dominant:    diatonic.filter(c => c.func === 'dominant'),
  };

  // Rotation: selected key at top (-π/2)
  // Position 0 (C) is at -π/2 by default; rotate so cofIdx goes to top
  const rotationDeg = cofIdx >= 0 ? -(cofIdx * 30) : 0;

  const getVoicing = (chordName: string) => {
    const stdTuning = ['E2','A2','D3','G3','B3','E4'];
    const voicings  = findChordVoicings(chordName, 4, stdTuning);
    return voicings[0] ?? [];
  };

  const handleAddChord = (chordName: string) => {
    if (!onAddToProgression) return;
    onAddToProgression({
      id: `cw-${Date.now()}`,
      chord: { name: chordName, notes: [], aliases: [] },
      fretPositions: getVoicing(chordName),
    });
  };

  const handlePlayChord = (chordName: string) => {
    const fp = getVoicing(chordName);
    if (fp.length) playChord(fp, OPEN_FREQS, 0);
  };

  // SVG: draw 12 arc slices, rotated so selected key is at top
  const startAngle = (i: number) => -Math.PI / 2 - SLICE / 2 + i * SLICE;

  const wheelSvg = (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ display: 'block', width: '100%', maxWidth: SIZE }}>
      <g style={{
        transform: `rotate(${rotationDeg}deg)`,
        transformOrigin: `${CX}px ${CY}px`,
        transformBox: 'view-box',
        transition: 'transform 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        willChange: 'transform',
      } as React.CSSProperties}>
        {Array.from({ length: TOTAL }, (_, i) => {
          const sa        = startAngle(i);
          const outerInfo = outerMap.get(i);
          const innerInfo = innerMap.get(i);
          const isSelected = i === cofIdx;
          const oFill = outerInfo ? FUNC_COLOR[outerInfo.func] : '#E4E0D8';
          const iFill = innerInfo ? FUNC_COLOR[innerInfo.func] : '#EAE7E2';
          const oOpacity = outerInfo ? 1 : 0.35;
          const iOpacity = innerInfo ? 1 : 0.25;
          const mp_o = midPt(sa, (R_O_O + R_O_I) / 2);
          const mp_i = midPt(sa, (R_I_O + R_I_I) / 2);
          // Text rotation to keep text upright after group rotation
          const textRot = -rotationDeg;
          // Map CoF index back to ALL_ROOTS name for key selection
          const cofNote = COF_ORDER[i];
          const FLAT_TO_SHARP: Record<string, string> = { 'Db':'C#', 'Eb':'D#', 'Ab':'G#', 'Bb':'A#' };
          const selectRoot = ALL_ROOTS.includes(cofNote) ? cofNote : (FLAT_TO_SHARP[cofNote] ?? cofNote);
          return (
            <g key={i} style={{ cursor: 'pointer' }} onClick={() => setRoot(selectRoot)}>
              {/* Outer arc */}
              <path d={arcPath(sa, R_O_O, R_O_I)} fill={oFill} opacity={oOpacity}
                stroke={isSelected ? '#fff' : 'none'} strokeWidth={isSelected ? 1.5 : 0} />
              {/* Inner arc */}
              <path d={arcPath(sa, R_I_O, R_I_I)} fill={iFill} opacity={iOpacity} />
              {/* Outer text */}
              <text
                x={mp_o.x} y={mp_o.y}
                textAnchor="middle" dominantBaseline="middle"
                fontSize={outerInfo ? 11 : 9}
                fontWeight={outerInfo ? 700 : 400}
                fill={outerInfo ? '#fff' : '#9C958C'}
                transform={`rotate(${textRot} ${mp_o.x} ${mp_o.y})`}
                style={{ pointerEvents: 'none' }}
              >
                {COF_ORDER[i]}
              </text>
              {/* Inner text */}
              <text
                x={mp_i.x} y={mp_i.y}
                textAnchor="middle" dominantBaseline="middle"
                fontSize={innerInfo ? 9 : 8}
                fontWeight={innerInfo ? 600 : 400}
                fill={innerInfo ? '#fff' : '#9C958C'}
                transform={`rotate(${textRot} ${mp_i.x} ${mp_i.y})`}
                style={{ pointerEvents: 'none' }}
              >
                {COF_MINOR[i]}
              </text>
            </g>
          );
        })}
      </g>

      {/* Dashed red arc — tonic sector highlight */}
      {cofIdx >= 0 && (() => {
        const sa = startAngle(cofIdx) + rotationDeg * Math.PI / 180 - 0.04;
        const ea = sa + SLICE + 0.08;
        const arcR = R_O_O + 8;
        const p1 = polar(sa, arcR), p2 = polar(ea, arcR);
        return (
          <path
            d={`M${p1.x} ${p1.y} A${arcR} ${arcR} 0 0 1 ${p2.x} ${p2.y}`}
            fill="none" stroke={T.primary} strokeWidth={2} strokeDasharray="5 3" opacity={0.8}
          />
        );
      })()}

      {/* Center label */}
      <text x={CX} y={CY - 8} textAnchor="middle" fontSize={22} fontWeight={900}
        fill={T.text} fontFamily="inherit">{root}</text>
      <text x={CX} y={CY + 10} textAnchor="middle" fontSize={9}
        fill={T.textDim} fontFamily="var(--gc-mono)" letterSpacing="0.1em">MAJOR</text>
    </svg>
  );

  const CHORD_ROW = (c: typeof diatonic[0]) => (
    <div key={c.chord} style={{
      display: 'flex', alignItems: 'center',
      padding: '6px 12px', marginBottom: 4,
      background: T.bgCard, border: `1px solid ${T.border}`,
      borderLeft: `3px solid ${FUNC_COLOR[c.func]}`,
    }}>
      <span style={{ fontFamily: 'var(--gc-mono)', fontSize: 9, color: T.textDim, width: 28, letterSpacing: '0.06em' }}>
        {c.roman}
      </span>
      <span style={{ fontSize: 14, fontWeight: 700, color: T.text, flex: 1 }}>
        {c.chord}
      </span>
      <button
        onClick={() => handlePlayChord(c.chord)}
        style={{
          padding: '3px 8px', border: `1px solid ${T.border}`, background: 'transparent',
          color: T.textMuted, fontSize: 10, cursor: 'pointer', marginRight: 4,
        }}
      >
        PLAY
      </button>
      {onAddToProgression && (
        <button
          onClick={() => handleAddChord(c.chord)}
          style={{
            padding: '3px 8px', border: `1px solid ${T.primary}`, background: 'transparent',
            color: T.primary, fontSize: 10, cursor: 'pointer',
          }}
        >
          ADD
        </button>
      )}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Key picker */}
      <div>
        <p style={MONO_LBL}>Key</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4 }}>
          {ALL_ROOTS.map(n => {
            const sharp = n.includes('#');
            const sel   = n === root;
            return (
              <button key={n} onClick={() => setRoot(n)} style={{
                padding: '9px 2px', borderRadius: 0, cursor: 'pointer',
                fontSize: sharp ? 10 : 12, fontWeight: sel ? 700 : 400,
                border: `1px solid ${sel ? T.primary : T.border}`,
                background: sel ? T.primary : sharp ? T.bgInput : T.bgCard,
                color: sel ? '#fff' : sharp ? T.textMuted : T.text,
                borderTop: `3px solid ${sel ? T.primary : 'transparent'}`,
              }}>{n}</button>
            );
          })}
        </div>
      </div>

      {/* Wheel */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <p style={{ ...MONO_LBL, marginBottom: 6, alignSelf: 'flex-start' }}>Chord Wheel · Key of {root}</p>
        <div style={{ width: '100%', maxWidth: SIZE }}>
          {wheelSvg}
        </div>
      </div>

      {/* Function legend */}
      <div style={{ display: 'flex', gap: 12, fontSize: 10, fontFamily: 'var(--gc-mono)', letterSpacing: '0.06em' }}>
        {(['tonic', 'subdominant', 'dominant'] as Func[]).map(f => (
          <span key={f} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 8, height: 8, background: FUNC_COLOR[f], display: 'inline-block' }} />
            <span style={{ color: T.textMuted, textTransform: 'uppercase' }}>{f.slice(0, 4)}</span>
          </span>
        ))}
      </div>

      {/* Tonic chords */}
      <div>
        <p style={MONO_LBL}>Tonic</p>
        {byFunc.tonic.map(CHORD_ROW)}
      </div>

      {/* Subdominant chords */}
      <div>
        <p style={MONO_LBL}>Subdominant</p>
        {byFunc.subdominant.map(CHORD_ROW)}
      </div>

      {/* Dominant chords */}
      <div>
        <p style={MONO_LBL}>Dominant</p>
        {byFunc.dominant.map(CHORD_ROW)}
      </div>

      {/* Common progressions */}
      <div>
        <p style={MONO_LBL}>Common Progressions</p>
        {PROG_TEMPLATES.map(pt => {
          const chords = pt.indices.map(i => diatonic[i]?.chord ?? '?');
          return (
            <button
              key={pt.label}
              onClick={() => {
                if (!onAddToProgression) return;
                chords.forEach(chordName => handleAddChord(chordName));
              }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '10px 12px', marginBottom: 6,
                border: `1px solid ${T.border}`, borderLeft: `3px solid ${T.primary}`,
                background: T.bgCard, cursor: 'pointer',
              }}
            >
              <span style={{ fontFamily: 'var(--gc-mono)', fontSize: 10, color: T.primary, letterSpacing: '0.06em', marginRight: 10 }}>
                {pt.label}
              </span>
              <span style={{ fontSize: 11, color: T.textMuted }}>
                {chords.join(' – ')}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
