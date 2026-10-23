import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { T, btn } from '../../theme';
import { PosterTitle, Rule, Pill, Cta } from '../Transit/parts';
import { keyStyle } from '../Transit/styles';
import { useAuth } from '../../contexts/AuthContext';
import { useLang } from '../../contexts/LanguageContext';
import { playInterval, playMidi } from '../../utils/audioPlayback';
import { answeredRight, answeredWrong } from '../../practice/feedback';
import { StreakBoard } from '../Practice/StreakBoard';
import { PlayToAnswer } from '../Practice/PlayToAnswer';
import { useMicNotes } from '../../practice/useMicNotes';
import { INTERVAL_ORDER, UI } from './data';
import type { IntervalId, Lang } from './data';
import {
  makeExercise, pickWeightedInterval, noteName,
} from './engine';
import type { Exercise, Direction, PlayMode } from './engine';
import { WindowedFretboard } from './WindowedFretboard';
import {
  loadLocal, saveLocal, loadRemote, saveRemote, mergeRemote,
} from '../../services/earTraining';
import type { EarTrainingData, EarPlayback, EarDirection } from '../../services/earTraining';

interface Props { desktop?: boolean }


// ── Small presentational helpers ────────────────────────────────────────────
function ToggleRow({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{children}</div>;
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 12, height: 12, borderRadius: '50%', background: color }} />
      {label}
    </span>
  );
}

// ════════════════════════════════════════════════════════════════════════════
export const EarTrainingTab: React.FC<Props> = ({ desktop }) => {
  const { user } = useAuth();

  const [data, setData] = useState<EarTrainingData>(() => loadLocal());
  const dataRef = useRef(data);
  useEffect(() => { dataRef.current = data; }, [data]);

  const { lang } = useLang();
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

  // Language is an app-wide setting now, but it also rides along in the synced
  // prefs record, so mirror it there rather than letting the two drift.
  useEffect(() => {
    if (dataRef.current.prefs.lang !== lang) setPrefs({ lang });
  }, [lang, setPrefs]);

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

  // ── Shared: play a built exercise ──────────────────────────────────────────
  const playExercise = useCallback((ex: Exercise) => {
    // The LIVE playback preference wins: a fixed Melodic/Harmonic choice
    // overrides whatever mode the exercise was generated under (an exercise
    // rolled while on Mixed could carry 'harmonic', and replaying it after
    // switching to Melodic used to still sound harmonic). Only Mixed keeps the
    // per-exercise coin flip. Melodic always sounds root → target; ascending vs
    // descending is carried by where the target pitch sits (see engine).
    const pb = data.prefs.playback;
    const mode = pb === 'mixed' ? ex.mode : pb;
    playInterval(ex.rootMidi, ex.targetMidi, mode === 'harmonic' ? 'harmonic' : 'melodic');
  }, [data.prefs.playback]);

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} style={{ fontFamily: 'var(--gc-font)' }}>
      {/* Header: title + Learn/Practice */}
      <PracticeMode
        lang={lang}
        data={data}
        setPrefs={setPrefs}
        recordResult={recordResult}
        playExercise={playExercise}
        onNewBest={(best) => setData(d => (best > d.bestStreak ? { ...d, bestStreak: best } : d))}
        signedIn={!!user}
        desktop={desktop}
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
  desktop?: boolean;
}

// Difficulty pools — Basic keeps to the clearest intervals; Advanced is all 12.
const BASIC_IVS: IntervalId[] = ['m3', 'M3', 'P4', 'P5', 'M6', 'P8'];

const PracticeMode: React.FC<PracticeProps> = ({
  lang, data, setPrefs, recordResult, playExercise, onNewBest, signedIn, desktop,
}) => {
  const t = UI[lang];
  const { playback, direction } = data.prefs;

  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [difficulty, setDifficulty] = useState<'basic' | 'advanced'>('basic');
  const [wrongPicks, setWrongPicks] = useState<Set<IntervalId>>(new Set());
  const [answered, setAnswered] = useState<null | 'correct' | 'reset'>(null);
  const [streak, setStreak] = useState(0);
  const answerArea = useRef<HTMLDivElement>(null);   // shakes on a wrong answer
  const advanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealed = answered !== null;   // show the hidden 2nd note once answered
  const pool = difficulty === 'advanced' ? INTERVAL_ORDER : BASIC_IVS;

  const resolveMode = useCallback((): PlayMode => {
    if (playback === 'mixed') return Math.random() < 0.5 ? 'melodic' : 'harmonic';
    return playback;
  }, [playback]);

  const resolveDirection = useCallback((mode: PlayMode): Direction => {
    if (mode === 'harmonic') return 'asc'; // harmonic has no aural direction
    if (direction === 'mixed') return Math.random() < 0.5 ? 'asc' : 'desc';
    return direction === 'desc' ? 'desc' : 'asc';
  }, [direction]);

  const nextExercise = useCallback((p: IntervalId[] = pool) => {
    const interval = pickWeightedInterval(p, data.stats);
    const mode = resolveMode();
    const dir = resolveDirection(mode);
    const ex = makeExercise(interval, dir, mode);
    setExercise(ex);
    setWrongPicks(new Set());
    setAnswered(null);
    playExercise(ex);
  }, [pool, data.stats, resolveMode, resolveDirection, playExercise]);

  useEffect(() => () => { if (advanceRef.current) clearTimeout(advanceRef.current); }, []);

  // Answer by NAMING the interval (no tapping the neck → no fret counting). The
  // second note stays hidden until answered; first wrong guess is forgiven
  // (second-chance streak), a second wrong resets and reveals the answer.
  const guess = useCallback((id: IntervalId) => {
    if (!exercise || answered) return;
    if (id === exercise.interval) {
      const clean = wrongPicks.size === 0;   // streak grows only on a first-try answer
      recordResult(exercise.interval, clean);
      if (clean) { const next = streak + 1; setStreak(next); onNewBest(next); }
      setAnswered('correct');
      answeredRight();
      advanceRef.current = setTimeout(() => nextExercise(), 1500);
    } else {
      answeredWrong(answerArea.current);
      const nw = new Set(wrongPicks); nw.add(id); setWrongPicks(nw);
      if (nw.size >= 2) {
        recordResult(exercise.interval, false);
        setStreak(0);
        setAnswered('reset');
        advanceRef.current = setTimeout(() => nextExercise(), 1900);
      }
    }
  }, [exercise, answered, wrongPicks, streak, recordResult, onNewBest, nextExercise]);

  // Answer by playing the second note: its pitch class is the answer. Other
  // notes are ignored here — a stray string is not a wrong answer.
  const mic = useMicNotes(midi => {
    if (!exercise || answered) return;
    if (((midi - exercise.targetMidi) % 12 + 12) % 12 === 0) guess(exercise.interval);
  });

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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <p className="su-label" style={{ margin: '0 0 6px' }}>{t.playbackMode}</p>
          <ToggleRow>
            {(['melodic', 'harmonic', 'mixed'] as EarPlayback[]).map(m => (
              <Pill key={m} size="sm" active={playback === m} onClick={() => setPrefs({ playback: m })}>
                {m === 'melodic' ? t.melodic : m === 'harmonic' ? t.harmonic : t.mixed}
              </Pill>
            ))}
          </ToggleRow>
        </div>
        <div>
          <p className="su-label" style={{ margin: '0 0 6px' }}>{t.direction}</p>
          <ToggleRow>
            {(['asc', 'desc', 'mixed'] as EarDirection[]).map(d => (
              <Pill key={d} size="sm" active={direction === d} disabled={directionDisabled}
                onClick={() => setPrefs({ direction: d })}>
                {d === 'asc' ? t.ascending : d === 'desc' ? t.descending : t.mixed}
              </Pill>
            ))}
          </ToggleRow>
        </div>
        <div>
          <p className="su-label" style={{ margin: '0 0 6px' }}>{lang === 'he' ? 'קושי' : 'Difficulty'}</p>
          <ToggleRow>
            {(['basic', 'advanced'] as const).map(d => (
              <Pill key={d} size="sm" active={difficulty === d}
                onClick={() => { setDifficulty(d); if (exercise) nextExercise(d === 'advanced' ? INTERVAL_ORDER : BASIC_IVS); }}>
                {d === 'basic' ? (lang === 'he' ? 'בסיסי' : 'Basic') : (lang === 'he' ? 'מתקדם' : 'Advanced')}
              </Pill>
            ))}
          </ToggleRow>
        </div>
      </div>

      <StreakBoard streak={streak} best={data.bestStreak} lang={lang} flush />

      {/* Exercise area */}
      {!exercise ? (
        <Rule>
          <p style={{ margin: '4px 0 16px', fontSize: 14, lineHeight: 1.6, color: T.text }}>{t.listenPrompt}</p>
          <Cta onClick={() => nextExercise()}>{t.startPractice}</Cta>
          {!signedIn && <p style={{ margin: '16px 0 0', fontSize: 11, color: T.textMuted }}>{t.signInHint}</p>}
        </Rule>
      ) : (
        <Rule>
          <PosterTitle head={lang === 'he' ? 'איזה אינטרוול?' : 'Which interval?'} max={desktop ? 96 : 60} min={32} as="div" style={{ marginBottom: 14 }} />
          {/* Replay + Play-root — prominent, above the neck */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={() => playExercise(exercise)} className="gc-no-bar" style={btn.primary()}>↻ {t.replay}</button>
            <Pill onClick={() => playMidi(exercise.rootMidi)}>{t.playRoot}</Pill>
            {/* Name the anchor note so it maps to the marked dot on the neck */}
            <span style={{ marginInlineStart: 'auto', display: 'inline-flex', alignItems: 'baseline', gap: 8 }}>
              <span className="su-label">{t.rootLabel}</span>
              <span className="su-semi" style={{ fontSize: 24 }}>{noteName(exercise.rootMidi)}</span>
            </span>
          </div>

          {/* Neck shows ONLY the root; the 2nd note stays hidden until answered */}
          <WindowedFretboard
            winStart={exercise.winStart}
            root={exercise.root}
            targetPositions={exercise.targetPositions}
            feedback={null}
            showAnswer={revealed}
            disabled
            onPick={() => {}}
          />

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 10, fontSize: 11, color: T.textMuted, fontFamily: 'var(--gc-mono)' }}>
            <LegendDot color={revealed ? T.secondary : T.primary} label={t.rootLabel} />
            {revealed && <LegendDot color={T.primary} label={t.answerLabel} />}
          </div>

          <div style={{ marginTop: 12 }}><PlayToAnswer lang={lang} mic={mic} /></div>

          {/* Answer by naming the interval — no neck tapping (no fret counting) */}
          <p className="su-label" style={{ margin: '14px 0 8px' }}>{lang === 'he' ? 'זהו את האינטרוול' : 'Name the interval'}</p>
          <div ref={answerArea} dir="ltr" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(60px, 1fr))', gap: 4 }}>
            {pool.map(id => {
              const isAnswer = revealed && id === exercise.interval;
              const isWrong = wrongPicks.has(id);
              return (
                <button key={id} onClick={() => guess(id)} disabled={revealed} className="gc-no-bar gc-notation" style={{
                  ...keyStyle(false), minHeight: 52, letterSpacing: 'normal', textTransform: 'none', cursor: revealed ? 'default' : 'pointer',
                  background: isAnswer ? T.primary : isWrong ? T.secondary : T.bgInput,
                  color: isAnswer ? T.onPrimary : isWrong ? T.white : T.text,
                  textDecoration: isWrong ? 'line-through' : undefined,
                }}>{id}</button>
              );
            })}
          </div>

          {/* Status line */}
          <div role="status" style={{ minHeight: 30, marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {answered === 'correct' && <span style={{ fontSize: 15, fontWeight: 700, color: T.text }}>✓ {t.correct}</span>}
            {answered === 'reset' && <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>✕ {t.wrong} — {exercise.interval}</span>}
          </div>
        </Rule>
      )}

      {/* Weak spots analytics */}
      {weak.length > 0 && (
        <Rule label={t.weakSpots}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {weak.map(w => (
              <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="su-semi" style={{ width: 40, fontSize: 18, color: T.text }}>{w.id}</span>
                <div style={{ flex: 1, height: 8, background: T.bgInput, position: 'relative' }}>
                  <div style={{ position: 'absolute', insetInlineStart: 0, top: 0, bottom: 0, width: `${Math.round(w.acc * 100)}%`, background: T.secondary }} />
                </div>
                <span style={{ width: 42, textAlign: 'end', fontSize: 12, color: T.textMuted, fontFamily: 'var(--gc-mono)' }}>{Math.round(w.acc * 100)}%</span>
              </div>
            ))}
          </div>
        </Rule>
      )}
    </div>
  );
};
