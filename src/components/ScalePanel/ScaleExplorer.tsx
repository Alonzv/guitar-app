import { useState, useMemo } from 'react';
import { Scale, Note as TonalNote } from '@tonaljs/tonal';
import type { Note } from '../../types/music';
import { DisplayFretboard, type DisplayDot } from '../Fretboard/DisplayFretboard';
import { getScalePositions } from '../../utils/scaleUtils';
import { fretToNote, STRING_COUNT } from '../../utils/musicTheory';
import { playScale } from '../../utils/audioPlayback';
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

const INTERVAL_DEGREE: Record<string, { num: string; name: string }> = {
  '1P':  { num: '1',  name: 'Tonic'        },
  '2m':  { num: '♭2', name: 'Supertonic'   },
  '2M':  { num: '2',  name: 'Supertonic'   },
  '2A':  { num: '♯2', name: 'Supertonic'   },
  '3m':  { num: '♭3', name: 'Mediant'      },
  '3M':  { num: '3',  name: 'Mediant'      },
  '4P':  { num: '4',  name: 'Subdominant'  },
  '4A':  { num: '♯4', name: 'Tritone'      },
  '5d':  { num: '♭5', name: 'Tritone'      },
  '5P':  { num: '5',  name: 'Dominant'     },
  '5A':  { num: '♯5', name: 'Dominant'     },
  '6m':  { num: '♭6', name: 'Submediant'   },
  '6M':  { num: '6',  name: 'Submediant'   },
  '7m':  { num: '♭7', name: 'Subtonic'     },
  '7M':  { num: '7',  name: 'Leading Tone' },
};

const POSITION_WINDOWS = [[0,3],[2,5],[4,8],[6,10],[9,12]] as const;
const POS_COLORS = [T.primary, T.secondary, '#5C5650', '#8A8378', '#9C958C'];

export function ScaleExplorer({ desktop }: { desktop?: boolean } = {}) {
  const [root, setRoot]             = useState<Note>('A');
  const [scaleType, setScaleType]   = useState<string | null>(null);
  const [scaleMenuOpen, setScaleMenuOpen] = useState(false);
  const [pos, setPos]               = useState<number | null>(null);
  const [viewMode, setViewMode]     = useState<'fretboard' | 'tab'>('fretboard');

  const scale       = useMemo(() => scaleType ? Scale.get(`${root} ${scaleType}`) : Scale.get(''), [root, scaleType]);
  const allPos      = useMemo(() => scaleType ? getScalePositions(root, scaleType) : [], [root, scaleType]);

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

  const generateTab = () => {
    const stringNames = ['e', 'B', 'G', 'D', 'A', 'E'];
    const lines: string[][] = Array.from({ length: STRING_COUNT }, () => []);
    for (let s = 0; s < STRING_COUNT; s++) {
      lines[s] = displayPos
        .filter(p => p.string === s)
        .sort((a, b) => a.fret - b.fret)
        .map(p => String(p.fret));
    }
    const maxLen = Math.max(...lines.map(l => l.length), 1);
    return lines
      .map((line, s) => `${stringNames[STRING_COUNT - 1 - s]}|${Array.from({ length: maxLen }, (_, i) => (line[i] ?? '-').padEnd(2, '-')).join('-')}|`)
      .join('\n');
  };

  const controlsPane = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── Root note ── */}
      <div style={card()}>
        <p className="gc-sec-label" style={{ margin: '0 0 10px' }}>
          Root Note
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 7 }}>
          {ALL_NOTES.map(n => {
            const sharp    = n.includes('#');
            const selected = n === root;
            return (
              <button key={n} onClick={() => setRoot(n)} style={{
                padding: '9px 4px', borderRadius: 0, cursor: 'pointer',
                fontSize: sharp ? 11 : 13, fontWeight: selected ? 500 : 400,
                border: selected ? `2px solid ${T.primary}` : `2px solid transparent`,
                background: selected ? T.primaryBg : sharp ? T.bgInput : T.bgCard,
                color: selected ? T.primary : sharp ? T.textMuted : T.text,
                transition: 'all 0.12s', borderLeft: '3px solid var(--gc-bar-color)',
              }}>
                {n}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Scale type ── */}
      <div>
        <button
          onClick={() => setScaleMenuOpen(o => !o)}
          style={{
            width: '100%', padding: '11px 16px', borderRadius: 0, cursor: 'pointer',
            background: T.secondary, color: '#fff',
            fontSize: 13, fontWeight: 400, textAlign: 'left',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            borderLeft: '3px solid var(--gc-bar-color)',
          }}
        >
          <span>
            <span style={{ opacity: 0.6, fontSize: 11, fontWeight: 400, marginRight: 8, textTransform: 'uppercase', letterSpacing: '-0.02em' }}>Scale Type</span>
            {scaleType
              ? SCALE_GROUPS.flatMap(g => g.scales).find(s => s.id === scaleType)?.label ?? scaleType
              : '— Select —'}
          </span>
          <span style={{ fontSize: 11 }}>{scaleMenuOpen ? '▲' : '▼'}</span>
        </button>

        {scaleMenuOpen && (
          <div style={{ ...card(), marginTop: 2, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {SCALE_GROUPS.map(g => (
              <div key={g.label}>
                <p className="gc-sec-label" style={{ margin: '0 0 7px' }}>
                  {g.label}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {g.scales.map(s => {
                    const sel = scaleType === s.id;
                    return (
                      <button key={s.id} onClick={() => { setScaleType(s.id); setScaleMenuOpen(false); }} style={{
                        padding: '6px 13px', borderRadius: 0, cursor: 'pointer', fontSize: 12,
                        fontWeight: sel ? 500 : 400,
                        border: sel ? `1px solid ${T.secondary}` : `1px solid ${T.border}`,
                        background: sel ? T.secondaryBg : T.bgInput,
                        color: sel ? T.secondary : T.textMuted,
                        borderLeft: '3px solid var(--gc-bar-color)',
                      }}>
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const outputPane = !scale.empty ? (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, ...(desktop ? { position: 'sticky' as const, top: 24 } : {}) }}>
          {/* ── Scale info chips ── */}
          <div style={card({ padding: '12px 16px' })}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 17, fontWeight: 800, color: T.text }}>{root} {scaleType}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: T.textMuted }}>{scale.notes.length} notes</span>
                <button
                  onClick={() => {
                    const midiNotes = [
                      ...scale.notes.map(n => TonalNote.midi(`${n}4`) ?? 60),
                      TonalNote.midi(`${root}5`) ?? 72,
                    ];
                    playScale(midiNotes);
                  }}
                  className="gc-btn-heavy"
                  style={{
                    padding: '4px 14px', borderRadius: 0,
                    background: T.primary, color: '#fff', fontSize: 12,
                    fontWeight: 400, cursor: 'pointer',
                  }}
                >PLAY</button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {scale.notes.map((note, i) => {
                const isR = samePitch(note, root);
                const interval = scale.intervals[i] ?? '';
                const deg = INTERVAL_DEGREE[interval] ?? { num: String(i + 1), name: '' };
                return (
                  <div key={i} style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    padding: '8px 10px', borderRadius: 0, gap: 3, flex: 1, minWidth: 48,
                    background: isR ? T.primaryBg : T.bgInput,
                    border: `1px solid ${isR ? T.primary : T.border}`,
                    borderTop: isR ? `3px solid ${T.primary}` : `3px solid ${T.border}`,
                  }}>
                    <span style={{ fontSize: 11, fontWeight: 400, color: T.primary, lineHeight: 1 }}>{deg.num}</span>
                    <span style={{ fontSize: 18, fontWeight: isR ? 800 : 600, color: isR ? T.primary : T.text, lineHeight: 1.1 }}>{note}</span>
                    <span style={{ fontSize: 9, color: T.textMuted, lineHeight: 1, whiteSpace: 'nowrap' }}>{deg.name}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── View toggle ── */}
          <div style={{ display: 'flex', gap: 0 }}>
            {(['fretboard', 'tab'] as const).map(v => (
              <button key={v} onClick={() => setViewMode(v)} style={{
                flex: 1, padding: '9px 0', borderRadius: 0, cursor: 'pointer',
                fontSize: 13, fontWeight: viewMode === v ? 500 : 400,
                background: viewMode === v ? T.primary : T.bgCard,
                color: viewMode === v ? T.text : T.textMuted,
                borderLeft: '3px solid var(--gc-bar-color)',
              }}>
                {v === 'fretboard' ? 'Fretboard' : 'Tab'}
              </button>
            ))}
          </div>

          {/* ── Position selector ── */}
          <div className="gc-pos-row" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: T.textMuted }}>Position:</span>
            <button onClick={() => setPos(null)} style={{
              padding: '4px 13px', borderRadius: 0, cursor: 'pointer', fontSize: 11,
              background: pos === null ? T.text : T.bgInput,
              color: pos === null ? T.bgDeep : T.textMuted,
              fontWeight: pos === null ? 500 : 400,
              borderLeft: '3px solid var(--gc-bar-color)',
            }}>
              Full Neck
            </button>
            {POSITION_WINDOWS.map((_, i) => (
              <button key={i} onClick={() => setPos(pos === i ? null : i)}
                title={`Frets ${POSITION_WINDOWS[i][0]}–${POSITION_WINDOWS[i][1]}`}
                style={{
                  width: 'var(--gc-pos-btn)', height: 'var(--gc-pos-btn)',
                  borderRadius: 0, cursor: 'pointer',
                  fontSize: 12, fontWeight: 400,
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

          {/* ── Fretboard / Tab ── */}
          {viewMode === 'fretboard' ? (
            <div style={card()}>
              {dots.length > 0
                ? <DisplayFretboard dots={dots} compact />
                : <p style={{ textAlign: 'center', color: T.textDim, fontSize: 13, margin: 0 }}>No notes in this position</p>
              }
            </div>
          ) : (
            <div style={{ ...card(), background: T.bgDeep, overflowX: 'auto' }}>
              <pre style={{ fontSize: 12, color: T.secondary, fontFamily: 'monospace', lineHeight: 1.7, margin: 0, whiteSpace: 'pre' }}>
                {generateTab()}
              </pre>
            </div>
          )}

          {/* ── Legend ── */}
          <div style={{ display: 'flex', gap: 16, fontSize: 11, color: T.textMuted }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 0, background: T.primary, display: 'inline-block' }} />
              Root ({root})
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 0, background: T.secondary, display: 'inline-block' }} />
              Scale tones
            </span>
          </div>
    </div>
  ) : desktop ? (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200, color: T.textDim, fontSize: 13, fontFamily: 'var(--gc-mono)', letterSpacing: '0.04em' }}>
      ← Select root + scale type
    </div>
  ) : (
    <div style={{ textAlign: 'center', padding: 32, color: T.textDim, fontSize: 13 }}>Scale not found</div>
  );

  if (desktop) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 30, alignItems: 'start' }}>
        {controlsPane}
        {outputPane}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {controlsPane}
      {outputPane}
    </div>
  );
}
