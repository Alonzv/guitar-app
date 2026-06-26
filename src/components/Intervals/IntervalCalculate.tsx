import { useState, useMemo } from 'react';
import { CHROMATIC, STANDARD_OPEN_MIDI, ALL_NOTES } from '../../utils/musicTheory';
import { playScale, getSharedContext, getOutputNode, unlockAudio } from '../../utils/audioPlayback';
import { T, card } from '../../theme';

const OPEN_MIDI = STANDARD_OPEN_MIDI;

const INTERVAL_NAMES: Record<number, { name: string; abbrev: string }> = {
  0:  { name: 'Unison',       abbrev: 'P1' },
  1:  { name: 'Minor 2nd',    abbrev: 'm2' },
  2:  { name: 'Major 2nd',    abbrev: 'M2' },
  3:  { name: 'Minor 3rd',    abbrev: 'm3' },
  4:  { name: 'Major 3rd',    abbrev: 'M3' },
  5:  { name: 'Perfect 4th',  abbrev: 'P4' },
  6:  { name: 'Tritone',      abbrev: 'TT' },
  7:  { name: 'Perfect 5th',  abbrev: 'P5' },
  8:  { name: 'Minor 6th',    abbrev: 'm6' },
  9:  { name: 'Major 6th',    abbrev: 'M6' },
  10: { name: 'Minor 7th',    abbrev: 'm7' },
  11: { name: 'Major 7th',    abbrev: 'M7' },
  12: { name: 'Octave',       abbrev: 'P8' },
};

const FB_W = 580, FB_H = 165;
const NUT = 44;
const FRET_SP = (FB_W - NUT - 16) / 12;
const STR_SP = (FB_H - 30) / 5;
const FB_TOP = 12;
const DOT_R = 9;
const BRACKET_EXTRA = 30;

const strY = (s: number) => FB_TOP + (5 - s) * STR_SP;
const noteX = (f: number) => f === 0 ? NUT - 14 : NUT + (f - 0.5) * FRET_SP;

function getPositions(note: string) {
  const pc = CHROMATIC.indexOf(note);
  if (pc === -1) return [];
  const res: { string: number; fret: number }[] = [];
  for (let s = 0; s < 6; s++) {
    for (let f = 0; f <= 12; f++) {
      if ((OPEN_MIDI[s] + f) % 12 === pc) res.push({ string: s, fret: f });
    }
  }
  return res;
}

const MONO_LBL: React.CSSProperties = {
  margin: '0 0 8px', fontSize: 10, color: '#9C958C',
  fontFamily: 'var(--gc-mono)', letterSpacing: '0.14em', textTransform: 'uppercase',
};

export function IntervalCalculate() {
  const [noteA,    setNoteA]    = useState<string | null>(null);
  const [noteB,    setNoteB]    = useState<string | null>(null);
  const [inverted, setInverted] = useState(false);
  const [mode,     setMode]     = useState<'melodic' | 'harmonic'>('melodic');

  const has2 = noteA !== null && noteB !== null;

  const semitones = useMemo(() => {
    if (!noteA || !noteB) return null;
    const chromaA = CHROMATIC.indexOf(noteA);
    const chromaB = CHROMATIC.indexOf(noteB);
    const diff = inverted
      ? ((chromaA - chromaB + 12) % 12)
      : ((chromaB - chromaA + 12) % 12);
    return diff;
  }, [noteA, noteB, inverted]);

  const intervalInfo = semitones !== null ? (INTERVAL_NAMES[semitones] ?? null) : null;

  const displayA = inverted ? noteB : noteA;
  const displayB = inverted ? noteA : noteB;

  const handlePlay = () => {
    if (!noteA || !noteB || semitones === null) return;
    const midiA = 60 + CHROMATIC.indexOf(noteA);
    const midiB = midiA + semitones;
    if (mode === 'harmonic') {
      const ctx = getSharedContext();
      unlockAudio().then(() => {
        const t = ctx.currentTime + 0.05;
        [midiA, midiB].forEach(midi => {
          const freq = 440 * Math.pow(2, (midi - 69) / 12);
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0.22, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 1.8);
          osc.connect(gain); gain.connect(getOutputNode());
          osc.start(t); osc.stop(t + 1.8);
        });
      });
    } else {
      playScale([midiA, midiB]);
    }
  };

  const aDots = useMemo(() => noteA ? getPositions(noteA) : [], [noteA]);
  const bDots = useMemo(() => noteB ? getPositions(noteB) : [], [noteB]);

  const pairs = useMemo(() => {
    if (!noteA || !noteB) return [];
    const res: { string: number; aFret: number; bFret: number }[] = [];
    aDots.forEach(a => {
      bDots.forEach(b => {
        if (a.string === b.string && a.fret !== b.fret) {
          res.push({ string: a.string, aFret: a.fret, bFret: b.fret });
        }
      });
    });
    return res;
  }, [aDots, bDots, noteA, noteB]);

  const bracketPair = pairs.length > 0 ? pairs[0] : null;
  const svgH = FB_H + (bracketPair && intervalInfo ? BRACKET_EXTRA : 8);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Note pickers */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div style={card({ padding: '10px 12px' })}>
          <p style={{ ...MONO_LBL, color: '#CC1C1C' }}>Note A</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 3 }}>
            {ALL_NOTES.map(n => {
              const sel = n === noteA;
              return (
                <button key={n} onClick={() => { setNoteA(sel ? null : n); setInverted(false); }} style={{
                  padding: '7px 2px', borderRadius: 0, cursor: 'pointer',
                  fontSize: n.includes('#') ? 10 : 12, fontWeight: sel ? 600 : 400,
                  border: `1px solid ${sel ? '#CC1C1C' : T.border}`,
                  background: sel ? '#FBF1F1' : T.bgCard,
                  color: sel ? '#CC1C1C' : T.text,
                  borderLeft: `2px solid ${sel ? '#CC1C1C' : 'var(--gc-bar-color)'}`,
                }}>{n}</button>
              );
            })}
          </div>
        </div>

        <div style={card({ padding: '10px 12px' })}>
          <p style={{ ...MONO_LBL }}>Note B</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 3 }}>
            {ALL_NOTES.map(n => {
              const sel = n === noteB;
              return (
                <button key={n} onClick={() => { setNoteB(sel ? null : n); setInverted(false); }} style={{
                  padding: '7px 2px', borderRadius: 0, cursor: 'pointer',
                  fontSize: n.includes('#') ? 10 : 12, fontWeight: sel ? 600 : 400,
                  border: `1px solid ${sel ? '#16110F' : T.border}`,
                  background: sel ? T.bgDeep : T.bgCard,
                  color: sel ? '#fff' : T.text,
                  borderLeft: `2px solid ${sel ? '#16110F' : 'var(--gc-bar-color)'}`,
                }}>{n}</button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Result card */}
      <div style={{ ...card({ padding: '12px 16px' }), borderLeft: `4px solid ${has2 ? T.primary : T.border}`, minHeight: 64 }}>
        {has2 && intervalInfo ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 30, fontWeight: 900, color: T.primary, fontFamily: 'var(--gc-mono)', lineHeight: 1 }}>
                  {intervalInfo.abbrev}
                </span>
                <span style={{ fontSize: 16, fontWeight: 600, color: T.text }}>
                  {intervalInfo.name}
                </span>
              </div>
              <div style={{ fontSize: 11, color: T.textMuted }}>
                {semitones} semitone{semitones !== 1 ? 's' : ''}
                {'  ·  '}
                <span style={{ fontWeight: 600, color: T.text }}>{displayA} → {displayB}</span>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-end', flexShrink: 0 }}>
              <button onClick={() => setInverted(v => !v)} style={{
                padding: '4px 10px', borderRadius: 0, cursor: 'pointer', fontSize: 10, fontWeight: 600,
                border: `1px solid ${inverted ? T.primary : T.border}`,
                background: inverted ? T.primaryBg : T.bgCard,
                color: inverted ? T.primary : T.textMuted,
                borderLeft: '2px solid var(--gc-bar-color)',
              }}>↕ Invert</button>
              <div style={{ display: 'flex', overflow: 'hidden', border: `1px solid ${T.border}` }}>
                {(['melodic', 'harmonic'] as const).map(m => (
                  <button key={m} onClick={() => setMode(m)} style={{
                    padding: '4px 9px', border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 600,
                    background: mode === m ? T.secondary : T.bgInput,
                    color: mode === m ? '#fff' : T.textMuted,
                  }}>{m === 'melodic' ? 'MEL' : 'HARM'}</button>
                ))}
              </div>
              <button onClick={handlePlay} style={{
                padding: '5px 14px', borderRadius: 0, cursor: 'pointer', fontSize: 11, fontWeight: 600,
                border: `1px solid ${T.secondary}`, background: 'transparent', color: T.secondary,
                borderLeft: '3px solid var(--gc-bar-color)',
              }}>▶ Play</button>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', color: T.textDim, fontSize: 12, padding: '8px 0' }}>
            {!noteA && !noteB ? 'Select Note A and Note B above' : !noteA ? 'Select Note A' : 'Select Note B'}
          </div>
        )}
      </div>

      {/* Fretboard */}
      {(noteA || noteB) && (
        <div style={{ background: 'var(--gc-fretboard-bg)', padding: '10px 10px 6px', border: `1px solid ${T.border}` }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 8, fontSize: 9 }}>
            {noteA && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, background: '#CC1C1C', display: 'inline-block' }} />
                <span style={{ color: 'rgba(255,255,255,0.7)' }}>{noteA} (A)</span>
              </span>
            )}
            {noteB && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, background: '#16110F', display: 'inline-block', border: '1px solid rgba(255,255,255,0.3)' }} />
                <span style={{ color: 'rgba(255,255,255,0.7)' }}>{noteB} (B)</span>
              </span>
            )}
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
                  x1={noteX(p.aFret)} y1={strY(p.string)}
                  x2={noteX(p.bFret)} y2={strY(p.string)}
                  stroke="#CC1C1C" strokeWidth={1.5} strokeDasharray="5 3" opacity={0.7} />
              ))}

              {bDots.map((p, i) => (
                <g key={`b-${i}`}>
                  <circle cx={noteX(p.fret)} cy={strY(p.string)} r={DOT_R} fill="#16110F" />
                  <text x={noteX(p.fret)} y={strY(p.string) + 3.5}
                    textAnchor="middle" fontSize={6} fill="#fff" fontWeight="700">{noteB}</text>
                </g>
              ))}

              {aDots.map((p, i) => (
                <g key={`a-${i}`}>
                  <circle cx={noteX(p.fret)} cy={strY(p.string)} r={DOT_R} fill="#CC1C1C" />
                  <text x={noteX(p.fret)} y={strY(p.string) + 3.5}
                    textAnchor="middle" fontSize={6} fill="#fff" fontWeight="700">{noteA}</text>
                </g>
              ))}

              {bracketPair && intervalInfo && (() => {
                const x1    = noteX(bracketPair.aFret);
                const x2    = noteX(bracketPair.bFret);
                const bY    = FB_TOP + 5 * STR_SP + 14;
                const bH    = 6;
                const xL    = Math.min(x1, x2);
                const xR    = Math.max(x1, x2);
                const cX    = (xL + xR) / 2;
                const frets = Math.abs(bracketPair.aFret - bracketPair.bFret);
                const lbl   = `${intervalInfo.name.toUpperCase()} · ${frets} FRET${frets !== 1 ? 'S' : ''}`;
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
      )}
    </div>
  );
}
