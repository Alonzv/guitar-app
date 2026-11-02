import { T } from '../theme';
import { pillStyle } from './Transit/styles';
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
      <span style={{ fontSize: 13, fontWeight: 600, color: T.textMuted }}>
        {title ?? (lang === 'he' ? 'או התחילו מדוגמה' : 'or start from an example')}
      </span>
      <div dir="ltr" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
        {EXAMPLE_PROGRESSIONS.map(ex => (
          <button key={ex.label} type="button" onClick={() => onPick(ex.chords)} className="gc-notation gc-no-bar" style={{
            ...pillStyle(false, 'sm'), textTransform: 'none', letterSpacing: 'normal', gap: 8,
          }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: T.textMuted }}>{ex.label}</span>
            <span style={{ fontWeight: 700 }}>{ex.chords.map(formatChordName).join(' – ')}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
