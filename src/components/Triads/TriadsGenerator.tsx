import { useState, useMemo } from 'react';
import { Note as TonalNote } from '@tonaljs/tonal';
import { MiniFretboard } from '../Fretboard/MiniFretboard';
import { fretToNote, STRING_COUNT, FRET_COUNT, CHROMATIC } from '../../utils/musicTheory';
import { playScale } from '../../utils/audioPlayback';
import { T, card } from '../../theme';
import type { Note } from '../../types/music';

const ALL_NOTES: Note[] = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const ENHARMONIC_MAP: Record<string, string> = {
  'Db':'C#','Eb':'D#','Gb':'F#','Ab':'G#','Bb':'A#',
  'C#':'Db','D#':'Eb','F#':'Gb','G#':'Ab','A#':'Bb',
};
const samePitch = (a: string, b: string) => a === b || ENHARMONIC_MAP[a] === b || a === ENHARMONIC_MAP[b];

type TriadType = 'major' | 'minor' | 'diminished' | 'augmented';
type Degree = 'root' | 'third' | 'fifth';

interface TriadDef {
  label: string;
  suffix: string;
  intervals: [number, number, number];
  thirdLabel: string;
  fifthLabel: string;
  thirdDeg: string;
  fifthDeg: string;
}

const TRIADS: Record<TriadType, TriadDef> = {
  major:      { label: 'Major',      suffix: '',    intervals: [0, 4, 7], thirdLabel: 'Maj 3rd', fifthLabel: 'Perf 5th', thirdDeg: '3',  fifthDeg: '5'  },
  minor:      { label: 'Minor',      suffix: 'm',   intervals: [0, 3, 7], thirdLabel: 'Min 3rd', fifthLabel: 'Perf 5th', thirdDeg: '♭3', fifthDeg: '5'  },
  diminished: { label: 'Diminished', suffix: 'dim', intervals: [0, 3, 6], thirdLabel: 'Min 3rd', fifthLabel: 'Dim 5th',  thirdDeg: '♭3', fifthDeg: '♭5' },
  augmented:  { label: 'Augmented',  suffix: 'aug', intervals: [0, 4, 8], thirdLabel: 'Maj 3rd', fifthLabel: 'Aug 5th',  thirdDeg: '3',  fifthDeg: '♯5' },
};

const DEGREE_COLORS: Record<Degree, string> = {
  root:  T.primary,
  third: T.secondary,
  fifth: '#b8921a',
};

const POSITION_WINDOWS = [[0,3],[2,5],[4,8],[6,10],[9,12]] as const;
const POS_COLORS = [T.primary, T.secondary, '#c4a000', '#8a4aa0', '#2a7aa0'];

interface PosDot { string: number; fret: number; degree: Degree }

function getTriadNotes(root: string, intervals: [number, number, number]): [string, string, string] {
  const rootIdx = CHROMATIC.indexOf(root);
  if (rootIdx === -1) return [root, root, root];
  return intervals.map(i => CHROMATIC[(rootIdx + i) % 12]) as [string, string, string];
}

// All fretboard positions for the 3 triad tones
function getAllTriadPositions(root: string, intervals: [number, number, number]): PosDot[] {
  const [rootNote, thirdNote, fifthNote] = getTriadNotes(root, intervals);
  const result: PosDot[] = [];
  for (let s = 0; s < STRING_COUNT; s++) {
    for (let f = 0; f <= FRET_COUNT; f++) {
      const note = fretToNote(s, f);
      if (samePitch(note, rootNote))       result.push({ string: s, fret: f, degree: 'root'  });
      else if (samePitch(note, thirdNote)) result.push({ string: s, fret: f, degree: 'third' });
      else if (samePitch(note, fifthNote)) result.push({ string: s, fret: f, degree: 'fifth' });
    }
  }
  return result;
}

// Cartesian product helper
function cartesian<T>(arrays: T[][]): T[][] {
  return arrays.reduce<T[][]>(
    (acc, curr) => acc.flatMap(a => curr.map(b => [...a, b])),
    [[]]
  );
}

// Find all playable 3-string triad shapes within a fret window
function findTriadShapes(
  root: string,
  intervals: [number, number, number],
  minFret: number,
  maxFret: number
): PosDot[][] {
  const allPos = getAllTriadPositions(root, intervals);
  const shapes: PosDot[][] = [];
  const seen = new Set<string>();

  for (let startStr = 0; startStr <= STRING_COUNT - 3; startStr++) {
    const endStr = startStr + 2;

    // Collect options per string within fret window
    const perString: PosDot[][] = [];
    let hasEmpty = false;
    for (let s = startStr; s <= endStr; s++) {
      const opts = allPos.filter(p =>
        p.string === s &&
        (p.fret === 0 ? minFret === 0 : p.fret >= minFret && p.fret <= maxFret)
      );
      perString.push(opts);
      if (opts.length === 0) hasEmpty = true;
    }
    if (hasEmpty) continue;

    // Try all combinations (one note per string)
    for (const combo of cartesian(perString)) {
      // Need all 3 degrees
      const degrees = new Set(combo.map(p => p.degree));
      if (!degrees.has('root') || !degrees.has('third') || !degrees.has('fifth')) continue;

      // Fret spread must be ≤ 4
      const nonOpenFrets = combo.filter(p => p.fret > 0).map(p => p.fret);
      if (nonOpenFrets.length > 0) {
        const spread = Math.max(...nonOpenFrets) - Math.min(...nonOpenFrets);
        if (spread > 4) continue;
      }

      const key = combo.map(p => `${p.string}-${p.fret}`).join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      shapes.push(combo);
    }
  }

  // Sort by lowest fret of the shape
  return shapes.sort((a, b) => {
    const aMin = Math.min(...a.map(p => p.fret));
    const bMin = Math.min(...b.map(p => p.fret));
    return aMin - bMin;
  });
}

function inversionLabel(shape: PosDot[]): string {
  const sorted = [...shape].sort((a, b) => a.string - b.string);
  const bass = sorted[0].degree;
  if (bass === 'root')  return 'Root';
  if (bass === 'third') return '1st inv.';
  return '2nd inv.';
}

export function TriadsGenerator() {
  const [root,      setRoot]      = useState<Note>('C');
  const [triadType, setTriadType] = useState<TriadType>('major');
  const [pos,       setPos]       = useState<number | null>(null);

  const def = TRIADS[triadType];
  const [rootNote, thirdNote, fifthNote] = useMemo(() => getTriadNotes(root, def.intervals), [root, def]);

  const shapes = useMemo(() => {
    if (pos === null) {
      // Full neck: search 0–12, collect all unique shapes
      return findTriadShapes(root, def.intervals, 0, FRET_COUNT);
    }
    const [min, max] = POSITION_WINDOWS[pos];
    return findTriadShapes(root, def.intervals, min, max);
  }, [root, def, pos]);

  const handlePlay = () => {
    const midiNotes = [rootNote, thirdNote, fifthNote, rootNote].map(n => TonalNote.midi(`${n}4`) ?? 60);
    playScale(midiNotes);
  };

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

      {/* ── Triad type ── */}
      <div style={card()}>
        <p style={{ margin: '0 0 10px', fontSize: 11, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Triad Type
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          {(Object.entries(TRIADS) as [TriadType, TriadDef][]).map(([type, d]) => {
            const sel = triadType === type;
            return (
              <button key={type} onClick={() => setTriadType(type)} style={{
                padding: '11px 12px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                border: sel ? `2px solid ${T.secondary}` : `1px solid ${T.border}`,
                background: sel ? T.secondaryBg : T.bgInput,
                color: sel ? T.secondary : T.textMuted,
                transition: 'all 0.12s',
              }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{d.label}</div>
                <div style={{ fontSize: 11, marginTop: 2, opacity: 0.75 }}>
                  R · {d.thirdLabel} · {d.fifthLabel}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Notes info ── */}
      <div style={card({ padding: '12px 16px' })}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 17, fontWeight: 800, color: T.text }}>{root}{def.suffix}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: T.textMuted }}>{shapes.length} shapes found</span>
            <button onClick={handlePlay} style={{
              padding: '4px 12px', borderRadius: 8, border: `1px solid ${T.secondary}`,
              background: T.secondaryBg, color: T.secondary, fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}>▶ Play</button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { note: rootNote,  label: 'Root',        deg: '1',        color: DEGREE_COLORS.root  },
            { note: thirdNote, label: def.thirdLabel, deg: def.thirdDeg, color: DEGREE_COLORS.third },
            { note: fifthNote, label: def.fifthLabel, deg: def.fifthDeg, color: DEGREE_COLORS.fifth },
          ].map(({ note, label, deg, color }) => (
            <div key={label} style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              padding: '8px 6px', borderRadius: 10, gap: 3,
              background: T.bgInput, border: `1px solid ${color}44`,
            }}>
              <span style={{ fontSize: 10, fontWeight: 700, color, lineHeight: 1 }}>{deg}</span>
              <span style={{ fontSize: 18, fontWeight: 800, color: T.text, lineHeight: 1.2 }}>{note}</span>
              <span style={{ fontSize: 9, color: T.textMuted, lineHeight: 1, textAlign: 'center' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Position filter ── */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: T.textMuted }}>Area:</span>
        <button onClick={() => setPos(null)} style={{
          padding: '4px 13px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 11,
          background: pos === null ? T.text : T.bgInput,
          color: pos === null ? T.bgDeep : T.textMuted,
          fontWeight: pos === null ? 700 : 400,
        }}>Full Neck</button>
        {POSITION_WINDOWS.map((w, i) => (
          <button key={i} onClick={() => setPos(pos === i ? null : i)}
            title={`Frets ${w[0]}–${w[1]}`}
            style={{
              padding: '4px 11px', borderRadius: 20, cursor: 'pointer', fontSize: 11, fontWeight: 600,
              background: pos === i ? POS_COLORS[i] : T.bgInput,
              color: pos === i ? '#fff' : T.textMuted,
              border: pos === i ? 'none' : `1px solid ${T.border}`,
            }}>
            {w[0]}–{w[1]}
          </button>
        ))}
      </div>

      {/* ── Voicing cards grid ── */}
      {shapes.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
          {shapes.map((shape, i) => {
            const label = inversionLabel(shape);
            const fretPositions = shape.map(p => ({ string: p.string, fret: p.fret }));
            const dotColors     = shape.map(p => DEGREE_COLORS[p.degree]);
            const minF = Math.min(...shape.map(p => p.fret));
            return (
              <div key={i} style={{
                ...card({ padding: '10px 10px 6px' }),
                display: 'flex', flexDirection: 'column', gap: 4,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {label}
                  </span>
                  {minF > 0 && (
                    <span style={{ fontSize: 9, color: T.textDim }}>fr {minF}</span>
                  )}
                </div>
                <MiniFretboard voicing={fretPositions} dotColors={dotColors} />
                <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                  {shape.sort((a,b) => a.string - b.string).map((p, j) => (
                    <span key={j} style={{
                      fontSize: 9, fontWeight: 700, color: DEGREE_COLORS[p.degree],
                      background: `${DEGREE_COLORS[p.degree]}18`,
                      padding: '1px 5px', borderRadius: 4,
                    }}>
                      {fretToNote(p.string, p.fret)}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: 32, color: T.textDim, fontSize: 13 }}>
          No shapes found in this area
        </div>
      )}

      {/* ── Legend ── */}
      <div style={{ display: 'flex', gap: 16, fontSize: 11, color: T.textMuted, flexWrap: 'wrap' }}>
        {[
          { color: DEGREE_COLORS.root,  label: `Root (${rootNote})`   },
          { color: DEGREE_COLORS.third, label: `3rd (${thirdNote})`  },
          { color: DEGREE_COLORS.fifth, label: `5th (${fifthNote})`   },
        ].map(({ color, label }) => (
          <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, display: 'inline-block' }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
