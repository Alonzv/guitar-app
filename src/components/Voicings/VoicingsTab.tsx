import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Chord as TonalChord, Note as TonalNote } from '@tonaljs/tonal';
import type { ChordInProgression, FretPosition, Tuning } from '../../types/music';
import { MiniFretboard } from '../Fretboard/MiniFretboard';
import { playChord, unlockAudio } from '../../utils/audioPlayback';
import { fretToNote } from '../../utils/musicTheory';
import {
  findVoicingPaths,
  recomputePathMetrics,
  type VoicingGenre,
  type VoicingMode,
  type StringGroup,
  type VoicingPath,
} from '../../utils/voicingPaths';
import { ChordMicroEdit } from './ChordMicroEdit';
import { analyzeProgression, type MusicalAnalysis } from '../../utils/musicalAnalysis';
import { TUNINGS } from '../../utils/musicTheory';
import { T, card, alpha } from '../../theme';
import { ReharmonizeTab } from './ReharmonizeTab';
import { MelodyHarmonizerTab } from './MelodyHarmonizerTab';
import { SaveToLibraryButton } from '../Workspace/SaveToLibraryButton';
import { consumePendingVoicings, subscribeVoicingsHandoff, type VoicingsHandoff } from '../../services/handoff';

type VoicingsSub = 'paths' | 'voiceleading' | 'harmonizer' | 'reharmonize';

interface Props {
  globalProgression?: ChordInProgression[];
  tuning?: Tuning;
  activeSub?: VoicingsSub;
  onSubChange?: (s: VoicingsSub) => void;
  desktop?: boolean;
}

// ── Chord builder data ─────────────────────────────────────────────────────

const ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const TRIADS: { display: string; key: string }[] = [
  { display: 'Major', key: 'M'    },
  { display: 'Minor', key: 'm'    },
  { display: 'dim',   key: 'dim'  },
  { display: 'aug',   key: 'aug'  },
  { display: 'sus2',  key: 'sus2' },
  { display: 'sus4',  key: 'sus4' },
];

const EXTENSIONS: { display: string; key: string }[] = [
  { display: '—',     key: ''     },
  { display: '+7',    key: '7'    },
  { display: '+maj7', key: 'maj7' },
  { display: '+9',    key: '9'    },
  { display: '+add9', key: 'add9' },
  { display: '+6',    key: '6'    },
  { display: '+11',   key: '11'   },
  { display: '+13',   key: '13'   },
];

const VALID_EXTENSIONS: Record<string, string[]> = {
  M:    ['', '7', 'maj7', '9', 'add9', '6', '11', '13'],
  m:    ['', '7', 'maj7', '9', 'add9', '6', '11', '13'],
  dim:  ['', '7'],
  aug:  ['', '7'],
  sus2: [''],
  sus4: [''],
};

const SUFFIX_MAP: Record<string, Record<string, string>> = {
  M:    { '': 'M', '7': '7', 'maj7': 'maj7', '9': '9', 'add9': 'add9', '6': '6', '11': '11', '13': '13' },
  m:    { '': 'm', '7': 'm7', 'maj7': 'mM7', '9': 'm9', 'add9': 'madd9', '6': 'm6', '11': 'm11', '13': 'm13' },
  dim:  { '': 'dim', '7': 'dim7' },
  aug:  { '': 'aug', '7': 'aug7' },
  sus2: { '': 'sus2' },
  sus4: { '': 'sus4' },
};

// ── Genre + display data ───────────────────────────────────────────────────

const GENRES: { id: VoicingGenre; label: string; hint: string }[] = [
  { id: 'any',       label: 'Any',        hint: 'Pure voice leading'         },
  { id: 'americana', label: 'Americana',  hint: 'Open drone strings'         },
  { id: 'swamp',     label: 'Swamp Rock', hint: 'Raw, low, dark'             },
  { id: 'neo-soul',  label: 'Neo-Soul',   hint: 'Extended + ultra-smooth'    },
  { id: 'blues',     label: 'Blues',      hint: 'Dominant shapes'            },
  { id: 'rock',      label: 'Rock',       hint: 'Punchy barre shapes'        },
  { id: 'country',   label: 'Country',    hint: 'Open position, bright'      },
];

const PATH_COLOR: Record<string, string> = {
  'Open Drones':   '#1A1818',  // ink
  'Open Position': '#3A352F',  // graphite
  'Lower Neck':    '#5C5650',  // slate
  'Mid Neck':      '#110CF0',  // accent blue
  'Upper Neck':    '#8A8378',  // taupe
  'High Neck':     '#9C958C',  // light taupe
};

// ── Interval display ──────────────────────────────────────────────────────

export type IsolateGroup = null | 'root' | '3rd' | '5th' | '7th';

const INTERVAL_COLOR: Record<string, string> = {
  '1P': '#110CF0',               // Root — blue
  // 3rd — theme ink (#1A1818 light / sand #F0EAD8 dark); a hardcoded ink here
  // used to vanish on the dark background.
  '3m': T.text, '3M': T.text,
  '5P': '#5C5650', '5A': '#5C5650', '5d': '#5C5650', // 5th — slate
  '7m': '#8A8378', '7M': '#8A8378', '7d': '#8A8378', // 7th — taupe
  '9M': '#9C958C', '9m': '#9C958C', '9A': '#9C958C', // ext — light taupe
  '11P': '#9C958C', '11A': '#9C958C',
  '13M': '#9C958C', '13m': '#9C958C',
};

const INTERVAL_SHORT: Record<string, string> = {
  '1P': '1', '3m': 'b3', '3M': '3', '5P': '5', '5A': '#5', '5d': 'b5',
  '7m': 'b7', '7M': '7', '7d': 'bb7',
  '9M': '9', '9m': 'b9', '9A': '#9',
  '11P': '11', '11A': '#11', '13M': '13', '13m': 'b13',
};

const INTERVAL_NAME: Record<string, string> = {
  '1P': 'Root', '3m': 'Min 3rd', '3M': 'Maj 3rd',
  '5P': 'Fifth', '5A': 'Aug 5th', '5d': 'Dim 5th',
  '7m': 'Min 7th', '7M': 'Maj 7th', '7d': 'Dim 7th',
  '9M': '9th', '9m': 'b9th', '9A': '#9th',
  '11P': '11th', '11A': '#11th', '13M': '13th', '13m': 'b13th',
};

const INTERVAL_GROUP: Record<string, IsolateGroup> = {
  '1P': 'root',
  '3m': '3rd', '3M': '3rd',
  '5P': '5th', '5A': '5th', '5d': '5th',
  '7m': '7th', '7M': '7th', '7d': '7th',
};

function getIntervalForNote(noteName: string, chordName: string): string | null {
  const info = TonalChord.get(chordName);
  const nc = TonalNote.chroma(noteName);
  if (nc == null) return null;
  for (let i = 0; i < info.notes.length; i++) {
    if (TonalNote.chroma(info.notes[i]) === nc) return info.intervals[i];
  }
  return null;
}

function computeDotColors(
  voicing: FretPosition[], chordName: string,
  isolate: IsolateGroup, tuning: string[], defaultColor: string,
): string[] {
  if (!isolate) return voicing.map(() => defaultColor);
  return voicing.map(p => {
    const note = fretToNote(p.string, p.fret, tuning);
    const iv = getIntervalForNote(note, chordName);
    if (iv && INTERVAL_GROUP[iv] === isolate) return INTERVAL_COLOR[iv] ?? defaultColor;
    return '#00000020';
  });
}

// ── Chord spelling component ───────────────────────────────────────────────

function ChordSpelling({ chordName }: { chordName: string }) {
  const info = TonalChord.get(chordName);
  if (info.notes.length < 2) return null;
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {info.notes.map((note, i) => {
        const iv    = info.intervals[i] ?? '';
        const color = INTERVAL_COLOR[iv] ?? T.textMuted;
        const short = INTERVAL_SHORT[iv] ?? iv;
        const name  = INTERVAL_NAME[iv]  ?? iv;
        return (
          <div key={i} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: '5px 10px',
            background: alpha(color, 13), borderRight: `3px solid ${color}`,
            minWidth: 34,
          }}>
            <span style={{ fontSize: 15, fontWeight: 800, color, lineHeight: 1.1 }}>{note}</span>
            <span style={{ fontSize: 10, fontWeight: 400, color, lineHeight: 1.3 }}>{short}</span>
            <span style={{ fontSize: 8, color: alpha(color, 73), lineHeight: 1.2, whiteSpace: 'nowrap' }}>{name}</span>
          </div>
        );
      })}
    </div>
  );
}

const LABEL_STYLE: React.CSSProperties = {
  margin: 0,
  fontSize: 10,
  fontWeight: 400,
  color: T.textDim,
  textTransform: 'uppercase',
  letterSpacing: '0.14em',
};

// Fret position badge: colored pill showing the barre/position fret number
function FretBadge({ voicing, color }: { voicing: FretPosition[]; color: string }) {
  const nonOpen = voicing.filter(p => p.fret > 0);
  const hasOpen = voicing.some(p => p.fret === 0);
  const lowestFret = nonOpen.length ? Math.min(...nonOpen.map(p => p.fret)) : 0;

  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 7px', borderRadius: 0,
      background: alpha(color, 13),
      border: `1px solid ${alpha(color, 33)}`,
      fontSize: 10, fontWeight: 400, color,
    }}>
      {nonOpen.length === 0
        ? 'open'
        : hasOpen
          ? `${lowestFret}fr + open`
          : `${lowestFret}fr`}
    </span>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────

interface ModalProps {
  voicings: FretPosition[][];
  chordNames: string[];
  index: number;
  color: string;
  tuning: string[];
  dotColors?: string[][];
  onClose: () => void;
}

function ChordModal({ voicings, chordNames, index: initialIndex, color, tuning, dotColors, onClose }: ModalProps) {
  const [idx, setIdx] = useState(initialIndex);
  const total    = voicings.length;
  const voicing  = voicings[idx];
  const name     = chordNames[idx];

  const prev = () => setIdx(i => Math.max(0, i - 1));
  const next = () => setIdx(i => Math.min(total - 1, i + 1));

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape')      onClose();
      else if (e.key === 'ArrowLeft')  setIdx(i => Math.max(0, i - 1));
      else if (e.key === 'ArrowRight') setIdx(i => Math.min(total - 1, i + 1));
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose, total]);

  const navBtn = (_onClick: () => void, _label: string, disabled: boolean): React.CSSProperties => ({
    background: disabled ? T.bgDeep : T.bgInput,
    border: `1px solid ${T.border}`,
    borderRadius: 0, padding: '10px 16px',
    cursor: disabled ? 'default' : 'pointer',
    color: disabled ? T.textDim : T.text,
    fontSize: 18, fontWeight: 400, lineHeight: 1,
    opacity: disabled ? 0.35 : 1,
    transition: 'opacity 0.15s',
    borderLeft: '3px solid var(--gc-bar-color)',
  });

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: T.bgCard, borderRadius: 0,
          border: `1px solid ${T.border}`,
          padding: 24, maxWidth: 340, width: '100%',
          display: 'flex', flexDirection: 'column', gap: 14,
          boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 22, fontWeight: 800, color }}>{name}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: T.textDim, fontWeight: 600 }}>
              {idx + 1} / {total}
            </span>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', color: T.textMuted, fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: '2px 6px' }}
            >×</button>
          </div>
        </div>

        {/* Fretboard */}
        <div style={{
          background: T.bgInput, borderRadius: 0,
          border: `1px solid ${color}44`, padding: '8px 8px 4px',
        }}>
          <MiniFretboard
            voicing={voicing}
            dotColors={dotColors?.[idx]}
            dotColor={color}
            tuning={tuning}
            showStringLabels
            showFretNumbers
            hideFretLabel
          />
        </div>

        <FretBadge voicing={voicing} color={color} />

        {/* Navigation arrows */}
        {total > 1 && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={prev} disabled={idx === 0}          style={{ ...navBtn(prev, '‹', idx === 0),          flex: 1 }}>‹</button>
            <button onClick={next} disabled={idx === total - 1}  style={{ ...navBtn(next, '›', idx === total - 1),  flex: 1 }}>›</button>
          </div>
        )}

        <p style={{ margin: 0, fontSize: 10, color: T.textDim, textAlign: 'center' }}>
          ← → keys to navigate · Esc to close
        </p>
      </div>
    </div>
  );
}

// ── AI Analysis card ──────────────────────────────────────────────────────

function AnalysisCard({
  analysis, loading, noKey,
}: { analysis: MusicalAnalysis | null; loading: boolean; noKey: boolean }) {
  return (
    <div style={{
      ...card({ padding: '14px 16px' }),
      borderLeft: `3px solid ${noKey ? T.border : T.primary}`,
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: noKey ? T.textDim : T.primary, direction: 'ltr', unicodeBidi: 'isolate' }}>
          ✦ AI ניתוח
        </span>
        {loading && <span style={{ fontSize: 10, color: T.textDim, fontStyle: 'italic' }}>מנתח…</span>}
        {analysis && (
          <span style={{
            padding: '2px 8px', borderRadius: 0,
            background: T.primarySoft, color: T.primary,
            fontSize: 10, fontWeight: 400,
          }}>{analysis.key}</span>
        )}
        {noKey && (
          <span style={{ fontSize: 10, color: T.textDim }}>
            הגדר VITE_ANTHROPIC_API_KEY להפעלה
          </span>
        )}
      </div>

      {analysis && (
        <>
          <p style={{
            margin: 0, fontSize: 12, color: T.text,
            lineHeight: 1.8, direction: 'rtl', textAlign: 'right',
          }}>
            {analysis.character}
          </p>
          <div style={{ paddingTop: 8, borderTop: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <p style={{
              margin: 0, fontSize: 11, color: T.textMuted,
              fontStyle: 'italic', direction: 'rtl', textAlign: 'right',
            }}>
              💡 {analysis.advice}
            </p>
            {analysis.recommendedReason && (
              <p style={{
                margin: 0, fontSize: 11, color: T.primary,
                direction: 'rtl', textAlign: 'right', fontWeight: 400,
              }}>
                ✦ {analysis.recommendedReason}
              </p>
            )}
          </div>
        </>
      )}

      {!analysis && !loading && !noKey && (
        <p style={{ margin: 0, fontSize: 11, color: T.textDim, fontStyle: 'italic' }}>
          הניתוח לא הצליח — בדוק את חיבור ה-API
        </p>
      )}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────

export function VoicingsTab({ globalProgression, tuning = TUNINGS[0], activeSub, onSubChange, desktop }: Props) {
  // Chord builder
  const [root,  setRoot]  = useState('');
  const [triad, setTriad] = useState('');
  const [ext,   setExt]   = useState('');

  // Progression — persisted across tab navigations
  const [chords, setChords] = useState<string[]>(() => {
    try { return JSON.parse(sessionStorage.getItem('voicings-chords') ?? '[]'); } catch { return []; }
  });
  useEffect(() => {
    try { sessionStorage.setItem('voicings-chords', JSON.stringify(chords)); } catch { /* ignore */ }
  }, [chords]);

  // Filters
  const [genre,       setGenre]       = useState<VoicingGenre>('any');
  const [mode,        setMode]        = useState<VoicingMode>('full');
  const [stringGroup, setStringGroup] = useState<StringGroup>('all');

  // Results
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [playingId,   setPlayingId]   = useState<string | null>(null);
  const playTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Modal
  const [modal, setModal] = useState<{ voicings: FretPosition[][]; chordNames: string[]; index: number; color: string; dotColors?: string[][] } | null>(null);

  // AI analysis
  const [analysis,        setAnalysis]        = useState<MusicalAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);

  // Voice isolator
  const [isolate, setIsolate] = useState<IsolateGroup>(null);

  // ── Micro-edit (long-press a diagram in Paths) ────────────────────────────
  // `editedPath` overlays the selected path with a swapped chord/voicing and
  // its recomputed metrics; `microEdit` holds which chord index is open in the
  // popover. Both clear when the selection or the underlying paths change.
  interface EditedPath {
    baseId: string;
    voicings: FretPosition[][];
    chordNames: string[];
    label: string;
    smoothness: number;
    avgFret: number;
    description: string;
  }
  const [editedPath, setEditedPath] = useState<EditedPath | null>(null);
  const [microEdit, setMicroEdit]   = useState<{ index: number } | null>(null);

  // ── Library handoff (Open in Paths / Open in Reharm) ──────────────────────
  // Restores a saved progression + filters; for Paths also re-selects the
  // saved path once paths recompute; for Reharm seeds the saved AI result
  // (passed down to ReharmonizeTab so no API call is needed).
  const [reharmSeed, setReharmSeed] = useState<VoicingsHandoff['reharm'] | null>(null);
  const pendingPathLabel = useRef<string | null>(null);
  const skipAutoSelectOnce = useRef(false);

  const applyVoicingsHandoff = useCallback((h: VoicingsHandoff) => {
    setChords(h.chords);
    if (h.settings?.genre)       setGenre(h.settings.genre as VoicingGenre);
    if (h.settings?.mode)        setMode(h.settings.mode as VoicingMode);
    if (h.settings?.stringGroup) setStringGroup(h.settings.stringGroup as StringGroup);
    pendingPathLabel.current = h.pathLabel ?? null;
    skipAutoSelectOnce.current = !!h.pathLabel;
    setReharmSeed(h.reharm ?? null);
  }, []);

  useEffect(() => {
    const p = consumePendingVoicings();
    if (p) applyVoicingsHandoff(p);
    return subscribeVoicingsHandoff(() => {
      const q = consumePendingVoicings();
      if (q) applyVoicingsHandoff(q);
    });
  }, [applyVoicingsHandoff]);

  // Sub-tab (can be controlled externally via activeSub/onSubChange)
  const [internalSubTab, setInternalSubTab] = useState<VoicingsSub>('paths');
  const subTab = activeSub ?? internalSubTab;
  const setSubTab = (s: VoicingsSub) => { setInternalSubTab(s); onSubChange?.(s); };

  // Derived chord name
  const suffix    = SUFFIX_MAP[triad]?.[ext] ?? '';
  const chordName = root + (suffix === 'M' ? '' : suffix);
  const validExts = VALID_EXTENSIONS[triad] ?? [''];
  const activeExt = validExts.includes(ext) ? ext : '';

  // Paths (fully reactive)
  const paths = useMemo(() => {
    if (!chords.length) return [];
    return findVoicingPaths(chords, { genre, mode, stringGroup, tuning: tuning.notes });
  }, [chords, genre, mode, stringGroup, tuning]);

  // Reset state when paths change — unless a saved path is waiting to be
  // re-selected (library handoff), in which case pick it by label.
  useEffect(() => {
    const wanted = pendingPathLabel.current;
    if (wanted) {
      pendingPathLabel.current = null;
      const idx = paths.findIndex(p => p.label === wanted);
      setSelectedIdx(idx >= 0 ? idx : 0);
    } else {
      setSelectedIdx(0);
    }
    playTimers.current.forEach(clearTimeout);
    playTimers.current = [];
    setPlayingId(null);
    setEditedPath(null);   // recomputed paths invalidate any in-place edit
    setMicroEdit(null);
  }, [paths]);

  // A different path selected drops the edit (it belonged to the old one).
  useEffect(() => { setEditedPath(null); setMicroEdit(null); }, [selectedIdx]);

  useEffect(() => () => { playTimers.current.forEach(clearTimeout); }, []);

  // Trigger AI analysis when paths/chords/genre change
  useEffect(() => {
    if (!chords.length || !paths.length) {
      setAnalysis(null);
      setAnalysisLoading(false);
      return;
    }
    const genreLabel = GENRES.find(g => g.id === genre)?.label ?? genre;
    const pathInfos  = paths.map(p => ({ label: p.label, description: p.description, smoothness: p.smoothness }));
    setAnalysis(null);
    setAnalysisLoading(true);
    let cancelled = false;
    analyzeProgression(chords, genreLabel, pathInfos).then(result => {
      if (!cancelled) {
        setAnalysis(result);
        setAnalysisLoading(false);
        // Auto-select the AI-recommended path — but never override a
        // selection that was just restored from the library.
        if (result && !skipAutoSelectOnce.current) setSelectedIdx(result.recommendedPath);
        skipAutoSelectOnce.current = false;
      }
    });
    return () => { cancelled = true; };
  }, [chords, genre, paths.length]);

  const addChord = () => {
    if (!root || !triad || chords.length >= 8) return;
    setChords(prev => [...prev, chordName]);
  };

  const dragIndex = useRef<number | null>(null);

  const onDragStart = (i: number) => { dragIndex.current = i; };

  const onDrop = (i: number) => {
    const from = dragIndex.current;
    if (from == null || from === i) return;
    setChords(prev => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(i, 0, item);
      return next;
    });
    dragIndex.current = null;
  };

  const importProgression = () => {
    if (!globalProgression?.length) return;
    setChords(globalProgression.slice(0, 8).map(c => c.chord.name));
  };

  const playPath = (path: VoicingPath) => {
    playTimers.current.forEach(clearTimeout);
    playTimers.current = [];
    if (playingId === path.id) { setPlayingId(null); return; }
    setPlayingId(path.id);
    unlockAudio();
    path.voicings.forEach((v, i) => {
      const t = setTimeout(() => {
        playChord(v, tuning.openFreqs);
        if (i === path.voicings.length - 1) {
          const done = setTimeout(() => setPlayingId(null), 1400);
          playTimers.current.push(done);
        }
      }, i * 1300);
      playTimers.current.push(t);
    });
  };

  const openModal = useCallback((index: number, voicings: FretPosition[][], names: string[], color: string, dotColors?: string[][]) => {
    setModal({ voicings, chordNames: names, index, color, dotColors });
  }, []);

  const basePath: VoicingPath | undefined = paths[selectedIdx];
  const activeEdit = editedPath && basePath && editedPath.baseId === basePath.id ? editedPath : null;

  // The displayed path — base path with any in-place micro-edit applied. All
  // downstream render (diagrams, smoothness, play, save) reads from this.
  const currentPath: VoicingPath | undefined = basePath ? {
    ...basePath,
    voicings:    activeEdit?.voicings   ?? basePath.voicings,
    label:       activeEdit?.label      ?? basePath.label,
    smoothness:  activeEdit?.smoothness ?? basePath.smoothness,
    avgFret:     activeEdit?.avgFret    ?? basePath.avgFret,
    description: activeEdit?.description ?? basePath.description,
  } : undefined;
  // Chord names shown above each diagram — a re-harmonize swap changes one.
  const displayChords = activeEdit?.chordNames ?? chords;
  // Edited paths get the brand accent so "Custom Path" reads as user-touched.
  const currentColor = currentPath
    ? (currentPath.label === 'Custom Path' ? T.brandAccent : (PATH_COLOR[currentPath.label] ?? T.primary))
    : T.primary;
  const isPlaying    = basePath?.id === playingId;

  // Apply a swap from the micro-editor: replace chord `ci`, recompute metrics,
  // and re-label as "Custom Path" if the chord changed or the neck zone shifts.
  const applyMicroEdit = (ci: number, newChordName: string, newVoicing: FretPosition[]) => {
    if (!basePath) return;
    const srcVoicings = activeEdit?.voicings ?? basePath.voicings;
    const srcChords   = activeEdit?.chordNames ?? chords;
    const voicings   = srcVoicings.map((v, i) => (i === ci ? newVoicing : v));
    const chordNames = srcChords.map((c, i) => (i === ci ? newChordName : c));
    const m = recomputePathMetrics(voicings, chordNames, genre);
    const nameChanged = chordNames.some((c, i) => c !== chords[i]);
    const zoneChanged = m.label !== basePath.label;
    const custom = nameChanged || zoneChanged;
    setEditedPath({
      baseId: basePath.id,
      voicings, chordNames,
      label: custom ? 'Custom Path' : basePath.label,
      smoothness: m.smoothness,
      avgFret: m.avgFret,
      description: custom
        ? 'Custom path — edited from the original, one chord swapped.'
        : basePath.description,
    });
    setMicroEdit(null);
  };

  // Long-press vs tap: a diagram tap enlarges (openModal); a long press opens
  // the micro-editor. We time the pointer-down and cancel on move/up.
  const lpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lpFired = useRef(false);
  const lpStart = useRef<{ x: number; y: number } | null>(null);
  const beginLongPress = (ci: number, x: number, y: number) => {
    lpFired.current = false;
    lpStart.current = { x, y };
    // 550ms — a touch past the iOS Haptic-Touch threshold so the popover's
    // pop lands together with the system long-press haptic, not before it.
    lpTimer.current = setTimeout(() => { lpFired.current = true; setMicroEdit({ index: ci }); }, 550);
  };
  const moveLongPress = (x: number, y: number) => {
    if (!lpStart.current || !lpTimer.current) return;
    if (Math.abs(x - lpStart.current.x) > 10 || Math.abs(y - lpStart.current.y) > 10) {
      clearTimeout(lpTimer.current); lpTimer.current = null;
    }
  };
  const endLongPress = () => { if (lpTimer.current) { clearTimeout(lpTimer.current); lpTimer.current = null; } };

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Sub-tab selector (hidden when externally controlled) ──── */}
      {!activeSub && (
      <div style={{ display: 'flex', gap: 0 }}>
        {([
          { id: 'paths',        label: 'Paths'         },
          { id: 'voiceleading', label: 'Voice Leading' },
          { id: 'harmonizer',   label: 'Harmonize'     },
          { id: 'reharmonize',  label: 'Re-Harmonize'  },
        ] as { id: VoicingsSub; label: string }[]).map(tab => (
          <button key={tab.id} onClick={() => setSubTab(tab.id)} className="gc-sub-tab" style={{
            flex: 1, padding: '11px 4px', borderRadius: 0,
            background: subTab === tab.id ? T.secondary : T.bgInput,
            color: subTab === tab.id ? '#fff' : T.textMuted,
            fontSize: 14, cursor: 'pointer',
            borderLeft: '3px solid var(--gc-bar-color)',
            transition: 'background 0.1s',
          }}>
            <span><span style={{ fontWeight: 700, opacity: 0.4, letterSpacing: 0 }}>_</span><span style={{ fontWeight: 400 }}>{tab.label}</span></span>
          </button>
        ))}
      </div>
      )}

      {subTab === 'paths' && (() => {
      const pathsLeft = (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Chord builder ──────────────────────────────────────────── */}
      <div style={{ ...card(), display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={LABEL_STYLE}>Build Chord</p>

        {/* Root note grid */}
        <div>
          <p style={{ ...LABEL_STYLE, fontSize: 10, marginBottom: 6 }}>Root Note</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4 }}>
            {ROOTS.map(r => (
              <button key={r} onClick={() => setRoot(r)} style={{
                padding: '7px 0', borderRadius: 0,
                background: root === r ? T.primary : T.bgDeep,
                color: root === r ? '#fff' : T.textMuted,
                fontSize: 12, fontWeight: 400, cursor: 'pointer',
                transition: 'background 0.12s', borderLeft: '3px solid var(--gc-bar-color)',
              }}>{r}</button>
            ))}
          </div>
        </div>

        {/* Triad quality */}
        <div>
          <p style={{ ...LABEL_STYLE, fontSize: 10, marginBottom: 6 }}>Quality</p>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {TRIADS.map(t => (
              <button key={t.key} onClick={() => { setTriad(t.key); setExt(''); }} style={{
                padding: '7px 12px', borderRadius: 0,
                background: triad === t.key ? T.secondary : T.bgDeep,
                color: triad === t.key ? '#fff' : T.textMuted,
                fontSize: 12, fontWeight: 400, cursor: 'pointer',
                transition: 'background 0.12s', borderLeft: '3px solid var(--gc-bar-color)',
              }}>{t.display}</button>
            ))}
          </div>
        </div>

        {/* Extension */}
        <div>
          <p style={{ ...LABEL_STYLE, fontSize: 10, marginBottom: 6 }}>Extension</p>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {EXTENSIONS.filter(e => validExts.includes(e.key)).map(e => (
              <button key={e.key} onClick={() => setExt(e.key)} style={{
                padding: '6px 11px', borderRadius: 0,
                background: activeExt === e.key ? T.secondary : T.bgDeep,
                color: activeExt === e.key ? '#fff' : T.textMuted,
                fontSize: 12, fontWeight: 400, cursor: 'pointer',
                transition: 'background 0.12s', borderLeft: '3px solid var(--gc-bar-color)',
              }}>{e.display}</button>
            ))}
          </div>
        </div>

        {/* Add row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: T.text, flex: 1 }}>
            {chordName}
          </span>
          <button
            onClick={addChord}
            disabled={!root || !triad || chords.length >= 8}
            style={{
              padding: '9px 20px', borderRadius: 0,
              background: (root && triad && chords.length < 8) ? T.secondary : T.border,
              color: '#fff', fontWeight: 400, fontSize: 14,
              cursor: (root && triad && chords.length < 8) ? 'pointer' : 'not-allowed',
              transition: 'background 0.15s', borderLeft: '3px solid var(--gc-bar-color)',
            }}
          >
            + Add
          </button>
        </div>

        {/* Chord spelling */}
        <ChordSpelling chordName={chordName} />
      </div>

      {/* ── Progression ────────────────────────────────────────────── */}
      {(chords.length > 0 || (globalProgression && globalProgression.length > 0)) && (
        <div style={{ ...card(), display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={LABEL_STYLE}>Progression {chords.length > 0 && `(${chords.length}/8)`}</p>

          {chords.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              {chords.map((c, i) => (
                <span
                  key={i}
                  draggable
                  onDragStart={() => onDragStart(i)}
                  onDragOver={e => e.preventDefault()}
                  onDrop={() => onDrop(i)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '5px 11px', borderRadius: 0,
                    background: T.bgDeep, border: `1px solid ${T.border}`,
                    fontSize: 13, fontWeight: 400, color: T.text,
                    cursor: 'grab', userSelect: 'none',
                  }}
                >
                  {c}
                  <button
                    onClick={() => setChords(prev => prev.filter((_, j) => j !== i))}
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: T.textMuted, fontSize: 15, lineHeight: 1 }}
                  >×</button>
                </span>
              ))}
              <button
                onClick={() => setChords([])}
                style={{ padding: '4px 10px', borderRadius: 0, background: 'none', border: `1px solid ${T.border}`, fontSize: 11, color: T.textMuted, cursor: 'pointer', fontWeight: 400, borderLeft: '3px solid var(--gc-bar-color)' }}
              >Clear</button>
            </div>
          )}

          {globalProgression && globalProgression.length > 0 && (
            <button
              onClick={importProgression}
              style={{
                alignSelf: 'flex-start', padding: '6px 14px', borderRadius: 0,
                border: `1px solid ${T.border}`, background: T.bgInput,
                color: T.textMuted, fontSize: 12, fontWeight: 400, cursor: 'pointer',
                borderLeft: '3px solid var(--gc-bar-color)',
              }}
            >
              ↓ Import my progression ({globalProgression.length})
            </button>
          )}
        </div>
      )}

      {/* ── Genre select ────────────────────────────────────────────── */}
      <div style={{ ...card({ padding: '10px 14px' }), display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ ...LABEL_STYLE, whiteSpace: 'nowrap' }}>Vibe</span>
        <div style={{ flex: 1, position: 'relative' }}>
          <select
            value={genre}
            onChange={e => setGenre(e.target.value as VoicingGenre)}
            style={{
              width: '100%', appearance: 'none', WebkitAppearance: 'none',
              padding: '8px 32px 8px 12px', borderRadius: 0,
              border: `1px solid ${T.border}`,
              background: T.bgInput, color: T.text,
              fontSize: 13, fontWeight: 400, cursor: 'pointer',
              outline: 'none', borderLeft: '3px solid var(--gc-bar-color)',
            }}
          >
            {GENRES.map(g => (
              <option key={g.id} value={g.id}>
                {g.label}{g.id !== 'any' ? ` — ${g.hint}` : ''}
              </option>
            ))}
          </select>
          <span style={{
            position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
            pointerEvents: 'none', color: T.textMuted, fontSize: 11,
          }}>▾</span>
        </div>
      </div>

      {/* ── Mode + String group — single card, two segmented controls ── */}
      <div style={{ ...card({ padding: '10px 14px' }), display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 130 }}>
          <span style={{ ...LABEL_STYLE, whiteSpace: 'nowrap' }}>Mode</span>
          <div style={{ display: 'flex', gap: 0, flex: 1 }}>
            {(['full', 'triads'] as VoicingMode[]).map(m => (
              <button key={m} onClick={() => setMode(m)} style={{
                flex: 1, padding: '7px 4px', borderRadius: 0,
                cursor: 'pointer', fontSize: 12, fontWeight: 400,
                background: mode === m ? T.secondary : T.bgInput,
                color: mode === m ? '#fff' : T.textMuted,
                borderLeft: '3px solid var(--gc-bar-color)',
                transition: 'background 0.1s',
              }}>
                {m === 'full' ? 'Full' : 'Triads'}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 160 }}>
          <span style={{ ...LABEL_STYLE, whiteSpace: 'nowrap' }}>Strings</span>
          <div style={{ display: 'flex', gap: 0, flex: 1 }}>
            {([
              { id: 'all',    label: 'All'  },
              { id: 'bass',   label: 'Low'  },
              { id: 'treble', label: 'High' },
            ] as { id: StringGroup; label: string }[]).map(sg => (
              <button key={sg.id} onClick={() => setStringGroup(sg.id)} style={{
                flex: 1, padding: '7px 4px', borderRadius: 0,
                cursor: 'pointer', fontSize: 12, fontWeight: 400,
                background: stringGroup === sg.id ? T.secondary : T.bgInput,
                color: stringGroup === sg.id ? '#fff' : T.textMuted,
                borderLeft: '3px solid var(--gc-bar-color)',
                transition: 'background 0.1s',
              }}>
                {sg.label}
              </button>
            ))}
          </div>
        </div>
      </div>
        </div>
      );

      const pathsRight = (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, ...(desktop ? { position: 'sticky' as const, top: 24 } : {}) }}>

      {/* ── AI Analysis — always visible when paths exist ───────────── */}
      {paths.length > 0 && (
        <AnalysisCard
          analysis={analysis}
          loading={analysisLoading}
          noKey={!import.meta.env.VITE_ANTHROPIC_API_KEY}
        />
      )}

      {/* ── Empty state ──────────────────────────────────────────────── */}
      {chords.length === 0 && (
        <div style={{ ...card(), textAlign: 'center', padding: '40px 16px' }}>
          <p style={{ margin: 0, fontSize: 14, color: T.textMuted, lineHeight: 1.6 }}>
            Build chords above and add them to the progression.<br />
            The engine will find intelligent voicing paths across the neck.
          </p>
        </div>
      )}

      {/* ── No paths ─────────────────────────────────────────────────── */}
      {chords.length > 0 && paths.length === 0 && (
        <div style={{ ...card(), textAlign: 'center', padding: '28px 16px' }}>
          <p style={{ margin: 0, fontSize: 14, color: T.textMuted }}>
            No paths found for this genre + string combination.<br />
            Try <b>Full</b> mode or <b>All</b> strings.
          </p>
        </div>
      )}

      {/* ── Path results ─────────────────────────────────────────────── */}
      {paths.length > 0 && (
        <div className="gc-result-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Path selector tabs */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={LABEL_STYLE}>Paths Found</p>
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
              {paths.map((path, pi) => {
                const c         = PATH_COLOR[path.label] ?? T.primary;
                const active    = pi === selectedIdx;
                const isAIPick  = analysis && analysis.recommendedPath === pi;
                return (
                  <button
                    key={path.id}
                    onClick={() => setSelectedIdx(pi)}
                    style={{
                      flexShrink: 0,
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '6px 12px', borderRadius: 0,
                      border: active ? 'none' : isAIPick ? `1px solid ${c}` : `1px solid ${T.border}`,
                      background: active ? c : T.bgDeep,
                      color: active ? '#fff' : T.textMuted,
                      fontSize: 12, fontWeight: active ? 500 : 400,
                      cursor: 'pointer', transition: 'all 0.15s',
                      whiteSpace: 'nowrap', borderLeft: '3px solid var(--gc-bar-color)',
                    }}
                  >
                    <span style={{
                      width: 16, height: 16, borderRadius: 0,
                      background: active ? 'rgba(255,255,255,0.3)' : c,
                      color: '#fff',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 9, fontWeight: 800, flexShrink: 0,
                    }}>{pi + 1}</span>
                    {active && activeEdit ? activeEdit.label : path.label}
                    {isAIPick && (
                      <span style={{
                        fontSize: 8, fontWeight: 800,
                        background: active ? 'rgba(255,255,255,0.25)' : c + '22',
                        color: active ? '#fff' : c,
                        border: active ? 'none' : `1px solid ${c}66`,
                        padding: '1px 5px', borderRadius: 0,
                      }}>✦ AI</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected path detail — minHeight prevents layout jump when switching paths */}
          {currentPath && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* Description + smoothness */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minHeight: 54 }}>
                <p style={{ margin: 0, fontSize: 12, color: T.textMuted, fontStyle: 'italic', lineHeight: 1.5 }}>
                  {currentPath.description}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 10, color: T.textDim, fontWeight: 400, textTransform: 'uppercase', letterSpacing: '-0.02em' }}>Smoothness</span>
                  <div style={{ display: 'flex', gap: 2 }}>
                    {[1, 2, 3, 4, 5].map(n => (
                      <span key={n} style={{
                        width: 8, height: 8, borderRadius: 0,
                        background: n <= currentPath.smoothness ? currentColor : T.border,
                        display: 'inline-block', transition: 'background 0.2s',
                      }} />
                    ))}
                  </div>
                </div>
              </div>

              {/* Chord diagrams — tap to enlarge, long-press to edit */}
              <p style={{ margin: 0, fontSize: 10, color: T.textDim, fontStyle: 'italic' }}>
                Tap a diagram to enlarge · long-press to swap the chord
              </p>
              <div className="gc-noselect" style={{
                display: 'flex', gap: 8, overflowX: 'auto',
                paddingBottom: 4, flexWrap: 'nowrap',
                minHeight: 148,
              }}>
                {currentPath.voicings.map((voicing, ci) => (
                  <button
                    key={ci}
                    onClick={() => { if (lpFired.current) { lpFired.current = false; return; } openModal(ci, currentPath.voicings, displayChords, currentColor); }}
                    onPointerDown={e => beginLongPress(ci, e.clientX, e.clientY)}
                    onPointerMove={e => moveLongPress(e.clientX, e.clientY)}
                    onPointerUp={endLongPress}
                    onPointerLeave={endLongPress}
                    onPointerCancel={endLongPress}
                    onContextMenu={e => e.preventDefault()}
                    style={{
                      flexShrink: 0, width: 120,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                      background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                      WebkitTouchCallout: 'none', userSelect: 'none',
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 800, color: currentColor }}>
                      {displayChords[ci]}
                    </span>
                    <div style={{
                      width: '100%', background: T.bgInput,
                      borderRadius: 0, border: `1px solid ${currentColor}33`,
                      padding: '4px 4px 2px', boxSizing: 'border-box',
                      transition: 'border-color 0.15s, box-shadow 0.15s',
                    }}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLDivElement).style.borderColor = currentColor + '88';
                        (e.currentTarget as HTMLDivElement).style.boxShadow   = `0 2px 12px ${currentColor}33`;
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLDivElement).style.borderColor = currentColor + '33';
                        (e.currentTarget as HTMLDivElement).style.boxShadow   = '';
                      }}
                    >
                      <MiniFretboard voicing={voicing} dotColor={currentColor} tuning={tuning.notes} />
                    </div>
                    <FretBadge voicing={voicing} color={currentColor} />
                  </button>
                ))}
              </div>

              {/* Play button */}
              <button
                onClick={() => playPath(currentPath)}
                className="gc-btn-heavy"
                style={{
                  width: '100%', padding: '13px 0', borderRadius: 0,
                  border: 'none',
                  background: isPlaying ? T.secondary : T.primary,
                  color: '#fff',
                  fontWeight: 400, fontSize: 14, letterSpacing: '0.04em', cursor: 'pointer',
                  transition: 'background 0.2s', borderLeft: `4px solid ${T.secondary}`,
                }}
              >
                {isPlaying ? 'STOP' : 'PLAY'}
              </button>

              {/* Save reads the DISPLAY state — an edited path stores its
                  swapped chords, voicings, recomputed smoothness and label. */}
              <SaveToLibraryButton
                label="Save to Library"
                getPayload={() => currentPath ? ({
                  kind: 'voicing',
                  name: `${displayChords.join(' – ')} · ${currentPath.label}`,
                  chords: displayChords,
                  path: {
                    label: currentPath.label,
                    description: currentPath.description,
                    smoothness: currentPath.smoothness,
                    voicings: currentPath.voicings,
                  },
                  settings: { genre, mode, stringGroup },
                }) : null}
                style={{ width: '100%', justifyContent: 'center', padding: '11px 0' }}
              />
            </div>
          )}
        </div>
      )}

        </div>
      );

      return desktop ? (
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 36, alignItems: 'start' }}>
          {pathsLeft}
          {pathsRight}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {pathsLeft}
          {pathsRight}
        </div>
      );
      })()}

      {subTab === 'voiceleading' && (() => {

        if (chords.length === 0) return (
          /* ── Empty state ─────────────────────────────────────────── */
          <div style={{ ...card(), textAlign: 'center', padding: '48px 20px' }}>
            <p style={{ margin: 0, fontSize: 14, color: T.textMuted, lineHeight: 1.7 }}>
              Build a progression in the <b>Paths</b> tab,<br />then come back here to trace any voice.
            </p>
          </div>
        );

        const vlLeft = (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* ── Progression with optional note names ─────────────── */}
            <div style={{ ...card({ padding: '12px 14px' }), display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={LABEL_STYLE}>Progression</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-start' }}>
                {chords.map((c, i) => {
                  const ivColor = isolate === 'root' ? INTERVAL_COLOR['1P']
                    : isolate === '3rd' ? INTERVAL_COLOR['3M']
                    : isolate === '5th' ? INTERVAL_COLOR['5P']
                    : isolate === '7th' ? INTERVAL_COLOR['7M'] : null;
                  const noteIdx = isolate
                    ? TonalChord.get(c).intervals.findIndex(iv => INTERVAL_GROUP[iv] === isolate)
                    : -1;
                  const noteName = noteIdx >= 0 ? TonalChord.get(c).notes[noteIdx] : null;
                  return (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                      <span style={{
                        padding: '5px 12px', borderRadius: 0,
                        background: noteName ? (ivColor! + '18') : T.bgDeep,
                        border: `1px solid ${noteName ? (ivColor! + '55') : T.border}`,
                        fontSize: 13, fontWeight: 400, color: T.text,
                      }}>{c}</span>
                      {noteName && ivColor && (
                        <span style={{ fontSize: 12, fontWeight: 800, color: ivColor }}>{noteName}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Path selector ────────────────────────────────────── */}
            {paths.length > 0 && (
              <div style={{ ...card({ padding: '12px 14px' }), display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p style={LABEL_STYLE}>Path</p>
                <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
                  {paths.map((path, pi) => {
                    const c      = PATH_COLOR[path.label] ?? T.primary;
                    const active = pi === selectedIdx;
                    return (
                      <button
                        key={path.id}
                        onClick={() => setSelectedIdx(pi)}
                        style={{
                          flexShrink: 0,
                          display: 'flex', alignItems: 'center', gap: 5,
                          padding: '5px 11px', borderRadius: 0,
                          border: active ? 'none' : `1px solid ${T.border}`,
                          background: active ? c : T.bgDeep,
                          color: active ? '#fff' : T.textMuted,
                          fontSize: 12, fontWeight: active ? 500 : 400,
                          cursor: 'pointer', transition: 'all 0.15s',
                          whiteSpace: 'nowrap', borderLeft: '3px solid var(--gc-bar-color)',
                        }}
                      >
                        <span style={{
                          width: 14, height: 14, borderRadius: 0,
                          background: active ? 'rgba(255,255,255,0.3)' : c,
                          color: '#fff', display: 'inline-flex', alignItems: 'center',
                          justifyContent: 'center', fontSize: 8, fontWeight: 800, flexShrink: 0,
                        }}>{pi + 1}</span>
                        {path.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Filter buttons ───────────────────────────────────── */}
            <div style={{ ...card({ padding: '14px 16px' }), display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <p style={LABEL_STYLE}>Isolate interval</p>
                {!isolate && (
                  <span style={{ fontSize: 11, color: T.textMuted, fontStyle: 'italic' }}>
                    ↑ בחר interval לראות ניתוח
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {([
                  { id: 'root', label: 'Root',  sub: '1',  color: INTERVAL_COLOR['1P'] },
                  { id: '3rd',  label: '3rd',   sub: '3',  color: INTERVAL_COLOR['3M'] },
                  { id: '5th',  label: '5th',   sub: '5',  color: INTERVAL_COLOR['5P'] },
                  { id: '7th',  label: '7th',   sub: '7',  color: INTERVAL_COLOR['7M'] },
                ] as { id: IsolateGroup; label: string; sub: string; color: string }[]).map(opt => {
                  const active = isolate === opt.id;
                  return (
                    <button
                      key={String(opt.id)}
                      onClick={() => setIsolate(active ? null : opt.id)}
                      style={{
                        flex: 1, minWidth: 60,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
                        padding: '8px 6px', borderRadius: 0,
                        border: active ? 'none' : `1px solid ${alpha(opt.color, 27)}`,
                        background: active ? opt.color : alpha(opt.color, 7),
                        // bgDeep = white on ink in light, night-black on sand in dark
                        color: active ? T.bgDeep : opt.color,
                        cursor: 'pointer', transition: 'all 0.15s',
                        borderLeft: '3px solid var(--gc-bar-color)',
                      }}
                    >
                      <span style={{ fontSize: 14, fontWeight: 800 }}>{opt.label}</span>
                      <span style={{ fontSize: 10, opacity: 0.75 }}>{opt.sub}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        );

        const vlRight = (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, ...(desktop ? { position: 'sticky' as const, top: 24 } : {}) }}>

            {/* ── Results ──────────────────────────────────────────── */}
            {isolate && currentPath ? (() => {
              const ivColor = isolate === 'root' ? INTERVAL_COLOR['1P']
                : isolate === '3rd' ? INTERVAL_COLOR['3M']
                : isolate === '5th' ? INTERVAL_COLOR['5P']
                : INTERVAL_COLOR['7M'];

              // Compute per-chord: the note name + filtered voicing
              const perChord = chords.map((chordName, ci) => {
                const voicing = currentPath.voicings[ci];
                const filtered = voicing.filter(p => {
                  const note = fretToNote(p.string, p.fret, tuning.notes);
                  const iv = getIntervalForNote(note, chordName);
                  return iv ? INTERVAL_GROUP[iv] === isolate : false;
                });
                // Canonical note from chord info (for text display)
                const info = TonalChord.get(chordName);
                const noteIdx = info.intervals.findIndex(iv => INTERVAL_GROUP[iv] === isolate);
                const noteName = noteIdx >= 0 ? info.notes[noteIdx] : '—';
                return { chordName, filtered, noteName };
              });

              return (
                <>
                  {/* Text: note sequence */}
                  <div className="gc-result-card" style={{ gap: 6 }}>
                    <p style={LABEL_STYLE}>Note movement</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      {perChord.map(({ chordName, noteName }, ci) => (
                        <React.Fragment key={ci}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                            <span style={{
                              fontSize: 22, fontWeight: 800, lineHeight: 1,
                              color: noteName === '—' ? T.textDim : ivColor,
                              opacity: noteName === '—' ? 0.4 : 1,
                            }}>
                              {noteName === '—' ? '∅' : noteName}
                            </span>
                            <span style={{ fontSize: 10, color: T.textDim, fontWeight: 600 }}>{chordName}</span>
                          </div>
                          {ci < perChord.length - 1 && (
                            <span style={{ fontSize: 16, color: T.textDim, fontWeight: 300, flexShrink: 0 }}>→</span>
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>

                  {/* Fretboard diagrams — only matching notes, clickable */}
                  <div style={{ ...card(), display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <p style={LABEL_STYLE}>On the neck — {currentPath.label}</p>
                    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, flexWrap: 'nowrap', minHeight: 120 }}>
                      {perChord.map(({ chordName, filtered }, ci) => {
                        const allDotColors = perChord.map((_pc, fi) =>
                          computeDotColors(currentPath.voicings[fi], chords[fi], isolate, tuning.notes, ivColor)
                        );
                        return (
                        <div
                          key={ci}
                          onClick={() => filtered.length > 0 && openModal(ci, currentPath.voicings, chords, ivColor, allDotColors)}
                          style={{
                            flexShrink: 0, width: 110,
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                            cursor: filtered.length > 0 ? 'pointer' : 'default',
                            opacity: filtered.length > 0 ? 1 : 0.38,
                          }}
                        >
                          <span style={{ fontSize: 12, fontWeight: 800, color: filtered.length > 0 ? ivColor : T.textDim }}>
                            {chordName}
                          </span>
                          <div style={{
                            width: '100%', background: T.bgInput,
                            borderRadius: 0,
                            border: `1px solid ${filtered.length > 0 ? alpha(ivColor, 20) : T.border}`,
                            padding: '4px 4px 2px', boxSizing: 'border-box',
                          }}>
                            {filtered.length > 0 ? (
                              <MiniFretboard voicing={filtered} dotColor={ivColor} tuning={tuning.notes} />
                            ) : (
                              <div style={{ height: 70, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                                <span style={{ fontSize: 16, color: T.textDim }}>∅</span>
                                <span style={{ fontSize: 9, color: T.textDim, textAlign: 'center', lineHeight: 1.3 }}>
                                  no {isolate}<br />in this chord
                                </span>
                              </div>
                            )}
                          </div>
                          {filtered.length > 0 && <FretBadge voicing={filtered} color={ivColor} />}
                        </div>
                        );
                      })}
                    </div>
                    <p style={{ margin: 0, fontSize: 10, color: T.textDim, fontStyle: 'italic' }}>
                      Tap a diagram to enlarge
                    </p>
                  </div>
                </>
              );
            })() : !isolate && (
              <div style={{ ...card({ padding: '24px 16px' }), textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: 13, color: T.textDim }}>
                  Select an interval above to trace its movement across the progression
                </p>
              </div>
            )}

            {paths.length === 0 && (
              <div style={{ ...card({ padding: '20px 16px' }), textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: 13, color: T.textMuted }}>
                  No paths found — switch to <b>Paths</b> and try Full + All strings.
                </p>
              </div>
            )}

          </div>
        );

        return desktop ? (
          <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 36, alignItems: 'start' }}>
            {vlLeft}
            {vlRight}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {vlLeft}
            {vlRight}
          </div>
        );
      })()}

      {subTab === 'harmonizer' && (
        <MelodyHarmonizerTab tuning={tuning} desktop={desktop} />
      )}

      {subTab === 'reharmonize' && (
        <div style={desktop && chords.length === 0 ? { maxWidth: 920, margin: '0 auto', width: '100%' } : undefined}>
          <ReharmonizeTab
            chords={chords}
            mode={mode}
            setMode={setMode}
            stringGroup={stringGroup}
            setStringGroup={setStringGroup}
            tuning={tuning}
            desktop={desktop}
            restored={reharmSeed}
            onRestoredConsumed={() => setReharmSeed(null)}
          />
        </div>
      )}

      {/* ── Modal ────────────────────────────────────────────────────── */}
      {modal && (
        <ChordModal
          voicings={modal.voicings}
          chordNames={modal.chordNames}
          index={modal.index}
          color={modal.color}
          tuning={tuning.notes}
          dotColors={modal.dotColors}
          onClose={() => setModal(null)}
        />
      )}

      {/* ── Micro-edit popover (long-press a Paths diagram) ──────────────── */}
      {microEdit && currentPath && (
        <ChordMicroEdit
          chordName={displayChords[microEdit.index]}
          prevChord={microEdit.index > 0 ? displayChords[microEdit.index - 1] : null}
          nextChord={microEdit.index < displayChords.length - 1 ? displayChords[microEdit.index + 1] : null}
          mode={mode}
          stringGroup={stringGroup}
          tuning={tuning}
          color={currentColor}
          onReplace={(name, voicing) => applyMicroEdit(microEdit.index, name, voicing)}
          onClose={() => setMicroEdit(null)}
        />
      )}
    </div>
  );
}
