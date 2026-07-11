import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { T, card } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { playScale, playError } from '../../utils/audioPlayback';
import { SCALE_DATA, SCALE_ORDER, UI } from './data';
import type { Lang, ScaleId } from './data';
import {
  NOTE_BANK, spellScale, validRoots, pcOf,
  makeChallenge, pickWeightedScale, placeBox, boxDots, scaleMidiRun, linearString,
} from './engine';
import type { Challenge } from './engine';
import { BoxFretboard, OneStringDiagram } from './ScaleDiagrams';
import {
  loadLocal, saveLocal, loadRemote, saveRemote, mergeRemote,
} from '../../services/scaleTrainer';
import type { ScaleTrainerData } from '../../services/scaleTrainer';

interface Props { desktop?: boolean }

type SubMode = 'learn' | 'practice';

const LABEL: React.CSSProperties = {
  fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
  color: T.textDim, margin: '0 0 6px', fontWeight: 600,
};

/** Challenge caption, e.g. "Eb Major Scale" / "Eb סולם מז'ור". */
function challengeTitle(ch: Challenge, lang: Lang): string {
  const name = SCALE_DATA[ch.scale][lang].name;
  return lang === 'he' ? `${name} — ${ch.root}` : `${ch.root} ${name}`;
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
export const ScaleTrainerTab: React.FC<Props> = () => {
  const { user } = useAuth();

  const [data, setData] = useState<ScaleTrainerData>(() => loadLocal());
  const dataRef = useRef(data);
  useEffect(() => { dataRef.current = data; }, [data]);

  const [sub, setSub] = useState<SubMode>('learn');
  const lang: Lang = data.prefs.lang;
  const t = UI[lang];
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

  const setLang = useCallback((l: Lang) => {
    setData(d => ({ ...d, prefs: { ...d.prefs, lang: l } }));
  }, []);

  const recordResult = useCallback((scale: ScaleId, correct: boolean) => {
    setData(d => {
      const s = d.stats[scale] ?? { correct: 0, wrong: 0 };
      return {
        ...d,
        stats: {
          ...d.stats,
          [scale]: {
            correct: s.correct + (correct ? 1 : 0),
            wrong: s.wrong + (correct ? 0 : 1),
          },
        },
      };
    });
  }, []);

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} style={{ fontFamily: 'var(--gc-font)' }}>
      {/* Header: title + language */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: T.text, letterSpacing: '-0.2px' }}>
          {t.title}
        </h2>
        <div style={{ display: 'flex', border: `1px solid ${T.border}` }}>
          {(['en', 'he'] as Lang[]).map((l, i) => (
            <button key={l} onClick={() => setLang(l)}
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

      {/* Learn / Practice */}
      <div style={{ display: 'flex', border: `1px solid ${T.border}`, marginBottom: 18 }}>
        {(['learn', 'practice'] as SubMode[]).map((m, i) => (
          <button key={m} onClick={() => setSub(m)}
            style={{
              flex: 1, padding: '10px 4px', minHeight: 42, borderRadius: 0, cursor: 'pointer',
              fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase',
              fontWeight: sub === m ? 600 : 400,
              borderLeft: i > 0 ? `1px solid ${T.border}` : 'none',
              background: sub === m ? T.secondary : 'transparent',
              color: sub === m ? '#fff' : T.textDim,
            }}>
            {m === 'learn' ? t.learn : t.practice}
          </button>
        ))}
      </div>

      {sub === 'learn'
        ? <LearnMode lang={lang} />
        : (
          <PracticeMode
            lang={lang}
            data={data}
            recordResult={recordResult}
            onNewBest={(best) => setData(d => (best > d.bestStreak ? { ...d, bestStreak: best } : d))}
            signedIn={!!user}
          />
        )}
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════════
//  Learn Mode — hard-coded theory content + linear & box previews
// ════════════════════════════════════════════════════════════════════════════
const LearnMode: React.FC<{ lang: Lang }> = ({ lang }) => {
  const t = UI[lang];
  const [selected, setSelected] = useState<ScaleId>('major');
  const [root, setRoot] = useState('C');

  const roots = useMemo(() => validRoots(selected), [selected]);
  // A picked root can be invalid for the next scale type — fall back silently.
  const effRoot = roots.includes(root) ? root : (selected.includes('minor') ? 'A' : 'C');

  const copy = SCALE_DATA[selected][lang];
  const notes = useMemo(() => spellScale(effRoot, selected)!, [effRoot, selected]);
  const box = useMemo(() => placeBox(notes[0]), [notes]);
  // Slide the 5-fret box window along the neck to view other positions.
  const MAX_START = 12;
  const [winShift, setWinShift] = useState(0);
  useEffect(() => setWinShift(0), [notes]); // reset when the scale/root changes
  const winStart = Math.min(Math.max(0, box.winStart + winShift), MAX_START);
  const dots = useMemo(() => boxDots(notes, winStart), [notes, winStart]);
  const linStr = useMemo(() => linearString(notes[0]), [notes]);
  const midiRun = useMemo(() => scaleMidiRun(selected, box.rootMidi), [selected, box.rootMidi]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <p style={LABEL}>{t.pickScale}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
          {SCALE_ORDER.map(id => {
            const active = id === selected;
            return (
              <button key={id} onClick={() => setSelected(id)}
                style={{
                  padding: '10px 4px', borderRadius: 0, cursor: 'pointer',
                  border: active ? 'none' : `1px solid ${T.border}`,
                  borderLeft: '3px solid var(--gc-bar-color)',
                  background: active ? T.secondary : T.bgInput,
                  color: active ? '#fff' : T.textMuted,
                  fontSize: 13, fontWeight: active ? 700 : 500,
                }}>
                {SCALE_DATA[id][lang].name}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p style={LABEL}>{t.pickRoot}</p>
        <div dir="ltr" style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {roots.map(r => {
            const active = r === effRoot;
            return (
              <button key={r} onClick={() => setRoot(r)}
                style={{
                  minWidth: 40, padding: '7px 6px', borderRadius: 0, cursor: 'pointer',
                  border: active ? 'none' : `1px solid ${T.border}`,
                  background: active ? T.primary : T.bgInput,
                  color: active ? T.white : T.textMuted,
                  fontSize: 12, fontWeight: active ? 700 : 500,
                  textTransform: 'none',  // keep flats lowercase: Db, not DB
                }}>
                {r}
              </button>
            );
          })}
        </div>
      </div>

      {/* Theory card — straight from the hard-coded content */}
      <div style={card({ padding: 16 })}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
          <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: T.text }}>
            {lang === 'he' ? `${copy.name} — ${effRoot}` : `${effRoot} ${copy.name}`}
          </h3>
        </div>
        <p style={{ margin: '0 0 10px', fontSize: 14, lineHeight: 1.5, color: T.textMuted }}>{copy.desc}</p>
        <p style={{ margin: '0 0 6px', fontSize: 13, color: T.textMuted }}>
          <span style={{ color: T.textDim, fontWeight: 600 }}>{t.formulaLabel}: </span>
          <span dir={lang === 'he' ? 'rtl' : 'ltr'} style={{ fontWeight: 600, color: T.text }}>{copy.formula}</span>
        </p>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: T.textMuted }}>
          <span style={{ color: T.textDim, fontWeight: 600 }}>{t.anchorLabel}: </span>{copy.anchor}
        </p>

        {/* Spelled notes */}
        <p style={{ ...LABEL, margin: '0 0 8px' }}>{t.notesLabel}</p>
        <div dir="ltr" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
          {notes.map((n, i) => (
            <span key={i} style={{
              width: 40, height: 40, borderRadius: '50%',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: i === 0 ? T.primary : T.success, color: '#fff',
              fontSize: 13, fontWeight: 700, border: '2px solid #fff',
              boxShadow: '0 0 0 1px rgba(0,0,0,0.12)',
            }}>
              {n}
            </span>
          ))}
        </div>
      </div>

      {/* Linear — the pattern along one string */}
      <div style={card({ padding: 14 })}>
        <p style={LABEL}>{t.onOneString}</p>
        <OneStringDiagram string={linStr} notes={notes} />
      </div>

      {/* Box — slide the window to see the scale in other positions */}
      <div style={card({ padding: 14 })}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
          <p style={{ ...LABEL, margin: 0 }}>{t.boxPosition}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={() => setWinShift(s => s - 1)} disabled={winStart <= 0} aria-label="Previous position" style={posBtn(winStart <= 0)}>‹</button>
            <span dir="ltr" style={{ fontSize: 11, color: T.textDim, minWidth: 84, textAlign: 'center' }}>
              {t.positionLabel} · fr {winStart}–{winStart + 4}
            </span>
            <button onClick={() => setWinShift(s => s + 1)} disabled={winStart >= MAX_START} aria-label="Next position" style={posBtn(winStart >= MAX_START)}>›</button>
          </div>
        </div>
        <BoxFretboard winStart={winStart} dots={dots} />
        <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 14, marginTop: 8, fontSize: 11, color: T.textDim }}>
          <LegendDot color={T.primary} label={t.rootLabel} />
          <LegendDot color={T.success} label={t.scaleNoteLabel} />
        </div>
        <div style={{ marginTop: 12 }}>
          <button onClick={() => playScale(midiRun)} style={playBtn(true)}>▶ {t.playScale}</button>
        </div>
      </div>
    </div>
  );
};

function playBtn(primary: boolean): React.CSSProperties {
  return {
    flex: 1, width: '100%', padding: '11px 0', borderRadius: 0, cursor: 'pointer',
    fontSize: 14, fontWeight: 500,
    border: primary ? 'none' : `1px solid ${T.border}`,
    borderLeft: '4px solid var(--gc-bar-color)',
    background: primary ? T.primary : T.bgInput,
    color: primary ? T.white : T.textMuted,
  };
}

function posBtn(disabled: boolean): React.CSSProperties {
  return {
    width: 30, height: 30, borderRadius: 0, cursor: disabled ? 'default' : 'pointer',
    border: `1px solid ${T.border}`, background: T.bgInput,
    color: disabled ? T.textDim : T.text, fontSize: 16, lineHeight: 1,
    borderLeft: '3px solid var(--gc-bar-color)',
  };
}

// ════════════════════════════════════════════════════════════════════════════
//  Practice Mode — strict enharmonic scale spelling
// ════════════════════════════════════════════════════════════════════════════
interface PracticeProps {
  lang: Lang;
  data: ScaleTrainerData;
  recordResult: (scale: ScaleId, correct: boolean) => void;
  onNewBest: (best: number) => void;
  signedIn: boolean;
}

type Phase = 'spelling' | 'reward';
type Hint = 'enharmonic' | 'wrong' | null;

const PracticeMode: React.FC<PracticeProps> = ({ lang, data, recordResult, onNewBest, signedIn }) => {
  const t = UI[lang];

  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [filled, setFilled] = useState(1);          // slot 0 (root) is pre-filled
  const [flawless, setFlawless] = useState(true);
  const [phase, setPhase] = useState<Phase>('spelling');
  const [errorBtn, setErrorBtn] = useState<string | null>(null);
  const [hint, setHint] = useState<Hint>(null);
  const [streak, setStreak] = useState(0);
  const errTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (errTimer.current) clearTimeout(errTimer.current); }, []);

  const nextChallenge = useCallback(() => {
    const scale = pickWeightedScale(data.stats);
    setChallenge(makeChallenge(scale));
    setFilled(1);
    setFlawless(true);
    setPhase('spelling');
    setErrorBtn(null);
    setHint(null);
  }, [data.stats]);

  const handlePick = useCallback((name: string) => {
    if (!challenge || phase !== 'spelling') return;
    const expected = challenge.notes[filled];

    if (name === expected) {
      setErrorBtn(null);
      setHint(null);
      const nextFilled = filled + 1;
      setFilled(nextFilled);
      if (nextFilled === challenge.notes.length) {
        // Scale complete → record, update streak, drop the notes onto the neck.
        recordResult(challenge.scale, flawless);
        if (flawless) {
          const next = streak + 1;
          setStreak(next);
          onNewBest(next);
        }
        setPhase('reward');
      }
    } else {
      // Strict enharmonic rule: the right pitch under the wrong letter is an
      // error too — but it gets its own, more instructive hint.
      playError();
      navigator.vibrate?.(30);
      setErrorBtn(name);
      setHint(pcOf(name) === pcOf(expected) ? 'enharmonic' : 'wrong');
      if (flawless) {
        setFlawless(false);
        setStreak(0);
        recordResult(challenge.scale, false);
      }
      if (errTimer.current) clearTimeout(errTimer.current);
      errTimer.current = setTimeout(() => setErrorBtn(null), 500);
    }
  }, [challenge, phase, filled, flawless, streak, recordResult, onNewBest]);

  // ── Reward-phase fretboard data ─────────────────────────────────────────────
  const box = useMemo(() => (challenge ? placeBox(challenge.root) : null), [challenge]);
  const dots = useMemo(
    () => (challenge && box ? boxDots(challenge.notes, box.winStart) : []),
    [challenge, box],
  );
  const midiRun = useMemo(
    () => (challenge && box ? scaleMidiRun(challenge.scale, box.rootMidi) : []),
    [challenge, box],
  );

  // ── Weak spots (most-misspelled scales with enough data) ───────────────────
  const weak = useMemo(() => {
    return SCALE_ORDER
      .map(id => {
        const s = data.stats[id];
        const total = (s?.correct ?? 0) + (s?.wrong ?? 0);
        const acc = total > 0 ? (s!.correct / total) : 1;
        return { id, total, acc };
      })
      .filter(x => x.total >= 3 && x.acc < 1)
      .sort((a, b) => a.acc - b.acc)
      .slice(0, 3);
  }, [data.stats]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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

      {!challenge ? (
        <div style={{ ...card({ padding: 28 }), textAlign: 'center' }}>
          <p style={{ margin: '0 0 16px', fontSize: 14, lineHeight: 1.6, color: T.textMuted }}>{t.startPrompt}</p>
          <button onClick={nextChallenge}
            style={{ padding: '12px 40px', borderRadius: 0, cursor: 'pointer', fontSize: 15, fontWeight: 500, background: T.primary, color: T.white, border: 'none', borderLeft: '4px solid var(--gc-bar-color)' }}>
            {t.start}
          </button>
          {!signedIn && <p style={{ margin: '16px 0 0', fontSize: 11, color: T.textDim }}>{t.signInHint}</p>}
        </div>
      ) : (
        <div style={card({ padding: 16 })}>
          <h3 dir="ltr" style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, color: T.text, textAlign: 'center' }}>
            {challengeTitle(challenge, lang)}
          </h3>
          <p style={{ margin: '0 0 14px', fontSize: 12, color: T.textDim, textAlign: 'center' }}>
            {phase === 'spelling' ? t.spellPrompt : t.completeTitle}
          </p>

          {/* Spelling slots — degree-numbered, root pre-filled */}
          <div dir="ltr" style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
            {challenge.notes.map((n, i) => {
              const isFilled = i < filled;
              const isCurrent = phase === 'spelling' && i === filled;
              return (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                  <div style={{
                    width: 44, height: 44,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 15, fontWeight: 700,
                    background: isFilled ? (i === 0 ? T.primary : T.success) : T.bgInput,
                    color: isFilled ? '#fff' : T.textDim,
                    border: isCurrent ? `2px solid ${T.secondary}` : `1px solid ${T.border}`,
                  }}>
                    {isFilled ? n : ''}
                  </div>
                  <span style={{ fontSize: 10, color: isCurrent ? T.text : T.textDim, fontWeight: isCurrent ? 700 : 400 }}>{i + 1}</span>
                </div>
              );
            })}
          </div>

          {phase === 'spelling' ? (
            <>
              {/* Note bank — every valid single-accidental name, no duplicates */}
              <p style={LABEL}>{t.noteBank}</p>
              <div dir="ltr" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(52px, 1fr))', gap: 5 }}>
                {NOTE_BANK.map(n => {
                  const isErr = errorBtn === n;
                  return (
                    <button key={n} onClick={() => handlePick(n)}
                      style={{
                        padding: '11px 2px', borderRadius: 0, cursor: 'pointer',
                        fontSize: 14, fontWeight: 600,
                        border: isErr ? 'none' : `1px solid ${T.border}`,
                        background: isErr ? T.error : T.bgInput,
                        color: isErr ? '#fff' : T.textMuted,
                        transition: 'background .12s ease',
                        textTransform: 'none',  // keep flats lowercase: Db, not DB
                      }}>
                      {n}
                    </button>
                  );
                })}
              </div>

              {/* Feedback line */}
              <div style={{ minHeight: 34, marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {hint === 'enharmonic' && (
                  <span style={{ fontSize: 13, fontWeight: 600, color: T.error, textAlign: 'center' }}>✕ {t.enharmonicHint}</span>
                )}
                {hint === 'wrong' && (
                  <span style={{ fontSize: 13, fontWeight: 600, color: T.error, textAlign: 'center' }}>✕ {t.wrongHint}</span>
                )}
              </div>
            </>
          ) : (
            <>
              {/* Reward — the spelled notes drop onto the neck */}
              {flawless && (
                <p style={{ textAlign: 'center', margin: '0 0 8px', fontSize: 14, fontWeight: 700, color: T.success }}>
                  ✓ {t.completeFlawless}
                </p>
              )}
              {box && <BoxFretboard winStart={box.winStart} dots={dots} animate />}
              <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 14, marginTop: 8, fontSize: 11, color: T.textDim }}>
                <LegendDot color={T.primary} label={t.rootLabel} />
                <LegendDot color={T.success} label={t.scaleNoteLabel} />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button onClick={() => playScale(midiRun)} style={playBtn(true)}>▶ {t.playScale}</button>
              </div>
              <button onClick={nextChallenge}
                style={{ width: '100%', marginTop: 10, padding: '12px 0', borderRadius: 0, cursor: 'pointer', fontSize: 14, fontWeight: 600, background: T.secondary, color: '#fff', border: 'none', borderLeft: '4px solid var(--gc-bar-color)' }}>
                {t.next} →
              </button>
            </>
          )}
        </div>
      )}

      {/* Weak spots analytics */}
      {weak.length > 0 && (
        <div style={card({ padding: 14 })}>
          <p style={LABEL}>{t.weakSpots}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {weak.map(w => (
              <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ minWidth: 110, fontSize: 12, fontWeight: 700, color: T.text }}>{SCALE_DATA[w.id][lang].name}</span>
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
