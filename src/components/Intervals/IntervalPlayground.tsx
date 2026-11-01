import { useState, useMemo } from 'react';
import type { FretPosition } from '../../types/music';
import { fretToNote } from '../../utils/musicTheory';
import { IntervalNeck, strY, noteX, midiAt, DOT_R, FB_H, FB_TOP, STR_SP } from './IntervalNeck';
import { playMidi, playInterval } from '../../utils/audioPlayback';
import { T } from '../../theme';
import { PlayButton, TextBtn } from '../ChordBuilder/Stage';
import { useLang } from '../../contexts/LanguageContext';
import { heName, CONS_LABEL, semisLabel, fretsLabel, Segment, IntervalStage, legendDot, type Cons } from './names';

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


export function IntervalPlayground({ desktop }: { desktop?: boolean }) {
  const { lang } = useLang();
  const he = lang === 'he';
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
  const handlePlay = () => { if (a && b) playInterval(midiAt(a), midiAt(b), mode); };

  const bracket = a && b && a.fret !== b.fret && desc ? { from: Math.min(a.fret, b.fret), to: Math.max(a.fret, b.fret) } : null;

  const neck = (
    <div style={{ borderRadius: 26, background: T.bgCard, padding: desktop ? '18px 20px' : '16px 14px', display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 40 }}>
        <div style={{ display: 'flex', gap: 16 }}>
          {legendDot(A_COLOR, he ? 'תו ראשון' : 'First note')}
          {legendDot(B_COLOR, he ? 'תו שני' : 'Second note')}
        </div>
        {selected.length > 0 && <TextBtn onClick={() => setSelected([])}>{he ? 'ניקוי' : 'Clear'}</TextBtn>}
      </div>
      <div dir="ltr" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {/* Wider than a phone so each fret is a comfortable target; it scrolls. */}
        <IntervalNeck showOpenNotes width={desktop ? '100%' : '140%'} minWidth={460} height={FB_H + 40}>
          {a && b && (
            <line x1={noteX(a.fret)} y1={strY(a.string)} x2={noteX(b.fret)} y2={strY(b.string)}
              stroke={T.text} strokeWidth={1.5} strokeDasharray="5 3" opacity={0.5} />
          )}
          {selected.map((p, i) => (
            <g key={`sel-${i}`}>
              <circle cx={noteX(p.fret)} cy={strY(p.string)} r={DOT_R} fill={i === 0 ? A_COLOR : B_COLOR} />
              <text x={noteX(p.fret)} y={strY(p.string)} dominantBaseline="central"
                textAnchor="middle" fontSize={10} fill={i === 0 ? T.onPrimary : T.white} fontWeight="700">
                {fretToNote(p.string, p.fret)}
              </text>
            </g>
          ))}
          {bracket && (() => {
            const xL = noteX(bracket.from), xR = noteX(bracket.to), bY = FB_TOP + 5 * STR_SP + 18;
            return (
              <g>
                <path d={`M${xL} ${bY} V${bY + 7} H${xR} V${bY}`} fill="none" stroke={T.text} strokeWidth={2} strokeLinejoin="round" />
                <text x={(xL + xR) / 2} y={bY + 21} textAnchor="middle" fontSize={11} fontWeight="600" fill={T.text}
                  style={{ direction: he ? 'rtl' : 'ltr', unicodeBidi: 'plaintext' }}>
                  {fretsLabel(bracket.to - bracket.from, he)}
                </text>
              </g>
            );
          })()}
          {/* Transparent tap targets over every string and fret, drawn last. */}
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
    </div>
  );

  // The answer, under the neck so the neck never moves while you tap.
  const result = (
    <div style={{ minHeight: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18 }}>
      {a && b && desc ? (
        <>
          <IntervalStage desktop={desktop} abbrev={desc.abbrev} name={he ? heName(desc.semitones) : desc.name}
            kicker={<bdi dir="ltr">{noteName(a)} → {noteName(b)}</bdi>}
            line={<>{semisLabel(desc.semitones, he)} · {CONS_LABEL[desc.cons as Cons][lang]}</>} />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' }}>
            <PlayButton onPlay={handlePlay} label={he ? 'נגן' : 'Play'} />
            <Segment label={he ? 'איך לנגן' : 'How to play'} value={mode} onChange={setMode}
              items={[{ id: 'melodic', label: he ? 'אחד אחרי השני' : 'One by one' }, { id: 'harmonic', label: he ? 'ביחד' : 'Together' }]} />
          </div>
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center' }}>
          <h2 style={{ margin: 0, fontFamily: 'var(--su-display)', fontSize: desktop ? 34 : 28, lineHeight: 1.2, fontWeight: 700, letterSpacing: '-0.02em', color: a ? T.text : T.textMuted }}>
            {a ? (he ? 'עכשיו תו שני' : 'Now a second note') : (he ? 'הקישו על תו בצוואר' : 'Tap a note on the neck')}
          </h2>
          <span className="su-sub" style={{ fontSize: 15 }}>
            {he ? 'שני תווים, ונגיד לכם מה המרחק ביניהם' : 'Two notes, and we name the distance between them'}
          </span>
        </div>
      )}
    </div>
  );

  return (
    <div className="su-in" style={{ display: 'flex', flexDirection: 'column', gap: desktop ? 24 : 22, maxWidth: desktop ? 900 : undefined, margin: '0 auto', width: '100%' }}>
      {neck}
      {result}
    </div>
  );
}
