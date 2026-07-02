import React, { useState } from 'react';
import { T } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { AuthModal } from '../Auth/AuthModal';
import { SignInPrompt } from './shared';
import { AudioArchive } from './AudioArchive';
import { MyTabs } from './MyTabs';
import { SavedProgressions } from './SavedProgressions';
import { Harmonizations } from './Harmonizations';
import { VoicingPathsSection } from './VoicingPathsSection';
import { ReharmsSection } from './ReharmsSection';
import type { TabContent } from '../../services/types';
import type { ChordInProgression } from '../../types/music';

type Sub = 'progressions' | 'voicings' | 'harmonizations' | 'reharms' | 'tabs' | 'audio';

// One category per creation tool, ordered to mirror the app's own flow:
// CHORDS → VOICINGS (Paths / Harmonize / Reharm) → STUDIO (Tabs / Audio).
const SUBS: { id: Sub; label: string }[] = [
  { id: 'progressions',   label: 'Progressions'  },
  { id: 'voicings',       label: 'Voicing Paths' },
  { id: 'harmonizations', label: 'Harmonized'    },
  { id: 'reharms',        label: 'Reharms'       },
  { id: 'tabs',           label: 'My Tabs'       },
  { id: 'audio',          label: 'Audio→Tab'     },
];

interface Props {
  onOpenTabInBuilder: (content: TabContent, id: string) => void;
  onOpenProgressionInBuilder: (chords: ChordInProgression[]) => void;
  desktop?: boolean;
}

export const WorkspacePanel: React.FC<Props> = ({ onOpenTabInBuilder, onOpenProgressionInBuilder, desktop }) => {
  const { user, loading, configured } = useAuth();
  const [sub, setSub]           = useState<Sub>('progressions');
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
      {/* Category bar — one tab per creation tool. Scrolls horizontally on
          narrow screens instead of squeezing six labels into one row. */}
      <div style={{ display: 'flex', gap: 0, overflowX: 'auto', paddingBottom: 2 }}>
        {SUBS.map(s => {
          const active = sub === s.id;
          return (
            <button key={s.id} onClick={() => setSub(s.id)} className="gc-sub-tab" style={{
              flex: '1 0 auto', minWidth: 108, padding: '9px 10px', borderRadius: 0,
              cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap',
              background: active ? T.secondary : T.bgInput,
              color: active ? '#fff' : T.textMuted,
              borderLeft: '3px solid var(--gc-bar-color)', transition: 'background 0.1s',
            }}>
              <span><span style={{ fontWeight: 700, opacity: 0.4, letterSpacing: 0 }}>_</span><span style={{ fontWeight: 400 }}>{s.label}</span></span>
            </button>
          );
        })}
      </div>

      {/* key={sub} remounts the section so the fade plays on every switch */}
      <div key={sub} className="gc-fadein">
        {sub === 'progressions'   && <SavedProgressions desktop={desktop} onOpenInBuilder={onOpenProgressionInBuilder} />}
        {sub === 'voicings'       && <VoicingPathsSection desktop={desktop} />}
        {sub === 'harmonizations' && <Harmonizations desktop={desktop} />}
        {sub === 'reharms'        && <ReharmsSection desktop={desktop} />}
        {sub === 'tabs'           && <MyTabs desktop={desktop} onOpenInBuilder={onOpenTabInBuilder} />}
        {sub === 'audio'          && <AudioArchive desktop={desktop} />}
      </div>
      <style>{`.gc-fadein { animation: gcFadeIn .18s ease; } @keyframes gcFadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }`}</style>
    </div>
  );
};
