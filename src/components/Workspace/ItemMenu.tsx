import React, { useState, useRef, useEffect } from 'react';
import { T } from '../../theme';

export interface MenuItem {
  label: string;
  icon?: string;
  onClick: () => void;
  danger?: boolean;
}

interface Props {
  items: MenuItem[];
  /** Optional aria label for the trigger. */
  label?: string;
}

/**
 * Reusable kebab (⋮) dropdown. Closes on outside-click or Esc and flips above
 * the trigger when there isn't room below.
 */
export const ItemMenu: React.FC<Props> = ({ items, label = 'Actions' }) => {
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
      setFlip(window.innerHeight - rect.bottom < 180);
    }
    setOpen(o => !o);
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        ref={btnRef}
        aria-label={label}
        onClick={toggle}
        style={{
          width: 30, height: 30, borderRadius: 0, cursor: 'pointer',
          background: open ? T.bgInput : 'transparent',
          border: `1px solid ${open ? T.border : 'transparent'}`,
          color: T.textMuted, fontSize: 17, lineHeight: 1, padding: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >⋮</button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute', right: 0,
            ...(flip ? { bottom: 34 } : { top: 34 }),
            minWidth: 168, zIndex: 50,
            background: T.bgCard, border: `1px solid ${T.border}`,
            borderLeft: '3px solid var(--gc-bar-color)',
            boxShadow: '0 6px 22px rgba(0,0,0,0.28)',
            display: 'flex', flexDirection: 'column', padding: 4,
          }}
        >
          {items.map((it, i) => (
            <button
              key={i}
              role="menuitem"
              onClick={() => { setOpen(false); it.onClick(); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 9,
                padding: '8px 10px', borderRadius: 0, cursor: 'pointer',
                background: 'transparent', border: 'none', textAlign: 'left',
                color: it.danger ? T.primary : T.text,
                fontSize: 12.5, fontWeight: 400,
                textTransform: 'uppercase', letterSpacing: '-0.02em',
                fontFamily: 'inherit',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = T.bgInput; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              {it.icon && <span style={{ width: 16, textAlign: 'center', fontSize: 13 }}>{it.icon}</span>}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
