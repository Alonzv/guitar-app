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

      <div style={{ display: 'flex', gap: 0 }}>
        {(['tuner', 'metronome', 'audiotab', 'tabbuilder'] as Sub[]).map(id => (
          <button key={id} onClick={() => setSub(id)} className="gc-sub-tab" style={{
            flex: 1, padding: '11px 4px', borderRadius: 0,
            cursor: 'pointer', fontSize: id === 'tabbuilder' ? 10 : 13,
            background: sub === id ? T.secondary : T.bgInput,
            color: sub === id ? '#fff' : T.textMuted,
            borderRight: '3px solid var(--gc-bar-color)',
            transition: 'background 0.1s',
          }}>
            <span><span style={{ fontWeight: 700, opacity: 0.4, letterSpacing: 0 }}>_</span><span style={{ fontWeight: 700 }}>{SUB_LABELS[id]}</span></span>
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
