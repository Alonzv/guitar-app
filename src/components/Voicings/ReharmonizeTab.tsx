import React, { useState, useRef, useEffect } from 'react';
import { Chord as TonalChord, Note as TonalNote } from '@tonaljs/tonal';
import type { FretPosition, Tuning } from '../../types/music';
import { MiniFretboard } from '../Fretboard/MiniFretboard';
import { playChord, unlockAudio } from '../../utils/audioPlayback';
import {
  findVoicingPaths,
  type VoicingMode,
  type StringGroup,
  type VoicingPath,
} from '../../utils/voicingPaths';
import { reharmonize, type ReharmonizeResult } from '../../utils/reharmonize';
import { exportMidi } from '../../utils/midiExport';
import { T, card } from '../../theme';

interface Props {
  chords: string[];
  mode: VoicingMode;
  setMode: (m: VoicingMode) => void;
  stringGroup: StringGroup;
  setStringGroup: (sg: StringGroup) => void;
  tuning: Tuning;
}

const LABEL_STYLE: React.CSSProperties = {
  margin: 0,
  fontSize: 11,
  fontWeight: 700,
  color: T.textMuted,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};

// Fret position badge
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

// ── Enlarged chord modal ──────────────────────────────────────────────────────
function ReharmModal({
  voicings, chordNames, index: initial, color, tuning, onClose,
}: {
  voicings: FretPosition[][];
  chordNames: string[];
  index: number;
  color: string;
  tuning: string[];
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(initial);
  const total = voicings.length;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft')  setIdx(i => Math.max(0, i - 1));
      else if (e.key === 'ArrowRight') setIdx(i => Math.min(total - 1, i + 1));
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose, total]);

  const navStyle = (disabled: boolean): React.CSSProperties => ({
    flex: 1, padding: '10px 16px', borderRadius: 10,
    border: `1px solid ${T.border}`,
    background: disabled ? T.bgDeep : T.bgInput,
    color: disabled ? T.textDim : T.text,
    cursor: disabled ? 'default' : 'pointer',
    fontSize: 18, fontWeight: 700, opacity: disabled ? 0.35 : 1,
    transition: 'opacity 0.15s',
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 22, fontWeight: 800, color }}>{chordNames[idx]}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: T.textDim, fontWeight: 600 }}>{idx + 1} / {total}</span>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: T.textMuted, fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: '2px 6px' }}>×</button>
          </div>
        </div>
        <div style={{ background: T.bgInput, borderRadius: 12, border: `1px solid ${color}44`, padding: '8px 8px 4px' }}>
          <MiniFretboard voicing={voicings[idx]} dotColor={color} tuning={tuning} showStringLabels showFretNumbers hideFretLabel />
        </div>
        <FretBadge voicing={voicings[idx]} color={color} />
        {total > 1 && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setIdx(i => Math.max(0, i - 1))}          disabled={idx === 0}          style={navStyle(idx === 0)}>‹</button>
            <button onClick={() => setIdx(i => Math.min(total - 1, i + 1))}  disabled={idx === total - 1}  style={navStyle(idx === total - 1)}>›</button>
          </div>
        )}
        <p style={{ margin: 0, fontSize: 10, color: T.textDim, textAlign: 'center' }}>← → keys to navigate · Esc to close</p>
      </div>
    </div>
  );
}

const GENRES: { id: string; label: string }[] = [
  { id: 'jazz', label: 'Jazz / Neo-Soul' },
  { id: 'blues', label: 'Blues' },
  { id: 'rock', label: 'Rock' },
  { id: 'desert', label: 'Desert Noir' },
  { id: 'country', label: 'Country' },
];

function tensionLabel(t: number): string {
  if (t <= 2) return 'Simple';
  if (t === 3) return 'Extended';
  return 'Altered';
}

// Nashville Number System helper
function toNashville(chordName: string, keyRoot: string): string {
  const info = TonalChord.get(chordName);
  if (!info || info.notes.length === 0) return chordName;

  const chordRootPc = TonalNote.chroma(info.tonic ?? info.notes[0]);
  const keyRootPc = TonalNote.chroma(keyRoot);
  if (chordRootPc == null || keyRootPc == null) return chordName;

  const semidiff = ((chordRootPc - keyRootPc) + 12) % 12;

  const DEGREE_MAP: Record<number, string> = {
    0: '1', 2: '2', 4: '3', 5: '4', 7: '5', 9: '6', 11: '7',
  };

  let degree: string;
  if (DEGREE_MAP[semidiff] !== undefined) {
    degree = DEGREE_MAP[semidiff];
  } else {
    // Use flat prefix for chromatic notes
    const above = (semidiff + 1) % 12;
    degree = 'b' + (DEGREE_MAP[above] ?? semidiff.toString());
  }

  // Append quality suffix
  const aliases = info.aliases ?? [];
  const type = info.type ?? '';
  const quality = info.quality ?? '';

  let suffix = '';
  if (type.includes('half-diminished') || aliases.some(a => a.includes('m7b5'))) {
    suffix = 'o';
  } else if (type.includes('diminished')) {
    suffix = 'o';
  } else if (quality === 'Diminished') {
    suffix = 'o';
  } else if (type.includes('sus')) {
    suffix = 'sus';
  } else if (type.includes('major') && type.includes('7')) {
    suffix = 'maj7';
  } else if (quality === 'Major' && type.includes('7')) {
    suffix = 'maj7';
  } else if (type.includes('dominant') || (quality !== 'Major' && quality !== 'Minor' && type.includes('7'))) {
    suffix = '7';
  } else if (quality === 'Minor') {
    suffix = 'm';
  }

  return degree + suffix;
}

export function ReharmonizeTab({
  chords,
  mode,
  setMode,
  stringGroup,
  setStringGroup,
  tuning,
}: Props) {
  const [genre, setGenre] = useState('jazz');
  const [tension, setTension] = useState(3);
  const [showNashville, setShowNashville] = useState(false);
  const [result, setResult] = useState<ReharmonizeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reharmPaths, setReharmPaths] = useState<VoicingPath[]>([]);
  const [selectedPathIdx, setSelectedPathIdx] = useState(0);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [modalIdx, setModalIdx] = useState<number | null>(null);
  const playTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Key root = first chord's root
  const keyRoot = chords.length > 0
    ? (TonalChord.get(chords[0]).tonic ?? TonalChord.get(chords[0]).notes[0] ?? 'C')
    : 'C';

  const handleReharmonize = () => {
    if (chords.length === 0 || loading) return;
    setLoading(true);
    setResult(null);
    setError(null);
    setReharmPaths([]);
    setSelectedPathIdx(0);
    setPlayingId(null);
    playTimers.current.forEach(clearTimeout);
    playTimers.current = [];

    const genreLabel = GENRES.find(g => g.id === genre)?.label ?? genre;

    reharmonize(chords, genreLabel, tension).then(r => {
      setLoading(false);
      if (r) {
        setResult(r);
        const paths = findVoicingPaths(r.chords, {
          genre: 'any',
          mode,
          stringGroup,
          tuning: tuning.notes,
        });
        setReharmPaths(paths);
        setSelectedPathIdx(0);
      } else {
        setError('לא ניתן לבצע הרמוניזציה מחדש. בדוק שמפתח ה-API מוגדר.');
      }
    }).catch(() => {
      setLoading(false);
      setError('שגיאת רשת — נסה שוב.');
    });
  };

  const currentPath: VoicingPath | undefined = reharmPaths[selectedPathIdx];
  const currentColor = T.primary;

  const handlePlay = () => {
    if (!currentPath) return;
    playTimers.current.forEach(clearTimeout);
    playTimers.current = [];

    if (playingId === currentPath.id) {
      setPlayingId(null);
      return;
    }

    setPlayingId(currentPath.id);
    unlockAudio();

    currentPath.voicings.forEach((v, i) => {
      const t = setTimeout(() => {
        playChord(v, tuning.openFreqs);
        if (i === currentPath.voicings.length - 1) {
          const done = setTimeout(() => setPlayingId(null), 1400);
          playTimers.current.push(done);
        }
      }, i * 1300);
      playTimers.current.push(t);
    });
  };

  const isPlaying = currentPath?.id === playingId;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Empty state */}
      {chords.length === 0 && (
        <div style={{ ...card(), textAlign: 'center', padding: '40px 16px' }}>
          <p style={{ margin: 0, fontSize: 14, color: T.textMuted, lineHeight: 1.6 }}>
            Build a progression in the Paths tab first
          </p>
        </div>
      )}

      {chords.length > 0 && (
        <>
          {/* Original Progression card */}
          <div style={{ ...card({ padding: '12px 14px' }), display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <p style={LABEL_STYLE}>Original</p>
              <button
                onClick={() => setShowNashville(v => !v)}
                style={{
                  padding: '3px 10px', borderRadius: 12, border: 'none',
                  cursor: 'pointer', fontSize: 11, fontWeight: 600,
                  background: showNashville ? T.secondary : T.bgInput,
                  color: showNashville ? '#fff' : T.textMuted,
                  transition: 'background 0.15s',
                }}
              >
                Nashville
              </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {chords.map((c, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <span style={{
                    padding: '5px 12px', borderRadius: 20,
                    background: T.bgDeep, border: `1px solid ${T.border}`,
                    fontSize: 13, fontWeight: 700, color: T.text,
                  }}>
                    {c}
                  </span>
                  {showNashville && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: T.textMuted }}>
                      {toNashville(c, keyRoot)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Controls card */}
          <div style={{ ...card(), display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Genre pills */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <p style={LABEL_STYLE}>Genre</p>
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
                {GENRES.map(g => (
                  <button
                    key={g.id}
                    onClick={() => setGenre(g.id)}
                    style={{
                      flexShrink: 0,
                      padding: '5px 14px', borderRadius: 20, border: 'none',
                      cursor: 'pointer', fontSize: 12,
                      fontWeight: genre === g.id ? 600 : 400,
                      background: genre === g.id ? T.primary : T.bgInput,
                      color: genre === g.id ? '#fff' : T.textMuted,
                      transition: 'background 0.15s',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tension slider */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <p style={LABEL_STYLE}>Tension</p>
                <span style={{
                  padding: '2px 8px', borderRadius: 10,
                  background: T.primarySoft, color: T.primary,
                  fontSize: 11, fontWeight: 700,
                }}>
                  {tension} — {tensionLabel(tension)}
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={5}
                step={1}
                value={tension}
                onChange={e => setTension(Number(e.target.value))}
                style={{ width: '100%', accentColor: T.primary, cursor: 'pointer' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 9, color: T.textDim }}>Simple</span>
                <span style={{ fontSize: 9, color: T.textDim }}>Extended</span>
                <span style={{ fontSize: 9, color: T.textDim }}>Altered</span>
              </div>
            </div>

            {/* Mode + StringGroup */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 130 }}>
                <span style={{ ...LABEL_STYLE, whiteSpace: 'nowrap' }}>Mode</span>
                <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: `1px solid ${T.border}`, flex: 1 }}>
                  {(['full', 'triads'] as VoicingMode[]).map(m => (
                    <button key={m} onClick={() => setMode(m)} style={{
                      flex: 1, padding: '7px 0', border: 'none', cursor: 'pointer',
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

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 160 }}>
                <span style={{ ...LABEL_STYLE, whiteSpace: 'nowrap' }}>Strings</span>
                <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: `1px solid ${T.border}`, flex: 1 }}>
                  {([
                    { id: 'all',    label: 'All'  },
                    { id: 'bass',   label: 'Low'  },
                    { id: 'treble', label: 'High' },
                  ] as { id: StringGroup; label: string }[]).map(sg => (
                    <button key={sg.id} onClick={() => setStringGroup(sg.id)} style={{
                      flex: 1, padding: '7px 0', border: 'none', cursor: 'pointer',
                      fontSize: 12, fontWeight: 700,
                      background: stringGroup === sg.id ? T.secondary : T.bgInput,
                      color: stringGroup === sg.id ? '#fff' : T.textMuted,
                      transition: 'background 0.15s',
                    }}>
                      {sg.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Re-Harmonize button */}
          <button
            onClick={handleReharmonize}
            disabled={chords.length === 0 || loading}
            style={{
              width: '100%',
              padding: '13px 0', borderRadius: 10, border: 'none',
              cursor: (chords.length === 0 || loading) ? 'not-allowed' : 'pointer',
              fontWeight: 700, fontSize: 15,
              background: (chords.length === 0 || loading) ? T.border : T.primary,
              color: (chords.length === 0 || loading) ? T.textDim : '#fff',
              transition: 'background 0.15s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            {loading ? (
              <>
                <span style={{
                  display: 'inline-block', width: 14, height: 14,
                  border: `2px solid ${T.textDim}`,
                  borderTopColor: T.text,
                  borderRadius: '50%',
                  animation: 'spin 0.7s linear infinite',
                }} />
                Re-Harmonizing...
              </>
            ) : (
              'Re-Harmonize'
            )}
          </button>

          {/* Spinner animation */}
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

          {/* Error message */}
          {error && !loading && (
            <div style={{
              ...card({ padding: '12px 16px' }),
              borderLeft: `3px solid ${'#c0392b'}`,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{ fontSize: 16 }}>⚠️</span>
              <p style={{ margin: 0, fontSize: 13, color: T.text, direction: 'rtl', textAlign: 'right' }}>
                {error}
              </p>
            </div>
          )}

          {/* Results section */}
          {result && (
            <>
              {/* Re-Harmonized progression card */}
              <div style={{ ...card({ padding: '12px 14px' }), display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <p style={LABEL_STYLE}>Re-Harmonized</p>
                  <button
                    onClick={handlePlay}
                    style={{
                      padding: '5px 14px', borderRadius: 8,
                      cursor: 'pointer', fontSize: 12, fontWeight: 700,
                      background: isPlaying ? T.bgDeep : T.primary,
                      color: isPlaying ? T.primary : '#fff',
                      border: isPlaying ? `1px solid ${T.primary}` : '1px solid transparent',
                      transition: 'all 0.15s',
                    }}
                  >
                    {isPlaying ? 'Stop' : 'Play'}
                  </button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {result.chords.map((c, i) => (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                      <span style={{
                        padding: '5px 12px', borderRadius: 20,
                        background: T.primarySoft,
                        border: `1px solid ${T.primary}44`,
                        fontSize: 13, fontWeight: 700, color: T.primary,
                      }}>
                        {c}
                      </span>
                      {showNashville && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: T.textMuted }}>
                          {toNashville(c, keyRoot)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* AI Analysis card */}
              <div style={{
                ...card({ padding: '14px 16px' }),
                borderLeft: `3px solid ${T.primary}`,
                display: 'flex', flexDirection: 'column', gap: 8,
              }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: T.primary, direction: 'ltr', unicodeBidi: 'isolate' }}>
                  AI ניתוח הרמוני
                </span>
                <p style={{
                  margin: 0, fontSize: 12, color: T.text,
                  lineHeight: 1.8, direction: 'rtl', textAlign: 'right',
                }}>
                  {result.analysis}
                </p>
                <div style={{ paddingTop: 8, borderTop: `1px solid ${T.border}` }}>
                  <p style={{
                    margin: 0, fontSize: 11, color: T.textMuted,
                    lineHeight: 1.7, direction: 'rtl', textAlign: 'right',
                    fontStyle: 'italic',
                  }}>
                    {result.theory}
                  </p>
                </div>
              </div>

              {/* Path selector + chord diagrams */}
              {reharmPaths.length > 0 && (
                <div style={{ ...card(), display: 'flex', flexDirection: 'column', gap: 14 }}>

                  {/* Path selector */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <p style={LABEL_STYLE}>Voicing Paths</p>
                    <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
                      {reharmPaths.map((path, pi) => {
                        const active = pi === selectedPathIdx;
                        return (
                          <button
                            key={path.id}
                            onClick={() => setSelectedPathIdx(pi)}
                            style={{
                              flexShrink: 0,
                              display: 'flex', alignItems: 'center', gap: 6,
                              padding: '6px 12px', borderRadius: 20,
                              border: active ? 'none' : `1px solid ${T.border}`,
                              background: active ? T.primary : T.bgDeep,
                              color: active ? '#fff' : T.textMuted,
                              fontSize: 12, fontWeight: active ? 700 : 400,
                              cursor: 'pointer', transition: 'all 0.15s',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <span style={{
                              width: 16, height: 16, borderRadius: '50%',
                              background: active ? 'rgba(255,255,255,0.3)' : T.primary,
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

                  {/* Current path detail */}
                  {currentPath && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <p style={{ margin: 0, fontSize: 12, color: T.textMuted, fontStyle: 'italic', lineHeight: 1.5 }}>
                        {currentPath.description}
                      </p>

                      <p style={{ margin: 0, fontSize: 10, color: T.textDim, fontStyle: 'italic' }}>
                        Tap a diagram to enlarge
                      </p>

                      <div style={{
                        display: 'flex', gap: 8, overflowX: 'auto',
                        paddingBottom: 4, flexWrap: 'nowrap',
                        minHeight: 148,
                      }}>
                        {currentPath.voicings.map((voicing, ci) => (
                          <div
                            key={ci}
                            onClick={() => setModalIdx(ci)}
                            style={{
                              flexShrink: 0, width: 120, cursor: 'pointer',
                              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                            }}
                          >
                            <span style={{ fontSize: 13, fontWeight: 800, color: currentColor }}>
                              {result.chords[ci]}
                            </span>
                            <div style={{
                              width: '100%', background: T.bgInput,
                              borderRadius: 10, border: `1px solid ${currentColor}33`,
                              padding: '4px 4px 2px', boxSizing: 'border-box',
                            }}>
                              <MiniFretboard
                                voicing={voicing}
                                dotColor={currentColor}
                                tuning={tuning.notes}
                              />
                            </div>
                            <FretBadge voicing={voicing} color={currentColor} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {reharmPaths.length === 0 && (
                <div style={{ ...card({ padding: '20px 16px' }), textAlign: 'center' }}>
                  <p style={{ margin: 0, fontSize: 13, color: T.textMuted }}>
                    No voicing paths found — try Full mode or All strings.
                  </p>
                </div>
              )}

              {/* Export MIDI button */}
              <button
                onClick={() => exportMidi(result.chords)}
                style={{
                  width: '100%',
                  padding: '11px 0', borderRadius: 10,
                  border: `1.5px solid ${T.secondary}`,
                  cursor: 'pointer', fontWeight: 700, fontSize: 14,
                  background: 'transparent', color: T.secondary,
                  transition: 'background 0.15s',
                }}
              >
                Export MIDI
              </button>
            </>
          )}
        </>
      )}

      {/* Enlarged diagram modal */}
      {modalIdx !== null && currentPath && result && (
        <ReharmModal
          voicings={currentPath.voicings}
          chordNames={result.chords}
          index={modalIdx}
          color={currentColor}
          tuning={tuning.notes}
          onClose={() => setModalIdx(null)}
        />
      )}
    </div>
  );
}
