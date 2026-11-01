import { T } from '../../theme';

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
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
      <button onClick={mic.toggle} aria-pressed={mic.listening} className="gc-no-bar" style={{
        height: 44, padding: '0 18px 0 16px', borderRadius: 22, border: 'none', cursor: 'pointer',
        background: mic.listening ? T.text : 'rgba(255,255,255,0.08)', color: mic.listening ? '#000' : T.text,
        display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 600,
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0" /><path d="M12 18v3" />
        </svg>
        {mic.listening ? (he ? 'מקשיב, נגנו את התשובה' : 'Listening, play your answer') : (he ? 'לענות בנגינה' : 'Answer by playing')}
      </button>
      {mic.listening && (
        <span aria-live="polite" style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, fontSize: 13, fontWeight: 600, color: T.textMuted }}>
          {he ? 'שומע:' : 'Hearing:'}
          <span key={mic.heard ?? 'none'} className={`gc-notation${mic.heard != null ? ' gc-pop' : ''}`}
            style={{ fontSize: 24, fontWeight: 700, color: T.text, minWidth: 30, display: 'inline-block' }}>
            {mic.heard != null ? NAMES[((mic.heard % 12) + 12) % 12] : '–'}
          </span>
        </span>
      )}
      {mic.error && <span role="alert" style={{ fontSize: 13, color: T.textMuted, flexBasis: '100%', textAlign: 'center' }}>{mic.error}</span>}
    </div>
  );
}
