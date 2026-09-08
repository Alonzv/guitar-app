import { useLang } from '../contexts/LanguageContext';
import { T } from '../theme';

// ── Language toggle ──────────────────────────────────────────────────────────
// Sits beside the dark-mode button and is built to the same 34×34 ghost-icon
// spec, because it is the same kind of thing: one app-wide display setting.
// It replaces the six per-tool EN/HE pairs that used to sit inside the tools.

export function LangToggle({ compact }: { compact?: boolean } = {}) {
  const { lang, setLang } = useLang();
  const next = lang === 'en' ? 'he' : 'en';
  const size = compact ? 30 : 34;
  return (
    <button
      onClick={() => setLang(next)}
      title={lang === 'en' ? 'עברית' : 'English'}
      aria-label={lang === 'en' ? 'Switch to Hebrew' : 'Switch to English'}
      className="gc-icon-btn gc-notation"
      style={{
        width: size, height: size, borderRadius: 0,
        border: `1px solid ${T.border}`,
        background: 'transparent',
        color: T.textDim, fontSize: 11, fontWeight: 600, fontFamily: 'var(--gc-mono)',
        letterSpacing: '0.04em', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {lang === 'en' ? 'EN' : 'HE'}
    </button>
  );
}
