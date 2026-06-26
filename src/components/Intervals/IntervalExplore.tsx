import { useState, useMemo } from 'react';
import { CHROMATIC, STANDARD_OPEN_MIDI, ALL_NOTES } from '../../utils/musicTheory';
import { playScale, getSharedContext, getOutputNode, unlockAudio } from '../../utils/audioPlayback';
import { T, card } from '../../theme';

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

const FB_W = 580, FB_H = 165;
const NUT = 44;
const FRET_SP = (FB_W - NUT - 16) / 12;
const STR_SP = (FB_H - 30) / 5;
const FB_TOP = 12;
const DOT_R = 9;
const BRACKET_EXTRA = 30;

const strY = (s: number) => FB_TOP + (5 - s) * STR_SP;
const noteX = (f: number) => f === 0 ? NUT - 14 : NUT + (f - 0.5) * FRET_SP;

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

const MONO_LBL: React.CSSProperties = {
  margin: '0 0 8px', fontSize: 10, color: '#9C958C',
  fontFamily: 'var(--gc-mono)', letterSpacing: '0.14em', textTransform: 'uppercase',
};

export function IntervalExplore() {
  const [root,     setRoot]     = useState('E');
  const [interval, setInterval] = useState<number | null>(null);
  const [area,     setArea]     = useState<Area>('full');
  const [mode,     setMode]     = useState<'melodic' | 'harmonic'>('melodic');

  const selectedInterval = interval !== null ? (INTERVALS.find(i => i.semitones === interval) ?? null) : null;
  const fretRange = AREAS.find(a => a.id === area)!.range;
  const rootMidi  = 60 + CHROMATIC.indexOf(root);
  const intervalMidi = interval !== null ? rootMidi + interval : rootMidi;

  const handlePlay = () => {
    if (interval === null) return;
    if (mode === 'melodic') {
      playScale([rootMidi, intervalMidi]);
    } else {
      const ctx = getSharedContext();
      unlockAudio().then(() => {
        const t = ctx.currentTime + 0.05;
        [rootMidi, intervalMidi].forEach(midi => {
          const freq = 440 * Math.pow(2, (midi - 69) / 12);
          const osc  = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0.2, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 1.8);
          osc.connect(gain); gain.connect(getOutputNode());
          osc.start(t); osc.stop(t + 1.8);
        });
      });
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Root picker */}
      <div>
        <p style={MONO_LBL}>Root Note</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4 }}>
          {ALL_NOTES.map(n => {
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

      {/* Interval chips */}
      <div>
        <p style={MONO_LBL}>Interval</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {INTERVALS.map(iv => {
            const sel = iv.semitones === interval;
            return (
              <button
                key={iv.semitones}
                onClick={() => setInterval(sel ? null : iv.semitones)}
                style={{
                  padding: '8px 4px', borderRadius: 0, cursor: 'pointer',
                  border: `1px solid ${sel ? T.primary : T.border}`,
                  background: sel ? T.primary : T.bgCard,
                  color: sel ? '#fff' : T.textMuted,
                  fontSize: 11, fontFamily: 'var(--gc-mono)', letterSpacing: '0.04em',
                  fontWeight: sel ? 700 : 400,
                  borderTop: `2px solid ${sel ? T.primary : 'transparent'}`,
                }}
              >
                {iv.abbrev}
              </button>
            );
          })}
        </div>
      </div>

      {selectedInterval && intervalNote && (
        <>
          {/* Result card */}
          <div style={{ ...card({ padding: '12px 16px' }), borderLeft: `4px solid ${T.primary}` }}>
            <p style={{ ...MONO_LBL, margin: '0 0 8px' }}>Interval from {root}</p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 30, fontWeight: 900, color: T.primary, fontFamily: 'var(--gc-mono)', lineHeight: 1 }}>
                {selectedInterval.abbrev}
              </span>
              <span style={{ fontSize: 16, fontWeight: 600, color: T.text }}>
                {selectedInterval.name}
              </span>
            </div>
            <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 10 }}>
              {selectedInterval.semitones} semitone{selectedInterval.semitones !== 1 ? 's' : ''}
              {' · '}
              {CONSONANCE[selectedInterval.semitones]}
              {'  ·  '}
              <span style={{ fontWeight: 600, color: T.text }}>{root} → {intervalNote}</span>
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
          </div>

          {/* Fretboard */}
          <div style={{ background: 'var(--gc-fretboard-bg)', padding: '10px 10px 6px', border: `1px solid ${T.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, gap: 6 }}>
              <span style={{ fontSize: 10, fontFamily: 'var(--gc-mono)', letterSpacing: '0.14em', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', marginRight: 4 }}>On the Neck</span>
              {AREAS.map(a => (
                <button key={a.id} onClick={() => setArea(a.id)} style={{
                  padding: '2px 8px', borderRadius: 0, cursor: 'pointer',
                  fontSize: 9, fontFamily: 'var(--gc-mono)', letterSpacing: '0.08em',
                  background: area === a.id ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.1)',
                  color: area === a.id ? '#1A1818' : 'rgba(255,255,255,0.65)',
                  border: 'none', borderLeft: '2px solid var(--gc-bar-color)',
                }}>{a.label}</button>
              ))}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, fontSize: 9, alignItems: 'center' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#CC1C1C', display: 'inline-block' }} />
                  <span style={{ color: 'rgba(255,255,255,0.7)' }}>Root</span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#16110F', display: 'inline-block', border: '1px solid rgba(255,255,255,0.3)' }} />
                  <span style={{ color: 'rgba(255,255,255,0.7)' }}>Interval</span>
                </span>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <svg viewBox={`0 0 ${FB_W} ${svgH}`} style={{ display: 'block', width: '100%', minWidth: 300 }}>
                <rect x={0} y={0} width={FB_W} height={svgH} fill="var(--gc-fretboard-bg)" />

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

                {[3, 5, 7, 9, 12].map(f => (
                  <text key={f} x={NUT + (f - 0.5) * FRET_SP} y={FB_TOP + 5 * STR_SP + 10}
                    textAnchor="middle" fontSize={8} fill="var(--gc-fretboard-pos)">{f}</text>
                ))}

                {pairs.map((p, i) => (
                  <line key={`conn-${i}`}
                    x1={noteX(p.rootFret)} y1={strY(p.string)}
                    x2={noteX(p.intFret)} y2={strY(p.string)}
                    stroke="#CC1C1C" strokeWidth={1.5} strokeDasharray="5 3" opacity={0.7} />
                ))}

                {intervalDots.map((p, i) => (
                  <g key={`iv-${i}`}>
                    <circle cx={noteX(p.fret)} cy={strY(p.string)} r={DOT_R} fill="#16110F" />
                    <text x={noteX(p.fret)} y={strY(p.string) + 3.5}
                      textAnchor="middle" fontSize={6} fill="#fff" fontWeight="700">{intervalNote}</text>
                  </g>
                ))}

                {rootDots.map((p, i) => (
                  <g key={`r-${i}`}>
                    <circle cx={noteX(p.fret)} cy={strY(p.string)} r={DOT_R} fill="#CC1C1C" />
                    <text x={noteX(p.fret)} y={strY(p.string) + 3.5}
                      textAnchor="middle" fontSize={6} fill="#fff" fontWeight="700">{root}</text>
                  </g>
                ))}

                {bracketPair && (() => {
                  const x1   = noteX(bracketPair.rootFret);
                  const x2   = noteX(bracketPair.intFret);
                  const bY   = FB_TOP + 5 * STR_SP + 14;
                  const bH   = 6;
                  const xL   = Math.min(x1, x2);
                  const xR   = Math.max(x1, x2);
                  const cX   = (xL + xR) / 2;
                  const frets = Math.abs(bracketPair.intFret - bracketPair.rootFret);
                  const lbl  = `${selectedInterval.name.toUpperCase()} · ${frets} FRET${frets !== 1 ? 'S' : ''}`;
                  return (
                    <g>
                      <line x1={xL} y1={bY} x2={xL} y2={bY + bH} stroke="#CC1C1C" strokeWidth={1.5} />
                      <line x1={xL} y1={bY + bH} x2={xR} y2={bY + bH} stroke="#CC1C1C" strokeWidth={1.5} />
                      <line x1={xR} y1={bY} x2={xR} y2={bY + bH} stroke="#CC1C1C" strokeWidth={1.5} />
                      <text x={cX} y={bY + bH + 11} textAnchor="middle" fontSize={7}
                        fill="#CC1C1C" fontFamily="monospace" letterSpacing="0.08em">{lbl}</text>
                    </g>
                  );
                })()}
              </svg>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
