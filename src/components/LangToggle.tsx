import { useLang } from '../contexts/LanguageContext';
import { T } from '../theme';

// ── Language toggle ──────────────────────────────────────────────────────────
// Sits beside the dark-mode button and is built to the same outlined pill
// spec, because it is the same kind of thing: one app-wide display setting.
// It replaces the six per-tool EN/HE pairs that used to sit inside the tools.

export function LangToggle({ compact }: { compact?: boolean } = {}) {
  const { lang, setLang } = useLang();
  const next = lang === 'en' ? 'he' : 'en';
  const size = compact ? 40 : 44;
  return (
    <button
      onClick={() => setLang(next)}
      title={lang === 'en' ? 'עברית' : 'English'}
      aria-label={lang === 'en' ? 'Switch to Hebrew' : 'Switch to English'}
      className="gc-icon-btn gc-notation gc-no-bar"
      style={{
        minWidth: size, height: size, padding: '0 10px', borderRadius: 'var(--su-pill)', flex: 'none',
        border: `1.5px solid ${T.text}`,
        background: 'transparent',
        color: T.text, fontSize: 11, fontWeight: 700, fontFamily: 'var(--gc-mono)',
        letterSpacing: '0.04em', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {lang === 'en' ? 'EN' : 'HE'}
    </button>
  );
}
