import { useEffect, useState } from 'react';
import { T } from '../theme';
import { soundEnabled, setSoundEnabled, subscribeSound } from '../utils/previewSound';

// ── Sound toggle ─────────────────────────────────────────────────────────────
// The header speaker: turns the sounds that answer every tap on or off (see
// utils/previewSound). Same 34×34 ghost spec as the language and theme buttons.

export function SoundToggle({ compact }: { compact?: boolean } = {}) {
  const [on, setOn] = useState(soundEnabled);
  useEffect(() => subscribeSound(setOn), []);
  const size = compact ? 30 : 34;
  return (
    <button
      onClick={() => setSoundEnabled(!on)}
      title={on ? 'Mute tap sounds' : 'Unmute tap sounds'}
      aria-label={on ? 'Mute tap sounds' : 'Unmute tap sounds'}
      aria-pressed={on}
      className="gc-icon-btn"
      style={{
        width: size, height: size, borderRadius: 0,
        border: `1px solid ${T.border}`, background: 'transparent', color: T.textDim,
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <svg width={compact ? 14 : 15} height={compact ? 14 : 15} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" aria-hidden>
        <path d="M2 6h3l4-3v10l-4-3H2z" fill="currentColor" stroke="none" />
        {on
          ? <><path d="M11 5.5c.8.7 1.2 1.6 1.2 2.5s-.4 1.8-1.2 2.5" /><path d="M12.8 3.5c1.3 1.2 2 2.8 2 4.5s-.7 3.3-2 4.5" /></>
          : <path d="M11 6l4 4M15 6l-4 4" />}
      </svg>
    </button>
  );
}
