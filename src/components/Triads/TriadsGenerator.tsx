import { useState, useMemo, useEffect, useRef } from 'react';
import { Note as TonalNote, Chord as TonalChord } from '@tonaljs/tonal';
import { MiniFretboard } from '../Fretboard/MiniFretboard';
import { fretToNote, CHROMATIC, STANDARD_OPEN_MIDI, ALL_NOTES } from '../../utils/musicTheory';
import { playScale, playChord } from '../../utils/audioPlayback';
import { T } from '../../theme';
import { Fold, Chips, ChordStage, PlayButton, SoftButton, icon } from '../ChordBuilder/Stage';
import { Sheet } from '../Workspace/Sheet';
import { formatChordName } from '../../utils/chordIdentifier';
import { StopActions } from '../Transit/StopActions';
import { Neck, type NeckDot } from '../Fretboard/Neck';
import { useLang } from '../../contexts/LanguageContext';
import type { Note, ChordInProgression } from '../../types/music';
import { previewVoicing, previewRun, pcToMidi } from '../../utils/previewSound';
import { useOptionalSong } from '../../song/SongContext';
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
const INV_HE            = ['שורש למטה', 'היפוך 1', 'היפוך 2'] as const;
const INV_HE_SHORT      = ['שורש', 'היפוך 1', 'היפוך 2'] as const;
const TYPE_HE: Record<TriadType, string> = { major: 'מז׳ור', minor: 'מינור', diminished: 'מוקטן', augmented: 'מוגדל' };

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

export function TriadsGenerator({ desktop, globalProgression }: { desktop?: boolean; globalProgression?: ChordInProgression[] } = {}) {
  const { lang } = useLang();
  const he = lang === 'he';
  const [root,               setRoot]               = useState<Note>('C');
  // Same reason as Scale Explorer: open on something, not on a prompt.
  const [triadType,          setTriadType]          = useState<TriadType | null>('major');
  // A chord from the user's song loads its root + closest triad quality.
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
  const [walkOn, setWalkOn] = useState<number | null>(null);
  const walkTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => walkTimers.current.forEach(clearTimeout), []);
  const walkNeck = () => {
    walkTimers.current.forEach(clearTimeout); walkTimers.current = [];
    if (walking) { setWalking(false); setWalkOn(null); return; }
    const route = [...allVisibleCards].sort((a, b) => a.minFret - b.minFret || a.setIdx - b.setIdx);
    if (!route.length) return;
    setWalking(true);
    route.forEach((c, i) => walkTimers.current.push(setTimeout(() => { playChord(c.fretPositions); setWalkOn(c.globalIdx); }, i * 650)));
    walkTimers.current.push(setTimeout(() => { setWalking(false); setWalkOn(null); }, route.length * 650 + 400));
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

  const small = (text: string) => <span style={{ fontSize: 13, fontWeight: 600, color: T.textMuted }}>{text}</span>;
  const noteInk = (d: Degree) => d === 'fifth' ? T.textMuted : d === 'root' ? T.tintLabel : T.text;

  // One shape: a rounded card with its inversion and frets, the diagram, and
  // the notes from low to high in their degree's ink.
  const shapeTile = (c: ExpandedCard, top: string) => (
    <button key={`${c.setIdx}_${c.inv}`} type="button"
      onClick={() => { setExpandedIdx(c.globalIdx); previewVoicing(c.fretPositions); }}
      aria-label={`${c.chordName} · ${c.setLabel} · ${c.invLabel} · ${c.fretBadge}`}
      className="gc-no-bar su-row"
      style={{
        display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, cursor: 'pointer', textAlign: 'start',
        background: 'rgba(255,255,255,0.06)', color: T.text, padding: '10px 10px 8px', borderRadius: 20,
        boxShadow: walkOn === c.globalIdx ? `inset 0 0 0 2px ${T.text}` : undefined, transition: 'box-shadow 160ms ease',
      }}>
      <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6, width: '100%', minWidth: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{top}</span>
        {desktop && <span style={{ fontSize: 12, fontWeight: 600, color: T.textMuted }}>{c.fretBadge}</span>}
      </span>
      <span dir="ltr" style={{ display: 'block' }}>
        <MiniFretboard voicing={c.fretPositions} dotColors={c.colors} dotLabels={c.labels} hideFretLabel showStringLabels showFretNumbers />
      </span>
      <span dir="ltr" style={{ display: 'flex', gap: 8, justifyContent: 'center', width: '100%', fontSize: 12, fontWeight: 700 }}>
        {[...c.shape].sort((a, b) => a.string - b.string).map((p, j) => (
          <span key={j} style={{ color: noteInk(p.degree) }}>{fretToNote(p.string, p.fret)}</span>
        ))}
      </span>
    </button>
  );

  const legend = (
    <div dir="ltr" style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: T.textMuted }}>
      {DEGREES.map((deg, i) => (
        <span key={deg} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span aria-hidden style={{ width: 10, height: 10, borderRadius: '50%', background: DEGREE_COLORS[deg], display: 'inline-block' }} />
          {def?.intervalLabels[i]} · {notes[i]}
        </span>
      ))}
    </div>
  );

  // ── Choosing: one fold-out panel at the top ─────────────────────────────
  const [open, setOpen] = useState(false);
  const chooser = (
    <Fold title={he ? 'בחירת טריאדה' : 'Choose a triad'} open={open} onToggle={() => setOpen(o => !o)}
      summary={`${root} ${def ? (he ? TYPE_HE[triadType!] : def.label) : ''}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Chips label={he ? 'תו שורש' : 'Root note'} cols={6} value={root}
          items={ALL_NOTES.map(n => ({ id: n as Note, label: n }))}
          onChange={n => { setRoot(n); hearTriad(n, triadType); }} />
        <Chips label={he ? 'סוג' : 'Type'} value={triadType}
          items={(Object.entries(TRIADS) as [TriadType, TriadDef][]).map(([type, d]) => ({ id: type, label: he ? TYPE_HE[type] : d.label }))}
          onChange={type => { setTriadType(type); hearTriad(root, type); }} />
        {globalProgression && globalProgression.length > 0 && (
          <Chips label={he ? 'מהשיר שלכם' : 'From your song'} value={null}
            items={[...new Set(globalProgression.map(c => c.chord.name))].map(n => ({ id: n, label: formatChordName(n) }))}
            onChange={loadChord} />
        )}
      </div>
    </Fold>
  );

  const toolbar = (
    <StopActions>
      <button onClick={roll} className="lg lg-circle gc-no-bar" aria-label={he ? 'טריאדה אקראית' : 'Random triad'} style={{ color: T.text }}>
        {icon(<><rect x="4" y="4" width="16" height="16" rx="4" /><circle cx="9" cy="9" r="0.6" fill="currentColor" /><circle cx="15" cy="15" r="0.6" fill="currentColor" /><circle cx="15" cy="9" r="0.6" fill="currentColor" /><circle cx="9" cy="15" r="0.6" fill="currentColor" /></>)}
      </button>
    </StopActions>
  );

  // The triad: its name, its three notes as tiles, and what to do with it.
  const stage = def && (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
      <ChordStage name={`${root}${def.suffix === '°' ? 'dim' : def.suffix === '+' ? 'aug' : def.suffix}`} empty="" desktop={desktop}
        line={he ? 'שלושה תווים · כל אחד בתפקיד משלו' : 'Three notes, each with its own job'} />
      <div dir="ltr" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 76px)', gap: 8 }}>
        {notes.map((n, i) => (
          <button key={i} onClick={() => { const m = pcToMidi(n, 4); if (m != null) previewRun([m]); }} className="gc-no-bar"
            aria-label={`${def.intervalLabels[i]} · ${n}`}
            style={{
              height: 64, borderRadius: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
              background: i === 0 ? T.primaryBg : 'rgba(255,255,255,0.08)', color: i === 0 ? T.tintLabel : T.text,
            }}>
            <span dir="ltr" style={{ fontSize: 20, fontWeight: 700, lineHeight: 1 }}>{def.intervalLabels[i]}</span>
            <span style={{ fontSize: 13, fontWeight: 600, opacity: 0.75 }}>{n}</span>
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        <PlayButton onPlay={handlePlay} label={he ? 'נגן' : 'Play'} />
        <SoftButton onClick={walkNeck}>
          {walking
            ? <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden><rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor" /></svg>
            : icon(<path d="M4 18h4v-4h4v-4h4V6h4" />, 17)}
          {walking ? (he ? 'עצירה' : 'Stop') : (he ? 'לאורך הצוואר' : 'Up the neck')}
        </SoftButton>
      </div>
    </div>
  );

  // ── Filters: one fold, single choices ────────────────────────────────────
  const one = <V,>(s: Set<V>) => s.size === 1 ? [...s][0] : null;
  const activeLabels = [
    ...STRING_SETS.filter((_, i) => selectedSets.has(i)).map(ss => ss.label),
    ...([0, 1, 2] as const).filter(i => selectedInversions.has(i)).map(i => he ? INV_HE[i] : INV_SHORT_LABELS[i]),
    ...FRET_AREAS.filter(a => a.id !== 'all' && selectedAreas.has(a.id as Exclude<FretArea, 'all'>)).map(a => `${he ? 'סריגים' : 'Frets'} ${a.label}`),
  ];
  const allLabel = he ? 'הכול' : 'All';
  const filters = def && (
    <Fold title={he ? 'אילו צורות להראות' : 'Which shapes to show'} open={filtersOpen} onToggle={() => setFiltersOpen(o => !o)}
      summary={activeLabels.length ? <span dir="ltr">{activeLabels.join(' · ')}</span>
        : (he ? `כל הצורות · ${allVisibleCards.length}` : `All shapes · ${allVisibleCards.length}`)}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Chips label={he ? 'קבוצת מיתרים' : 'String group'} value={one(selectedSets) === null ? 'all' : String(one(selectedSets))}
          onChange={v => setSelectedSets(v === 'all' ? new Set() : new Set([Number(v)]))}
          items={[{ id: 'all', label: allLabel }, ...STRING_SETS.map((ss, i) => ({ id: String(i), label: ss.label }))]} />
        <Chips label={he ? 'איזה תו למטה (היפוך)' : 'Which note is lowest (inversion)'} value={one(selectedInversions) === null ? 'all' : String(one(selectedInversions))}
          onChange={v => setSelectedInversions(v === 'all' ? new Set() : new Set([Number(v) as 0 | 1 | 2]))}
          items={[{ id: 'all', label: allLabel }, ...([0, 1, 2] as const).map(i => ({ id: String(i), label: he ? INV_HE[i] : INV_SHORT_LABELS[i] }))]} />
        <Chips label={he ? 'איפה על הצוואר' : 'Where on the neck'} value={one(selectedAreas) ?? 'all'}
          onChange={v => setSelectedAreas(v === 'all' ? new Set() : new Set([v as Exclude<FretArea, 'all'>]))}
          items={FRET_AREAS.map(a => ({ id: a.id, label: a.id === 'all' ? allLabel : a.label }))} />
        <Chips label={he ? 'סידור' : 'Arrange by'} value={sortMode} onChange={setSortMode}
          items={[{ id: 'strings' as const, label: he ? 'לפי מיתרים' : 'By strings' }, { id: 'position' as const, label: he ? 'מהאף כלפי מעלה' : 'Up the neck' }]} />
        <Chips label={he ? 'על הנקודות' : 'On the dots'} value={displayMode} onChange={setDisplayMode}
          items={[{ id: 'notes' as const, label: he ? 'שמות תווים' : 'Note names' }, { id: 'intervals' as const, label: '1 · 3 · 5' }]} />
      </div>
    </Fold>
  );

  const grid = def && (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {small(he ? 'כל הדרכים לנגן אותה על שלושה מיתרים. הקישו על צורה כדי לשמוע ולהגדיל.' : 'Every way to play it on three strings. Tap a shape to hear it up close.')}
      {sortMode === 'position' ? (
        <div style={{ display: 'grid', gridTemplateColumns: desktop ? 'repeat(4, minmax(0, 1fr))' : 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
          {sortedCards.map(c => shapeTile(c, `${c.setLabel} · ${he ? INV_HE_SHORT[c.inv] : INV_SHORT_LABELS[c.inv]}`))}
        </div>
      ) : (
        visibleSets.map(setIdx => {
          const ss    = STRING_SETS[setIdx];
          const cards = cardsBySet.get(setIdx) ?? [];
          if (cards.length === 0) return null;
          return (
            <div key={setIdx} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{he ? 'מיתרים' : 'Strings'} <bdi dir="ltr">{ss.label}</bdi></span>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(3, minmax(0, 1fr))`, gap: 10 }}>
                {cards.map(c => shapeTile(c, he ? INV_HE_SHORT[c.inv] : INV_SHORT_LABELS[c.inv]))}
              </div>
            </div>
          );
        })
      )}
      {allVisibleCards.length === 0 && <p className="su-sub" style={{ margin: 0, textAlign: 'center', padding: '20px 0' }}>{he ? 'אין צורות שמתאימות לבחירה' : 'No shapes match these choices'}</p>}
      {legend}
    </div>
  );

  // ── Expanded shape ───────────────────────────────────────────────────────
  const sheet = expandedCard && (() => {
    const frets = expandedCard.shape.map(p => p.fret);
    const from = Math.max(0, Math.min(...frets) - 1);
    const to = Math.max(from + 4, Math.max(...frets) + 1);
    const neckDots: NeckDot[] = expandedCard.shape.map((p, j) => ({
      string: p.string, fret: p.fret, id: `${p.string}`,
      kind: p.degree === 'root' ? 'root' : 'tone', label: expandedCard.labels[j],
    }));
    const atStart = safeIdx === 0, atEnd = safeIdx === allVisibleCards.length - 1;
    const step = (d: number) => setExpandedIdx(i => {
      if (i === null) return i;
      const n = i + d;
      const c = allVisibleCards[n];
      if (c) previewVoicing(c.fretPositions);
      return c ? n : i;
    });
    const arrow = (d: number, disabled: boolean, label: string) => (
      <button onClick={() => step(d)} disabled={disabled} aria-label={label} className="gc-no-bar"
        style={{ width: 50, height: 50, borderRadius: 25, background: 'rgba(255,255,255,0.10)', color: T.text, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.3 : 1 }}>
        {icon(<path d={d < 0 ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6'} />, 20)}
      </button>
    );
    return (
      <Sheet onClose={() => setExpandedIdx(null)} maxWidth={460}
        kicker={<><bdi dir="ltr">{expandedCard.setLabel}</bdi> · {he ? INV_HE[expandedCard.inv] : expandedCard.invLabel} · <bdi dir="ltr">{expandedCard.fretBadge}</bdi></>}
        title={<span className="gc-notation" dir="ltr">{expandedCard.chordName}</span>}>
        <div dir="ltr" style={{ borderRadius: 22, background: 'rgba(255,255,255,0.06)', padding: '14px 12px' }}>
          <Neck dots={neckDots} from={from} to={to} label={`${expandedCard.chordName} ${expandedCard.invLabel}`} />
        </div>
        <div dir="ltr" style={{ display: 'flex', gap: 14, justifyContent: 'center', fontSize: 16, fontWeight: 700 }}>
          {[...expandedCard.shape].sort((a, b) => a.string - b.string).map((p, j) => (
            <span key={j} style={{ color: noteInk(p.degree) }}>{fretToNote(p.string, p.fret)}</span>
          ))}
        </div>
        <div dir="ltr" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          {arrow(-1, atStart, he ? 'הצורה הקודמת' : 'Previous shape')}
          <button onClick={() => previewVoicing(expandedCard.fretPositions)} className="gc-no-bar"
            style={{ height: 50, padding: '0 24px', borderRadius: 25, background: T.text, color: '#000', fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden><path d="M7 4.5v15l13-7.5z" fill="currentColor" /></svg>
            {(safeIdx ?? 0) + 1} / {allVisibleCards.length}
          </button>
          {arrow(1, atEnd, he ? 'הצורה הבאה' : 'Next shape')}
        </div>
        {legend}
      </Sheet>
    );
  })();

  return (
    <div className="su-in" style={{ display: 'flex', flexDirection: 'column', gap: desktop ? 24 : 22, maxWidth: desktop ? 900 : undefined, margin: '0 auto', width: '100%' }}>
      {toolbar}
      {chooser}
      {stage}
      {filters}
      {grid}
      {sheet}
    </div>
  );
}
