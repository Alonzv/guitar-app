import React, { useState } from 'react';
import { ChordBuilderTab } from './ChordBuilder/ChordBuilderTab';
import { ChordPickerTab } from './ChordPicker/ChordPickerTab';
import { AudioChordDetector } from './ChordBuilder/AudioChordDetector';
import type { ChordInProgression } from '../types/music';
import { T } from '../theme';

type Sub = 'builder' | 'finder' | 'listen';

interface Props {
  progression: ChordInProgression[];
  onAddToProgression: (item: ChordInProgression) => void;
  onRemoveFromProgression: (id: string) => void;
  onClearProgression: () => void;
  onReorderProgression: (id: string, dir: -1 | 1) => void;
  onTransposeProgression: (semitones: number) => void;
  onSaveSong: (name: string) => void;
}

const SUB_LABELS: Record<Sub, string> = {
  builder: '🎸  By Ear',
  finder:  '🎹  By Name',
  listen:  '🎙  Detect',
};

export const ChordsTab: React.FC<Props> = ({
  progression, onAddToProgression, onRemoveFromProgression, onClearProgression,
  onReorderProgression, onTransposeProgression, onSaveSong,
}) => {
  const [sub, setSub] = useState<Sub>('builder');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Sub-tab bar */}
      <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: `1px solid ${T.border}` }}>
        {(['builder', 'finder', 'listen'] as Sub[]).map(id => (
          <button key={id} onClick={() => setSub(id)} style={{
            flex: 1, padding: '11px 0', border: 'none', cursor: 'pointer',
            fontWeight: 700, fontSize: 12,
            background: sub === id ? T.secondary : T.bgInput,
            color: sub === id ? T.white : T.textMuted,
            transition: 'background 0.15s',
          }}>
            {SUB_LABELS[id]}
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
          onSaveSong={onSaveSong}
        />
      )}
      {sub === 'finder' && (
        <ChordPickerTab onAddToProgression={onAddToProgression} />
      )}
      {sub === 'listen' && (
        <AudioChordDetector onAddToProgression={onAddToProgression} />
      )}
    </div>
  );
};
