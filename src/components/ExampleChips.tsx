import { T } from '../theme';
import { useLang } from '../contexts/LanguageContext';
import { formatChordName } from '../utils/chordIdentifier';
import { EXAMPLE_PROGRESSIONS } from '../data/examples';

// ── Examples ─────────────────────────────────────────────────────────────────
// An empty tool offers something to start from instead of just asking for
// input: one tap loads a real progression and the tool comes to life.

export function ExampleChips({ onPick, title }: { onPick: (chords: string[]) => void; title?: string }) {
  const { lang } = useLang();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
      <span style={{ fontSize: 10, color: T.textDim, fontFamily: 'var(--gc-mono)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
        {title ?? (lang === 'he' ? 'או התחילו מדוגמה' : 'or start from an example')}
      </span>
      <div dir="ltr" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
        {EXAMPLE_PROGRESSIONS.map(ex => (
          <button key={ex.label} onClick={() => onPick(ex.chords)} className="gc-notation" style={{
            padding: '7px 12px', borderRadius: 0, cursor: 'pointer', fontSize: 12,
            background: T.bgInput, color: T.text, border: `1px solid ${T.border}`,
            borderLeft: '3px solid var(--gc-bar-color)', display: 'flex', gap: 8, alignItems: 'baseline',
          }}>
            <span style={{ fontFamily: 'var(--gc-mono)', fontSize: 9, color: T.textDim, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{ex.label}</span>
            <span style={{ fontWeight: 600 }}>{ex.chords.map(formatChordName).join(' – ')}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
