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
import { TargetNoteTab }     from './components/Chords/TargetNoteTab';
import { ChordsPracticeTab } from './components/ChordPractice/ChordsPracticeTab';
import { SessionBar } from './components/SessionBar';
import { namesToProgression } from './utils/progressionBridge';
import { DiatonicExtensions } from './components/Chords/DiatonicExtensions';

import { ScaleExplorer }     from './components/ScalePanel/ScaleExplorer';
import { TriadsGenerator }   from './components/Triads/TriadsGenerator';
import { IntervalsTab }      from './components/Intervals/IntervalsTab';
import { ChordWheel }        from './components/ScalePanel/ChordWheel';

import { VoicingsTab }       from './components/Voicings/VoicingsTab';
import { VoiceLeadingStudio } from './components/Voicings/VoiceLeadingStudio';

import { Tuner }             from './components/Tools/Tuner';
import { Metronome }         from './components/Tools/Metronome';
import { ScalesPracticeTab } from './components/ScalePractice/ScalesPracticeTab';

import { TabBuilder }        from './components/Tools/TabBuilder';
import { AudioToTab }        from './components/Tools/AudioToTab';
import { WorkspaceOverlay }  from './components/Workspace/WorkspaceOverlay';

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
// 'analyzer' retired from the tab bar. ChordAnalyzerTab.tsx and its
// 'chords:analyzer' help entry are kept on disk (currently unreferenced) so the
// sub-tab can be restored by re-adding the id, the CHORDS_SEGS entry, the
// import and the two render lines.
type ChordsSub    = 'builder' | 'finder' | 'extensions' | 'practice';
type ScalesSub    = 'explorer' | 'triads' | 'wheel' | 'practice';
type VoicingsSub  = 'voiceleading' | 'harmonizer' | 'reharmonize' | 'target';
type PracticeSub  = 'tuner' | 'metronome';
type StudioSub    = 'tabbuilder' | 'audiotab';

const PANEL_TITLES = ['CHORDS', 'SCALES', 'INTERVALS', 'VOICINGS', 'PRACTICE', 'STUDIO'];

const CHORDS_SEGS    = [
  { id: 'finder',     label: 'By Name'    },
  { id: 'builder',    label: 'By Ear'     },
  { id: 'extensions', label: 'Extensions' },
  { id: 'practice',   label: 'Practice'   },
];
const SCALES_SEGS    = [
  { id: 'explorer',  label: 'Explorer' },
  { id: 'triads',    label: 'Triads'   },
  { id: 'wheel',     label: 'Wheel'    },
  { id: 'practice',  label: 'Practice' },
];
const VOICINGS_SEGS  = [
  { id: 'voiceleading', label: 'VL Studio' },
  { id: 'harmonizer',   label: 'Harmonize' },
  { id: 'reharmonize',  label: 'Reharm'    },
  { id: 'target',       label: 'Target'    },
];
const PRACTICE_SEGS  = [
  { id: 'tuner',        label: 'Tuner'     },
  { id: 'metronome',    label: 'Metronome' },
];
const STUDIO_SEGS    = [
  { id: 'tabbuilder', label: 'Tab Builder' },
  { id: 'audiotab',   label: 'Audio→Tab'  },
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
  const [scalesSegment, setScalesSegment]   = useState<ScalesSub>(() => {
    const v = readLS('scaleup_seg_scales', 'explorer');   // 'intervals' moved to its own top tab
    return (v === 'intervals' ? 'explorer' : v) as ScalesSub;
  });
  const [voicingsSegment, setVoicingsSegment] = useState<VoicingsSub>(() => {
    const v = readLS('scaleup_seg_voicings', 'voiceleading');   // 'paths' folded into VL Studio
    return (v === 'voiceleading' || v === 'harmonizer' || v === 'reharmonize' || v === 'target') ? v as VoicingsSub : 'voiceleading';
  });
  const [practiceSegment, setPracticeSegment] = useState<PracticeSub>(() => {
    const v = readLS('scaleup_seg_practice', 'tuner');    // 'eartraining' → Intervals, 'scaletrainer' → Scales
    return (v === 'tuner' || v === 'metronome') ? v as PracticeSub : 'tuner';
  });
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
    setPagerTab(5);
    setStudioSegment('tabbuilder');
    writeLS('scaleup_pager_tab', '5');
    writeLS('scaleup_seg_studio', 'tabbuilder');
  }), []);

  // ── Handoff: Library "Open in Harmonizer" → VOICINGS/Harmonize ────────────
  useEffect(() => subscribeHarmonizationHandoff(() => {
    setWorkspaceOpen(false);
    setPagerTab(3);
    setVoicingsSegment('harmonizer');
    writeLS('scaleup_pager_tab', '3');
    writeLS('scaleup_seg_voicings', 'harmonizer');
  }), []);

  // ── Handoff: Library "Open in Reharm" → VOICINGS/Reharm ──────────────────
  useEffect(() => subscribeVoicingsHandoff(() => {
    setWorkspaceOpen(false);
    setPagerTab(3);
    setVoicingsSegment('reharmonize');
    writeLS('scaleup_pager_tab', '3');
    writeLS('scaleup_seg_voicings', 'reharmonize');
  }), []);

  // ── Session sync ───────────────────────────────────────────────────────────
  // A voicing tool edited the chord list. Convert back to progression entries
  // (reusing existing ones so shapes/ids survive) and push through the same
  // history as any other edit, so undo/redo works across the whole app.
  const handleChordNamesChange = useCallback((names: string[]) => {
    pushHistory(namesToProgression(names, tuning.notes, progressionRef.current));
  }, [pushHistory, tuning]);

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
    setPagerTab(5);
    setStudioSegment('tabbuilder');
    writeLS('scaleup_pager_tab', '5');
    writeLS('scaleup_seg_studio', 'tabbuilder');
  };

  const isDesktopBrowser = useIsDesktop();

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
          <SessionBar progression={progression} tuning={tuning} capo={capo} />

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
                {chordsSegment === 'extensions' && <DiatonicExtensions desktop />}
                {chordsSegment === 'practice' && <ChordsPracticeTab desktop />}
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
                {scalesSegment === 'wheel'     && <ChordWheel desktop onAddToProgression={item => pushHistory([...progression, item])} />}
                {scalesSegment === 'practice'  && <ScalesPracticeTab desktop />}
              </ErrorBoundary>
            </div>
          )}

          {/* ── Panel 2: INTERVALS ───────────────────────────────────── */}
          {pagerTab === 2 && (
            <ErrorBoundary label="Intervals">
              <IntervalsTab desktop />
            </ErrorBoundary>
          )}

          {/* ── Panel 3: VOICINGS ────────────────────────────────────── */}
          {pagerTab === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              <Segment items={VOICINGS_SEGS} active={voicingsSegment} onChange={handleVoicingsSegChange} helpPrefix="voicings" />
              <ErrorBoundary label="Voicings">
                {voicingsSegment === 'voiceleading'
                  ? <VoiceLeadingStudio desktop globalProgression={progression} tuning={tuning} onChordsChange={handleChordNamesChange} />
                  : voicingsSegment === 'target'
                  ? <TargetNoteTab desktop tuning={tuning} capo={capo} />
                  : <VoicingsTab
                      desktop
                      globalProgression={progression}
                      tuning={tuning}
                      activeSub={voicingsSegment}
                      onSubChange={s => handleVoicingsSegChange(s)}
                    />}
              </ErrorBoundary>
            </div>
          )}

          {/* ── Panel 4: PRACTICE ────────────────────────────────────── */}
          {pagerTab === 4 && (
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
              </ErrorBoundary>
            </div>
          )}

          {/* ── Panel 5: STUDIO ──────────────────────────────────────── */}
          {pagerTab === 5 && (
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
        sessionBar={<SessionBar progression={progression} tuning={tuning} capo={capo} />}
        onLogoClick={handleLogoClick}
      >

        {/* Session bar is rendered inside each panel on mobile via the pager,
            so it is placed once here at the top of the panel stack. */}
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
            {chordsSegment === 'extensions' && <DiatonicExtensions />}
            {chordsSegment === 'practice' && <ChordsPracticeTab />}
          </ErrorBoundary>
        </div>

        {/* ── Panel 1: SCALES ─────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <Segment items={SCALES_SEGS} active={scalesSegment} onChange={handleScalesSegChange} helpPrefix="scales" />
          <ErrorBoundary label="Scales">
            {scalesSegment === 'explorer'  && <ScaleExplorer />}
            {scalesSegment === 'triads'    && <TriadsGenerator globalProgression={progression} />}
            {scalesSegment === 'wheel'     && <ChordWheel onAddToProgression={item => pushHistory([...progression, item])} />}
            {scalesSegment === 'practice'  && <ScalesPracticeTab />}
          </ErrorBoundary>
        </div>

        {/* ── Panel 2: INTERVALS ──────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <ErrorBoundary label="Intervals">
            <IntervalsTab />
          </ErrorBoundary>
        </div>

        {/* ── Panel 3: VOICINGS ───────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <Segment items={VOICINGS_SEGS} active={voicingsSegment} onChange={handleVoicingsSegChange} helpPrefix="voicings" />
          <ErrorBoundary label="Voicings">
            {voicingsSegment === 'voiceleading'
              ? <VoiceLeadingStudio globalProgression={progression} tuning={tuning} onChordsChange={handleChordNamesChange} />
              : voicingsSegment === 'target'
              ? <TargetNoteTab tuning={tuning} capo={capo} />
              : <VoicingsTab
                  globalProgression={progression}
                  tuning={tuning}
                  activeSub={voicingsSegment}
                  onSubChange={s => handleVoicingsSegChange(s)}
                />}
          </ErrorBoundary>
        </div>

        {/* ── Panel 4: PRACTICE ───────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <Segment items={PRACTICE_SEGS} active={practiceSegment} onChange={handlePracticeSegChange} helpPrefix="practice" />
          <ErrorBoundary label="Practice">
            {practiceSegment === 'tuner'        && <Tuner />}
            {practiceSegment === 'metronome'    && <Metronome />}
          </ErrorBoundary>
        </div>

        {/* ── Panel 5: STUDIO ─────────────────────────────────────────────── */}
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
