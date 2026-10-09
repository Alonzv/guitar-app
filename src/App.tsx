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
import { subscribeNavigate } from './services/navigate';
import { flyToDock } from './motion';
import { formatChordName } from './utils/chordIdentifier';
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
import { CommandPalette, type PaletteAction } from './components/CommandPalette';
import { ToolsMap }          from './components/ToolsMap';
import { useLang }           from './contexts/LanguageContext';
import { soundEnabled, setSoundEnabled } from './utils/previewSound';

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
import { PANEL_TITLES } from './constants/panels';

// ── Types & constants ──────────────────────────────────────────────────────
// 'analyzer' retired from the tab bar. ChordAnalyzerTab.tsx and its
// 'chords:analyzer' help entry are kept on disk (currently unreferenced) so the
// sub-tab can be restored by re-adding the id, the CHORDS_SEGS entry, the
// import and the two render lines.
type ChordsSub    = 'builder' | 'finder' | 'target' | 'extensions' | 'practice';
type ScalesSub    = 'explorer' | 'triads' | 'wheel' | 'practice';
// Target moved to CHORDS: it finds chords around a note, which is a chord
// question, not a voicing one.
type VoicingsSub  = 'voiceleading' | 'harmonizer' | 'reharmonize';
// TOOLS holds the four non-theory tools. Tab Builder and Audio→Tab used to sit
// in a STUDIO tab of their own; they moved here because what they share with
// the tuner and the metronome is exactly what separates them from every other
// tab — none of them teach anything, they are workbench.
type ToolsSub     = 'tuner' | 'metronome' | 'tabbuilder' | 'audiotab';



const CHORDS_SEGS    = [
  { id: 'finder',     label: 'By Name'    },
  { id: 'builder',    label: 'By Ear'     },
  { id: 'target',     label: 'Target'     },
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
];
const TOOLS_SEGS     = [
  { id: 'tuner',      label: 'Tuner'       },
  { id: 'metronome',  label: 'Metronome'   },
  { id: 'tabbuilder', label: 'Tab Builder' },
  { id: 'audiotab',   label: 'Audio→Tab'   },
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

  // The ref moves with every push (not just on render), so several edits in
  // one handler — a whole template progression added chord by chord — each
  // build on the one before instead of all starting from the same snapshot.
  const pushHistory = useCallback((next: ChordInProgression[]) => {
    const prev = progressionRef.current;
    progressionRef.current = next;
    setUndoStack(s => [...s.slice(-49), prev]);
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
  // Every "add" path lands here, so the chord's flight from the button that was
  // pressed into the session bar happens once for the whole app.
  const handleAddToProgression = (item: ChordInProgression) => {
    pushHistory([...progressionRef.current, item]);
    flyToDock(formatChordName(item.chord.name));
  };

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
  // Clamped: a browser that stored tab 5 back when STUDIO existed would
  // otherwise restore to a panel that is no longer there.
  const [pagerTab, setPagerTab]             = useState(() => {
    const t = parseInt(readLS('scaleup_pager_tab', '0'), 10) || 0;
    return Math.min(Math.max(t, 0), PANEL_TITLES.length - 1);
  });
  // Always land on "By Name" when the app opens (not the last-used chords tab).
  const [chordsSegment, setChordsSegment]   = useState<ChordsSub>('finder');
  const [scalesSegment, setScalesSegment]   = useState<ScalesSub>(() => {
    const v = readLS('scaleup_seg_scales', 'explorer');   // 'intervals' moved to its own top tab
    return (v === 'intervals' ? 'explorer' : v) as ScalesSub;
  });
  const [voicingsSegment, setVoicingsSegment] = useState<VoicingsSub>(() => {
    const v = readLS('scaleup_seg_voicings', 'voiceleading');   // 'paths' folded into VL Studio
    return (v === 'voiceleading' || v === 'harmonizer' || v === 'reharmonize') ? v as VoicingsSub : 'voiceleading';
  });
  const [toolsSegment, setToolsSegment] = useState<ToolsSub>(() => {
    // 'eartraining' → Intervals, 'scaletrainer' → Scales, both long gone.
    const v = readLS('scaleup_seg_tools', readLS('scaleup_seg_practice', 'tuner'));
    return TOOLS_SEGS.some(s => s.id === v) ? v as ToolsSub : 'tuner';
  });

  const [intervalsSegment, setIntervalsSegment] = useState<string>(() => {
    const v = readLS('scaleup_seg_intervals', 'explore');
    // 'identify' promised a quiz and delivered a ruler; it is now 'measure'.
    if (v === 'identify') return 'measure';
    return ['explore', 'measure', 'inchord', 'practice'].includes(v) ? v : 'explore';
  });
  const handleIntervalsSegChange = (s: string) => { setIntervalsSegment(s); writeLS('scaleup_seg_intervals', s); };

  const handleTabChange = (t: number) => { setPagerTab(t); writeLS('scaleup_pager_tab', String(t)); };
  const handleChordsSegChange   = (s: string) => { setChordsSegment(s as ChordsSub);   writeLS('scaleup_seg_chords',   s); };
  // ── Finding a tool: the tools map (logo) and the command palette (⌘K) ────
  // The map opens by itself on a first visit so a newcomer sees every tool.
  const [mapOpen, setMapOpen] = useState(() => readLS('scaleup_seen_map', '0') !== '1');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const closeMap = useCallback(() => { setMapOpen(false); writeLS('scaleup_seen_map', '1'); }, []);
  const handleLogoClick = () => setMapOpen(true);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen(o => !o); }
      else if (e.key === '/' && !typing) { e.preventDefault(); setPaletteOpen(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const handleScalesSegChange   = (s: string) => { setScalesSegment(s as ScalesSub);   writeLS('scaleup_seg_scales',   s); };
  const handleVoicingsSegChange = (s: string) => { setVoicingsSegment(s as VoicingsSub); writeLS('scaleup_seg_voicings', s); };
  const handleToolsSegChange    = (s: string) => { setToolsSegment(s as ToolsSub);     writeLS('scaleup_seg_tools',    s); };

  // ── Handoff: Workspace "Open in Builder" → TOOLS/Tab Builder ──────────────
  useEffect(() => subscribeHandoff(() => {
    setWorkspaceOpen(false);
    setPagerTab(4);
    setToolsSegment('tabbuilder');
    writeLS('scaleup_pager_tab', '4');
    writeLS('scaleup_seg_tools', 'tabbuilder');
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

  // ── "See also" jumps between the key-related tools ─────────────────────────
  useEffect(() => subscribeNavigate(({ tab, sub }) => {
    setWorkspaceOpen(false);
    setPagerTab(tab); writeLS('scaleup_pager_tab', String(tab));
    if (tab === 0) handleChordsSegChange(sub);
    else if (tab === 1) handleScalesSegChange(sub);
    else if (tab === 2) handleIntervalsSegChange(sub);
    else if (tab === 3) handleVoicingsSegChange(sub);
    else if (tab === 4) handleToolsSegChange(sub);
  }), []);   // eslint-disable-line react-hooks/exhaustive-deps

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
    setPagerTab(4);
    setToolsSegment('tabbuilder');
    writeLS('scaleup_pager_tab', '4');
    writeLS('scaleup_seg_tools', 'tabbuilder');
  };

  const isDesktopBrowser = useIsDesktop();

  const currentToolId = `${PANEL_TITLES[pagerTab].toLowerCase()}:${
    [chordsSegment, scalesSegment, intervalsSegment, voicingsSegment, toolsSegment][pagerTab]}`;

  const { lang, setLang } = useLang();
  const he = lang === 'he';
  const paletteActions: PaletteAction[] = [
    { id: 'map',   label: he ? 'כל הכלים (מפה)' : 'All tools (map)', hint: he ? 'לוגו' : 'logo', run: () => setMapOpen(true) },
    { id: 'dark',  label: darkMode ? (he ? 'מצב בהיר' : 'Light mode') : (he ? 'מצב כהה' : 'Dark mode'), run: () => setDarkMode(d => !d) },
    { id: 'sound', label: soundEnabled() ? (he ? 'השתקת צלילי לחיצה' : 'Mute tap sounds') : (he ? 'הפעלת צלילי לחיצה' : 'Turn tap sounds on'), run: () => setSoundEnabled(!soundEnabled()) },
    { id: 'lang',  label: he ? 'English' : 'עברית', run: () => setLang(he ? 'en' : 'he') },
    { id: 'ws',    label: he ? 'האזור האישי' : 'My workspace', run: () => setWorkspaceOpen(true) },
  ];

  const finders = (
    <>
      <ToolsMap open={mapOpen} onClose={closeMap} currentId={currentToolId}
        onSearch={() => { closeMap(); setPaletteOpen(true); }} desktop={isDesktopBrowser} />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)}
        currentId={currentToolId} actions={paletteActions} />
    </>
  );

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
        {finders}
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
          onSearch={() => setPaletteOpen(true)}
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
                    onAddToProgression={handleAddToProgression}
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
                    onAddToProgression={handleAddToProgression}
                    progression={progression}
                    onRemoveFromProgression={id => pushHistory(progression.filter(c => c.id !== id))}
                    onClearProgression={() => pushHistory([])}
                    onReorderProgression={handleReorderProgression}
                    onTransposeProgression={handleTransposeProgression}
                    canUndo={undoStack.length > 0} canRedo={redoStack.length > 0}
                    onUndo={handleUndo} onRedo={handleRedo}
                    tuning={tuning} onTuningChange={setTuning} capo={capo}
                  />
                )}
                {chordsSegment === 'target' && <TargetNoteTab desktop tuning={tuning} capo={capo} />}
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
                {scalesSegment === 'wheel'     && <ChordWheel desktop onAddToProgression={handleAddToProgression} />}
                {scalesSegment === 'practice'  && <ScalesPracticeTab desktop />}
              </ErrorBoundary>
            </div>
          )}

          {/* ── Panel 2: INTERVALS ───────────────────────────────────── */}
          {pagerTab === 2 && (
            <ErrorBoundary label="Intervals">
              <IntervalsTab desktop sub={intervalsSegment} onSubChange={handleIntervalsSegChange} />
            </ErrorBoundary>
          )}

          {/* ── Panel 3: VOICINGS ────────────────────────────────────── */}
          {pagerTab === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              <Segment items={VOICINGS_SEGS} active={voicingsSegment} onChange={handleVoicingsSegChange} helpPrefix="voicings" />
              <ErrorBoundary label="Voicings">
                {voicingsSegment === 'voiceleading'
                  ? <VoiceLeadingStudio desktop globalProgression={progression} tuning={tuning} onChordsChange={handleChordNamesChange} />
                  : <VoicingsTab
                      desktop
                      globalProgression={progression}
                      onChordsChange={handleChordNamesChange}
                      tuning={tuning}
                      activeSub={voicingsSegment}
                    />}
              </ErrorBoundary>
            </div>
          )}

          {/* ── Panel 4: TOOLS ───────────────────────────────────────── */}
          {pagerTab === 4 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              <Segment items={TOOLS_SEGS} active={toolsSegment} onChange={handleToolsSegChange} helpPrefix="tools" />
              <ErrorBoundary label="Tools">
                {/* Tuner and metronome are narrow instruments; they read better
                    centred in a single column than stretched across the shell. */}
                {toolsSegment === 'tuner' && (
                  <div style={{ maxWidth: 420, margin: '24px auto 24px', width: '100%' }}><Tuner /></div>
                )}
                {toolsSegment === 'metronome' && (
                  <div style={{ maxWidth: 420, margin: '24px auto 24px', width: '100%' }}><Metronome /></div>
                )}
                {toolsSegment === 'tabbuilder' && <TabBuilder desktop />}
                {toolsSegment === 'audiotab'   && <AudioToTab desktop />}
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
      {finders}
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
        onSearch={() => setPaletteOpen(true)}
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
                onAddToProgression={handleAddToProgression}
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
                onAddToProgression={handleAddToProgression}
                progression={progression}
                onRemoveFromProgression={id => pushHistory(progression.filter(c => c.id !== id))}
                onClearProgression={() => pushHistory([])}
                onReorderProgression={handleReorderProgression}
                onTransposeProgression={handleTransposeProgression}
                canUndo={undoStack.length > 0} canRedo={redoStack.length > 0}
                onUndo={handleUndo} onRedo={handleRedo}
                tuning={tuning} onTuningChange={setTuning} capo={capo}
              />
            )}
            {chordsSegment === 'target' && <TargetNoteTab tuning={tuning} capo={capo} />}
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
            {scalesSegment === 'wheel'     && <ChordWheel onAddToProgression={handleAddToProgression} />}
            {scalesSegment === 'practice'  && <ScalesPracticeTab />}
          </ErrorBoundary>
        </div>

        {/* ── Panel 2: INTERVALS ──────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <ErrorBoundary label="Intervals">
            <IntervalsTab sub={intervalsSegment} onSubChange={handleIntervalsSegChange} />
          </ErrorBoundary>
        </div>

        {/* ── Panel 3: VOICINGS ───────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <Segment items={VOICINGS_SEGS} active={voicingsSegment} onChange={handleVoicingsSegChange} helpPrefix="voicings" />
          <ErrorBoundary label="Voicings">
            {voicingsSegment === 'voiceleading'
              ? <VoiceLeadingStudio globalProgression={progression} tuning={tuning} onChordsChange={handleChordNamesChange} />
              : <VoicingsTab
                  globalProgression={progression}
                  onChordsChange={handleChordNamesChange}
                  tuning={tuning}
                  activeSub={voicingsSegment}
                />}
          </ErrorBoundary>
        </div>

        {/* ── Panel 4: TOOLS ──────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <Segment items={TOOLS_SEGS} active={toolsSegment} onChange={handleToolsSegChange} helpPrefix="tools" />
          <ErrorBoundary label="Tools">
            {toolsSegment === 'tuner'      && <Tuner />}
            {toolsSegment === 'metronome'  && <Metronome />}
            {toolsSegment === 'tabbuilder' && <TabBuilder />}
            {toolsSegment === 'audiotab'   && <AudioToTab />}
          </ErrorBoundary>
        </div>

      </SwipePager>
    </>
  );
}
