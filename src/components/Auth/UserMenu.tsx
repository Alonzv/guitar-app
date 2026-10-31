import React, { useState, useRef, useEffect } from 'react';
import { T, btn } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { AuthModal } from './AuthModal';
import { useLang } from '../../contexts/LanguageContext';

interface Props {
  /** Opens the Library stop. */
  onOpenWorkspace: () => void;
  /** Compact (mobile header) renders a smaller trigger. */
  compact?: boolean;
  /** Open the menu upwards (the desktop sidebar's footer). */
  up?: boolean;
}

function initials(name: string | null, email: string | null): string {
  const src = (name && name.trim()) || (email ?? '?');
  const parts = src.split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

export const UserMenu: React.FC<Props> = ({ onOpenWorkspace, up }) => {
  const { lang } = useLang();
  const he = lang === 'he';
  const { user, profile, signOut, deleteAccount } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [open, setOpen]         = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy]         = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false); setConfirmDelete(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const sz = 44;

  // ── Logged out ──
  if (!user) {
    return (
      <>
        <button onClick={() => setAuthOpen(true)} className="lg gc-no-bar" style={{
          height: sz, padding: '0 18px', borderRadius: 'var(--su-pill)', cursor: 'pointer', whiteSpace: 'nowrap',
          color: T.text, fontSize: 15, fontFamily: 'inherit', fontWeight: 600,
        }}>{he ? 'כניסה' : 'Sign in'}</button>
        {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
      </>
    );
  }

  const doDelete = async () => {
    setBusy(true);
    try { await deleteAccount(); setOpen(false); }
    catch (e) { console.error(e); alert('Could not delete account. Please try again.'); }
    finally { setBusy(false); setConfirmDelete(false); }
  };

  // ── Logged in ──
  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} aria-label={he ? 'תפריט החשבון' : 'Account menu'} aria-expanded={open} className="lg gc-no-bar" style={{
        width: sz, height: sz, borderRadius: '50%', cursor: 'pointer',
        color: T.text,
        fontSize: 14, fontWeight: 600, fontFamily: 'inherit',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
        overflow: 'hidden',
      }}>
        {profile?.avatar_url
          ? <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : initials(profile?.display_name ?? null, profile?.email ?? user.email ?? null)}
      </button>

      {open && (
        <div style={{
          position: 'absolute', insetInlineEnd: up ? undefined : 0, insetInlineStart: up ? 0 : undefined,
          top: up ? undefined : sz + 6, bottom: up ? sz + 6 : undefined, minWidth: 230, zIndex: 60,
          background: T.bgDeep, border: `var(--su-rule) solid ${T.border}`, padding: 8,
        }}>
          <div style={{ padding: '6px 10px 10px', borderBottom: `var(--su-rule) solid ${T.border}`, marginBottom: 6 }}>
            <div style={{ fontSize: 13, color: T.text, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {profile?.display_name || 'Guitarist'}
            </div>
            <div style={{ fontSize: 11, color: T.textDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {profile?.email ?? user.email}
            </div>
          </div>

          {!confirmDelete ? (
            <>
              <MenuRow label={he ? 'הספרייה' : 'Library'} onClick={() => { setOpen(false); onOpenWorkspace(); }} />
              <MenuRow label={he ? 'יציאה' : 'Sign out'} onClick={() => { setOpen(false); signOut(); }} />
              <div style={{ height: 1, background: T.hairline, margin: '6px 0' }} />
              <MenuRow label={he ? 'מחיקת החשבון' : 'Delete account'} muted onClick={() => setConfirmDelete(true)} />
            </>
          ) : (
            <div style={{ padding: '4px 8px 8px' }}>
              <p style={{ margin: '0 0 10px', fontSize: 11.5, lineHeight: 1.5, color: T.text }}>
                {he ? 'זה מוחק לצמיתות את החשבון ואת כל הטאבים, המהלכים וההקלטות השמורים. אי אפשר לבטל.'
                    : 'This permanently deletes your account and all saved tabs, progressions and audio. This cannot be undone.'}
              </p>
              <div style={{ display: 'flex', gap: 6 }}>
                <button disabled={busy} onClick={doDelete} className="gc-no-bar" style={{ ...btn.primary(busy), flex: 1 }}>
                  {busy ? (he ? 'מוחק…' : 'Deleting…') : (he ? 'מחיקה' : 'Delete')}</button>
                <button disabled={busy} onClick={() => setConfirmDelete(false)} className="gc-no-bar" style={{ ...btn.secondary(), flex: 1 }}>
                  {he ? 'ביטול' : 'Cancel'}</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const MenuRow: React.FC<{ label: string; onClick: () => void; muted?: boolean }> = ({ label, onClick, muted }) => (
  <button onClick={onClick} className="gc-no-bar" style={{
    width: '100%', display: 'flex', alignItems: 'center', minHeight: 44,
    padding: '0 10px', borderRadius: 0, cursor: 'pointer',
    background: 'transparent', border: 'none', textAlign: 'start',
    color: muted ? T.textMuted : T.text, fontSize: 12, fontFamily: 'inherit', fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '0.1em',
  }}
    onMouseEnter={e => { e.currentTarget.style.background = T.bgInput; }}
    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
  >
    {label}
  </button>
);
