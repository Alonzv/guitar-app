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
        aria-expanded={open}
        className="gc-no-bar"
        style={{
          width: 44, height: 44, borderRadius: '50%', cursor: 'pointer',
          background: open ? T.secondary : 'transparent',
          border: `1.5px solid ${T.text}`,
          color: open ? T.white : T.text, fontSize: 17, lineHeight: 1, padding: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >⋮</button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute', insetInlineEnd: 0,
            ...(flip ? { bottom: 50 } : { top: 50 }),
            minWidth: 190, zIndex: 50,
            background: T.bgDeep, border: `var(--su-rule) solid ${T.text}`,
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
                padding: '0 10px', borderRadius: 0, cursor: 'pointer',
                background: 'transparent', border: 'none', textAlign: 'start',
                color: it.danger ? T.textMuted : T.text,
                fontSize: 12, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.1em',
                fontFamily: 'inherit',
                borderTop: it.danger ? `1px solid ${T.hairline}` : 'none',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = T.bgInput; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              {/* Labels only: the icons were decoration. */}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
