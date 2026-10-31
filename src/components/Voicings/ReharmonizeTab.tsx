import React, { useState, useRef, useEffect } from 'react';
import { Chord as TonalChord, Note as TonalNote } from '@tonaljs/tonal';
import type { FretPosition, Tuning } from '../../types/music';
import { MiniFretboard } from '../Fretboard/MiniFretboard';
import { playChord, unlockAudio } from '../../utils/audioPlayback';
import {
  findVoicingPaths,
  type VoicingMode,
  type StringGroup,
  type VoicingPath,
} from '../../utils/voicingPaths';
import { reharmonize, type ReharmonizeResult } from '../../utils/reharmonize';
import { exportMidi } from '../../utils/midiExport';
import { SaveToLibraryButton } from '../Workspace/SaveToLibraryButton';
import type { ReharmData } from '../../services/types';
import { T } from '../../theme';
import { Pill, PosterTitle } from '../Transit/parts';
import { spinner } from './ui';
import { useLang } from '../../contexts/LanguageContext';
import { ExampleChips } from '../ExampleChips';
import { useOptionalSong } from '../../song/SongContext';
import { formatChordName } from '../../utils/chordIdentifier';
import { findChordVoicings } from '../../utils/chordVoicings';
import { useFlash } from '../../motion/useFlash';
import { namesToProgression } from '../../utils/progressionBridge';
import { TUNINGS } from '../../utils/musicTheory';
import { Fold, Chips, icon } from '../ChordBuilder/Stage';
import { StopActions } from '../Transit/StopActions';
import { previewChordName } from '../../utils/previewSound';

// Reharmonisation is the one tool that can fail for reasons outside the app,
// so it is the one tool with error copy. Written for a guitarist: the old text
// was Hebrew-only and told them to go and check an API key they do not have.
const ERR = {
  en: {
    refused: 'Could not reharmonise this progression. Try again in a moment.',
    network: 'No connection — check your network and try again.',
  },
  he: {
    refused: 'לא הצלחנו להרמן את הפרוגרסיה הזו. נסו שוב בעוד רגע.',
    network: 'אין חיבור — בדקו את הרשת ונסו שוב.',
  },
} as const;

interface Props {
  chords: string[];
  mode: VoicingMode;
  setMode: (m: VoicingMode) => void;
  stringGroup: StringGroup;
  setStringGroup: (sg: StringGroup) => void;
  tuning: Tuning;
  desktop?: boolean;
  /** Replaces the chords being reharmonised (the song's own list). */
  onChordsChange: (chords: string[]) => void;
  /** Library handoff: a saved reharm to restore without an API call. */
  restored?: { result: ReharmData; genre?: string | null; tension?: number | null } | null;
  onRestoredConsumed?: () => void;
}

const WARN = '⚠\uFE0E';   // text presentation, never the emoji

// Where the shape sits on the neck, as a mono label.
function FretBadge({ voicing }: { voicing: FretPosition[] }) {
  const nonOpen = voicing.filter(p => p.fret > 0);
  const hasOpen = voicing.some(p => p.fret === 0);
  const lowestFret = nonOpen.length ? Math.min(...nonOpen.map(p => p.fret)) : 0;
  return (
    <span className="su-label" style={{ color: T.textMuted }}>
      {nonOpen.length === 0
        ? 'open'
        : hasOpen
          ? `${lowestFret}fr + open`
          : `${lowestFret}fr`}
    </span>
  );
}

// ── Enlarged chord sheet ──────────────────────────────────────────────────────
// A paper sheet in a 2px ink frame: the chord as a poster, its diagram, and
// ‹ › pills to step through the path.
function ReharmModal({
  voicings, chordNames, index: initial, tuning, onClose,
}: {
  voicings: FretPosition[][];
  chordNames: string[];
  index: number;
  tuning: string[];
  onClose: () => void;
}) {
  const { lang } = useLang();
  const he = lang === 'he';
  const [idx, setIdx] = useState(initial);
  const total = voicings.length;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft')  setIdx(i => Math.max(0, i - 1));
      else if (e.key === 'ArrowRight') setIdx(i => Math.min(total - 1, i + 1));
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose, total]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        role="dialog" aria-modal="true" aria-label={chordNames[idx]}
        onClick={e => e.stopPropagation()}
        className="lg"
        style={{
          color: T.text, borderRadius: 32, background: 'rgba(36,36,40,0.72)',
          padding: '18px 20px 20px', maxWidth: 360, width: '100%', boxSizing: 'border-box',
          display: 'flex', flexDirection: 'column', gap: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <span className="su-label" style={{ paddingTop: 14 }}>{idx + 1} / {total}</span>
          <Pill onClick={onClose} label={he ? 'סגירה' : 'Close'} style={{ padding: 0, width: 44 }}>×</Pill>
        </div>
        {/* Chord names keep their case (Cmaj9, not CMAJ9). */}
        <PosterTitle head={<span style={{ textTransform: 'none' }}>{chordNames[idx]}</span>} max={84} min={36} />
        <div>
          <MiniFretboard voicing={voicings[idx]} dotColor={T.secondary} tuning={tuning} showStringLabels showFretNumbers hideFretLabel />
        </div>
        <FretBadge voicing={voicings[idx]} />
        {total > 1 && (
          <div style={{ display: 'flex', gap: 8 }}>
            <Pill onClick={() => setIdx(i => Math.max(0, i - 1))} disabled={idx === 0} label={he ? 'הקודם' : 'Previous'} style={{ flex: 1 }}>‹</Pill>
            <Pill onClick={() => setIdx(i => Math.min(total - 1, i + 1))} disabled={idx === total - 1} label={he ? 'הבא' : 'Next'} style={{ flex: 1 }}>›</Pill>
          </div>
        )}
        <p className="su-label" style={{ margin: 0, textAlign: 'center' }}>{he ? '← → למעבר · Esc לסגירה' : '← → to step · Esc to close'}</p>
      </div>
    </div>
  );
}

const GENRES: { id: string; label: string }[] = [
  { id: 'jazz', label: 'Jazz / Neo-Soul' },
  { id: 'blues', label: 'Blues' },
  { id: 'rock', label: 'Rock' },
  { id: 'desert', label: 'Desert Noir' },
  { id: 'country', label: 'Country' },
];

// Tension, said as a feeling rather than a number.
const LEVELS = [
  { en: 'Gentle', he: 'עדין' }, { en: 'Soft', he: 'רך' }, { en: 'Colourful', he: 'צבעוני' },
  { en: 'Bold', he: 'נועז' }, { en: 'Wild', he: 'פרוע' },
] as const;
const STRINGS: { id: StringGroup; en: string; he: string }[] = [
  { id: 'all', en: 'All strings', he: 'כל המיתרים' },
  { id: 'bass', en: 'Low strings', he: 'מיתרים עבים' },
  { id: 'treble', en: 'High strings', he: 'מיתרים דקים' },
];
const GENRE_HE: Record<string, string> = { jazz: 'ג׳אז / ניאו-סול', blues: 'בלוז', rock: 'רוק', desert: 'Desert Noir', country: 'קאנטרי' };

// The chord menu for adding a chord.
const ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const TRIADS = [
  { display: 'Major', key: 'M' }, { display: 'Minor', key: 'm' }, { display: 'dim', key: 'dim' },
  { display: 'aug', key: 'aug' }, { display: 'sus2', key: 'sus2' }, { display: 'sus4', key: 'sus4' },
];
const TRIAD_HE: Record<string, string> = { M: 'מז׳ור', m: 'מינור', dim: 'מוקטן', aug: 'מוגדל', sus2: 'sus2', sus4: 'sus4' };
const EXTENSIONS = [
  { display: '—', key: '' }, { display: '7', key: '7' }, { display: 'maj7', key: 'maj7' }, { display: '9', key: '9' },
  { display: 'add9', key: 'add9' }, { display: '6', key: '6' }, { display: '11', key: '11' }, { display: '13', key: '13' },
];
const VALID_EXTENSIONS: Record<string, string[]> = {
  M: ['', '7', 'maj7', '9', 'add9', '6', '11', '13'], m: ['', '7', 'maj7', '9', 'add9', '6', '11', '13'],
  dim: ['', '7'], aug: ['', '7'], sus2: [''], sus4: [''],
};
const SUFFIX_MAP: Record<string, Record<string, string>> = {
  M: { '': 'M', '7': '7', 'maj7': 'maj7', '9': '9', 'add9': 'add9', '6': '6', '11': '11', '13': '13' },
  m: { '': 'm', '7': 'm7', 'maj7': 'mMaj7', '9': 'm9', 'add9': 'madd9', '6': 'm6', '11': 'm11', '13': 'm13' },
  dim: { '': 'dim', '7': 'dim7' }, aug: { '': 'aug', '7': 'aug7' }, sus2: { '': 'sus2' }, sus4: { '': 'sus4' },
};

// Nashville Number System helper
function toNashville(chordName: string, keyRoot: string): string {
  const info = TonalChord.get(chordName);
  if (!info || info.notes.length === 0) return chordName;

  const chordRootPc = TonalNote.chroma(info.tonic ?? info.notes[0]);
  const keyRootPc = TonalNote.chroma(keyRoot);
  if (chordRootPc == null || keyRootPc == null) return chordName;

  const semidiff = ((chordRootPc - keyRootPc) + 12) % 12;

  const DEGREE_MAP: Record<number, string> = {
    0: '1', 2: '2', 4: '3', 5: '4', 7: '5', 9: '6', 11: '7',
  };

  let degree: string;
  if (DEGREE_MAP[semidiff] !== undefined) {
    degree = DEGREE_MAP[semidiff];
  } else {
    // Use flat prefix for chromatic notes
    const above = (semidiff + 1) % 12;
    degree = 'b' + (DEGREE_MAP[above] ?? semidiff.toString());
  }

  // Append quality suffix
  const aliases = info.aliases ?? [];
  const type = info.type ?? '';
  const quality = info.quality ?? '';

  let suffix = '';
  if (type.includes('half-diminished') || aliases.some(a => a.includes('m7b5'))) {
    suffix = 'o';
  } else if (type.includes('diminished')) {
    suffix = 'o';
  } else if (quality === 'Diminished') {
    suffix = 'o';
  } else if (type.includes('sus')) {
    suffix = 'sus';
  } else if (type.includes('major') && type.includes('7')) {
    suffix = 'maj7';
  } else if (quality === 'Major' && type.includes('7')) {
    suffix = 'maj7';
  } else if (type.includes('dominant') || (quality !== 'Major' && quality !== 'Minor' && type.includes('7'))) {
    suffix = '7';
  } else if (quality === 'Minor') {
    suffix = 'm';
  }

  return degree + suffix;
}

// ── Plain-words guide ────────────────────────────────────────────────────────
// Reharmonizing is a big idea for a player who has never heard the word, so
// the tool says what it does before asking for anything, and each control
// says in one line what it changes.
const HOW = {
  en: {
    title: 'What is this?',
    summary: 'Same song, new chord colours',
    lead: 'Reharmonizing keeps your song and its melody, and swaps some chords for richer ones that still fit. Like repainting a room without moving the walls.',
    steps: [
      'Your song\'s chords are already here. Add or change them with the chord picker.',
      'Pick a style and how adventurous to get, then tap Re-Harmonize.',
      'Compare Original and Reharm by ear. If you like it, tap Use in song.',
    ],
  },
  he: {
    title: 'מה זה הכלי הזה?',
    summary: 'אותו שיר, צבעים חדשים לאקורדים',
    lead: 'רה-הרמוניזציה שומרת על השיר ועל המנגינה שלו, ומחליפה חלק מהאקורדים באקורדים עשירים יותר שעדיין מתאימים. כמו לצבוע חדר מחדש בלי להזיז קירות.',
    steps: [
      'האקורדים של השיר שלכם כבר כאן. אפשר להוסיף או לשנות בבוחר האקורדים.',
      'בוחרים סגנון וכמה להעז, ולוחצים על רה-הרמוניזציה.',
      'משווים באוזן בין המקור לגרסה החדשה. אם אהבתם, לוחצים "השתמש בשיר".',
    ],
  },
} as const;
const HINT = {
  tension: { en: 'How far to stray: 1–2 gentle, 3 colourful, 4–5 bold and surprising.', he: 'כמה להתרחק מהמקור: 1–2 עדין, 3 צבעוני, 4–5 נועז ומפתיע.' },
  shapes: { en: 'How the new chords are played. Full uses every string; Triads are three-note shapes, lighter and easier to move. Low and High keep them on the thick or thin strings.', he: 'איך מנגנים את האקורדים החדשים. Full על כל המיתרים; Triads הן צורות של שלושה תווים, קלילות וקלות להזזה. Low ו-High משאירים אותן על המיתרים העבים או הדקים.' },
  why: { en: 'Why these chords work.', he: 'למה האקורדים האלה עובדים.' },
  paths: { en: 'Ways to play the new chords on the neck, picked so your hand moves as little as possible. The first is the smoothest.', he: 'דרכים לנגן את האקורדים החדשים על הצוואר, כך שהיד זזה כמה שפחות. הראשונה היא החלקה ביותר.' },
} as const;
const HOW_KEY = 'scaleup_reharm_how';

function HowItWorks() {
  const { lang } = useLang();
  const t = HOW[lang];
  const [open, setOpen] = useState(() => { try { return localStorage.getItem(HOW_KEY) !== 'closed'; } catch { return true; } });
  const toggle = () => setOpen(o => { try { localStorage.setItem(HOW_KEY, o ? 'closed' : 'open'); } catch { /* private mode */ } return !o; });
  return (
    <Fold title={t.title} summary={t.summary} open={open} onToggle={toggle}>
      <p style={{ margin: '0 0 14px', fontSize: 15, lineHeight: 1.55, color: T.text }}>{t.lead}</p>
      <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {t.steps.map((s, i) => (
          <li key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', fontSize: 15, lineHeight: 1.45, color: T.textMuted }}>
            <span aria-hidden style={{ flex: 'none', width: 24, height: 24, borderRadius: 12, background: T.primaryBg, color: T.tintLabel, fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
    </Fold>
  );
}

const hint = (text: string) => <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: T.textMuted }}>{text}</p>;

export function ReharmonizeTab({
  chords,
  onChordsChange,
  mode,
  setMode,
  stringGroup,
  setStringGroup,
  tuning,
  desktop,
  restored,
  onRestoredConsumed,
}: Props) {
  const { lang } = useLang();
  const song = useOptionalSong();
  const [used, flashUsed] = useFlash();
  const [kept, flashKept] = useFlash();
  const [genre, setGenre] = useState('jazz');
  const [tension, setTension] = useState(3);
  const liveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busy = useRef(false);   // a request in flight (the live timer's closure can't see `loading`)
  useEffect(() => () => { if (liveTimer.current) clearTimeout(liveTimer.current); }, []);
  const [showNashville, setShowNashville] = useState(false);
  const [showPlay, setShowPlay] = useState(false);
  const [result, setResult] = useState<ReharmonizeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reharmPaths, setReharmPaths] = useState<VoicingPath[]>([]);
  const [selectedPathIdx, setSelectedPathIdx] = useState(0);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [modalIdx, setModalIdx] = useState<number | null>(null);
  const playTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Key root = first chord's root
  const keyRoot = chords.length > 0
    ? (TonalChord.get(chords[0]).tonic ?? TonalChord.get(chords[0]).notes[0] ?? 'C')
    : 'C';

  // ── Restore a saved reharm from the library (no API call) ─────────────────
  useEffect(() => {
    if (!restored) return;
    const r = restored.result;
    setResult({ chords: r.chords, analysis: r.analysis, theory: r.theory });
    if (restored.genre && GENRES.some(g => g.id === restored.genre)) setGenre(restored.genre);
    if (typeof restored.tension === 'number') setTension(Math.min(5, Math.max(1, restored.tension)));
    setError(null);
    const paths = findVoicingPaths(r.chords, { genre: 'any', mode, stringGroup, tuning: tuning.notes });
    setReharmPaths(paths);
    setSelectedPathIdx(0);
    onRestoredConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restored]);

  // `live`: a re-run from the tension slider — the current result stays on
  // screen until the new one arrives instead of the panel going blank.
  const handleReharmonize = (t: number = tension, live = false) => {
    if (chords.length === 0 || busy.current) return;
    busy.current = true;
    setLoading(true);
    if (!live) setResult(null);
    setError(null);
    setReharmPaths([]);
    setSelectedPathIdx(0);
    setPlayingId(null);
    playTimers.current.forEach(clearTimeout);
    playTimers.current = [];

    const genreLabel = GENRES.find(g => g.id === genre)?.label ?? genre;

    reharmonize(chords, genreLabel, t).then(r => {
      setLoading(false); busy.current = false;
      if (r) {
        setResult(r);
        const paths = findVoicingPaths(r.chords, {
          genre: 'any',
          mode,
          stringGroup,
          tuning: tuning.notes,
        });
        setReharmPaths(paths);
        setSelectedPathIdx(0);
      } else {
        setError(ERR[lang].refused);
      }
    }).catch(() => {
      setLoading(false); busy.current = false;
      setError(ERR[lang].network);
    });
  };

  const currentPath: VoicingPath | undefined = reharmPaths[selectedPathIdx];

  const handlePlay = () => {
    if (!currentPath) return;
    playTimers.current.forEach(clearTimeout);
    playTimers.current = [];

    if (playingId === currentPath.id) {
      setPlayingId(null);
      return;
    }

    setPlayingId(currentPath.id);
    unlockAudio();

    currentPath.voicings.forEach((v, i) => {
      const t = setTimeout(() => {
        playChord(v, tuning.openFreqs);
        if (i === currentPath.voicings.length - 1) {
          const done = setTimeout(() => setPlayingId(null), 1400);
          playTimers.current.push(done);
        }
      }, i * 1300);
      playTimers.current.push(t);
    });
  };

  const isPlaying = currentPath?.id === playingId;

  // ── Before / after ───────────────────────────────────────────────────────
  // One loop over both progressions; the side can be flipped while it runs
  // and the very next chord comes from the other one.
  const [ab, setAb] = useState<{ side: 'before' | 'after'; step: number } | null>(null);
  const abSide = useRef<'before' | 'after'>('after');
  const abTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abStop = () => { if (abTimer.current) clearTimeout(abTimer.current); abTimer.current = null; setAb(null); };
  useEffect(() => () => { if (abTimer.current) clearTimeout(abTimer.current); }, []);
  const abPlay = (side: 'before' | 'after') => {
    abSide.current = side;
    if (abTimer.current) { setAb(a => (a ? { ...a, side } : a)); return; }
    if (!result) return;
    const barMs = song ? (60 / song.song.bpm) * 4 * 1000 : 1600;
    const step = (i: number) => {
      const list = abSide.current === 'before' ? chords : result.chords;
      const k = i % Math.max(1, list.length);
      const shape = findChordVoicings(list[k], 1, tuning.notes)[0];
      if (shape) playChord(shape, tuning.openFreqs);
      setAb({ side: abSide.current, step: k });
      abTimer.current = setTimeout(() => step(k + 1), barMs);
    };
    unlockAudio().then(() => step(0));
  };

  const he = lang === 'he';

  // ── Editing the chords ────────────────────────────────────────────────────
  const drag = useRef<number | null>(null);
  const removeAt = (i: number) => onChordsChange(chords.filter((_, j) => j !== i));
  const moveTo = (from: number, to: number) => {
    const next = [...chords];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChordsChange(next);
  };
  const [adding, setAdding] = useState(false);
  const [aRoot, setARoot] = useState('C');
  const [aTriad, setATriad] = useState('M');
  const [aExt, setAExt] = useState('');
  const aName = aRoot + ((SUFFIX_MAP[aTriad]?.[aExt] ?? '') === 'M' ? '' : (SUFFIX_MAP[aTriad]?.[aExt] ?? ''));
  const aValid = VALID_EXTENSIONS[aTriad] ?? [''];
  const hearAdd = (r: string, t: string, x: string) => previewChordName(r + (SUFFIX_MAP[t]?.[x] ?? ''));
  const full = chords.length >= 8;

  // A changed level (or style) re-runs a reharm already on screen.
  const rerun = (t: number) => {
    if (!result) return;
    if (liveTimer.current) clearTimeout(liveTimer.current);
    liveTimer.current = setTimeout(() => handleReharmonize(t, true), 700);
  };

  const label = (text: string, right?: React.ReactNode) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: T.textMuted }}>{text}</span>
      {right}
    </div>
  );

  const toolbar = (
    <StopActions>
      <button onClick={() => setShowNashville(v => !v)} aria-pressed={showNashville} className="lg gc-no-bar" dir="ltr"
        title={he ? 'מספרי נאשוויל: כל אקורד כמספר בסולם' : 'Nashville numbers: each chord as a number in the key'}
        style={{ height: 44, borderRadius: 22, padding: '0 16px', fontSize: 14, fontWeight: 600, color: showNashville ? '#000' : T.text, background: showNashville ? T.text : undefined }}>
        1 · 4 · 5
      </button>
    </StopActions>
  );

  // ── Your chords ───────────────────────────────────────────────────────────
  const yourChords = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
      {label(he ? `האקורדים שלכם · ${chords.length}/8` : `Your chords · ${chords.length}/8`,
        chords.length > 0 && <button onClick={() => onChordsChange([])} className="gc-no-bar" style={{ fontSize: 14, color: T.tintLabel }}>{he ? 'ניקוי' : 'Clear'}</button>)}
      {chords.length === 0 ? (
        <div style={{ borderRadius: 26, background: T.bgCard, padding: '26px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center' }}>
          <span style={{ fontSize: 17, fontWeight: 600 }}>{he ? 'עדיין אין אקורדים' : 'No chords yet'}</span>
          <span className="su-sub" style={{ fontSize: 15 }}>{he ? 'הוסיפו אקורדים, או התחילו מדוגמה.' : 'Add some chords, or start from an example.'}</span>
          <ExampleChips onPick={onChordsChange} title={he ? 'דוגמאות' : 'Examples'} />
        </div>
      ) : (
        <div role="list" dir="ltr" className="gc-no-scrollbar" style={{ display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none', padding: 2, margin: -2 }}>
          {chords.map((c, i) => {
            const now = ab?.side === 'before' && ab.step === i;
            return (
              <div key={i} role="listitem" draggable
                onDragStart={() => { drag.current = i; }} onDragOver={e => e.preventDefault()}
                onDrop={() => { const f = drag.current; drag.current = null; if (f != null && f !== i) moveTo(f, i); }}
                style={{
                  position: 'relative', flex: chords.length <= 5 ? '1 1 0' : '0 0 78px', minWidth: 64, height: 64, borderRadius: 22, cursor: 'grab',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
                  background: now ? T.text : 'rgba(255,255,255,0.08)', color: now ? '#000' : T.text,
                }}>
                <button onClick={() => previewChordName(c)} className="gc-no-bar gc-notation" aria-label={he ? `השמעת ${c}` : `Play ${c}`}
                  style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', color: 'inherit' }}>{formatChordName(c)}</button>
                {showNashville && <span style={{ fontSize: 11, opacity: 0.6 }}>{toNashville(c, keyRoot)}</span>}
                <button onClick={() => removeAt(i)} aria-label={he ? `הסרת ${c}` : `Remove ${c}`} className="gc-no-bar"
                  style={{ position: 'absolute', top: 3, right: 3, width: 20, height: 20, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'inherit', opacity: 0.45 }}>
                  {icon(<path d="M6 6l12 12M18 6 6 18" />, 11)}
                </button>
              </div>
            );
          })}
        </div>
      )}
      <Fold title={he ? 'הוספת אקורד' : 'Add a chord'} open={adding} onToggle={() => setAdding(o => !o)}
        summary={<span dir="ltr">{formatChordName(aName)}</span>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Chips label={he ? 'שורש' : 'Root'} cols={6} value={aRoot} onChange={r => { setARoot(r); hearAdd(r, aTriad, aExt); }}
            items={ROOTS.map(r => ({ id: r, label: r.replace('#', '♯') }))} />
          <Chips label={he ? 'איכות' : 'Quality'} value={aTriad} onChange={t => { setATriad(t); setAExt(''); hearAdd(aRoot, t, ''); }}
            items={TRIADS.map(t => ({ id: t.key, label: he ? (TRIAD_HE[t.key] ?? t.display) : t.display }))} />
          {aValid.length > 1 && (
            <Chips label={he ? 'צבע נוסף' : 'Add a colour'} value={aExt} onChange={x => { setAExt(x); hearAdd(aRoot, aTriad, x); }}
              items={EXTENSIONS.filter(e => aValid.includes(e.key)).map(e => ({ id: e.key, label: e.key === '' ? (he ? 'בלי' : 'None') : e.display }))} />
          )}
          <button onClick={() => onChordsChange([...chords, aName])} disabled={full} className="su-primary gc-no-bar"
            style={{ height: 48, opacity: full ? 0.35 : 1 }}>
            {full ? (he ? 'עד 8 אקורדים' : 'Up to 8 chords') : <>{he ? 'הוספת ' : 'Add '}<span dir="ltr" className="gc-notation">{formatChordName(aName)}</span></>}
          </button>
        </div>
      </Fold>
    </div>
  );

  // ── How to change them ────────────────────────────────────────────────────
  const options = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
      <Chips label={he ? 'סגנון' : 'Style'} value={genre} onChange={g => { setGenre(g); }}
        items={GENRES.map(g => ({ id: g.id, label: he ? (GENRE_HE[g.id] ?? g.label) : g.label }))} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Chips label={he ? 'כמה להעז' : 'How adventurous'} cols={5} value={String(tension)}
          onChange={v => { const t = Number(v); setTension(t); rerun(t); }}
          items={LEVELS.map((l, i) => ({ id: String(i + 1), label: l[lang] }))} />
        {hint(HINT.tension[lang])}
      </div>
      <Fold title={he ? 'אפשרויות נגינה' : 'Playing options'} open={showPlay} onToggle={() => setShowPlay(o => !o)}
        summary={`${mode === 'full' ? (he ? 'אקורד מלא' : 'Full chords') : (he ? 'טריאדות' : 'Triads')} · ${STRINGS.find(x => x.id === stringGroup)?.[lang]}`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Chips label={he ? 'צורה' : 'Shape'} value={mode} onChange={setMode}
            items={[{ id: 'full' as VoicingMode, label: he ? 'אקורד מלא' : 'Full' }, { id: 'triads' as VoicingMode, label: he ? 'טריאדות' : 'Triads' }]} />
          <Chips label={he ? 'מיתרים' : 'Strings'} value={stringGroup} onChange={setStringGroup}
            items={STRINGS.map(x => ({ id: x.id, label: x[lang] }))} />
          {hint(HINT.shapes[lang])}
        </div>
      </Fold>
      <button onClick={() => handleReharmonize()} disabled={chords.length === 0 || loading} className="gc-no-bar"
        style={{ height: 52, borderRadius: 26, background: T.text, color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 17, fontWeight: 600, opacity: chords.length === 0 ? 0.35 : 1 }}>
        {loading
          ? <><span style={spinner('#000')} /> {he ? 'מחפשים אקורדים חדשים…' : 'Finding new chords…'}</>
          : <><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 2l2 6.5L20.5 11 14 13.5 12 20l-2-6.5L3.5 11 10 8.5z" /></svg>{he ? 'רה-הרמוניזציה' : 'Re-Harmonize'}</>}
      </button>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  // ── The result ────────────────────────────────────────────────────────────
  const card = (children: React.ReactNode) => (
    <div style={{ borderRadius: 26, background: T.bgCard, padding: '18px 18px 20px', display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>{children}</div>
  );
  const sideBtn = (side: 'before' | 'after', text: string) => {
    const on = ab?.side === side;
    return (
      <button key={side} onClick={() => abPlay(side)} aria-pressed={on} className="gc-no-bar"
        style={{ flex: 1, height: 40, borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 15, fontWeight: 600,
          background: on ? T.text : 'transparent', color: on ? '#000' : T.text, transition: 'background 240ms ease, color 240ms ease' }}>
        <svg width="11" height="11" viewBox="0 0 24 24" aria-hidden><path d="M6 3.5v17l15-8.5z" fill="currentColor" /></svg>{text}
      </button>
    );
  };

  const resultView = result && (
    <>
      {card(<>
        {label(he ? 'לפני ואחרי' : 'Before and after')}
        <div dir="ltr" style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(chords.length, result.chords.length)}, minmax(0, 1fr))`, gap: 6 }}>
          {chords.map((c, i) => (
            <span key={`o${i}`} className="gc-notation" style={{ textAlign: 'center', fontSize: 14, color: ab?.side === 'before' && ab.step === i ? T.text : T.textMuted, fontWeight: ab?.side === 'before' && ab.step === i ? 700 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {formatChordName(c)}
            </span>
          ))}
          {result.chords.map((c, i) => {
            const changed = formatChordName(c) !== formatChordName(chords[i] ?? '');
            const now = ab?.side === 'after' && ab.step === i;
            return (
              <button key={`n${i}`} onClick={() => previewChordName(c)} className="gc-no-bar gc-notation"
                style={{ height: 52, borderRadius: 18, minWidth: 0, padding: '0 4px', fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  background: now ? T.text : changed ? T.primaryBg : 'rgba(255,255,255,0.06)', color: now ? '#000' : changed ? T.tintLabel : T.text,
                  boxShadow: changed && !now ? `inset 0 0 0 1px ${T.primary}` : undefined }}>
                {formatChordName(c)}
                {showNashville && <span style={{ display: 'block', fontSize: 10, opacity: 0.6, fontWeight: 500 }}>{toNashville(c, keyRoot)}</span>}
              </button>
            );
          })}
        </div>
        <span style={{ fontSize: 13, color: T.textMuted }}>{he ? 'האקורדים הצבעוניים הם אלה שהשתנו. הקישו על אקורד כדי לשמוע אותו.' : 'The coloured chords are the ones that changed. Tap one to hear it.'}</span>
        <div className="lg" style={{ display: 'flex', gap: 2, padding: 3, borderRadius: 23 }}>
          {sideBtn('before', he ? 'המקור' : 'Original')}
          {sideBtn('after', he ? 'החדש' : 'New')}
          {ab && (
            <button onClick={abStop} aria-label={he ? 'עצירה' : 'Stop'} className="gc-no-bar" style={{ width: 40, height: 40, borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.text }}>
              <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden><rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor" /></svg>
            </button>
          )}
        </div>
      </>)}

      {card(<>
        {label(he ? 'למה זה עובד' : 'Why it works')}
        <p dir="auto" style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: T.text }}>{result.analysis}</p>
        <p dir="auto" style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: T.textMuted }}>{result.theory}</p>
      </>)}

      {reharmPaths.length > 0 ? card(<>
        {label(he ? 'איך לנגן את זה' : 'How to play it',
          currentPath && (
            <button onClick={handlePlay} className="gc-no-bar" style={{ fontSize: 14, fontWeight: 600, color: T.tintLabel, display: 'flex', alignItems: 'center', gap: 5 }}>
              {isPlaying ? (he ? 'עצירה' : 'Stop') : (he ? 'נגנו את הדרך הזו' : 'Play this way')}
            </button>
          ))}
        {hint(HINT.paths[lang])}
        <div role="radiogroup" aria-label={he ? 'דרכים לנגן' : 'Ways to play'} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {reharmPaths.map((path, pi) => {
            const on = pi === selectedPathIdx;
            return (
              <button key={path.id} role="radio" aria-checked={on} onClick={() => setSelectedPathIdx(pi)} className="gc-no-bar"
                style={{ height: 36, padding: '0 14px', borderRadius: 18, fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
                  background: on ? T.text : 'rgba(255,255,255,0.08)', color: on ? '#000' : T.text }}>
                {path.label}
                {pi === 0 && <span style={{ fontSize: 11, fontWeight: 700, color: on ? T.primary : T.tintLabel }}>{he ? 'הכי חלק' : 'Smoothest'}</span>}
              </button>
            );
          })}
        </div>
        {currentPath && <span dir="auto" style={{ fontSize: 13, color: T.textMuted }}>{currentPath.description}</span>}
        {currentPath && (
          <div dir="ltr" className="gc-no-scrollbar" style={{ display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none' }}>
            {currentPath.voicings.map((voicing, ci) => (
              <button key={ci} type="button" onClick={() => setModalIdx(ci)} className="gc-no-bar"
                aria-label={he ? `הגדלת ${result.chords[ci]}` : `Enlarge ${result.chords[ci]}`}
                style={{ flex: '0 0 116px', borderRadius: 18, padding: '10px 6px 8px', background: 'rgba(255,255,255,0.06)', color: T.text, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <span className="gc-notation" style={{ fontSize: 16, fontWeight: 700 }}>{formatChordName(result.chords[ci])}</span>
                <div style={{ width: '100%' }}><MiniFretboard voicing={voicing} dotColor={T.secondary} tuning={tuning.notes} /></div>
                <FretBadge voicing={voicing} />
              </button>
            ))}
          </div>
        )}
      </>) : card(
        <span style={{ fontSize: 14, color: T.textMuted }}>{he ? 'לא מצאנו דרך נוחה לנגן את זה. נסו "אקורד מלא" או "כל המיתרים" באפשרויות הנגינה.' : 'No comfortable way to play this found. Try Full or All strings in Playing options.'}</span>
      )}

      {/* Back to the song: replace its chords, or keep the reharm beside them. */}
      {song && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button onClick={() => { song.setChordNames(result.chords); flashUsed(); }} className="gc-no-bar"
            style={{ height: 50, padding: '0 24px', borderRadius: 25, background: T.text, color: '#000', fontSize: 17, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 7 }}>
            {used ? icon(<path d="m5 12 5 5 9-10" />, 17) : null}
            {used ? (he ? 'בשיר שלכם' : 'In your song') : (he ? 'השתמשו בשיר' : 'Use in song')}
          </button>
          <button onClick={() => {
            const t = TUNINGS.find(x => x.name === song.song.tuningName) ?? TUNINGS[0];
            song.saveVariant(`Reharm · ${GENRES.find(g => g.id === genre)?.label ?? genre}`, namesToProgression(result.chords, t.notes));
            flashKept();
          }} className="gc-no-bar"
            style={{ height: 50, padding: '0 22px', borderRadius: 25, background: 'rgba(255,255,255,0.08)', color: T.text, fontSize: 17, fontWeight: 600 }}>
            {kept ? (he ? 'נשמר כגרסה' : 'Kept as variant') : (he ? 'שמירה כגרסה' : 'Keep as variant')}
          </button>
        </div>
      )}
      <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap', marginTop: -6 }}>
        <SaveToLibraryButton size="sm" label={he ? 'שמירה לספרייה' : 'Save to Library'}
          style={{ height: 40, padding: '0 14px', borderRadius: 20, fontSize: 15, fontWeight: 500, color: T.tintLabel, background: 'transparent', border: 'none' }}
          getPayload={() => ({
            kind: 'reharm',
            name: `Reharm — ${GENRES.find(g => g.id === genre)?.label ?? genre} (${chords.length} chords)`,
            original: chords,
            result: { chords: result.chords, analysis: result.analysis, theory: result.theory },
            genre, tension,
          })} />
        <button onClick={() => exportMidi(result.chords)} className="gc-no-bar"
          style={{ height: 40, padding: '0 14px', borderRadius: 20, fontSize: 15, fontWeight: 500, color: T.tintLabel }}>
          {he ? 'ייצוא MIDI' : 'Export MIDI'}
        </button>
      </div>
    </>
  );

  const right = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
      {error && !loading && (
        <div role="alert" style={{ borderRadius: 22, background: T.bgCard, padding: '14px 18px', fontSize: 15 }}><b>{WARN}</b> {error}</div>
      )}
      {resultView}
      {!result && !error && desktop && (
        <div style={{ borderRadius: 26, boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,0.10)', padding: '48px 28px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 17, fontWeight: 600 }}>{loading ? (he ? 'מחפשים אקורדים חדשים…' : 'Finding new chords…') : (he ? 'האקורדים החדשים יופיעו כאן' : 'Your new chords will appear here')}</span>
          <span className="su-sub" style={{ fontSize: 15, maxWidth: 340 }}>{he ? 'לצד המקור, כדי שתוכלו להשוות באוזן.' : 'Next to the originals, so you can compare them by ear.'}</span>
        </div>
      )}
      {modalIdx !== null && currentPath && result && (
        <ReharmModal voicings={currentPath.voicings} chordNames={result.chords} index={modalIdx} tuning={tuning.notes} onClose={() => setModalIdx(null)} />
      )}
    </div>
  );

  const left = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, minWidth: 0 }}>
      <HowItWorks />
      {yourChords}
      {options}
    </div>
  );

  if (desktop) {
    return (
      <div className="su-in" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 400px) minmax(0, 1fr)', gap: 40, alignItems: 'start' }}>
        {toolbar}
        {left}
        <div style={{ position: 'sticky', top: 24 }}>{right}</div>
      </div>
    );
  }

  return (
    <div className="su-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {toolbar}
      {left}
      {right}
    </div>
  );
}
