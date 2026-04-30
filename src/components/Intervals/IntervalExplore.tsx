import { useState, useMemo } from 'react';
import { CHROMATIC, STANDARD_OPEN_MIDI, ALL_NOTES } from '../../utils/musicTheory';
import { T, card } from '../../theme';

const OPEN_MIDI = STANDARD_OPEN_MIDI;

interface IntervalInfo {
  semitones: number;
  name: string;
  abbrev: string;
  context: string;
}

const INTERVALS: IntervalInfo[] = [
  { semitones: 1,  name: 'Minor 2nd',   abbrev: 'm2', context: 'Chromatic semitone — dissonant, creates strong tension and pull' },
  { semitones: 2,  name: 'Major 2nd',   abbrev: 'M2', context: 'Whole step — the basic building block of major and minor scales' },
  { semitones: 3,  name: 'Minor 3rd',   abbrev: 'm3', context: 'Core of minor chords — dark, melancholic, essential in blues' },
  { semitones: 4,  name: 'Major 3rd',   abbrev: 'M3', context: 'Core of major chords — bright, happy, the "happy" sound' },
  { semitones: 5,  name: 'Perfect 4th', abbrev: 'P4', context: 'Very consonant — common in sus4 chords and bass riffs' },
  { semitones: 6,  name: 'Tritone',     abbrev: 'TT', context: 'Maximum tension — the "devil\'s interval", drives resolution' },
  { semitones: 7,  name: 'Perfect 5th', abbrev: 'P5', context: 'The power chord — most stable interval, used in rock/metal' },
];

type Area = 'full' | '1-4' | '5-8' | '9-12';
const AREAS: { id: Area; label: string; range: [number, number] }[] = [
  { id: 'full', label: 'Full Neck', range: [0, 12] },
  { id: '1-4',  label: '1–4',      range: [1, 4]  },
  { id: '5-8',  label: '5–8',      range: [5, 8]  },
  { id: '9-12', label: '9–12',     range: [9, 12] },
];

// ── Fretboard geometry ────────────────────────────────────────────────────────
const FB_W = 340, FB_H = 120;
const NUT = 24;
const FRET_SP = (FB_W - NUT - 8) / 12;
const STR_SP = (FB_H - 20) / 5;
const FB_TOP = 10;
const FRET_MARKERS = [3, 5, 7, 9, 12];

const strY = (s: number) => FB_TOP + (5 - s) * STR_SP;
const noteX = (f: number) => f === 0 ? NUT - 10 : NUT + (f - 0.5) * FRET_SP;

function notePitchClass(note: string): number {
  return CHROMATIC.indexOf(note);
}

function getPositions(note: string, fretRange: [number, number]) {
  const pc = notePitchClass(note);
  if (pc === -1) return [];
  const result: { string: number; fret: number }[] = [];
  for (let s = 0; s < 6; s++) {
    for (let f = fretRange[0]; f <= fretRange[1]; f++) {
      if ((OPEN_MIDI[s] + f) % 12 === pc) result.push({ string: s, fret: f });
    }
  }
  return result;
}

export function IntervalExplore() {
  const [root,     setRoot]     = useState('E');
  const [interval, setInterval] = useState(7); // Perfect 5th default
  const [area,     setArea]     = useState<Area>('full');

  const selectedInterval = INTERVALS.find(i => i.semitones === interval) ?? INTERVALS[6];
  const fretRange = AREAS.find(a => a.id === area)!.range;

  const intervalNote = useMemo(() => {
    const pc = (notePitchClass(root) + interval) % 12;
    return CHROMATIC[pc];
  }, [root, interval]);

  const rootDots     = useMemo(() => getPositions(root,         fretRange), [root, fretRange]);
  const intervalDots = useMemo(() => getPositions(intervalNote, fretRange), [intervalNote, fretRange]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* Root selector */}
      <div style={card({ padding: '10px 12px' })}>
        <p style={{ margin: '0 0 6px', fontSize: 10, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Root Note</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4 }}>
          {ALL_NOTES.map(n => {
            const sharp = n.includes('#');
            const sel   = n === root;
            return (
              <button key={n} onClick={() => setRoot(n)} style={{
                padding: '5px 3px', borderRadius: 7, cursor: 'pointer',
                fontSize: sharp ? 9 : 11, fontWeight: sel ? 700 : 400,
                border: sel ? `2px solid ${T.primary}` : `2px solid transparent`,
                background: sel ? T.primaryBg : sharp ? T.bgInput : T.bgCard,
                color: sel ? T.primary : sharp ? T.textMuted : T.text,
                transition: 'all 0.12s',
              }}>{n}</button>
            );
          })}
        </div>
      </div>

      {/* Interval selector */}
      <div style={card({ padding: '10px 12px' })}>
        <p style={{ margin: '0 0 6px', fontSize: 10, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Interval</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
          {INTERVALS.map(iv => {
            const sel = iv.semitones === interval;
            return (
              <button key={iv.semitones} onClick={() => setInterval(iv.semitones)} style={{
                padding: '5px 4px', borderRadius: 7, cursor: 'pointer', textAlign: 'center',
                border: sel ? `2px solid ${T.secondary}` : `1px solid ${T.border}`,
                background: sel ? T.secondaryBg : T.bgInput,
                color: sel ? T.secondary : T.textMuted,
                transition: 'all 0.12s',
              }}>
                <div style={{ fontSize: 9, fontWeight: 700 }}>{iv.abbrev}</div>
                <div style={{ fontSize: 9, fontWeight: sel ? 700 : 400, marginTop: 1 }}>{iv.name}</div>
              </button>
            );
          })}
        </div>

        {/* Musical context */}
        <div style={{
          marginTop: 7, padding: '6px 8px', borderRadius: 7,
          background: T.bgDeep, border: `1px solid ${T.secondary}44`,
        }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: T.secondary }}>{selectedInterval.name} · {selectedInterval.semitones} semitone{selectedInterval.semitones !== 1 ? 's' : ''}</span>
          <p style={{ margin: '2px 0 0', fontSize: 10, color: T.textMuted, lineHeight: 1.35 }}>
            {selectedInterval.context}
          </p>
        </div>
      </div>

      {/* Fretboard + area filter */}
      <div style={card({ padding: '9px 10px 8px' })}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: T.textMuted }}>Area:</span>
            {AREAS.map(a => (
              <button key={a.id} onClick={() => setArea(a.id)} style={{
                padding: '2px 7px', borderRadius: 10, cursor: 'pointer', fontSize: 10, fontWeight: 600,
                background: area === a.id ? T.text : T.bgInput,
                color: area === a.id ? T.bgDeep : T.textMuted,
                border: area === a.id ? 'none' : `1px solid ${T.border}`,
              }}>{a.label}</button>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 6, fontSize: 10 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: T.primary, display: 'inline-block' }} />
            <span style={{ color: T.textMuted }}>{root} (root)</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: T.secondary, display: 'inline-block' }} />
            <span style={{ color: T.textMuted }}>{intervalNote} ({selectedInterval.abbrev})</span>
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <svg viewBox={`0 0 ${FB_W} ${FB_H}`} style={{ display: 'block', width: '100%', minWidth: 260 }}>

            {/* Fret position markers (dots on board) */}
            {FRET_MARKERS.map(f => (
              <circle key={f} cx={NUT + (f - 0.5) * FRET_SP}
                cy={FB_TOP + 2.5 * STR_SP + (f === 12 ? 0 : 0)}
                r={f === 12 ? 3 : 4} fill={T.border} opacity={0.4}
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

            {/* Fret number labels */}
            {[3, 5, 7, 9, 12].map(f => (
              <text key={f} x={NUT + (f - 0.5) * FRET_SP} y={FB_H - 1}
                textAnchor="middle" fontSize={7} fill={T.textDim}>{f}</text>
            ))}

            {/* Interval dots */}
            {intervalDots.map((p, i) => (
              <g key={`iv-${i}`}>
                <circle cx={noteX(p.fret)} cy={strY(p.string)} r={8} fill={T.secondary} opacity={0.88} />
                <text x={noteX(p.fret)} y={strY(p.string) + 3.5}
                  textAnchor="middle" fontSize={6} fill="#fff" fontWeight="700">
                  {intervalNote}
                </text>
              </g>
            ))}

            {/* Root dots (drawn on top) */}
            {rootDots.map((p, i) => (
              <g key={`r-${i}`}>
                <circle cx={noteX(p.fret)} cy={strY(p.string)} r={8} fill={T.primary} opacity={0.92} />
                <text x={noteX(p.fret)} y={strY(p.string) + 3.5}
                  textAnchor="middle" fontSize={6} fill="#fff" fontWeight="700">
                  {root}
                </text>
              </g>
            ))}
          </svg>
        </div>
      </div>
    </div>
  );
}
