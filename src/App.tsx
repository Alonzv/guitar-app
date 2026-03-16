import { useState, useEffect, useRef } from 'react';
import type { ChordInProgression, ScaleMatch, Song, SavedLyrics, SavedHarmony, Tuning } from './types/music';
import { TUNINGS } from './utils/musicTheory';
import { detectKey } from './utils/progressionHelper';
import { ChordsTab } from './components/ChordsTab';
import { ScalesTab } from './components/ScalePanel/ScalesTab';
import { LyricsTab } from './components/Lyrics/LyricsTab';
import { ToolsTab } from './components/Tools/ToolsTab';
import { LibraryTab } from './components/Library/LibraryTab';
import { Onboarding } from './components/Onboarding';
import { ErrorBoundary } from './components/ErrorBoundary';
import { T } from './theme';

type Tab = 'chords' | 'scales' | 'lyrics' | 'tools' | 'library';

const CHROMATIC = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const FLAT_TO_SHARP: Record<string, string> = { Db:'C#', Eb:'D#', Gb:'F#', Ab:'G#', Bb:'A#' };

function transposeChordName(name: string, semitones: number): string {
  const match = name.match(/^([A-G][b#]?)(.*)$/);
  if (!match) return name;
  const root = FLAT_TO_SHARP[match[1]] ?? match[1];
  const idx = CHROMATIC.indexOf(root);
  if (idx === -1) return name;
  return CHROMATIC[((idx + semitones) % 12 + 12) % 12] + match[2];
}

// Decode a shared progression from the URL hash (#s=<base64>)
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

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'chords',  label: 'Chords',   icon: '🎸' },
  { id: 'scales',  label: 'Scales',   icon: '🎼' },
  { id: 'lyrics',  label: 'Lyrics',   icon: '📝' },
  { id: 'tools',   label: 'Tools',    icon: '🔧' },
  { id: 'library', label: 'Library',  icon: '🗂️' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('chords');

  // ── Dark mode ──────────────────────────────────────────────────────────────
  const [darkMode, setDarkMode] = useState(() => {
    try { return localStorage.getItem('scaleup_dark') === '1'; }
    catch { return false; }
  });
  useEffect(() => {
    document.body.classList.toggle('dark', darkMode);
    try { localStorage.setItem('scaleup_dark', darkMode ? '1' : '0'); }
    catch (e) { console.warn('localStorage unavailable', e); }
  }, [darkMode]);

  // ── Progression with undo/redo ─────────────────────────────────────────────
  const [progression, setProgression] = useState<ChordInProgression[]>(() => {
    try { return JSON.parse(localStorage.getItem('scaleup_progression') || '[]'); }
    catch (e) { console.warn('Could not load progression', e); return []; }
  });
  const [undoStack, setUndoStack] = useState<ChordInProgression[][]>([]);
  const [redoStack, setRedoStack] = useState<ChordInProgression[][]>([]);

  // Refs so keyboard handler always sees current values without re-registering
  const progressionRef = useRef(progression);
  progressionRef.current = progression;
  const undoRef = useRef(undoStack);
  undoRef.current = undoStack;
  const redoRef = useRef(redoStack);
  redoRef.current = redoStack;

  const pushHistory = (next: ChordInProgression[]) => {
    setUndoStack(prev => [...prev.slice(-49), progressionRef.current]);
    setRedoStack([]);
    setProgression(next);
  };

  const handleUndo = () => {
    const stack = undoRef.current;
    if (stack.length === 0) return;
    setRedoStack(prev => [progressionRef.current, ...prev]);
    setProgression(stack[stack.length - 1]);
    setUndoStack(prev => prev.slice(0, -1));
  };

  const handleRedo = () => {
    const stack = redoRef.current;
    if (stack.length === 0) return;
    setUndoStack(prev => [...prev, progressionRef.current]);
    setProgression(stack[0]);
    setRedoStack(prev => prev.slice(1));
  };

  // Keyboard shortcuts: Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      if ((e.ctrlKey || e.metaKey) && ((e.shiftKey && e.key === 'z') || e.key === 'y')) {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []); // uses refs internally — no deps needed

  // ── Tuning & Capo ──────────────────────────────────────────────────────────
  const [tuning, setTuning] = useState<Tuning>(TUNINGS[0]);
  const [capo, setCapo] = useState(0);

  // ── Other state ────────────────────────────────────────────────────────────
  const [songs, setSongs] = useState<Song[]>(() => {
    try { return JSON.parse(localStorage.getItem('scaleup_songs') || '[]'); }
    catch (e) { console.warn('Could not load songs', e); return []; }
  });

  const [savedLyrics, setSavedLyrics] = useState<SavedLyrics[]>(() => {
    try { return JSON.parse(localStorage.getItem('scaleup_lyrics') || '[]'); }
    catch (e) { console.warn('Could not load lyrics', e); return []; }
  });

  const [savedHarmonies, setSavedHarmonies] = useState<SavedHarmony[]>(() => {
    try { return JSON.parse(localStorage.getItem('scaleup_harmonies') || '[]'); }
    catch (e) { console.warn('Could not load harmonies', e); return []; }
  });

  const [lyricsToLoad, setLyricsToLoad] = useState<SavedLyrics | null>(null);

  const [selectedScale, setSelectedScale] = useState<ScaleMatch | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(
    () => !localStorage.getItem('scaleup_onboarded')
  );

  // Banner for shared progressions loaded from URL
  const [sharedProgression] = useState<ChordInProgression[] | null>(decodeSharedProgression);
  const [showSharedBanner, setShowSharedBanner] = useState(() => !!decodeSharedProgression());

  // Persist
  useEffect(() => {
    try { localStorage.setItem('scaleup_progression', JSON.stringify(progression)); }
    catch (e) { console.warn('Could not save progression', e); }
  }, [progression]);

  useEffect(() => {
    try { localStorage.setItem('scaleup_songs', JSON.stringify(songs)); }
    catch (e) { console.warn('Could not save songs', e); }
  }, [songs]);

  useEffect(() => {
    try { localStorage.setItem('scaleup_lyrics', JSON.stringify(savedLyrics)); }
    catch (e) { console.warn('Could not save lyrics', e); }
  }, [savedLyrics]);

  useEffect(() => {
    try { localStorage.setItem('scaleup_harmonies', JSON.stringify(savedHarmonies)); }
    catch (e) { console.warn('Could not save harmonies', e); }
  }, [savedHarmonies]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleDoneOnboarding = () => {
    localStorage.setItem('scaleup_onboarded', '1');
    setShowOnboarding(false);
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

  // ── Progressions ──────────────────────────────────────────────────────────
  const handleSaveSong = (name: string) => {
    const song: Song = {
      id: `song-${Date.now()}`,
      name: name.trim() || `Song ${songs.length + 1}`,
      progression: [...progression],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setSongs(prev => [song, ...prev]);
  };

  const handleLoadSong = (song: Song) => {
    pushHistory(song.progression);
    setActiveTab('chords');
  };

  const handleDeleteSong = (id: string) => {
    setSongs(prev => prev.filter(s => s.id !== id));
  };

  const handleRenameSong = (id: string, name: string) => {
    setSongs(prev => prev.map(s => s.id === id ? { ...s, name, updatedAt: Date.now() } : s));
  };

  // ── Lyrics ────────────────────────────────────────────────────────────────
  const handleSaveLyrics = (data: Omit<SavedLyrics, 'id' | 'createdAt' | 'updatedAt'>) => {
    const now = Date.now();
    const item: SavedLyrics = { ...data, id: `lyrics-${now}`, createdAt: now, updatedAt: now };
    setSavedLyrics(prev => [item, ...prev]);
  };

  const handleLoadLyrics = (lyrics: SavedLyrics) => {
    setLyricsToLoad(lyrics);
    setActiveTab('lyrics');
  };

  const handleDeleteLyrics = (id: string) => {
    setSavedLyrics(prev => prev.filter(l => l.id !== id));
  };

  const handleRenameLyrics = (id: string, name: string) => {
    setSavedLyrics(prev => prev.map(l => l.id === id ? { ...l, name, updatedAt: Date.now() } : l));
  };

  // ── Harmonies ─────────────────────────────────────────────────────────────
  const handleSaveHarmony = (scale: ScaleMatch, key?: string) => {
    const now = Date.now();
    const item: SavedHarmony = {
      id: `harmony-${now}`,
      name: `${scale.root} ${scale.type}`,
      scale, key, createdAt: now,
    };
    setSavedHarmonies(prev => [item, ...prev]);
  };

  const handleLoadHarmony = (harmony: SavedHarmony) => {
    setSelectedScale(harmony.scale);
    setActiveTab('scales');
  };

  const handleDeleteHarmony = (id: string) => {
    setSavedHarmonies(prev => prev.filter(h => h.id !== id));
  };

  const handleRenameHarmony = (id: string, name: string) => {
    setSavedHarmonies(prev => prev.map(h => h.id === id ? { ...h, name } : h));
  };

  const handleLoadShared = () => {
    if (sharedProgression) {
      pushHistory(sharedProgression);
      setActiveTab('chords');
    }
    setShowSharedBanner(false);
    history.replaceState(null, '', window.location.pathname);
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: T.bgDeep, color: T.text, display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {showOnboarding && <Onboarding onDone={handleDoneOnboarding} />}

      {/* ── Shared progression banner ── */}
      {showSharedBanner && sharedProgression && (
        <div style={{
          background: T.secondaryBg, borderBottom: `1px solid ${T.secondary}`,
          padding: '10px 16px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 10, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 13, color: T.secondary, fontWeight: 600 }}>
            🎵 Shared progression — {sharedProgression.length} chords
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleLoadShared}
              style={{
                padding: '5px 14px', borderRadius: 8, border: 'none',
                background: T.secondary, color: T.white, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}
            >Load</button>
            <button
              onClick={() => { setShowSharedBanner(false); history.replaceState(null, '', window.location.pathname); }}
              style={{
                padding: '5px 10px', borderRadius: 8, border: `1px solid ${T.border}`,
                background: 'transparent', color: T.textMuted, fontSize: 12, cursor: 'pointer',
              }}
            >Dismiss</button>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <header style={{ backgroundColor: T.bgInput, borderBottom: `1px solid ${T.border}`, padding: 'var(--gc-header-pad)' }}>
        {/* Brand row */}
        <div style={{ textAlign: 'center', marginBottom: 4, position: 'relative' }}>
          <span style={{ fontSize: 'var(--gc-brand-text)', fontWeight: 800, letterSpacing: '-0.5px', lineHeight: 1 }}>
            <span style={{ color: '#3D5A6C' }}>Scale</span><span style={{ color: '#E8736A' }}>Up</span>
          </span>
          {/* Header action buttons */}
          <div style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: 6 }}>
            <button
              onClick={() => setDarkMode(d => !d)}
              style={{
                width: 26, height: 26, borderRadius: '50%',
                border: `1px solid ${darkMode ? '#6A8FAA' : '#4A6A80'}`,
                background: darkMode ? '#2D404F' : '#4A6A80',
                fontSize: 13, cursor: 'pointer', lineHeight: '24px', padding: 0,
              }}
              title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >{darkMode ? '☀️' : '🌙'}</button>
            <button
              onClick={() => setShowOnboarding(true)}
              style={{
                width: 26, height: 26, borderRadius: '50%',
                border: `1px solid ${T.border}`, background: T.bgCard,
                color: T.textMuted, fontSize: 13, fontWeight: 700,
                cursor: 'pointer', lineHeight: '24px', padding: 0,
              }}
              title="Help"
            >?</button>
          </div>
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
          <ErrorBoundary label="Chords">
            <ChordsTab
              progression={progression}
              onAddToProgression={(item) => pushHistory([...progression, item])}
              onRemoveFromProgression={(id) => pushHistory(progression.filter(c => c.id !== id))}
              onClearProgression={() => pushHistory([])}
              onReorderProgression={handleReorderProgression}
              onTransposeProgression={handleTransposeProgression}
              onSaveSong={handleSaveSong}
              tuning={tuning}
              onTuningChange={setTuning}
              capo={capo}
              onCapoChange={setCapo}
              canUndo={undoStack.length > 0}
              canRedo={redoStack.length > 0}
              onUndo={handleUndo}
              onRedo={handleRedo}
            />
          </ErrorBoundary>
        )}
        {activeTab === 'scales' && (
          <ErrorBoundary label="Scales">
            <ScalesTab
              progression={progression}
              selectedScale={selectedScale}
              onSelectScale={setSelectedScale}
              preferredKey={detectKey(progression.map(c => c.chord)) || undefined}
              tuning={tuning}
              onSaveHarmony={handleSaveHarmony}
            />
          </ErrorBoundary>
        )}
        {activeTab === 'lyrics' && (
          <ErrorBoundary label="Lyrics">
            <LyricsTab
              progression={progression}
              onSaveLyrics={handleSaveLyrics}
              lyricsToLoad={lyricsToLoad}
              onLyricsLoaded={() => setLyricsToLoad(null)}
            />
          </ErrorBoundary>
        )}
        {activeTab === 'tools' && (
          <ErrorBoundary label="Tools">
            <ToolsTab
              tuning={tuning}
              onTuningChange={setTuning}
              onAddToProgression={(item) => pushHistory([...progression, item])}
            />
          </ErrorBoundary>
        )}
        {activeTab === 'library' && (
          <ErrorBoundary label="Library">
            <LibraryTab
              songs={songs}
              savedLyrics={savedLyrics}
              savedHarmonies={savedHarmonies}
              onLoadProgression={(song) => { handleLoadSong(song); }}
              onDeleteProgression={handleDeleteSong}
              onRenameProgression={handleRenameSong}
              onLoadLyrics={handleLoadLyrics}
              onDeleteLyrics={handleDeleteLyrics}
              onRenameLyrics={handleRenameLyrics}
              onLoadHarmony={handleLoadHarmony}
              onDeleteHarmony={handleDeleteHarmony}
              onRenameHarmony={handleRenameHarmony}
            />
          </ErrorBoundary>
        )}
      </main>
    </div>
  );
}
