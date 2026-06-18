import { useState } from 'react';
import { ChordsTab } from './ChordsTab';
import { ScalesTab } from './ScalePanel/ScalesTab';
import { TriadsGenerator } from './Triads/TriadsGenerator';
import { IntervalsTab } from './Intervals/IntervalsTab';
import { WheelTab } from './Tools/WheelTab';
import type { ChordInProgression, Tuning } from '../types/music';
import { T } from '../theme';

type Sub = 'chords' | 'scales' | 'triads' | 'intervals' | 'wheel';

const SUBS: { id: Sub; label: string }[] = [
  { id: 'chords',    label: 'Chords'    },
  { id: 'scales',    label: 'Scales'    },
  { id: 'triads',    label: 'Triads'    },
  { id: 'intervals', label: 'Intervals' },
  { id: 'wheel',     label: 'Wheel'     },
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
      <div style={{ display: 'flex', gap: 0 }}>
        {SUBS.map(s => {
          const active = sub === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setSub(s.id)}
              style={{
                flex: 1,
                padding: '9px 4px',
                borderRadius: 0,
                cursor: 'pointer',
                fontSize: 12,
                background: active ? T.secondary : T.bgInput,
                color: active ? '#fff' : T.textMuted,
                borderRight: '3px solid var(--gc-bar-color)',
                transition: 'background 0.1s',
              }}
            >
              <span><span style={{ fontWeight: 700, opacity: 0.4, letterSpacing: 0 }}>_</span><span style={{ fontWeight: 700 }}>{s.label}</span></span>
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
