import React, { useState } from 'react';
import { ScaleDetector } from './ScaleDetector';
import { ScaleVisualizer } from './ScaleVisualizer';
import { ScaleExplorer } from './ScaleExplorer';
import { HarmonyBuilder } from './HarmonyBuilder';
import type { ChordInProgression, ScaleMatch } from '../../types/music';
import { T } from '../../theme';

type Sub = 'detect' | 'explore';

interface Props {
  progression: ChordInProgression[];
  selectedScale: ScaleMatch | null;
  onSelectScale: (scale: ScaleMatch) => void;
  preferredKey?: string;
}

export const ScalesTab: React.FC<Props> = ({ progression, selectedScale, onSelectScale, preferredKey }) => {
  const [sub, setSub] = useState<Sub>('detect');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: `1px solid ${T.border}` }}>
        {(['detect', 'explore'] as Sub[]).map(id => (
          <button key={id} onClick={() => setSub(id)} style={{
            flex: 1, padding: '11px 0', border: 'none', cursor: 'pointer',
            fontWeight: 700, fontSize: 13,
            background: sub === id ? T.secondary : T.bgInput,
            color: sub === id ? T.white : T.textMuted,
            transition: 'background 0.15s',
          }}>
            {id === 'detect' ? '🔍  Detect' : '🎼  Browse'}
          </button>
        ))}
      </div>
      {sub === 'detect' ? (
        <>
          <ScaleDetector progression={progression} onSelectScale={onSelectScale} preferredKey={preferredKey} />
          {selectedScale && <ScaleVisualizer scale={selectedScale} />}
        </>
      ) : (
        <ScaleExplorer />
      )}

      <HarmonyBuilder selectedScale={selectedScale} />
    </div>
  );
};
