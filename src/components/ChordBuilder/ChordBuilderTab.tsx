import { useState, useMemo } from 'react';
import type { ChordInProgression, FretPosition, Tuning } from '../../types/music';
import { InteractiveFretboard } from '../Fretboard/InteractiveFretboard';
import { ChordStructure } from './ChordStructure';
import { ChordStage, BigShape, PlayButton, SoftButton, TextBtn, ShapeStrip, GlassSelect, SongStrip, icon } from './Stage';
import { StopActions } from '../Transit/StopActions';
import { identifyChord, formatChordName } from '../../utils/chordIdentifier';
import { findChordVoicings } from '../../utils/chordVoicings';
import { SaveToLibraryButton } from '../Workspace/SaveToLibraryButton';
import { T } from '../../theme';
import { Chord, Note } from '@tonaljs/tonal';
import { fretToNote, TUNINGS } from '../../utils/musicTheory';
import { useLang } from '../../contexts/LanguageContext';
import { playChord, unlockAudio } from '../../utils/audioPlayback';
import { degreeLabels } from './chordFormula';
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
  /** Opens another stop (the song strip opens Progression). */
  onGo?: (stopId: string) => void;
}

export function ChordBuilderTab({
  progression, onAddToProgression,
  tuning, onTuningChange, capo, onCapoChange,
  desktop, onGo,
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
  // Play: the placed notes, low to high.
  const strum = () => { if (activeDots.length) unlockAudio().then(() => playChord(activeDots, tuning.openFreqs, capo)); };

  const alts = chords.slice(1, 4).map(c => formatChordName(c.name));
  const line = activeDots.length < 2
    ? (he ? 'הקישו על הצוואר כדי להניח תווים, שוב כדי להסיר' : 'Tap the neck to place notes, again to remove')
    : !name
      ? (he ? 'עוד לא אקורד. נסו להוסיף תו' : 'Not a chord yet. Try another note')
      : <>
          <span dir="ltr" className="gc-notation">{chords[0].notes.join(' · ')}</span>
          {capo > 0 && <> · {he ? `קאפו ${capo}` : `Capo ${capo}`}</>}
          {alts.length > 0 && <> · {he ? 'גם ' : 'also '}<span dir="ltr" className="gc-notation">{alts.join(', ')}</span></>}
        </>;

  const toolbar = (
    <StopActions>
      <GlassSelect label={he ? 'כיוון' : 'Tuning'} text={tuning.label ?? tuning.name} value={tuning.name}
        onChange={v => { const t = TUNINGS.find(x => x.name === v); if (t) onTuningChange(t); }}>
        {TUNINGS.map(t => <option key={t.name} value={t.name}>{t.label ?? t.name}</option>)}
      </GlassSelect>
      <GlassSelect label={he ? 'קאפו' : 'Capo'} text={capo ? (he ? `קאפו ${capo}` : `Capo ${capo}`) : (he ? 'בלי קאפו' : 'No capo')} value={capo} onChange={v => onCapoChange(Number(v))}>
        {Array.from({ length: 12 }, (_, n) => (
          <option key={n} value={n}>{n === 0 ? (he ? 'בלי קאפו' : 'No capo') : `${he ? 'שריג' : 'Fret'} ${n}`}</option>
        ))}
      </GlassSelect>
    </StopActions>
  );

  const stage = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22, minWidth: 0 }}>
      <ChordStage desktop={desktop} name={name} empty={he ? 'איזה אקורד זה?' : 'Which chord is this?'} line={line} />
      <BigShape voicing={activeDots} name={name} tuning={tuning.notes}>
        <InteractiveFretboard activeDots={activeDots} onToggle={handleToggle} tuning={tuning.notes} capo={capo}
          labelFor={labelFor} isRoot={isRoot} />
      </BigShape>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
        <PlayButton onPlay={strum} disabled={activeDots.length === 0} label={he ? 'נגנו' : 'Play'} />
        <SoftButton onClick={handleAdd} disabled={chords.length === 0}>
          {added ? icon(<path d="m5 12 5 5 9-10" />, 17) : icon(<path d="M12 5v14M5 12h14" />, 17)}
          {added ? (he ? 'נוסף לשיר' : 'Added') : (he ? 'הוספה לשיר' : 'Add to song')}
        </SoftButton>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 4, flexWrap: 'wrap' }}>
        <TextBtn onClick={() => { setActiveDots([]); setShowVariations(false); }} disabled={activeDots.length === 0}>{he ? 'ניקוי' : 'Clear'}</TextBtn>
        <TextBtn onClick={() => { setShowVariations(v => !v); setSelectedVariationIndex(undefined); }} disabled={!name} pressed={showVariations}>
          {showVariations ? (he ? 'הסתרת צורות' : 'Hide shapes') : (he ? 'עוד צורות' : 'More shapes')}
        </TextBtn>
        {name && (
          <SaveToLibraryButton size="sm" label={he ? 'שמירה לספרייה' : 'Save to Library'}
            style={{ height: 40, padding: '0 14px', borderRadius: 20, fontSize: 15, fontWeight: 500, color: T.tintLabel, background: 'transparent', border: 'none' }}
            getPayload={() => ({
              kind: 'progression', name: chords[0].name,
              chords: [{ id: `chord-${Date.now()}`, chord: chords[0], fretPositions: [...activeDots] }],
            })} />
        )}
      </div>
      {showVariations && name && voicings.length > 0 && (
        <ShapeStrip voicings={voicings} selected={selectedVariationIndex ?? -1} chordName={name} tuning={tuning.notes}
          onSelect={(v, i) => { previewVoicing(v, tuning.openFreqs, capo); setActiveDots(v); setSelectedVariationIndex(i); }} />
      )}
    </div>
  );

  const side = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22, minWidth: 0 }}>
      {name && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: T.textMuted }}>{he ? 'ממה הוא בנוי' : 'What it is made of'}</span>
          <ChordStructure chordName={name} />
        </div>
      )}
      {onGo && <SongStrip progression={progression} onOpen={() => onGo('progression')} />}
    </div>
  );

  if (desktop) {
    return (
      <div className="su-in" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 400px)', gap: 48, alignItems: 'start' }}>
        {toolbar}
        {stage}
        {side}
      </div>
    );
  }

  return (
    <div className="su-in" style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {toolbar}
      {stage}
      {side}
    </div>
  );
}
