import { useState, useEffect } from 'react';
import type { ChordInProgression, ScaleMatch } from './types/music';
import { ChordsTab } from './components/ChordsTab';
import { ScalesTab } from './components/ScalePanel/ScalesTab';
import { LyricsTab } from './components/Lyrics/LyricsTab';
import { ToolsTab } from './components/Tools/ToolsTab';
import { Onboarding } from './components/Onboarding';
import { T } from './theme';

type Tab = 'chords' | 'scales' | 'lyrics' | 'tools';

const CHROMATIC = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const FLAT_TO_SHARP: Record<string, string> = { Db:'C#', Eb:'D#', Gb:'F#', Ab:'G#', Bb:'A#' };

function transposeChordName(name: string, semitones: number): string {
  const match = name.match(/^([A-G][b#]?)(.*)$/);
  if (!match) return name;
  const root = FLAT_TO_SHARP[match[1]] ?? match[1];
  const suffix = match[2];
  const idx = CHROMATIC.indexOf(root);
  if (idx === -1) return name;
  const newIdx = ((idx + semitones) % 12 + 12) % 12;
  return CHROMATIC[newIdx] + suffix;
}

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'chords', label: 'Chords', icon: '🎸' },
  { id: 'scales', label: 'Scales', icon: '🎼' },
  { id: 'lyrics', label: 'Lyrics', icon: '📝' },
  { id: 'tools',  label: 'Tools',  icon: '🔧' },
];

export default function App() {
  const [activeTab, setActiveTab]   = useState<Tab>('chords');
  const [progression, setProgression] = useState<ChordInProgression[]>(() => {
    try {
      const saved = localStorage.getItem('scaleup_progression');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [selectedScale, setSelectedScale] = useState<ScaleMatch | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(
    () => !localStorage.getItem('scaleup_onboarded')
  );

  // Persist progression
  useEffect(() => {
    localStorage.setItem('scaleup_progression', JSON.stringify(progression));
  }, [progression]);

  const handleDoneOnboarding = () => {
    localStorage.setItem('scaleup_onboarded', '1');
    setShowOnboarding(false);
  };

  const handleReorderProgression = (id: string, dir: -1 | 1) => {
    setProgression(prev => {
      const idx = prev.findIndex(c => c.id === id);
      if (idx === -1) return prev;
      const swapIdx = idx + dir;
      if (swapIdx < 0 || swapIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      return next;
    });
  };

  const handleTransposeProgression = (semitones: number) => {
    setProgression(prev => prev.map(item => ({
      ...item,
      chord: { ...item.chord, name: transposeChordName(item.chord.name, semitones) },
    })));
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: T.bgDeep, color: T.text, display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {showOnboarding && <Onboarding onDone={handleDoneOnboarding} />}

      {/* ── Header ── */}
      <header style={{ backgroundColor: T.bgInput, borderBottom: `1px solid ${T.border}`, padding: 'var(--gc-header-pad)' }}>
        {/* Brand row */}
        <div style={{ textAlign: 'center', marginBottom: 4, position: 'relative' }}>
          <span style={{ fontSize: 'var(--gc-brand-text)', fontWeight: 800, letterSpacing: '-0.5px', lineHeight: 1 }}>
            <span style={{ color: '#3D5A6C' }}>Scale</span><span style={{ color: '#E8736A' }}>Up</span>
          </span>
          {/* ? button to reopen onboarding */}
          <button
            onClick={() => setShowOnboarding(true)}
            style={{
              position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)',
              width: 26, height: 26, borderRadius: '50%',
              border: `1px solid ${T.border}`, background: T.bgCard,
              color: T.textMuted, fontSize: 13, fontWeight: 700,
              cursor: 'pointer', lineHeight: '24px', padding: 0,
            }}
          >?</button>
        </div>
        {/* Active tab name */}
        <h1 style={{ textAlign: 'center', fontSize: 'var(--gc-tab-title)', fontWeight: 800, color: T.text, margin: '0 0 var(--gc-h1-mb)', letterSpacing: '-0.2px' }}>
          {TABS.find(t => t.id === activeTab)?.label ?? ''}
        </h1>

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
                  color: active ? T.white : T.textMuted,
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
        {activeTab === 'chords' && (
          <ChordsTab
            progression={progression}
            onAddToProgression={(item) => setProgression(prev => [...prev, item])}
            onRemoveFromProgression={(id) => setProgression(prev => prev.filter(c => c.id !== id))}
            onClearProgression={() => setProgression([])}
            onReorderProgression={handleReorderProgression}
            onTransposeProgression={handleTransposeProgression}
          />
        )}
        {activeTab === 'scales' && (
          <ScalesTab
            progression={progression}
            selectedScale={selectedScale}
            onSelectScale={setSelectedScale}
          />
        )}
        {activeTab === 'lyrics' && <LyricsTab progression={progression} />}
        {activeTab === 'tools'  && <ToolsTab />}
      </main>
    </div>
  );
}
