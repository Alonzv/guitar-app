import React, { useState } from 'react';
import { ChordBuilderTab } from './ChordBuilder/ChordBuilderTab';
import { ChordPickerTab } from './ChordPicker/ChordPickerTab';
import type { ChordInProgression } from '../types/music';
import { T } from '../theme';

type Sub = 'builder' | 'finder';

interface Props {
  progression: ChordInProgression[];
  onAddToProgression: (item: ChordInProgression) => void;
  onRemoveFromProgression: (id: string) => void;
  onClearProgression: () => void;
}

export const ChordsTab: React.FC<Props> = ({ progression, onAddToProgression, onRemoveFromProgression, onClearProgression }) => {
  const [sub, setSub] = useState<Sub>('builder');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: `1px solid ${T.border}` }}>
        {(['builder', 'finder'] as Sub[]).map(id => (
          <button key={id} onClick={() => setSub(id)} style={{
            flex: 1, padding: '11px 0', border: 'none', cursor: 'pointer',
            fontWeight: 700, fontSize: 13,
            background: sub === id ? T.primary : T.bgInput,
            color: sub === id ? T.white : T.textMuted,
            transition: 'background 0.15s',
          }}>
            {id === 'builder' ? '🎸  Chord Builder' : '🎹  Chord Finder'}
          </button>
        ))}
      </div>
      {sub === 'builder'
        ? <ChordBuilderTab progression={progression} onAddToProgression={onAddToProgression} onRemoveFromProgression={onRemoveFromProgression} onClearProgression={onClearProgression} />
        : <ChordPickerTab onAddToProgression={onAddToProgression} />
      }
    </div>
  );
};
