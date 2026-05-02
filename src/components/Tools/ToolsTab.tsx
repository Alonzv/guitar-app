import React, { useState } from 'react';
import { Tuner } from './Tuner';
import { Metronome } from './Metronome';
import { T } from '../../theme';

type Sub = 'tuner' | 'metronome';

const SUB_LABELS: Record<Sub, string> = {
  tuner:     'Tuner',
  metronome: 'Metronome',
};

export const ToolsTab: React.FC = () => {
  const [sub, setSub] = useState<Sub>('tuner');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: `1px solid ${T.border}` }}>
        {(['tuner', 'metronome'] as Sub[]).map(id => (
          <button key={id} onClick={() => setSub(id)} className="gc-sub-tab" style={{
            flex: 1, padding: '11px 0', border: 'none', cursor: 'pointer',
            fontWeight: 700, fontSize: 12,
            background: sub === id ? T.secondary : T.bgInput,
            color: sub === id ? '#fff' : T.textMuted,
            transition: 'background 0.15s',
          }}>
            {SUB_LABELS[id]}
          </button>
        ))}
      </div>

      {sub === 'tuner'     && <Tuner />}
      {sub === 'metronome' && <Metronome />}
    </div>
  );
};
