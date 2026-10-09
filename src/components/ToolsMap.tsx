import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { T } from '../theme';
import { useLang } from '../contexts/LanguageContext';
import { TOOLS, PANEL_NAMES } from '../data/tools';
import { requestNavigate } from '../services/navigate';
import { BrandMark } from './BrandMark';

// ── Tools map ────────────────────────────────────────────────────────────────
// Every tool on one screen, grouped by panel, each with one line saying what
// it does for you. Opens from the logo, and by itself on a first visit, so a
// newcomer sees the whole app before picking a door.

interface Props {
  open: boolean;
  onClose: () => void;
  currentId?: string;
  onSearch: () => void;
  desktop?: boolean;
}

export function ToolsMap({ open, onClose, currentId, onSearch, desktop }: Props) {
  const { lang, rtl } = useLang();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const t = lang === 'he'
    ? { title: 'כל הכלים', sub: 'בחרו מאיפה להתחיל', search: 'חיפוש', close: 'סגירה' }
    : { title: 'All tools', sub: 'Pick a place to start', search: 'Search', close: 'Close' };

  let n = 0;   // running index for the staggered entrance

  return createPortal(
    <div className="gc-fade-in" dir={rtl ? 'rtl' : 'ltr'} style={{
      position: 'fixed', inset: 0, zIndex: 9000, background: T.bgDeep, overflowY: 'auto',
      fontFamily: 'var(--gc-font)', color: T.text,
    }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: desktop ? '22px 40px 48px' : '14px 18px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: desktop ? 28 : 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <BrandMark size={desktop ? 20 : 17} />
            <div>
              <div style={{ fontSize: desktop ? 22 : 18, fontWeight: 700, letterSpacing: '-0.02em' }}>{t.title}</div>
              <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>{t.sub}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onSearch} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', fontSize: 11,
              border: `1px solid ${T.border}`, background: T.bgInput, color: T.text, cursor: 'pointer',
              borderLeft: '3px solid var(--gc-bar-color)',
            }}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><circle cx="7" cy="7" r="5" /><path d="M11 11l4 4" /></svg>
              {t.search}{desktop && <span style={{ color: T.textDim, fontFamily: 'var(--gc-mono)' }}>⌘K</span>}
            </button>
            <button onClick={onClose} aria-label={t.close} style={{
              width: 36, height: 36, border: `1px solid ${T.border}`, background: 'transparent', color: T.text, cursor: 'pointer', fontSize: 15,
            }}>✕</button>
          </div>
        </div>

        <div style={{
          display: 'grid', gap: desktop ? 26 : 22,
          gridTemplateColumns: desktop ? 'repeat(5, minmax(0, 1fr))' : '1fr',
        }}>
          {PANEL_NAMES.map((panel, tab) => (
            <section key={tab}>
              <h2 style={{
                margin: '0 0 10px', fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase',
                paddingBottom: 8, borderBottom: `2px solid ${T.text}`,
              }}>{panel[lang]}</h2>
              <div style={{ display: 'grid', gap: 8, gridTemplateColumns: desktop ? '1fr' : 'repeat(2, minmax(0, 1fr))' }}>
                {TOOLS.filter(x => x.tab === tab).map(tool => {
                  const here = tool.id === currentId;
                  const i = n++;
                  return (
                    <button
                      key={tool.id}
                      onClick={() => { onClose(); requestNavigate({ id: tool.id, tab: tool.tab, sub: tool.sub }); }}
                      className="gc-list-in"
                      style={{
                        animationDelay: `${Math.min(i, 14) * 18}ms`,
                        display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 6,
                        padding: '12px 12px 13px', minHeight: desktop ? 96 : 88, textAlign: rtl ? 'right' : 'left',
                        textTransform: 'none', letterSpacing: '0.01em', cursor: 'pointer',
                        background: here ? T.primary : T.bgCard, color: here ? T.white : T.text,
                        border: `1px solid ${here ? T.primary : T.border}`, borderLeft: '4px solid var(--gc-bar-color)',
                      }}
                    >
                      <span style={{ fontSize: 13.5, fontWeight: 700 }}>{tool.name[lang]}</span>
                      <span style={{ fontSize: 11.5, lineHeight: 1.45, color: here ? T.white : T.textMuted, opacity: here ? 0.85 : 1 }}>{tool.does[lang]}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
