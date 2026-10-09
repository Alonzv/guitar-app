import { useState } from 'react';
import { T } from '../theme';
import { useLang } from '../contexts/LanguageContext';

// ── Surprise me ──────────────────────────────────────────────────────────────
// A die that picks something for you — a chord, a scale, a key — so there is
// always a next thing to look at. The face turns over on each roll.

const PIPS: Record<number, [number, number][]> = {
  1: [[8, 8]], 2: [[5, 5], [11, 11]], 3: [[4.5, 4.5], [8, 8], [11.5, 11.5]],
  4: [[5, 5], [11, 5], [5, 11], [11, 11]], 5: [[4.5, 4.5], [11.5, 4.5], [8, 8], [4.5, 11.5], [11.5, 11.5]],
  6: [[5, 4.5], [11, 4.5], [5, 8], [11, 8], [5, 11.5], [11, 11.5]],
};

export function DiceButton({ onRoll, style }: { onRoll: () => void; style?: React.CSSProperties }) {
  const { lang } = useLang();
  const [face, setFace] = useState(5);
  return (
    <button
      onClick={() => { setFace(f => (f + 1 + Math.floor(Math.random() * 4)) % 6 + 1); onRoll(); }}
      title={lang === 'he' ? 'תפתיעו אותי' : 'Surprise me'}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 12px', borderRadius: 0,
        cursor: 'pointer', fontSize: 11, background: T.bgInput, color: T.text,
        border: `1px solid ${T.border}`, borderLeft: '3px solid var(--gc-bar-color)', ...style,
      }}
    >
      <svg key={face} width="14" height="14" viewBox="0 0 16 16" aria-hidden className="gc-die">
        <rect x="1" y="1" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" />
        {PIPS[face].map(([x, y], i) => <rect key={i} x={x - 1.3} y={y - 1.3} width="2.6" height="2.6" fill="currentColor" />)}
      </svg>
      {lang === 'he' ? 'תפתיעו אותי' : 'Surprise me'}
    </button>
  );
}
