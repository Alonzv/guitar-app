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
import { icon, SoftButton } from '../ChordBuilder/Stage';
import { Segment } from '../Intervals/names';
import { PracticeColumn, StartPanel, Ask, SpellBoxes, AnswerTile, Status, Card, WhiteButton, playGlyph } from '../Practice/kit';
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

  const he = lang === 'he';
  const t = {
    en: { theory: 'Theory', ear: 'Ear training', basic: 'Basic', advanced: 'Advanced', song: 'My song',
      startTitle: 'Spell scales', startHint: 'You get a scale name and write its notes from the formula, one by one.', start: 'Start',
      earTitle: 'Scales by ear', earHint: 'Hear a scale and pick it from four options.', earStart: 'Play a scale',
      spell: 'Spell the scale', done: 'Correct!', formula: 'Formula', nextNote: 'The next note',
      retry: 'That note isn’t in this scale. Try again.', reset: 'Streak reset. Check the formula.',
      next: 'Next scale', hear: 'Hear the scale', listen: 'Listen and choose', which: 'Which scale?', again: 'Play again', answer: 'The answer:' },
    he: { theory: 'תאוריה', ear: 'שמיעה', basic: 'בסיסי', advanced: 'מתקדם', song: 'השיר שלי',
      startTitle: 'אייתו סולמות', startHint: 'מקבלים שם של סולם וכותבים את התווים שלו לפי הנוסחה, תו אחרי תו.', start: 'התחלה',
      earTitle: 'סולמות בשמיעה', earHint: 'שומעים סולם ובוחרים אותו מתוך ארבע אפשרויות.', earStart: 'השמעת סולם',
      spell: 'אייתו את הסולם', done: 'נכון!', formula: 'נוסחה', nextNote: 'התו הבא',
      retry: 'התו הזה לא בסולם. נסו שוב.', reset: 'הרצף התאפס. בדקו את הנוסחה.',
      next: 'הסולם הבא', hear: 'השמעת הסולם', listen: 'האזינו ובחרו', which: 'איזה סולם?', again: 'השמעה שוב', answer: 'התשובה:' },
  }[lang];

  const diffs = (songRoot ? ['basic', 'advanced', 'song'] : ['basic', 'advanced']) as Diff[];
  const scaleGlyph = icon(<><path d="M4 19h4v-4h4v-4h4V7h4" /></>, 32);
  const earGlyph = icon(<><path d="M4 15v-3a8 8 0 0 1 16 0v3" /><rect x="3" y="14" width="5" height="7" rx="2" /><rect x="16" y="14" width="5" height="7" rx="2" /></>, 32);
  const label = (c: Challenge) => <><bdi dir="ltr">{c.root}</bdi> {scaleName(c.scale)}</>;

  return (
    <PracticeColumn desktop={desktop} rtl={rtl}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        <Segment label={he ? 'סוג תרגול' : 'Drill'} value={mode} onChange={setMode}
          items={[{ id: 'theory' as Mode, label: t.theory }, { id: 'ear' as Mode, label: t.ear }]} />
        <Segment label={he ? 'רמה' : 'Level'} value={diff} onChange={onDiff}
          items={diffs.map(d => ({ id: d, label: d === 'basic' ? t.basic : d === 'advanced' ? t.advanced : t.song }))} />
      </div>

      <StreakBoard streak={streak} best={best} lang={lang} flush />

      {mode === 'ear' ? (
        !earCh ? (
          <StartPanel glyph={earGlyph} title={t.earTitle} hint={t.earHint} label={t.earStart} onStart={() => startEar()} />
        ) : (
          <>
            <Ask desktop={desktop} kicker={t.listen} title={t.which} />
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <WhiteButton onClick={() => playRun(earCh)} icon={playGlyph}>{t.again}</WhiteButton>
            </div>
            <div ref={answerArea} style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
              {earOpts.map(opt => {
                const isAnswer = revealed && opt.root === earCh.root && opt.scale === earCh.scale;
                return (
                  <AnswerTile key={optKey(opt)} onClick={() => guess(opt)} disabled={revealed} height={64} size={18}
                    state={isAnswer ? 'right' : wrongPicks.has(optKey(opt)) ? 'wrong' : 'idle'}>
                    {label(opt)}
                  </AnswerTile>
                );
              })}
            </div>
            <Status good={revealed && wrongPicks.size < 2}>
              {revealed && (wrongPicks.size < 2 ? t.done : <>{t.answer} {label(earCh)}</>)}
            </Status>
            {revealed && <WhiteButton wide onClick={() => startEar()}>{t.next}</WhiteButton>}
          </>
        )
      ) : !ch ? (
        <StartPanel glyph={scaleGlyph} title={t.startTitle} hint={t.startHint} label={t.start} onStart={() => startSpell()} />
      ) : (
        <>
          <Ask desktop={desktop} notation
            kicker={phase === 'done' ? t.done : t.spell}
            title={ch.root}
            name={scaleName(ch.scale)}
            line={<>{t.formula} <bdi dir="auto">{SCALE_DATA[ch.scale][lang].formula}</bdi></>} />
          <SpellBoxes small notes={ch.notes} filled={filled} labels={ch.notes.map((_, i) => String(i + 1))} done={phase === 'done'} />

          {phase === 'spell' ? (
            <>
              <Status>{hint && t[hint]}</Status>
              <Card ref={answerArea} title={t.nextNote}>
                <div dir="ltr" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(56px, 1fr))', gap: 6 }}>
                  {NOTE_BANK.map(n => (
                    <AnswerTile key={n} onClick={() => pick(n)} state={errBtn === n ? 'flash' : 'idle'}>{n}</AnswerTile>
                  ))}
                </div>
              </Card>
              <PlayToAnswer lang={lang} mic={mic} />
            </>
          ) : (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
              <WhiteButton onClick={() => startSpell()}>{t.next}</WhiteButton>
              <SoftButton onClick={() => playScale(ch.midis)}>{icon(<path d="M7 4.5v15l13-7.5z" fill="currentColor" stroke="none" />, 15)}{t.hear}</SoftButton>
            </div>
          )}
        </>
      )}
    </PracticeColumn>
  );
}
