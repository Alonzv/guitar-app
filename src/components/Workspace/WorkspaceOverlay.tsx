import React, { useEffect } from 'react';
import { T } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { WorkspacePanel } from './WorkspacePanel';
import type { TabContent } from '../../services/types';
import type { ChordInProgression } from '../../types/music';

// ── My Workspace — a dedicated, personal, full-screen area ───────────────────
// Opened from the account menu. Deliberately NOT a tab inside the public app
// shell: this is the signed-in user's own space, with one category per
// creation tool. "Open in …" actions close it and land in the right tool.

interface Props {
  onClose: () => void;
  onOpenTabInBuilder: (content: TabContent, id: string) => void;
  onOpenProgressionInBuilder: (chords: ChordInProgression[]) => void;
  desktop?: boolean;
}

export const WorkspaceOverlay: React.FC<Props> = ({
  onClose, onOpenTabInBuilder, onOpenProgressionInBuilder, desktop,
}) => {
  const { user, profile } = useAuth();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 8000,
      background: T.bgDeep, color: T.text,
      display: 'flex', flexDirection: 'column',
      fontFamily: 'var(--gc-font)',
    }}>
      {/* Header */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, padding: '14px 20px',
        borderBottom: `1px solid ${T.border}`, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, minWidth: 0 }}>
          <span style={{ fontWeight: 600, fontSize: 17, whiteSpace: 'nowrap' }}>
            <span style={{ color: T.text }}>My</span>
            <span style={{ color: T.brandAccent }}> Workspace</span>
          </span>
          <span style={{
            fontSize: 11, color: T.textDim, overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {profile?.display_name || profile?.email || user?.email || ''}
          </span>
        </div>
        <button
          onClick={onClose}
          title="Back to the app [Esc]"
          className="gc-icon-btn"
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '7px 14px', borderRadius: 0,
            border: `1px solid ${T.border}`, background: T.bgInput,
            color: T.textMuted, fontSize: 12, cursor: 'pointer',
            textTransform: 'uppercase', letterSpacing: '-0.02em',
            whiteSpace: 'nowrap',
          }}
        >
          ‹ Back to App
        </button>
      </header>

      {/* Content */}
      <main style={{
        flex: 1, overflowY: 'auto',
        padding: desktop ? '28px 40px 48px' : '18px 14px 40px',
      }}>
        <div style={{ maxWidth: 1240, margin: '0 auto' }}>
          <WorkspacePanel
            desktop={desktop}
            onOpenTabInBuilder={onOpenTabInBuilder}
            onOpenProgressionInBuilder={onOpenProgressionInBuilder}
          />
        </div>
      </main>
    </div>
  );
};
