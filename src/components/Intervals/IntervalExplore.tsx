import { useState, useMemo } from 'react';
import { CHROMATIC, STANDARD_OPEN_MIDI, ALL_NOTES } from '../../utils/musicTheory';
import { playScale, getSharedContext, unlockAudio } from '../../utils/audioPlayback';
import { T, card } from '../../theme';

const OPEN_MIDI = STANDARD_OPEN_MIDI;

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
  const [root,         setRoot]         = useState('E');
  const [interval,     setInterval]     = useState<number | null>(null);
  const [intervalOpen, setIntervalOpen] = useState(false);
  const [area,         setArea]         = useState<Area>('full');
  const [mode,         setMode]         = useState<'melodic' | 'harmonic'>('melodic');

  const selectedInterval = interval !== null ? (INTERVALS.find(i => i.semitones === interval) ?? null) : null;
  const fretRange = AREAS.find(a => a.id === area)!.range;

  // MIDI 60 = C4; derive root MIDI from chromatic index
  const rootMidi     = 60 + CHROMATIC.indexOf(root);
  const intervalMidi = interval !== null ? rootMidi + interval : rootMidi;

  const handlePlay = () => {
    if (interval === null) return;
    unlockAudio();
    if (mode === 'melodic') {
      playScale([rootMidi, intervalMidi]);
    } else {
      const ctx = getSharedContext();
      const go = () => {
        const t = ctx.currentTime + 0.05;
        [rootMidi, intervalMidi].forEach(midi => {
          const freq = 440 * Math.pow(2, (midi - 69) / 12);
          const osc  = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0.2, t);
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
  };

  const intervalNote = useMemo(() => {
    if (interval === null) return null;
    const pc = (notePitchClass(root) + interval) % 12;
    return CHROMATIC[pc];
  }, [root, interval]);

  const rootDots     = useMemo(() => getPositions(root,               fretRange), [root, fretRange]);
  const intervalDots = useMemo(() => intervalNote ? getPositions(intervalNote, fretRange) : [], [intervalNote, fretRange]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* Root selector */}
      <div style={card({ padding: '10px 12px' })}>
        <p style={{ margin: '0 0 6px', fontSize: 10, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '-0.02em' }}>Root Note</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4 }}>
          {ALL_NOTES.map(n => {
            const sharp = n.includes('#');
            const sel   = n === root;
            return (
              <button key={n} onClick={() => setRoot(n)} style={{
                padding: '9px 4px', borderRadius: 0, cursor: 'pointer',
                fontSize: sharp ? 11 : 13, fontWeight: sel ? 500 : 400,
                border: sel ? `2px solid ${T.primary}` : `2px solid transparent`,
                background: sel ? T.primaryBg : sharp ? T.bgInput : T.bgCard,
                color: sel ? T.primary : sharp ? T.textMuted : T.text,
                transition: 'all 0.12s', borderLeft: '3px solid var(--gc-bar-color)',
              }}>{n}</button>
            );
          })}
        </div>
      </div>

      {/* Interval selector — collapsible */}
      <div>
        <button
          onClick={() => setIntervalOpen(o => !o)}
          style={{
            width: '100%', padding: '11px 16px', borderRadius: 0, cursor: 'pointer',
            background: '#1235FC', color: '#fff',
            fontSize: 13, fontWeight: 400, textAlign: 'left',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            borderLeft: '3px solid var(--gc-bar-color)',
          }}
        >
          <span>
            <span style={{ opacity: 0.6, fontSize: 11, fontWeight: 400, marginRight: 8, textTransform: 'uppercase', letterSpacing: '-0.02em' }}>Interval</span>
            {selectedInterval ? `${selectedInterval.abbrev} · ${selectedInterval.name}` : '— Select —'}
          </span>
          <span style={{ fontSize: 11 }}>{intervalOpen ? '▲' : '▼'}</span>
        </button>

        {intervalOpen && (
          <div style={{ ...card({ padding: '10px 12px' }), marginTop: 2 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
              {INTERVALS.map(iv => {
                const sel = iv.semitones === interval;
                return (
                  <button key={iv.semitones} onClick={() => { setInterval(iv.semitones); setIntervalOpen(false); }} style={{
                    padding: '5px 4px', borderRadius: 0, cursor: 'pointer', textAlign: 'center',
                    border: sel ? `2px solid ${T.secondary}` : `1px solid ${T.border}`,
                    background: sel ? T.secondaryBg : T.bgInput,
                    color: sel ? T.secondary : T.textMuted,
                    transition: 'all 0.12s', borderLeft: '3px solid var(--gc-bar-color)',
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 400 }}>{iv.abbrev}</div>
                    <div style={{ fontSize: 11, fontWeight: sel ? 500 : 400, marginTop: 1 }}>{iv.name}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Context + play + fretboard — only when interval selected */}
      {selectedInterval && intervalNote && <>
        <div style={card({ padding: '8px 12px' })}>
          <div style={{
            padding: '6px 8px', borderRadius: 0,
            background: T.bgDeep, border: `1px solid ${T.secondary}44`, marginBottom: 8,
          }}>
            <span style={{ fontSize: 10, fontWeight: 400, color: T.secondary }}>{selectedInterval.name} · {selectedInterval.semitones} semitone{selectedInterval.semitones !== 1 ? 's' : ''}</span>
            <p style={{ margin: '2px 0 0', fontSize: 10, color: T.textMuted, lineHeight: 1.35 }}>
              {selectedInterval.context}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ display: 'flex', borderRadius: 0, overflow: 'hidden', border: `1px solid ${T.border}` }}>
              {(['melodic', 'harmonic'] as const).map(m => (
                <button key={m} onClick={() => setMode(m)} style={{
                  padding: '5px 11px', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                  background: mode === m ? T.secondary : T.bgInput,
                  color: mode === m ? '#fff' : T.textMuted,
                  transition: 'background 0.15s',
                }}>{m === 'melodic' ? '♩♩ Melodic' : '♫ Harmonic'}</button>
              ))}
            </div>
            <button onClick={handlePlay} style={{
              padding: '6px 20px', borderRadius: 0, cursor: 'pointer', fontSize: 13, fontWeight: 800,
              border: `1px solid ${T.secondary}`, background: T.secondaryBg, color: T.secondary,
              letterSpacing: '0.02em', borderLeft: '3px solid var(--gc-bar-color)',
            }}>▶ Play</button>
          </div>
        </div>

        {/* Fretboard + area filter */}
        <div style={{ ...card({ padding: '9px 10px 8px' }), background: 'var(--gc-fretboard-bg)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)' }}>Area:</span>
              {AREAS.map(a => (
                <button key={a.id} onClick={() => setArea(a.id)} style={{
                  padding: '2px 7px', borderRadius: 0, cursor: 'pointer', fontSize: 10, fontWeight: 600,
                  background: area === a.id ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.1)',
                  color: area === a.id ? '#1A1818' : 'rgba(255,255,255,0.7)',
                  border: 'none',
                  borderLeft: '3px solid var(--gc-bar-color)',
                }}>{a.label}</button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginBottom: 6, fontSize: 10 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: 0, background: T.primary, display: 'inline-block' }} />
              <span style={{ color: 'rgba(255,255,255,0.7)' }}>{root} (root)</span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: 0, background: '#FFC800', display: 'inline-block' }} />
              <span style={{ color: 'rgba(255,255,255,0.7)' }}>{intervalNote} ({selectedInterval.abbrev})</span>
            </span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <svg viewBox={`0 0 ${FB_W} ${FB_H}`} style={{ display: 'block', width: '100%', minWidth: 260 }}>
              <rect x={0} y={0} width={FB_W} height={FB_H} fill="var(--gc-fretboard-bg)" />
              {FRET_MARKERS.map(f => (
                <circle key={f} cx={NUT + (f - 0.5) * FRET_SP} cy={FB_TOP + 2.5 * STR_SP}
                  r={f === 12 ? 3 : 4} fill="rgba(255,255,255,0.15)" />
              ))}
              {Array.from({ length: 13 }).map((_, i) => (
                <line key={i} x1={NUT + i * FRET_SP} y1={FB_TOP} x2={NUT + i * FRET_SP} y2={FB_TOP + 5 * STR_SP}
                  stroke="rgba(255,255,255,1)" strokeWidth={i === 0 ? 0 : 1} />
              ))}
              <rect x={NUT - 3} y={FB_TOP} width={3} height={5 * STR_SP} fill="var(--gc-fretboard-nut)" />
              {Array.from({ length: 6 }).map((_, s) => (
                <line key={s} x1={NUT} y1={strY(s)} x2={NUT + 12 * FRET_SP} y2={strY(s)}
                  stroke="rgba(255,255,255,1)" strokeWidth={0.7 + (5 - s) * 0.28} />
              ))}
              {[3, 5, 7, 9, 12].map(f => (
                <text key={f} x={NUT + (f - 0.5) * FRET_SP} y={FB_H - 1}
                  textAnchor="middle" fontSize={7} fill="rgba(255,255,255,0.6)">{f}</text>
              ))}
              {intervalDots.map((p, i) => (
                <g key={`iv-${i}`}>
                  <circle cx={noteX(p.fret)} cy={strY(p.string)} r={8} fill="#FFC800" opacity={0.92} />
                  <text x={noteX(p.fret)} y={strY(p.string) + 3.5} textAnchor="middle" fontSize={6} fill="#1A1818" fontWeight="700">{intervalNote}</text>
                </g>
              ))}
              {rootDots.map((p, i) => (
                <g key={`r-${i}`}>
                  <circle cx={noteX(p.fret)} cy={strY(p.string)} r={8} fill={T.primary} opacity={0.92} />
                  <text x={noteX(p.fret)} y={strY(p.string) + 3.5} textAnchor="middle" fontSize={6} fill="#fff" fontWeight="700">{root}</text>
                </g>
              ))}
            </svg>
          </div>
        </div>
      </>}
    </div>
  );
}
