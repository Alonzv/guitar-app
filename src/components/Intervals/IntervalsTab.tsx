import { useState } from 'react';
import { IntervalExplore } from './IntervalExplore';
import { IntervalCalculate } from './IntervalCalculate';
import { T } from '../../theme';

type Sub = 'explore' | 'calculate';

const SUB_LABELS: Record<Sub, string> = {
  explore:   'Explore',
  calculate: 'Calculate',
};

export function IntervalsTab() {
  const [sub, setSub] = useState<Sub>('explore');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 0 }}>
        {(['explore', 'calculate'] as Sub[]).map(id => (
          <button key={id} onClick={() => setSub(id)} className="gc-sub-tab" style={{
            flex: 1, padding: '11px 4px', borderRadius: 0,
            cursor: 'pointer', fontSize: 14,
            background: sub === id ? T.secondary : T.bgInput,
            color: sub === id ? '#fff' : T.textMuted,
            borderLeft: '3px solid var(--gc-bar-color)',
            transition: 'background 0.1s',
          }}>
            <span><span style={{ fontWeight: 700, opacity: 0.4, letterSpacing: 0 }}>_</span><span style={{ fontWeight: 400 }}>{SUB_LABELS[id]}</span></span>
          </button>
        ))}
      </div>

      {sub === 'explore'   && <IntervalExplore />}
      {sub === 'calculate' && <IntervalCalculate />}
    </div>
  );
}
