import { useState } from 'react';
import type { ChordInProgression, ScaleMatch } from './types/music';
import { ChordBuilderTab } from './components/ChordBuilder/ChordBuilderTab';
import { ChordPickerTab } from './components/ChordPicker/ChordPickerTab';
import { LyricsTab } from './components/Lyrics/LyricsTab';
import { ScaleDetector } from './components/ScalePanel/ScaleDetector';
import { ScaleVisualizer } from './components/ScalePanel/ScaleVisualizer';
import { ScaleExplorer } from './components/ScalePanel/ScaleExplorer';
import { AuthModal } from './components/Auth/AuthModal';
import { useAuth } from './contexts/AuthContext';
import { T } from './theme';

type Tab = 'chord' | 'picker' | 'explorer' | 'scales' | 'visualizer' | 'lyrics';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'chord',      label: 'Chord Builder', icon: '🎸' },
  { id: 'scales',     label: 'Detect Scales', icon: '🔍' },
  { id: 'visualizer', label: 'Scale View',    icon: '📖' },
  { id: 'picker',     label: 'Chord Picker',  icon: '🎹' },
  { id: 'explorer',   label: 'Scales',        icon: '🎼' },
  { id: 'lyrics',     label: 'Lyrics',        icon: '📝' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('chord');
  const [progression, setProgression] = useState<ChordInProgression[]>([]);
  const [selectedScale, setSelectedScale] = useState<ScaleMatch | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const { user, logout, loading, isAvailable } = useAuth();

  return (
    <div style={{ minHeight: '100vh', backgroundColor: T.bgDeep, color: T.text, display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* ── Header ── */}
      <header style={{ backgroundColor: T.bgInput, borderBottom: `1px solid ${T.border}`, padding: 'var(--gc-header-pad)' }}>

        {/* Title row with auth button */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--gc-h1-mb)' }}>
          <div style={{ width: 36 }} /> {/* spacer for centering */}
          <h1 style={{ fontSize: 'var(--gc-h1-size)', fontWeight: 800, color: T.text, margin: 0, letterSpacing: '-0.3px' }}>
            ScaleUp
          </h1>

          {/* Auth button — only shown when Firebase is configured */}
          {isAvailable && !loading && (
            user ? (
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowUserMenu(v => !v)}
                  style={{
                    width: 36, height: 36, borderRadius: '50%', border: `2px solid ${T.secondary}`,
                    background: T.bgCard, cursor: 'pointer', padding: 0, overflow: 'hidden',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                  title={user.displayName ?? user.email ?? 'משתמש'}
                >
                  {user.photoURL
                    ? <img src={user.photoURL} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} referrerPolicy="no-referrer" />
                    : <span style={{ fontSize: 16, color: T.text }}>{(user.displayName ?? user.email ?? '?')[0].toUpperCase()}</span>
                  }
                </button>

                {showUserMenu && (
                  <div
                    onClick={() => setShowUserMenu(false)}
                    style={{
                      position: 'fixed', inset: 0, zIndex: 500,
                    }}
                  >
                    <div
                      onClick={e => e.stopPropagation()}
                      style={{
                        position: 'absolute', top: 44, right: 0,
                        background: T.bgCard, border: `1px solid ${T.border}`,
                        borderRadius: 12, padding: '12px 0', minWidth: 180, zIndex: 501,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                      }}
                    >
                      <p style={{ margin: '0 16px 10px', fontSize: 12, color: T.textMuted, borderBottom: `1px solid ${T.border}`, paddingBottom: 10 }}>
                        {user.displayName ?? user.email}
                      </p>
                      <button
                        onClick={async () => { setShowUserMenu(false); await logout(); }}
                        style={{
                          display: 'block', width: '100%', textAlign: 'right',
                          padding: '8px 16px', background: 'none', border: 'none',
                          color: '#e05252', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                        }}
                      >
                        יציאה
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => setShowAuth(true)}
                style={{
                  padding: '6px 12px', borderRadius: 20,
                  background: T.primary, border: 'none',
                  color: T.text, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                }}
              >
                כניסה
              </button>
            )
          )}
          {(!isAvailable || loading) && <div style={{ width: 36 }} />}
        </div>

        {/* Tab buttons */}
        <div className="gc-tabs">
          {TABS.map(tab => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                className="gc-tab"
                onClick={() => setActiveTab(tab.id)}
                style={{
                  borderRadius: 10,
                  border: active ? 'none' : `1px solid ${T.border}`,
                  background: active ? T.primary : T.bgCard,
                  color: active ? T.text : T.textMuted,
                  fontWeight: 700,
                  boxShadow: active ? `0 2px 8px rgba(196,73,0,0.4)` : 'none',
                  transition: 'all 0.15s',
                }}
              >
                <span style={{ fontSize: 16 }}>{tab.icon}</span>
                <span className="gc-tab-label">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </header>

      {/* ── Content ── */}
      <main style={{ flex: 1, overflowY: 'auto', padding: 'var(--gc-content-pad)', maxWidth: 700, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
        {activeTab === 'chord' && (
          <ChordBuilderTab
            progression={progression}
            onAddToProgression={(item) => setProgression(prev => [...prev, item])}
            onRemoveFromProgression={(id) => setProgression(prev => prev.filter(c => c.id !== id))}
            onLoadProgression={(prog) => setProgression(prog)}
          />
        )}
        {activeTab === 'picker' && (
          <ChordPickerTab
            onAddToProgression={(item) => setProgression(prev => [...prev, item])}
          />
        )}
        {activeTab === 'explorer' && <ScaleExplorer />}
        {activeTab === 'scales' && (
          <ScaleDetector
            progression={progression}
            onSelectScale={(scale) => { setSelectedScale(scale); setActiveTab('visualizer'); }}
          />
        )}
        {activeTab === 'visualizer' && <ScaleVisualizer scale={selectedScale} />}
        {activeTab === 'lyrics' && (
          <LyricsTab progression={progression} />
        )}
      </main>

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </div>
  );
}
