import React, { useState } from 'react';
import { Metronome } from './Metronome';
import { Tuner } from './Tuner';
import type { Tuning } from '../../types/music';
import { TUNINGS } from '../../utils/musicTheory';
import { T } from '../../theme';

type Sub = 'tuner' | 'metronome';

interface Props {
  tuning: Tuning;
  onTuningChange: (t: Tuning) => void;
}

export const ToolsTab: React.FC<Props> = ({ tuning, onTuningChange }) => {
  const [sub, setSub] = useState<Sub>('tuner');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: `1px solid ${T.border}` }}>
        {(['tuner', 'metronome'] as Sub[]).map(id => (
          <button key={id} onClick={() => setSub(id)} style={{
            flex: 1, padding: '11px 0', border: 'none', cursor: 'pointer',
            fontWeight: 700, fontSize: 13,
            background: sub === id ? T.secondary : T.bgInput,
            color: sub === id ? T.white : T.textMuted,
            transition: 'background 0.15s',
          }}>
            {id === 'tuner' ? '🎤  Tuner' : '🥁  Metronome'}
          </button>
        ))}
      </div>

      {/* Tuning selector (shown on both tabs — affects Tuner target notes) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, color: T.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Tuning:</span>
        {TUNINGS.map(t => (
          <button key={t.name} onClick={() => onTuningChange(t)} style={{
            padding: '4px 10px', borderRadius: 12,
            border: `1px solid ${tuning.name === t.name ? T.primary : T.border}`,
            background: tuning.name === t.name ? T.primaryBg : T.bgInput,
            color: tuning.name === t.name ? T.primary : T.textMuted,
            fontSize: 11, fontWeight: tuning.name === t.name ? 700 : 400, cursor: 'pointer',
          }}>{t.label}</button>
        ))}
      </div>

      {sub === 'tuner' ? <Tuner tuning={tuning} /> : <Metronome />}
    </div>
  );
};
