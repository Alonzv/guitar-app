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

type Func = 'tonic' | 'subdominant' | 'dominant';
type Mode = 'major' | 'minor';

const MAJOR_ROMANS = ['I','ii','iii','IV','V','vi','vii°'] as const;
const MINOR_ROMANS = ['i','ii°','III','iv','v','VI','VII'] as const;
const MAJOR_FUNCS: Func[] = ['tonic','subdominant','tonic','subdominant','dominant','tonic','dominant'];
const MINOR_FUNCS: Func[] = ['tonic','subdominant','tonic','subdominant','dominant','subdominant','dominant'];

const FUNC_COLOR: Record<Func, string> = {
  tonic:       T.primary,
  subdominant: '#5C5650',
  dominant:    T.secondary,
};

interface HLInfo { chord: string; roman: string; func: Func }

// Compute outer/inner ring highlights from CoF position + mode.
// Uses Key.majorKey(COF_ORDER[P]) as the relative-major basis for both modes.
function computeHighlights(cofIdx: number, mode: Mode) {
  const outer = new Map<number, HLInfo>();
  const inner = new Map<number, HLInfo>();
  const P = cofIdx;
  const t = Key.majorKey(COF_ORDER[P]).triads;

  if (mode === 'major') {
    outer.set(P,          { chord: t[0], roman: 'I',    func: 'tonic'       });
    outer.set((P+11)%12,  { chord: t[3], roman: 'IV',   func: 'subdominant' });
    outer.set((P+1)%12,   { chord: t[4], roman: 'V',    func: 'dominant'    });
    inner.set(P,          { chord: t[5], roman: 'vi',   func: 'tonic'       });
    inner.set((P+11)%12,  { chord: t[1], roman: 'ii',   func: 'subdominant' });
    inner.set((P+1)%12,   { chord: t[2], roman: 'iii',  func: 'tonic'       });
    inner.set((P+2)%12,   { chord: t[6], roman: 'vii°', func: 'dominant'    });
  } else {
    inner.set(P,          { chord: t[5], roman: 'i',    func: 'tonic'       });
    inner.set((P+11)%12,  { chord: t[1], roman: 'iv',   func: 'subdominant' });
    inner.set((P+1)%12,   { chord: t[2], roman: 'v',    func: 'dominant'    });
    inner.set((P+2)%12,   { chord: t[6], roman: 'ii°',  func: 'subdominant' });
    outer.set(P,          { chord: t[0], roman: 'III',  func: 'tonic'       });
    outer.set((P+11)%12,  { chord: t[3], roman: 'VI',   func: 'subdominant' });
    outer.set((P+1)%12,   { chord: t[4], roman: 'VII',  func: 'dominant'    });
  }
  return { outerMap: outer, innerMap: inner };
}

const PROG_TEMPLATES = [
  { label: 'I – V – vi – IV', indices: [0, 4, 5, 3] },
  { label: 'I – vi – IV – V', indices: [0, 5, 3, 4] },
  { label: 'ii – V – I',      indices: [1, 4, 0]    },
  { label: 'I – IV – V – I',  indices: [0, 3, 4, 0] },
];

// ── Geometry ───────────────────────────────────────────────────────────────────
const SIZE   = 380;
const CX     = SIZE / 2;
const CY     = SIZE / 2;
const R_O_O  = 180;
const R_O_I  = 124;
const R_I_O  = 120;
const R_I_I  = 70;
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

// Conversion maps
const SHARP_TO_COF:   Record<string, string> = { 'C#':'Db', 'D#':'Eb', 'G#':'Ab', 'A#':'Bb' };
const FLAT_TO_SHARP:  Record<string, string> = { 'Db':'C#', 'Eb':'D#', 'Ab':'G#', 'Bb':'A#' };
// D# → Ebm and A# → Bbm because COF_MINOR uses flat spelling for those
const SHARP_TO_MINOR: Record<string, string> = { 'D#': 'Ebm', 'A#': 'Bbm' };

interface Props {
  onAddToProgression?: (item: ChordInProgression) => void;
  desktop?: boolean;
}

export const ChordWheel: React.FC<Props> = ({ onAddToProgression, desktop }) => {
  const [root, setRoot] = useState<string>('C');
  const [mode, setMode] = useState<Mode>('major');

  // CoF position index (0-11)
  const cofRoot  = COF_ORDER.includes(root) ? root : (SHARP_TO_COF[root] ?? root);
  const cofIdx   = mode === 'major'
    ? COF_ORDER.indexOf(cofRoot)
    : COF_MINOR.indexOf(SHARP_TO_MINOR[root] ?? (root + 'm'));

  const { outerMap, innerMap } = computeHighlights(Math.max(0, cofIdx), mode);

  // Diatonic chord list based on mode
  const diatonic = (() => {
    if (mode === 'major') {
      return Key.majorKey(cofRoot).triads.map((chord, i) => ({
        chord, roman: MAJOR_ROMANS[i], func: MAJOR_FUNCS[i],
      }));
    }
    return Key.minorKey(root).natural.triads.map((chord, i) => ({
      chord, roman: MINOR_ROMANS[i], func: MINOR_FUNCS[i],
    }));
  })();

  const byFunc = {
    tonic:       diatonic.filter(c => c.func === 'tonic'),
    subdominant: diatonic.filter(c => c.func === 'subdominant'),
    dominant:    diatonic.filter(c => c.func === 'dominant'),
  };

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

  const startAngle = (i: number) => -Math.PI / 2 - SLICE / 2 + i * SLICE;

  const wheelSvg = (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ display: 'block', width: '100%', maxWidth: SIZE }}>
      <g style={{
        transform: `rotate(${rotationDeg}deg)`,
        transformOrigin: `${CX}px ${CY}px`,
        transformBox: 'view-box',
        transition: 'transform 0.7s cubic-bezier(0.37, 0, 0.63, 1)',
        willChange: 'transform',
      } as React.CSSProperties}>
        {Array.from({ length: TOTAL }, (_, i) => {
          const sa        = startAngle(i);
          const outerInfo = outerMap.get(i);
          const innerInfo = innerMap.get(i);
          const oFill     = outerInfo ? FUNC_COLOR[outerInfo.func] : '#E4E0D8';
          const iFill     = innerInfo ? FUNC_COLOR[innerInfo.func] : '#EAE7E2';
          const oOpacity  = outerInfo ? 1 : 0.35;
          const iOpacity  = innerInfo ? 1 : 0.25;
          const mp_o      = midPt(sa, (R_O_O + R_O_I) / 2);
          const mp_i      = midPt(sa, (R_I_O + R_I_I) / 2);
          const textRot   = -rotationDeg;

          // Root names for click handlers
          const cofNote       = COF_ORDER[i];
          const selectRoot    = ALL_ROOTS.includes(cofNote) ? cofNote : (FLAT_TO_SHARP[cofNote] ?? cofNote);
          const minorName     = COF_MINOR[i];
          const minorRootCof  = minorName.slice(0, -1); // strip 'm'
          const minorSelectRoot = ALL_ROOTS.includes(minorRootCof) ? minorRootCof : (FLAT_TO_SHARP[minorRootCof] ?? minorRootCof);

          return (
            <g key={i}>
              {/* Outer arc — tap to set major key */}
              <path
                d={arcPath(sa, R_O_O, R_O_I)} fill={oFill} opacity={oOpacity}
                stroke={mode === 'major' && i === cofIdx ? '#fff' : 'none'}
                strokeWidth={mode === 'major' && i === cofIdx ? 1.5 : 0}
                style={{ cursor: 'pointer' }}
                onClick={() => { setMode('major'); setRoot(selectRoot); }}
              />
              {/* Inner arc — tap to set minor key */}
              <path
                d={arcPath(sa, R_I_O, R_I_I)} fill={iFill} opacity={iOpacity}
                stroke={mode === 'minor' && i === cofIdx ? '#fff' : 'none'}
                strokeWidth={mode === 'minor' && i === cofIdx ? 1.5 : 0}
                style={{ cursor: 'pointer' }}
                onClick={() => { setMode('minor'); setRoot(minorSelectRoot); }}
              />

              {/* Outer text group — counter-rotated to stay upright */}
              <g
                transform={`rotate(${textRot} ${mp_o.x} ${mp_o.y})`}
                style={{ pointerEvents: 'none' }}
              >
                <text
                  x={mp_o.x} y={outerInfo ? mp_o.y - 4 : mp_o.y}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={outerInfo ? 11 : 9} fontWeight={outerInfo ? 700 : 400}
                  fill={outerInfo ? '#fff' : '#9C958C'}
                >
                  {cofNote}
                </text>
                {outerInfo && (
                  <text
                    x={mp_o.x} y={mp_o.y + 6}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize={7} fontWeight={500}
                    fill="rgba(255,255,255,0.75)"
                  >
                    {outerInfo.roman}
                  </text>
                )}
              </g>

              {/* Inner text group — counter-rotated to stay upright */}
              <g
                transform={`rotate(${textRot} ${mp_i.x} ${mp_i.y})`}
                style={{ pointerEvents: 'none' }}
              >
                <text
                  x={mp_i.x} y={innerInfo ? mp_i.y - 4 : mp_i.y}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={innerInfo ? 9 : 8} fontWeight={innerInfo ? 600 : 400}
                  fill={innerInfo ? '#fff' : '#9C958C'}
                >
                  {minorName}
                </text>
                {innerInfo && (
                  <text
                    x={mp_i.x} y={mp_i.y + 6}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize={6} fontWeight={500}
                    fill="rgba(255,255,255,0.75)"
                  >
                    {innerInfo.roman}
                  </text>
                )}
              </g>
            </g>
          );
        })}
      </g>

      {/* Dashed arc indicator — fixed at top, outer ring for major / inner for minor */}
      {cofIdx >= 0 && (() => {
        const arcR = mode === 'major' ? R_O_O + 8 : R_I_I - 8;
        const sa   = -Math.PI / 2 - SLICE / 2 - 0.04;
        const ea   = -Math.PI / 2 + SLICE / 2 + 0.04;
        const p1   = polar(sa, arcR);
        const p2   = polar(ea, arcR);
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
        fill={T.textDim} fontFamily="var(--gc-mono)" letterSpacing="0.1em">
        {mode === 'major' ? 'MAJOR' : 'minor'}
      </text>
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

  const COMPACT_CHORD = (c: typeof diatonic[0]) => (
    <div key={c.chord} style={{
      display: 'flex', alignItems: 'center', padding: '8px 10px',
      background: T.bgCard, border: `1px solid ${T.border}`,
      borderLeft: `3px solid ${FUNC_COLOR[c.func]}`, gap: 6,
    }}>
      <span style={{ fontFamily: 'var(--gc-mono)', fontSize: 8, color: T.textDim, minWidth: 20, letterSpacing: '0.06em' }}>
        {c.roman}
      </span>
      <span style={{ fontSize: 13, fontWeight: 700, color: T.text, flex: 1 }}>
        {c.chord}
      </span>
      <button
        onClick={() => handlePlayChord(c.chord)}
        style={{ padding: '2px 6px', border: `1px solid ${T.border}`, background: 'transparent',
          color: T.textMuted, fontSize: 9, cursor: 'pointer' }}
      >
        &#9654;
      </button>
      {onAddToProgression && (
        <button
          onClick={() => handleAddChord(c.chord)}
          style={{ padding: '2px 6px', border: `1px solid ${T.primary}`, background: 'transparent',
            color: T.primary, fontSize: 9, cursor: 'pointer' }}
        >
          +
        </button>
      )}
    </div>
  );

  // Chord data panel (shared between mobile/desktop)
  const chordDataPanel = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Function legend */}
      <div style={{ display: 'flex', gap: 12, fontSize: 10, fontFamily: 'var(--gc-mono)', letterSpacing: '0.06em' }}>
        {(['tonic', 'subdominant', 'dominant'] as Func[]).map(f => (
          <span key={f} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 8, height: 8, background: FUNC_COLOR[f], display: 'inline-block' }} />
            <span style={{ color: T.textMuted, textTransform: 'uppercase' }}>{f.slice(0, 4)}</span>
          </span>
        ))}
      </div>

      <div>
        <p style={MONO_LBL}>Tonic</p>
        {byFunc.tonic.map(CHORD_ROW)}
      </div>
      <div>
        <p style={MONO_LBL}>Subdominant</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 4 }}>
          {byFunc.subdominant.map(COMPACT_CHORD)}
        </div>
      </div>
      <div>
        <p style={MONO_LBL}>Dominant</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 4 }}>
          {byFunc.dominant.map(COMPACT_CHORD)}
        </div>
      </div>

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

  // Wheel + controls panel
  const wheelPanel = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Key picker — compact on mobile */}
      <div>
        <p style={MONO_LBL}>Key</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: desktop ? 4 : 3 }}>
          {ALL_ROOTS.map(n => {
            const sharp = n.includes('#');
            const sel   = n === root;
            return (
              <button key={n} onClick={() => setRoot(n)} style={{
                padding: desktop ? '9px 2px' : '6px 2px', borderRadius: 0, cursor: 'pointer',
                fontSize: sharp ? (desktop ? 10 : 9) : (desktop ? 12 : 11), fontWeight: sel ? 700 : 400,
                border: `1px solid ${sel ? T.primary : T.border}`,
                background: sel ? T.primary : sharp ? T.bgInput : T.bgCard,
                color: sel ? '#fff' : sharp ? T.textMuted : T.text,
                borderTop: `3px solid ${sel ? T.primary : 'transparent'}`,
              }}>{n}</button>
            );
          })}
        </div>
      </div>

      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <span
          style={{
            padding: '4px 10px', fontSize: 10,
            fontFamily: 'var(--gc-mono)', letterSpacing: '0.08em',
            background: mode === 'major' ? T.primary : 'transparent',
            color: mode === 'major' ? '#fff' : T.textMuted,
            border: `1px solid ${mode === 'major' ? T.primary : T.border}`,
            cursor: 'pointer',
          }}
          onClick={() => setMode('major')}
        >
          MAJOR
        </span>
        <span
          style={{
            padding: '4px 10px', fontSize: 10,
            fontFamily: 'var(--gc-mono)', letterSpacing: '0.08em',
            background: mode === 'minor' ? T.secondary : 'transparent',
            color: mode === 'minor' ? '#fff' : T.textMuted,
            border: `1px solid ${mode === 'minor' ? T.secondary : T.border}`,
            cursor: 'pointer',
          }}
          onClick={() => setMode('minor')}
        >
          minor
        </span>
      </div>

      {/* Wheel */}
      <div style={{ width: '100%' }}>
        <p style={{ ...MONO_LBL, marginBottom: 6 }}>
          Chord Wheel · {root} {mode === 'major' ? 'Major' : 'minor'}
        </p>
        <div style={{ width: '100%', maxWidth: desktop ? SIZE : 300, margin: desktop ? undefined : '0 auto' }}>
          {wheelSvg}
        </div>
        {!desktop && (
          <p style={{ fontSize: 9, color: T.textDim, fontFamily: 'var(--gc-mono)', marginTop: 6, letterSpacing: '0.06em' }}>
            TAP OUTER RING FOR MAJOR · INNER FOR MINOR
          </p>
        )}
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {desktop ? (
        <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start' }}>
          <div style={{ flexShrink: 0, width: SIZE + 20 }}>
            {wheelPanel}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {chordDataPanel}
          </div>
        </div>
      ) : (
        <>
          {wheelPanel}
          {chordDataPanel}
        </>
      )}
    </div>
  );
};
