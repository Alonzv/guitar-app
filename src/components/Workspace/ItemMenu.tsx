import React, { useState, useRef, useEffect } from 'react';
import { T } from '../../theme';
import { useLang } from '../../contexts/LanguageContext';

export interface MenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
}

interface Props {
  items: MenuItem[];
  /** Optional aria label for the trigger. */
  label?: string;
}

/**
 * A small glass "…" button that opens a glass menu. Closes on outside-click
 * or Esc and flips above the trigger when there isn't room below.
 */
export const ItemMenu: React.FC<Props> = ({ items, label }) => {
  const { lang } = useLang();
  const [open, setOpen]   = useState(false);
  const [flip, setFlip]   = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef  = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setFlip(window.innerHeight - rect.bottom < 300);
    }
    setOpen(o => !o);
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-block', flex: 'none' }}>
      <button
        ref={btnRef}
        aria-label={label ?? (lang === 'he' ? 'פעולות' : 'Actions')}
        onClick={toggle}
        aria-expanded={open}
        className="gc-no-bar"
        style={{
          width: 36, height: 36, borderRadius: '50%', cursor: 'pointer', border: 'none', padding: 0,
          background: open ? T.text : 'rgba(255,255,255,0.08)', color: open ? '#000' : T.text,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden fill="currentColor">
          <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="lg"
          style={{
            position: 'absolute', insetInlineEnd: 0,
            ...(flip ? { bottom: 44 } : { top: 44 }),
            minWidth: 210, zIndex: 50, borderRadius: 18,
            background: 'rgba(36,36,40,0.92)',
            display: 'flex', flexDirection: 'column', padding: 6,
          }}
        >
          {items.map((it, i) => (
            <button
              key={i}
              role="menuitem"
              onClick={() => { setOpen(false); it.onClick(); }}
              className="gc-no-bar"
              style={{
                display: 'flex', alignItems: 'center', minHeight: 44,
                padding: '0 12px', borderRadius: 12, cursor: 'pointer',
                background: 'transparent', border: 'none', textAlign: 'start',
                color: it.danger ? T.error : T.text,
                fontSize: 15, fontWeight: 500, fontFamily: 'inherit',
                marginTop: it.danger ? 4 : 0,
                boxShadow: it.danger ? 'inset 0 1px 0 rgba(255,255,255,0.08)' : 'none',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
