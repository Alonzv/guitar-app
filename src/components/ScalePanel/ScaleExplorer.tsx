import { useState, useMemo } from 'react';
import { Scale } from '@tonaljs/tonal';
import type { Note } from '../../types/music';
import { DisplayFretboard, type DisplayDot } from '../Fretboard/DisplayFretboard';
import { getScalePositions } from '../../utils/scaleUtils';
import { fretToNote } from '../../utils/musicTheory';
import { T, card } from '../../theme';

const ALL_NOTES: Note[] = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const ENHARMONIC_MAP: Record<string, string> = {
  'Db':'C#','Eb':'D#','Gb':'F#','Ab':'G#','Bb':'A#',
  'C#':'Db','D#':'Eb','F#':'Gb','G#':'Ab','A#':'Bb',
};
const samePitch = (a: string, b: string) => a === b || ENHARMONIC_MAP[a] === b || a === ENHARMONIC_MAP[b];

const SCALE_GROUPS = [
  { label: 'Essential', scales: [
    { id: 'major', label: 'Major' },
    { id: 'minor', label: 'Minor' },
    { id: 'major pentatonic', label: 'Major Pentatonic' },
    { id: 'minor pentatonic', label: 'Minor Pentatonic' },
    { id: 'blues', label: 'Blues' },
  ]},
  { label: 'Minor Variants', scales: [
    { id: 'harmonic minor', label: 'Harmonic Minor' },
    { id: 'melodic minor', label: 'Melodic Minor' },
  ]},
  { label: 'Modes', scales: [
    { id: 'dorian', label: 'Dorian' },
    { id: 'phrygian', label: 'Phrygian' },
    { id: 'lydian', label: 'Lydian' },
    { id: 'mixolydian', label: 'Mixolydian' },
    { id: 'locrian', label: 'Locrian' },
    { id: 'phrygian dominant', label: 'Phrygian Dom.' },
  ]},
  { label: 'Other', scales: [
    { id: 'whole tone', label: 'Whole Tone' },
    { id: 'diminished', label: 'Diminished' },
    { id: 'augmented', label: 'Augmented' },
    { id: 'double harmonic major', label: 'Double Harmonic' },
  ]},
];

const POSITION_WINDOWS = [[0,3],[2,5],[4,8],[6,10],[9,12]] as const;
const POS_COLORS = [T.primary, T.secondary, '#c4a000', '#8a4aa0', '#2a7aa0'];

export function ScaleExplorer() {
  const [root, setRoot]           = useState<Note>('A');
  const [scaleType, setScaleType] = useState('minor pentatonic');
  const [pos, setPos]             = useState<number | null>(null);

  const scale       = useMemo(() => Scale.get(`${root} ${scaleType}`), [root, scaleType]);
  const allPos      = useMemo(() => getScalePositions(root, scaleType), [root, scaleType]);

  const displayPos  = useMemo(() => {
    if (pos === null) return allPos;
    const [min, max] = POSITION_WINDOWS[pos];
    return allPos.filter(p => p.fret >= min && p.fret <= max);
  }, [allPos, pos]);

  const dots: DisplayDot[] = useMemo(() =>
    displayPos.map(p => {
      const note   = fretToNote(p.string, p.fret);
      const isRoot = samePitch(note, root);
      return { ...p, color: isRoot ? T.primary : (pos !== null ? POS_COLORS[pos] : T.secondary), label: note };
    }),
    [displayPos, root, pos]
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── Root note ── */}
      <div style={card()}>
        <p style={{ margin: '0 0 10px', fontSize: 11, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Root Note
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 7 }}>
          {ALL_NOTES.map(n => {
            const sharp    = n.includes('#');
            const selected = n === root;
            return (
              <button key={n} onClick={() => setRoot(n)} style={{
                padding: '9px 4px', borderRadius: 9, cursor: 'pointer',
                fontSize: sharp ? 11 : 13, fontWeight: selected ? 700 : 400,
                border: selected ? `2px solid ${T.primary}` : `2px solid transparent`,
                background: selected ? T.primaryBg : sharp ? T.bgInput : T.bgCard,
                color: selected ? T.primary : sharp ? T.textMuted : T.text,
                transition: 'all 0.12s',
              }}>
                {n}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Scale type ── */}
      <div style={card()}>
        <p style={{ margin: '0 0 12px', fontSize: 11, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Scale Type
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {SCALE_GROUPS.map(g => (
            <div key={g.label}>
              <p style={{ margin: '0 0 7px', fontSize: 10, color: T.textDim, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                {g.label}
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {g.scales.map(s => {
                  const sel = scaleType === s.id;
                  return (
                    <button key={s.id} onClick={() => setScaleType(s.id)} style={{
                      padding: '6px 13px', borderRadius: 8, cursor: 'pointer', fontSize: 12,
                      fontWeight: sel ? 700 : 400,
                      border: sel ? `1px solid ${T.secondary}` : `1px solid ${T.border}`,
                      background: sel ? T.secondaryBg : T.bgInput,
                      color: sel ? T.secondary : T.textMuted,
                    }}>
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {!scale.empty ? (
        <>
          {/* ── Scale info chips ── */}
          <div style={card({ padding: '12px 16px' })}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 17, fontWeight: 800, color: T.text }}>{root} {scaleType}</span>
              <span style={{ fontSize: 11, color: T.textMuted }}>{scale.notes.length} notes</span>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {scale.notes.map((note, i) => {
                const isR = samePitch(note, root);
                return (
                  <span key={i} style={{
                    padding: '4px 11px', borderRadius: 7, fontSize: 13, fontWeight: isR ? 800 : 400,
                    background: isR ? T.primaryBg : T.bgInput,
                    color: isR ? T.primary : T.text,
                    border: isR ? `1px solid ${T.primary}` : `1px solid ${T.border}`,
                  }}>
                    {note}
                  </span>
                );
              })}
            </div>
          </div>

          {/* ── Position selector ── */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: T.textMuted }}>Position:</span>
            <button onClick={() => setPos(null)} style={{
              padding: '4px 13px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 11,
              background: pos === null ? T.text : T.bgInput,
              color: pos === null ? T.bgDeep : T.textMuted,
              fontWeight: pos === null ? 700 : 400,
            }}>
              Full Neck
            </button>
            {POSITION_WINDOWS.map((_, i) => (
              <button key={i} onClick={() => setPos(pos === i ? null : i)}
                title={`Frets ${POSITION_WINDOWS[i][0]}–${POSITION_WINDOWS[i][1]}`}
                style={{
                  width: 'var(--gc-pos-btn)', height: 'var(--gc-pos-btn)',
                  borderRadius: '50%', cursor: 'pointer',
                  fontSize: 12, fontWeight: 700,
                  background: POS_COLORS[i],
                  color: '#fff',
                  border: pos === i ? `2px solid ${T.text}` : '2px solid transparent',
                  opacity: pos === i ? 1 : 0.75,
                  flexShrink: 0,
                }}>
                {i + 1}
              </button>
            ))}
          </div>

          {/* ── Fretboard ── */}
          <div style={card()}>
            {dots.length > 0
              ? <DisplayFretboard dots={dots} />
              : <p style={{ textAlign: 'center', color: T.textDim, fontSize: 13, margin: 0 }}>No notes in this position</p>
            }
          </div>

          {/* ── Legend ── */}
          <div style={{ display: 'flex', gap: 16, fontSize: 11, color: T.textMuted }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: T.primary, display: 'inline-block' }} />
              Root ({root})
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: T.secondary, display: 'inline-block' }} />
              Scale tones
            </span>
          </div>
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: 32, color: T.textDim, fontSize: 13 }}>Scale not found</div>
      )}
    </div>
  );
}
