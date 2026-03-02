import { useState, useMemo } from 'react';
import type { ChordInProgression, FretPosition } from '../../types/music';
import { VoicingVariations } from '../ChordBuilder/VoicingVariations';
import { findChordVoicings } from '../../utils/chordVoicings';
import { identifyChord, formatChordName } from '../../utils/chordIdentifier';
import { T, card, btn } from '../../theme';

interface Props {
  onAddToProgression: (item: ChordInProgression) => void;
}

const ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const QUALITY_GROUPS: { label: string; qualities: { display: string; suffix: string }[] }[] = [
  {
    label: 'Basic',
    qualities: [
      { display: 'Major', suffix: 'M' },
      { display: 'Minor', suffix: 'm' },
    ],
  },
  {
    label: '7ths',
    qualities: [
      { display: '7', suffix: '7' },
      { display: 'maj7', suffix: 'maj7' },
      { display: 'm7', suffix: 'm7' },
      { display: 'm7b5', suffix: 'm7b5' },
      { display: 'dim7', suffix: 'dim7' },
    ],
  },
  {
    label: 'Extended',
    qualities: [
      { display: 'add9', suffix: 'add9' },
      { display: '9', suffix: '9' },
      { display: '11', suffix: '11' },
      { display: '13', suffix: '13' },
    ],
  },
  {
    label: 'Sus',
    qualities: [
      { display: 'sus2', suffix: 'sus2' },
      { display: 'sus4', suffix: 'sus4' },
    ],
  },
  {
    label: 'Other',
    qualities: [
      { display: 'dim', suffix: 'dim' },
      { display: 'aug', suffix: 'aug' },
      { display: '6', suffix: '6' },
      { display: 'm6', suffix: 'm6' },
    ],
  },
];

export function ChordPickerTab({ onAddToProgression }: Props) {
  const [selectedRoot, setSelectedRoot] = useState<string | null>(null);
  const [selectedSuffix, setSelectedSuffix] = useState<string | null>(null);
  const [pickerDots, setPickerDots] = useState<FretPosition[]>([]);
  const [selectedVoicingIndex, setSelectedVoicingIndex] = useState<number | undefined>(undefined);

  const chordName = selectedRoot && selectedSuffix !== null
    ? `${selectedRoot}${selectedSuffix}`
    : null;

  const voicings = useMemo(() => {
    if (!chordName) return [];
    return findChordVoicings(chordName);
  }, [chordName]);

  const handleRootSelect = (root: string) => {
    setSelectedRoot(root);
    setPickerDots([]);
    setSelectedVoicingIndex(undefined);
  };

  const handleSuffixSelect = (suffix: string) => {
    setSelectedSuffix(suffix);
    setPickerDots([]);
    setSelectedVoicingIndex(undefined);
  };

  const handleVoicingSelect = (voicing: FretPosition[], index: number) => {
    setPickerDots(voicing);
    setSelectedVoicingIndex(index);
  };

  const handleAdd = () => {
    const chords = identifyChord(pickerDots);
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── Root note selection ── */}
      <div style={card()}>
        <p style={{ margin: '0 0 10px', fontSize: 11, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Root Note
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
          {ROOTS.map(root => {
            const active = selectedRoot === root;
            return (
              <button
                key={root}
                onClick={() => handleRootSelect(root)}
                style={{
                  padding: '8px 4px',
                  borderRadius: 8,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: active ? 700 : 400,
                  background: active ? T.primary : T.bgInput,
                  color: active ? T.text : T.textMuted,
                  transition: 'background 0.15s',
                }}
              >
                {root}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Quality selection ── */}
      <div style={card()}>
        <p style={{ margin: '0 0 10px', fontSize: 11, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Chord Quality
        </p>
        {QUALITY_GROUPS.map(group => (
          <div key={group.label} style={{ marginBottom: 10 }}>
            <p style={{ margin: '0 0 6px', fontSize: 10, color: T.textDim }}>{group.label}</p>
            <div className="gc-pills">
              {group.qualities.map(q => {
                const active = selectedSuffix === q.suffix;
                return (
                  <button
                    key={q.suffix}
                    className="gc-pill"
                    onClick={() => handleSuffixSelect(q.suffix)}
                    style={{
                      padding: '5px 14px',
                      borderRadius: 20,
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: active ? 600 : 400,
                      background: active ? T.primary : T.bgInput,
                      color: active ? T.text : T.textMuted,
                      transition: 'background 0.15s',
                    }}
                  >
                    {q.display}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ── Voicings grid ── */}
      {chordName && (
        <>
          <div style={{ textAlign: 'center', fontSize: 13, color: T.textMuted }}>
            {voicings.length > 0
              ? `${voicings.length} voicing${voicings.length > 1 ? 's' : ''} found for `
              : 'No voicings found for '}
            <span style={{ color: T.text, fontWeight: 700 }}>{displayName}</span>
          </div>

          {voicings.length > 0 && (
            <VoicingVariations
              voicings={voicings}
              selectedIndex={selectedVoicingIndex}
              onSelect={handleVoicingSelect}
            />
          )}
        </>
      )}

      {/* ── Add to Progression ── */}
      {chordName && (
        <button
          onClick={handleAdd}
          disabled={!canAdd}
          style={{ ...btn.primary(!canAdd), width: '100%' }}
        >
          {canAdd ? `+ Add ${displayName} to Progression` : 'Select a voicing above'}
        </button>
      )}
    </div>
  );
}
