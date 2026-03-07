import { useState } from 'react';
import type { ChordInProgression, ScaleMatch } from './types/music';
import { ChordBuilderTab } from './components/ChordBuilder/ChordBuilderTab';
import { ChordPickerTab } from './components/ChordPicker/ChordPickerTab';
import { LyricsTab } from './components/Lyrics/LyricsTab';
import { ScaleDetector } from './components/ScalePanel/ScaleDetector';
import { ScaleVisualizer } from './components/ScalePanel/ScaleVisualizer';
import { ScaleExplorer } from './components/ScalePanel/ScaleExplorer';
import { T } from './theme';

type Tab = 'chord' | 'picker' | 'explorer' | 'scales' | 'visualizer' | 'lyrics';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'chord',      label: 'Chord Builder', icon: '🎸' },
  { id: 'scales',     label: 'Detect Scales', icon: '🔍' },
  { id: 'visualizer', label: 'Scale View',    icon: '📖' },
  { id: 'picker',     label: 'Chord Finder',  icon: '🎹' },
  { id: 'explorer',   label: 'Scales',        icon: '🎼' },
  { id: 'lyrics',     label: 'Lyrics',        icon: '📝' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('chord');
  const [progression, setProgression] = useState<ChordInProgression[]>([]);
  const [selectedScale, setSelectedScale] = useState<ScaleMatch | null>(null);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: T.bgDeep, color: T.text, display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* ── Header ── */}
      <header style={{ backgroundColor: T.bgInput, borderBottom: `1px solid ${T.border}`, padding: 'var(--gc-header-pad)' }}>
        {/* Brand row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 6 }}>
          {/* Fretboard + pick logo mark */}
          <svg viewBox="0 0 44 48" style={{ flexShrink: 0, width: 'var(--gc-brand-logo)', height: 'var(--gc-brand-logo)' }}>
            {/* Fretboard frame */}
            <rect x="2" y="2" width="30" height="24" rx="1.5" fill="none" stroke="#3D5A6C" strokeWidth="1.8"/>
            {/* Vertical fret lines */}
            <line x1="10" y1="2" x2="10" y2="26" stroke="#3D5A6C" strokeWidth="1"/>
            <line x1="18" y1="2" x2="18" y2="26" stroke="#3D5A6C" strokeWidth="1"/>
            <line x1="26" y1="2" x2="26" y2="26" stroke="#3D5A6C" strokeWidth="1"/>
            {/* Horizontal string lines */}
            <line x1="2" y1="10" x2="32" y2="10" stroke="#3D5A6C" strokeWidth="1"/>
            <line x1="2" y1="18" x2="32" y2="18" stroke="#3D5A6C" strokeWidth="1"/>
            {/* Dots row 1 */}
            <circle cx="6" cy="6" r="3.2" fill="#629677"/>
            <circle cx="14" cy="6" r="3.2" fill="#3D5A6C"/>
            <circle cx="30" cy="6" r="3.2" fill="#E8736A"/>
            {/* Dots row 2 */}
            <circle cx="6" cy="14" r="3.2" fill="#629677"/>
            <circle cx="22" cy="14" r="3.2" fill="#E8736A"/>
            {/* Dots row 3 */}
            <circle cx="6" cy="22" r="3.2" fill="#629677"/>
            {/* Guitar pick */}
            <path d="M30 23 L38 33 Q36 43 30 41 Q24 43 22 33 Z" fill="#C44900"/>
          </svg>
          {/* Brand name */}
          <span style={{ fontSize: 'var(--gc-brand-text)', fontWeight: 800, letterSpacing: '-0.5px', lineHeight: 1 }}>
            <span style={{ color: '#3D5A6C' }}>Scale</span><span style={{ color: '#E8736A' }}>Up</span>
          </span>
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
        {activeTab === 'chord' && (
          <ChordBuilderTab
            progression={progression}
            onAddToProgression={(item) => setProgression(prev => [...prev, item])}
            onRemoveFromProgression={(id) => setProgression(prev => prev.filter(c => c.id !== id))}
            onClearProgression={() => setProgression([])}
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
    </div>
  );
}
