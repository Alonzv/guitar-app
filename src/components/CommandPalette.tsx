import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { T } from '../theme';
import { useLang } from '../contexts/LanguageContext';
import { searchTools, PANEL_NAMES, type ToolEntry } from '../data/tools';
import { requestNavigate } from '../services/navigate';

// ── Command palette ──────────────────────────────────────────────────────────
// ⌘K / Ctrl+K (or "/", or the search button in the header): type what you want
// to do — "which chord is this", "לכוון", "triads" — and jump straight to the
// tool. Arrow keys move, Enter goes, Esc closes.

export interface PaletteAction { id: string; label: string; hint?: string; run: () => void }

interface Props {
  open: boolean;
  onClose: () => void;
  /** Tool currently on screen, marked in the list. */
  currentId?: string;
  /** App-level commands (dark mode, sound, the tools map…) listed after the tools. */
  actions?: PaletteAction[];
}

type Row = { kind: 'tool'; tool: ToolEntry } | { kind: 'action'; action: PaletteAction };

export function CommandPalette({ open, onClose, currentId, actions = [] }: Props) {
  const { lang, rtl } = useLang();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const rows: Row[] = useMemo(() => {
    const tools = searchTools(q).map(tool => ({ kind: 'tool' as const, tool }));
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const acts = actions
      .filter(a => words.every(w => `${a.label} ${a.hint ?? ''}`.toLowerCase().includes(w)))
      .map(action => ({ kind: 'action' as const, action }));
    return [...tools, ...acts];
  }, [q, actions]);

  // A fresh palette every time it opens.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) { setQ(''); setActive(0); }
  }
  useEffect(() => { if (open) requestAnimationFrame(() => inputRef.current?.focus()); }, [open]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-row="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const go = (r: Row | undefined) => {
    if (!r) return;
    onClose();
    if (r.kind === 'tool') requestNavigate({ id: r.tool.id, tab: r.tool.tab, sub: r.tool.sub });
    else r.action.run();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, rows.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); go(rows[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  const placeholder = lang === 'he' ? 'מה תרצו לעשות? למשל "איזה אקורד זה"' : 'What do you want to do? e.g. "which chord is this"';

  return createPortal(
    <div onClick={onClose} className="gc-fade-in" style={{
      position: 'fixed', inset: 0, zIndex: 9100, background: 'rgba(0,0,0,0.55)',
      display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '10vh 16px 16px',
    }}>
      <div onClick={e => e.stopPropagation()} onKeyDown={onKey} dir={rtl ? 'rtl' : 'ltr'} className="gc-drop-in" style={{
        width: '100%', maxWidth: 560, maxHeight: '72vh', display: 'flex', flexDirection: 'column',
        background: T.bgCard, border: `1px solid ${T.border}`, borderLeft: '4px solid var(--gc-bar-color)',
        fontFamily: 'var(--gc-font)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: `1px solid ${T.border}` }}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" style={{ color: T.textDim, flexShrink: 0 }} aria-hidden>
            <circle cx="7" cy="7" r="5" /><path d="M11 11l4 4" />
          </svg>
          <input
            ref={inputRef} value={q} placeholder={placeholder} dir="auto"
            onChange={e => { setQ(e.target.value); setActive(0); }}
            aria-label={placeholder}
            style={{
              flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
              color: T.text, fontSize: 15, fontFamily: 'inherit', letterSpacing: '0.02em',
            }}
          />
          <kbd style={{ fontSize: 10, color: T.textDim, border: `1px solid ${T.border}`, padding: '2px 6px', fontFamily: 'var(--gc-mono)' }}>ESC</kbd>
        </div>

        <div ref={listRef} role="listbox" style={{ overflowY: 'auto', padding: '6px 0' }}>
          {rows.length === 0 && (
            <p style={{ margin: 0, padding: '18px 16px', fontSize: 13, color: T.textMuted }}>
              {lang === 'he' ? 'לא נמצא כלי — נסו מילה אחרת' : 'No tool matches — try another word'}
            </p>
          )}
          {rows.map((r, i) => {
            const isActive = i === active;
            const key = r.kind === 'tool' ? r.tool.id : `action:${r.action.id}`;
            const firstAction = r.kind === 'action' && (i === 0 || rows[i - 1].kind === 'tool');
            return (
              <div key={key}>
                {firstAction && (
                  <div style={{ padding: '10px 16px 4px', fontSize: 9.5, color: T.textDim, fontFamily: 'var(--gc-mono)', letterSpacing: '0.14em', textTransform: 'uppercase', borderTop: i > 0 ? `1px solid ${T.border}` : 'none', marginTop: i > 0 ? 6 : 0 }}>
                    {lang === 'he' ? 'פעולות' : 'Actions'}
                  </div>
                )}
                <button
                  data-row={i}
                  role="option"
                  aria-selected={isActive}
                  onMouseMove={() => setActive(i)}
                  onClick={() => go(r)}
                  className="gc-no-bar gc-list-in"
                  style={{
                    animationDelay: `${Math.min(i, 8) * 22}ms`,
                    display: 'flex', alignItems: 'baseline', gap: 12, width: '100%',
                    padding: '9px 16px', textAlign: rtl ? 'right' : 'left', textTransform: 'none',
                    background: isActive ? T.bgInput : 'transparent', cursor: 'pointer',
                    borderInlineStart: `3px solid ${isActive ? 'var(--gc-bar-color)' : 'transparent'}`,
                    letterSpacing: '0.02em',
                  }}
                >
                  {r.kind === 'tool' ? (
                    <>
                      <span style={{ fontSize: 14, fontWeight: 600, color: T.text, flexShrink: 0 }}>{r.tool.name[lang]}</span>
                      <span style={{ fontSize: 12, color: T.textMuted, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.tool.does[lang]}</span>
                      <span style={{ fontSize: 9.5, color: T.textDim, fontFamily: 'var(--gc-mono)', letterSpacing: '0.12em', textTransform: 'uppercase', flexShrink: 0 }}>
                        {r.tool.id === currentId ? (lang === 'he' ? 'כאן' : 'here') : PANEL_NAMES[r.tool.tab][lang]}
                      </span>
                    </>
                  ) : (
                    <>
                      <span style={{ fontSize: 13, fontWeight: 500, color: T.text, flex: 1 }}>{r.action.label}</span>
                      {r.action.hint && <span style={{ fontSize: 10, color: T.textDim, fontFamily: 'var(--gc-mono)' }}>{r.action.hint}</span>}
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
