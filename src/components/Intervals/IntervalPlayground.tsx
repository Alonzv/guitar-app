import { useState, useMemo } from 'react';
import type { FretPosition } from '../../types/music';
import { STANDARD_OPEN_MIDI, fretToNote } from '../../utils/musicTheory';
import { playMidi, playInterval } from '../../utils/audioPlayback';
import { T, card } from '../../theme';

// ── Free-play interval area ──────────────────────────────────────────────────
// The user taps notes directly on a 12-fret neck. Each tap sounds the note and
// shows its name. Once two notes are down, we name the interval between the two
// ACTUAL pitches (octave-aware, from real MIDI) — so an E on the low string and
// a G high up read as a Minor 10th, not a Minor 3rd. Third tap rolls the pair:
// the oldest note drops so there are never more than two.

const A_COLOR = '#110CF0';       // first note — matches Note A elsewhere
const B_COLOR = T.primary;       // second note

// Fretboard geometry — mirrors the Explore/Calculate necks for visual parity.
const FB_W = 580, FB_H = 165;
const NUT = 44;
const FRET_SP = (FB_W - NUT - 16) / 12;
const STR_SP = (FB_H - 30) / 5;
const FB_TOP = 12;
const DOT_R = 12;

const strY = (s: number) => FB_TOP + (5 - s) * STR_SP;
const noteX = (f: number) => f === 0 ? NUT - 14 : NUT + (f - 0.5) * FRET_SP;
const midiAt = (p: FretPosition) => STANDARD_OPEN_MIDI[p.string] + p.fret;

const MONO_LBL: React.CSSProperties = {
  margin: '0 0 8px', fontSize: 10, color: '#9C958C',
  fontFamily: 'var(--gc-mono)', letterSpacing: '0.14em', textTransform: 'uppercase',
};

// ── Octave-aware interval naming ─────────────────────────────────────────────
const ORDINALS = [
  '', 'Unison', '2nd', '3rd', '4th', '5th', '6th', '7th', 'Octave',
  '9th', '10th', '11th', '12th', '13th', '14th', '15th',
  '16th', '17th', '18th', '19th', '20th', '21st', '22nd',
];
const ordinal = (n: number) => ORDINALS[n] ?? `${n}th`;

// Per pitch-class step (0–11): base degree number, quality + short prefix, feel.
const SIMPLE: Record<number, { deg: number; quality: string; short: string; cons: string }> = {
  0:  { deg: 1, quality: 'Perfect', short: 'P', cons: 'Perfect' },
  1:  { deg: 2, quality: 'Minor',   short: 'm', cons: 'Dissonant' },
  2:  { deg: 2, quality: 'Major',   short: 'M', cons: 'Mild' },
  3:  { deg: 3, quality: 'Minor',   short: 'm', cons: 'Consonant' },
  4:  { deg: 3, quality: 'Major',   short: 'M', cons: 'Consonant' },
  5:  { deg: 4, quality: 'Perfect', short: 'P', cons: 'Perfect' },
  7:  { deg: 5, quality: 'Perfect', short: 'P', cons: 'Perfect' },
  8:  { deg: 6, quality: 'Minor',   short: 'm', cons: 'Consonant' },
  9:  { deg: 6, quality: 'Major',   short: 'M', cons: 'Consonant' },
  10: { deg: 7, quality: 'Minor',   short: 'm', cons: 'Mild' },
  11: { deg: 7, quality: 'Major',   short: 'M', cons: 'Mild' },
};

interface IntervalDesc { name: string; abbrev: string; cons: string; semitones: number }

function describeInterval(dRaw: number): IntervalDesc {
  const d = Math.abs(dRaw);
  const octaves = Math.floor(d / 12);
  const rem = d % 12;

  // Whole octaves — Unison / Octave / Double Octave / …
  if (rem === 0) {
    const deg = octaves * 7 + 1;
    const name = octaves === 0 ? 'Unison'
      : octaves === 1 ? 'Octave'
      : octaves === 2 ? 'Double Octave'
      : ordinal(deg);
    return { name, abbrev: `P${deg}`, cons: 'Perfect', semitones: d };
  }

  // Tritone and its compounds (aug 4th / aug 11th …)
  if (rem === 6) {
    const deg = 4 + octaves * 7;
    return {
      name: octaves === 0 ? 'Tritone' : `Augmented ${ordinal(deg)}`,
      abbrev: octaves === 0 ? 'TT' : `A${deg}`,
      cons: 'Dissonant', semitones: d,
    };
  }

  const base = SIMPLE[rem];
  const deg = base.deg + octaves * 7;
  return {
    name: `${base.quality} ${ordinal(deg)}`,
    abbrev: `${base.short}${deg}`,
    cons: base.cons,
    semitones: d,
  };
}

const CONS_COLOR: Record<string, string> = {
  Perfect: T.primary, Consonant: T.secondary, Mild: '#6B655C', Dissonant: '#9C958C',
};

export function IntervalPlayground() {
  // Selected positions in tap order; length 0–2 (rolling pair).
  const [selected, setSelected] = useState<FretPosition[]>([]);
  const [mode, setMode] = useState<'melodic' | 'harmonic'>('melodic');

  const toggle = (pos: FretPosition) => {
    navigator.vibrate?.(30);
    playMidi(midiAt(pos));
    setSelected(prev => {
      const idx = prev.findIndex(p => p.string === pos.string && p.fret === pos.fret);
      if (idx >= 0) return prev.filter((_, i) => i !== idx); // tap again to clear
      const next = [...prev, pos];
      if (next.length > 2) next.shift();                     // roll the pair
      return next;
    });
  };

  const a = selected[0] ?? null;
  const b = selected[1] ?? null;

  const desc = useMemo<IntervalDesc | null>(() => {
    if (!a || !b) return null;
    return describeInterval(midiAt(a) - midiAt(b));
  }, [a, b]);

  const noteName = (p: FretPosition | null) => p ? fretToNote(p.string, p.fret) : '';

  const handlePlay = () => {
    if (!a || !b) return;
    playInterval(midiAt(a), midiAt(b), mode);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ ...MONO_LBL, margin: 0 }}>
        Tap any two notes on the neck to hear them and name the interval
      </p>

      {/* Result card — appears with two notes; placeholder otherwise */}
      <div style={{ ...card({ padding: '12px 16px' }), borderLeft: `4px solid ${desc ? T.primary : T.border}`, minHeight: 64 }}>
        {a && b && desc ? (
          <>
            <p style={{ ...MONO_LBL, margin: '0 0 6px' }}>{noteName(a)} → {noteName(b)}</p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 30, fontWeight: 900, color: T.primary, fontFamily: 'var(--gc-mono)', lineHeight: 1 }}>
                {desc.abbrev}
              </span>
              <span style={{ fontSize: 16, fontWeight: 600, color: T.text }}>{desc.name}</span>
            </div>
            <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 10 }}>
              {desc.semitones} semitone{desc.semitones !== 1 ? 's' : ''}
              {'  ·  '}
              <span style={{ color: CONS_COLOR[desc.cons] ?? T.textMuted, fontWeight: 600 }}>{desc.cons}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ display: 'flex', overflow: 'hidden', border: `1px solid ${T.border}` }}>
                {(['melodic', 'harmonic'] as const).map(m => (
                  <button key={m} onClick={() => setMode(m)} style={{
                    padding: '5px 10px', border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 600,
                    background: mode === m ? T.secondary : T.bgInput,
                    color: mode === m ? '#fff' : T.textMuted,
                  }}>{m === 'melodic' ? 'MEL' : 'HARM'}</button>
                ))}
              </div>
              <button onClick={handlePlay} style={{
                padding: '5px 14px', borderRadius: 0, cursor: 'pointer', fontSize: 11, fontWeight: 600,
                border: `1px solid ${T.secondary}`, background: 'transparent', color: T.secondary,
                borderLeft: '3px solid var(--gc-bar-color)',
              }}>PLAY</button>
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center', color: T.textDim, fontSize: 12, padding: '8px 0' }}>
            {selected.length === 0 ? 'Tap a note on the neck to start' : 'Tap a second note to see the interval'}
          </div>
        )}
      </div>

      {/* Interactive neck */}
      <div style={{ background: 'var(--gc-fretboard-bg)', padding: '10px 10px 6px', border: `1px solid ${T.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 9 }}>
          <span style={{ fontSize: 10, fontFamily: 'var(--gc-mono)', letterSpacing: '0.14em', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', marginRight: 4 }}>On the Neck</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: A_COLOR, display: 'inline-block' }} />
            <span style={{ color: 'rgba(255,255,255,0.7)' }}>1st</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: B_COLOR, display: 'inline-block', border: '1px solid rgba(255,255,255,0.3)' }} />
            <span style={{ color: 'rgba(255,255,255,0.7)' }}>2nd</span>
          </span>
          {selected.length > 0 && (
            <button onClick={() => setSelected([])} style={{
              marginLeft: 'auto', padding: '2px 8px', borderRadius: 0, cursor: 'pointer',
              fontSize: 9, fontFamily: 'var(--gc-mono)', letterSpacing: '0.08em',
              background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.65)',
              border: 'none', borderLeft: '2px solid var(--gc-bar-color)',
            }}>CLEAR</button>
          )}
        </div>

        <div style={{ overflowX: 'auto' }}>
          <svg viewBox={`0 0 ${FB_W} ${FB_H + 6}`} style={{ display: 'block', width: '100%', minWidth: 300, userSelect: 'none' }}>
            <rect x={0} y={0} width={FB_W} height={FB_H + 6} fill="var(--gc-fretboard-bg)" />

            {[3, 5, 7, 9].map(f => (
              <circle key={f} cx={NUT + (f - 0.5) * FRET_SP} cy={FB_TOP + 2.5 * STR_SP}
                r={5} fill="var(--gc-fretboard-pos)" />
            ))}
            <circle cx={NUT + 11.5 * FRET_SP} cy={FB_TOP + 1 * STR_SP} r={4} fill="var(--gc-fretboard-pos)" />
            <circle cx={NUT + 11.5 * FRET_SP} cy={FB_TOP + 4 * STR_SP} r={4} fill="var(--gc-fretboard-pos)" />

            {Array.from({ length: 13 }).map((_, i) => (
              <line key={i}
                x1={NUT + i * FRET_SP} y1={FB_TOP}
                x2={NUT + i * FRET_SP} y2={FB_TOP + 5 * STR_SP}
                stroke="var(--gc-fretboard-fret)" strokeWidth={2} />
            ))}

            <rect x={NUT - 6} y={FB_TOP} width={6} height={5 * STR_SP} fill="var(--gc-fretboard-nut)" />

            {Array.from({ length: 6 }).map((_, s) => (
              <line key={s}
                x1={NUT} y1={strY(s)} x2={NUT + 12 * FRET_SP} y2={strY(s)}
                stroke="var(--gc-fretboard-str)" strokeWidth={0.8 + (5 - s) * 0.32} />
            ))}

            {/* Open-string note names, left of the nut */}
            {Array.from({ length: 6 }).map((_, s) => (
              <text key={`open-${s}`} x={NUT - 30} y={strY(s) + 3.5}
                textAnchor="middle" fontSize={9} fill="rgba(255,255,255,0.45)">
                {fretToNote(s, 0)}
              </text>
            ))}

            {[3, 5, 7, 9, 12].map(f => (
              <text key={f} x={NUT + (f - 0.5) * FRET_SP} y={FB_TOP + 5 * STR_SP + 10}
                textAnchor="middle" fontSize={8} fill="var(--gc-fretboard-pos)">{f}</text>
            ))}

            {/* Connector between the two chosen notes */}
            {a && b && (
              <line x1={noteX(a.fret)} y1={strY(a.string)} x2={noteX(b.fret)} y2={strY(b.string)}
                stroke={A_COLOR} strokeWidth={1.5} strokeDasharray="5 3" opacity={0.7} />
            )}

            {/* Selected dots */}
            {selected.map((p, i) => (
              <g key={`sel-${i}`}>
                <circle cx={noteX(p.fret)} cy={strY(p.string)} r={DOT_R}
                  fill={i === 0 ? A_COLOR : B_COLOR} stroke="#fff" strokeWidth={1.5} />
                <text x={noteX(p.fret)} y={strY(p.string)} dominantBaseline="central"
                  textAnchor="middle" fontSize={10} fill="#fff" fontWeight="700">
                  {fretToNote(p.string, p.fret)}
                </text>
              </g>
            ))}

            {/* Clickable cells over every string/fret (drawn last, transparent so
                the dots below stay visible; tapping an active cell deselects). */}
            {Array.from({ length: 6 }).map((_, s) =>
              Array.from({ length: 13 }).map((_, f) => (
                <rect key={`hit-${s}-${f}`}
                  x={noteX(f) - DOT_R - 2} y={strY(s) - DOT_R - 2}
                  width={(DOT_R + 2) * 2} height={(DOT_R + 2) * 2}
                  fill="transparent" style={{ cursor: 'pointer' }}
                  onClick={() => toggle({ string: s, fret: f })} />
              ))
            )}
          </svg>
        </div>
      </div>
    </div>
  );
}
