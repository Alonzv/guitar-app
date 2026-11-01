import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { T } from '../../theme';
import { icon, SoftButton, Fold } from '../ChordBuilder/Stage';
import { legendDot, Segment } from '../Intervals/names';
import { PracticeColumn, StartPanel, Ask, AnswerTile, Status, Card, WhiteButton, playGlyph } from '../Practice/kit';
import { useAuth } from '../../contexts/AuthContext';
import { useLang } from '../../contexts/LanguageContext';
import { playInterval, playMidi } from '../../utils/audioPlayback';
import { answeredRight, answeredWrong } from '../../practice/feedback';
import { StreakBoard } from '../Practice/StreakBoard';
import { PlayToAnswer } from '../Practice/PlayToAnswer';
import { useMicNotes } from '../../practice/useMicNotes';
import { INTERVAL_ORDER, INTERVAL_DATA, UI } from './data';
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
    <>
      <PracticeMode
        lang={lang}
        data={data}
        setPrefs={setPrefs}
        recordResult={recordResult}
        playExercise={playExercise}
        onNewBest={(best) => setData(d => (best > d.bestStreak ? { ...d, bestStreak: best } : d))}
        signedIn={!!user}
        desktop={desktop}
        rtl={rtl}
      />
    </>
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
  rtl?: boolean;
}

// Difficulty pools — Basic keeps to the clearest intervals; Advanced is all 12.
const BASIC_IVS: IntervalId[] = ['m3', 'M3', 'P4', 'P5', 'M6', 'P8'];

const PracticeMode: React.FC<PracticeProps> = ({
  lang, data, setPrefs, recordResult, playExercise, onNewBest, signedIn, desktop, rtl,
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
  const he = lang === 'he';
  const [settingsOpen, setSettingsOpen] = useState(false);
  const pbLabel = (m: EarPlayback) => m === 'melodic' ? (he ? 'בזה אחר זה' : 'One by one') : m === 'harmonic' ? (he ? 'ביחד' : 'Together') : t.mixed;
  const dirLabel = (d: EarDirection) => d === 'asc' ? t.ascending : d === 'desc' ? t.descending : t.mixed;
  const diffLabel = (d: 'basic' | 'advanced') => d === 'basic' ? (he ? 'בסיסי' : 'Basic') : (he ? 'מתקדם' : 'Advanced');
  const ivName = (id: IntervalId) => INTERVAL_DATA[id][lang].name;
  const earGlyph = icon(<><path d="M4 15v-3a8 8 0 0 1 16 0v3" /><rect x="3" y="14" width="5" height="7" rx="2" /><rect x="16" y="14" width="5" height="7" rx="2" /></>, 32);

  const setting = (label: string, control: React.ReactNode) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: T.textMuted }}>{label}</span>
      {control}
    </div>
  );
  const settings = (
    <Fold title={he ? 'הגדרות' : 'Settings'} open={settingsOpen} onToggle={() => setSettingsOpen(o => !o)}
      summary={[pbLabel(playback), ...(directionDisabled ? [] : [dirLabel(direction)]), diffLabel(difficulty)].join(' · ')}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {setting(he ? 'איך להשמיע' : 'How to play',
          <Segment label={he ? 'איך להשמיע' : 'How to play'} value={playback} onChange={m => setPrefs({ playback: m })}
            items={(['melodic', 'harmonic', 'mixed'] as EarPlayback[]).map(m => ({ id: m, label: pbLabel(m) }))} />)}
        {!directionDisabled && setting(t.direction,
          <Segment label={t.direction} value={direction} onChange={d => setPrefs({ direction: d })}
            items={(['asc', 'desc', 'mixed'] as EarDirection[]).map(d => ({ id: d, label: dirLabel(d) }))} />)}
        {setting(he ? 'רמה' : 'Level',
          <Segment label={he ? 'רמה' : 'Level'} value={difficulty}
            onChange={d => { setDifficulty(d); if (exercise) nextExercise(d === 'advanced' ? INTERVAL_ORDER : BASIC_IVS); }}
            items={(['basic', 'advanced'] as const).map(d => ({ id: d, label: diffLabel(d) }))} />)}
      </div>
    </Fold>
  );

  return (
    <PracticeColumn desktop={desktop} rtl={rtl}>
      {settings}
      <StreakBoard streak={streak} best={data.bestStreak} lang={lang} flush />

      {!exercise ? (
        <StartPanel glyph={earGlyph} title={he ? 'אינטרוולים בשמיעה' : 'Intervals by ear'}
          hint={he ? 'שומעים שני תווים ומזהים את המרחק ביניהם. התו הראשון מסומן על הצוואר.' : 'Hear two notes and name the distance between them. The first note is marked on the neck.'}
          label={he ? 'התחלה' : 'Start'} onStart={() => nextExercise()}
          foot={!signedIn ? (he ? 'התחברו כדי לשמור את השיא שלכם ולהתאים את התרגול אליכם.' : t.signInHint) : undefined} />
      ) : (
        <>
          <Ask desktop={desktop} kicker={he ? 'האזינו ובחרו' : 'Listen and choose'}
            title={answered === 'correct' ? t.correct : answered === 'reset' ? <bdi dir="ltr">{exercise.interval}</bdi> : (he ? 'איזה אינטרוול?' : 'Which interval?')}
            line={revealed ? ivName(exercise.interval) : <>{he ? 'התו הראשון:' : 'First note:'} <bdi dir="ltr">{noteName(exercise.rootMidi)}</bdi></>} />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <WhiteButton onClick={() => playExercise(exercise)} icon={playGlyph}>{he ? 'השמעה שוב' : 'Play again'}</WhiteButton>
            <SoftButton onClick={() => playMidi(exercise.rootMidi)}>{he ? 'רק התו הראשון' : 'First note only'}</SoftButton>
          </div>

          <Card ref={answerArea} title={he ? 'מה המרחק?' : 'What\u2019s the distance?'}>
            <div dir="ltr" style={{ display: 'grid', gridTemplateColumns: `repeat(${desktop ? 6 : pool.length > 6 ? 4 : 3}, minmax(0, 1fr))`, gap: 6 }}>
              {pool.map(id => (
                <AnswerTile key={id} onClick={() => guess(id)} disabled={revealed} height={52} size={18}
                  state={revealed && id === exercise.interval ? 'right' : wrongPicks.has(id) ? 'wrong' : 'idle'}>{id}</AnswerTile>
              ))}
            </div>
            <Status good={answered === 'correct'}>
              {answered === 'reset' ? <>{t.wrong}. {he ? 'התשובה:' : 'The answer:'} {ivName(exercise.interval)}</> : wrongPicks.size === 1 && !answered ? (he ? 'לא זה. עוד ניסיון אחד.' : 'Not that one. One more try.') : null}
            </Status>
          </Card>

          {/* The neck shows only the first note; the second appears once answered */}
          <Card title={he ? 'על הצוואר' : 'On the neck'}
            aside={<div style={{ display: 'flex', gap: 14 }}>
              {legendDot(revealed ? T.secondary : T.primary, he ? 'התו הראשון' : 'First note')}
              {revealed && legendDot(T.primary, he ? 'התשובה' : 'Answer')}
            </div>}>
            <div dir="ltr">
              <WindowedFretboard winStart={exercise.winStart} root={exercise.root} targetPositions={exercise.targetPositions}
                feedback={null} showAnswer={revealed} disabled onPick={() => {}} />
            </div>
          </Card>

          <PlayToAnswer lang={lang} mic={mic} />
        </>
      )}

      {weak.length > 0 && (
        <Card title={he ? 'מה עוד קשה' : 'Still tricky'}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {weak.map(w => (
              <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ display: 'flex', flexDirection: 'column', width: desktop ? 150 : 110, flex: 'none', minWidth: 0 }}>
                  <span className="gc-notation" style={{ fontSize: 15, fontWeight: 700 }}>{w.id}</span>
                  <span style={{ fontSize: 13, color: T.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ivName(w.id)}</span>
                </span>
                <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.1)', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', insetInlineStart: 0, top: 0, bottom: 0, borderRadius: 3, width: `${Math.round(w.acc * 100)}%`, background: T.text }} />
                </div>
                <span dir="ltr" style={{ width: 44, textAlign: 'end', fontSize: 14, fontWeight: 600, color: T.textMuted }}>{Math.round(w.acc * 100)}%</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </PracticeColumn>
  );
};
