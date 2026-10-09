import { useState, useMemo, useEffect } from 'react';
import type { ChordInProgression, FretPosition, Tuning } from '../../types/music';
import { VoicingVariations } from '../ChordBuilder/VoicingVariations';
import { VoicingViewer } from './VoicingViewer';
import { ChordStructure } from '../ChordBuilder/ChordStructure';
import { ProgressionPanel } from '../ChordBuilder/ProgressionPanel';
import { findChordVoicings } from '../../utils/chordVoicings';
import { identifyChord, formatChordName } from '../../utils/chordIdentifier';
import { T, card, btn } from '../../theme';
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

const LABEL_STYLE = {
  margin: '0 0 10px',
  fontSize: 10,
  fontWeight: 400 as const,
  color: T.textDim,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.14em',
};

const SELECT_STYLE: React.CSSProperties = {
  appearance: 'none',
  WebkitAppearance: 'none',
  background: T.bgInput,
  border: `1px solid ${T.border}`,
  borderRadius: 0,
  color: T.text,
  fontFamily: 'inherit',
  fontSize: 12,
  fontWeight: 600,
  padding: '5px 26px 5px 10px',
  cursor: 'pointer',
  outline: 'none',
  borderLeft: '3px solid var(--gc-bar-color)',
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
  tuning: tuningProp, capo, desktop,
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
  const [tuningName, setTuningName] = useState<string>(tuningProp?.name ?? TUNINGS[0].name);
  const tuningObj = TUNINGS.find(t => t.name === tuningName) ?? TUNINGS[0];
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

  const handleTuningChange = (name: string) => { setTuningName(name); setViewerIndex(null); };
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
    setSelectedRoot(root); setSelectedTriad(triad); setSelectedExtension(ext); setViewerIndex(null);
    hear(root, triad, ext);
  };
  const handleRootSelect = (root: string) => {
    setSelectedRoot(root); setViewerIndex(null);
    hear(root, selectedTriad, selectedExtension);
  };
  const handleTriadSelect = (key: string) => {
    setSelectedTriad(key);
    setSelectedExtension(''); // reset extension when triad changes
    setViewerIndex(null);
    hear(selectedRoot, key, '');
  };
  const handleExtensionSelect = (key: string) => {
    setSelectedExtension(key); setViewerIndex(null);
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

  const builderPane = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── Root note ── */}
      <div style={card()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <p style={LABEL_STYLE}>Root Note</p>
          <DiceButton onRoll={roll} style={{ marginTop: -4 }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: desktop ? 7 : 6 }}>
          {ROOTS.map(root => {
            const active = selectedRoot === root;
            return (
              <button data-active={!!active}
                key={root}
                className="gc-notation"
                onClick={() => handleRootSelect(root)}
                style={{
                  padding: desktop ? '13px 4px' : '8px 4px', borderRadius: 0,
                  cursor: 'pointer', fontSize: 13,
                  fontWeight: active ? 500 : 400,
                  background: active ? T.primary : T.bgInput,
                  color: active ? '#fff' : T.textMuted,
                  borderLeft: `3px solid ${active ? T.primary : 'var(--gc-bar-color)'}`,
                }}
              >
                {root}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Triad quality ── */}
      <div style={card()}>
        <p style={LABEL_STYLE}>Triad</p>
        <div className="gc-pills">
          {TRIADS.map(t => {
            const active = selectedTriad === t.key;
            return (
              <button data-active={!!active}
                key={t.key}
                className="gc-pill gc-notation"
                onClick={() => handleTriadSelect(t.key)}
                style={{
                  padding: '6px 16px', borderRadius: 0,
                  cursor: 'pointer', fontSize: 13,
                  fontWeight: active ? 500 : 400,
                  background: active ? T.primary : T.bgInput,
                  color: active ? '#fff' : T.textMuted,
                  borderLeft: `3px solid ${active ? T.primary : 'var(--gc-bar-color)'}`,
                }}
              >
                {t.display}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Extension — only for Major/Minor/dim/aug ── */}
      {selectedTriad && validExt.length > 1 && (
        <div style={card()}>
          <p style={LABEL_STYLE}>Extension</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            {EXTENSIONS.filter(e => validExt.includes(e.key)).map(e => {
              const active = selectedExtension === e.key;
              return (
                <button data-active={!!active}
                  key={e.key}
                  onClick={() => handleExtensionSelect(e.key)}
                  style={{
                    padding: '8px 4px', borderRadius: 0,
                    cursor: 'pointer', fontSize: 12,
                    fontWeight: active ? 700 : 400,
                    background: active ? T.secondary : T.bgInput,
                    color: active ? '#fff' : T.textMuted,
                    border: `1px solid ${active ? T.secondary : T.border}`,
                    borderLeft: `3px solid ${active ? T.secondary : 'var(--gc-bar-color)'}`,
                    minHeight: 36,
                  }}
                >
                  {e.display}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Tuning selector ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, ...(desktop ? { maxWidth: 240 } : {}) }}>
        <span style={{ fontSize: 10, color: T.textMuted, fontWeight: 400, textTransform: 'uppercase', letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>Tuning</span>
        <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
          <select
            aria-label="Tuning"
            value={tuningName}
            onChange={e => handleTuningChange(e.target.value)}
            style={SELECT_STYLE}
          >
            {TUNINGS.map(t => <option key={t.name} value={t.name}>{t.label}</option>)}
          </select>
          <span style={{ position: 'absolute', right: 8, pointerEvents: 'none', fontSize: 9, color: T.textMuted }}>▾</span>
        </div>
      </div>

      {/* ── Result name (chord summary) ── */}
      {chordName && (
        <div style={{ padding: '10px 0' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ color: T.text, fontWeight: 700, fontSize: desktop ? 56 : 44, letterSpacing: '-0.02em', lineHeight: 1 }}>{displayName}</span>
            <span style={{ fontSize: 13, color: T.textMuted }}>
              {voicings.length > 0
                ? `${voicings.length} voicing${voicings.length > 1 ? 's' : ''}`
                : 'No voicings found'}
            </span>
          </div>
          {chordName && (
            <div style={{ marginTop: 8 }}>
              <ChordStructure chordName={chordName} />
            </div>
          )}
        </div>
      )}

      {/* Adds the chord's primary shape, matching the action in By Ear. Adding a
          specific variation still lives in the enlarged viewer — tap one below. */}
      {chordName && voicings.length > 0 && (
        <button onClick={() => addVoicing(voicings[0])} style={{ ...btn.primary(), width: '100%' }}>
          <RollLabel>{added ? '✓ Added' : '+ Add to Progression'}</RollLabel>
        </button>
      )}
    </div>
  );

  const voicingsPane = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {chordName && voicings.length > 0 ? (
        <>
          {/* VoicingVariations carries its own heading — no second copy here. */}
          <VoicingVariations
            voicings={voicings}
            chordName={chordName ?? undefined}
            tuning={tuning}
            onSelect={(v, i) => { setViewerIndex(i); previewVoicing(v, tuningObj.openFreqs); }}
            gridColumns={desktop ? 3 : undefined}
          />
        </>
      ) : desktop ? (
        <div style={{ ...card({ padding: '40px 24px' }), textAlign: 'center', opacity: 0.6 }}>
          <p style={{ margin: '0 0 8px', fontSize: 13, color: T.text, fontWeight: 500 }}>
            Select a chord
          </p>
          <p style={{ margin: 0, fontSize: 12, color: T.textMuted, lineHeight: 1.6 }}>
            Pick a root, quality, and extension on the left to see voicing variations here.
          </p>
        </div>
      ) : null}
    </div>
  );

  const viewer = viewerIndex != null && chordName && voicings[viewerIndex] ? (
    <VoicingViewer
      voicings={voicings}
      index={viewerIndex}
      chordName={displayName ?? chordName}
      tuning={tuningObj}
      onNav={setViewerIndex}
      onAdd={addVoicing}
      onClose={() => setViewerIndex(null)}
    />
  ) : null;

  if (desktop) {
    return (
      <div style={{ marginTop: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '430px 1fr', gap: 36, alignItems: 'start' }}>
          {builderPane}
          {voicingsPane}
        </div>
        <div style={{ marginTop: 36, borderTop: `1px solid ${T.border}`, paddingTop: 24 }}>
          {progressionPanel}
        </div>
        {viewer}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {builderPane}
      {voicingsPane}
      {progressionPanel}
      {viewer}
    </div>
  );
}
