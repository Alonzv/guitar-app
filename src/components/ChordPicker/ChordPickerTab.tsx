import { useState, useMemo } from 'react';
import type { ChordInProgression, FretPosition, Tuning } from '../../types/music';
import { VoicingVariations } from '../ChordBuilder/VoicingVariations';
import { ChordStructure } from '../ChordBuilder/ChordStructure';
import { ProgressionPanel } from '../ChordBuilder/ProgressionPanel';
import { findChordVoicings } from '../../utils/chordVoicings';
import { identifyChord, formatChordName } from '../../utils/chordIdentifier';
import { SaveToLibraryButton } from '../Workspace/SaveToLibraryButton';
import { T, card, btn } from '../../theme';
import { TUNINGS } from '../../utils/musicTheory';

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
  'm':    { '': 'm',    '7': 'm7',   'maj7': 'mM7',  '9': 'm9',  'add9': 'madd9','6': 'm6',  '11': 'm11', '13': 'm13' },
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

export function ChordPickerTab({
  onAddToProgression, progression,
  onRemoveFromProgression, onClearProgression, onReorderProgression, onTransposeProgression,
  canUndo, canRedo, onUndo, onRedo,
  tuning: tuningProp, capo, desktop,
}: Props) {
  const [selectedRoot,      setSelectedRoot]      = useState<string | null>(null);
  const [selectedTriad,     setSelectedTriad]     = useState<string | null>(null);
  const [selectedExtension, setSelectedExtension] = useState<string>('');
  const [pickerDots,        setPickerDots]        = useState<FretPosition[]>([]);
  const [selectedVoicingIndex, setSelectedVoicingIndex] = useState<number | undefined>(undefined);
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

  const handleTuningChange = (name: string) => {
    setTuningName(name);
    setPickerDots([]);
    setSelectedVoicingIndex(undefined);
  };

  const handleRootSelect = (root: string) => {
    setSelectedRoot(root);
    setPickerDots([]);
    setSelectedVoicingIndex(undefined);
  };

  const handleTriadSelect = (key: string) => {
    setSelectedTriad(key);
    setSelectedExtension(''); // reset extension when triad changes
    setPickerDots([]);
    setSelectedVoicingIndex(undefined);
  };

  const handleExtensionSelect = (key: string) => {
    setSelectedExtension(key);
    setPickerDots([]);
    setSelectedVoicingIndex(undefined);
  };

  const handleVoicingSelect = (voicing: FretPosition[], index: number) => {
    setPickerDots(voicing);
    setSelectedVoicingIndex(index);
  };

  const handleAdd = () => {
    const chords = identifyChord(pickerDots, tuning);
    const chord = chords.length > 0 ? chords[0] : {
      name: chordName ?? 'Unknown',
      notes: [],
      aliases: [],
    };
    onAddToProgression({ id: `chord-${Date.now()}`, chord, fretPositions: [...pickerDots] });
    setPickerDots([]);
    setSelectedVoicingIndex(undefined);
  };

  const canAdd = pickerDots.length >= 2;
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
        <p style={LABEL_STYLE}>Root Note</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: desktop ? 7 : 6 }}>
          {ROOTS.map(root => {
            const active = selectedRoot === root;
            return (
              <button
                key={root}
                onClick={() => handleRootSelect(root)}
                style={{
                  padding: desktop ? '13px 4px' : '8px 4px', borderRadius: 0,
                  cursor: 'pointer', fontSize: 13,
                  fontWeight: active ? 500 : 400,
                  background: active ? T.primary : T.bgInput,
                  color: active ? T.text : T.textMuted,
                  transition: 'filter 0.15s, background 0.15s',
                  borderLeft: '3px solid var(--gc-bar-color)',
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
              <button
                key={t.key}
                className="gc-pill"
                onClick={() => handleTriadSelect(t.key)}
                style={{
                  padding: '6px 16px', borderRadius: 0,
                  cursor: 'pointer', fontSize: 13,
                  fontWeight: active ? 500 : 400,
                  background: active ? T.primary : T.bgInput,
                  color: active ? T.text : T.textMuted,
                  transition: 'filter 0.15s, background 0.15s',
                  borderLeft: '3px solid var(--gc-bar-color)',
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
          <div className="gc-pills">
            {EXTENSIONS.filter(e => validExt.includes(e.key)).map(e => {
              const active = selectedExtension === e.key;
              return (
                <button
                  key={e.key}
                  className="gc-pill"
                  onClick={() => handleExtensionSelect(e.key)}
                  style={{
                    padding: '6px 16px', borderRadius: 0,
                    cursor: 'pointer', fontSize: 13,
                    fontWeight: active ? 500 : 400,
                    background: active ? T.secondary : T.bgInput,
                    color: active ? '#fff' : T.textMuted,
                    transition: 'filter 0.15s, background 0.15s',
                    borderLeft: '3px solid var(--gc-bar-color)',
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
            <span style={{ color: T.text, fontWeight: 600, fontSize: desktop ? 50 : 22, letterSpacing: '-0.02em', lineHeight: 1 }}>{displayName}</span>
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

      {/* ── Add to Progression ── */}
      {chordName && (
        <button
          onClick={handleAdd}
          disabled={!canAdd}
          style={{ ...btn.primary(!canAdd), width: '100%' }}
        >
          {canAdd ? `+ Add ${displayName} to Progression` : 'Select a voicing below'}
        </button>
      )}
      {chordName && canAdd && (
        <SaveToLibraryButton
          style={{ width: '100%', justifyContent: 'center' }}
          label="Save voicing to Library"
          getPayload={() => {
            const found = identifyChord(pickerDots, tuning);
            const chord = found.length > 0 ? found[0] : { name: chordName, notes: [], aliases: [] };
            return {
              kind: 'progression',
              name: chordName,
              chords: [{ id: `chord-${Date.now()}`, chord, fretPositions: [...pickerDots] }],
            };
          }}
        />
      )}
    </div>
  );

  const voicingsPane = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {chordName && voicings.length > 0 && (
        <>
          {desktop && (
            <p style={{ margin: 0, fontSize: 11, fontWeight: 400, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.14em' }}>
              Voicing Variations · Tap to Load
            </p>
          )}
          <VoicingVariations
            voicings={voicings}
            selectedIndex={selectedVoicingIndex}
            chordName={chordName ?? undefined}
            tuning={tuning}
            onSelect={handleVoicingSelect}
            gridColumns={desktop ? 3 : undefined}
          />
        </>
      )}
    </div>
  );

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
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {builderPane}
      {voicingsPane}
      {progressionPanel}
    </div>
  );
}
