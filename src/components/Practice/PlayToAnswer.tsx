import { T } from '../../theme';
import { IconMic } from '../Icons';

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
      <button onClick={mic.toggle} data-active={mic.listening} aria-pressed={mic.listening} style={{
        display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px', fontSize: 12, cursor: 'pointer',
        background: mic.listening ? T.primary : T.bgInput, color: mic.listening ? T.white : T.text,
        border: `1px solid ${mic.listening ? T.primary : T.border}`, borderLeft: '4px solid var(--gc-bar-color)', borderRadius: 0,
      }}>
        <IconMic size={14} />
        {mic.listening ? (he ? 'מקשיב — נגנו את התשובה' : 'Listening — play your answer') : (he ? 'ענו בנגינה' : 'Answer by playing')}
      </button>
      {mic.listening && (
        <span aria-live="polite" style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, fontSize: 11, color: T.textMuted }}>
          {he ? 'שומע:' : 'Hearing:'}
          <span key={mic.heard ?? 'none'} className={mic.heard != null ? 'gc-pop' : undefined}
            style={{ fontSize: 20, fontWeight: 800, color: T.text, minWidth: 30, display: 'inline-block' }}>
            {mic.heard != null ? NAMES[((mic.heard % 12) + 12) % 12] : '—'}
          </span>
        </span>
      )}
      {mic.error && <span style={{ fontSize: 11, color: T.textMuted }}>{mic.error}</span>}
    </div>
  );
}
