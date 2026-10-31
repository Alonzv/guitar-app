import { useState, useMemo, useRef, useEffect } from 'react';
import { Scale, Note as TonalNote, Chord as TonalChord, Key, Mode } from '@tonaljs/tonal';
import type { Note } from '../../types/music';
import { Neck, type NeckDot } from '../Fretboard/Neck';
import { getScalePositions } from '../../utils/scaleUtils';
import { fretToNote, STRING_COUNT } from '../../utils/musicTheory';
import { playChord, unlockAudio } from '../../utils/audioPlayback';
import { findChordVoicings } from '../../utils/chordVoicings';
import { formatChordName } from '../../utils/chordIdentifier';
import { T } from '../../theme';
import { previewNote, previewMidi, previewRun } from '../../utils/previewSound';
import { useOptionalSong } from '../../song/SongContext';
import { useLang } from '../../contexts/LanguageContext';
import { STOPS } from '../../data/tools';
import { requestNavigate } from '../../services/navigate';
import { blurIn, dotsIn, useOnChange } from '../../utils/motion';
import { Fold, Chips } from '../ChordBuilder/Stage';
import { StopActions } from '../Transit/StopActions';

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

const GROUP_HE: Record<string, string> = { Essential: 'הבסיס', 'Minor Variants': 'גרסאות של מינור', Modes: 'מודוסים', Other: 'עוד' };

const POSITION_WINDOWS = [[0,3],[2,5],[4,8],[6,10],[9,12]] as const;

export function ScaleExplorer({ desktop }: { desktop?: boolean } = {}) {
  // Opens on C major rather than an empty neck, the way the Chord Wheel does —
  // a tool that shows nothing until you make two choices teaches nothing about
  // itself. Both stay fully changeable.
  const [root, setRoot]             = useState<Note>('C');
  const [scaleType, setScaleType]   = useState<string | null>('major');

  // Opens on the song's key (its major or natural-minor scale) and follows it
  // when the song's key changes; any other choice here stands until then.
  const songKey = useOptionalSong()?.key ?? null;
  const songKeyId = songKey ? `${songKey.tonicPc}:${songKey.mode}` : '';
  const [seenKey, setSeenKey] = useState('');
  if (songKeyId !== seenKey) {
    setSeenKey(songKeyId);
    if (songKey) {
      setRoot(ALL_NOTES[songKey.tonicPc] as Note);
      setScaleType(songKey.mode === 'major' ? 'major' : 'minor');
    }
  }
  const [pos, setPos]               = useState<number | null>(null);
  const [viewMode, setViewMode]     = useState<'fretboard' | 'tab'>('fretboard');
  // The degree legend's isolate filter: one degree stays, the rest fade.
  const [isolate, setIsolate]       = useState<number | null>(null);
  const { lang } = useLang();
  const he = lang === 'he';

  const scale       = useMemo(() => scaleType ? Scale.get(`${root} ${scaleType}`) : Scale.get(''), [root, scaleType]);

  // ── Jam ───────────────────────────────────────────────────────────────────
  // A backing loop to improvise over: I–IV–V–I built from the scale itself
  // (its own triads, so Dorian gets Dorian chords), one bar each at the song's
  // tempo. The notes of the chord that is playing are ringed on the neck —
  // the ones to land on.
  const song = useOptionalSong();
  const bpm = song?.song.bpm ?? 90;
  const [jam, setJam] = useState<{ chords: string[]; step: number } | null>(null);
  const jamTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopJam = () => { if (jamTimer.current) clearTimeout(jamTimer.current); jamTimer.current = null; setJam(null); };
  useEffect(() => () => { if (jamTimer.current) clearTimeout(jamTimer.current); }, []);
  const jamChords = (): string[] => {
    const notes = scale.notes;
    let triads: string[][];
    if (notes.length === 7) {
      triads = [0, 3, 4, 0].map(d => [notes[d], notes[(d + 2) % 7], notes[(d + 4) % 7]]);
    } else {
      // Pentatonic / blues / symmetric scales: the plain major or minor I–IV–V.
      const minor = /minor|blues/.test(scaleType ?? '');
      const parent = Scale.get(`${root} ${minor ? 'minor' : 'major'}`).notes;
      triads = [0, 3, 4, 0].map(d => [parent[d], parent[(d + 2) % 7], parent[(d + 4) % 7]]);
    }
    return triads.map(t => TonalChord.detect(t)[0] ?? `${t[0]}`);
  };
  const toggleJam = () => {
    if (jam) { stopJam(); return; }
    const chords = jamChords();
    const barMs = (60 / bpm) * 4 * 1000;
    const step = (i: number) => {
      const name = chords[i % chords.length];
      const shape = findChordVoicings(name.replace(/M$/, ''), 1)[0];
      if (shape) playChord(shape);
      setJam({ chords, step: i % chords.length });
      jamTimer.current = setTimeout(() => step(i + 1), barMs);
    };
    unlockAudio().then(() => step(0));
  };
  const jamTones = useMemo(() => {
    if (!jam) return null;
    return new Set(TonalChord.get(jam.chords[jam.step].replace(/M$/, '')).notes.map(n => TonalNote.chroma(n)));
  }, [jam]);
  // The neck runs to fret 15; frets 13–15 repeat 1–3 an octave up.
  const allPos      = useMemo(() => {
    const ps = scaleType ? getScalePositions(root, scaleType) : [];
    return [...ps, ...ps.filter(p => p.fret >= 1 && p.fret <= 3).map(p => ({ ...p, fret: p.fret + 12 }))];
  }, [root, scaleType]);

  const displayPos  = useMemo(() => {
    if (pos === null) return allPos;
    const [min, max] = POSITION_WINDOWS[pos];
    return allPos.filter(p => p.fret >= min && p.fret <= max);
  }, [allPos, pos]);

  // Each dot is named by its scale degree and which occurrence of that degree
  // it is along its string (counted over the whole neck, not the position
  // window). A new root or mode then moves dots along their strings — the
  // 3rd of C major slides to the 3rd of D major, Major's 3rd drops a fret
  // into Dorian's — instead of the neck being redrawn.
  const dotIds = useMemo(() => {
    const ids = new Map<string, string>();
    const seen = new Map<string, number>();
    [...allPos].sort((a, b) => a.string - b.string || a.fret - b.fret).forEach(p => {
      const note = fretToNote(p.string, p.fret);
      const deg = scale.notes.findIndex(n => samePitch(n, note));
      const k = `${p.string}:${deg}`;
      const n = seen.get(k) ?? 0;
      seen.set(k, n + 1);
      ids.set(`${p.string}-${p.fret}`, `${k}:${n}`);
    });
    return ids;
  }, [allPos, scale]);

  // Tapping a dot on the neck flips every label between the scale degree
  // (1, ♭3, 5…) and the note's name, spelled as the scale spells it.
  const [names, setNames] = useState(false);

  const degreeOf = (i: number) => INTERVAL_DEGREE[scale.intervals[i] ?? ''] ?? { num: String(i + 1), name: '' };
  const neckDots: NeckDot[] = useMemo(() =>
    displayPos.map(p => {
      const note   = fretToNote(p.string, p.fret);
      const deg    = scale.notes.findIndex(n => samePitch(n, note));
      const isRoot = samePitch(note, root);
      const iso = isolate !== null && isolate < scale.notes.length ? isolate : null;
      const kind: NeckDot['kind'] = iso !== null && deg !== iso ? 'faded' : isRoot ? 'root' : 'tone';
      return {
        string: p.string, fret: p.fret, id: dotIds.get(`${p.string}-${p.fret}`) ?? `${p.string}-${p.fret}`,
        // Each dot names its degree (1, ♭3, 5…), or its note when flipped.
        label: names
          ? (deg >= 0 ? scale.notes[deg] : note)
          : INTERVAL_DEGREE[scale.intervals[deg] ?? '']?.num ?? (deg >= 0 ? String(deg + 1) : note),
        kind,
        target: !!jamTones?.has(TonalNote.chroma(note)),
      };
    }),
    [displayPos, root, dotIds, scale, jamTones, isolate, names]
  );
  const flipNames = () => setNames(n => !n);

  const scaleMidis = (r: Note, type: string) => {
    const sc = Scale.get(`${r} ${type}`);
    return [...sc.notes.map(n => TonalNote.midi(`${n}4`) ?? 60), TonalNote.midi(`${r}5`) ?? 72]
      .map((m, i, arr) => (i > 0 && m < arr[i - 1] ? m + 12 : m));
  };

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

  // ── Presentation ─────────────────────────────────────────────────────────
  // A new key or scale: the title rises and unblurs; the dots spring in
  // along the neck, nut first.
  const titleRef = useRef<HTMLDivElement>(null);
  const neckRef = useRef<HTMLDivElement>(null);
  useOnChange(`${root}-${scaleType}`, () => { blurIn(titleRef.current, 0); dotsIn(neckRef.current); });

  const scaleLabel = scaleType ? (SCALE_GROUPS.flatMap(g => g.scales).find(sc => sc.id === scaleType)?.label ?? scaleType) : '—';

  // What sits next to this scale, where the theory says so. A cell with no
  // answer is left out rather than guessed.
  const related = useMemo(() => {
    const cells: { label: string; value: string; go?: () => void }[] = [];
    if (scale.empty || !scaleType) return cells;
    const rel =
      scaleType === 'major' ? { tonic: Key.majorKey(root).minorRelative, type: 'minor', name: 'minor' } :
      scaleType === 'minor' ? { tonic: Key.minorKey(root).relativeMajor, type: 'major', name: 'major' } :
      scaleType === 'major pentatonic' ? { tonic: Key.majorKey(root).minorRelative, type: 'minor pentatonic', name: 'minor pent.' } :
      scaleType === 'minor pentatonic' ? { tonic: Key.minorKey(root).relativeMajor, type: 'major pentatonic', name: 'major pent.' } : null;
    const asNote = (n: string) => (ALL_NOTES.find(a => samePitch(a, n)) ?? null) as Note | null;
    if (rel) {
      const r = asNote(rel.tonic);
      cells.push({ label: he ? 'יחסי' : 'Relative', value: `${rel.tonic} ${rel.name}`, go: r ? () => { setRoot(r); setScaleType(rel.type); setIsolate(null); } : undefined });
    }
    if (['dorian', 'phrygian', 'lydian', 'mixolydian', 'locrian'].includes(scaleType)) {
      const parent = Mode.relativeTonic('major', scaleType, root);
      const r = asNote(parent);
      if (parent) cells.push({ label: he ? 'סולם האם' : 'Parent mode', value: `${parent} major · mode ${Mode.get(scaleType).modeNum + 1}`,
        go: r ? () => { setRoot(r); setScaleType('major'); setIsolate(null); } : undefined });
    }
    const mode = Mode.get(scaleType === 'major' ? 'ionian' : scaleType === 'minor' ? 'aeolian' : scaleType);
    if (!mode.empty) {
      cells.push({ label: he ? 'מתאים מעל' : 'Fits over', value: [root + mode.triad, root + mode.seventh].map(formatChordName).join(' · ') });
    }
    return cells;
  }, [scale, scaleType, root, he]);
  const nextStop = useMemo(() => {
    const here = STOPS.findIndex(st => st.id === 'scales');
    return STOPS.slice(here + 1).find(st => st.line === STOPS[here].line) ?? null;
  }, []);

  // Degree legend — tap a degree to isolate it on the neck; tap again to clear.
  const legend = !scale.empty && (
    <div role="group" aria-label={he ? 'דרגות הסולם' : 'Scale degrees'} dir="ltr"
      style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(scale.notes.length, 5)}, minmax(0, 1fr))`, gap: 6 }}>
      {scale.notes.map((note, i) => {
        const deg = degreeOf(i);
        const on = isolate === i;
        const tonic = i === 0;
        return (
          <button key={i} type="button" aria-pressed={on} className="gc-no-bar gc-notation"
            title={deg.name}
            onClick={() => { setIsolate(on ? null : i); previewMidi(TonalNote.midi(`${note}4`) ?? 60); }}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, minHeight: 60, borderRadius: 18, minWidth: 0,
              background: on ? T.text : tonic ? T.primaryBg : 'rgba(255,255,255,0.08)', color: on ? '#000' : tonic ? T.tintLabel : T.text,
              opacity: isolate !== null && !on ? 0.5 : 1, transition: 'opacity 200ms ease, background 200ms ease',
            }}>
            <span style={{ fontSize: 20, fontWeight: 700, lineHeight: 1 }}>{deg.num}</span>
            <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.7 }}>{note}</span>
          </button>
        );
      })}
    </div>
  );

  const small = (text: string) => <span style={{ fontSize: 13, fontWeight: 600, color: T.textMuted }}>{text}</span>;

  // ── Choosing: one fold-out panel at the top ─────────────────────────────
  const [open, setOpen] = useState(false);
  const chooser = (
    <Fold title={he ? 'בחירת סולם' : 'Choose a scale'} open={open} onToggle={() => setOpen(o => !o)}
      summary={<span dir="ltr">{root.replace('#', '♯')} · {scaleLabel}</span>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Chips label={he ? 'טוניקה' : 'Key'} cols={6} value={root} onChange={n => { setRoot(n); previewNote(n); }}
          items={ALL_NOTES.map(n => ({ id: n, label: n.replace('#', '♯') }))} />
        {SCALE_GROUPS.map(g => (
          <Chips key={g.label} label={he ? (GROUP_HE[g.label] ?? g.label) : g.label} value={scaleType}
            onChange={id => { setScaleType(id); setIsolate(null); previewRun(scaleMidis(root, id)); }}
            items={g.scales.map(sc => ({ id: sc.id, label: sc.label }))} />
        ))}
      </div>
    </Fold>
  );

  const stage = (
    <div ref={titleRef} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center' }}>
      <h2 className="gc-notation" dir="ltr" style={{ margin: 0, fontFamily: 'var(--su-display)', fontSize: desktop ? 64 : 44, lineHeight: 1.08, fontWeight: 700, letterSpacing: '-0.04em' }}>
        {root.replace('#', '♯')} <span style={{ color: T.textMuted }}>{scaleLabel}</span>
      </h2>
      <span className="su-sub gc-notation" dir="ltr" style={{ fontSize: 15 }}>{scale.notes.join(' · ')}</span>
    </div>
  );

  const positionRow = (
    <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between' }}>
      <Chips label={he ? 'איפה על הצוואר' : 'Where on the neck'} value={pos === null ? 'all' : String(pos)}
        onChange={v => setPos(v === 'all' ? null : Number(v))}
        items={[{ id: 'all', label: he ? 'כל הצוואר' : 'Whole neck' }, ...POSITION_WINDOWS.map((_, i) => ({ id: String(i), label: String(i + 1) }))]} />
      <Chips label={he ? 'תצוגה' : 'View'} value={viewMode} onChange={setViewMode}
        items={[{ id: 'fretboard' as const, label: he ? 'צוואר' : 'Neck' }, { id: 'tab' as const, label: he ? 'טאב' : 'Tab' }]} />
    </div>
  );

  const jamRow = jam && (
    <div className="gc-drop-in" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {small(he ? `ג׳אם · ${bpm} BPM · נחתו על התווים המוקפים, הם צלילי האקורד` : `Jam · ${bpm} BPM · land on the ringed notes, they are the chord's tones`)}
      <div dir="ltr" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {jam.chords.map((c, i) => (
          <span key={i} className="gc-notation" style={{
            height: 40, padding: '0 16px', display: 'inline-flex', alignItems: 'center', fontSize: 16, fontWeight: 700, borderRadius: 20,
            background: i === jam.step ? T.text : 'rgba(255,255,255,0.08)', color: i === jam.step ? '#000' : T.text,
            transition: 'background-color 200ms ease, color 200ms ease',
          }}>{formatChordName(c)}</span>
        ))}
      </div>
    </div>
  );

  const jamPill = !scale.empty && (
    <StopActions>
      <button onClick={toggleJam} aria-pressed={!!jam} className="lg gc-no-bar" title={he ? 'לופ של אקורדים בסולם הזה לאלתור מעליו' : 'Loop chords in this key to improvise over'}
        style={{ height: 44, borderRadius: 22, padding: '0 16px 0 14px', display: 'flex', alignItems: 'center', gap: 7, fontSize: 14, fontWeight: 600,
          background: jam ? T.text : undefined, color: jam ? '#000' : T.text }}>
        {jam
          ? <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden><rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor" /></svg>
          : <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden><path d="M7 4.5v15l13-7.5z" fill="currentColor" /></svg>}
        {he ? 'ג׳אם' : 'Jam'}
      </button>
    </StopActions>
  );

  const tabView = (
    <div style={{ overflowX: 'auto', borderRadius: 22, background: T.bgCard, padding: 16 }}>
      <pre dir="ltr" style={{ fontSize: 12, color: T.text, fontFamily: 'var(--gc-mono)', lineHeight: 1.7, margin: 0, whiteSpace: 'pre' }}>
        {generateTab()}
      </pre>
    </div>
  );
  const empty = <p className="su-sub" style={{ margin: 0, padding: '20px 0', textAlign: 'center' }}>{he ? 'אין תווים בפוזיציה הזו' : 'No notes in this position'}</p>;
  const neckLabel = `${root} ${scaleLabel}`;

  const relatedRow = (related.length > 0 || nextStop) && (
    <div style={{ display: 'grid', gridTemplateColumns: desktop ? `repeat(${related.length + (nextStop ? 1 : 0)}, minmax(0, 1fr))` : '1fr 1fr', gap: 8 }}>
      {related.map(c => <RelatedCell key={c.label} label={c.label} value={c.value} onClick={c.go} />)}
      {nextStop && (
        <RelatedCell label={he ? 'הכלי הבא' : 'Next tool'} value={`${nextStop.name[lang]} ${he ? '←' : '→'}`}
          onClick={() => requestNavigate({ stop: nextStop.id })} />
      )}
    </div>
  );

  if (scale.empty) {
    return <div style={{ padding: 32, textAlign: 'center' }} className="su-sub">{he ? 'הסולם לא נמצא' : 'Scale not found'}</div>;
  }

  const degreesBlock = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {small(he ? `${scale.notes.length} תווים · הקישו על דרגה כדי להאיר אותה בצוואר` : `${scale.notes.length} notes · tap one to light it up on the neck`)}
      {legend}
    </div>
  );
  const neckHint = small(he ? 'הקישו על נקודה כדי להחליף בין מספרים לשמות תווים' : 'Tap a dot to switch between numbers and note names');

  // ── Desktop: a 0–15 neck across the page ─────────────────────────────────
  if (desktop) {
    return (
      <div className="su-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {jamPill}
        {chooser}
        {stage}
        {degreesBlock}
        {jamRow}
        <div ref={neckRef} style={{ borderRadius: 26, background: T.bgCard, padding: '20px 18px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {viewMode === 'tab' ? tabView : neckDots.length ? <Neck dots={neckDots} from={0} to={15} label={neckLabel} onDot={flipNames} /> : empty}
          {viewMode !== 'tab' && neckHint}
        </div>
        {positionRow}
        {relatedRow}
      </div>
    );
  }

  // ── Mobile: a vertical neck ──────────────────────────────────────────────
  return (
    <div className="su-in" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {jamPill}
      {chooser}
      {stage}
      {degreesBlock}
      {jamRow}
      {viewMode === 'tab' ? tabView : (
        <div ref={neckRef} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, borderRadius: 26, background: T.bgCard, padding: '18px 12px 14px' }}>
          <div dir="ltr" style={{ width: '100%', maxWidth: 230 }}>
            {neckDots.length ? <Neck dots={neckDots} from={0} to={12} vertical label={neckLabel} onDot={flipNames} /> : empty}
          </div>
          {neckHint}
        </div>
      )}
      {positionRow}
      {relatedRow}
    </div>
  );
}

function RelatedCell({ label, value, onClick }: { label: string; value: string; onClick?: () => void }) {
  const inner = (
    <>
      <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: T.textMuted }}>{label}</span>
      <span className="gc-notation" dir="auto" style={{ display: 'block', marginTop: 6, fontSize: 17, fontWeight: 600, lineHeight: 1.2 }}>{value}</span>
    </>
  );
  const style: React.CSSProperties = {
    padding: '14px 16px', minHeight: 72, textAlign: 'start', background: T.bgCard, color: T.text, borderRadius: 22, minWidth: 0,
  };
  return onClick
    ? <button type="button" onClick={onClick} className="gc-no-bar su-row" style={{ ...style, display: 'block', cursor: 'pointer' }}>{inner}</button>
    : <div style={style}>{inner}</div>;
}
