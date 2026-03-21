import React, { useState, useRef } from 'react';
import { Metronome } from './Metronome';
import { Tuner } from './Tuner';
import { DiatonicWheel } from '../ScalePanel/DiatonicWheel';
import { CircleOfFifths } from '../ScalePanel/CircleOfFifths';
import { AIProgressionTab } from '../AI/AIProgressionTab';
import type { ChordInProgression, Tuning } from '../../types/music';
import { TUNINGS } from '../../utils/musicTheory';
import { T } from '../../theme';

type Sub       = 'tuner' | 'metronome' | 'wheel' | 'muse';
type WheelView = 'cof' | 'diatonic';

const SUB_LABELS: Record<Sub, string> = {
  tuner:     '🎤 Tuner',
  metronome: '🥁 Metronome',
  wheel:     '⭕ Wheel',
  muse:      '🔮 Muse',
};

interface Props {
  tuning: Tuning;
  onTuningChange: (t: Tuning) => void;
  onAddToProgression: (item: ChordInProgression) => void;
  onLoadProgression: (chords: ChordInProgression[]) => void;
}

export const ToolsTab: React.FC<Props> = ({ tuning, onTuningChange, onAddToProgression, onLoadProgression }) => {
  const [sub,       setSub]       = useState<Sub>('tuner');
  const [wheelView, setWheelView] = useState<WheelView>('cof');   // COF is the default first view

  // Ref to the top of the wheel section — used to prevent page jump on view switch
  const wheelTopRef = useRef<HTMLDivElement>(null);

  // ── View switch (shared logic) ───────────────────────────────────────────────
  const switchView = (next: WheelView) => {
    if (next === wheelView) return;
    setWheelView(next);
    // After the DOM updates, scroll the wheel section's top back into view so the
    // page doesn't visually jump when content height changes.
    requestAnimationFrame(() => {
      wheelTopRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  };

  // ── Swipe detection ──────────────────────────────────────────────────────────
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

      {/* Sub-tab buttons */}
      <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: `1px solid ${T.border}` }}>
        {(['tuner', 'metronome', 'wheel', 'muse'] as Sub[]).map(id => (
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

      {/* Tuning selector */}
      {sub !== 'wheel' && sub !== 'muse' && (
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
                appearance: 'none', WebkitAppearance: 'none',
                background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 8,
                color: T.text, fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
                padding: '5px 26px 5px 10px', cursor: 'pointer', outline: 'none',
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
      {sub === 'muse'      && (
        <AIProgressionTab
          tuning={tuning}
          onLoadProgression={onLoadProgression}
        />
      )}

      {sub === 'wheel' && (
        <div
          ref={wheelTopRef}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
        >

          {/* ── Navigation bar ── */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: T.bgCard, borderRadius: 12, padding: '8px 12px',
            border: `1px solid ${T.border}`,
          }}>
            {/* ◀ — go to COF (first/left) */}
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

            {/* ▶ — go to Diatonic Wheel (second/right) */}
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

          {/* ── Circle of Fifths (first / default view) ── */}
          {wheelView === 'cof' && (
            <CircleOfFifths onAddToProgression={onAddToProgression} />
          )}

          {/* ── Diatonic Wheel (second view) ── */}
          {wheelView === 'diatonic' && (
            <DiatonicWheel
              onAddToProgression={onAddToProgression}
              tuning={tuning}
            />
          )}

        </div>
      )}

    </div>
  );
};
