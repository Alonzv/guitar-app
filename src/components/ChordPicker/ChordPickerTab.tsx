import { useState, useMemo, useEffect } from 'react';
import type { ChordInProgression, FretPosition, Tuning } from '../../types/music';
import { VoicingVariations } from '../ChordBuilder/VoicingVariations';
import { VoicingViewer } from './VoicingViewer';
import { ChordStructure } from '../ChordBuilder/ChordStructure';
import { ChordPoster, ChordDiagram, PillSelect, StrumButton } from '../ChordBuilder/ChordParts';
import { Rule, PillRow, KeyGrid } from '../Transit/parts';
import { useLang } from '../../contexts/LanguageContext';
import { playChord, unlockAudio } from '../../utils/audioPlayback';
import { ProgressionPanel } from '../ChordBuilder/ProgressionPanel';
import { findChordVoicings } from '../../utils/chordVoicings';
import { identifyChord, formatChordName } from '../../utils/chordIdentifier';
import { btn } from '../../theme';
import { TUNINGS } from '../../utils/musicTheory';
import { RollLabel } from '../RollLabel';
import { useFlash } from '../../motion/useFlash';
import { previewNote, previewVoicing } from '../../utils/previewSound';
import { DiceButton } from '../DiceButton';
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
  onRemoveFromProgression, onClearProgression, onReorderProgression, onTransposeProgression,
  canUndo, canRedo, onUndo, onRedo,
  tuning: tuningProp, onTuningChange, capo, desktop,
}: Props) {
  // Opens on the last chord picked (C major the first time), so the tool shows
  // its voicings straight away instead of waiting for two choices.
  const [selectedRoot,      setSelectedRoot]      = useState<string | null>(() => readPick().root);
  const [selectedTriad,     setSelectedTriad]     = useState<string | null>(() => readPick().triad);
  const [selectedExtension, setSelectedExtension] = useState<string>(() => readPick().ext);
  useEffect(() => {
    try { localStorage.setItem(PICK_KEY, JSON.stringify({ root: selectedRoot, triad: selectedTriad, ext: selectedExtension })); } catch { /* private mode */ }
  }, [selectedRoot, selectedTriad, selectedExtension]);
  // Index of the variation shown enlarged in the VoicingViewer popover, or null.
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  // The shape drawn large (and strummed / added): the last one viewed.
  const [shown, setShown] = useState(0);
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
    setViewerIndex(null); setShown(0);
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
    setSelectedRoot(root); setSelectedTriad(triad); setSelectedExtension(ext); setViewerIndex(null); setShown(0);
    hear(root, triad, ext);
  };
  const handleRootSelect = (root: string) => {
    setSelectedRoot(root); setViewerIndex(null); setShown(0);
    hear(root, selectedTriad, selectedExtension);
  };
  const handleTriadSelect = (key: string) => {
    setSelectedTriad(key);
    setSelectedExtension(''); // reset extension when triad changes
    setViewerIndex(null); setShown(0);
    hear(selectedRoot, key, '');
  };
  const handleExtensionSelect = (key: string) => {
    setSelectedExtension(key); setViewerIndex(null); setShown(0);
    hear(selectedRoot, selectedTriad, key);
  };

  // Add a specific voicing (from the enlarged viewer) straight to the progression.
  const [added, flashAdded] = useFlash();
  const addVoicing = (voicing: FretPosition[]) => {
    const found = identifyChord(voicing, tuning);
    const chord = found.length > 0 ? found[0] : { name: chordName ?? 'Unknown', notes: [], aliases: [] };
    onAddToProgression({ id: `chord-${Date.now()}`, chord, fretPositions: [...voicing] });
    setViewerIndex(null);
    flashAdded();
  };

  const displayName = chordName ? formatChordName(chordName) : null;
  const validExt = selectedTriad ? (VALID_EXTENSIONS[selectedTriad] ?? ['']) : [];

  const progressionPanel = (
    <ProgressionPanel
      progression={progression}
      onAddToProgression={onAddToProgression}
      onRemoveFromProgression={onRemoveFromProgression}
      onClearProgression={onClearProgression}
      onReorderProgression={onReorderProgression}
      onTransposeProgression={onTransposeProgression}
      canUndo={canUndo} canRedo={canRedo} onUndo={onUndo} onRedo={onRedo}
      tuning={tuningObj} capo={capo}
    />
  );

  const current = voicings[shown] ?? voicings[0];
  // STRUM — the one cobalt action: plays the shape drawn large.
  const strum = () => { if (current) unlockAudio().then(() => playChord(current, tuningObj.openFreqs)); };

  const poster = (
    <ChordPoster name={chordName} max={desktop ? 210 : 150} aside={chordName && (
      <span className="su-label">
        {voicings.length > 0
          ? (he ? `${voicings.length} צורות` : `${voicings.length} voicing${voicings.length > 1 ? 's' : ''}`)
          : (he ? 'לא נמצאו צורות' : 'No voicings found')}
        {' · '}{tuningObj.label}
      </span>
    )} />
  );

  const formula = chordName ? <ChordStructure chordName={chordName} /> : null;

  const diagram = chordName && current ? (
    <Rule>
      <ChordDiagram voicing={current} name={chordName} tuning={tuning} side={desktop} />
    </Rule>
  ) : null;

  // ── The dock: quality, extension, root, then STRUM / Add / tuning ──
  const controls = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
      <Rule label={he ? 'איכות' : 'Quality'} right={<DiceButton onRoll={roll} />}>
        <div dir="ltr"><PillRow label={he ? 'איכות' : 'Quality'}
          items={TRIADS.map(t => ({ id: t.key, label: t.display }))}
          value={selectedTriad} onChange={handleTriadSelect} /></div>
        {selectedTriad && validExt.length > 1 && (
          <div dir="ltr" style={{ marginTop: 8 }}>
            <PillRow label={he ? 'הרחבה' : 'Extension'}
              items={EXTENSIONS.filter(e => validExt.includes(e.key)).map(e => ({ id: e.key, label: e.display }))}
              value={selectedExtension} onChange={handleExtensionSelect} />
          </div>
        )}
      </Rule>

      <Rule label={he ? 'שורש' : 'Root'}>
        <div dir="ltr"><KeyGrid label={he ? 'שורש' : 'Root'} cols={6}
          items={ROOTS.map(r => ({ id: r, label: r }))}
          value={selectedRoot} onChange={handleRootSelect} /></div>
      </Rule>

      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <StrumButton onStrum={strum} disabled={!current} label={he ? 'פריטה' : 'Strum'}>
          {he ? 'פריטה' : 'STRUM'}
        </StrumButton>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Adds the shape drawn large, matching the action in By Ear. A
              specific variation can also be added from the enlarged viewer. */}
          <button onClick={() => current && addVoicing(current)} disabled={!current} className="gc-no-bar"
            style={{ ...btn.primary(!current), width: '100%', whiteSpace: 'nowrap' }}>
            <RollLabel>{added ? (he ? '✓ נוסף' : '✓ Added') : (he ? '+ למהלך' : '+ Add to song')}</RollLabel>
          </button>
          <PillSelect label={he ? 'כיוון' : 'Tuning'} value={tuningName} onChange={handleTuningChange}>
            {TUNINGS.map(t => <option key={t.name} value={t.name}>{t.label}</option>)}
          </PillSelect>
        </div>
      </div>
    </div>
  );

  const voicingsPane = chordName && voicings.length > 0 ? (
    <VoicingVariations
      voicings={voicings}
      chordName={chordName ?? undefined}
      tuning={tuning}
      selectedIndex={shown}
      onSelect={(v, i) => { setViewerIndex(i); setShown(i); previewVoicing(v, tuningObj.openFreqs); }}
      gridColumns={desktop ? 4 : undefined}
    />
  ) : !chordName ? (
    <Rule>
      <p className="su-label" style={{ margin: 0 }}>
        {he ? 'בחרו שורש, איכות והרחבה כדי לראות צורות' : 'Pick a root, quality and extension to see voicings'}
      </p>
    </Rule>
  ) : null;

  const viewer = viewerIndex != null && chordName && voicings[viewerIndex] ? (
    <VoicingViewer
      voicings={voicings}
      index={viewerIndex}
      chordName={displayName ?? chordName}
      tuning={tuningObj}
      onNav={i => { setViewerIndex(i); setShown(i); }}
      onAdd={addVoicing}
      onClose={() => setViewerIndex(null)}
    />
  ) : null;

  if (desktop) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {poster}
        <div style={{ display: 'grid', gridTemplateColumns: '340px minmax(0, 1fr)', gap: 40, alignItems: 'start' }}>
          <div style={{ position: 'sticky', top: 0 }}>{controls}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24, minWidth: 0 }}>
            {formula}
            {diagram}
            {voicingsPane}
          </div>
        </div>
        {progressionPanel}
        {viewer}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {poster}
      {formula}
      {diagram}
      {controls}
      {voicingsPane}
      {progressionPanel}
      {viewer}
    </div>
  );
}
