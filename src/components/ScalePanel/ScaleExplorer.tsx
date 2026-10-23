import { useState, useMemo, useRef, useEffect } from 'react';
import { Scale, Note as TonalNote, Chord as TonalChord, Key, Mode } from '@tonaljs/tonal';
import type { Note } from '../../types/music';
import { Neck, type NeckDot } from '../Fretboard/Neck';
import { getScalePositions } from '../../utils/scaleUtils';
import { fretToNote, STRING_COUNT } from '../../utils/musicTheory';
import { playScale, playChord, unlockAudio } from '../../utils/audioPlayback';
import { findChordVoicings } from '../../utils/chordVoicings';
import { formatChordName } from '../../utils/chordIdentifier';
import { T } from '../../theme';
import { previewNote, previewMidi, previewRun } from '../../utils/previewSound';
import { useOptionalSong } from '../../song/SongContext';
import { DiceButton } from '../DiceButton';
import { pickOne } from '../../utils/random';
import { useLang } from '../../contexts/LanguageContext';
import { STOPS } from '../../data/tools';
import { requestNavigate } from '../../services/navigate';
import { PosterTitle, Rule, Pill, PillRow, Cta, KeyGrid, KeyPicker } from '../Transit/parts';
import { pillStyle, keyStyle } from '../Transit/styles';
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

const POSITION_WINDOWS = [[0,3],[2,5],[4,8],[6,10],[9,12]] as const;

export function ScaleExplorer({ desktop }: { desktop?: boolean } = {}) {
  // Opens on C major rather than an empty neck, the way the Chord Wheel does —
  // a tool that shows nothing until you make two choices teaches nothing about
  // itself. Both stay fully changeable.
  const [root, setRoot]             = useState<Note>('C');
  const [scaleType, setScaleType]   = useState<string | null>('major');
  const [scaleMenuOpen, setScaleMenuOpen] = useState(false);

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
        // Each dot names its degree (1, ♭3, 5…).
        label: INTERVAL_DEGREE[scale.intervals[deg] ?? '']?.num ?? (deg >= 0 ? String(deg + 1) : note),
        kind,
        target: !!jamTones?.has(TonalNote.chroma(note)),
      };
    }),
    [displayPos, root, dotIds, scale, jamTones, isolate]
  );

  const roll = () => {
    const r = pickOne(ALL_NOTES) as Note;
    const type = pickOne(SCALE_GROUPS.flatMap(g => g.scales)).id;
    setRoot(r); setScaleType(type); setPos(null); setIsolate(null);
    previewRun(scaleMidis(r, type));
  };

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
  const scaleLabel = scaleType ? (SCALE_GROUPS.flatMap(g => g.scales).find(sc => sc.id === scaleType)?.label ?? scaleType) : '—';
  const playWholeScale = () => {
    const midiNotes = [
      ...scale.notes.map(n => TonalNote.midi(`${n}4`) ?? 60),
      TonalNote.midi(`${root}5`) ?? 72,
    ];
    playScale(midiNotes);
  };

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
      style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(scale.notes.length, 5)}, minmax(0, 1fr))`, gap: 4 }}>
      {scale.notes.map((note, i) => {
        const deg = degreeOf(i);
        const on = isolate === i;
        return (
          <button key={i} type="button" aria-pressed={on} data-active={on || undefined} className="gc-no-bar gc-notation"
            title={deg.name}
            onClick={() => { setIsolate(on ? null : i); previewMidi(TonalNote.midi(`${note}4`) ?? 60); }}
            style={{ ...keyStyle(on), flexDirection: 'column', gap: 3, minHeight: 58, padding: '6px 2px', letterSpacing: 'normal',
              opacity: isolate !== null && !on ? 0.55 : 1 }}>
            <span style={{ fontSize: 22, lineHeight: 1 }}>{deg.num}</span>
            <span style={{ fontFamily: 'var(--gc-mono)', fontStretch: 'normal', fontSize: 11, fontWeight: 700 }}>{note}</span>
          </button>
        );
      })}
    </div>
  );

  const rootGrid = (
    <Rule label={he ? 'טוניקה' : 'Root'} right={<DiceButton onRoll={roll} style={pillStyle(false, 'sm')} />}>
      <div dir="ltr">
        <KeyGrid items={ALL_NOTES.map(n => ({ id: n, label: n }))} value={root}
          onChange={n => { setRoot(n); previewNote(n); }} label={he ? 'טוניקה' : 'Root'} />
      </div>
    </Rule>
  );

  const scaleMenu = (
    <Rule label={he ? 'סולם' : 'Scale'} right={
      <Pill size="sm" active={scaleMenuOpen} onClick={() => setScaleMenuOpen(o => !o)}>
        {scaleLabel} {scaleMenuOpen ? '▴' : '▾'}
      </Pill>
    }>
      {(scaleMenuOpen || desktop) && (
        <div className="gc-drop-in" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {SCALE_GROUPS.map(g => (
            <div key={g.label}>
              <p className="su-label" style={{ margin: '0 0 6px' }}>{g.label}</p>
              <PillRow wrap items={g.scales.map(sc => ({ id: sc.id, label: sc.label }))} value={scaleType}
                onChange={id => { setScaleType(id); setIsolate(null); if (!desktop) setScaleMenuOpen(false); previewRun(scaleMidis(root, id)); }} />
            </div>
          ))}
        </div>
      )}
    </Rule>
  );

  const positionRow = (
    <Rule label={he ? 'פוזיציה · תצוגה' : 'Position · view'}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <div role="group" aria-label={he ? 'פוזיציה' : 'Position'} dir="ltr" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Pill size="sm" active={pos === null} onClick={() => setPos(null)}>{he ? 'כל הצוואר' : 'Full neck'}</Pill>
          {POSITION_WINDOWS.map((w, i) => (
            <Pill key={i} size="sm" active={pos === i} onClick={() => setPos(pos === i ? null : i)}
              title={`Frets ${w[0]}–${w[1]}`} label={`${he ? 'פוזיציה' : 'Position'} ${i + 1}, ${he ? 'שריגים' : 'frets'} ${w[0]}–${w[1]}`}
              style={{ padding: 0 }}>{i + 1}</Pill>
          ))}
        </div>
        <PillRow items={[{ id: 'fretboard' as const, label: he ? 'צוואר' : 'Neck' }, { id: 'tab' as const, label: he ? 'טאב' : 'Tab' }]}
          value={viewMode} onChange={setViewMode} label={he ? 'תצוגה' : 'View'} />
      </div>
    </Rule>
  );

  const jamRow = jam && (
    <div className="gc-drop-in" dir="ltr" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <span className="su-label">Jam · {bpm} bpm</span>
      {jam.chords.map((c, i) => (
        <span key={i} className="gc-notation su-semi" style={{
          height: 36, padding: '0 14px', display: 'inline-flex', alignItems: 'center', fontSize: 16, borderRadius: 'var(--su-pill)',
          border: `1.5px solid ${T.text}`,
          background: i === jam.step ? T.secondary : 'transparent', color: i === jam.step ? T.white : T.text,
          transition: 'background-color var(--gc-dur-fast) var(--gc-ease-out)',
        }}>{formatChordName(c)}</span>
      ))}
      <span style={{ fontSize: 11, color: T.textMuted }}>{he ? '· התווים המוקפים = צלילי האקורד' : '· ringed notes = the chord\'s tones'}</span>
    </div>
  );

  const jamPill = !scale.empty && (
    <StopActions>
      <Pill size="sm" active={!!jam} onClick={toggleJam} title="Loop chords in this key to improvise over">
        {jam ? '■ Jam' : 'Jam'}
      </Pill>
    </StopActions>
  );

  const tabView = (
    <div style={{ overflowX: 'auto', borderTop: `var(--su-rule) solid ${T.border}`, paddingTop: 12 }}>
      <pre style={{ fontSize: 12, color: T.text, fontFamily: 'var(--gc-mono)', lineHeight: 1.7, margin: 0, whiteSpace: 'pre' }}>
        {generateTab()}
      </pre>
    </div>
  );
  const empty = <p className="su-label" style={{ margin: 0, padding: '20px 0' }}>{he ? 'אין תווים בפוזיציה הזו' : 'No notes in this position'}</p>;
  const neckLabel = `${root} ${scaleLabel}`;

  if (scale.empty) {
    return <div style={{ padding: 32, textAlign: 'center' }} className="su-label">{he ? 'הסולם לא נמצא' : 'Scale not found'}</div>;
  }

  // ── Desktop: poster, a 0–15 neck across the page, controls below ─────────
  if (desktop) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {jamPill}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24 }}>
          <PosterTitle head={`${root} `} tail={scaleLabel} max={200} min={56} style={{ flex: 1 }} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10, flex: 'none', paddingBottom: 6 }}>
            <KeyPicker value={root} options={ALL_NOTES as readonly Note[]} onChange={n => { setRoot(n); previewNote(n); }} label={he ? 'טוניקה' : 'Key'} align={desktop ? 'end' : 'start'} />
            <Cta onClick={playWholeScale}>{he ? 'נגן סולם' : 'Play scale'} ▶</Cta>
          </div>
        </div>
        <Rule label={`${scale.notes.length} ${he ? 'תווים · הקישו דרגה לבידוד' : 'notes · tap a degree to isolate it'}`}>{legend}</Rule>
        {jamRow}
        <div style={{ borderTop: `var(--su-rule) solid ${T.border}`, paddingTop: 16 }}>
          {viewMode === 'tab' ? tabView : neckDots.length ? <Neck dots={neckDots} from={0} to={15} label={neckLabel} /> : empty}
        </div>
        {positionRow}
        {(related.length > 0 || nextStop) && (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${related.length + (nextStop ? 1 : 0)}, minmax(0, 1fr))`, borderTop: `var(--su-rule) solid ${T.border}` }}>
            {related.map((c, i) => (
              <RelatedCell key={c.label} first={i === 0} label={c.label} value={c.value} onClick={c.go} />
            ))}
            {nextStop && (
              <RelatedCell first={related.length === 0} label={he ? 'התחנה הבאה' : 'Next stop'} value={`${nextStop.name[lang]} ${he ? '←' : '→'}`}
                onClick={() => requestNavigate({ stop: nextStop.id })} />
            )}
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.4fr)', gap: 32, alignItems: 'start' }}>
          {rootGrid}
          {scaleMenu}
        </div>
      </div>
    );
  }

  // ── Mobile: a vertical neck with the scale's name up its spine ───────────
  const spineSize = Math.max(44, Math.min(96, Math.floor(600 / Math.max(neckLabel.length * 0.5, 1))));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {jamPill}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <KeyPicker value={root} options={ALL_NOTES as readonly Note[]} onChange={n => { setRoot(n); previewNote(n); }} label={he ? 'טוניקה' : 'Key'} align={desktop ? 'end' : 'start'} />
        <Pill size="sm" active={scaleMenuOpen} onClick={() => setScaleMenuOpen(o => !o)}>{scaleLabel} {scaleMenuOpen ? '▴' : '▾'}</Pill>
      </div>
      {scaleMenuOpen && (
        <div className="gc-drop-in" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {SCALE_GROUPS.map(g => (
            <div key={g.label}>
              <p className="su-label" style={{ margin: '0 0 6px' }}>{g.label}</p>
              <PillRow wrap items={g.scales.map(sc => ({ id: sc.id, label: sc.label }))} value={scaleType}
                onChange={id => { setScaleType(id); setIsolate(null); setScaleMenuOpen(false); previewRun(scaleMidis(root, id)); }} />
            </div>
          ))}
        </div>
      )}
      {viewMode === 'tab' ? tabView : (
        <div dir="ltr" style={{ display: 'flex', gap: 8, alignItems: 'stretch', borderTop: `var(--su-rule) solid ${T.border}`, paddingTop: 12 }}>
          <h2 className="su-poster" style={{
            margin: 0, writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: spineSize,
            whiteSpace: 'nowrap', textAlign: 'end', flex: 'none',
          }}>
            {root} <span style={spineSize >= 60 ? { color: 'transparent', WebkitTextStroke: `3px ${T.text}` } : undefined}>{scaleLabel}</span>
          </h2>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: '100%', maxWidth: 210 }}>
              {neckDots.length ? <Neck dots={neckDots} from={0} to={12} vertical label={neckLabel} /> : empty}
            </div>
          </div>
        </div>
      )}
      <Rule label={`${scale.notes.length} ${he ? 'תווים · הקישו לבידוד' : 'notes · tap to isolate'}`}>{legend}</Rule>
      <Cta onClick={playWholeScale} style={{ width: '100%' }}>{he ? 'נגן סולם' : 'Play scale'} ▶</Cta>
      {jamRow}
      {positionRow}
      {rootGrid}
    </div>
  );
}

function RelatedCell({ label, value, onClick, first }: { label: string; value: string; onClick?: () => void; first?: boolean }) {
  const inner = (
    <>
      <span className="su-label" style={{ display: 'block' }}>{label}</span>
      <span className="su-semi gc-notation" dir="auto" style={{ display: 'block', marginTop: 8, fontSize: 24, lineHeight: 1 }}>{value}</span>
    </>
  );
  const style: React.CSSProperties = {
    padding: '12px 16px 14px', minHeight: 72, textAlign: 'start', background: 'transparent', color: T.text, border: 'none',
    borderInlineStart: first ? 'none' : `var(--su-rule) solid ${T.border}`, minWidth: 0,
  };
  return onClick
    ? <button type="button" onClick={onClick} className="gc-no-bar gc-notation" style={{ ...style, cursor: 'pointer', letterSpacing: 'normal' }}>{inner}</button>
    : <div style={style}>{inner}</div>;
}
