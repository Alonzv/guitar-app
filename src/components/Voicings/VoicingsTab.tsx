import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Chord as TonalChord, Note as TonalNote } from '@tonaljs/tonal';
import type { ChordInProgression, FretPosition, Tuning } from '../../types/music';
import { MiniFretboard } from '../Fretboard/MiniFretboard';
import { playChord, unlockAudio } from '../../utils/audioPlayback';
import { fretToNote } from '../../utils/musicTheory';
import {
  findVoicingPaths,
  type VoicingGenre,
  type VoicingMode,
  type StringGroup,
  type VoicingPath,
} from '../../utils/voicingPaths';
import { analyzeProgression, type MusicalAnalysis } from '../../utils/musicalAnalysis';
import { TUNINGS } from '../../utils/musicTheory';
import { T, card } from '../../theme';
import { ReharmonizeTab } from './ReharmonizeTab';

interface Props {
  globalProgression?: ChordInProgression[];
  tuning?: Tuning;
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
  'Open Drones':   '#C8A020',  // gold
  'Open Position': '#1A7A4A',  // forest green
  'Lower Neck':    '#1235FC',  // blue
  'Mid Neck':      '#CC1C1C',  // red
  'Upper Neck':    '#6B21A8',  // deep purple
  'High Neck':     '#2D2D2D',  // graphite
};

// ── Interval display ──────────────────────────────────────────────────────

export type IsolateGroup = null | 'root' | '3rd' | '5th' | '7th';

const INTERVAL_COLOR: Record<string, string> = {
  '1P': '#CC1C1C',               // Root — red
  '3m': '#1A7A4A', '3M': '#1A7A4A', // 3rd — green
  '5P': '#C8A020', '5A': '#C8A020', '5d': '#C8A020', // 5th — gold
  '7m': '#1235FC', '7M': '#1235FC', '7d': '#1235FC', // 7th — blue
  '9M': '#6B21A8', '9m': '#6B21A8', '9A': '#6B21A8', // ext — purple
  '11P': '#6B21A8', '11A': '#6B21A8',
  '13M': '#6B21A8', '13m': '#6B21A8',
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
            padding: '5px 10px', borderRadius: 8,
            background: color + '18', border: `1px solid ${color}44`,
            minWidth: 34,
          }}>
            <span style={{ fontSize: 15, fontWeight: 800, color, lineHeight: 1.1 }}>{note}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color, lineHeight: 1.3 }}>{short}</span>
            <span style={{ fontSize: 8, color: color + 'aa', lineHeight: 1.2, whiteSpace: 'nowrap' }}>{name}</span>
          </div>
        );
      })}
    </div>
  );
}

const LABEL_STYLE: React.CSSProperties = {
  margin: 0,
  fontSize: 11,
  fontWeight: 700,
  color: T.textMuted,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};

// Fret position badge: colored pill showing the barre/position fret number
function FretBadge({ voicing, color }: { voicing: FretPosition[]; color: string }) {
  const nonOpen = voicing.filter(p => p.fret > 0);
  const hasOpen = voicing.some(p => p.fret === 0);
  const lowestFret = nonOpen.length ? Math.min(...nonOpen.map(p => p.fret)) : 0;

  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 7px', borderRadius: 10,
      background: color + '22',
      border: `1px solid ${color}55`,
      fontSize: 10, fontWeight: 700, color,
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
    fontSize: 18, fontWeight: 700, lineHeight: 1,
    opacity: disabled ? 0.35 : 1,
    transition: 'opacity 0.15s',
    boxShadow: 'var(--gc-offset-sm)',
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
          background: T.bgCard, borderRadius: 18,
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
          background: T.bgInput, borderRadius: 12,
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
            padding: '2px 8px', borderRadius: 10,
            background: T.primarySoft, color: T.primary,
            fontSize: 10, fontWeight: 700,
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
                direction: 'rtl', textAlign: 'right', fontWeight: 600,
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

export function VoicingsTab({ globalProgression, tuning = TUNINGS[0] }: Props) {
  // Chord builder
  const [root,  setRoot]  = useState('');
  const [triad, setTriad] = useState('');
  const [ext,   setExt]   = useState('');

  // Progression
  const [chords, setChords] = useState<string[]>([]);

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

  // Sub-tab
  const [subTab, setSubTab] = useState<'paths' | 'voiceleading' | 'reharmonize'>('paths');

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

  // Reset state when paths change
  useEffect(() => {
    setSelectedIdx(0);
    playTimers.current.forEach(clearTimeout);
    playTimers.current = [];
    setPlayingId(null);
  }, [paths]);

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
        // Auto-select the AI-recommended path
        if (result) setSelectedIdx(result.recommendedPath);
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

  const currentPath: VoicingPath | undefined = paths[selectedIdx];
  const currentColor = currentPath ? (PATH_COLOR[currentPath.label] ?? T.primary) : T.primary;
  const isPlaying    = currentPath?.id === playingId;

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Sub-tab selector ───────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 4 }}>
        {([
          { id: 'paths',        label: 'Paths'         },
          { id: 'voiceleading', label: 'Voice Leading' },
          { id: 'reharmonize',  label: 'Re-Harmonize'  },
        ] as { id: 'paths' | 'voiceleading' | 'reharmonize'; label: string }[]).map(tab => (
          <button key={tab.id} onClick={() => setSubTab(tab.id)} style={{
            flex: 1, padding: '11px 4px', borderRadius: 0, border: 'none',
            background: subTab === tab.id ? T.secondary : T.bgInput,
            color: subTab === tab.id ? '#fff' : T.textMuted,
            fontSize: 14, cursor: 'pointer',
            boxShadow: 'var(--gc-offset-sm)',
            transition: 'background 0.1s',
          }}>
            <span><span style={{ fontWeight: 700, opacity: 0.4, letterSpacing: '-0.5em' }}>_</span><span style={{ fontWeight: 700 }}>{tab.label}</span></span>
          </button>
        ))}
      </div>

      {subTab === 'paths' && <>

      {/* ── Chord builder ──────────────────────────────────────────── */}
      <div style={{ ...card(), display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={LABEL_STYLE}>Build Chord</p>

        {/* Root note grid */}
        <div>
          <p style={{ ...LABEL_STYLE, fontSize: 10, marginBottom: 6 }}>Root Note</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4 }}>
            {ROOTS.map(r => (
              <button key={r} onClick={() => setRoot(r)} style={{
                padding: '7px 0', borderRadius: 0, border: 'none',
                background: root === r ? T.primary : T.bgDeep,
                color: root === r ? '#fff' : T.textMuted,
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
                transition: 'background 0.12s', boxShadow: 'var(--gc-offset-sm)',
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
                padding: '7px 12px', borderRadius: 0, border: 'none',
                background: triad === t.key ? T.secondary : T.bgDeep,
                color: triad === t.key ? '#fff' : T.textMuted,
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
                transition: 'background 0.12s', boxShadow: 'var(--gc-offset-sm)',
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
                padding: '6px 11px', borderRadius: 0, border: 'none',
                background: activeExt === e.key ? T.secondary : T.bgDeep,
                color: activeExt === e.key ? '#fff' : T.textMuted,
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
                transition: 'background 0.12s', boxShadow: 'var(--gc-offset-sm)',
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
              padding: '9px 20px', borderRadius: 0, border: 'none',
              background: (root && triad && chords.length < 8) ? T.secondary : T.border,
              color: '#fff', fontWeight: 700, fontSize: 14,
              cursor: (root && triad && chords.length < 8) ? 'pointer' : 'not-allowed',
              transition: 'background 0.15s', boxShadow: 'var(--gc-offset-sm)',
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
                    padding: '5px 11px', borderRadius: 20,
                    background: T.bgDeep, border: `1px solid ${T.border}`,
                    fontSize: 13, fontWeight: 700, color: T.text,
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
                style={{ padding: '4px 10px', borderRadius: 0, background: 'none', border: `1px solid ${T.border}`, fontSize: 11, color: T.textMuted, cursor: 'pointer', fontWeight: 600, boxShadow: 'var(--gc-offset-sm)' }}
              >Clear</button>
            </div>
          )}

          {globalProgression && globalProgression.length > 0 && (
            <button
              onClick={importProgression}
              style={{
                alignSelf: 'flex-start', padding: '6px 14px', borderRadius: 0,
                border: `1px solid ${T.border}`, background: T.bgInput,
                color: T.textMuted, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                boxShadow: 'var(--gc-offset-sm)',
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
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              outline: 'none', boxShadow: 'var(--gc-offset-sm)',
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
          <div style={{ display: 'flex', gap: 3, flex: 1 }}>
            {(['full', 'triads'] as VoicingMode[]).map(m => (
              <button key={m} onClick={() => setMode(m)} style={{
                flex: 1, padding: '7px 4px', borderRadius: 0, border: 'none',
                cursor: 'pointer', fontSize: 12, fontWeight: 700,
                background: mode === m ? T.secondary : T.bgInput,
                color: mode === m ? '#fff' : T.textMuted,
                boxShadow: 'var(--gc-offset-sm)',
                transition: 'background 0.1s',
              }}>
                {m === 'full' ? 'Full' : 'Triads'}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 160 }}>
          <span style={{ ...LABEL_STYLE, whiteSpace: 'nowrap' }}>Strings</span>
          <div style={{ display: 'flex', gap: 3, flex: 1 }}>
            {([
              { id: 'all',    label: 'All'  },
              { id: 'bass',   label: 'Low'  },
              { id: 'treble', label: 'High' },
            ] as { id: StringGroup; label: string }[]).map(sg => (
              <button key={sg.id} onClick={() => setStringGroup(sg.id)} style={{
                flex: 1, padding: '7px 4px', borderRadius: 0, border: 'none',
                cursor: 'pointer', fontSize: 12, fontWeight: 700,
                background: stringGroup === sg.id ? T.secondary : T.bgInput,
                color: stringGroup === sg.id ? '#fff' : T.textMuted,
                boxShadow: 'var(--gc-offset-sm)',
                transition: 'background 0.1s',
              }}>
                {sg.label}
              </button>
            ))}
          </div>
        </div>
      </div>

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
        <div style={{ ...card(), display: 'flex', flexDirection: 'column', gap: 14 }}>

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
                      fontSize: 12, fontWeight: active ? 700 : 400,
                      cursor: 'pointer', transition: 'all 0.15s',
                      whiteSpace: 'nowrap', boxShadow: 'var(--gc-offset-sm)',
                    }}
                  >
                    <span style={{
                      width: 16, height: 16, borderRadius: '50%',
                      background: active ? 'rgba(255,255,255,0.3)' : c,
                      color: '#fff',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 9, fontWeight: 800, flexShrink: 0,
                    }}>{pi + 1}</span>
                    {path.label}
                    {isAIPick && (
                      <span style={{
                        fontSize: 8, fontWeight: 800,
                        background: active ? 'rgba(255,255,255,0.25)' : c + '22',
                        color: active ? '#fff' : c,
                        border: active ? 'none' : `1px solid ${c}66`,
                        padding: '1px 5px', borderRadius: 6,
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
                  <span style={{ fontSize: 10, color: T.textDim, fontWeight: 600 }}>Smoothness</span>
                  <div style={{ display: 'flex', gap: 2 }}>
                    {[1, 2, 3, 4, 5].map(n => (
                      <span key={n} style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: n <= currentPath.smoothness ? currentColor : T.border,
                        display: 'inline-block', transition: 'background 0.2s',
                      }} />
                    ))}
                  </div>
                </div>
              </div>

              {/* Chord diagrams — tap to enlarge */}
              <p style={{ margin: 0, fontSize: 10, color: T.textDim, fontStyle: 'italic' }}>
                Tap a diagram to enlarge
              </p>
              <div style={{
                display: 'flex', gap: 8, overflowX: 'auto',
                paddingBottom: 4, flexWrap: 'nowrap',
                minHeight: 148,
              }}>
                {currentPath.voicings.map((voicing, ci) => (
                  <button
                    key={ci}
                    onClick={() => openModal(ci, currentPath.voicings, chords, currentColor)}
                    style={{
                      flexShrink: 0, width: 120,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                      background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 800, color: currentColor }}>
                      {chords[ci]}
                    </span>
                    <div style={{
                      width: '100%', background: T.bgInput,
                      borderRadius: 10, border: `1px solid ${currentColor}33`,
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
                style={{
                  padding: '11px 0', borderRadius: 0,
                  border: isPlaying ? `2px solid ${currentColor}` : '2px solid transparent',
                  background: isPlaying ? T.bgDeep : currentColor,
                  color: isPlaying ? currentColor : '#fff',
                  fontWeight: 800, fontSize: 14, cursor: 'pointer',
                  transition: 'all 0.2s', boxShadow: 'var(--gc-offset)',
                }}
              >
                {isPlaying ? '■  Stop' : `▶  Play — ${currentPath.label}`}
              </button>
            </div>
          )}
        </div>
      )}

      </> /* end subTab === 'paths' */}

      {subTab === 'voiceleading' && <>

        {chords.length === 0 ? (
          /* ── Empty state ─────────────────────────────────────────── */
          <div style={{ ...card(), textAlign: 'center', padding: '48px 20px' }}>
            <p style={{ margin: 0, fontSize: 14, color: T.textMuted, lineHeight: 1.7 }}>
              Build a progression in the <b>Paths</b> tab,<br />then come back here to trace any voice.
            </p>
          </div>
        ) : (
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
                        padding: '5px 12px', borderRadius: 20,
                        background: noteName ? (ivColor! + '18') : T.bgDeep,
                        border: `1px solid ${noteName ? (ivColor! + '55') : T.border}`,
                        fontSize: 13, fontWeight: 700, color: T.text,
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
                          fontSize: 12, fontWeight: active ? 700 : 400,
                          cursor: 'pointer', transition: 'all 0.15s',
                          whiteSpace: 'nowrap', boxShadow: 'var(--gc-offset-sm)',
                        }}
                      >
                        <span style={{
                          width: 14, height: 14, borderRadius: '50%',
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
                        border: active ? 'none' : `1px solid ${opt.color}44`,
                        background: active ? opt.color : opt.color + '12',
                        color: active ? '#fff' : opt.color,
                        cursor: 'pointer', transition: 'all 0.15s',
                        boxShadow: 'var(--gc-offset-sm)',
                      }}
                    >
                      <span style={{ fontSize: 14, fontWeight: 800 }}>{opt.label}</span>
                      <span style={{ fontSize: 10, opacity: 0.75 }}>{opt.sub}</span>
                    </button>
                  );
                })}
              </div>
            </div>

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
                  <div style={{
                    ...card({ padding: '16px 18px' }),
                    display: 'flex', flexDirection: 'column', gap: 6,
                  }}>
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
                            borderRadius: 10,
                            border: `1px solid ${filtered.length > 0 ? ivColor + '33' : T.border}`,
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
        )}

      </> /* end subTab === 'voiceleading' */}

      {subTab === 'reharmonize' && (
        <ReharmonizeTab
          chords={chords}
          mode={mode}
          setMode={setMode}
          stringGroup={stringGroup}
          setStringGroup={setStringGroup}
          tuning={tuning}
        />
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
    </div>
  );
}
