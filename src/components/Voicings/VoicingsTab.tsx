import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import type { ChordInProgression, FretPosition, Tuning } from '../../types/music';
import { MiniFretboard } from '../Fretboard/MiniFretboard';
import { playChord, unlockAudio } from '../../utils/audioPlayback';
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
  'Open Drones':   '#8b6914',
  'Open Position': '#629677',
  'Lower Neck':    '#2a6a8a',
  'Mid Neck':      '#7a3a6a',
  'Upper Neck':    '#C44900',
  'High Neck':     '#9a3a3a',
};

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
  voicing: FretPosition[];
  chordName: string;
  color: string;
  tuning: string[];
  onClose: () => void;
}

function ChordModal({ voicing, chordName, color, tuning, onClose }: ModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

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
          padding: 24, maxWidth: 320, width: '100%',
          display: 'flex', flexDirection: 'column', gap: 14,
          boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 22, fontWeight: 800, color }}>{chordName}</span>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', color: T.textMuted,
              fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: '2px 6px',
            }}
          >×</button>
        </div>
        <div style={{
          background: T.bgInput, borderRadius: 12,
          border: `1px solid ${color}44`, padding: '8px 8px 4px',
        }}>
          <MiniFretboard
            voicing={voicing}
            dotColor={color}
            tuning={tuning}
            showStringLabels
            showFretNumbers
            hideFretLabel
          />
        </div>
        <FretBadge voicing={voicing} color={color} />
        <p style={{ margin: 0, fontSize: 11, color: T.textDim, textAlign: 'center' }}>
          Tap outside or press Esc to close
        </p>
      </div>
    </div>
  );
}

// ── AI Analysis card ──────────────────────────────────────────────────────

function AnalysisCard({ analysis, loading }: { analysis: MusicalAnalysis | null; loading: boolean }) {
  if (!loading && !analysis) return null;
  return (
    <div style={{
      ...card({ padding: '14px 16px' }),
      borderLeft: `3px solid ${T.primary}`,
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: T.primary }}>AI Analysis</span>
        {loading && (
          <span style={{ fontSize: 10, color: T.textDim, fontStyle: 'italic' }}>
            analyzing…
          </span>
        )}
        {analysis && (
          <span style={{
            padding: '2px 8px', borderRadius: 10,
            background: T.primarySoft, color: T.primary,
            fontSize: 10, fontWeight: 700,
          }}>
            {analysis.key}
          </span>
        )}
      </div>
      {analysis && (
        <>
          <p style={{ margin: 0, fontSize: 12, color: T.text, lineHeight: 1.6 }}>
            {analysis.character}
          </p>
          <p style={{
            margin: 0, fontSize: 11, color: T.textMuted,
            fontStyle: 'italic', paddingTop: 2,
            borderTop: `1px solid ${T.border}`,
          }}>
            Tip: {analysis.advice}
          </p>
        </>
      )}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────

export function VoicingsTab({ globalProgression, tuning = TUNINGS[0] }: Props) {
  // Chord builder
  const [root,  setRoot]  = useState('A');
  const [triad, setTriad] = useState('m');
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
  const [modal, setModal] = useState<{ voicing: FretPosition[]; chordName: string; color: string } | null>(null);

  // AI analysis
  const [analysis,        setAnalysis]        = useState<MusicalAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const analysisAbort = useRef<AbortController | null>(null);

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
    setAnalysis(null);
    setAnalysisLoading(true);
    let cancelled = false;
    analyzeProgression(chords, genreLabel).then(result => {
      if (!cancelled) {
        setAnalysis(result);
        setAnalysisLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [chords, genre, paths.length]);

  const addChord = () => {
    if (chords.length >= 8) return;
    setChords(prev => [...prev, chordName]);
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

  const openModal = useCallback((voicing: FretPosition[], name: string, color: string) => {
    setModal({ voicing, chordName: name, color });
  }, []);

  const currentPath: VoicingPath | undefined = paths[selectedIdx];
  const currentColor = currentPath ? (PATH_COLOR[currentPath.label] ?? T.primary) : T.primary;
  const isPlaying    = currentPath?.id === playingId;

  // ── Render ──────────────────────────────────────────────────────────────

  return (
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
                padding: '7px 0', borderRadius: 7, border: 'none',
                background: root === r ? T.primary : T.bgDeep,
                color: root === r ? '#fff' : T.textMuted,
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
                transition: 'background 0.12s',
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
                padding: '7px 12px', borderRadius: 7, border: 'none',
                background: triad === t.key ? T.secondary : T.bgDeep,
                color: triad === t.key ? '#fff' : T.textMuted,
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
                transition: 'background 0.12s',
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
                padding: '6px 11px', borderRadius: 7, border: 'none',
                background: activeExt === e.key ? T.secondary : T.bgDeep,
                color: activeExt === e.key ? '#fff' : T.textMuted,
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
                transition: 'background 0.12s',
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
            disabled={chords.length >= 8}
            style={{
              padding: '9px 20px', borderRadius: 8, border: 'none',
              background: chords.length < 8 ? T.secondary : T.border,
              color: '#fff', fontWeight: 700, fontSize: 14,
              cursor: chords.length < 8 ? 'pointer' : 'not-allowed',
              transition: 'background 0.15s',
            }}
          >
            + Add
          </button>
        </div>
      </div>

      {/* ── Progression ────────────────────────────────────────────── */}
      {(chords.length > 0 || (globalProgression && globalProgression.length > 0)) && (
        <div style={{ ...card(), display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={LABEL_STYLE}>Progression {chords.length > 0 && `(${chords.length}/8)`}</p>

          {chords.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              {chords.map((c, i) => (
                <span key={i} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '5px 11px', borderRadius: 20,
                  background: T.bgDeep, border: `1px solid ${T.border}`,
                  fontSize: 13, fontWeight: 700, color: T.text,
                }}>
                  {i > 0 && <span style={{ color: T.textDim, fontSize: 10, marginRight: 2 }}>→</span>}
                  {c}
                  <button
                    onClick={() => setChords(prev => prev.filter((_, j) => j !== i))}
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: T.textMuted, fontSize: 15, lineHeight: 1 }}
                  >×</button>
                </span>
              ))}
              <button
                onClick={() => setChords([])}
                style={{ padding: '4px 10px', borderRadius: 20, background: 'none', border: `1px solid ${T.border}`, fontSize: 11, color: T.textMuted, cursor: 'pointer', fontWeight: 600 }}
              >Clear</button>
            </div>
          )}

          {globalProgression && globalProgression.length > 0 && (
            <button
              onClick={importProgression}
              style={{
                alignSelf: 'flex-start', padding: '6px 14px', borderRadius: 8,
                border: `1px solid ${T.border}`, background: T.bgInput,
                color: T.textMuted, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}
            >
              ↓ Import my progression ({globalProgression.length})
            </button>
          )}
        </div>
      )}

      {/* ── Genre chips ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p style={LABEL_STYLE}>Vibe</p>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
          {GENRES.map(g => (
            <button key={g.id} onClick={() => setGenre(g.id)} style={{
              flexShrink: 0, padding: '7px 15px', borderRadius: 20,
              border: genre === g.id ? 'none' : `1px solid ${T.border}`,
              background: genre === g.id ? T.primary : T.bgInput,
              color: genre === g.id ? '#fff' : T.textMuted,
              fontSize: 12, fontWeight: genre === g.id ? 700 : 400,
              cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
            }}>
              {g.label}
            </button>
          ))}
        </div>
        {genre !== 'any' && (
          <p style={{ margin: 0, fontSize: 11, color: T.textMuted, fontStyle: 'italic' }}>
            {GENRES.find(g => g.id === genre)?.hint}
          </p>
        )}
      </div>

      {/* ── Mode + String group ──────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ ...card({ padding: '10px 14px' }), display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 155 }}>
          <span style={{ ...LABEL_STYLE, whiteSpace: 'nowrap' }}>Mode</span>
          <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: `1px solid ${T.border}`, flex: 1 }}>
            {(['full', 'triads'] as VoicingMode[]).map(m => (
              <button key={m} onClick={() => setMode(m)} style={{
                flex: 1, padding: '6px 0', border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 700,
                background: mode === m ? T.secondary : T.bgInput,
                color: mode === m ? '#fff' : T.textMuted,
                transition: 'background 0.15s',
              }}>
                {m === 'full' ? 'Full' : 'Triads'}
              </button>
            ))}
          </div>
        </div>

        <div style={{ ...card({ padding: '10px 14px' }), display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 190 }}>
          <span style={{ ...LABEL_STYLE, whiteSpace: 'nowrap' }}>Strings</span>
          <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: `1px solid ${T.border}`, flex: 1 }}>
            {(['all', 'bass', 'treble'] as StringGroup[]).map(sg => (
              <button key={sg} onClick={() => setStringGroup(sg)} style={{
                flex: 1, padding: '6px 0', border: 'none', cursor: 'pointer',
                fontSize: 11, fontWeight: 700,
                background: stringGroup === sg ? T.secondary : T.bgInput,
                color: stringGroup === sg ? '#fff' : T.textMuted,
                transition: 'background 0.15s',
              }}>
                {sg === 'all' ? 'All' : sg.charAt(0).toUpperCase() + sg.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── AI Analysis ─────────────────────────────────────────────── */}
      {(analysisLoading || analysis) && (
        <AnalysisCard analysis={analysis} loading={analysisLoading} />
      )}

      {/* ── Empty state ──────────────────────────────────────────────── */}
      {chords.length === 0 && (
        <div style={{ ...card(), textAlign: 'center', padding: '40px 16px' }}>
          <div style={{ fontSize: 30, marginBottom: 10 }}>🎸</div>
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
                const c      = PATH_COLOR[path.label] ?? T.primary;
                const active = pi === selectedIdx;
                return (
                  <button
                    key={path.id}
                    onClick={() => setSelectedIdx(pi)}
                    style={{
                      flexShrink: 0,
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '6px 12px', borderRadius: 20,
                      border: active ? 'none' : `1px solid ${T.border}`,
                      background: active ? c : T.bgDeep,
                      color: active ? '#fff' : T.textMuted,
                      fontSize: 12, fontWeight: active ? 700 : 400,
                      cursor: 'pointer', transition: 'all 0.15s',
                      whiteSpace: 'nowrap',
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
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected path detail */}
          {currentPath && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* Description + smoothness */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
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
                paddingBottom: 4,
                /* On wider screens, allow wrapping instead of scroll */
                flexWrap: 'nowrap',
              }}>
                {currentPath.voicings.map((voicing, ci) => (
                  <button
                    key={ci}
                    onClick={() => openModal(voicing, chords[ci], currentColor)}
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
                  padding: '11px 0', borderRadius: 10,
                  border: isPlaying ? `2px solid ${currentColor}` : '2px solid transparent',
                  background: isPlaying ? T.bgDeep : currentColor,
                  color: isPlaying ? currentColor : '#fff',
                  fontWeight: 800, fontSize: 14, cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                {isPlaying ? '■  Stop' : `▶  Play — ${currentPath.label}`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Modal ────────────────────────────────────────────────────── */}
      {modal && (
        <ChordModal
          voicing={modal.voicing}
          chordName={modal.chordName}
          color={modal.color}
          tuning={tuning.notes}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
