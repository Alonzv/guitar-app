import { useCallback, useEffect, useRef, useState } from 'react';
import {
  NOTE_BANK, pcOf, spellScale, validRoots, scaleMidiRun,
} from '../ScaleTrainer/engine';
import { SCALE_DATA } from '../ScaleTrainer/data';
import type { ScaleId } from '../ScaleTrainer/data';
import { playScale } from '../../utils/audioPlayback';
import { answeredRight, answeredWrong } from '../../practice/feedback';
import { StreakBoard } from '../Practice/StreakBoard';
import { PlayToAnswer } from '../Practice/PlayToAnswer';
import { useMicNotes } from '../../practice/useMicNotes';
import { T, btn } from '../../theme';
import { PosterTitle, Rule, Pill, PillRow, Cta } from '../Transit/parts';
import { keyStyle } from '../Transit/styles';
import { useLang } from '../../contexts/LanguageContext';
import { useOptionalSong } from '../../song/SongContext';

// ── Scales → Practice ────────────────────────────────────────────────────────
// Unified Practice Mode for scales: Theory (a Scale Speller) + Ear Training
// (play a scale, name it). Basic/Advanced difficulty + the shared second-chance
// streak (first wrong forgiven with a palette-Error flash, a second resets).
// Replaces the old Scale Trainer. Palette colours only — no generic green/red.

const BASIC: ScaleId[] = ['major', 'natural_minor'];
const ADVANCED: ScaleId[] = ['major', 'natural_minor', 'major_pentatonic', 'minor_pentatonic'];

type Mode = 'theory' | 'ear';
type Diff = 'basic' | 'advanced' | 'song';
const rnd = (n: number) => Math.floor(Math.random() * n);

interface Challenge { scale: ScaleId; root: string; notes: string[]; midis: number[] }

function makeChallenge(pool: ScaleId[], fixedRoot?: string): Challenge {
  for (let i = 0; i < 60; i++) {
    const scale = pool[rnd(pool.length)];
    const roots = fixedRoot && validRoots(scale).includes(fixedRoot) ? [fixedRoot] : validRoots(scale);
    if (!roots.length) continue;
    const root = roots[rnd(roots.length)];
    const notes = spellScale(root, scale);
    if (!notes) continue;
    return { scale, root, notes, midis: scaleMidiRun(scale, 48 + pcOf(root)) };
  }
  return { scale: 'major', root: 'C', notes: spellScale('C', 'major')!, midis: scaleMidiRun('major', 48) };
}

const songPool = (mode: 'major' | 'minor'): ScaleId[] =>
  mode === 'minor' ? ['natural_minor', 'minor_pentatonic'] : ['major', 'major_pentatonic'];
function challengeFor(d: Diff, songRoot: string | undefined, songMode: 'major' | 'minor'): Challenge {
  return d === 'song' && songRoot ? makeChallenge(songPool(songMode), songRoot) : makeChallenge(d === 'advanced' ? ADVANCED : BASIC);
}

const STORE = 'scaleup_scale_practice_v2';
const loadBest = () => { try { return JSON.parse(localStorage.getItem(STORE) || '{}').best ?? 0; } catch { return 0; } };
const saveBest = (best: number) => { try { localStorage.setItem(STORE, JSON.stringify({ best })); } catch { /* private mode */ } };

export function ScalesPracticeTab({ desktop }: { desktop?: boolean } = {}) {
  const { lang, rtl } = useLang();
  const [mode, setMode] = useState<Mode>('theory');
  const [diff, setDiff] = useState<Diff>('basic');
  const scaleName = (s: ScaleId) => SCALE_DATA[s][lang].name;

  // "My song": drill the scales of the song's key.
  const songKey = useOptionalSong()?.key ?? null;
  const songMode = songKey?.mode ?? 'major';
  const songRoot = songKey ? NOTE_BANK.find(n => pcOf(n) === songKey.tonicPc && validRoots(songPool(songMode)[0]).includes(n)) : undefined;

  const [streak, setStreak] = useState(0);
  const answerArea = useRef<HTMLDivElement>(null);   // shakes on a wrong answer
  const [best, setBest] = useState<number>(loadBest);
  const bumpStreak = () => setStreak(s => { const v = s + 1; setBest(b => { const nb = Math.max(b, v); if (nb !== b) saveBest(nb); return nb; }); return v; });

  // ── Theory: scale speller ──────────────────────────────────────────────────
  const [ch, setCh] = useState<Challenge | null>(null);
  const [filled, setFilled] = useState(1);
  const [phase, setPhase] = useState<'spell' | 'done'>('spell');
  const [wrongs, setWrongs] = useState(0);
  const [errBtn, setErrBtn] = useState<string | null>(null);
  const [hint, setHint] = useState<'retry' | 'reset' | null>(null);
  const errTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (errTimer.current) clearTimeout(errTimer.current); }, []);

  const startSpell = useCallback((d: Diff = diff) => {
    setCh(challengeFor(d, songRoot, songMode));
    setFilled(1); setPhase('spell'); setWrongs(0); setErrBtn(null); setHint(null);
  }, [diff, songRoot, songMode]);

  const pick = useCallback((name: string) => {
    if (!ch || phase !== 'spell') return;
    const expected = ch.notes[filled];
    const rightPitch = pcOf(name) === pcOf(expected);
    const used = new Set(ch.notes.slice(0, filled).map(n => n[0]));
    const repeats = name[0] !== expected[0] && used.has(name[0]);
    if (name === expected || (rightPitch && !repeats)) {
      setErrBtn(null); setHint(null);
      const next = filled + 1; setFilled(next);
      if (next === ch.notes.length) { if (wrongs === 0) bumpStreak(); answeredRight(); setPhase('done'); }
    } else {
      answeredWrong(answerArea.current); setErrBtn(name);
      const w = wrongs + 1; setWrongs(w);
      if (w >= 2) { setStreak(0); setHint('reset'); } else setHint('retry');
      if (errTimer.current) clearTimeout(errTimer.current);
      errTimer.current = setTimeout(() => setErrBtn(null), 500);
    }
  }, [ch, phase, filled, wrongs]);

  // Answer by playing: the played note's pitch picks the bank note with it.
  const mic = useMicNotes(midi => {
    if (!ch || phase !== 'spell') return;
    const pc = ((midi % 12) + 12) % 12;
    const expected = ch.notes[filled];
    pick(pcOf(expected) === pc ? expected : (NOTE_BANK.find(n => pcOf(n) === pc) ?? expected));
  });

  // ── Ear training: play a scale, pick the whole scale from 4 options ─────────
  const [earCh, setEarCh] = useState<Challenge | null>(null);
  const [earOpts, setEarOpts] = useState<Challenge[]>([]);
  const [wrongPicks, setWrongPicks] = useState<Set<string>>(new Set());
  const [revealed, setRevealed] = useState(false);

  const optKey = (c: Challenge) => `${c.root}|${c.scale}`;
  const playRun = (c: Challenge) => playScale(c.midis);
  const startEar = useCallback((d: Diff = diff) => {
    const p = d === 'advanced' ? ADVANCED : BASIC;
    const correct = challengeFor(d, songRoot, songMode);
    const seen = new Set([optKey(correct)]);
    const opts = [correct];
    for (let g = 0; opts.length < 4 && g < 300; g++) {
      const dis = makeChallenge(p);
      if (!seen.has(optKey(dis))) { seen.add(optKey(dis)); opts.push(dis); }
    }
    for (let i = opts.length - 1; i > 0; i--) { const j = rnd(i + 1); [opts[i], opts[j]] = [opts[j], opts[i]]; }
    setEarCh(correct); setEarOpts(opts); setWrongPicks(new Set()); setRevealed(false);
    setTimeout(() => playRun(correct), 160);
  }, [diff, songRoot, songMode]);
  const guess = (opt: Challenge) => {
    if (!earCh || revealed) return;
    if (opt.root === earCh.root && opt.scale === earCh.scale) {
      setRevealed(true); answeredRight(); if (wrongPicks.size === 0) bumpStreak();
    } else {
      answeredWrong(answerArea.current); const nw = new Set(wrongPicks); nw.add(optKey(opt)); setWrongPicks(nw);
      if (nw.size >= 2) { setStreak(0); setRevealed(true); }
    }
  };

  const onDiff = (d: Diff) => { setDiff(d); if (ch) startSpell(d); if (earCh) startEar(d); };

  const t = {
    en: { theory: 'Theory', ear: 'Ear Training', basic: 'Basic', advanced: 'Advanced', streak: 'Streak', best: 'Best',
      start: 'Start', next: 'Next →', spell: 'Spell the scale — fill the boxes in order', noteBank: 'Note bank',
      retry: 'Not in this scale — try again.', reset: 'Streak reset — check the formula.',
      spellPrompt: 'Spell scales from their formulas, note by note.',
      earPrompt: 'Hear a scale and name it by ear.', which: 'Which scale?', play: '▶ Play scale', earStart: 'Play a scale' },
    he: { theory: 'תאוריה', ear: 'שמיעה', basic: 'בסיסי', advanced: 'מתקדם', streak: 'רצף', best: 'שיא',
      start: 'התחל', next: 'הבא →', spell: 'אייתו את הסולם — מלאו את הקופסאות לפי הסדר', noteBank: 'בנק תווים',
      retry: 'לא בסולם — נסו שוב.', reset: 'הרצף אופס — בדקו את הנוסחה.',
      spellPrompt: 'אייתו סולמות מהנוסחה שלהם, תו אחר תו.',
      earPrompt: 'שמעו סולם וזהו אותו לפי האוזן.', which: 'איזה סולם?', play: '▶ נגן סולם', earStart: 'נגן סולם' },
  }[lang];

  const diffs = (songRoot ? ['basic', 'advanced', 'song'] : ['basic', 'advanced']) as Diff[];
  const tile = (bg: string, fg: string): React.CSSProperties => ({
    ...keyStyle(false), background: bg, color: fg, letterSpacing: 'normal', textTransform: 'none',
  });

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} style={{ fontFamily: 'var(--gc-font)', width: '100%', maxWidth: desktop ? 720 : undefined, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <PillRow items={[{ id: 'theory' as Mode, label: t.theory }, { id: 'ear' as Mode, label: t.ear }]} value={mode} onChange={setMode} wrap
          label={lang === 'he' ? 'סוג תרגול' : 'Drill'} />
        <PillRow items={diffs.map(d => ({ id: d, label: d === 'basic' ? t.basic : d === 'advanced' ? t.advanced : (lang === 'he' ? 'השיר שלי' : 'My song') }))}
          value={diff} onChange={onDiff} wrap label={lang === 'he' ? 'רמה' : 'Level'} />
      </div>

      <StreakBoard streak={streak} best={best} lang={lang} />

      {mode === 'ear' ? (
        !earCh ? (
          <Rule>
            <p style={{ margin: '4px 0 16px', fontSize: 14, lineHeight: 1.6, color: T.text }}>{t.earPrompt}</p>
            <Cta onClick={() => startEar()}>{t.earStart}</Cta>
          </Rule>
        ) : (
          <Rule>
            <PosterTitle head={t.which} max={desktop ? 96 : 64} min={32} as="div" style={{ marginBottom: 14 }} />
            <div style={{ display: 'flex', marginBottom: 16 }}>
              <Pill onClick={() => playRun(earCh)}>{t.play}</Pill>
            </div>
            <p className="su-label" style={{ margin: '0 0 8px' }}>{lang === 'he' ? 'אפשרויות' : 'Options'}</p>
            <div ref={answerArea} style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 4 }}>
              {earOpts.map(opt => {
                const isAnswer = revealed && opt.root === earCh.root && opt.scale === earCh.scale;
                const isWrong = wrongPicks.has(optKey(opt));
                return (
                  <button key={optKey(opt)} onClick={() => guess(opt)} disabled={revealed} className="gc-no-bar gc-notation" style={{
                    ...tile(isAnswer ? T.primary : isWrong ? T.secondary : T.bgInput, isAnswer ? T.onPrimary : isWrong ? T.white : T.text),
                    minHeight: 60, fontSize: 18, cursor: revealed ? 'default' : 'pointer', textDecoration: isWrong ? 'line-through' : undefined,
                  }}><span dir="ltr">{opt.root} {scaleName(opt.scale)}</span></button>
                );
              })}
            </div>
            {revealed && (
              <button onClick={() => startEar()} className="gc-no-bar" style={{ ...btn.primary(), width: '100%', marginTop: 14 }}>{t.next}</button>
            )}
          </Rule>
        )
      ) : !ch ? (
        <Rule>
          <p style={{ margin: '4px 0 16px', fontSize: 14, lineHeight: 1.6, color: T.text }}>{t.spellPrompt}</p>
          <Cta onClick={() => startSpell()}>{t.start}</Cta>
        </Rule>
      ) : (
        <Rule>
          <div dir="ltr">
            <PosterTitle head={`${ch.root} `} tail={scaleName(ch.scale)} max={desktop ? 120 : 76} min={32} as="div" />
          </div>
          <p className="su-label" style={{ margin: '12px 0 14px', color: phase === 'done' ? T.primary : T.textMuted }}>
            {phase === 'spell' ? `${t.spell} · ${SCALE_DATA[ch.scale][lang].formula}` : '✓'}
          </p>
          {/* Degree boxes — the finished scale is the one cobalt thing */}
          <div dir="ltr" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 18 }}>
            {ch.notes.map((n, i) => {
              const isFilled = i < filled;
              const isCurrent = phase === 'spell' && i === filled;
              const done = phase === 'done';
              return (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div className={`su-semi${isFilled && i > 0 ? ' gc-pop' : ''}`} style={{
                    width: 52, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', fontSize: 22,
                    background: isFilled ? (done ? T.primary : T.secondary) : T.bgInput,
                    color: isFilled ? (done ? T.onPrimary : T.white) : T.textMuted,
                    border: isCurrent ? `var(--su-rule) solid ${T.text}` : 'none',
                  }}>{isFilled ? n : ''}</div>
                  <span style={{ fontSize: 11, color: isCurrent ? T.text : T.textMuted, fontFamily: 'var(--gc-mono)', fontWeight: 700 }}>{i + 1}</span>
                </div>
              );
            })}
          </div>
          {phase === 'spell' ? (
            <>
              <PlayToAnswer lang={lang} mic={mic} />
              <p className="su-label" style={{ margin: '0 0 8px' }}>{t.noteBank}</p>
              <div ref={answerArea} dir="ltr" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(52px, 1fr))', gap: 4 }}>
                {NOTE_BANK.map(n => {
                  const isErr = errBtn === n;
                  return (
                    <button key={n} onClick={() => pick(n)} className="gc-no-bar gc-notation"
                      style={tile(isErr ? T.secondary : T.bgInput, isErr ? T.white : T.text)}>{n}</button>
                  );
                })}
              </div>
              <div role="status" style={{ minHeight: 34, marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {hint === 'retry' && <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>✕ {t.retry}</span>}
                {hint === 'reset' && <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>✕ {t.reset}</span>}
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Pill onClick={() => playScale(ch.midis)}>{t.play}</Pill>
              <button onClick={() => startSpell()} className="gc-no-bar" style={{ ...btn.primary(), flex: 1 }}>{t.next}</button>
            </div>
          )}
        </Rule>
      )}
    </div>
  );
}
