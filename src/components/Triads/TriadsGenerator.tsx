import { useState, useMemo, useEffect } from 'react';
import { Note as TonalNote } from '@tonaljs/tonal';
import { MiniFretboard } from '../Fretboard/MiniFretboard';
import { fretToNote, CHROMATIC, STANDARD_OPEN_MIDI, ALL_NOTES } from '../../utils/musicTheory';
import { playScale } from '../../utils/audioPlayback';
import { T, card, alpha } from '../../theme';
import { TwoPane } from '../desktop/TwoPane';
import type { Note } from '../../types/music';

const OPEN_MIDI = STANDARD_OPEN_MIDI;

type TriadType = 'major' | 'minor' | 'diminished' | 'augmented';
type Degree    = 'root' | 'third' | 'fifth';
type DisplayMode = 'notes' | 'intervals';
type FretArea  = 'all' | '1-4' | '5-8' | '9-12';
type SortMode  = 'strings' | 'position';

interface TriadDef {
  label: string;
  suffix: string;
  intervals: [number, number, number];
  intervalLabels: [string, string, string];
}

const TRIADS: Record<TriadType, TriadDef> = {
  major:      { label: 'Major',      suffix: '',  intervals: [0, 4, 7], intervalLabels: ['1', '3',  '5' ] },
  minor:      { label: 'Minor',      suffix: 'm', intervals: [0, 3, 7], intervalLabels: ['1', '♭3', '5' ] },
  diminished: { label: 'Diminished', suffix: '°', intervals: [0, 3, 6], intervalLabels: ['1', '♭3', '♭5'] },
  augmented:  { label: 'Augmented',  suffix: '+', intervals: [0, 4, 8], intervalLabels: ['1', '3',  '♯5'] },
};

const DEGREE_COLORS: Record<Degree, string> = {
  root:  T.primary,
  third: T.secondary,
  fifth: '#5C5650',
};

const DEGREES: Degree[] = ['root', 'third', 'fifth'];
const INVERSION_LABELS  = ['Root', '1st Inv', '2nd Inv'] as const;
const INV_SHORT_LABELS  = ['Root', '1st', '2nd'] as const;

const FRET_AREAS: { id: FretArea; label: string }[] = [
  { id: 'all',  label: 'All'  },
  { id: '1-4',  label: '1–4'  },
  { id: '5-8',  label: '5–8'  },
  { id: '9-12', label: '9–12' },
];

interface StringSetInfo { label: string; strings: [number, number, number] }

const STRING_SETS: StringSetInfo[] = [
  { label: 'G·B·E', strings: [3, 4, 5] },
  { label: 'D·G·B', strings: [2, 3, 4] },
  { label: 'A·D·G', strings: [1, 2, 3] },
  { label: 'E·A·D', strings: [0, 1, 2] },
];

interface PosDot { string: number; fret: number; degree: Degree }

interface ExpandedCard {
  globalIdx:    number;
  setIdx:       number;
  inv:          0 | 1 | 2;
  chordName:    string;
  setLabel:     string;
  invLabel:     string;
  fretBadge:    string;
  minFret:      number;
  fretPositions: { string: number; fret: number }[];
  colors:       string[];
  labels:       string[];
  shape:        PosDot[];
}

function getTriadNotes(root: string, intervals: [number, number, number]): [string, string, string] {
  const rootIdx = CHROMATIC.indexOf(root);
  if (rootIdx === -1) return [root, root, root];
  return intervals.map(i => CHROMATIC[(rootIdx + i) % 12]) as [string, string, string];
}

// Cap at fret 12 — nothing beyond that.
function fretsForNote(stringIdx: number, note: string): number[] {
  const openMidi  = OPEN_MIDI[stringIdx];
  const targetPc  = CHROMATIC.indexOf(note);
  if (targetPc === -1) return [];
  const result: number[] = [];
  for (let f = 1; f <= 12; f++) {
    if ((openMidi + f) % 12 === targetPc) result.push(f);
  }
  return result;
}

function findShape(
  root: string,
  intervals: [number, number, number],
  strings: [number, number, number],
  inversion: 0 | 1 | 2,
): PosDot[] | null {
  const notes     = getTriadNotes(root, intervals);
  const bassIdx   = inversion;
  const remaining = [0, 1, 2].filter(i => i !== bassIdx) as [number, number];

  let best: PosDot[] | null = null;
  let bestMin = Infinity;

  for (const bassFret of fretsForNote(strings[0], notes[bassIdx])) {
    const lo = bassFret - 4, hi = bassFret + 4;
    for (const [midIdx, topIdx] of [
      [remaining[0], remaining[1]],
      [remaining[1], remaining[0]],
    ] as [number, number][]) {
      const mids = fretsForNote(strings[1], notes[midIdx]).filter(f => f >= lo && f <= hi);
      const tops = fretsForNote(strings[2], notes[topIdx]).filter(f => f >= lo && f <= hi);
      for (const mf of mids) {
        for (const tf of tops) {
          const span = Math.max(bassFret, mf, tf) - Math.min(bassFret, mf, tf);
          if (span <= 3) {
            const minF = Math.min(bassFret, mf, tf);
            if (minF < bestMin) {
              bestMin = minF;
              best = [
                { string: strings[0], fret: bassFret, degree: DEGREES[bassIdx] },
                { string: strings[1], fret: mf,       degree: DEGREES[midIdx]  },
                { string: strings[2], fret: tf,       degree: DEGREES[topIdx]  },
              ];
            }
          }
        }
      }
    }
  }
  return best;
}

// A shape is "in area" when its lowest fret falls within the range.
function shapeInArea(shape: PosDot[], area: FretArea): boolean {
  if (area === 'all') return true;
  const bounds: Record<string, [number, number]> = {
    '1-4': [1, 4], '5-8': [5, 8], '9-12': [9, 12],
  };
  const [lo, hi] = bounds[area];
  const minFret = Math.min(...shape.map(p => p.fret));
  return minFret >= lo && minFret <= hi;
}

// ── Filter pill helper ────────────────────────────────────────────────────────
function pill(active: boolean, onClick: () => void, label: string) {
  return (
    <button key={label} onClick={onClick} style={{
      padding: '4px 10px', borderRadius: 0, cursor: 'pointer',
      fontSize: 11, fontWeight: active ? 500 : 400,
      background: active ? T.text : T.bgInput,
      color:      active ? T.bgDeep : T.textMuted,
      border:     active ? 'none' : `1px solid ${T.border}`,
      borderLeft: '3px solid var(--gc-bar-color)',
    }}>{label}</button>
  );
}

export function TriadsGenerator({ desktop }: { desktop?: boolean } = {}) {
  const [root,               setRoot]               = useState<Note>('C');
  const [triadType,          setTriadType]          = useState<TriadType | null>(null);
  const [triadMenuOpen,      setTriadMenuOpen]      = useState(false);
  const [selectedSet,        setSelectedSet]        = useState<number | null>(null);
  const [displayMode,        setDisplayMode]        = useState<DisplayMode>('notes');
  const [selectedInversion,  setSelectedInversion]  = useState<0 | 1 | 2 | null>(null);
  const [selectedArea,       setSelectedArea]       = useState<FretArea>('all');
  const [expandedIdx,        setExpandedIdx]        = useState<number | null>(null);
  const [filtersOpen,        setFiltersOpen]        = useState(false);
  const [sortMode,           setSortMode]           = useState<SortMode>('strings');
  const [sortOpen,           setSortOpen]           = useState(false);

  const def   = triadType ? TRIADS[triadType] : null;
  const notes = useMemo(() => def ? getTriadNotes(root, def.intervals) : ([] as string[]), [root, def]);

  const allShapes = useMemo(() =>
    def ? STRING_SETS.map(ss =>
      ([0, 1, 2] as const).map(inv => findShape(root, def.intervals, ss.strings, inv))
    ) : [],
    [root, def]
  );

  // Flat ordered list of every visible card — drives the expand/navigate modal.
  const allVisibleCards = useMemo<ExpandedCard[]>(() => {
    if (!def) return [];
    const sets      = selectedSet        !== null ? [selectedSet]        : [0, 1, 2, 3];
    const inversions: (0|1|2)[] =
      selectedInversion !== null ? [selectedInversion] : [0, 1, 2];

    const cards: ExpandedCard[] = [];
    sets.forEach(setIdx => {
      const ss     = STRING_SETS[setIdx];
      const shapes = allShapes[setIdx];
      inversions.forEach(inv => {
        const shape = shapes[inv];
        if (!shape || !shapeInArea(shape, selectedArea)) return;

        const fretPositions = shape.map(p => ({ string: p.string, fret: p.fret }));
        const colors        = shape.map(p => DEGREE_COLORS[p.degree]);
        const labels        = shape.map(p =>
          displayMode === 'notes'
            ? fretToNote(p.string, p.fret)
            : (def?.intervalLabels[DEGREES.indexOf(p.degree)] ?? '')
        );
        const frets     = shape.map(p => p.fret);
        const minFret   = Math.min(...frets);
        const maxFret   = Math.max(...frets);
        const fretBadge = minFret === maxFret ? `fr ${minFret}` : `fr ${minFret}–${maxFret}`;

        cards.push({
          globalIdx: cards.length,
          setIdx, inv,
          chordName: `${root}${def!.suffix}`,
          setLabel:  ss.label,
          invLabel:  INVERSION_LABELS[inv],
          fretBadge, minFret, fretPositions, colors, labels, shape,
        });
      });
    });
    return cards;
  }, [allShapes, selectedSet, selectedInversion, selectedArea, displayMode, root, def]);

  // Keep expandedIdx in bounds when filters change.
  const safeIdx      = expandedIdx !== null
    ? Math.min(expandedIdx, allVisibleCards.length - 1)
    : null;
  const expandedCard = safeIdx !== null && safeIdx >= 0
    ? allVisibleCards[safeIdx] : null;

  useEffect(() => {
    if (safeIdx === null) return;
    const total = allVisibleCards.length;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape')      setExpandedIdx(null);
      if (e.key === 'ArrowRight')  setExpandedIdx(i => i !== null && i < total - 1 ? i + 1 : i);
      if (e.key === 'ArrowLeft')   setExpandedIdx(i => i !== null && i > 0 ? i - 1 : i);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [safeIdx, allVisibleCards.length]);

  const handlePlay = () => {
    const midi = [...notes, notes[0]].map(n => TonalNote.midi(`${n}4`) ?? 60);
    playScale(midi);
  };

  // Sorted flat list — used when sortMode === 'position'.
  const sortedCards = useMemo(() =>
    sortMode === 'position'
      ? [...allVisibleCards].sort((a, b) => a.minFret - b.minFret || a.setIdx - b.setIdx)
      : allVisibleCards,
    [allVisibleCards, sortMode],
  );

  // Group visible cards by setIdx for rendering.
  const cardsBySet = useMemo(() => {
    const map = new Map<number, ExpandedCard[]>();
    allVisibleCards.forEach(c => {
      const arr = map.get(c.setIdx) ?? [];
      arr.push(c);
      map.set(c.setIdx, arr);
    });
    return map;
  }, [allVisibleCards]);

  const visibleSets = selectedSet !== null ? [selectedSet] : [0, 1, 2, 3];

  const triadsLeft = (
    <>
      {/* Root selector */}
      <div style={card()}>
        <p style={{ margin: '0 0 8px', fontSize: 11, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '-0.02em' }}>Root Note</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
          {ALL_NOTES.map(n => {
            const sharp = n.includes('#'), sel = n === root;
            return (
              <button key={n} onClick={() => setRoot(n)} style={{
                padding: '9px 4px', borderRadius: 0, cursor: 'pointer',
                fontSize: sharp ? 11 : 13, fontWeight: sel ? 500 : 400,
                border:      sel ? `2px solid ${T.primary}` : `2px solid transparent`,
                background:  sel ? T.primaryBg : sharp ? T.bgInput : T.bgCard,
                color:       sel ? T.primary   : sharp ? T.textMuted : T.text,
                transition: 'all 0.12s', borderLeft: '3px solid var(--gc-bar-color)',
              }}>{n}</button>
            );
          })}
        </div>
      </div>

      {/* Triad type — collapsible */}
      <div>
        <button
          onClick={() => setTriadMenuOpen(o => !o)}
          style={{
            width: '100%', padding: '11px 16px', borderRadius: 0, cursor: 'pointer',
            background: T.secondary, color: '#fff',
            fontSize: 13, fontWeight: 400, textAlign: 'left',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            borderLeft: '3px solid var(--gc-bar-color)',
          }}
        >
          <span>
            <span style={{ opacity: 0.6, fontSize: 11, fontWeight: 400, marginRight: 8, textTransform: 'uppercase', letterSpacing: '-0.02em' }}>Triad Type</span>
            {triadType ? TRIADS[triadType].label : '— Select —'}
          </span>
          <span style={{ fontSize: 11 }}>{triadMenuOpen ? '▲' : '▼'}</span>
        </button>

        {triadMenuOpen && (
          <div style={{ ...card(), marginTop: 2 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
              {(Object.entries(TRIADS) as [TriadType, TriadDef][]).map(([type, d]) => {
                const sel = triadType === type;
                return (
                  <button key={type} onClick={() => { setTriadType(type); setTriadMenuOpen(false); }} style={{
                    padding: '9px 10px', borderRadius: 0, cursor: 'pointer', textAlign: 'left',
                    border:      sel ? `2px solid ${T.secondary}` : `1px solid ${T.border}`,
                    background:  sel ? T.secondaryBg : T.bgInput,
                    color:       sel ? T.secondary   : T.textMuted,
                    transition: 'all 0.12s', borderLeft: '3px solid var(--gc-bar-color)',
                  }}>
                    <span style={{ fontSize: 13, fontWeight: 400 }}>{d.label}</span>
                    <span style={{ fontSize: 10, marginLeft: 6, opacity: 0.7 }}>{d.intervalLabels.join(' · ')}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </>
  );

  const triadsRight = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Chord summary + controls */}
      {def && <div style={card({ padding: '10px 14px' })}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 20, fontWeight: 800, color: T.text }}>{root}{def.suffix}</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => setDisplayMode(m => m === 'notes' ? 'intervals' : 'notes')}
              title={displayMode === 'notes' ? 'Show intervals' : 'Show note names'}
              style={{ padding: '4px 11px', borderRadius: 0, cursor: 'pointer', fontSize: 11, fontWeight: 400, border: `1px solid ${T.border}`, background: T.bgInput, color: T.textMuted, borderLeft: '3px solid var(--gc-bar-color)' }}
            >{displayMode === 'notes' ? '1·3·5' : 'A·B·C'}</button>
            <button onClick={handlePlay} style={{ padding: '4px 12px', borderRadius: 0, border: `1px solid ${T.secondary}`, background: T.secondaryBg, color: T.secondary, fontSize: 12, fontWeight: 400, cursor: 'pointer', borderLeft: '3px solid var(--gc-bar-color)' }}>PLAY</button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {notes.map((n, i) => {
            const color = DEGREE_COLORS[DEGREES[i]];
            return (
              <div key={i} style={{ flex: 1, textAlign: 'center', padding: '6px', borderRadius: 0, background: T.bgInput, border: `1px solid ${color}44` }}>
                <div style={{ fontSize: 9, fontWeight: 400, color, lineHeight: 1 }}>{def!.intervalLabels[i]}</div>
                <div style={{ fontSize: 17, fontWeight: 800, color: T.text, lineHeight: 1.3 }}>{n}</div>
              </div>
            );
          })}
        </div>
      </div>}

      {/* ── Filters + Sort by ────────────────────────────────────────────── */}
      {def && <>

      {(() => {
        const activeLabels = [
          selectedSet       !== null  ? STRING_SETS[selectedSet].label      : null,
          selectedInversion !== null  ? INV_SHORT_LABELS[selectedInversion] : null,
          selectedArea      !== 'all' ? selectedArea                        : null,
        ].filter(Boolean) as string[];
        return (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>

            {/* Filters — flex 1 */}
            <div style={{ flex: 1, ...card({ padding: 0 }), overflow: 'hidden' }}>
              <button
                onClick={() => { setFiltersOpen(o => !o); setSortOpen(false); }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '9px 12px', border: 'none', background: 'transparent', cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ fontSize: 12, fontWeight: 400, color: T.text }}>Filters</span>
                  {activeLabels.length > 0 && (
                    <span style={{
                      fontSize: 10, fontWeight: 400, color: T.primary,
                      background: T.primaryBg, border: `1px solid ${alpha(T.primary, 33)}`,
                      padding: '1px 6px', borderRadius: 0,
                    }}>{activeLabels.join(' · ')}</span>
                  )}
                </div>
                <span style={{ fontSize: 12, color: T.textMuted, transform: filtersOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
              </button>

              {filtersOpen && (
                <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 8, borderTop: `1px solid ${T.border}` }}>
                  <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap', paddingTop: 10 }}>
                    <span style={{ fontSize: 10, color: T.textMuted, minWidth: 56 }}>Strings:</span>
                    {pill(selectedSet === null, () => setSelectedSet(null), 'All')}
                    {STRING_SETS.map((ss, i) => pill(
                      selectedSet === i,
                      () => setSelectedSet(selectedSet === i ? null : i),
                      ss.label,
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, color: T.textMuted, minWidth: 56 }}>Inversion:</span>
                    {pill(selectedInversion === null, () => setSelectedInversion(null), 'All')}
                    {([0, 1, 2] as const).map(inv => pill(
                      selectedInversion === inv,
                      () => setSelectedInversion(selectedInversion === inv ? null : inv),
                      INV_SHORT_LABELS[inv],
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, color: T.textMuted, minWidth: 56 }}>Position:</span>
                    {FRET_AREAS.map(a => pill(
                      selectedArea === a.id,
                      () => setSelectedArea(a.id),
                      a.label,
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Sort by */}
            <div style={{ ...card({ padding: 0 }), overflow: 'hidden', flexShrink: 0, minWidth: 100 }}>
              <button
                onClick={() => { setSortOpen(o => !o); setFiltersOpen(false); }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '9px 12px', border: 'none', background: 'transparent', cursor: 'pointer', gap: 6,
                }}
              >
                <div>
                  <div style={{ fontSize: 10, color: T.textMuted, lineHeight: 1, marginBottom: 2 }}>Sort by</div>
                  <div style={{ fontSize: 12, fontWeight: 400, color: T.text, lineHeight: 1 }}>
                    {sortMode === 'strings' ? 'Strings' : 'Position'}
                  </div>
                </div>
                <span style={{ fontSize: 12, color: T.textMuted, transform: sortOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>▾</span>
              </button>

              {sortOpen && (
                <div style={{ padding: '6px 10px 10px', display: 'flex', flexDirection: 'column', gap: 4, borderTop: `1px solid ${T.border}` }}>
                  {pill(sortMode === 'strings',   () => { setSortMode('strings');   setSortOpen(false); }, 'Strings'  )}
                  {pill(sortMode === 'position',  () => { setSortMode('position');  setSortOpen(false); }, 'Position' )}
                </div>
              )}
            </div>

          </div>
        );
      })()}

      {/* ── Shape grid ───────────────────────────────────────────────────── */}
      {sortMode === 'position' ? (
        // Flat grid sorted by fret position
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {sortedCards.map(c => (
            <div key={`${c.setIdx}_${c.inv}`}
              onClick={() => setExpandedIdx(c.globalIdx)}
              style={{ ...card({ padding: '10px 8px 7px' }), display: 'flex', flexDirection: 'column', gap: 4, cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 10, fontWeight: 400, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {c.setLabel}
                </span>
                <span style={{ fontSize: 11, fontWeight: 400, color: T.text, background: T.bgDeep, border: `1px solid ${T.border}`, padding: '1px 7px', borderRadius: 0 }}>
                  {c.fretBadge}
                </span>
              </div>
              <span style={{ fontSize: 9, color: T.textMuted, textAlign: 'center', marginTop: -2 }}>{INVERSION_LABELS[c.inv]}</span>
              <MiniFretboard voicing={c.fretPositions} dotColors={c.colors} dotLabels={c.labels} hideFretLabel showStringLabels showFretNumbers />
              <div style={{ display: 'flex', gap: 3, justifyContent: 'center', flexWrap: 'wrap' }}>
                {[...c.shape].sort((a, b) => a.string - b.string).map((p, j) => (
                  <span key={j} style={{
                    fontSize: 8, fontWeight: 400,
                    color:      DEGREE_COLORS[p.degree],
                    background: alpha(DEGREE_COLORS[p.degree], 9),
                    padding: '1px 4px', borderRadius: 0,
                  }}>{fretToNote(p.string, p.fret)}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        // Grouped by string set (default)
        visibleSets.map(setIdx => {
          const ss    = STRING_SETS[setIdx];
          const cards = cardsBySet.get(setIdx) ?? [];
          if (cards.length === 0) return null;

          return (
            <div key={setIdx}>
              <p style={{ margin: '0 0 6px 2px', fontSize: 11, fontWeight: 400, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {ss.label}
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cards.length}, 1fr)`, gap: 8 }}>
                {cards.map(c => (
                  <div key={`${c.setIdx}_${c.inv}`}
                    onClick={() => setExpandedIdx(c.globalIdx)}
                    style={{ ...card({ padding: '10px 8px 7px' }), display: 'flex', flexDirection: 'column', gap: 4, cursor: 'pointer' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 10, fontWeight: 400, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {INVERSION_LABELS[c.inv]}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 400, color: T.text, background: T.bgDeep, border: `1px solid ${T.border}`, padding: '1px 7px', borderRadius: 0 }}>
                        {c.fretBadge}
                      </span>
                    </div>
                    <MiniFretboard voicing={c.fretPositions} dotColors={c.colors} dotLabels={c.labels} hideFretLabel showStringLabels showFretNumbers />
                    <div style={{ display: 'flex', gap: 3, justifyContent: 'center', flexWrap: 'wrap' }}>
                      {[...c.shape].sort((a, b) => a.string - b.string).map((p, j) => (
                        <span key={j} style={{
                          fontSize: 8, fontWeight: 400,
                          color:      DEGREE_COLORS[p.degree],
                          background: alpha(DEGREE_COLORS[p.degree], 9),
                          padding: '1px 4px', borderRadius: 0,
                        }}>{fretToNote(p.string, p.fret)}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}

      {/* Legend */}
      <div style={{ display: 'flex', gap: 14, fontSize: 11, color: T.textMuted, flexWrap: 'wrap', paddingBottom: 4 }}>
        {DEGREES.map((deg, i) => (
          <span key={deg} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 9, height: 9, borderRadius: 0, background: DEGREE_COLORS[deg], display: 'inline-block' }} />
            {def?.intervalLabels[i]} ({notes[i]})
          </span>
        ))}
      </div>
      </>}

      {/* ── Expanded card modal (mobile + desktop) ───────────────────────── */}
      {expandedCard && (
        <div
          onClick={() => setExpandedIdx(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.72)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '20px 16px',
          }}
        >
          <div onClick={e => e.stopPropagation()} style={{
            background: T.bgCard,
            border:     `1px solid ${T.border}`,
            borderRadius: 0,
            padding: '18px 18px 14px',
            width: '100%', maxWidth: 440,
            display: 'flex', flexDirection: 'column', gap: 14,
            boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
          }}>

            {/* Header row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 28, fontWeight: 900, color: T.text, lineHeight: 1 }}>
                  {expandedCard.chordName}
                </div>
                <div style={{ fontSize: 12, color: T.textMuted, marginTop: 3 }}>
                  {expandedCard.setLabel} · {expandedCard.invLabel} · <span style={{ color: T.text, fontWeight: 400 }}>{expandedCard.fretBadge}</span>
                </div>
              </div>
              <button onClick={() => setExpandedIdx(null)} style={{
                width: 32, height: 32, borderRadius: 0,
                border: `1px solid ${T.border}`,
                background: T.bgInput, color: T.textMuted,
                fontSize: 18, cursor: 'pointer', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>×</button>
            </div>

            {/* Large fretboard */}
            <div style={{ background: T.bgDeep, borderRadius: 0, padding: '16px 12px 12px' }}>
              <MiniFretboard
                voicing={expandedCard.fretPositions}
                dotColors={expandedCard.colors}
                dotLabels={expandedCard.labels}
                hideFretLabel showStringLabels showFretNumbers
              />
            </div>

            {/* Note badges */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              {[...expandedCard.shape].sort((a, b) => a.string - b.string).map((p, j) => (
                <span key={j} style={{
                  fontSize: 13, fontWeight: 800,
                  color:      DEGREE_COLORS[p.degree],
                  background: alpha(DEGREE_COLORS[p.degree], 13),
                  border:     `1px solid ${alpha(DEGREE_COLORS[p.degree], 33)}`,
                  padding: '4px 12px', borderRadius: 0,
                }}>{fretToNote(p.string, p.fret)}</span>
              ))}
            </div>

            {/* Navigation row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <button
                disabled={safeIdx === 0}
                onClick={() => setExpandedIdx(i => i !== null ? i - 1 : i)}
                style={{
                  flex: 1, padding: '8px 0', borderRadius: 0, cursor: safeIdx === 0 ? 'default' : 'pointer',
                  border: `1px solid ${T.border}`, background: T.bgInput,
                  color: safeIdx === 0 ? T.textDim : T.text,
                  fontSize: 18, fontWeight: 400, borderLeft: '3px solid var(--gc-bar-color)',
                }}
              >‹</button>

              <span style={{ fontSize: 10, color: T.textMuted, textAlign: 'center', minWidth: 48 }}>
                {(safeIdx ?? 0) + 1} / {allVisibleCards.length}
              </span>

              <button
                disabled={safeIdx === allVisibleCards.length - 1}
                onClick={() => setExpandedIdx(i => i !== null ? i + 1 : i)}
                style={{
                  flex: 1, padding: '8px 0', borderRadius: 0,
                  cursor: safeIdx === allVisibleCards.length - 1 ? 'default' : 'pointer',
                  border: `1px solid ${T.border}`, background: T.bgInput,
                  color: safeIdx === allVisibleCards.length - 1 ? T.textDim : T.text,
                  fontSize: 18, fontWeight: 400, borderLeft: '3px solid var(--gc-bar-color)',
                }}
              >›</button>
            </div>

            {/* Degree legend */}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', fontSize: 11, color: T.textMuted }}>
              {DEGREES.map((deg, i) => (
                <span key={deg} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 0, background: DEGREE_COLORS[deg], display: 'inline-block' }} />
                  {def?.intervalLabels[i]} ({notes[i]})
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {!def && desktop && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200, color: T.textDim, fontSize: 13, fontFamily: 'var(--gc-mono)', letterSpacing: '0.04em' }}>
          ← Select root + triad type
        </div>
      )}
    </div>
  );

  if (desktop) {
    return <TwoPane left={triadsLeft} right={triadsRight} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {triadsLeft}
      {triadsRight}
    </div>
  );
}
