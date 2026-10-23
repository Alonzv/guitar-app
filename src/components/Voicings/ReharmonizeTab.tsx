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
import { SaveToLibraryButton } from '../Workspace/SaveToLibraryButton';
import type { ReharmData } from '../../services/types';
import { T, alpha } from '../../theme';
import { Rule, Pill, PillRow, Cta, PosterTitle } from '../Transit/parts';
import { pillStyle } from '../Transit/styles';
import { Route } from './Route';
import { pickTag, spinner } from './ui';
import { useLang } from '../../contexts/LanguageContext';
import { ExampleChips } from '../ExampleChips';
import { useOptionalSong } from '../../song/SongContext';
import { formatChordName } from '../../utils/chordIdentifier';
import { findChordVoicings } from '../../utils/chordVoicings';
import { useFlash } from '../../motion/useFlash';
import { RollLabel } from '../RollLabel';
import { namesToProgression } from '../../utils/progressionBridge';
import { TUNINGS } from '../../utils/musicTheory';

// Reharmonisation is the one tool that can fail for reasons outside the app,
// so it is the one tool with error copy. Written for a guitarist: the old text
// was Hebrew-only and told them to go and check an API key they do not have.
const ERR = {
  en: {
    refused: 'Could not reharmonise this progression. Try again in a moment.',
    network: 'No connection — check your network and try again.',
  },
  he: {
    refused: 'לא הצלחנו להרמן את הפרוגרסיה הזו. נסו שוב בעוד רגע.',
    network: 'אין חיבור — בדקו את הרשת ונסו שוב.',
  },
} as const;

interface Props {
  chords: string[];
  mode: VoicingMode;
  setMode: (m: VoicingMode) => void;
  stringGroup: StringGroup;
  setStringGroup: (sg: StringGroup) => void;
  tuning: Tuning;
  desktop?: boolean;
  /** Editable chips for the progression being reharmonised, shown in this card. */
  progressionEditor?: React.ReactNode;
  /** Library handoff: a saved reharm to restore without an API call. */
  restored?: { result: ReharmData; genre?: string | null; tension?: number | null } | null;
  onRestoredConsumed?: () => void;
  /** Fills an empty progression with an example to try. */
  onLoadExample?: (chords: string[]) => void;
}

const WARN = '⚠\uFE0E';   // text presentation, never the emoji

// Where the shape sits on the neck, as a mono label.
function FretBadge({ voicing }: { voicing: FretPosition[] }) {
  const nonOpen = voicing.filter(p => p.fret > 0);
  const hasOpen = voicing.some(p => p.fret === 0);
  const lowestFret = nonOpen.length ? Math.min(...nonOpen.map(p => p.fret)) : 0;
  return (
    <span className="su-label" style={{ color: T.textMuted }}>
      {nonOpen.length === 0
        ? 'open'
        : hasOpen
          ? `${lowestFret}fr + open`
          : `${lowestFret}fr`}
    </span>
  );
}

// ── Enlarged chord sheet ──────────────────────────────────────────────────────
// A paper sheet in a 2px ink frame: the chord as a poster, its diagram, and
// ‹ › pills to step through the path.
function ReharmModal({
  voicings, chordNames, index: initial, tuning, onClose,
}: {
  voicings: FretPosition[][];
  chordNames: string[];
  index: number;
  tuning: string[];
  onClose: () => void;
}) {
  const { lang } = useLang();
  const he = lang === 'he';
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

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: alpha(T.text, 55),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        role="dialog" aria-modal="true" aria-label={chordNames[idx]}
        onClick={e => e.stopPropagation()}
        style={{
          background: T.bgDeep, color: T.text, borderRadius: 0,
          border: `var(--su-rule) solid ${T.border}`,
          padding: '18px 20px 20px', maxWidth: 360, width: '100%', boxSizing: 'border-box',
          display: 'flex', flexDirection: 'column', gap: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <span className="su-label" style={{ paddingTop: 14 }}>{idx + 1} / {total}</span>
          <Pill onClick={onClose} label={he ? 'סגירה' : 'Close'} style={{ padding: 0, width: 44 }}>×</Pill>
        </div>
        {/* Chord names keep their case (Cmaj9, not CMAJ9). */}
        <PosterTitle head={<span style={{ textTransform: 'none' }}>{chordNames[idx]}</span>} max={84} min={36} />
        <div style={{ borderTop: `var(--su-rule) solid ${T.border}`, paddingTop: 10 }}>
          <MiniFretboard voicing={voicings[idx]} dotColor={T.secondary} tuning={tuning} showStringLabels showFretNumbers hideFretLabel />
        </div>
        <FretBadge voicing={voicings[idx]} />
        {total > 1 && (
          <div style={{ display: 'flex', gap: 8 }}>
            <Pill onClick={() => setIdx(i => Math.max(0, i - 1))} disabled={idx === 0} label={he ? 'הקודם' : 'Previous'} style={{ flex: 1 }}>‹</Pill>
            <Pill onClick={() => setIdx(i => Math.min(total - 1, i + 1))} disabled={idx === total - 1} label={he ? 'הבא' : 'Next'} style={{ flex: 1 }}>›</Pill>
          </div>
        )}
        <p className="su-label" style={{ margin: 0, textAlign: 'center' }}>{he ? '← → למעבר · Esc לסגירה' : '← → to step · Esc to close'}</p>
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
  progressionEditor,
  mode,
  setMode,
  stringGroup,
  setStringGroup,
  tuning,
  desktop,
  restored,
  onRestoredConsumed,
  onLoadExample,
}: Props) {
  const { lang } = useLang();
  const song = useOptionalSong();
  const [used, flashUsed] = useFlash();
  const [kept, flashKept] = useFlash();
  const [genre, setGenre] = useState('jazz');
  const [tension, setTension] = useState(3);
  const liveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busy = useRef(false);   // a request in flight (the live timer's closure can't see `loading`)
  useEffect(() => () => { if (liveTimer.current) clearTimeout(liveTimer.current); }, []);
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

  // ── Restore a saved reharm from the library (no API call) ─────────────────
  useEffect(() => {
    if (!restored) return;
    const r = restored.result;
    setResult({ chords: r.chords, analysis: r.analysis, theory: r.theory });
    if (restored.genre && GENRES.some(g => g.id === restored.genre)) setGenre(restored.genre);
    if (typeof restored.tension === 'number') setTension(Math.min(5, Math.max(1, restored.tension)));
    setError(null);
    const paths = findVoicingPaths(r.chords, { genre: 'any', mode, stringGroup, tuning: tuning.notes });
    setReharmPaths(paths);
    setSelectedPathIdx(0);
    onRestoredConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restored]);

  // `live`: a re-run from the tension slider — the current result stays on
  // screen until the new one arrives instead of the panel going blank.
  const handleReharmonize = (t: number = tension, live = false) => {
    if (chords.length === 0 || busy.current) return;
    busy.current = true;
    setLoading(true);
    if (!live) setResult(null);
    setError(null);
    setReharmPaths([]);
    setSelectedPathIdx(0);
    setPlayingId(null);
    playTimers.current.forEach(clearTimeout);
    playTimers.current = [];

    const genreLabel = GENRES.find(g => g.id === genre)?.label ?? genre;

    reharmonize(chords, genreLabel, t).then(r => {
      setLoading(false); busy.current = false;
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
        setError(ERR[lang].refused);
      }
    }).catch(() => {
      setLoading(false); busy.current = false;
      setError(ERR[lang].network);
    });
  };

  const currentPath: VoicingPath | undefined = reharmPaths[selectedPathIdx];

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

  // ── Before / after ───────────────────────────────────────────────────────
  // One loop over both progressions; the side can be flipped while it runs
  // and the very next chord comes from the other one.
  const [ab, setAb] = useState<{ side: 'before' | 'after'; step: number } | null>(null);
  const abSide = useRef<'before' | 'after'>('after');
  const abTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abStop = () => { if (abTimer.current) clearTimeout(abTimer.current); abTimer.current = null; setAb(null); };
  useEffect(() => () => { if (abTimer.current) clearTimeout(abTimer.current); }, []);
  const abPlay = (side: 'before' | 'after') => {
    abSide.current = side;
    if (abTimer.current) { setAb(a => (a ? { ...a, side } : a)); return; }
    if (!result) return;
    const barMs = song ? (60 / song.song.bpm) * 4 * 1000 : 1600;
    const step = (i: number) => {
      const list = abSide.current === 'before' ? chords : result.chords;
      const k = i % Math.max(1, list.length);
      const shape = findChordVoicings(list[k], 1, tuning.notes)[0];
      if (shape) playChord(shape, tuning.openFreqs);
      setAb({ side: abSide.current, step: k });
      abTimer.current = setTimeout(() => step(k + 1), barMs);
    };
    unlockAudio().then(() => step(0));
  };

  const he = lang === 'he';
  const leftCol = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>

      {/* Empty state */}
      {chords.length === 0 && (
        <Rule style={{ textAlign: 'center', padding: '24px 0 4px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <p style={{ margin: 0, fontSize: 14, color: T.textMuted, lineHeight: 1.6 }}>
            {he ? 'בנו את הפרוגרסיה שתרצו לשנות' : 'Build the progression you want to reharmonize'}
            {desktop ? (he ? ' — בעמודה משמאל' : ' — on the left') : (he ? ' — למעלה' : ' — above')}
          </p>
          {onLoadExample && <ExampleChips onPick={onLoadExample} />}
        </Rule>
      )}

      {chords.length > 0 && (
        <>
          {/* The original progression — a route you can edit */}
          <Rule
            label={`${he ? 'המהלך' : 'Progression'} (${chords.length}/8)`}
            right={<Pill size="sm" active={showNashville} onClick={() => setShowNashville(v => !v)}>Nashville</Pill>}
          >
            {progressionEditor}
            {showNashville && (
              <p dir="ltr" style={{ margin: '8px 0 0', fontFamily: 'var(--gc-mono)', fontSize: 12, letterSpacing: '0.08em', color: T.textMuted }}>
                {chords.map(c => toNashville(c, keyRoot)).join('  ·  ')}
              </p>
            )}
          </Rule>

          {/* Controls */}
          <Rule label={he ? 'סגנון' : 'Genre'}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <PillRow label={he ? 'סגנון' : 'Genre'} items={GENRES.map(g => ({ id: g.id, label: g.label }))} value={genre} onChange={setGenre} />

              {/* Tension slider */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span className="su-label">{he ? 'מתח' : 'Tension'}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--gc-mono)' }}>
                    {tension} — {tensionLabel(tension)}{result && loading ? ' · …' : ''}
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={5}
                  step={1}
                  value={tension}
                  aria-label={he ? 'מתח' : 'Tension'}
                  onChange={e => {
                    const v = Number(e.target.value);
                    setTension(v);
                    // With a result on screen the slider is live: settle on a level
                    // and the reharm is redone at it.
                    if (result) {
                      if (liveTimer.current) clearTimeout(liveTimer.current);
                      liveTimer.current = setTimeout(() => handleReharmonize(v, true), 700);
                    }
                  }}
                  style={{ width: '100%', height: 44, accentColor: T.text, cursor: 'pointer', margin: 0 }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="su-label">Simple</span>
                  <span className="su-label">Extended</span>
                  <span className="su-label">Altered</span>
                </div>
              </div>

              {/* Mode + StringGroup */}
              <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="su-label">{he ? 'מצב' : 'Mode'}</span>
                  <PillRow label={he ? 'מצב' : 'Mode'} items={[{ id: 'full' as VoicingMode, label: 'Full' }, { id: 'triads' as VoicingMode, label: 'Triads' }]}
                    value={mode} onChange={setMode} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="su-label">{he ? 'מיתרים' : 'Strings'}</span>
                  <PillRow label={he ? 'מיתרים' : 'Strings'} items={([
                    { id: 'all',    label: 'All'  },
                    { id: 'bass',   label: 'Low'  },
                    { id: 'treble', label: 'High' },
                  ] as { id: StringGroup; label: string }[])} value={stringGroup} onChange={setStringGroup} />
                </div>
              </div>
            </div>
          </Rule>

          {/* Re-Harmonize — the stop's one cobalt action */}
          <Cta onClick={() => handleReharmonize()} disabled={chords.length === 0 || loading} style={{ width: '100%', height: 52 }}>
            {loading ? (
              <><span style={spinner(T.textMuted)} /> {he ? 'מרמן…' : 'Re-Harmonizing…'}</>
            ) : (
              he ? 'רה-הרמוניזציה' : 'Re-Harmonize'
            )}
          </Cta>

          {/* Spinner animation */}
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

        </>
      )}
    </div>
  );

  const rightCol = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>

      {error && !loading && (
        <Rule>
          <p role="alert" style={{ margin: 0, fontSize: 13, color: T.text }}><b>{WARN}</b> {error}</p>
        </Rule>
      )}

      {result && (
        <>
              {/* The reharm as a route: a changed chord is a filled station,
                  a kept one an open ring, the one sounding now cobalt. */}
              <Rule
                label={he ? 'אחרי הרה-הרמוניזציה' : 'Re-Harmonized'}
                right={<Pill size="sm" active={isPlaying} onClick={handlePlay}>{isPlaying ? 'STOP' : 'PLAY'}</Pill>}
              >
                <Route
                  label={he ? 'אחרי הרה-הרמוניזציה' : 'Re-Harmonized'}
                  stations={result.chords.map((c, i) => ({
                    name: c,
                    filled: formatChordName(c) !== formatChordName(chords[i] ?? ''),
                    sub: showNashville ? toNashville(c, keyRoot) : undefined,
                  }))}
                  current={ab != null && ab.side === 'after' ? ab.step : null}
                />

                {/* Before / after — one loop, two progressions: flip sides while it
                    plays and the next chord comes from the other one, so the
                    difference is heard at the same spot in the bar. */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 12, paddingTop: 10, borderTop: `1px solid ${T.hairline}` }}>
                  <span className="su-label">{he ? 'לפני / אחרי' : 'Before / after'}</span>
                  {(['before', 'after'] as const).map(side => (
                    <Pill key={side} size="sm" active={ab?.side === side} onClick={() => abPlay(side)}>
                      {side === 'before' ? (he ? '▶ המקור' : '▶ Original') : (he ? '▶ הרה-הרמוניזציה' : '▶ Reharm')}
                    </Pill>
                  ))}
                  {ab && <Pill size="sm" onClick={abStop} label={he ? 'עצירה' : 'Stop'} style={{ padding: 0 }}>■</Pill>}
                  {ab && (
                    <span dir="ltr" className="gc-notation" style={{ fontSize: 12, color: T.textMuted, flexBasis: '100%' }}>
                      {(ab.side === 'before' ? chords : result.chords).map((c, i) => (
                        <span key={i} style={i === ab.step ? { color: T.text, fontWeight: 700 } : undefined}>{i ? ' – ' : ''}{c}</span>
                      ))}
                    </span>
                  )}
                </div>
              </Rule>

              {/* AI analysis */}
              <Rule label={he ? 'ניתוח' : 'AI analysis'}>
                <p style={{ margin: 0, fontSize: 13, color: T.text, lineHeight: 1.7 }}>
                  {result.analysis}
                </p>
                <p style={{ margin: '10px 0 0', paddingTop: 10, borderTop: `1px solid ${T.hairline}`, fontSize: 12, color: T.textMuted, lineHeight: 1.6 }}>
                  {result.theory}
                </p>
              </Rule>

              {/* Path selector + chord diagrams */}
              {reharmPaths.length > 0 && (
                <Rule label={he ? 'מסלולי פוזיציה' : 'Voicing paths'}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {/* Paths as pills; the first is the smoothest — the pick */}
                    <div role="group" aria-label={he ? 'מסלולי פוזיציה' : 'Voicing paths'} className="gc-no-scrollbar"
                      style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 1 }}>
                      {reharmPaths.map((path, pi) => {
                        const active = pi === selectedPathIdx;
                        return (
                          <Pill key={path.id} size="sm" active={active} onClick={() => setSelectedPathIdx(pi)} style={{ textTransform: 'none', letterSpacing: '0.02em' }}>
                            <span style={{ fontFamily: 'var(--gc-mono)', opacity: 0.7 }}>{pi + 1}</span>
                            {path.label}
                            {pi === 0 && <span style={{ ...pickTag, ...(active ? { background: T.white, color: T.secondary } : {}) }}>PICK</span>}
                          </Pill>
                        );
                      })}
                    </div>

                    {/* Current path detail */}
                    {currentPath && (
                      <>
                        <p style={{ margin: 0, fontSize: 12, color: T.textMuted, lineHeight: 1.5 }}>
                          {currentPath.description}
                        </p>
                        <span className="su-label">{he ? 'הקישו על דיאגרמה להגדלה' : 'Tap a diagram to enlarge'}</span>
                        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4, flexWrap: 'nowrap', minHeight: 148 }}>
                          {currentPath.voicings.map((voicing, ci) => (
                            <button
                              type="button"
                              key={ci}
                              onClick={() => setModalIdx(ci)}
                              aria-label={he ? `הגדלת ${result.chords[ci]}` : `Enlarge ${result.chords[ci]}`}
                              className="gc-no-bar"
                              style={{
                                flexShrink: 0, width: 124, cursor: 'pointer', background: 'transparent', color: T.text,
                                border: 'none', borderTop: `var(--su-rule) solid ${T.border}`, borderRadius: 0, padding: '8px 0 4px',
                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                              }}
                            >
                              <span className="su-semi gc-notation" style={{ fontSize: 18 }}>{result.chords[ci]}</span>
                              <div style={{ width: '100%' }}>
                                <MiniFretboard voicing={voicing} dotColor={T.secondary} tuning={tuning.notes} />
                              </div>
                              <FretBadge voicing={voicing} />
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </Rule>
              )}

              {reharmPaths.length === 0 && (
                <Rule>
                  <p style={{ margin: 0, fontSize: 13, color: T.textMuted }}>
                    {he ? 'לא נמצאו מסלולים — נסו מצב Full או את כל המיתרים.' : 'No voicing paths found — try Full mode or All strings.'}
                  </p>
                </Rule>
              )}

              {/* Back to the song: replace the section's chords with the reharm,
                  or keep it beside them as a variant to switch to later. */}
              {song && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <Pill active onClick={() => { song.setChordNames(result.chords); flashUsed(); }} style={{ flex: 1 }}>
                    <RollLabel>{used ? (he ? '✓ בשיר' : '✓ In the song') : (he ? 'השתמש בשיר' : 'Use in song')}</RollLabel>
                  </Pill>
                  <Pill onClick={() => {
                    const t = TUNINGS.find(x => x.name === song.song.tuningName) ?? TUNINGS[0];
                    song.saveVariant(`Reharm · ${GENRES.find(g => g.id === genre)?.label ?? genre}`, namesToProgression(result.chords, t.notes));
                    flashKept();
                  }} style={{ flex: 1 }}>
                    <RollLabel>{kept ? (he ? '✓ נשמר כגרסה' : '✓ Kept as variant') : (he ? 'שמור כגרסה' : 'Keep as variant')}</RollLabel>
                  </Pill>
                </div>
              )}

              {/* Actions: save + MIDI */}
              <div style={{ display: 'flex', gap: 8 }}>
                <SaveToLibraryButton
                  label={he ? 'שמירה לספרייה' : 'Save to Library'}
                  getPayload={() => ({
                    kind: 'reharm',
                    name: `Reharm — ${GENRES.find(g => g.id === genre)?.label ?? genre} (${chords.length} chords)`,
                    original: chords,
                    result: { chords: result.chords, analysis: result.analysis, theory: result.theory },
                    genre,
                    tension,
                  })}
                  style={{ ...pillStyle(false), flex: 1 }}
                />
                <Pill onClick={() => exportMidi(result.chords)} style={{ flex: 1 }}>
                  {he ? 'ייצוא MIDI' : 'Export MIDI'}
                </Pill>
              </div>
        </>
      )}

      {/* Enlarged diagram sheet */}
      {modalIdx !== null && currentPath && result && (
        <ReharmModal
          voicings={currentPath.voicings}
          chordNames={result.chords}
          index={modalIdx}
          tuning={tuning.notes}
          onClose={() => setModalIdx(null)}
        />
      )}
    </div>
  );

  if (desktop && chords.length > 0) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '340px minmax(0, 1fr)', gap: 36, alignItems: 'start' }}>
        {leftCol}
        <div style={{ position: 'sticky', top: 24 }}>{rightCol}</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {leftCol}
      {rightCol}
    </div>
  );
}
