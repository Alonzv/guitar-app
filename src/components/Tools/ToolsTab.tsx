import React, { useState } from 'react';
import { Metronome } from './Metronome';
import { Tuner } from './Tuner';
import { DiatonicWheel } from '../ScalePanel/DiatonicWheel';
import type { ChordInProgression, Tuning } from '../../types/music';
import { TUNINGS } from '../../utils/musicTheory';
import { T } from '../../theme';

type Sub = 'tuner' | 'metronome' | 'wheel';

const SUB_LABELS: Record<Sub, string> = {
  tuner:      '🎤 Tuner',
  metronome:  '🥁 Metronome',
  wheel:      '⭕ Wheel',
};

interface Props {
  tuning: Tuning;
  onTuningChange: (t: Tuning) => void;
  onAddToProgression: (item: ChordInProgression) => void;
}

export const ToolsTab: React.FC<Props> = ({ tuning, onTuningChange, onAddToProgression }) => {
  const [sub, setSub] = useState<Sub>('tuner');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: `1px solid ${T.border}` }}>
        {(['tuner', 'metronome', 'wheel'] as Sub[]).map(id => (
          <button key={id} onClick={() => setSub(id)} className="gc-sub-tab" style={{
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

      {/* Tuning selector — shown only for tuner/metronome */}
      {sub !== 'wheel' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, color: T.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>Tuning</span>
          <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
            <select
              value={tuning.name}
              onChange={e => {
                const t = TUNINGS.find(t => t.name === e.target.value);
                if (t) onTuningChange(t);
              }}
              style={{
                appearance: 'none',
                WebkitAppearance: 'none',
                background: T.bgInput,
                border: `1px solid ${T.border}`,
                borderRadius: 8,
                color: T.text,
                fontFamily: 'inherit',
                fontSize: 12,
                fontWeight: 600,
                padding: '5px 26px 5px 10px',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              {TUNINGS.map(t => <option key={t.name} value={t.name}>{t.label}</option>)}
            </select>
            <span style={{ position: 'absolute', right: 8, pointerEvents: 'none', fontSize: 9, color: T.textMuted }}>▾</span>
          </div>
        </div>
      )}

      {sub === 'tuner'     && <Tuner tuning={tuning} />}
      {sub === 'metronome' && <Metronome />}
      {sub === 'wheel'     && <DiatonicWheel onAddToProgression={onAddToProgression} tuning={tuning} />}
    </div>
  );
};
