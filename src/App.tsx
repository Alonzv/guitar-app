import { useState, useEffect, useRef, useCallback } from 'react';
import type { ChordInProgression, Tuning } from './types/music';
import { TUNINGS, CHROMATIC } from './utils/musicTheory';

// ── Panel components ───────────────────────────────────────────────────────
// Statically imported (single bundle). Tab-level code-splitting was tried for
// a smaller initial download, but a hashed chunk going 404 after a redeploy —
// amplified by the PWA service worker serving a stale index.html — broke every
// tab mid-session. Stability wins: one bundle can never hit a missing chunk.
// (The large TensorFlow dependency stays lazy-loaded inside audioToTab, which
// is an isolated leaf that never blocks a whole tab.)
import { ChordPickerTab }    from './components/ChordPicker/ChordPickerTab';
import { ChordBuilderTab }   from './components/ChordBuilder/ChordBuilderTab';
import { ChordAnalyzerTab }  from './components/ChordBuilder/ChordAnalyzerTab';
import { TargetNoteTab }     from './components/Chords/TargetNoteTab';

import { ScaleExplorer }     from './components/ScalePanel/ScaleExplorer';
import { TriadsGenerator }   from './components/Triads/TriadsGenerator';
import { IntervalsTab }      from './components/Intervals/IntervalsTab';
import { WheelTab }          from './components/Tools/WheelTab';

import { VoicingsTab }       from './components/Voicings/VoicingsTab';

import { Tuner }             from './components/Tools/Tuner';
import { Metronome }         from './components/Tools/Metronome';
import { EarTrainingTab }    from './components/EarTraining/EarTrainingTab';

import { TabBuilder }        from './components/Tools/TabBuilder';
import { AudioToTab }        from './components/Tools/AudioToTab';
import { WorkspacePanel }    from './components/Workspace/WorkspacePanel';
import { WorkspaceOverlay }  from './components/Workspace/WorkspaceOverlay';

// ── Electron-only ──────────────────────────────────────────────────────────
import { TheoryTab }   from './components/TheoryTab';
import { ToolsTab }    from './components/Tools/ToolsTab';

// ── Shell ──────────────────────────────────────────────────────────────────
import { SwipePager, Segment } from './components/SwipePager';
import { DesktopShell }        from './components/desktop/DesktopShell';
import { UserMenu }            from './components/Auth/UserMenu';
import { ErrorBoundary }       from './components/ErrorBoundary';

// ── Hooks ──────────────────────────────────────────────────────────────────
import { useIsDesktop }        from './hooks/useIsDesktop';

// ── Services ───────────────────────────────────────────────────────────────
import { subscribeHandoff, requestOpenTabInBuilder, subscribeHarmonizationHandoff, subscribeVoicingsHandoff } from './services/handoff';
import type { TabContent } from './services/types';
import { T } from './theme';

// ── Types & constants ──────────────────────────────────────────────────────
type ChordsSub    = 'builder' | 'finder' | 'analyzer' | 'target';
type ScalesSub    = 'explorer' | 'triads' | 'intervals' | 'wheel';
type VoicingsSub  = 'paths' | 'voiceleading' | 'harmonizer' | 'reharmonize';
type PracticeSub  = 'tuner' | 'metronome' | 'eartraining';
type StudioSub    = 'tabbuilder' | 'audiotab';

const PANEL_TITLES = ['CHORDS', 'SCALES', 'VOICINGS', 'PRACTICE', 'STUDIO'];

const CHORDS_SEGS    = [
  { id: 'finder',   label: 'By Name' },
  { id: 'builder',  label: 'By Ear'  },
  { id: 'analyzer', label: 'Analyze' },
  { id: 'target',   label: 'Target'  },
];
const SCALES_SEGS    = [
  { id: 'explorer',  label: 'Explorer' },
  { id: 'triads',    label: 'Triads'   },
  { id: 'intervals', label: 'Intervals'},
  { id: 'wheel',     label: 'Wheel'    },
];
const VOICINGS_SEGS  = [
  { id: 'paths',        label: 'Paths'      },
  { id: 'voiceleading', label: 'Voice Lead' },
  { id: 'harmonizer',   label: 'Harmonize'  },
  { id: 'reharmonize',  label: 'Reharm'     },
];
const PRACTICE_SEGS  = [
  { id: 'tuner',       label: 'Tuner'     },
  { id: 'metronome',   label: 'Metronome' },
  { id: 'eartraining', label: 'Ear'       },
];
const STUDIO_SEGS    = [
  { id: 'tabbuilder', label: 'Tab Builder' },
  { id: 'audiotab',   label: 'Audio→Tab'  },
];

// ── Electron sidebar tabs ─────────────────────────────────────────────────
type ElTab = 'theory' | 'voicings' | 'tools' | 'workspace';
const EL_TABS: { id: ElTab; label: string }[] = [
  { id: 'theory',    label: 'Theory'    },
  { id: 'voicings',  label: 'Voicings'  },
  { id: 'tools',     label: 'Tools'     },
  { id: 'workspace', label: 'Workspace' },
];

// ── Helpers ────────────────────────────────────────────────────────────────
const FLAT_TO_SHARP: Record<string, string> = { Db:'C#', Eb:'D#', Gb:'F#', Ab:'G#', Bb:'A#' };

function transposeChordName(name: string, semitones: number): string {
  const match = name.match(/^([A-G][b#]?)(.*)$/);
  if (!match) return name;
  const root = FLAT_TO_SHARP[match[1]] ?? match[1];
  const idx = CHROMATIC.indexOf(root);
  if (idx === -1) return name;
  return CHROMATIC[((idx + semitones) % 12 + 12) % 12] + match[2];
}

function decodeSharedProgression(): ChordInProgression[] | null {
  try {
    const hash = window.location.hash;
    if (!hash.startsWith('#s=')) return null;
    const raw: { n: string; f: ChordInProgression['fretPositions'] }[] =
      JSON.parse(atob(hash.slice(3)));
    if (!Array.isArray(raw)) return null;
    return raw.map((r, i) => ({
      id: `chord-shared-${i}`,
      chord: { name: r.n, notes: [], aliases: [] },
      fretPositions: r.f ?? [],
    }));
  } catch { return null; }
}

function readLS(key: string, fallback: string): string {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function writeLS(key: string, val: string) {
  try { localStorage.setItem(key, val); } catch {}
}

// ════════════════════════════════════════════════════════════════════════════
export default function App() {
  // ── Dark mode ─────────────────────────────────────────────────────────────
  const [darkMode, setDarkMode] = useState(() => readLS('scaleup_dark', '0') === '1');
  useEffect(() => {
    document.body.classList.toggle('dark', darkMode);
    writeLS('scaleup_dark', darkMode ? '1' : '0');
  }, [darkMode]);

  // ── My Workspace (dedicated full-screen personal area) ────────────────────
  const [workspaceOpen, setWorkspaceOpen] = useState(false);

  // ── Progression + undo/redo ───────────────────────────────────────────────
  const [progression, setProgression] = useState<ChordInProgression[]>(() => {
    try { return JSON.parse(localStorage.getItem('scaleup_progression') || '[]'); }
    catch { return []; }
  });
  const [undoStack, setUndoStack] = useState<ChordInProgression[][]>([]);
  const [redoStack, setRedoStack] = useState<ChordInProgression[][]>([]);

  const progressionRef = useRef(progression);
  progressionRef.current = progression;
  const undoRef = useRef(undoStack); undoRef.current = undoStack;
  const redoRef = useRef(redoStack); redoRef.current = redoStack;

  const pushHistory = useCallback((next: ChordInProgression[]) => {
    setUndoStack(prev => [...prev.slice(-49), progressionRef.current]);
    setRedoStack([]);
    setProgression(next);
  }, []);

  const handleUndo = useCallback(() => {
    const stack = undoRef.current;
    if (!stack.length) return;
    setRedoStack(prev => [progressionRef.current, ...prev]);
    setProgression(stack[stack.length - 1]);
    setUndoStack(prev => prev.slice(0, -1));
  }, []);

  const handleRedo = useCallback(() => {
    const stack = redoRef.current;
    if (!stack.length) return;
    setUndoStack(prev => [...prev, progressionRef.current]);
    setProgression(stack[0]);
    setRedoStack(prev => prev.slice(1));
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo(); }
      if ((e.ctrlKey || e.metaKey) && ((e.shiftKey && e.key === 'z') || e.key === 'y')) { e.preventDefault(); handleRedo(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleUndo, handleRedo]);

  useEffect(() => {
    try { localStorage.setItem('scaleup_progression', JSON.stringify(progression)); } catch {}
  }, [progression]);

  // ── Tuning & Capo ─────────────────────────────────────────────────────────
  const [tuning, setTuning] = useState<Tuning>(TUNINGS[0]);
  const [capo, setCapo]     = useState(0);

  // ── Shared progression banner ─────────────────────────────────────────────
  const [sharedProgression] = useState<ChordInProgression[] | null>(decodeSharedProgression);
  const [showSharedBanner, setShowSharedBanner] = useState(() => !!decodeSharedProgression());

  const handleLoadShared = () => {
    if (sharedProgression) { pushHistory(sharedProgression); setPagerTab(0); }
    setShowSharedBanner(false);
    history.replaceState(null, '', window.location.pathname);
  };


  // ── Progression handlers ───────────────────────────────────────────────────
  const handleReorderProgression = (id: string, dir: -1 | 1) => {
    const idx = progression.findIndex(c => c.id === id);
    if (idx === -1) return;
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= progression.length) return;
    const next = [...progression];
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    pushHistory(next);
  };

  const handleTransposeProgression = (semitones: number) => {
    pushHistory(progression.map(item => ({
      ...item,
      chord: { ...item.chord, name: transposeChordName(item.chord.name, semitones) },
    })));
  };

  // ── SwipePager state ──────────────────────────────────────────────────────
  const [pagerTab, setPagerTab]             = useState(() => parseInt(readLS('scaleup_pager_tab', '0'), 10) || 0);
  // Always land on "By Name" when the app opens (not the last-used chords tab).
  const [chordsSegment, setChordsSegment]   = useState<ChordsSub>('finder');
  const [scalesSegment, setScalesSegment]   = useState<ScalesSub>(() => readLS('scaleup_seg_scales', 'explorer') as ScalesSub);
  const [voicingsSegment, setVoicingsSegment] = useState<VoicingsSub>(() => readLS('scaleup_seg_voicings', 'paths') as VoicingsSub);
  const [practiceSegment, setPracticeSegment] = useState<PracticeSub>(() => readLS('scaleup_seg_practice', 'tuner') as PracticeSub);
  const [studioSegment, setStudioSegment]   = useState<StudioSub>(() => {
    const v = readLS('scaleup_seg_studio', 'tabbuilder');
    return (v === 'tabbuilder' || v === 'audiotab') ? v : 'tabbuilder';
  });

  const handleTabChange = (t: number) => { setPagerTab(t); writeLS('scaleup_pager_tab', String(t)); };
  const handleChordsSegChange   = (s: string) => { setChordsSegment(s as ChordsSub);   writeLS('scaleup_seg_chords',   s); };
  // Logo click → home base: Chords / By Name.
  const handleLogoClick = () => { handleTabChange(0); handleChordsSegChange('finder'); };
  const handleScalesSegChange   = (s: string) => { setScalesSegment(s as ScalesSub);   writeLS('scaleup_seg_scales',   s); };
  const handleVoicingsSegChange = (s: string) => { setVoicingsSegment(s as VoicingsSub); writeLS('scaleup_seg_voicings', s); };
  const handlePracticeSegChange = (s: string) => { setPracticeSegment(s as PracticeSub); writeLS('scaleup_seg_practice', s); };
  const handleStudioSegChange   = (s: string) => { setStudioSegment(s as StudioSub);   writeLS('scaleup_seg_studio',   s); };

  // ── Handoff: Workspace "Open in Builder" → STUDIO/Tab Builder ─────────────
  useEffect(() => subscribeHandoff(() => {
    setWorkspaceOpen(false);
    setPagerTab(4);
    setStudioSegment('tabbuilder');
    writeLS('scaleup_pager_tab', '4');
    writeLS('scaleup_seg_studio', 'tabbuilder');
  }), []);

  // ── Handoff: Library "Open in Harmonizer" → VOICINGS/Harmonize ────────────
  useEffect(() => subscribeHarmonizationHandoff(() => {
    setWorkspaceOpen(false);
    setPagerTab(2);
    setVoicingsSegment('harmonizer');
    writeLS('scaleup_pager_tab', '2');
    writeLS('scaleup_seg_voicings', 'harmonizer');
    setElTab('voicings'); // Electron layout — the tool consumes on its mount
  }), []);

  // ── Handoff: Library "Open in Paths / Reharm" → VOICINGS/<sub> ────────────
  useEffect(() => subscribeVoicingsHandoff(h => {
    setWorkspaceOpen(false);
    setPagerTab(2);
    setVoicingsSegment(h.sub);
    writeLS('scaleup_pager_tab', '2');
    writeLS('scaleup_seg_voicings', h.sub);
    setElTab('voicings');
  }), []);

  // ── Workspace handlers ─────────────────────────────────────────────────────
  const handleOpenProgression = (chords: ChordInProgression[]) => {
    pushHistory(chords.map((c, i) => ({ ...c, id: `chord-loaded-${Date.now()}-${i}` })));
    setPagerTab(0);
    setChordsSegment('builder');
    writeLS('scaleup_pager_tab', '0');
    writeLS('scaleup_seg_chords', 'builder');
  };
  const handleOpenTab = (content: TabContent) => {
    requestOpenTabInBuilder(content);
    setPagerTab(4);
    setStudioSegment('tabbuilder');
    writeLS('scaleup_pager_tab', '4');
    writeLS('scaleup_seg_studio', 'tabbuilder');
  };

  // ── Electron state ────────────────────────────────────────────────────────
  const [elTab, setElTab]             = useState<ElTab>('theory');
  const [sidebarPinned, setSidebarPinned]  = useState(() => readLS('scaleup_sidebar_pinned', '1') !== '0');
  const [sidebarHovered, setSidebarHovered] = useState(false);

  useEffect(() => { writeLS('scaleup_sidebar_pinned', sidebarPinned ? '1' : '0'); }, [sidebarPinned]);

  const isElectron = navigator.userAgent.includes('Electron');
  const isDesktop = useIsDesktop();
  const isDesktopBrowser = !isElectron && isDesktop;

  // ── Common progression props ──────────────────────────────────────────────
  const progProps = {
    progression,
    onAddToProgression: (item: ChordInProgression) => pushHistory([...progression, item]),
    onRemoveFromProgression: (id: string) => pushHistory(progression.filter(c => c.id !== id)),
    onClearProgression: () => pushHistory([]),
    onReorderProgression: handleReorderProgression,
    onTransposeProgression: handleTransposeProgression,
    tuning, onTuningChange: setTuning,
    capo, onCapoChange: setCapo,
    canUndo: undoStack.length > 0, canRedo: redoStack.length > 0,
    onUndo: handleUndo, onRedo: handleRedo,
  };

  const sharedBanner = showSharedBanner && sharedProgression ? (
    <div style={{ background: T.secondaryBg, borderBottom: `1px solid ${T.secondary}`, padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', flexShrink: 0 }}>
      <span style={{ fontSize: 13, color: T.secondary, fontWeight: 600 }}>Shared progression — {sharedProgression.length} chords</span>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={handleLoadShared} style={{ padding: '5px 14px', borderRadius: 0, background: T.secondary, color: T.white, fontSize: 12, fontWeight: 400, cursor: 'pointer', borderLeft: '3px solid var(--gc-bar-color)' }}>Load</button>
        <button onClick={() => { setShowSharedBanner(false); history.replaceState(null, '', window.location.pathname); }} style={{ padding: '5px 10px', borderRadius: 0, border: `1px solid ${T.border}`, background: 'transparent', color: T.textMuted, fontSize: 12, cursor: 'pointer' }}>Dismiss</button>
      </div>
    </div>
  ) : null;

  // ══════════════════════════════════════════════════════════════════════════
  // Electron desktop layout (unchanged structure, updated labels)
  // ══════════════════════════════════════════════════════════════════════════
  if (isElectron) {
    const sidebarVisible = sidebarPinned || sidebarHovered;

    const elTabContent = (
      <>
        {elTab === 'theory' && (
          <ErrorBoundary label="Theory">
            <TheoryTab {...progProps} />
          </ErrorBoundary>
        )}
        {elTab === 'voicings' && (
          <ErrorBoundary label="Voicings">
            <VoicingsTab globalProgression={progression} tuning={tuning} />
          </ErrorBoundary>
        )}
        {elTab === 'tools' && (
          <ErrorBoundary label="Tools">
            <ToolsTab />
          </ErrorBoundary>
        )}
        {elTab === 'workspace' && (
          <ErrorBoundary label="Workspace">
            <WorkspacePanel
              onOpenTabInBuilder={(content) => { requestOpenTabInBuilder(content); setElTab('tools'); }}
              onOpenProgressionInBuilder={(chords) => { pushHistory(chords.map((c, i) => ({ ...c, id: `chord-loaded-${Date.now()}-${i}` }))); setElTab('theory'); }}
            />
          </ErrorBoundary>
        )}
      </>
    );

    return (
      <div style={{ display: 'flex', height: '100vh', position: 'relative', backgroundColor: T.bgDeep, color: T.text, fontFamily: 'var(--gc-font)', overflow: 'hidden' }}>

        {!sidebarPinned && (
          <div style={{ position: 'absolute', left: 0, top: 28, bottom: 0, width: 12, zIndex: 30 }} onMouseEnter={() => setSidebarHovered(true)} />
        )}

        <aside
          onMouseEnter={() => { if (!sidebarPinned) setSidebarHovered(true); }}
          onMouseLeave={() => { if (!sidebarPinned) setSidebarHovered(false); }}
          style={{
            width: 190, flexShrink: 0,
            backgroundColor: T.bgInput, borderRight: `1px solid ${T.border}`,
            display: 'flex', flexDirection: 'column', paddingTop: 28,
            ...(sidebarPinned ? {} : {
              position: 'absolute', left: 0, top: 0, bottom: 0, zIndex: 40,
              transform: sidebarVisible ? 'translateX(0)' : 'translateX(-190px)',
              transition: 'transform 0.22s ease, box-shadow 0.22s ease',
              boxShadow: sidebarVisible ? '4px 0 24px rgba(0,0,0,0.28)' : 'none',
            }),
          }}
        >
          <div style={{ padding: '16px 20px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="ScaleUp" style={{ width: 55, height: 55, borderRadius: 0, display: 'block', objectFit: 'cover' }} />
          </div>

          <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, padding: '0 10px' }}>
            {EL_TABS.map(tab => {
              const active = elTab === tab.id;
              return (
                <button key={tab.id} onClick={() => setElTab(tab.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 0,
                  background: active ? T.primary : 'transparent',
                  color: active ? T.white : T.textMuted,
                  fontWeight: 500, fontSize: 14, cursor: 'pointer', textAlign: 'left',
                  transition: 'background 0.15s, color 0.15s',
                  borderLeft: active ? '3px solid var(--gc-bar-color)' : 'none',
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = T.bgCard; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>

          <div style={{ padding: '12px 16px', borderTop: `1px solid ${T.border}`, display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center' }}>
            <button onClick={() => setDarkMode(d => !d)} style={{ width: 32, height: 32, borderRadius: 0, border: `1px solid ${T.border}`, background: 'transparent', color: T.textDim, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Toggle dark mode">
              {darkMode ? '☀' : '☾'}
            </button>
            {sidebarPinned
              ? <button onClick={() => setSidebarPinned(false)} title="Hide sidebar" style={{ width: 32, height: 32, borderRadius: 0, border: `1px solid ${T.border}`, background: 'transparent', color: T.textMuted, fontSize: 17, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
              : <button onClick={() => { setSidebarPinned(true); setSidebarHovered(false); }} title="Pin sidebar" style={{ width: 32, height: 32, borderRadius: 0, border: `1px solid ${T.border}`, background: 'transparent', color: T.textMuted, fontSize: 17, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
            }
          </div>
        </aside>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ backgroundColor: T.bgCard, borderBottom: `1px solid ${T.border}`, padding: '14px 24px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: T.text, letterSpacing: '-0.3px' }}>
              {EL_TABS.find(t => t.id === elTab)?.label ?? ''}
            </h1>
            <UserMenu onOpenWorkspace={() => setElTab('workspace')} />
          </div>

          {sharedBanner}

          <main style={{ flex: 1, overflowY: 'auto', padding: '24px', maxWidth: 800, width: '100%', boxSizing: 'border-box', margin: '0 auto' }}>
            {elTabContent}
          </main>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Desktop browser layout — DesktopShell
  // ══════════════════════════════════════════════════════════════════════════
  if (isDesktopBrowser) {
    return (
      <>
        {workspaceOpen && (
          <WorkspaceOverlay
            desktop
            onClose={() => setWorkspaceOpen(false)}
            onOpenTabInBuilder={handleOpenTab}
            onOpenProgressionInBuilder={(chords) => { handleOpenProgression(chords); setWorkspaceOpen(false); }}
          />
        )}
        <DesktopShell
          tab={pagerTab}
          onTabChange={handleTabChange}
          darkMode={darkMode}
          onToggleDark={() => setDarkMode(d => !d)}
          userMenu={<UserMenu onOpenWorkspace={() => setWorkspaceOpen(true)} />}
          sharedBanner={sharedBanner}
          onLogoClick={handleLogoClick}
        >
          {/* ── Panel 0: CHORDS ──────────────────────────────────────── */}
          {pagerTab === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              <Segment items={CHORDS_SEGS} active={chordsSegment} onChange={handleChordsSegChange} helpPrefix="chords" />
              <ErrorBoundary label="Chords">
                {chordsSegment === 'builder' && (
                  <ChordBuilderTab
                    desktop
                    progression={progression}
                    onAddToProgression={item => pushHistory([...progression, item])}
                    onRemoveFromProgression={id => pushHistory(progression.filter(c => c.id !== id))}
                    onClearProgression={() => pushHistory([])}
                    onReorderProgression={handleReorderProgression}
                    onTransposeProgression={handleTransposeProgression}
                    tuning={tuning} onTuningChange={setTuning}
                    capo={capo} onCapoChange={setCapo}
                    canUndo={undoStack.length > 0} canRedo={redoStack.length > 0}
                    onUndo={handleUndo} onRedo={handleRedo}
                  />
                )}
                {chordsSegment === 'finder' && (
                  <ChordPickerTab
                    desktop
                    onAddToProgression={item => pushHistory([...progression, item])}
                    progression={progression}
                    onRemoveFromProgression={id => pushHistory(progression.filter(c => c.id !== id))}
                    onClearProgression={() => pushHistory([])}
                    onReorderProgression={handleReorderProgression}
                    onTransposeProgression={handleTransposeProgression}
                    canUndo={undoStack.length > 0} canRedo={redoStack.length > 0}
                    onUndo={handleUndo} onRedo={handleRedo}
                    tuning={tuning} capo={capo}
                  />
                )}
                {chordsSegment === 'analyzer' && (
                  <ChordAnalyzerTab desktop progression={progression} />
                )}
                {chordsSegment === 'target' && (
                  <TargetNoteTab desktop tuning={tuning} capo={capo} />
                )}
              </ErrorBoundary>
            </div>
          )}

          {/* ── Panel 1: SCALES ──────────────────────────────────────── */}
          {pagerTab === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              <Segment items={SCALES_SEGS} active={scalesSegment} onChange={handleScalesSegChange} helpPrefix="scales" />
              <ErrorBoundary label="Scales">
                {scalesSegment === 'explorer'  && <ScaleExplorer desktop />}
                {scalesSegment === 'triads'    && <TriadsGenerator desktop globalProgression={progression} />}
                {scalesSegment === 'intervals' && <IntervalsTab desktop />}
                {scalesSegment === 'wheel'     && <WheelTab desktop tuning={tuning} onAddToProgression={item => pushHistory([...progression, item])} />}
              </ErrorBoundary>
            </div>
          )}

          {/* ── Panel 2: VOICINGS ────────────────────────────────────── */}
          {pagerTab === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              <Segment items={VOICINGS_SEGS} active={voicingsSegment} onChange={handleVoicingsSegChange} helpPrefix="voicings" />
              <ErrorBoundary label="Voicings">
                <VoicingsTab
                  desktop
                  globalProgression={progression}
                  tuning={tuning}
                  activeSub={voicingsSegment}
                  onSubChange={s => handleVoicingsSegChange(s)}
                />
              </ErrorBoundary>
            </div>
          )}

          {/* ── Panel 3: PRACTICE ────────────────────────────────────── */}
          {pagerTab === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              <Segment items={PRACTICE_SEGS} active={practiceSegment} onChange={handlePracticeSegChange} helpPrefix="practice" />
              <ErrorBoundary label="Practice">
                {(practiceSegment === 'tuner' || practiceSegment === 'metronome') && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, marginTop: 24 }}>
                    <div style={{ borderRight: `1px solid ${T.border}`, paddingRight: 40, paddingBottom: 24 }}>
                      <div style={{ maxWidth: 420, margin: '0 auto' }}><Tuner /></div>
                    </div>
                    <div style={{ paddingLeft: 40, paddingBottom: 24 }}>
                      <div style={{ maxWidth: 420, margin: '0 auto' }}><Metronome /></div>
                    </div>
                  </div>
                )}
                {practiceSegment === 'eartraining' && (
                  <div style={{ maxWidth: 680, margin: '0 auto', width: '100%' }}><EarTrainingTab desktop /></div>
                )}
              </ErrorBoundary>
            </div>
          )}

          {/* ── Panel 4: STUDIO ──────────────────────────────────────── */}
          {pagerTab === 4 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              <div style={{ maxWidth: 560 }}>
                <Segment items={STUDIO_SEGS} active={studioSegment} onChange={handleStudioSegChange} helpPrefix="studio" />
              </div>
              <ErrorBoundary label="Studio">
                {studioSegment === 'tabbuilder' && <TabBuilder desktop />}
                {studioSegment === 'audiotab'   && <AudioToTab desktop />}
              </ErrorBoundary>
            </div>
          )}

        </DesktopShell>
      </>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Mobile layout — SwipePager
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <>
      {workspaceOpen && (
        <WorkspaceOverlay
          onClose={() => setWorkspaceOpen(false)}
          onOpenTabInBuilder={handleOpenTab}
          onOpenProgressionInBuilder={(chords) => { handleOpenProgression(chords); setWorkspaceOpen(false); }}
        />
      )}

      <SwipePager
        tab={pagerTab}
        onTabChange={handleTabChange}
        tabTitles={PANEL_TITLES}
        darkMode={darkMode}
        onToggleDark={() => setDarkMode(d => !d)}
        userMenu={<UserMenu compact onOpenWorkspace={() => setWorkspaceOpen(true)} />}
        sharedBanner={sharedBanner}
        onLogoClick={handleLogoClick}
      >

        {/* ── Panel 0: CHORDS ─────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <Segment items={CHORDS_SEGS} active={chordsSegment} onChange={handleChordsSegChange} helpPrefix="chords" />
          <ErrorBoundary label="Chords">
            {chordsSegment === 'builder' && (
              <ChordBuilderTab
                progression={progression}
                onAddToProgression={item => pushHistory([...progression, item])}
                onRemoveFromProgression={id => pushHistory(progression.filter(c => c.id !== id))}
                onClearProgression={() => pushHistory([])}
                onReorderProgression={handleReorderProgression}
                onTransposeProgression={handleTransposeProgression}
                tuning={tuning} onTuningChange={setTuning}
                capo={capo} onCapoChange={setCapo}
                canUndo={undoStack.length > 0} canRedo={redoStack.length > 0}
                onUndo={handleUndo} onRedo={handleRedo}
              />
            )}
            {chordsSegment === 'finder' && (
              <ChordPickerTab
                onAddToProgression={item => pushHistory([...progression, item])}
                progression={progression}
                onRemoveFromProgression={id => pushHistory(progression.filter(c => c.id !== id))}
                onClearProgression={() => pushHistory([])}
                onReorderProgression={handleReorderProgression}
                onTransposeProgression={handleTransposeProgression}
                canUndo={undoStack.length > 0} canRedo={redoStack.length > 0}
                onUndo={handleUndo} onRedo={handleRedo}
                tuning={tuning} capo={capo}
              />
            )}
            {chordsSegment === 'analyzer' && <ChordAnalyzerTab progression={progression} />}
            {chordsSegment === 'target'   && <TargetNoteTab tuning={tuning} capo={capo} />}
          </ErrorBoundary>
        </div>

        {/* ── Panel 1: SCALES ─────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <Segment items={SCALES_SEGS} active={scalesSegment} onChange={handleScalesSegChange} helpPrefix="scales" />
          <ErrorBoundary label="Scales">
            {scalesSegment === 'explorer'  && <ScaleExplorer />}
            {scalesSegment === 'triads'    && <TriadsGenerator globalProgression={progression} />}
            {scalesSegment === 'intervals' && <IntervalsTab />}
            {scalesSegment === 'wheel'     && <WheelTab tuning={tuning} onAddToProgression={item => pushHistory([...progression, item])} />}
          </ErrorBoundary>
        </div>

        {/* ── Panel 2: VOICINGS ───────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <Segment items={VOICINGS_SEGS} active={voicingsSegment} onChange={handleVoicingsSegChange} helpPrefix="voicings" />
          <ErrorBoundary label="Voicings">
            <VoicingsTab
              globalProgression={progression}
              tuning={tuning}
              activeSub={voicingsSegment}
              onSubChange={s => handleVoicingsSegChange(s)}
            />
          </ErrorBoundary>
        </div>

        {/* ── Panel 3: PRACTICE ───────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <Segment items={PRACTICE_SEGS} active={practiceSegment} onChange={handlePracticeSegChange} helpPrefix="practice" />
          <ErrorBoundary label="Practice">
            {practiceSegment === 'tuner'       && <Tuner />}
            {practiceSegment === 'metronome'   && <Metronome />}
            {practiceSegment === 'eartraining' && <EarTrainingTab />}
          </ErrorBoundary>
        </div>

        {/* ── Panel 4: STUDIO ─────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <Segment items={STUDIO_SEGS} active={studioSegment} onChange={handleStudioSegChange} helpPrefix="studio" />
          <ErrorBoundary label="Studio">
            {studioSegment === 'tabbuilder' && <TabBuilder />}
            {studioSegment === 'audiotab'   && <AudioToTab />}
          </ErrorBoundary>
        </div>

      </SwipePager>
    </>
  );
}
