import { T } from '../theme';
import { useLang } from '../contexts/LanguageContext';
import { pillStyle } from './Transit/styles';

// ── Surprise me ──────────────────────────────────────────────────────────────
// Picks something for you — a chord, a scale, a key — so there is always a
// next thing to look at. An outlined pill like every other action.

export function DiceButton({ onRoll, style }: { onRoll: () => void; style?: React.CSSProperties }) {
  const { lang } = useLang();
  const text = lang === 'he' ? 'תפתיעו אותי' : 'Surprise me';
  return (
    <button
      type="button"
      onClick={onRoll}
      title={text}
      className="gc-no-bar"
      style={{ ...pillStyle(false, 'sm'), color: T.text, ...style }}
    >
      {text}
    </button>
  );
}
