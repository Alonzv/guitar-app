import React, { useState } from 'react';
import { Tuner } from './Tuner';
import { Metronome } from './Metronome';
import { AudioToTab } from './AudioToTab';
import { TabBuilder } from './TabBuilder';
import { T } from '../../theme';

type Sub = 'tuner' | 'metronome' | 'audiotab' | 'tabbuilder';

const SUB_LABELS: Record<Sub, string> = {
  tuner:      'Tuner',
  metronome:  'Metronome',
  audiotab:   'Audio→Tab',
  tabbuilder: 'Tab Builder',
};

export const ToolsTab: React.FC = () => {
  const [sub, setSub] = useState<Sub>('tuner');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      <div style={{ display: 'flex', gap: 4 }}>
        {(['tuner', 'metronome', 'audiotab', 'tabbuilder'] as Sub[]).map(id => (
          <button key={id} onClick={() => setSub(id)} className="gc-sub-tab" style={{
            flex: 1, padding: '11px 6px', borderRadius: 8,
            border: `1px solid ${sub === id ? T.secondary : T.border}`,
            cursor: 'pointer', fontWeight: 500, fontSize: 13,
            background: sub === id ? T.secondary : T.bgInput,
            color: sub === id ? '#fff' : T.textMuted,
            transition: 'background 0.15s, border-color 0.15s',
          }}>
            {SUB_LABELS[id]}
          </button>
        ))}
      </div>

      {sub === 'tuner'      && <Tuner />}
      {sub === 'metronome'  && <Metronome />}
      {sub === 'audiotab'   && <AudioToTab />}
      {sub === 'tabbuilder' && <TabBuilder />}
    </div>
  );
};
