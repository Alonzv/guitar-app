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
      height: 44, borderRadius: 14,
      display: 'flex', alignItems: 'center', gap: 8, paddingInline: '12px 6px', background: 'rgba(118,118,128,0.24)',
    }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden style={{ color: T.textMuted, flex: 'none' }}>
        <circle cx="10.5" cy="10.5" r="6.5" /><path d="m20 20-4.8-4.8" />
      </svg>
      <input
        ref={ref}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') onSubmit?.(); if (e.key === 'Escape') onChange(''); }}
        aria-label={he ? 'חיפוש כלי' : 'Search tools'}
        placeholder={he ? 'חיפוש: אקורד, סולם, טיונר' : 'Search: chord, scale, tuner'}
        dir="auto"
        style={{
          flex: 1, minWidth: 0, height: 40, border: 'none', background: 'transparent', outline: 'none',
          fontFamily: 'var(--gc-font)', fontSize: 17, color: T.text,
        }}
      />
      {value ? (
        <button onClick={() => onChange('')} aria-label={he ? 'ניקוי החיפוש' : 'Clear search'} className="gc-no-bar"
          style={{ width: 22, height: 22, marginInlineEnd: 6, borderRadius: '50%', border: 'none', background: T.textMuted, color: T.bgDeep, fontSize: 14, lineHeight: 1, cursor: 'pointer', flex: 'none', padding: 0 }}>×</button>
      ) : shortcut && (
        <span style={{ fontSize: 13, color: T.textDim, marginInlineEnd: 8 }}>
          {isMac ? '⌘K' : 'Ctrl K'}
        </span>
      )}
    </div>
  );
});
