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
      <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: `1px solid ${T.border}` }}>
        {(['explore', 'calculate'] as Sub[]).map(id => (
          <button key={id} onClick={() => setSub(id)} className="gc-sub-tab" style={{
            flex: 1, padding: '11px 0', border: 'none', cursor: 'pointer',
            fontWeight: 500, fontSize: 14,
            background: sub === id ? T.secondary : T.bgInput,
            color: sub === id ? '#fff' : T.textMuted,
            transition: 'background 0.15s',
          }}>
            {SUB_LABELS[id]}
          </button>
        ))}
      </div>

      {sub === 'explore'   && <IntervalExplore />}
      {sub === 'calculate' && <IntervalCalculate />}
    </div>
  );
}
