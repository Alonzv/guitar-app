import React, { useState, useRef } from 'react';
import { Metronome } from './Metronome';
import { DiatonicWheel } from '../ScalePanel/DiatonicWheel';
import { CircleOfFifths } from '../ScalePanel/CircleOfFifths';
import type { ChordInProgression, Tuning } from '../../types/music';
import { T } from '../../theme';

type Sub       = 'metronome' | 'wheel';
type WheelView = 'cof' | 'diatonic';

const SUB_LABELS: Record<Sub, string> = {
  metronome: '🥁 Metronome',
  wheel:     '⭕ Wheel',
};

interface Props {
  tuning: Tuning;
  onAddToProgression: (item: ChordInProgression) => void;
}

export const ToolsTab: React.FC<Props> = ({ tuning, onAddToProgression }) => {
  const [sub,       setSub]       = useState<Sub>('metronome');
  const [wheelView, setWheelView] = useState<WheelView>('cof');

  const wheelTopRef = useRef<HTMLDivElement>(null);

  const switchView = (next: WheelView) => {
    if (next === wheelView) return;
    setWheelView(next);
    requestAnimationFrame(() => {
      wheelTopRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  };

  const touchStartX = useRef(0);
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) < 50) return;
    switchView(dx > 0 ? 'cof' : 'diatonic');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: `1px solid ${T.border}` }}>
        {(['metronome', 'wheel'] as Sub[]).map(id => (
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

      {sub === 'metronome' && <Metronome />}

      {sub === 'wheel' && (
        <div
          ref={wheelTopRef}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
        >
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: T.bgCard, borderRadius: 12, padding: '8px 12px',
            border: `1px solid ${T.border}`,
          }}>
            <button
              onClick={() => switchView('cof')}
              disabled={wheelView === 'cof'}
              style={{
                width: 34, height: 34, borderRadius: 8, border: `1px solid ${T.border}`,
                background: wheelView !== 'cof' ? T.bgInput : T.bgDeep,
                color:      wheelView !== 'cof' ? T.text   : T.textDim,
                fontSize: 16,
                cursor: wheelView !== 'cof' ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >◀</button>

            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>
                {wheelView === 'cof' ? '🎡 Circle of Fifths' : '⭕ Diatonic Wheel'}
              </div>
              <div style={{ display: 'flex', gap: 5, justifyContent: 'center', marginTop: 4 }}>
                {(['cof', 'diatonic'] as WheelView[]).map(v => (
                  <div key={v} style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: wheelView === v ? T.secondary : T.border,
                    transition: 'background 0.2s',
                  }} />
                ))}
              </div>
            </div>

            <button
              onClick={() => switchView('diatonic')}
              disabled={wheelView === 'diatonic'}
              style={{
                width: 34, height: 34, borderRadius: 8, border: `1px solid ${T.border}`,
                background: wheelView !== 'diatonic' ? T.bgInput : T.bgDeep,
                color:      wheelView !== 'diatonic' ? T.text   : T.textDim,
                fontSize: 16,
                cursor: wheelView !== 'diatonic' ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >▶</button>
          </div>

          {wheelView === 'cof' && (
            <CircleOfFifths onAddToProgression={onAddToProgression} />
          )}
          {wheelView === 'diatonic' && (
            <DiatonicWheel onAddToProgression={onAddToProgression} tuning={tuning} />
          )}
        </div>
      )}

    </div>
  );
};
