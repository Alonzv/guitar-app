import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { T } from '../../theme';
import { useLang } from '../../contexts/LanguageContext';

// ── Sheet ────────────────────────────────────────────────────────────────────
// The Transit modal: a paper sheet in a 2px ink frame over a dimmed page, a
// mono kicker, a poster heading and one round close pill. No shadow, no
// rounded corners. Esc and a tap outside close it.

interface Props {
  onClose: () => void;
  /** Poster heading. */
  title?: ReactNode;
  /** Mono label above the heading. */
  kicker?: ReactNode;
  maxWidth?: number;
  zIndex?: number;
  dir?: 'rtl' | 'ltr';
  /** Poster size of the heading (px). */
  titleSize?: number;
  children: ReactNode;
}

export function Sheet({ onClose, title, kicker, maxWidth = 440, zIndex = 9000, dir, titleSize = 48, children }: Props) {
  const { lang, rtl } = useLang();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex, padding: 16,
      background: 'color-mix(in srgb, var(--gc-text) 55%, transparent)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div role="dialog" aria-modal="true" onClick={e => e.stopPropagation()} dir={dir ?? (rtl ? 'rtl' : 'ltr')} style={{
        width: '100%', maxWidth, maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box',
        background: T.bgDeep, color: T.text, border: `var(--su-rule) solid ${T.text}`,
        padding: '16px 20px 22px', fontFamily: 'var(--gc-font)',
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0, paddingTop: 6 }}>
            {kicker && <span className="su-label" style={{ display: 'block', marginBottom: 10 }}>{kicker}</span>}
            {title && <h2 className="su-poster" style={{ margin: 0, fontSize: titleSize, overflowWrap: 'anywhere' }}>{title}</h2>}
          </div>
          <button type="button" onClick={onClose} aria-label={lang === 'he' ? 'סגירה' : 'Close'} className="gc-no-bar" style={{
            width: 44, height: 44, flexShrink: 0, borderRadius: '50%', cursor: 'pointer',
            border: `1.5px solid ${T.text}`, background: 'transparent', color: T.text, fontSize: 15,
          }}>✕</button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
