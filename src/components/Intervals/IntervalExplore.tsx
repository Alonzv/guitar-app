import { useState, useMemo } from 'react';
import { CHROMATIC, STANDARD_OPEN_MIDI, ALL_NOTES } from '../../utils/musicTheory';
import { IntervalNeck, strY, noteX, DOT_R, FB_H, FB_TOP, STR_SP } from './IntervalNeck';
import { playScale, playInterval } from '../../utils/audioPlayback';
import { T } from '../../theme';
import { Rule, PillRow, Cta, KeyGrid } from '../Transit/parts';
import { pillStyle } from '../Transit/styles';
import { previewMidi, previewInterval } from '../../utils/previewSound';
import { DiceButton } from '../DiceButton';
import { pickOne } from '../../utils/random';

interface IntervalInfo {
  semitones: number;
  name: string;
  abbrev: string;
  context: string;
}

const INTERVALS: IntervalInfo[] = [
  { semitones: 0,  name: 'Perfect Unison', abbrev: 'P1', context: 'Same note — the reference point, zero distance' },
  { semitones: 1,  name: 'Minor 2nd',      abbrev: 'm2', context: 'Chromatic semitone — dissonant, creates strong tension and pull' },
  { semitones: 2,  name: 'Major 2nd',      abbrev: 'M2', context: 'Whole step — the basic building block of major and minor scales' },
  { semitones: 3,  name: 'Minor 3rd',      abbrev: 'm3', context: 'Core of minor chords — dark, melancholic, essential in blues' },
  { semitones: 4,  name: 'Major 3rd',      abbrev: 'M3', context: 'Core of major chords — bright, happy, the "happy" sound' },
  { semitones: 5,  name: 'Perfect 4th',    abbrev: 'P4', context: 'Very consonant — common in sus4 chords and bass riffs' },
  { semitones: 6,  name: 'Tritone',        abbrev: 'TT', context: 'Aug 4th / Dim 5th — maximum tension, the "devil\'s interval"' },
  { semitones: 7,  name: 'Perfect 5th',    abbrev: 'P5', context: 'The power chord — most stable interval, used in rock/metal' },
  { semitones: 8,  name: 'Minor 6th',      abbrev: 'm6', context: 'Inversion of Major 3rd — adds colour in minor key harmony' },
  { semitones: 9,  name: 'Major 6th',      abbrev: 'M6', context: 'Warm and pleasant — found in 6th chords and pentatonic scales' },
  { semitones: 10, name: 'Minor 7th',      abbrev: 'm7', context: 'Essential in dominant 7th chords — the heart of blues and jazz' },
  { semitones: 11, name: 'Major 7th',      abbrev: 'M7', context: 'Leading tone — creates strong upward pull toward the tonic' },
  { semitones: 12, name: 'Perfect Octave', abbrev: 'P8', context: 'Same pitch class, doubled frequency — perfectly consonant' },
];

const CONSONANCE: Record<number, string> = {
  0: 'Perfect', 1: 'Dissonant', 2: 'Mild', 3: 'Consonant', 4: 'Consonant',
  5: 'Perfect', 6: 'Dissonant', 7: 'Perfect', 8: 'Consonant', 9: 'Consonant',
  10: 'Mild', 11: 'Mild', 12: 'Perfect',
};

const OPEN_MIDI = STANDARD_OPEN_MIDI;

type Area = 'full' | '1-4' | '5-8' | '9-12';
const AREAS: { id: Area; label: string; range: [number, number] }[] = [
  { id: 'full', label: 'Full',  range: [0, 12] },
  { id: '1-4',  label: '1–4',   range: [1, 4]  },
  { id: '5-8',  label: '5–8',   range: [5, 8]  },
  { id: '9-12', label: '9–12',  range: [9, 12] },
];

const BRACKET_EXTRA = 40;


function getPositions(note: string, fretRange: [number, number]) {
  const pc = CHROMATIC.indexOf(note);
  if (pc === -1) return [];
  const res: { string: number; fret: number }[] = [];
  for (let s = 0; s < 6; s++) {
    for (let f = fretRange[0]; f <= fretRange[1]; f++) {
      if ((OPEN_MIDI[s] + f) % 12 === pc) res.push({ string: s, fret: f });
    }
  }
  return res;
}


export function IntervalExplore() {
  const [root,     setRoot]     = useState('E');
  // Opens on a major third so the neck shows something from the first look.
  const [interval, setInterval] = useState<number | null>(4);
  const [area,     setArea]     = useState<Area>('full');
  const [mode,     setMode]     = useState<'melodic' | 'harmonic'>('melodic');

  const selectedInterval = interval !== null ? (INTERVALS.find(i => i.semitones === interval) ?? null) : null;
  const fretRange = AREAS.find(a => a.id === area)!.range;
  const rootMidi  = 60 + CHROMATIC.indexOf(root);
  const intervalMidi = interval !== null ? rootMidi + interval : rootMidi;

  const roll = () => {
    const r = pickOne(ALL_NOTES);
    const iv = pickOne(INTERVALS).semitones;
    setRoot(r); setInterval(iv); hear(r, iv);
  };

  // Every pick is heard: the root alone, or the root and its interval.
  const hear = (r: string, semis: number | null) => {
    const m = 60 + CHROMATIC.indexOf(r);
    if (semis === null) previewMidi(m);
    else previewInterval(m, m + semis, mode);
  };

  const handlePlay = () => {
    if (interval === null) return;
    if (mode === 'melodic') {
      playScale([rootMidi, intervalMidi]);
    } else {
      playInterval(rootMidi, intervalMidi, 'harmonic');
    }
  };

  const intervalNote = useMemo(() => {
    if (interval === null) return null;
    const pc = (CHROMATIC.indexOf(root) + interval) % 12;
    return CHROMATIC[pc];
  }, [root, interval]);

  const rootDots     = useMemo(() => getPositions(root, fretRange), [root, fretRange]);
  const intervalDots = useMemo(() => intervalNote ? getPositions(intervalNote, fretRange) : [], [intervalNote, fretRange]);

  const pairs = useMemo(() => {
    if (!intervalNote) return [];
    const res: { string: number; rootFret: number; intFret: number }[] = [];
    rootDots.forEach(r => {
      intervalDots.forEach(iv => {
        if (iv.string === r.string && r.fret !== iv.fret) {
          res.push({ string: r.string, rootFret: r.fret, intFret: iv.fret });
        }
      });
    });
    return res;
  }, [rootDots, intervalDots, intervalNote]);

  const bracketPair = pairs.length > 0 ? pairs[0] : null;
  const svgH = FB_H + (bracketPair ? BRACKET_EXTRA : 8);

  const dot = (fill: string, ink: string) => ({ fill, ink });
  const ROOT = dot(T.primary, T.onPrimary), IV = dot(T.secondary, T.white);
  const key = (fill: string) => (
    <span aria-hidden style={{ width: 12, height: 12, borderRadius: '50%', background: fill, display: 'inline-block' }} />
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {selectedInterval && intervalNote && (
        <>
          {/* The interval, as a poster */}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <p className="su-label" style={{ margin: '0 0 10px' }}>Interval from {root}</p>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
                <span className="su-poster gc-notation" style={{ fontSize: 96, textTransform: 'none' }}>{selectedInterval.abbrev}</span>
                <span className="su-semi" style={{ fontSize: 26, textTransform: 'uppercase', lineHeight: 1 }}>{selectedInterval.name}</span>
              </div>
              <p style={{ margin: '10px 0 0', fontSize: 11, fontFamily: 'var(--gc-mono)', letterSpacing: '0.08em', color: T.textMuted }}>
                {selectedInterval.semitones} SEMITONE{selectedInterval.semitones !== 1 ? 'S' : ''} · {CONSONANCE[selectedInterval.semitones].toUpperCase()} ·{' '}
                <b style={{ color: T.text }}>{root} → {intervalNote}</b>
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <PillRow label="Play mode" items={[{ id: 'melodic' as const, label: 'Mel' }, { id: 'harmonic' as const, label: 'Harm' }]}
                value={mode} onChange={setMode} />
              <Cta onClick={handlePlay}>Play ▶</Cta>
            </div>
          </div>

          {/* The neck */}
          <Rule label="On the neck">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
              <PillRow label="Area" items={AREAS.map(a => ({ id: a.id, label: a.label }))} value={area} onChange={setArea} />
              <div style={{ display: 'flex', gap: 14, fontSize: 10, fontFamily: 'var(--gc-mono)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{key(ROOT.fill)}Root</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{key(IV.fill)}Interval</span>
              </div>
            </div>
            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <IntervalNeck height={svgH} minWidth={520}>
                {pairs.map((p, i) => (
                  <line key={`conn-${i}`}
                    x1={noteX(p.rootFret)} y1={strY(p.string)}
                    x2={noteX(p.intFret)} y2={strY(p.string)}
                    stroke={T.text} strokeWidth={1.5} strokeDasharray="5 3" opacity={0.5} />
                ))}

                {intervalDots.map((p, i) => (
                  <g key={`iv-${i}`}>
                    <circle cx={noteX(p.fret)} cy={strY(p.string)} r={DOT_R} fill={IV.fill} />
                    <text x={noteX(p.fret)} y={strY(p.string)} dominantBaseline="central"
                      textAnchor="middle" fontSize={10} fill={IV.ink} fontWeight="700" fontFamily="var(--gc-mono)">{intervalNote}</text>
                  </g>
                ))}

                {rootDots.map((p, i) => (
                  <g key={`r-${i}`}>
                    <circle cx={noteX(p.fret)} cy={strY(p.string)} r={DOT_R} fill={ROOT.fill} />
                    <text x={noteX(p.fret)} y={strY(p.string)} dominantBaseline="central"
                      textAnchor="middle" fontSize={10} fill={ROOT.ink} fontWeight="700" fontFamily="var(--gc-mono)">{root}</text>
                  </g>
                ))}

                {/* The distance: a 2px ink bracket under the neck, labelled in mono */}
                {bracketPair && (() => {
                  const x1   = noteX(bracketPair.rootFret);
                  const x2   = noteX(bracketPair.intFret);
                  const bY   = FB_TOP + 5 * STR_SP + 18;
                  const bH   = 7;
                  const xL   = Math.min(x1, x2);
                  const xR   = Math.max(x1, x2);
                  const cX   = (xL + xR) / 2;
                  const frets = Math.abs(bracketPair.intFret - bracketPair.rootFret);
                  const lbl  = `${selectedInterval.name.toUpperCase()} · ${frets} FRET${frets !== 1 ? 'S' : ''}`;
                  return (
                    <g>
                      <path d={`M${xL} ${bY} V${bY + bH} H${xR} V${bY}`} fill="none" stroke={T.text} strokeWidth={2} />
                      <text x={cX} y={bY + bH + 12} textAnchor="middle" fontSize={8.5}
                        fill={T.text} fontFamily="var(--gc-mono)" letterSpacing="0.14em">{lbl}</text>
                    </g>
                  );
                })()}
              </IntervalNeck>
            </div>
          </Rule>
        </>
      )}

      {/* Interval keys */}
      <Rule label="Interval">
        <KeyGrid cols={7} label="Interval" value={interval}
          items={INTERVALS.map(iv => ({ id: iv.semitones, label: iv.abbrev, title: iv.name }))}
          onChange={semis => { const sel = semis === interval; setInterval(sel ? null : semis); if (!sel) hear(root, semis); }} />
      </Rule>

      {/* Root keys */}
      <Rule label="Root note" right={<DiceButton onRoll={roll} style={pillStyle(false, 'sm')} />}>
        <KeyGrid label="Root note" value={root} items={ALL_NOTES.map(n => ({ id: n, label: n }))}
          onChange={n => { setRoot(n); hear(n, interval); }} />
      </Rule>
    </div>
  );
}
