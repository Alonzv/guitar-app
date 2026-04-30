import { useState } from 'react';
import { ScalesTab } from './ScalePanel/ScalesTab';
import { TriadsGenerator } from './Triads/TriadsGenerator';
import { IntervalsTab } from './Intervals/IntervalsTab';
import { WheelTab } from './Tools/WheelTab';
import type { ChordInProgression, Tuning } from '../types/music';
import { T } from '../theme';

type Sub = 'scales' | 'triads' | 'intervals' | 'wheel';

const SUBS: { id: Sub; label: string; icon: string }[] = [
  { id: 'scales',    label: 'Scales',    icon: '🎼' },
  { id: 'triads',    label: 'Triads',    icon: '🔺' },
  { id: 'intervals', label: 'Intervals', icon: '🎵' },
  { id: 'wheel',     label: 'Wheel',     icon: '⭕' },
];

interface Props {
  tuning: Tuning;
  onAddToProgression: (item: ChordInProgression) => void;
}

export function TheoryTab({ tuning, onAddToProgression }: Props) {
  const [sub, setSub] = useState<Sub>('scales');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Sub-tab bar */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        borderRadius: 10,
        overflow: 'hidden',
        border: `1px solid ${T.border}`,
      }}>
        {SUBS.map(s => {
          const active = sub === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setSub(s.id)}
              style={{
                padding: '9px 4px',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: 11,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
                background: active ? T.secondary : T.bgInput,
                color: active ? '#fff' : T.textMuted,
                transition: 'background 0.15s',
                borderRight: `1px solid ${T.border}`,
              }}
            >
              <span style={{ fontSize: 15 }}>{s.icon}</span>
              <span>{s.label}</span>
            </button>
          );
        })}
      </div>

      {sub === 'scales'    && <ScalesTab />}
      {sub === 'triads'    && <TriadsGenerator />}
      {sub === 'intervals' && <IntervalsTab />}
      {sub === 'wheel'     && <WheelTab tuning={tuning} onAddToProgression={onAddToProgression} />}
    </div>
  );
}
