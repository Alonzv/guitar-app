import { useState } from 'react';
import { createPortal } from 'react-dom';
import { T } from '../theme';
import { useLang } from '../contexts/LanguageContext';
import { HELP } from '../content/helpContent';

/**
 * A small "?" button that opens a floating explanation of the current sub-tab.
 * `topic` is a key into HELP (e.g. "voicings:paths"). It reads the app-wide
 * language rather than carrying a toggle of its own.
 */
export function HelpButton({ topic }: { topic: string }) {
  const [open, setOpen] = useState(false);
  const { lang, rtl } = useLang();

  const entry = HELP[topic];
  if (!entry) return null;

  const text = entry[lang];

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={lang === 'he' ? 'מה זה?' : 'What is this?'}
        className="lg gc-no-bar"
        style={{
          width: 44, height: 44, flexShrink: 0, borderRadius: '50%',
          color: T.text, fontSize: 16, fontWeight: 600, lineHeight: 1,
          cursor: 'pointer', fontFamily: 'var(--gc-font)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >?</button>

      {open && createPortal(
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9000,
            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', padding: 16,
            animation: 'gcHelpFade 0.16s ease',
          }}
        >
          <style>{`@keyframes gcHelpFade { from { opacity: 0 } to { opacity: 1 } }
            @keyframes gcHelpPop { 0% { opacity: 0; transform: translateY(10px) scale(0.96) } 100% { opacity: 1; transform: none } }`}</style>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 440, background: T.bgCard, color: T.text,
              borderRadius: 28,
              padding: '18px 24px 26px', boxSizing: 'border-box',
              maxHeight: '86vh', overflowY: 'auto', fontFamily: 'var(--gc-font)',
              animation: 'gcHelpPop 0.2s cubic-bezier(0.34, 1.4, 0.5, 1)',
            }}
          >
            {/* Header: close */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 14 }}>
              <button onClick={() => setOpen(false)} aria-label={lang === 'he' ? 'סגירה' : 'Close'} className="gc-no-bar" style={{
                width: 44, height: 44, flexShrink: 0, borderRadius: '50%', border: `1.5px solid ${T.text}`,
                background: 'transparent', color: T.text, fontSize: 15, cursor: 'pointer',
              }}>✕</button>
            </div>

            {/* Content */}
            <div dir={rtl ? 'rtl' : 'ltr'} style={{ textAlign: rtl ? 'right' : 'left' }}>
              <h2 className="su-poster" style={{
                margin: '0 0 14px', fontSize: 44, color: T.text,
              }}>{text.title}</h2>
              <p style={{
                margin: 0, fontSize: 14, lineHeight: 1.6, color: T.text, fontWeight: 400,
              }}>{text.body}</p>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
