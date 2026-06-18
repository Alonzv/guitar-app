import React, { useState } from 'react';
import { ChordBuilderTab } from './ChordBuilder/ChordBuilderTab';
import { ChordPickerTab } from './ChordPicker/ChordPickerTab';
import { ChordAnalyzerTab } from './ChordBuilder/ChordAnalyzerTab';
import { TargetNoteTab } from './Chords/TargetNoteTab';
import type { ChordInProgression, Tuning } from '../types/music';
import { T } from '../theme';

type Sub = 'builder' | 'finder' | 'analyzer' | 'target';

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

const SUB_LABELS: Record<Sub, string> = {
  builder:  'By Ear',
  finder:   'By Name',
  analyzer: 'Analyze',
  target:   'Target Note',
};

export const ChordsTab: React.FC<Props> = ({
  progression, onAddToProgression, onRemoveFromProgression, onClearProgression,
  onReorderProgression, onTransposeProgression,
  tuning, onTuningChange, capo, onCapoChange,
  canUndo, canRedo, onUndo, onRedo,
}) => {
  const [sub, setSub] = useState<Sub>('builder');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Sub-tab bar */}
      <div style={{ display: 'flex', gap: 0 }}>
        {(['builder', 'finder', 'analyzer', 'target'] as Sub[]).map(id => (
          <button key={id} onClick={() => setSub(id)} className="gc-sub-tab" style={{
            flex: 1, padding: '11px 4px', borderRadius: 0,
            cursor: 'pointer', fontSize: id === 'target' ? 11 : 13,
            background: sub === id ? T.secondary : T.bgInput,
            color: sub === id ? T.white : T.textMuted,
            borderRight: '3px solid var(--gc-bar-color)',
            transition: 'background 0.1s',
          }}>
            <span><span style={{ fontWeight: 700, opacity: 0.4, letterSpacing: 0 }}>_</span><span style={{ fontWeight: 700 }}>{SUB_LABELS[id]}</span></span>
          </button>
        ))}
      </div>

      {sub === 'builder' && (
        <ChordBuilderTab
          progression={progression}
          onAddToProgression={onAddToProgression}
          onRemoveFromProgression={onRemoveFromProgression}
          onClearProgression={onClearProgression}
          onReorderProgression={onReorderProgression}
          onTransposeProgression={onTransposeProgression}
          tuning={tuning}
          onTuningChange={onTuningChange}
          capo={capo}
          onCapoChange={onCapoChange}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={onUndo}
          onRedo={onRedo}
        />
      )}
      {sub === 'finder' && (
        <ChordPickerTab
          onAddToProgression={onAddToProgression}
          progression={progression}
          onRemoveFromProgression={onRemoveFromProgression}
          onClearProgression={onClearProgression}
          onReorderProgression={onReorderProgression}
          onTransposeProgression={onTransposeProgression}
          canUndo={canUndo} canRedo={canRedo} onUndo={onUndo} onRedo={onRedo}
          tuning={tuning} capo={capo}
        />
      )}
      {sub === 'analyzer' && (
        <ChordAnalyzerTab progression={progression} />
      )}
      {sub === 'target' && (
        <TargetNoteTab tuning={tuning} capo={capo} />
      )}
    </div>
  );
};
