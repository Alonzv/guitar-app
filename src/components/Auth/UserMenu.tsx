import React, { useState, useRef, useEffect } from 'react';
import { T } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { AuthModal } from './AuthModal';

interface Props {
  /** Opens the Workspace tab. */
  onOpenWorkspace: () => void;
  /** Compact (mobile header) renders a smaller trigger. */
  compact?: boolean;
}

function initials(name: string | null, email: string | null): string {
  const src = (name && name.trim()) || (email ?? '?');
  const parts = src.split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

export const UserMenu: React.FC<Props> = ({ onOpenWorkspace, compact }) => {
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

  const sz = compact ? 26 : 30;

  // ── Logged out ──
  if (!user) {
    return (
      <>
        <button onClick={() => setAuthOpen(true)} style={{
          height: sz, padding: '0 12px', borderRadius: 0, cursor: 'pointer',
          border: `1px solid ${T.secondary}`, background: T.secondaryBg, color: T.secondary,
          fontSize: compact ? 11 : 12, fontFamily: 'inherit', fontWeight: 400,
          textTransform: 'uppercase', letterSpacing: '-0.02em',
        }}>Sign In</button>
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
      <button onClick={() => setOpen(o => !o)} aria-label="Account menu" style={{
        width: sz, height: sz, borderRadius: 0, cursor: 'pointer',
        border: `1px solid ${T.secondary}`, background: T.secondary, color: T.white,
        fontSize: compact ? 10 : 11, fontWeight: 700, fontFamily: 'inherit',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
        overflow: 'hidden',
      }}>
        {profile?.avatar_url
          ? <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : initials(profile?.display_name ?? null, profile?.email ?? user.email ?? null)}
      </button>

      {open && (
        <div style={{
          position: 'absolute', right: 0, top: sz + 6, minWidth: 210, zIndex: 60,
          background: T.bgCard, border: `1px solid ${T.border}`,
          borderLeft: '3px solid var(--gc-bar-color)',
          boxShadow: '0 6px 22px rgba(0,0,0,0.28)', padding: 6,
        }}>
          <div style={{ padding: '6px 10px 10px', borderBottom: `1px solid ${T.border}`, marginBottom: 6 }}>
            <div style={{ fontSize: 13, color: T.text, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {profile?.display_name || 'Guitarist'}
            </div>
            <div style={{ fontSize: 11, color: T.textDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {profile?.email ?? user.email}
            </div>
          </div>

          {!confirmDelete ? (
            <>
              <MenuRow label="My Workspace" icon="▣" onClick={() => { setOpen(false); onOpenWorkspace(); }} />
              <MenuRow label="Sign Out" icon="⤴" onClick={() => { setOpen(false); signOut(); }} />
              <div style={{ height: 1, background: T.border, margin: '6px 0' }} />
              <MenuRow label="Delete Account" icon="" danger onClick={() => setConfirmDelete(true)} />
            </>
          ) : (
            <div style={{ padding: '4px 8px 8px' }}>
              <p style={{ margin: '0 0 10px', fontSize: 11.5, lineHeight: 1.5, color: T.text }}>
                This permanently deletes your account and all saved tabs,
                progressions and audio. This cannot be undone.
              </p>
              <div style={{ display: 'flex', gap: 6 }}>
                <button disabled={busy} onClick={doDelete} style={{
                  flex: 1, padding: '8px 0', borderRadius: 0, cursor: 'pointer',
                  background: T.primary, color: T.white, border: 'none',
                  fontSize: 11.5, fontFamily: 'inherit', textTransform: 'uppercase', letterSpacing: '-0.02em',
                  borderLeft: '3px solid var(--gc-bar-color)',
                }}>{busy ? 'Deleting…' : 'Delete'}</button>
                <button disabled={busy} onClick={() => setConfirmDelete(false)} style={{
                  flex: 1, padding: '8px 0', borderRadius: 0, cursor: 'pointer',
                  background: T.bgInput, color: T.textMuted, border: `1px solid ${T.border}`,
                  fontSize: 11.5, fontFamily: 'inherit', textTransform: 'uppercase', letterSpacing: '-0.02em',
                }}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const MenuRow: React.FC<{ label: string; icon: string; onClick: () => void; danger?: boolean }> = ({ label, icon, onClick, danger }) => (
  <button onClick={onClick} style={{
    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
    padding: '9px 10px', borderRadius: 0, cursor: 'pointer',
    background: 'transparent', border: 'none', textAlign: 'left',
    color: danger ? T.primary : T.text, fontSize: 12.5, fontFamily: 'inherit', fontWeight: 400,
    textTransform: 'uppercase', letterSpacing: '-0.02em',
  }}
    onMouseEnter={e => { e.currentTarget.style.background = T.bgInput; }}
    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
  >
    <span style={{ width: 16, textAlign: 'center' }}>{icon}</span>{label}
  </button>
);
