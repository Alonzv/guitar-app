import { useState } from 'react';
import { fretToNote, STANDARD_OPEN_MIDI } from '../../utils/musicTheory';
import { playScale, getSharedContext, unlockAudio } from '../../utils/audioPlayback';
import { T, card } from '../../theme';

const OPEN_MIDI = STANDARD_OPEN_MIDI;

interface Point { string: number; fret: number }

const INTERVAL_NAMES: Record<number, { name: string; abbrev: string }> = {
  0:  { name: 'Unison',       abbrev: 'P1' },
  1:  { name: 'Minor 2nd',   abbrev: 'm2' },
  2:  { name: 'Major 2nd',   abbrev: 'M2' },
  3:  { name: 'Minor 3rd',   abbrev: 'm3' },
  4:  { name: 'Major 3rd',   abbrev: 'M3' },
  5:  { name: 'Perfect 4th', abbrev: 'P4' },
  6:  { name: 'Tritone',     abbrev: 'TT' },
  7:  { name: 'Perfect 5th', abbrev: 'P5' },
  8:  { name: 'Minor 6th',   abbrev: 'm6' },
  9:  { name: 'Major 6th',   abbrev: 'M6' },
  10: { name: 'Minor 7th',   abbrev: 'm7' },
  11: { name: 'Major 7th',   abbrev: 'M7' },
  12: { name: 'Octave',      abbrev: 'P8' },
};

// ── Fretboard geometry ────────────────────────────────────────────────────────
const FB_W = 340, FB_H = 120;
const NUT = 24;
const FRET_SP = (FB_W - NUT - 8) / 12;
const STR_SP = (FB_H - 20) / 5;
const FB_TOP = 10;
const FRET_MARKERS = [3, 5, 7, 9, 12];

const strY = (s: number) => FB_TOP + (5 - s) * STR_SP;
const noteX = (f: number) => f === 0 ? NUT - 10 : NUT + (f - 0.5) * FRET_SP;
// Click cell bounds
const cellX = (f: number) => f === 0 ? 0 : NUT + (f - 1) * FRET_SP;
const cellW = (f: number) => f === 0 ? NUT : FRET_SP;

function fretMidi(p: Point) { return OPEN_MIDI[p.string] + p.fret; }

function calcSemitones(a: Point, b: Point, inverted: boolean): number {
  const midiA = fretMidi(a), midiB = fretMidi(b);
  const diff = inverted ? midiA - midiB : midiB - midiA;
  const abs = Math.abs(midiB - midiA);
  if (abs === 12) return 12;
  return ((diff % 12) + 12) % 12;
}

function playHarmonic(midi1: number, midi2: number) {
  unlockAudio();
  const ctx = getSharedContext();
  const go = () => {
    const t = ctx.currentTime + 0.05;
    [midi1, midi2].forEach(midi => {
      const freq = 440 * Math.pow(2, (midi - 69) / 12);
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.22, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 1.8);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 1.8);
    });
  };
  if (ctx.state === 'running') go();
  else ctx.resume().then(go).catch(() => {});
}

export function IntervalCalculate() {
  const [points,   setPoints]   = useState<Point[]>([]);
  const [inverted, setInverted] = useState(false);
  const [mode,     setMode]     = useState<'melodic' | 'harmonic'>('melodic');

  const handleClick = (s: number, f: number) => {
    setPoints(prev => {
      // Remove if same position already placed
      if (prev.some(p => p.string === s && p.fret === f)) {
        return prev.filter(p => !(p.string === s && p.fret === f));
      }
      // Keep max 2: drop oldest if already 2
      const next = prev.length >= 2 ? [prev[1], { string: s, fret: f }] : [...prev, { string: s, fret: f }];
      return next;
    });
    setInverted(false);
  };

  const has2 = points.length === 2;
  const rootPt = has2 ? (inverted ? points[1] : points[0]) : null;
  const semitones = has2 ? calcSemitones(points[0], points[1], inverted) : null;
  const intervalInfo = semitones !== null ? (INTERVAL_NAMES[semitones] ?? INTERVAL_NAMES[semitones % 12]) : null;

  const handlePlay = () => {
    if (!has2) return;
    const [m1, m2] = [fretMidi(points[0]), fretMidi(points[1])];
    const [lo, hi] = m1 <= m2 ? [m1, m2] : [m2, m1];
    if (mode === 'harmonic') playHarmonic(lo, hi);
    else playScale([lo, hi]);
  };

  const dotColor = (p: Point) => {
    if (!has2) return T.primary;
    if (rootPt && p.string === rootPt.string && p.fret === rootPt.fret) return T.primary;
    return T.secondary;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* Instruction */}
      <div style={card({ padding: '7px 12px' })}>
        <p style={{ margin: 0, fontSize: 11, color: T.textMuted, lineHeight: 1.4 }}>
          Tap any two frets to calculate the interval. Tap again to deselect.
        </p>
      </div>

      {/* Result panel */}
      <div style={{
        ...card({ padding: '10px 12px' }),
        minHeight: 68, display: 'flex', flexDirection: 'column', justifyContent: 'center',
      }}>
        {has2 && intervalInfo ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 2 }}>
                  {fretToNote(points[inverted ? 1 : 0].string, points[inverted ? 1 : 0].fret)}
                  {' → '}
                  {fretToNote(points[inverted ? 0 : 1].string, points[inverted ? 0 : 1].fret)}
                </div>
                <div style={{ fontSize: 28, fontWeight: 900, color: T.secondary, lineHeight: 1 }}>
                  {intervalInfo.abbrev}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginTop: 2 }}>
                  {intervalInfo.name}
                </div>
                <div style={{ fontSize: 10, color: T.textMuted, marginTop: 1 }}>
                  {semitones} semitone{semitones !== 1 ? 's' : ''}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-end' }}>
                {/* Invert */}
                <button onClick={() => setInverted(v => !v)} style={{
                  padding: '4px 10px', borderRadius: 0, cursor: 'pointer', fontSize: 10, fontWeight: 700,
                  border: `1px solid ${T.border}`, background: inverted ? T.primaryBg : T.bgInput,
                  color: inverted ? T.primary : T.textMuted, boxShadow: 'var(--gc-offset-sm)',
                }}>↕ Invert</button>

                {/* Mode toggle */}
                <div style={{ display: 'flex', borderRadius: 7, overflow: 'hidden', border: `1px solid ${T.border}` }}>
                  {(['melodic', 'harmonic'] as const).map(m => (
                    <button key={m} onClick={() => setMode(m)} style={{
                      padding: '3px 7px', border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 600,
                      background: mode === m ? T.secondary : T.bgInput,
                      color: mode === m ? '#fff' : T.textMuted,
                    }}>{m === 'melodic' ? '♩♩' : '♫'}</button>
                  ))}
                </div>

                {/* Play */}
                <button onClick={handlePlay} style={{
                  padding: '4px 12px', borderRadius: 0, cursor: 'pointer', fontSize: 11, fontWeight: 700,
                  border: `1px solid ${T.secondary}`, background: T.secondaryBg, color: T.secondary,
                  boxShadow: 'var(--gc-offset-sm)',
                }}>▶ Play</button>
              </div>
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center', color: T.textDim, fontSize: 12 }}>
            {points.length === 0 ? 'Select two notes on the fretboard' : 'Select one more note…'}
          </div>
        )}
      </div>

      {/* Interactive fretboard */}
      <div style={card({ padding: '9px 10px 8px' })}>
        <div style={{ overflowX: 'auto' }}>
          <svg viewBox={`0 0 ${FB_W} ${FB_H}`} style={{ display: 'block', width: '100%', minWidth: 260 }}>

            {/* Fret position markers */}
            {FRET_MARKERS.map(f => (
              <circle key={f} cx={NUT + (f - 0.5) * FRET_SP}
                cy={FB_TOP + 2.5 * STR_SP}
                r={4} fill={T.border} opacity={0.35}
              />
            ))}

            {/* Fret lines */}
            {Array.from({ length: 13 }).map((_, i) => (
              <line key={i}
                x1={NUT + i * FRET_SP} y1={FB_TOP}
                x2={NUT + i * FRET_SP} y2={FB_TOP + 5 * STR_SP}
                stroke={i === 0 ? T.text : T.border}
                strokeWidth={i === 0 ? 3 : 1} opacity={i === 0 ? 0.6 : 0.8}
              />
            ))}

            {/* Strings */}
            {Array.from({ length: 6 }).map((_, s) => (
              <line key={s}
                x1={NUT} y1={strY(s)} x2={NUT + 12 * FRET_SP} y2={strY(s)}
                stroke={T.textMuted}
                strokeWidth={0.7 + (5 - s) * 0.28}
                opacity={0.5}
              />
            ))}

            {/* Fret numbers */}
            {[3, 5, 7, 9, 12].map(f => (
              <text key={f} x={NUT + (f - 0.5) * FRET_SP} y={FB_H - 1}
                textAnchor="middle" fontSize={7} fill={T.textDim}>{f}</text>
            ))}

            {/* Clickable cells (invisible, covers whole board) */}
            {Array.from({ length: 6 }).map((_, s) =>
              Array.from({ length: 13 }).map((_, f) => (
                <rect
                  key={`cell-${s}-${f}`}
                  x={cellX(f)} y={strY(s) - STR_SP / 2}
                  width={cellW(f)} height={STR_SP}
                  fill="transparent"
                  style={{ cursor: 'pointer' }}
                  onClick={() => handleClick(s, f)}
                />
              ))
            )}

            {/* Placed dots */}
            {points.map((p, i) => {
              const color = dotColor(p);
              const note  = fretToNote(p.string, p.fret);
              return (
                <g key={`dot-${i}`}>
                  <circle cx={noteX(p.fret)} cy={strY(p.string)} r={9}
                    fill={color} opacity={0.92} style={{ pointerEvents: 'none' }} />
                  <text x={noteX(p.fret)} y={strY(p.string) + 3.5}
                    textAnchor="middle" fontSize={6} fill="#fff" fontWeight="700"
                    style={{ pointerEvents: 'none' }}>
                    {note}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Clear button */}
        {points.length > 0 && (
          <div style={{ textAlign: 'right', marginTop: 6 }}>
            <button onClick={() => { setPoints([]); setInverted(false); }} style={{
              padding: '3px 10px', borderRadius: 0, border: `1px solid ${T.border}`,
              background: 'transparent', color: T.textMuted, fontSize: 10, cursor: 'pointer',
              boxShadow: 'var(--gc-offset-sm)',
            }}>Clear</button>
          </div>
        )}
      </div>

      {/* Mode description */}
      <div style={{ display: 'flex', gap: 10, fontSize: 9, color: T.textDim }}>
        <span><strong style={{ color: T.textMuted }}>♩♩ Melodic</strong> — low then high</span>
        <span><strong style={{ color: T.textMuted }}>♫ Harmonic</strong> — both together</span>
      </div>
    </div>
  );
}
