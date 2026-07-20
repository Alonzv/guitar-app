import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { T, card } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { playInterval, playMidi } from '../../utils/audioPlayback';
import { INTERVAL_ORDER, UI } from './data';
import type { IntervalId, Lang } from './data';
import {
  makeExercise, pickWeightedInterval, midiAt, noteName,
} from './engine';
import type { Exercise, Direction, PlayMode } from './engine';
import { WindowedFretboard } from './WindowedFretboard';
import type { Feedback } from './WindowedFretboard';
import {
  loadLocal, saveLocal, loadRemote, saveRemote, mergeRemote,
} from '../../services/earTraining';
import type { EarTrainingData, EarPlayback, EarDirection } from '../../services/earTraining';

interface Props { desktop?: boolean }


// ── Small presentational helpers ────────────────────────────────────────────
const LABEL: React.CSSProperties = {
  fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
  color: T.textDim, margin: '0 0 6px', fontWeight: 600,
};

function Pill({ active, onClick, children, disabled }: {
  active: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1, minWidth: 0, padding: '8px 10px', borderRadius: 0, cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 12, fontWeight: active ? 600 : 400,
        border: active ? 'none' : `1px solid ${T.border}`,
        borderLeft: '3px solid var(--gc-bar-color)',
        background: active ? T.secondary : T.bgInput,
        color: active ? '#fff' : (disabled ? T.textDim : T.textMuted),
        opacity: disabled ? 0.5 : 1,
        transition: 'background .12s ease',
      }}
    >
      {children}
    </button>
  );
}

function ToggleRow({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', gap: 6 }}>{children}</div>;
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 12, height: 12, borderRadius: '50%', background: color, border: '1.5px solid #fff', boxShadow: '0 0 0 1px rgba(0,0,0,0.12)' }} />
      {label}
    </span>
  );
}

// ════════════════════════════════════════════════════════════════════════════
export const EarTrainingTab: React.FC<Props> = () => {
  const { user } = useAuth();

  const [data, setData] = useState<EarTrainingData>(() => loadLocal());
  const dataRef = useRef(data);
  useEffect(() => { dataRef.current = data; }, [data]);

  const lang: Lang = data.prefs.lang;
  const rtl = lang === 'he';

  // ── Persistence: local mirror always, remote (debounced) when signed in ────
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    loadRemote(user.id)
      .then(remote => {
        if (cancelled) return;
        if (remote) setData(prev => mergeRemote(prev, remote));
        else saveRemote(user.id, dataRef.current).catch(() => {}); // seed a row
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    saveLocal(data);
    if (!user) return;
    const h = setTimeout(() => { saveRemote(user.id, data).catch(() => {}); }, 800);
    return () => clearTimeout(h);
  }, [data, user]);

  const setPrefs = useCallback((patch: Partial<EarTrainingData['prefs']>) => {
    setData(d => ({ ...d, prefs: { ...d.prefs, ...patch } }));
  }, []);

  const recordResult = useCallback((interval: IntervalId, correct: boolean) => {
    setData(d => {
      const s = d.stats[interval] ?? { correct: 0, wrong: 0 };
      return {
        ...d,
        stats: {
          ...d.stats,
          [interval]: {
            correct: s.correct + (correct ? 1 : 0),
            wrong: s.wrong + (correct ? 0 : 1),
          },
        },
      };
    });
  }, []);

  // ── Shared: play a built exercise in its configured mode/direction ─────────
  const playExercise = useCallback((ex: Exercise) => {
    // Melodic always sounds root → target; whether that's heard as ascending or
    // descending is carried by where the target pitch sits (see engine).
    playInterval(ex.rootMidi, ex.targetMidi, ex.mode === 'harmonic' ? 'harmonic' : 'melodic');
  }, []);

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} style={{ fontFamily: 'var(--gc-font)' }}>
      {/* Header: title + language + Learn/Practice */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: T.text, letterSpacing: '-0.2px' }}>
          {rtl ? 'אימון שמיעה' : 'Ear Training'}
        </h2>
        <div style={{ display: 'flex', border: `1px solid ${T.border}` }}>
          {(['en', 'he'] as Lang[]).map((l, i) => (
            <button key={l} onClick={() => setPrefs({ lang: l })}
              style={{
                padding: '6px 14px', borderRadius: 0, cursor: 'pointer', fontSize: 12,
                fontWeight: lang === l ? 600 : 400,
                borderLeft: i > 0 ? `1px solid ${T.border}` : 'none',
                background: lang === l ? T.secondary : 'transparent',
                color: lang === l ? '#fff' : T.textDim,
              }}>
              {l === 'en' ? 'EN' : 'HE'}
            </button>
          ))}
        </div>
      </div>

      <PracticeMode
        lang={lang}
        data={data}
        setPrefs={setPrefs}
        recordResult={recordResult}
        playExercise={playExercise}
        onNewBest={(best) => setData(d => (best > d.bestStreak ? { ...d, bestStreak: best } : d))}
        signedIn={!!user}
      />
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════════
//  Practice Mode
// ════════════════════════════════════════════════════════════════════════════
interface PracticeProps {
  lang: Lang;
  data: EarTrainingData;
  setPrefs: (patch: Partial<EarTrainingData['prefs']>) => void;
  recordResult: (interval: IntervalId, correct: boolean) => void;
  playExercise: (ex: Exercise) => void;
  onNewBest: (best: number) => void;
  signedIn: boolean;
}

const PracticeMode: React.FC<PracticeProps> = ({
  lang, data, setPrefs, recordResult, playExercise, onNewBest, signedIn,
}) => {
  const t = UI[lang];
  const { playback, direction } = data.prefs;

  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [streak, setStreak] = useState(0);
  const advanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resolveMode = useCallback((): PlayMode => {
    if (playback === 'mixed') return Math.random() < 0.5 ? 'melodic' : 'harmonic';
    return playback;
  }, [playback]);

  const resolveDirection = useCallback((mode: PlayMode): Direction => {
    if (mode === 'harmonic') return 'asc'; // harmonic has no aural direction
    if (direction === 'mixed') return Math.random() < 0.5 ? 'asc' : 'desc';
    return direction === 'desc' ? 'desc' : 'asc';
  }, [direction]);

  const nextExercise = useCallback(() => {
    const interval = pickWeightedInterval(INTERVAL_ORDER, data.stats);
    const mode = resolveMode();
    const dir = resolveDirection(mode);
    const ex = makeExercise(interval, dir, mode);
    setExercise(ex);
    setFeedback(null);
    setRevealed(false);
    playExercise(ex);
  }, [data.stats, resolveMode, resolveDirection, playExercise]);

  useEffect(() => () => { if (advanceRef.current) clearTimeout(advanceRef.current); }, []);

  const handlePick = useCallback((pos: { string: number; fret: number }) => {
    if (!exercise || feedback) return;
    const correct = midiAt(pos.string, pos.fret) === exercise.targetMidi;
    setFeedback({ picked: pos, correct });
    recordResult(exercise.interval, correct);

    if (correct) {
      const next = streak + 1;
      setStreak(next);
      onNewBest(next);
      playMidi(exercise.targetMidi + 12, 0.5); // brief confirmation chirp
      advanceRef.current = setTimeout(() => nextExercise(), 950);
    } else {
      setStreak(0);
      setRevealed(true);
      // Re-teach the ear: sound the correct interval again after a beat.
      advanceRef.current = setTimeout(() => playExercise(exercise), 550);
    }
  }, [exercise, feedback, streak, recordResult, onNewBest, playExercise, nextExercise]);

  // ── Weak spots (top-3 most-missed with enough data) ────────────────────────
  const weak = useMemo(() => {
    return INTERVAL_ORDER
      .map(id => {
        const s = data.stats[id];
        const total = (s?.correct ?? 0) + (s?.wrong ?? 0);
        const acc = total > 0 ? (s!.correct / total) : 1;
        return { id, total, acc, wrong: s?.wrong ?? 0 };
      })
      .filter(x => x.total >= 3 && x.acc < 1)
      .sort((a, b) => a.acc - b.acc)
      .slice(0, 3);
  }, [data.stats]);

  const directionDisabled = playback === 'harmonic';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Control menu */}
      <div style={card({ padding: 14 })}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <p style={LABEL}>{t.playbackMode}</p>
            <ToggleRow>
              {(['melodic', 'harmonic', 'mixed'] as EarPlayback[]).map(m => (
                <Pill key={m} active={playback === m} onClick={() => setPrefs({ playback: m })}>
                  {m === 'melodic' ? t.melodic : m === 'harmonic' ? t.harmonic : t.mixed}
                </Pill>
              ))}
            </ToggleRow>
          </div>
          <div style={{ opacity: directionDisabled ? 0.5 : 1 }}>
            <p style={LABEL}>{t.direction}</p>
            <ToggleRow>
              {(['asc', 'desc', 'mixed'] as EarDirection[]).map(d => (
                <Pill key={d} active={direction === d} disabled={directionDisabled}
                  onClick={() => setPrefs({ direction: d })}>
                  {d === 'asc' ? t.ascending : d === 'desc' ? t.descending : t.mixed}
                </Pill>
              ))}
            </ToggleRow>
          </div>
        </div>
      </div>

      {/* Score row */}
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ ...card({ padding: 12 }), flex: 1, textAlign: 'center' }}>
          <p style={{ ...LABEL, margin: '0 0 4px' }}>{t.streak}</p>
          <p style={{ margin: 0, fontSize: 26, fontWeight: 700, color: T.text }}>{streak}</p>
        </div>
        <div style={{ ...card({ padding: 12 }), flex: 1, textAlign: 'center' }}>
          <p style={{ ...LABEL, margin: '0 0 4px' }}>{t.bestStreak}</p>
          <p style={{ margin: 0, fontSize: 26, fontWeight: 700, color: T.text }}>{data.bestStreak}</p>
        </div>
      </div>

      {/* Exercise area */}
      {!exercise ? (
        <div style={{ ...card({ padding: 28 }), textAlign: 'center' }}>
          <p style={{ margin: '0 0 16px', fontSize: 14, color: T.textMuted }}>{t.listenPrompt}</p>
          <button onClick={nextExercise}
            style={{ padding: '12px 40px', borderRadius: 0, cursor: 'pointer', fontSize: 15, fontWeight: 500, background: T.primary, color: T.white, border: 'none', borderLeft: '4px solid var(--gc-bar-color)' }}>
            {t.startPractice}
          </button>
          {!signedIn && <p style={{ margin: '16px 0 0', fontSize: 11, color: T.textDim }}>{t.signInHint}</p>}
        </div>
      ) : (
        <div style={card({ padding: 14 })}>
          {/* Replay + Play-root — prominent, above the neck */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
            <button onClick={() => playExercise(exercise)}
              style={{ padding: '10px 26px', borderRadius: 0, cursor: 'pointer', fontSize: 14, fontWeight: 600, background: T.secondary, color: '#fff', border: 'none', borderLeft: '4px solid var(--gc-bar-color)', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              ↻ {t.replay}
            </button>
            <button onClick={() => playMidi(exercise.rootMidi)}
              style={{ padding: '10px 22px', borderRadius: 0, cursor: 'pointer', fontSize: 14, fontWeight: 500, background: T.bgInput, color: T.textMuted, border: `1px solid ${T.border}`, borderLeft: '4px solid var(--gc-bar-color)', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              ● {t.playRoot}
            </button>
          </div>
          {/* Name the anchor note so it maps to the black dot on the neck */}
          <p style={{ textAlign: 'center', margin: '0 0 10px', fontSize: 12, color: T.textDim }}>
            {t.rootLabel}: <span style={{ fontWeight: 700, color: T.text }}>{noteName(exercise.rootMidi)}</span>
          </p>

          <WindowedFretboard
            winStart={exercise.winStart}
            root={exercise.root}
            targetPositions={exercise.targetPositions}
            feedback={feedback}
            showAnswer={revealed}
            disabled={!!feedback}
            onPick={handlePick}
          />

          {/* Dot legend — clarifies what each coloured circle means */}
          <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 14, marginTop: 10, fontSize: 11, color: T.textDim }}>
            <LegendDot color={T.primary} label={t.rootLabel} />
            {feedback && <LegendDot color={feedback.correct ? T.success : T.error} label={t.answerLabel} />}
            {feedback && !feedback.correct && <LegendDot color={T.success} label={t.correct.replace('!', '')} />}
          </div>

          {/* Status line */}
          <div style={{ minHeight: 44, marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            {!feedback && (
              <span style={{ fontSize: 13, color: T.textMuted }}>{t.clickPrompt}</span>
            )}
            {feedback?.correct && (
              <span style={{ fontSize: 15, fontWeight: 700, color: T.success }}>✓ {t.correct}</span>
            )}
            {feedback && !feedback.correct && (
              <>
                <span style={{ fontSize: 15, fontWeight: 700, color: T.text }}>✕ {t.wrong}</span>
                <button onClick={nextExercise}
                  style={{ padding: '8px 22px', borderRadius: 0, cursor: 'pointer', fontSize: 13, fontWeight: 500, background: T.primary, color: T.white, border: 'none', borderLeft: '3px solid var(--gc-bar-color)' }}>
                  {t.next} →
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Weak spots analytics */}
      {weak.length > 0 && (
        <div style={card({ padding: 14 })}>
          <p style={LABEL}>{t.weakSpots}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {weak.map(w => (
              <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 34, fontSize: 13, fontWeight: 700, color: T.text }}>{w.id}</span>
                <div style={{ flex: 1, height: 8, background: T.bgInput, position: 'relative' }}>
                  <div style={{ position: 'absolute', insetInlineStart: 0, top: 0, bottom: 0, width: `${Math.round(w.acc * 100)}%`, background: T.error }} />
                </div>
                <span style={{ width: 42, textAlign: 'end', fontSize: 12, color: T.textDim }}>{Math.round(w.acc * 100)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
