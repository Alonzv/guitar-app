import { useState, useMemo } from 'react';
import type { ChordInProgression, FretPosition, Tuning } from '../../types/music';
import { InteractiveFretboard } from '../Fretboard/InteractiveFretboard';
import { ChordName } from './ChordName';
import { ChordStructure } from './ChordStructure';
import { VoicingVariations } from './VoicingVariations';
import { ProgressionPanel } from './ProgressionPanel';
import { identifyChord } from '../../utils/chordIdentifier';
import { findChordVoicings } from '../../utils/chordVoicings';
import { T, card, btn } from '../../theme';
import { TUNINGS } from '../../utils/musicTheory';

interface Props {
  progression: ChordInProgression[];
  onAddToProgression: (item: ChordInProgression) => void;
  onRemoveFromProgression: (id: string) => void;
  onClearProgression: () => void;
  onReorderProgression: (id: string, dir: -1 | 1) => void;
  onTransposeProgression: (semitones: number) => void;
  tuning: Tuning;
  onTuningChange: (tuning: Tuning) => void;
  capo: number;
  onCapoChange: (capo: number) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

const LABEL_STYLE: React.CSSProperties = {
  margin: '0 0 10px',
  fontSize: 11,
  fontWeight: 400,
  color: T.textMuted,
  letterSpacing: '-0.02em',
  textTransform: 'uppercase',
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

export function ChordBuilderTab({
  progression, onAddToProgression, onRemoveFromProgression, onClearProgression,
  onReorderProgression, onTransposeProgression,
  tuning, onTuningChange, capo, onCapoChange,
  canUndo, canRedo, onUndo, onRedo,
}: Props) {
  const [activeDots, setActiveDots] = useState<FretPosition[]>([]);
  const [showVariations, setShowVariations] = useState(false);
  const [selectedVariationIndex, setSelectedVariationIndex] = useState<number | undefined>(undefined);

  const handleToggle = (pos: FretPosition) => {
    setActiveDots(prev => {
      const exists = prev.findIndex(d => d.string === pos.string && d.fret === pos.fret);
      if (exists !== -1) return prev.filter((_, i) => i !== exists);
      return [...prev.filter(d => d.string !== pos.string), pos];
    });
    setShowVariations(false);
    setSelectedVariationIndex(undefined);
  };

  const handleAdd = () => {
    const chords = identifyChord(activeDots, tuning.notes, capo);
    if (chords.length === 0) return;
    onAddToProgression({ id: `chord-${Date.now()}`, chord: chords[0], fretPositions: [...activeDots] });
    setActiveDots([]);
  };

  const chords = useMemo(() => identifyChord(activeDots, tuning.notes, capo), [activeDots, tuning, capo]);
  const voicings = showVariations && chords.length > 0
    ? findChordVoicings(chords[0].name, 6, tuning.notes)
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── Fretboard ── */}
      <div style={card()}>
        <p style={LABEL_STYLE}>Click a fret to place a note · click again to remove</p>

        <div style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 3, minWidth: 0 }}>
            <span style={{ fontSize: 10, color: T.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>Tuning</span>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
              <select
                value={tuning.name}
                onChange={e => {
                  const t = TUNINGS.find(t => t.name === e.target.value);
                  if (t) onTuningChange(t);
                }}
                style={{ ...SELECT_STYLE, width: '100%' }}
              >
                {TUNINGS.map(t => <option key={t.name} value={t.name}>{t.label}</option>)}
              </select>
              <span style={{ position: 'absolute', right: 8, pointerEvents: 'none', fontSize: 9, color: T.textMuted }}>▾</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 2, minWidth: 0 }}>
            <span style={{ fontSize: 10, color: T.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>Capo</span>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
              <select
                value={capo}
                onChange={e => onCapoChange(Number(e.target.value))}
                style={{ ...SELECT_STYLE, width: '100%' }}
              >
                {Array.from({ length: 12 }, (_, n) => (
                  <option key={n} value={n}>{n === 0 ? 'None' : `Fret ${n}`}</option>
                ))}
              </select>
              <span style={{ position: 'absolute', right: 8, pointerEvents: 'none', fontSize: 9, color: T.textMuted }}>▾</span>
            </div>
          </div>
        </div>

        <InteractiveFretboard activeDots={activeDots} onToggle={handleToggle} tuning={tuning.notes} capo={capo} />
      </div>

      {/* ── Chord name — hidden until notes are placed ── */}
      {activeDots.length >= 2 && (
        <div style={card({ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '16px 12px' })}>
          <ChordName positions={activeDots} tuning={tuning.notes} capo={capo} />
          {chords.length > 0 && (
            <button
              onClick={() => { setShowVariations(v => !v); setSelectedVariationIndex(undefined); }}
              style={{
                padding: '6px 16px', borderRadius: 0, border: `1px solid ${T.border}`,
                cursor: 'pointer', fontSize: 12, fontWeight: 500,
                background: showVariations ? T.primaryBg : T.bgInput,
                color: showVariations ? T.primary : T.textMuted,
                transition: 'filter 0.15s',
                borderLeft: '3px solid var(--gc-bar-color)',
              }}
            >
              {showVariations ? 'Hide variations' : 'Show more variations'}
            </button>
          )}
        </div>
      )}

      {/* ── Chord structure ── */}
      {chords.length > 0 && (
        <div style={{ textAlign: 'center', padding: '6px 0' }}>
          <ChordStructure chordName={chords[0].name} />
        </div>
      )}

      {/* ── Voicing variations ── */}
      {showVariations && (
        <VoicingVariations
          voicings={voicings}
          selectedIndex={selectedVariationIndex}
          chordName={chords[0]?.name}
          tuning={tuning.notes}
          onSelect={(voicing, index) => {
            setActiveDots(voicing);
            setSelectedVariationIndex(index);
          }}
        />
      )}

      {/* ── Actions ── */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => setActiveDots([])} style={{ ...btn.secondary(), flex: 1 }}>
          Clear
        </button>
        <button onClick={handleAdd} disabled={chords.length === 0} style={{ ...btn.primary(chords.length === 0), flex: 2 }}>
          + Add to Progression
        </button>
      </div>

      {/* ── Progression ── */}
      <ProgressionPanel
        progression={progression}
        onAddToProgression={onAddToProgression}
        onRemoveFromProgression={onRemoveFromProgression}
        onClearProgression={onClearProgression}
        onReorderProgression={onReorderProgression}
        onTransposeProgression={onTransposeProgression}
        canUndo={canUndo} canRedo={canRedo} onUndo={onUndo} onRedo={onRedo}
        tuning={tuning} capo={capo}
      />
    </div>
  );
}
