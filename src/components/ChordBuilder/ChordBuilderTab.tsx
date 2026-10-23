import { useState, useMemo } from 'react';
import type { ChordInProgression, FretPosition, Tuning } from '../../types/music';
import { InteractiveFretboard } from '../Fretboard/InteractiveFretboard';
import { ChordName } from './ChordName';
import { ChordStructure } from './ChordStructure';
import { VoicingVariations } from './VoicingVariations';
import { ProgressionPanel } from './ProgressionPanel';
import { identifyChord } from '../../utils/chordIdentifier';
import { findChordVoicings } from '../../utils/chordVoicings';
import { SaveToLibraryButton } from '../Workspace/SaveToLibraryButton';
import { btn } from '../../theme';
import { Chord, Note } from '@tonaljs/tonal';
import { fretToNote } from '../../utils/musicTheory';
import { useLang } from '../../contexts/LanguageContext';
import { playChord, unlockAudio } from '../../utils/audioPlayback';
import { Rule, Pill, Cta } from '../Transit/parts';
import { pillStyle } from '../Transit/styles';
import { PillSelect } from './ChordParts';
import { degreeLabels } from './chordFormula';
import { TUNINGS } from '../../utils/musicTheory';
import { RollLabel } from '../RollLabel';
import { useFlash } from '../../motion/useFlash';
import { previewFret, previewVoicing } from '../../utils/previewSound';

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
  desktop?: boolean;
}

export function ChordBuilderTab({
  progression, onAddToProgression, onRemoveFromProgression, onClearProgression,
  onReorderProgression, onTransposeProgression,
  tuning, onTuningChange, capo, onCapoChange,
  canUndo, canRedo, onUndo, onRedo,
  desktop,
}: Props) {
  const [activeDots, setActiveDots] = useState<FretPosition[]>([]);
  const [showVariations, setShowVariations] = useState(false);
  const [selectedVariationIndex, setSelectedVariationIndex] = useState<number | undefined>(undefined);

  const handleToggle = (pos: FretPosition) => {
    // A placed note sounds; a removed one is silent.
    if (!activeDots.some(d => d.string === pos.string && d.fret === pos.fret)) {
      previewFret(pos, tuning.openFreqs, capo);
    }
    setActiveDots(prev => {
      const exists = prev.findIndex(d => d.string === pos.string && d.fret === pos.fret);
      if (exists !== -1) return prev.filter((_, i) => i !== exists);
      return [...prev.filter(d => d.string !== pos.string), pos];
    });
    setShowVariations(false);
    setSelectedVariationIndex(undefined);
  };

  const [added, flashAdded] = useFlash();
  const handleAdd = () => {
    const chords = identifyChord(activeDots, tuning.notes, capo);
    if (chords.length === 0) return;
    onAddToProgression({ id: `chord-${Date.now()}`, chord: chords[0], fretPositions: [...activeDots] });
    setActiveDots([]);
    flashAdded();
  };

  const chords = useMemo(() => identifyChord(activeDots, tuning.notes, capo), [activeDots, tuning, capo]);
  const voicings = showVariations && chords.length > 0
    ? findChordVoicings(chords[0].name, 6, tuning.notes)
    : [];

  const { lang } = useLang();
  const he = lang === 'he';
  const name = chords[0]?.name ?? null;
  const rootPc = name ? Note.chroma(Chord.get(name).tonic ?? '') : null;
  const labels = name ? degreeLabels(activeDots, name, tuning.notes, capo) : null;
  const labelFor = (p: FretPosition) => {
    const i = activeDots.findIndex(d => d.string === p.string && d.fret === p.fret);
    return labels && i >= 0 ? labels[i] : undefined;
  };
  const isRoot = (p: FretPosition) => rootPc != null && Note.chroma(fretToNote(p.string, p.fret, tuning.notes, capo)) === rootPc;
  // STRUM — the one cobalt action: plays the placed notes.
  const strum = () => { if (activeDots.length) unlockAudio().then(() => playChord(activeDots, tuning.openFreqs, capo)); };

  const poster = <ChordName positions={activeDots} tuning={tuning.notes} capo={capo} max={desktop ? 210 : 150} />;

  const neck = (
    <Rule label={he ? 'הקישו על שריג כדי להניח תו · שוב כדי להסיר' : 'Tap a fret to place a note · again to remove'}>
      <InteractiveFretboard activeDots={activeDots} onToggle={handleToggle} tuning={tuning.notes} capo={capo}
        labelFor={labelFor} isRoot={isRoot} />
    </Rule>
  );

  const formula = name ? <ChordStructure chordName={name} /> : null;

  const variations = showVariations ? (
    <VoicingVariations
      voicings={voicings}
      selectedIndex={selectedVariationIndex}
      chordName={chords[0]?.name}
      tuning={tuning.notes}
      gridColumns={desktop ? 4 : undefined}
      onSelect={(voicing, index) => {
        previewVoicing(voicing, tuning.openFreqs, capo);
        setActiveDots(voicing);
        setSelectedVariationIndex(index);
      }}
    />
  ) : null;

  // ── The dock: tuning, capo, then STRUM / Add / Clear and the extras ──
  const controls = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
      <Rule label={he ? 'כיוון וקאפו' : 'Tuning & capo'}>
        <div style={{ display: 'flex', gap: 10 }}>
          <PillSelect label={he ? 'כיוון' : 'Tuning'} value={tuning.name}
            onChange={v => { const t = TUNINGS.find(x => x.name === v); if (t) onTuningChange(t); }}>
            {TUNINGS.map(t => <option key={t.name} value={t.name}>{t.label}</option>)}
          </PillSelect>
          <PillSelect label={he ? 'קאפו' : 'Capo'} value={capo} onChange={v => onCapoChange(Number(v))}>
            {Array.from({ length: 12 }, (_, n) => (
              <option key={n} value={n}>{n === 0 ? (he ? 'ללא' : 'None') : `${he ? 'שריג' : 'Fret'} ${n}`}</option>
            ))}
          </PillSelect>
        </div>
      </Rule>

      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <Cta round={92} onClick={strum} disabled={activeDots.length === 0} label={he ? 'פריטה' : 'Strum'}>
          {he ? 'פריטה' : 'STRUM'}
        </Cta>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={handleAdd} disabled={chords.length === 0} className="gc-no-bar"
            style={{ ...btn.primary(chords.length === 0), width: '100%', whiteSpace: 'nowrap' }}>
            <RollLabel>{added ? (he ? '✓ נוסף' : '✓ Added') : (he ? '+ למהלך' : '+ Add to song')}</RollLabel>
          </button>
          <Pill onClick={() => setActiveDots([])} disabled={activeDots.length === 0} style={{ width: '100%' }}>
            {he ? 'ניקוי' : 'Clear'}
          </Pill>
        </div>
      </div>

      {chords.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Pill size="sm" active={showVariations}
            onClick={() => { setShowVariations(v => !v); setSelectedVariationIndex(undefined); }}>
            {showVariations ? (he ? 'הסתר וריאציות' : 'Hide variations') : (he ? 'עוד וריאציות' : 'More variations')}
          </Pill>
          <SaveToLibraryButton
            size="sm"
            style={{ ...pillStyle(false, 'sm') }}
            label={he ? 'שמירה לספרייה' : 'Save voicing to Library'}
            getPayload={() => ({
              kind: 'progression',
              name: chords[0].name,
              chords: [{ id: `chord-${Date.now()}`, chord: chords[0], fretPositions: [...activeDots] }],
            })}
          />
        </div>
      )}
    </div>
  );

  const progressionPanel = (
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
  );

  if (desktop) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {poster}
        <div style={{ display: 'grid', gridTemplateColumns: '340px minmax(0, 1fr)', gap: 40, alignItems: 'start' }}>
          <div style={{ position: 'sticky', top: 0 }}>{controls}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24, minWidth: 0 }}>
            {neck}
            {formula}
            {variations}
          </div>
        </div>
        {progressionPanel}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {poster}
      {neck}
      {formula}
      {controls}
      {variations}
      {progressionPanel}
    </div>
  );
}
