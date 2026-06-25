import React, { useState } from 'react';
import { T } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { AuthModal } from '../Auth/AuthModal';
import { SignInPrompt } from './shared';
import { AudioArchive } from './AudioArchive';
import { MyTabs } from './MyTabs';
import { SavedProgressions } from './SavedProgressions';
import type { TabContent } from '../../services/types';
import type { ChordInProgression } from '../../types/music';

type Sub = 'audio' | 'tabs' | 'progressions';

const SUBS: { id: Sub; label: string }[] = [
  { id: 'audio',        label: 'Audio Archive' },
  { id: 'tabs',         label: 'My Tabs'       },
  { id: 'progressions', label: 'Progressions'  },
];

interface Props {
  onOpenTabInBuilder: (content: TabContent, id: string) => void;
  onOpenProgressionInBuilder: (chords: ChordInProgression[]) => void;
  desktop?: boolean;
}

export const WorkspacePanel: React.FC<Props> = ({ onOpenTabInBuilder, onOpenProgressionInBuilder, desktop }) => {
  const { user, loading, configured } = useAuth();
  const [sub, setSub]           = useState<Sub>('audio');
  const [authOpen, setAuthOpen] = useState(false);

  if (loading) {
    return <p style={{ color: T.textDim, fontSize: 12, textAlign: 'center', padding: 30 }}>Loading…</p>;
  }

  if (!configured) {
    return (
      <div style={{ color: T.textMuted, fontSize: 13, lineHeight: 1.6, padding: '24px 4px' }}>
        Accounts aren&apos;t configured in this build. Add your Supabase keys to
        <code style={{ margin: '0 4px', color: T.text }}>.env</code> to enable the
        personal library.
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <SignInPrompt onSignIn={() => setAuthOpen(true)} />
        {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
      </>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Sub-tab bar — mirrors TheoryTab/ToolsTab */}
      <div style={{ display: 'flex', gap: 0 }}>
        {SUBS.map(s => {
          const active = sub === s.id;
          return (
            <button key={s.id} onClick={() => setSub(s.id)} className="gc-sub-tab" style={{
              flex: 1, padding: '9px 4px', borderRadius: 0, cursor: 'pointer', fontSize: 12,
              background: active ? T.secondary : T.bgInput,
              color: active ? '#fff' : T.textMuted,
              borderLeft: '3px solid var(--gc-bar-color)', transition: 'background 0.1s',
            }}>
              <span><span style={{ fontWeight: 700, opacity: 0.4, letterSpacing: 0 }}>_</span><span style={{ fontWeight: 400 }}>{s.label}</span></span>
            </button>
          );
        })}
      </div>

      {sub === 'audio'        && <AudioArchive desktop={desktop} />}
      {sub === 'tabs'         && <MyTabs desktop={desktop} onOpenInBuilder={onOpenTabInBuilder} />}
      {sub === 'progressions' && <SavedProgressions desktop={desktop} onOpenInBuilder={onOpenProgressionInBuilder} />}
    </div>
  );
};
