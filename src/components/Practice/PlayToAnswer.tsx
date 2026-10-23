import { T } from '../../theme';
import { pillStyle } from '../Transit/styles';

// ── Answer by playing ────────────────────────────────────────────────────────
// The switch and the readout for useMicNotes: turn it on, play a note on the
// guitar, and the note you played answers the question.

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

interface Props {
  lang: 'en' | 'he';
  mic: { listening: boolean; heard: number | null; error: string; toggle: () => void };
}

export function PlayToAnswer({ lang, mic }: Props) {
  const he = lang === 'he';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
      <button onClick={mic.toggle} data-active={mic.listening} aria-pressed={mic.listening} className="gc-no-bar"
        style={{ ...pillStyle(mic.listening), height: 40 }}>
        {mic.listening && <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: T.white }} />}
        {mic.listening ? (he ? 'מקשיב — נגנו את התשובה' : 'Listening — play your answer') : (he ? 'ענו בנגינה' : 'Answer by playing')}
      </button>
      {mic.listening && (
        <span aria-live="polite" style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, fontSize: 11, color: T.textMuted }}>
          {he ? 'שומע:' : 'Hearing:'}
          <span key={mic.heard ?? 'none'}
            className={`su-semi${mic.heard != null ? ' gc-pop' : ''}`}
            style={{ fontSize: 26, color: T.text, minWidth: 30, display: 'inline-block' }}>
            {mic.heard != null ? NAMES[((mic.heard % 12) + 12) % 12] : '—'}
          </span>
        </span>
      )}
      {mic.error && <span role="alert" style={{ fontSize: 11, color: T.text }}>{mic.error}</span>}
    </div>
  );
}
