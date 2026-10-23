import { useState, useEffect, useCallback, type ReactNode } from 'react';
import type { ChordInProgression, Tuning } from './types/music';
import { CHROMATIC } from './utils/musicTheory';

// ── Stop components ────────────────────────────────────────────────────────
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
import { SongDock } from './components/Song/SongDock';
import { SongMap } from './components/Song/SongMap';
import { useSongSync } from './song/useSongSync';
import { useAuth } from './contexts/AuthContext';
import { subscribeNavigate } from './services/navigate';
import { flyToDock } from './motion';
import { useSongState, SongProvider } from './song/SongContext';
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
import { WorkspacePanel }    from './components/Workspace/WorkspacePanel';
import { useLang }           from './contexts/LanguageContext';

// ── Shell ──────────────────────────────────────────────────────────────────
import { TransitShell }        from './components/Transit/TransitShell';
import { UserMenu }            from './components/Auth/UserMenu';
import { ErrorBoundary }       from './components/ErrorBoundary';
import { DEFAULT_STOP, stopById } from './data/tools';

// ── Hooks ──────────────────────────────────────────────────────────────────
import { useIsDesktop }        from './hooks/useIsDesktop';

// ── Services ───────────────────────────────────────────────────────────────
import { subscribeHandoff, requestOpenTabInBuilder, subscribeHarmonizationHandoff, subscribeVoicingsHandoff } from './services/handoff';
import type { TabContent } from './services/types';
import { T, btn } from './theme';

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
  try { localStorage.setItem(key, val); } catch { /* storage unavailable */ }
}

const LAST_STOP_KEY = 'scaleup_last_stop';
const INTERVAL_VIEWS = ['explore', 'measure', 'inchord'];
// Stops whose tool draws its own poster title (the chord name, the scale, the
// tuner's note, the tempo, the song title) — the shell skips the stop name.
const OWN_POSTER = new Set(['chord-builder', 'scales', 'tuner', 'metronome', 'tab-writer']);

// ════════════════════════════════════════════════════════════════════════════
export default function App() {
  // ── Dark mode ─────────────────────────────────────────────────────────────
  const [darkMode, setDarkMode] = useState(() => readLS('scaleup_dark', '0') === '1');
  useEffect(() => {
    document.body.classList.toggle('dark', darkMode);
    writeLS('scaleup_dark', darkMode ? '1' : '0');
  }, [darkMode]);

  // ── The song ──────────────────────────────────────────────────────────────
  // Every tool works on one song (song/SongContext): its chords, key, tempo,
  // tuning, capo and melody, with one undo history across all of it. The
  // names below keep the shapes the panels were written against.
  const songApi = useSongState();
  const progression = songApi.progression;
  const pushHistory = songApi.setProgression;
  const handleUndo = songApi.undo;
  const handleRedo = songApi.redo;
  const tuning = songApi.tuning;
  const capo = songApi.song.capo;
  const setTuning = (t: Tuning) => songApi.update({ tuningName: t.name });
  const setCapo = (c: number) => songApi.update({ capo: c });
  const { user } = useAuth();
  const songSync = useSongSync(songApi.song, user?.id ?? null);
  const [songMapOpen, setSongMapOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA)$/.test(e.target.tagName));
      if (typing) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo(); }
      if ((e.ctrlKey || e.metaKey) && ((e.shiftKey && e.key.toLowerCase() === 'z') || e.key === 'y')) { e.preventDefault(); handleRedo(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleUndo, handleRedo]);

  const isDesktop = useIsDesktop();

  // ── Where we are: a stop on the network map ──────────────────────────────
  // Mobile opens on the map ('home'); desktop always shows a stop, the last
  // one used. The last stop is remembered for the Next-stop pill.
  const [lastStop, setLastStop] = useState(() => {
    const v = readLS(LAST_STOP_KEY, DEFAULT_STOP);
    return stopById(v) ? v : DEFAULT_STOP;
  });
  const [stop, setStop] = useState<string>('home');
  const shown = stop === 'home' && isDesktop ? lastStop : stop;

  // Each stop with views keeps its own. The chord builder always opens on
  // "By name"; Intervals remembers its view.
  const [chordView, setChordView] = useState('name');
  const [intervalView, setIntervalView] = useState(() => {
    const v = readLS('scaleup_seg_intervals', 'explore');
    // 'identify' promised a quiz and delivered a ruler; it is now 'measure'.
    if (v === 'identify') return 'measure';
    return INTERVAL_VIEWS.includes(v) ? v : 'explore';
  });
  const subOf = (id: string) => id === 'chord-builder' ? chordView : id === 'intervals' ? intervalView : undefined;
  const setSub = (id: string, s: string) => {
    if (id === 'chord-builder') setChordView(s);
    if (id === 'intervals' && INTERVAL_VIEWS.includes(s)) { setIntervalView(s); writeLS('scaleup_seg_intervals', s); }
  };

  // On mobile a stop is a page: the phone's back button returns to the map.
  const go = useCallback((id: string, sub?: string) => {
    if (id === 'home') { setStop('home'); return; }
    if (!stopById(id)) return;
    if (sub) setSub(id, sub);
    setStop(id);
    setLastStop(id);
    writeLS(LAST_STOP_KEY, id);
    if (!isDesktop && history.state?.suStop == null) history.pushState({ suStop: id }, '');
    window.scrollTo(0, 0);
  }, [isDesktop]);
  const goHome = () => {
    if (history.state?.suStop != null) history.back();
    else setStop('home');
  };
  useEffect(() => {
    const onPop = () => { if (history.state?.suStop == null) setStop('home'); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // ── Shared progression banner ─────────────────────────────────────────────
  const [sharedProgression] = useState<ChordInProgression[] | null>(decodeSharedProgression);
  const [showSharedBanner, setShowSharedBanner] = useState(() => !!decodeSharedProgression());
  const dismissShared = () => { setShowSharedBanner(false); history.replaceState(history.state, '', window.location.pathname); };
  const handleLoadShared = () => {
    if (sharedProgression) { pushHistory(sharedProgression); go('chord-builder', 'ear'); }
    dismissShared();
  };

  // ── Progression handlers ───────────────────────────────────────────────────
  // Every "add" path lands here, so the chord's flight from the button that was
  // pressed into the song dock happens once for the whole app.
  const handleAddToProgression = (item: ChordInProgression) => {
    pushHistory([...songApi.section.progression, item]);
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

  // Transposing renames the chords and finds shapes for the new names — the
  // old shapes belonged to the old chords.
  const handleTransposeProgression = (semitones: number) => {
    songApi.setChordNames(progression.map(item => transposeChordName(item.chord.name, semitones)));
  };

  // A voicing tool edited the chord list by name; the song keeps the shapes of
  // chords it already had and finds shapes for new ones.
  const handleChordNamesChange = songApi.setChordNames;

  // ── Handoffs from the Library and the song map land on their stop ─────────
  useEffect(() => subscribeHandoff(() => go('tab-writer')), [go]);
  useEffect(() => subscribeHarmonizationHandoff(() => go('harmonize')), [go]);
  useEffect(() => subscribeVoicingsHandoff(() => go('reharmonize')), [go]);
  useEffect(() => subscribeNavigate(({ stop: id, sub }) => go(id, sub)), [go]);

  const handleOpenProgression = (chords: ChordInProgression[]) => {
    pushHistory(chords.map((c, i) => ({ ...c, id: `chord-loaded-${Date.now()}-${i}` })));
    go('chord-builder', 'ear');
  };
  const handleOpenTab = (content: TabContent) => {
    requestOpenTabInBuilder(content);
    go('tab-writer');
  };

  const { lang } = useLang();
  const he = lang === 'he';

  const sharedBanner = showSharedBanner && sharedProgression ? (
    <div style={{ borderBottom: `var(--su-rule) solid ${T.border}`, padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', flexShrink: 0, background: T.bgDeep }}>
      <span style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
        {he ? `מהלך ששותף · ${sharedProgression.length} אקורדים` : `Shared progression · ${sharedProgression.length} chords`}
      </span>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={handleLoadShared} className="gc-no-bar" style={{ ...btn.cta(false), minHeight: 36 }}>{he ? 'טעינה' : 'Load'}</button>
        <button onClick={dismissShared} className="gc-no-bar" style={{ ...btn.secondary(), minHeight: 36 }}>{he ? 'סגירה' : 'Dismiss'}</button>
      </div>
    </div>
  ) : null;

  // ── The stop itself ────────────────────────────────────────────────────────
  const d = isDesktop || undefined;
  const removeChord = (id: string) => pushHistory(progression.filter(c => c.id !== id));
  const progressionProps = {
    progression, onAddToProgression: handleAddToProgression, onRemoveFromProgression: removeChord,
    onClearProgression: () => pushHistory([]), onReorderProgression: handleReorderProgression,
    onTransposeProgression: handleTransposeProgression,
    canUndo: songApi.canUndo, canRedo: songApi.canRedo, onUndo: handleUndo, onRedo: handleRedo,
    tuning, onTuningChange: setTuning, capo,
  };
  const renderStop = (id: string): ReactNode => {
    switch (id) {
      case 'chord-builder': return chordView === 'ear'
        ? <ChordBuilderTab desktop={d} {...progressionProps} onCapoChange={setCapo} />
        : <ChordPickerTab desktop={d} {...progressionProps} />;
      case 'triads':        return <TriadsGenerator desktop={d} globalProgression={progression} />;
      case 'target-note':   return <TargetNoteTab desktop={d} tuning={tuning} capo={capo} onAddToProgression={handleAddToProgression} />;
      case 'voice-leading': return <VoiceLeadingStudio desktop={d} globalProgression={progression} tuning={tuning} onChordsChange={handleChordNamesChange} />;
      case 'harmonize':
      case 'reharmonize':   return <VoicingsTab desktop={d} globalProgression={progression} onChordsChange={handleChordNamesChange} tuning={tuning}
                                     activeSub={id === 'harmonize' ? 'harmonizer' : 'reharmonize'} />;
      case 'scales':        return <ScaleExplorer desktop={d} />;
      case 'intervals':     return <IntervalsTab desktop={d} sub={intervalView} />;
      case 'chord-wheel':   return <ChordWheel desktop={d} onAddToProgression={handleAddToProgression} />;
      case 'extensions':    return <DiatonicExtensions desktop={d} onAddToProgression={handleAddToProgression} />;
      case 'tab-writer':    return <TabBuilder desktop={d} />;
      case 'audio-tab':     return <AudioToTab desktop={d} />;
      case 'library':       return <WorkspacePanel desktop={d} onOpenTabInBuilder={handleOpenTab} onOpenProgressionInBuilder={handleOpenProgression} />;
      case 'tuner':         return <Tuner tuning={tuning} />;
      case 'metronome':     return <Metronome />;
      case 'chord-practice': return <ChordsPracticeTab desktop={d} />;
      case 'scale-practice': return <ScalesPracticeTab desktop={d} />;
      case 'ear-training':  return <IntervalsTab desktop={d} sub="practice" />;
      default:              return null;
    }
  };

  const stopName = stopById(shown)?.name.en ?? 'Stop';

  return (
    <SongProvider value={songApi}>
      <SongMap open={songMapOpen} onClose={() => setSongMapOpen(false)} desktop={isDesktop}
        userId={user?.id ?? null} sync={songSync} />
      <TransitShell
        desktop={isDesktop}
        stop={shown}
        sub={subOf(shown)}
        onGo={go}
        onSub={s => setSub(shown, s)}
        onHome={goHome}
        lastStop={lastStop}
        darkMode={darkMode}
        onToggleDark={() => setDarkMode(m => !m)}
        userMenu={<UserMenu compact={!isDesktop} up={isDesktop} onOpenWorkspace={() => go('library')} />}
        sharedBanner={sharedBanner}
        dock={<SongDock compact={!isDesktop} onOpenMap={() => setSongMapOpen(true)} />}
        ownPoster={OWN_POSTER.has(shown)}
      >
        <ErrorBoundary key={shown} label={stopName}>
          {renderStop(shown)}
        </ErrorBoundary>
      </TransitShell>
    </SongProvider>
  );
}
