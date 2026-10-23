import { useState, useMemo, useEffect, useRef } from 'react';
import { Note as TonalNote, Chord as TonalChord } from '@tonaljs/tonal';
import { MiniFretboard } from '../Fretboard/MiniFretboard';
import { fretToNote, CHROMATIC, STANDARD_OPEN_MIDI, ALL_NOTES } from '../../utils/musicTheory';
import { playScale, playChord } from '../../utils/audioPlayback';
import { T } from '../../theme';
import { Rule, Pill, PillRow, KeyGrid, Formula } from '../Transit/parts';
import { StopActions } from '../Transit/StopActions';
import { Neck, type NeckDot } from '../Fretboard/Neck';
import { useLang } from '../../contexts/LanguageContext';
import { TwoPane } from '../desktop/TwoPane';
import type { Note, ChordInProgression } from '../../types/music';
import { previewVoicing, previewRun, pcToMidi } from '../../utils/previewSound';
import { useOptionalSong } from '../../song/SongContext';
import { DiceButton } from '../DiceButton';
import { pickOne } from '../../utils/random';

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

// Monochrome degrees: the root is the one cobalt thing, the third ink, the
// fifth grey.
const DEGREE_COLORS: Record<Degree, string> = {
  root:  T.primary,
  third: T.secondary,
  fifth: T.coral,
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

// Scan to fret 15, not 12: a triad can straddle the 12th-fret octave (e.g. a C
// shape at 12–13), and stopping at 12 drops the note above it so the whole
// shape is discarded. 12 (anchor) + max 3-fret span = 15.
function fretsForNote(stringIdx: number, note: string): number[] {
  const openMidi  = OPEN_MIDI[stringIdx];
  const targetPc  = CHROMATIC.indexOf(note);
  if (targetPc === -1) return [];
  const result: number[] = [];
  for (let f = 1; f <= 15; f++) {
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

// Immutable toggle for Set-based multi-select filters.
function toggleInSet<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value); else next.add(value);
  return next;
}

export function TriadsGenerator({ desktop, globalProgression }: { desktop?: boolean; globalProgression?: ChordInProgression[] } = {}) {
  const { lang } = useLang();
  const he = lang === 'he';
  const [root,               setRoot]               = useState<Note>('C');
  // Same reason as Scale Explorer: open on something, not on a prompt.
  const [triadType,          setTriadType]          = useState<TriadType | null>('major');
  // Chords imported from the user's progression (Chords tab). Click one to load
  // its root + closest triad quality into the generator.
  const [imported,           setImported]           = useState<string[] | null>(null);
  const loadChord = (name: string) => {
    const info = TonalChord.get(name);
    if (!info.tonic) return;
    const chroma = TonalNote.chroma(info.tonic);
    if (chroma == null) return;
    const type: TriadType =
      info.quality === 'Minor'      ? 'minor'
      : info.quality === 'Diminished' ? 'diminished'
      : info.quality === 'Augmented'  ? 'augmented'
      : 'major';
    setRoot(ALL_NOTES[chroma] as Note);
    setTriadType(type);
  };
  // Opens on the chord tapped in the song dock (or the song key's tonic triad)
  // and follows it; picking something here stands until that changes.
  const song = useOptionalSong();
  const follow = song?.selectedChord?.chord.name
    ?? (song?.key ? `${['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'][song.key.tonicPc]}${song.key.mode === 'minor' ? 'm' : ''}` : '');
  const [seenFollow, setSeenFollow] = useState('');
  if (follow !== seenFollow) {
    setSeenFollow(follow);
    if (follow) {
      const info = TonalChord.get(follow);
      const chroma = info.tonic ? TonalNote.chroma(info.tonic) : null;
      if (chroma != null) {
        setRoot(ALL_NOTES[chroma] as Note);
        setTriadType(info.quality === 'Minor' ? 'minor' : info.quality === 'Diminished' ? 'diminished' : info.quality === 'Augmented' ? 'augmented' : 'major');
      }
    }
  }

  // Multi-select filters — an empty Set means "All" (no restriction).
  const [selectedSets,       setSelectedSets]       = useState<Set<number>>(new Set());
  const [displayMode,        setDisplayMode]        = useState<DisplayMode>('notes');
  const [selectedInversions, setSelectedInversions] = useState<Set<0 | 1 | 2>>(new Set());
  const [selectedAreas,      setSelectedAreas]      = useState<Set<Exclude<FretArea, 'all'>>>(new Set());
  const [expandedIdx,        setExpandedIdx]        = useState<number | null>(null);
  const [filtersOpen,        setFiltersOpen]        = useState(false);
  const [sortMode,           setSortMode]           = useState<SortMode>('strings');

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
    const sets       = selectedSets.size ? [0, 1, 2, 3].filter(i => selectedSets.has(i)) : [0, 1, 2, 3];
    const inversions: (0 | 1 | 2)[] =
      selectedInversions.size ? ([0, 1, 2] as const).filter(i => selectedInversions.has(i)) : [0, 1, 2];

    const cards: ExpandedCard[] = [];
    sets.forEach(setIdx => {
      const ss     = STRING_SETS[setIdx];
      const shapes = allShapes[setIdx];
      inversions.forEach(inv => {
        const shape = shapes[inv];
        if (!shape) return;
        // Empty area set = all positions; otherwise the shape must sit in one.
        const areaOk = selectedAreas.size === 0 || [...selectedAreas].some(a => shapeInArea(shape, a));
        if (!areaOk) return;

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
  }, [allShapes, selectedSets, selectedInversions, selectedAreas, displayMode, root, def]);

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

  const roll = () => {
    const r = pickOne(ALL_NOTES) as Note;
    const type = pickOne(Object.keys(TRIADS) as TriadType[]);
    setRoot(r); setTriadType(type); hearTriad(r, type);
  };

  // A new root or quality is heard at once, as a close triad from the root up.
  const hearTriad = (r: string | null, type: TriadType | null) => {
    if (!r || !type) return;
    const base = pcToMidi(r, 3);
    if (base != null) previewRun(TRIADS[type].intervals.map(i => base + i));
  };

  // Walk the neck: every shape on screen, lowest fret first — each lights on
  // its diagram as it sounds, so the triad is heard climbing the neck.
  const [walking, setWalking] = useState(false);
  const walkTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => walkTimers.current.forEach(clearTimeout), []);
  const walkNeck = () => {
    walkTimers.current.forEach(clearTimeout); walkTimers.current = [];
    if (walking) { setWalking(false); return; }
    const route = [...allVisibleCards].sort((a, b) => a.minFret - b.minFret || a.setIdx - b.setIdx);
    if (!route.length) return;
    setWalking(true);
    route.forEach((c, i) => walkTimers.current.push(setTimeout(() => playChord(c.fretPositions), i * 650)));
    walkTimers.current.push(setTimeout(() => setWalking(false), route.length * 650 + 400));
  };

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

  const visibleSets = selectedSets.size ? [0, 1, 2, 3].filter(i => selectedSets.has(i)) : [0, 1, 2, 3];

  // A small label + pills row inside the filters.
  const filterRow = (title: string, children: React.ReactNode) => (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <span className="su-label" style={{ minWidth: 76 }}>{title}</span>
      {children}
    </div>
  );

  // One shape: a square tile on a 2px rule — its inversion and frets, the
  // diagram, and the notes from low to high in their degree's ink.
  const shapeTile = (c: ExpandedCard, top: string) => (
    <button key={`${c.setIdx}_${c.inv}`} type="button"
      onClick={() => { setExpandedIdx(c.globalIdx); previewVoicing(c.fretPositions); }}
      aria-label={`${c.chordName} · ${c.setLabel} · ${c.invLabel} · ${c.fretBadge}`}
      className="gc-pressable gc-no-bar"
      style={{
        display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, cursor: 'pointer', textAlign: 'start',
        background: 'transparent', color: T.text, padding: '8px 0 6px', borderRadius: 0,
        borderWidth: 'var(--su-rule) 0 0 0', borderStyle: 'solid', borderColor: T.border,
      }}>
      <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6, width: '100%' }}>
        <span className="su-semi" style={{ fontSize: 15, textTransform: 'uppercase' }}>{top}</span>
        <span className="su-label" style={{ color: T.text }}>{c.fretBadge}</span>
      </span>
      <MiniFretboard voicing={c.fretPositions} dotColors={c.colors} dotLabels={c.labels} hideFretLabel showStringLabels showFretNumbers />
      <span style={{ display: 'flex', gap: 8, justifyContent: 'center', width: '100%', fontFamily: 'var(--gc-mono)', fontSize: 11, fontWeight: 700 }}>
        {[...c.shape].sort((a, b) => a.string - b.string).map((p, j) => (
          <span key={j} style={{ color: p.degree === 'fifth' ? T.textMuted : p.degree === 'root' ? T.primary : T.text }}>
            {fretToNote(p.string, p.fret)}
          </span>
        ))}
      </span>
    </button>
  );

  const legend = (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 11, fontFamily: 'var(--gc-mono)' }}>
      {DEGREES.map((deg, i) => (
        <span key={deg} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span aria-hidden style={{ width: 12, height: 12, borderRadius: '50%', background: DEGREE_COLORS[deg], display: 'inline-block' }} />
          {def?.intervalLabels[i]} · {notes[i]}
        </span>
      ))}
    </div>
  );

  const triadsLeft = (
    <>
      {/* Import from the user's progression */}
      {globalProgression && globalProgression.length > 0 && (
        <Rule label={he ? 'מהמהלך שלך' : 'From your progression'}
          right={<Pill size="sm" active={!!imported}
            onClick={() => setImported(imported ? null : globalProgression.map(c => c.chord.name))}>
            {imported ? (he ? 'הסתרה' : 'Hide') : `${he ? 'ייבוא' : 'Import'} (${globalProgression.length})`}
          </Pill>}>
          {imported && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {imported.map((name, i) => (
                <Pill key={i} size="sm" onClick={() => loadChord(name)} title={`Load ${name} triad`}
                  style={{ textTransform: 'none', letterSpacing: 'normal', fontSize: 13 }}>{name}</Pill>
              ))}
            </div>
          )}
        </Rule>
      )}

      {/* Root */}
      <Rule label={he ? 'תו שורש' : 'Root note'} right={<DiceButton onRoll={roll} />}>
        <KeyGrid label={he ? 'תו שורש' : 'Root note'} cols={6}
          items={ALL_NOTES.map(n => ({ id: n as Note, label: n }))}
          value={root} onChange={n => { setRoot(n); hearTriad(n, triadType); }} />
      </Rule>

      {/* Triad type */}
      <Rule label={he ? 'סוג טריאדה' : 'Triad type'}>
        <PillRow wrap label={he ? 'סוג טריאדה' : 'Triad type'}
          items={(Object.entries(TRIADS) as [TriadType, TriadDef][]).map(([type, d]) => ({
            id: type, label: d.label, title: d.intervalLabels.join(' · '),
          }))}
          value={triadType} onChange={type => { setTriadType(type); hearTriad(root, type); }} />
      </Rule>
    </>
  );

  const triadsRight = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* The chord: its name, its formula, and what to do with it */}
      {def && (
        <>
          <StopActions>
            <Pill size="sm" onClick={handlePlay}>{he ? 'נגן' : 'Play'}</Pill>
          </StopActions>
          <Rule>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
              <span className="su-poster" style={{ fontSize: desktop ? 72 : 60, textTransform: 'none' }}>{root}{def.suffix}</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Pill size="sm" active={displayMode === 'intervals'}
                  onClick={() => setDisplayMode(m => m === 'notes' ? 'intervals' : 'notes')}
                  title={displayMode === 'notes' ? 'Show intervals' : 'Show note names'}
                  label={displayMode === 'notes' ? 'Show intervals' : 'Show note names'}>1·3·5</Pill>
                <Pill size="sm" active={walking} onClick={walkNeck} title="Play every shape below, from the nut up the neck">
                  {walking ? '■ ' : ''}{he ? 'הליכה על הצוואר' : 'Walk the neck'}
                </Pill>
              </div>
            </div>
            <Formula mark={0}
              tones={notes.map((n, i) => ({ degree: def.intervalLabels[i], note: n }))}
              onTone={i => { const m = pcToMidi(notes[i], 4); if (m != null) previewRun([m]); }} />
          </Rule>
        </>
      )}

      {/* ── Filters + Sort by ────────────────────────────────────────────── */}
      {def && <>

      {(() => {
        const activeLabels = [
          ...STRING_SETS.filter((_, i) => selectedSets.has(i)).map(ss => ss.label),
          ...([0, 1, 2] as const).filter(i => selectedInversions.has(i)).map(i => INV_SHORT_LABELS[i]),
          ...FRET_AREAS.filter(a => a.id !== 'all' && selectedAreas.has(a.id as Exclude<FretArea, 'all'>)).map(a => a.label),
        ];
        return (
          <Rule
            label={<>{he ? 'סינון' : 'Filters'}{activeLabels.length > 0 && <span style={{ color: T.text }}> · {activeLabels.join(' · ')}</span>}</>}
            right={
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <Pill size="sm" active={filtersOpen} onClick={() => setFiltersOpen(o => !o)}>
                  {filtersOpen ? (he ? 'סגירה' : 'Close') : (he ? 'סינון' : 'Filter')}
                </Pill>
              </div>
            }>
            {filtersOpen && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                {filterRow(he ? 'מיתרים' : 'Strings', <>
                  <Pill size="sm" active={selectedSets.size === 0} onClick={() => setSelectedSets(new Set())}>All</Pill>
                  {STRING_SETS.map((ss, i) => (
                    <Pill key={ss.label} size="sm" active={selectedSets.has(i)} onClick={() => setSelectedSets(s => toggleInSet(s, i))}>{ss.label}</Pill>
                  ))}
                </>)}
                {filterRow(he ? 'היפוך' : 'Inversion', <>
                  <Pill size="sm" active={selectedInversions.size === 0} onClick={() => setSelectedInversions(new Set())}>All</Pill>
                  {([0, 1, 2] as const).map(inv => (
                    <Pill key={inv} size="sm" active={selectedInversions.has(inv)} onClick={() => setSelectedInversions(s => toggleInSet(s, inv))}>{INV_SHORT_LABELS[inv]}</Pill>
                  ))}
                </>)}
                {filterRow(he ? 'מיקום' : 'Position', <>
                  {FRET_AREAS.map(a => a.id === 'all'
                    ? <Pill key={a.id} size="sm" active={selectedAreas.size === 0} onClick={() => setSelectedAreas(new Set())}>{a.label}</Pill>
                    : <Pill key={a.id} size="sm" active={selectedAreas.has(a.id as Exclude<FretArea, 'all'>)}
                        onClick={() => setSelectedAreas(s => toggleInSet(s, a.id as Exclude<FretArea, 'all'>))}>{a.label}</Pill>)}
                </>)}
              </div>
            )}
            {filterRow(he ? 'מיון' : 'Sort by', (
              <PillRow label={he ? 'מיון' : 'Sort by'} value={sortMode} onChange={setSortMode}
                items={[{ id: 'strings', label: he ? 'מיתרים' : 'Strings' }, { id: 'position', label: he ? 'מיקום' : 'Position' }]} />
            ))}
          </Rule>
        );
      })()}

      {/* ── Shape grid ───────────────────────────────────────────────────── */}
      {sortMode === 'position' ? (
        // Flat grid sorted by fret position
        <div style={{ display: 'grid', gridTemplateColumns: desktop ? 'repeat(3, minmax(0, 1fr))' : 'repeat(2, minmax(0, 1fr))', gap: '14px 12px' }}>
          {sortedCards.map(c => shapeTile(c, `${c.setLabel} · ${INV_SHORT_LABELS[c.inv]}`))}
        </div>
      ) : (
        // Grouped by string set (default)
        visibleSets.map(setIdx => {
          const ss    = STRING_SETS[setIdx];
          const cards = cardsBySet.get(setIdx) ?? [];
          if (cards.length === 0) return null;
          return (
            <div key={setIdx}>
              <p className="su-label" style={{ margin: '0 0 6px', color: T.text }}>{ss.label}</p>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cards.length}, minmax(0, 1fr))`, gap: 12 }}>
                {cards.map(c => shapeTile(c, INV_SHORT_LABELS[c.inv]))}
              </div>
            </div>
          );
        })
      )}

      {legend}
      </>}

      {/* ── Expanded shape (mobile + desktop) ────────────────────────────── */}
      {expandedCard && (() => {
        const frets = expandedCard.shape.map(p => p.fret);
        const from = Math.max(0, Math.min(...frets) - 1);
        const to = Math.max(from + 4, Math.max(...frets) + 1);
        const neckDots: NeckDot[] = expandedCard.shape.map((p, j) => ({
          string: p.string, fret: p.fret, id: `${p.string}`,
          kind: p.degree === 'root' ? 'root' : 'tone', label: expandedCard.labels[j],
        }));
        const atStart = safeIdx === 0, atEnd = safeIdx === allVisibleCards.length - 1;
        return (
          <div onClick={() => setExpandedIdx(null)} style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'color-mix(in srgb, var(--gc-text) 55%, transparent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px 16px',
          }}>
            <div role="dialog" aria-modal="true" aria-label={`${expandedCard.chordName} ${expandedCard.invLabel}`}
              onClick={e => e.stopPropagation()} style={{
              background: T.bgDeep, color: T.text, border: `var(--su-rule) solid ${T.border}`,
              padding: '18px 20px 18px', width: '100%', maxWidth: 460, maxHeight: '90vh', overflowY: 'auto',
              display: 'flex', flexDirection: 'column', gap: 16, boxSizing: 'border-box',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div className="su-poster" style={{ fontSize: 64, textTransform: 'none' }}>{expandedCard.chordName}</div>
                  <div className="su-label" style={{ marginTop: 10 }}>
                    {expandedCard.setLabel} · {expandedCard.invLabel} · <span style={{ color: T.text }}>{expandedCard.fretBadge}</span>
                  </div>
                </div>
                <Pill onClick={() => setExpandedIdx(null)} label={he ? 'סגירה' : 'Close'} style={{ padding: 0, width: 44 }}>×</Pill>
              </div>

              <div style={{ borderTop: `var(--su-rule) solid ${T.border}`, paddingTop: 12 }}>
                <Neck dots={neckDots} from={from} to={to} label={`${expandedCard.chordName} ${expandedCard.invLabel}`} />
              </div>

              <div style={{ display: 'flex', gap: 14, justifyContent: 'center', fontFamily: 'var(--gc-mono)', fontSize: 14, fontWeight: 700 }}>
                {[...expandedCard.shape].sort((a, b) => a.string - b.string).map((p, j) => (
                  <span key={j} style={{ color: p.degree === 'fifth' ? T.textMuted : p.degree === 'root' ? T.primary : T.text }}>
                    {fretToNote(p.string, p.fret)}
                  </span>
                ))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }} dir="ltr">
                <Pill disabled={atStart} onClick={() => setExpandedIdx(i => i !== null ? i - 1 : i)} label={he ? 'הצורה הקודמת' : 'Previous shape'}
                  style={{ flex: 1 }}>‹</Pill>
                <span className="su-label" style={{ minWidth: 56, textAlign: 'center', color: T.text }}>
                  {(safeIdx ?? 0) + 1} / {allVisibleCards.length}
                </span>
                <Pill disabled={atEnd} onClick={() => setExpandedIdx(i => i !== null ? i + 1 : i)} label={he ? 'הצורה הבאה' : 'Next shape'}
                  style={{ flex: 1 }}>›</Pill>
              </div>

              <div style={{ display: 'flex', justifyContent: 'center' }}>{legend}</div>
            </div>
          </div>
        );
      })()}

      {!def && desktop && (
        <div className="su-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
          ← {he ? 'בחרו שורש וסוג' : 'Select root + triad type'}
        </div>
      )}
    </div>
  );

  if (desktop) {
    return <TwoPane left={triadsLeft} right={triadsRight} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {triadsLeft}
      {triadsRight}
    </div>
  );
}
