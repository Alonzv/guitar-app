import React, { useState } from 'react';
import { Metronome } from './Metronome';
import { Tuner } from './Tuner';
import { T } from '../../theme';

type Sub = 'tuner' | 'metronome';

export const ToolsTab: React.FC = () => {
  const [sub, setSub] = useState<Sub>('tuner');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: `1px solid ${T.border}` }}>
        {(['tuner', 'metronome'] as Sub[]).map(id => (
          <button key={id} onClick={() => setSub(id)} style={{
            flex: 1, padding: '11px 0', border: 'none', cursor: 'pointer',
            fontWeight: 700, fontSize: 13,
            background: sub === id ? T.primary : T.bgInput,
            color: sub === id ? T.white : T.textMuted,
            transition: 'background 0.15s',
          }}>
            {id === 'tuner' ? '🎤  Tuner' : '🥁  Metronome'}
          </button>
        ))}
      </div>
      {sub === 'tuner' ? <Tuner /> : <Metronome />}
    </div>
  );
};
