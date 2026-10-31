import { useState, useMemo, useEffect } from 'react';
import { Chord } from '@tonaljs/tonal';
import type { ChordInProgression, FretPosition, Tuning } from '../../types/music';
import { ChordStructure } from '../ChordBuilder/ChordStructure';
import { ChordStage, BigShape, PlayButton, SoftButton, Chips, ShapeStrip, GlassSelect, SongStrip, Fold, icon } from '../ChordBuilder/Stage';
import { StopActions } from '../Transit/StopActions';
import { useLang } from '../../contexts/LanguageContext';
import { playChord, unlockAudio } from '../../utils/audioPlayback';
import { findChordVoicings } from '../../utils/chordVoicings';
import { identifyChord } from '../../utils/chordIdentifier';
import { T } from '../../theme';
import { TUNINGS } from '../../utils/musicTheory';
import { useFlash } from '../../motion/useFlash';
import { previewNote, previewVoicing } from '../../utils/previewSound';
import { pickOne } from '../../utils/random';

interface Props {
  onAddToProgression: (item: ChordInProgression) => void;
  progression: ChordInProgression[];
  onRemoveFromProgression: (id: string) => void;
  onClearProgression: () => void;
  onReorderProgression: (id: string, dir: -1 | 1) => void;
  onTransposeProgression: (semitones: number) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  tuning: Tuning;
  /** The tuning is the app's (shared with By Ear); this changes it. */
  onTuningChange?: (t: Tuning) => void;
  capo: number;
  desktop?: boolean;
  /** Opens another stop (the song strip opens Progression). */
  onGo?: (stopId: string) => void;
}

const ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const TRIADS: { display: string; key: string }[] = [
  { display: 'Major',  key: 'M'    },
  { display: 'Minor',  key: 'm'    },
  { display: 'dim',    key: 'dim'  },
  { display: 'aug',    key: 'aug'  },
  { display: 'sus2',   key: 'sus2' },
  { display: 'sus4',   key: 'sus4' },
];

const TRIAD_HE: Record<string, string> = { M: 'מז׳ור', m: 'מינור', dim: 'מוקטן', aug: 'מוגדל', sus2: 'sus2', sus4: 'sus4' };

const EXTENSIONS: { display: string; key: string }[] = [
  { display: '—',     key: ''     },
  { display: '+7',    key: '7'    },
  { display: '+maj7', key: 'maj7' },
  { display: '+9',    key: '9'    },
  { display: '+add9', key: 'add9' },
  { display: '+6',    key: '6'    },
  { display: '+11',   key: '11'   },
  { display: '+13',   key: '13'   },
];

// Which extensions are valid per triad
const VALID_EXTENSIONS: Record<string, string[]> = {
  'M':    ['', '7', 'maj7', '9', 'add9', '6', '11', '13'],
  'm':    ['', '7', 'maj7', '9', 'add9', '6', '11', '13'],
  'dim':  ['', '7'],
  'aug':  ['', '7'],
  'sus2': [''],
  'sus4': [''],
};

// Full chord suffix derived from triad + extension
const SUFFIX_MAP: Record<string, Record<string, string>> = {
  'M':    { '': 'M',    '7': '7',    'maj7': 'maj7', '9': '9',   'add9': 'add9', '6': '6',   '11': '11',  '13': '13'  },
  'm':    { '': 'm',    '7': 'm7',   'maj7': 'mMaj7',  '9': 'm9',  'add9': 'madd9','6': 'm6',  '11': 'm11', '13': 'm13' },
  'dim':  { '': 'dim',  '7': 'dim7'  },
  'aug':  { '': 'aug',  '7': 'aug7'  },
  'sus2': { '': 'sus2' },
  'sus4': { '': 'sus4' },
};

const PICK_KEY = 'scaleup_byname_pick';
function readPick(): { root: string | null; triad: string | null; ext: string } {
  try {
    const v = JSON.parse(localStorage.getItem(PICK_KEY) ?? 'null');
    if (v && typeof v.root === 'string' && typeof v.triad === 'string') return { root: v.root, triad: v.triad, ext: v.ext ?? '' };
  } catch { /* private mode / bad JSON */ }
  return { root: 'C', triad: 'M', ext: '' };
}

export function ChordPickerTab({
  onAddToProgression, progression,
  tuning: tuningProp, onTuningChange, desktop, onGo,
}: Props) {
  // Opens on the last chord picked (C major the first time), so the tool shows
  // its voicings straight away instead of waiting for two choices.
  const [selectedRoot,      setSelectedRoot]      = useState<string | null>(() => readPick().root);
  const [selectedTriad,     setSelectedTriad]     = useState<string | null>(() => readPick().triad);
  const [selectedExtension, setSelectedExtension] = useState<string>(() => readPick().ext);
  useEffect(() => {
    try { localStorage.setItem(PICK_KEY, JSON.stringify({ root: selectedRoot, triad: selectedTriad, ext: selectedExtension })); } catch { /* private mode */ }
  }, [selectedRoot, selectedTriad, selectedExtension]);
  // The shape drawn large (and strummed / added): the last one viewed.
  const [shown, setShown] = useState(0);
  // The choices fold away once picked; first-timers see them open.
  const [open, setOpen] = useState(() => { try { return localStorage.getItem(PICK_KEY) == null; } catch { return true; } });
  const { lang } = useLang();
  const he = lang === 'he';
  // One tuning for the whole app — this selector and By Ear's change the same one.
  const tuningObj = tuningProp ?? TUNINGS[0];
  const tuningName = tuningObj.name;
  const tuning = tuningObj.notes;

  const suffix = selectedTriad
    ? (SUFFIX_MAP[selectedTriad]?.[selectedExtension] ?? SUFFIX_MAP[selectedTriad]?.[''] ?? '')
    : null;

  const chordName = selectedRoot && suffix !== null
    ? `${selectedRoot}${suffix}`
    : null;

  const voicings = useMemo(() => {
    if (!chordName) return [];
    return findChordVoicings(chordName, 6, tuning);
  }, [chordName, tuning]);

  const handleTuningChange = (name: string) => {
    const t = TUNINGS.find(x => x.name === name);
    if (t) onTuningChange?.(t);
    setShown(0);
  };
  // Each choice is heard as it is made: the root alone until there is a chord,
  // then the chord's first shape.
  const hear = (root: string | null, triad: string | null, ext: string) => {
    if (!root) return;
    const sfx = triad ? (SUFFIX_MAP[triad]?.[ext] ?? SUFFIX_MAP[triad]?.[''] ?? null) : null;
    if (sfx === null) { previewNote(root); return; }
    const shape = findChordVoicings(`${root}${sfx}`, 1, tuning)[0];
    if (shape) previewVoicing(shape, tuningObj.openFreqs);
  };
  const roll = () => {
    const root = pickOne(ROOTS);
    const triad = pickOne(TRIADS).key;
    const exts = VALID_EXTENSIONS[triad] ?? [''];
    const ext = Math.random() < 0.5 ? '' : pickOne(exts);
    setSelectedRoot(root); setSelectedTriad(triad); setSelectedExtension(ext); setShown(0);
    hear(root, triad, ext);
  };
  const handleRootSelect = (root: string) => {
    setSelectedRoot(root); setShown(0);
    hear(root, selectedTriad, selectedExtension);
  };
  const handleTriadSelect = (key: string) => {
    setSelectedTriad(key);
    setSelectedExtension(''); // reset extension when triad changes
    setShown(0);
    hear(selectedRoot, key, '');
  };
  const handleExtensionSelect = (key: string) => {
    setSelectedExtension(key); setShown(0);
    hear(selectedRoot, selectedTriad, key);
  };

  // Adds the shape drawn large to the song.
  const [added, flashAdded] = useFlash();
  const addVoicing = (voicing: FretPosition[]) => {
    const found = identifyChord(voicing, tuning);
    const chord = found.length > 0 ? found[0] : { name: chordName ?? 'Unknown', notes: [], aliases: [] };
    onAddToProgression({ id: `chord-${Date.now()}`, chord, fretPositions: [...voicing] });
    flashAdded();
  };

  const validExt = selectedTriad ? (VALID_EXTENSIONS[selectedTriad] ?? ['']) : [];
  const current = voicings[shown] ?? voicings[0];
  const play = () => { if (current) unlockAudio().then(() => playChord(current, tuningObj.openFreqs)); };
  const notes = chordName ? Chord.get(chordName).notes : [];

  const toolbar = (
    <StopActions>
      {onTuningChange && (
        <GlassSelect label={he ? 'כיוון' : 'Tuning'} text={tuningObj.label ?? tuningObj.name} value={tuningName} onChange={handleTuningChange}>
          {TUNINGS.map(t => <option key={t.name} value={t.name}>{t.label ?? t.name}</option>)}
        </GlassSelect>
      )}
      <button onClick={roll} className="lg lg-circle gc-no-bar" aria-label={he ? 'אקורד אקראי' : 'Random chord'} style={{ color: T.text }}>
        {icon(<><rect x="4" y="4" width="16" height="16" rx="4" /><circle cx="9" cy="9" r="0.6" fill="currentColor" /><circle cx="15" cy="15" r="0.6" fill="currentColor" /><circle cx="15" cy="9" r="0.6" fill="currentColor" /><circle cx="9" cy="15" r="0.6" fill="currentColor" /></>)}
      </button>
    </StopActions>
  );

  const stage = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22, minWidth: 0 }}>
      <ChordStage desktop={desktop} name={chordName}
        empty={he ? 'בחרו שורש ואיכות' : 'Pick a root and a quality'}
        line={chordName && <span dir="ltr" className="gc-notation">{notes.join(' · ')}</span>} />
      {current && <BigShape voicing={current} name={chordName} tuning={tuning} />}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
        <PlayButton onPlay={play} disabled={!current} label={he ? 'נגנו' : 'Play'} />
        <SoftButton onClick={() => current && addVoicing(current)} disabled={!current}>
          {added ? icon(<path d="m5 12 5 5 9-10" />, 17) : icon(<path d="M12 5v14M5 12h14" />, 17)}
          {added ? (he ? 'נוסף לשיר' : 'Added') : (he ? 'הוספה לשיר' : 'Add to song')}
        </SoftButton>
      </div>
      {chordName && voicings.length > 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: T.textMuted }}>
            {he ? `${voicings.length} צורות לנגן אותו` : `${voicings.length} ways to play it`}
          </span>
          <ShapeStrip voicings={voicings} selected={shown} chordName={chordName} tuning={tuning}
            onSelect={(v, i) => { setShown(i); previewVoicing(v, tuningObj.openFreqs); }} />
        </div>
      )}
      {chordName && voicings.length === 0 && (
        <p className="su-sub" style={{ textAlign: 'center', margin: 0 }}>{he ? 'לא נמצאו צורות בכיוון הזה' : 'No shapes found in this tuning'}</p>
      )}
    </div>
  );

  const pickers = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
      <Chips label={he ? 'שורש' : 'Root'} cols={6} value={selectedRoot} onChange={handleRootSelect}
        items={ROOTS.map(r => ({ id: r, label: r.replace('#', '♯') }))} />
      <Chips label={he ? 'איכות' : 'Quality'} value={selectedTriad} onChange={handleTriadSelect}
        items={TRIADS.map(t => ({ id: t.key, label: he ? (TRIAD_HE[t.key] ?? t.display) : t.display }))} />
      {selectedTriad && validExt.length > 1 && (
        <Chips label={he ? 'צבע נוסף' : 'Add a colour'} value={selectedExtension} onChange={handleExtensionSelect}
          items={EXTENSIONS.filter(e => validExt.includes(e.key)).map(e => ({ id: e.key, label: e.key === '' ? (he ? 'בלי' : 'None') : e.display.replace('+', '') }))} />
      )}
    </div>
  );

  const triadLabel = (k: string | null) => { const t = TRIADS.find(x => x.key === k); return t ? (he ? (TRIAD_HE[t.key] ?? t.display) : t.display) : ''; };
  const extLabel = selectedExtension ? EXTENSIONS.find(e => e.key === selectedExtension)?.display.replace('+', '') : null;
  const fold = (
    <Fold title={he ? 'בניית האקורד' : 'Build the chord'} open={open} onToggle={() => setOpen(o => !o)}
      summary={<span dir="ltr">{[selectedRoot?.replace('#', '♯'), triadLabel(selectedTriad), extLabel].filter(Boolean).join(' · ')}</span>}>
      {pickers}
    </Fold>
  );

  const formula = chordName ? (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: T.textMuted }}>{he ? 'ממה הוא בנוי' : 'What it is made of'}</span>
      <ChordStructure chordName={chordName} />
    </div>
  ) : null;

  const song = onGo ? <SongStrip progression={progression} onOpen={() => onGo('progression')} /> : null;

  if (desktop) {
    return (
      <div className="su-in" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 400px)', gap: '24px 48px', alignItems: 'start' }}>
        {toolbar}
        <div style={{ gridColumn: '1 / -1' }}>{fold}</div>
        {stage}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22, minWidth: 0 }}>
          {formula}
          {song}
        </div>
      </div>
    );
  }

  return (
    <div className="su-in" style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {toolbar}
      {fold}
      {stage}
      {formula}
      {song}
    </div>
  );
}
