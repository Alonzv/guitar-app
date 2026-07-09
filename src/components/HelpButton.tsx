import { useState } from 'react';
import { T } from '../theme';
import { HELP } from '../content/helpContent';

type Lang = 'en' | 'he';

const LANG_KEY = 'scaleup_help_lang';
function readLang(): Lang {
  try { return localStorage.getItem(LANG_KEY) === 'he' ? 'he' : 'en'; } catch { return 'en'; }
}

/**
 * A small "?" button that opens a floating explanation of the current sub-tab.
 * `topic` is a key into HELP (e.g. "voicings:paths"). The popover toggles
 * between English and Hebrew and remembers the choice.
 */
export function HelpButton({ topic }: { topic: string }) {
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState<Lang>(readLang);

  const entry = HELP[topic];
  if (!entry) return null;

  const setLangPersist = (l: Lang) => {
    setLang(l);
    try { localStorage.setItem(LANG_KEY, l); } catch { /* ignore */ }
  };

  const text = entry[lang];
  const rtl = lang === 'he';

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="What is this tab?"
        style={{
          width: 22, height: 22, flexShrink: 0, borderRadius: 0,
          border: `1px solid ${T.border}`, background: T.bgInput,
          color: T.textMuted, fontSize: 12, fontWeight: 400, lineHeight: 1,
          cursor: 'pointer', fontFamily: 'var(--gc-font)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >?</button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9000,
            background: 'rgba(0,0,0,0.62)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', padding: 16,
            animation: 'gcHelpFade 0.16s ease',
          }}
        >
          <style>{`@keyframes gcHelpFade { from { opacity: 0 } to { opacity: 1 } }
            @keyframes gcHelpPop { 0% { opacity: 0; transform: translateY(10px) scale(0.96) } 100% { opacity: 1; transform: none } }`}</style>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 440, background: T.bgCard,
              border: `1px solid ${T.border}`, borderLeft: '4px solid var(--gc-bar-color)',
              padding: '18px 18px 20px', boxSizing: 'border-box',
              maxHeight: '86vh', overflowY: 'auto', fontFamily: 'var(--gc-font)',
              animation: 'gcHelpPop 0.2s cubic-bezier(0.34, 1.4, 0.5, 1)',
            }}
          >
            {/* Header: language toggle + close */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', border: `1px solid ${T.border}` }}>
                {(['en', 'he'] as Lang[]).map((l, i) => {
                  const active = lang === l;
                  return (
                    <button key={l} onClick={() => setLangPersist(l)} style={{
                      padding: '5px 12px', border: 'none', cursor: 'pointer',
                      borderLeft: i > 0 ? `1px solid ${T.border}` : 'none',
                      background: active ? T.secondary : T.bgInput,
                      color: active ? '#fff' : T.textMuted,
                      fontSize: 11, fontWeight: active ? 600 : 400,
                      fontFamily: 'var(--gc-font)', letterSpacing: '-0.02em',
                    }}>{l === 'en' ? 'EN' : 'עב'}</button>
                  );
                })}
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close" style={{
                width: 28, height: 28, flexShrink: 0, borderRadius: 0, border: `1px solid ${T.border}`,
                background: T.bgInput, color: T.textMuted, fontSize: 15, cursor: 'pointer',
              }}>✕</button>
            </div>

            {/* Content */}
            <div dir={rtl ? 'rtl' : 'ltr'} style={{ textAlign: rtl ? 'right' : 'left' }}>
              <h2 style={{
                margin: '0 0 8px', fontSize: 18, fontWeight: 800, color: T.text,
                lineHeight: 1.2,
              }}>{text.title}</h2>
              <p style={{
                margin: 0, fontSize: 14, lineHeight: 1.6, color: T.textMuted, fontWeight: 400,
              }}>{text.body}</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
