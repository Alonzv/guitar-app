import React, { useState, useRef } from 'react';
import { DiatonicWheel } from '../ScalePanel/DiatonicWheel';
import { CircleOfFifths } from '../ScalePanel/CircleOfFifths';
import type { ChordInProgression, Tuning } from '../../types/music';
import { T } from '../../theme';

type WheelView = 'cof' | 'diatonic';

interface Props {
  tuning: Tuning;
  onAddToProgression: (item: ChordInProgression) => void;
}

export const WheelTab: React.FC<Props> = ({ tuning, onAddToProgression }) => {
  const [wheelView, setWheelView] = useState<WheelView>('cof');
  const topRef = useRef<HTMLDivElement>(null);

  const switchView = (next: WheelView) => {
    if (next === wheelView) return;
    setWheelView(next);
    requestAnimationFrame(() => {
      topRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  };

  const touchStartX = useRef(0);
  const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const handleTouchEnd   = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) < 50) return;
    switchView(dx > 0 ? 'cof' : 'diatonic');
  };

  const navBtnStyle = (active: boolean): React.CSSProperties => ({
    width: 34, height: 34, borderRadius: 8,
    border: `1px solid ${T.border}`,
    background: active ? T.bgDeep : T.bgInput,
    color: active ? T.textDim : T.text,
    fontSize: 16,
    cursor: active ? 'default' : 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  });

  return (
    <div
      ref={topRef}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
    >
      {/* ── View switcher ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: T.bgCard, borderRadius: 12, padding: '8px 12px',
        border: `1px solid ${T.border}`,
      }}>
        <button onClick={() => switchView('cof')} disabled={wheelView === 'cof'} style={navBtnStyle(wheelView === 'cof')}>◀</button>

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

        <button onClick={() => switchView('diatonic')} disabled={wheelView === 'diatonic'} style={navBtnStyle(wheelView === 'diatonic')}>▶</button>
      </div>

      {wheelView === 'cof'      && <CircleOfFifths  onAddToProgression={onAddToProgression} />}
      {wheelView === 'diatonic' && <DiatonicWheel   onAddToProgression={onAddToProgression} tuning={tuning} />}
    </div>
  );
};
