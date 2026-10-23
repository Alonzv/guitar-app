import { forwardRef } from 'react';
import { T } from '../../theme';
import { useLang } from '../../contexts/LanguageContext';

// ── "Where to?" ──────────────────────────────────────────────────────────────
// The pill search field on the map. It filters every stop by name and by the
// questions a player would ask ("which chord is this", "לכוון"). On desktop
// it shows ⌘K, which focuses it from anywhere.

interface Props {
  value: string;
  onChange: (q: string) => void;
  /** Enter goes to the first match. */
  onSubmit?: () => void;
  shortcut?: boolean;
}

export const StopSearch = forwardRef<HTMLInputElement, Props>(function StopSearch({ value, onChange, onSubmit, shortcut }, ref) {
  const { lang } = useLang();
  const he = lang === 'he';
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  return (
    <div style={{
      height: shortcut ? 44 : 50, border: `2px solid ${T.text}`, borderRadius: 'var(--su-pill)',
      display: 'flex', alignItems: 'center', gap: 10, padding: '0 8px 0 18px', background: T.bgCard,
    }}>
      <span aria-hidden style={{ fontSize: 15, fontWeight: 700 }}>⌕</span>
      <input
        ref={ref}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') onSubmit?.(); if (e.key === 'Escape') onChange(''); }}
        aria-label={he ? 'חיפוש כלי' : 'Search tools'}
        placeholder={shortcut ? (he ? 'לאן?' : 'Where to?') : (he ? 'לאן? אקורד, סולם, טיונר…' : 'Where to? chord, scale, tuner…')}
        dir="auto"
        style={{
          flex: 1, minWidth: 0, height: 40, border: 'none', background: 'transparent', outline: 'none',
          fontFamily: 'var(--gc-font)', fontSize: 13, color: T.text,
        }}
      />
      {value ? (
        <button onClick={() => onChange('')} aria-label={he ? 'ניקוי החיפוש' : 'Clear search'} className="gc-no-bar"
          style={{ width: 34, height: 34, borderRadius: '50%', border: 'none', background: T.text, color: T.bgDeep, fontSize: 14, cursor: 'pointer', flex: 'none' }}>×</button>
      ) : shortcut && (
        <span style={{ fontSize: 10, border: `1px solid ${T.textMuted}`, color: T.textMuted, padding: '1px 5px', marginInlineEnd: 8 }}>
          {isMac ? '⌘K' : 'Ctrl K'}
        </span>
      )}
    </div>
  );
});
