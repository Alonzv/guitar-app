import { useState, useMemo } from 'react';
import type { FretPosition } from '../../types/music';
import { fretToNote } from '../../utils/musicTheory';
import { IntervalNeck, strY, noteX, midiAt, DOT_R, FB_H, FB_TOP, STR_SP } from './IntervalNeck';
import { playMidi, playInterval } from '../../utils/audioPlayback';
import { T } from '../../theme';
import { Rule, Pill, PillRow, Cta } from '../Transit/parts';

// ── Free-play interval area ──────────────────────────────────────────────────
// The user taps notes directly on a 12-fret neck. Each tap sounds the note and
// shows its name. Once two notes are down, we name the interval between the two
// ACTUAL pitches (octave-aware, from real MIDI) — so an E on the low string and
// a G high up read as a Minor 10th, not a Minor 3rd. Third tap rolls the pair:
// the oldest note drops so there are never more than two.

const A_COLOR = T.primary;       // first note — the one cobalt mark
const B_COLOR = T.secondary;     // second note, in ink

// Fretboard geometry — mirrors the Explore/Calculate necks for visual parity.



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

// Quality in ink only: the stable intervals in ink, the restless ones grey.
const CONS_COLOR: Record<string, string> = {
  Perfect: T.text, Consonant: T.text, Mild: T.textMuted, Dissonant: T.textMuted,
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

  const bracket = a && b && a.fret !== b.fret && desc ? { from: Math.min(a.fret, b.fret), to: Math.max(a.fret, b.fret) } : null;
  const legend = (fill: string, label: string) => (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span aria-hidden style={{ width: 12, height: 12, borderRadius: '50%', background: fill, display: 'inline-block' }} />{label}
    </span>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Interactive neck — kept above the result (order 1) so it doesn't
          shift down when the result grows. */}
      <Rule style={{ order: 1 }} label="Tap any two notes on the neck" right={selected.length > 0
        ? <Pill size="sm" onClick={() => setSelected([])}>Clear</Pill> : undefined}>
        <div style={{ display: 'flex', gap: 14, fontSize: 10, fontFamily: 'var(--gc-mono)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
          {legend(A_COLOR, '1st')}{legend(B_COLOR, '2nd')}
        </div>
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {/* 40% larger than the container so it reads clearly; overflow scrolls
              horizontally (string names stay pinned to the left of the board). */}
          <IntervalNeck showOpenNotes width="140%" minWidth={460} height={FB_H + 40}>
            {/* Connector between the two chosen notes */}
            {a && b && (
              <line x1={noteX(a.fret)} y1={strY(a.string)} x2={noteX(b.fret)} y2={strY(b.string)}
                stroke={T.text} strokeWidth={1.5} strokeDasharray="5 3" opacity={0.5} />
            )}

            {/* Selected dots */}
            {selected.map((p, i) => (
              <g key={`sel-${i}`}>
                <circle cx={noteX(p.fret)} cy={strY(p.string)} r={DOT_R}
                  fill={i === 0 ? A_COLOR : B_COLOR} stroke={T.bgDeep} strokeWidth={1.5} />
                <text x={noteX(p.fret)} y={strY(p.string)} dominantBaseline="central"
                  textAnchor="middle" fontSize={10} fill={i === 0 ? T.onPrimary : T.white} fontWeight="700" fontFamily="var(--gc-mono)">
                  {fretToNote(p.string, p.fret)}
                </text>
              </g>
            ))}

            {/* The distance: a 2px ink bracket under the neck, labelled in mono */}
            {bracket && desc && (() => {
              const xL = noteX(bracket.from), xR = noteX(bracket.to), bY = FB_TOP + 5 * STR_SP + 18;
              const frets = bracket.to - bracket.from;
              return (
                <g>
                  <path d={`M${xL} ${bY} V${bY + 7} H${xR} V${bY}`} fill="none" stroke={T.text} strokeWidth={2} />
                  <text x={(xL + xR) / 2} y={bY + 19} textAnchor="middle" fontSize={8.5} fill={T.text}
                    fontFamily="var(--gc-mono)" letterSpacing="0.14em">
                    {`${desc.name.toUpperCase()} · ${frets} FRET${frets !== 1 ? 'S' : ''}`}
                  </text>
                </g>
              );
            })()}

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
          </IntervalNeck>
        </div>
      </Rule>

      {/* The result — appears with two notes; a prompt otherwise. */}
      <Rule style={{ order: 2, minHeight: 64 }}>
        {a && b && desc ? (
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <p className="su-label" style={{ margin: '0 0 10px' }}>{noteName(a)} → {noteName(b)}</p>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
                <span className="su-poster gc-notation" style={{ fontSize: 96, textTransform: 'none' }}>{desc.abbrev}</span>
                <span className="su-semi" style={{ fontSize: 26, textTransform: 'uppercase', lineHeight: 1 }}>{desc.name}</span>
              </div>
              <p style={{ margin: '10px 0 0', fontSize: 11, fontFamily: 'var(--gc-mono)', letterSpacing: '0.08em', color: T.textMuted }}>
                {desc.semitones} SEMITONE{desc.semitones !== 1 ? 'S' : ''} ·{' '}
                <b style={{ color: CONS_COLOR[desc.cons] ?? T.textMuted }}>{desc.cons.toUpperCase()}</b>
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <PillRow label="Play mode" items={[{ id: 'melodic' as const, label: 'Mel' }, { id: 'harmonic' as const, label: 'Harm' }]}
                value={mode} onChange={setMode} />
              <Cta onClick={handlePlay}>Play ▶</Cta>
            </div>
          </div>
        ) : (
          <p className="su-label" style={{ margin: 0, padding: '14px 0' }}>
            {selected.length === 0 ? 'Tap a note on the neck to start' : 'Tap a second note to see the interval'}
          </p>
        )}
      </Rule>
    </div>
  );
}
