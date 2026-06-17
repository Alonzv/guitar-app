import React, { useState } from 'react';
import { ChordsTab } from './ChordsTab';
import { ScalesTab } from './ScalePanel/ScalesTab';
import { TriadsGenerator } from './Triads/TriadsGenerator';
import { IntervalsTab } from './Intervals/IntervalsTab';
import { WheelTab } from './Tools/WheelTab';
import { IconChord, IconSteps, IconTriangle, IconInterval, IconWheel } from './Icons';
import type { ChordInProgression, Tuning } from '../types/music';
import { T } from '../theme';

type Sub = 'chords' | 'scales' | 'triads' | 'intervals' | 'wheel';

const SUBS: { id: Sub; label: string; icon: React.ReactNode }[] = [
  { id: 'chords',    label: 'Chords',    icon: <IconChord size={14} />    },
  { id: 'scales',    label: 'Scales',    icon: <IconSteps size={14} />    },
  { id: 'triads',    label: 'Triads',    icon: <IconTriangle size={14} /> },
  { id: 'intervals', label: 'Intervals', icon: <IconInterval size={14} /> },
  { id: 'wheel',     label: 'Wheel',     icon: <IconWheel size={14} />    },
];

interface Props {
  tuning: Tuning;
  onTuningChange: (tuning: Tuning) => void;
  capo: number;
  onCapoChange: (capo: number) => void;
  progression: ChordInProgression[];
  onAddToProgression: (item: ChordInProgression) => void;
  onRemoveFromProgression: (id: string) => void;
  onClearProgression: () => void;
  onReorderProgression: (id: string, dir: -1 | 1) => void;
  onTransposeProgression: (semitones: number) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

export function TheoryTab({
  tuning, onTuningChange, capo, onCapoChange,
  progression, onAddToProgression, onRemoveFromProgression, onClearProgression,
  onReorderProgression, onTransposeProgression,
  canUndo, canRedo, onUndo, onRedo,
}: Props) {
  const [sub, setSub] = useState<Sub>('chords');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Sub-tab bar */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
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
                padding: '8px 2px',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 500,
                fontSize: 12,
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
              <span style={{ height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{s.icon}</span>
              <span style={{ lineHeight: 1 }}>{s.label}</span>
            </button>
          );
        })}
      </div>

      {sub === 'chords' && (
        <ChordsTab
          progression={progression}
          onAddToProgression={onAddToProgression}
          onRemoveFromProgression={onRemoveFromProgression}
          onClearProgression={onClearProgression}
          onReorderProgression={onReorderProgression}
          onTransposeProgression={onTransposeProgression}
          tuning={tuning}
          onTuningChange={onTuningChange}
          capo={capo}
          onCapoChange={onCapoChange}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={onUndo}
          onRedo={onRedo}
        />
      )}
      {sub === 'scales'    && <ScalesTab />}
      {sub === 'triads'    && <TriadsGenerator />}
      {sub === 'intervals' && <IntervalsTab />}
      {sub === 'wheel'     && <WheelTab tuning={tuning} onAddToProgression={onAddToProgression} />}
    </div>
  );
}
