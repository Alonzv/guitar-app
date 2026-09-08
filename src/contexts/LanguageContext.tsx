import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

// ── App language ─────────────────────────────────────────────────────────────
// One setting for the whole app. Six tools used to carry their own EN/HE toggle
// and their own useState('en'), so a Hebrew reader had to switch each of them
// separately, every time — and four of the six forgot the choice on unmount.
// The storage key is Tab Builder's original one, so anyone who had already set
// Hebrew there keeps it.

export type Lang = 'en' | 'he';

const KEY = 'scaleup_lang';

interface LanguageValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  /** True when the current language reads right-to-left. */
  rtl: boolean;
}

const LanguageContext = createContext<LanguageValue | null>(null);

function read(): Lang {
  try { return localStorage.getItem(KEY) === 'he' ? 'he' : 'en'; } catch { return 'en'; }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(read);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem(KEY, l); } catch { /* private mode */ }
  }, []);

  // Another tab (or the ear-trainer's remote sync) may change the setting.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setLangState(e.newValue === 'he' ? 'he' : 'en');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const value = useMemo(() => ({ lang, setLang, rtl: lang === 'he' }), [lang, setLang]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLang(): LanguageValue {
  const ctx = useContext(LanguageContext);
  // A tool rendered outside the provider (a test, a storybook) still reads.
  if (!ctx) return { lang: 'en', setLang: () => {}, rtl: false };
  return ctx;
}
