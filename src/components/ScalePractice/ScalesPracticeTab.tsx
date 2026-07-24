import { useCallback, useEffect, useRef, useState } from 'react';
import {
  NOTE_BANK, pcOf, spellScale, validRoots, scaleMidiRun,
} from '../ScaleTrainer/engine';
import { SCALE_DATA } from '../ScaleTrainer/data';
import type { ScaleId } from '../ScaleTrainer/data';
import { playScale, playError } from '../../utils/audioPlayback';
import { T, card } from '../../theme';

// ── Scales → Practice ────────────────────────────────────────────────────────
// Unified Practice Mode for scales: Theory (a Scale Speller) + Ear Training
// (play a scale, name it). Basic/Advanced difficulty + the shared second-chance
// streak (first wrong forgiven with a palette-Error flash, a second resets).
// Replaces the old Scale Trainer. Palette colours only — no generic green/red.

const BASIC: ScaleId[] = ['major', 'natural_minor'];
const ADVANCED: ScaleId[] = ['major', 'natural_minor', 'major_pentatonic', 'minor_pentatonic'];

type Lang = 'en' | 'he';
type Mode = 'theory' | 'ear';
type Diff = 'basic' | 'advanced';
const rnd = (n: number) => Math.floor(Math.random() * n);

interface Challenge { scale: ScaleId; root: string; notes: string[]; midis: number[] }

function makeChallenge(pool: ScaleId[]): Challenge {
  for (let i = 0; i < 60; i++) {
    const scale = pool[rnd(pool.length)];
    const roots = validRoots(scale);
    if (!roots.length) continue;
    const root = roots[rnd(roots.length)];
    const notes = spellScale(root, scale);
    if (!notes) continue;
    return { scale, root, notes, midis: scaleMidiRun(scale, 48 + pcOf(root)) };
  }
  return { scale: 'major', root: 'C', notes: spellScale('C', 'major')!, midis: scaleMidiRun('major', 48) };
}

const STORE = 'scaleup_scale_practice_v2';
const loadBest = () => { try { return JSON.parse(localStorage.getItem(STORE) || '{}').best ?? 0; } catch { return 0; } };
const saveBest = (best: number) => { try { localStorage.setItem(STORE, JSON.stringify({ best })); } catch { /* private mode */ } };

const LBL: React.CSSProperties = {
  margin: '0 0 8px', fontSize: 10, color: '#9C958C',
  fontFamily: 'var(--gc-mono)', letterSpacing: '0.14em', textTransform: 'uppercase',
};

export function ScalesPracticeTab({ desktop }: { desktop?: boolean } = {}) {
  const [lang, setLang] = useState<Lang>('en');
  const [mode, setMode] = useState<Mode>('theory');
  const [diff, setDiff] = useState<Diff>('basic');
  const rtl = lang === 'he';
  const scaleName = (s: ScaleId) => SCALE_DATA[s][lang].name;

  const [streak, setStreak] = useState(0);
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
    setCh(makeChallenge(d === 'advanced' ? ADVANCED : BASIC));
    setFilled(1); setPhase('spell'); setWrongs(0); setErrBtn(null); setHint(null);
  }, [diff]);

  const pick = useCallback((name: string) => {
    if (!ch || phase !== 'spell') return;
    const expected = ch.notes[filled];
    const rightPitch = pcOf(name) === pcOf(expected);
    const used = new Set(ch.notes.slice(0, filled).map(n => n[0]));
    const repeats = name[0] !== expected[0] && used.has(name[0]);
    if (name === expected || (rightPitch && !repeats)) {
      setErrBtn(null); setHint(null);
      const next = filled + 1; setFilled(next);
      if (next === ch.notes.length) { if (wrongs === 0) bumpStreak(); setPhase('done'); }
    } else {
      playError(); navigator.vibrate?.(30); setErrBtn(name);
      const w = wrongs + 1; setWrongs(w);
      if (w >= 2) { setStreak(0); setHint('reset'); } else setHint('retry');
      if (errTimer.current) clearTimeout(errTimer.current);
      errTimer.current = setTimeout(() => setErrBtn(null), 500);
    }
  }, [ch, phase, filled, wrongs]);

  // ── Ear training: play a scale, pick the whole scale from 4 options ─────────
  const [earCh, setEarCh] = useState<Challenge | null>(null);
  const [earOpts, setEarOpts] = useState<Challenge[]>([]);
  const [wrongPicks, setWrongPicks] = useState<Set<string>>(new Set());
  const [revealed, setRevealed] = useState(false);

  const optKey = (c: Challenge) => `${c.root}|${c.scale}`;
  const playRun = (c: Challenge) => playScale(c.midis);
  const startEar = useCallback((d: Diff = diff) => {
    const p = d === 'advanced' ? ADVANCED : BASIC;
    const correct = makeChallenge(p);
    const seen = new Set([optKey(correct)]);
    const opts = [correct];
    for (let g = 0; opts.length < 4 && g < 300; g++) {
      const dis = makeChallenge(p);
      if (!seen.has(optKey(dis))) { seen.add(optKey(dis)); opts.push(dis); }
    }
    for (let i = opts.length - 1; i > 0; i--) { const j = rnd(i + 1); [opts[i], opts[j]] = [opts[j], opts[i]]; }
    setEarCh(correct); setEarOpts(opts); setWrongPicks(new Set()); setRevealed(false);
    setTimeout(() => playRun(correct), 160);
  }, [diff]);
  const guess = (opt: Challenge) => {
    if (!earCh || revealed) return;
    if (opt.root === earCh.root && opt.scale === earCh.scale) {
      setRevealed(true); if (wrongPicks.size === 0) bumpStreak();
    } else {
      playError(); const nw = new Set(wrongPicks); nw.add(optKey(opt)); setWrongPicks(nw);
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

  const seg = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '9px 4px', borderRadius: 0, cursor: 'pointer', fontSize: 12, letterSpacing: '0.04em',
    fontWeight: active ? 600 : 400, background: active ? T.secondary : 'transparent', color: active ? '#fff' : T.textDim, border: 'none',
  });

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} style={{ fontFamily: 'var(--gc-font)', maxWidth: desktop ? 680 : undefined, margin: desktop ? '0 auto' : undefined }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: T.text }}>{rtl ? 'תרגול סולמות' : 'Scale Practice'}</h2>
        <div style={{ display: 'flex', border: `1px solid ${T.border}` }}>
          {(['en', 'he'] as Lang[]).map((l, i) => (
            <button key={l} onClick={() => setLang(l)} style={{
              padding: '6px 14px', borderRadius: 0, cursor: 'pointer', fontSize: 12, fontWeight: lang === l ? 600 : 400,
              borderLeft: i > 0 ? `1px solid ${T.border}` : 'none', background: lang === l ? T.secondary : 'transparent', color: lang === l ? '#fff' : T.textDim,
            }}>{l === 'en' ? 'EN' : 'HE'}</button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', border: `1px solid ${T.border}`, marginBottom: 12 }}>
        {(['theory', 'ear'] as Mode[]).map((m, i) => (
          <button key={m} onClick={() => setMode(m)} style={{ ...seg(mode === m), borderLeft: i > 0 ? `1px solid ${T.border}` : 'none', textTransform: 'uppercase' }}>{m === 'theory' ? t.theory : t.ear}</button>
        ))}
      </div>
      <div style={{ display: 'flex', border: `1px solid ${T.border}`, marginBottom: 16 }}>
        {(['basic', 'advanced'] as Diff[]).map((d, i) => (
          <button key={d} onClick={() => onDiff(d)} style={{ ...seg(diff === d), borderLeft: i > 0 ? `1px solid ${T.border}` : 'none' }}>{d === 'basic' ? t.basic : t.advanced}</button>
        ))}
      </div>

      {/* Streak cards */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <div style={{ ...card({ padding: 12 }), flex: 1, textAlign: 'center' }}>
          <p style={{ ...LBL, margin: '0 0 4px' }}>{t.streak}</p>
          <p style={{ margin: 0, fontSize: 26, fontWeight: 700, color: T.text }}>{streak}</p>
        </div>
        <div style={{ ...card({ padding: 12 }), flex: 1, textAlign: 'center' }}>
          <p style={{ ...LBL, margin: '0 0 4px' }}>{t.best}</p>
          <p style={{ margin: 0, fontSize: 26, fontWeight: 700, color: T.text }}>{best}</p>
        </div>
      </div>

      {mode === 'ear' ? (
        !earCh ? (
          <div style={{ ...card({ padding: 28 }), textAlign: 'center' }}>
            <p style={{ margin: '0 0 16px', fontSize: 14, lineHeight: 1.6, color: T.textMuted }}>{t.earPrompt}</p>
            <button onClick={() => startEar()} style={{ padding: '12px 40px', borderRadius: 0, cursor: 'pointer', fontSize: 15, fontWeight: 500, background: T.primary, color: T.white, border: 'none', borderLeft: '4px solid var(--gc-bar-color)' }}>{t.earStart}</button>
          </div>
        ) : (
          <div style={card({ padding: 16 })}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
              <button onClick={() => playRun(earCh)} style={{ padding: '12px 30px', borderRadius: 0, cursor: 'pointer', fontSize: 14, fontWeight: 600, background: T.secondary, color: '#fff', border: 'none', borderLeft: '4px solid var(--gc-bar-color)' }}>{t.play}</button>
            </div>
            <p style={LBL}>{t.which}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
              {earOpts.map(opt => {
                const isAnswer = revealed && opt.root === earCh.root && opt.scale === earCh.scale;
                const isWrong = wrongPicks.has(optKey(opt));
                return (
                  <button key={optKey(opt)} onClick={() => guess(opt)} disabled={revealed} style={{
                    padding: '13px 4px', borderRadius: 0, cursor: revealed ? 'default' : 'pointer', fontSize: 14, fontWeight: 600,
                    border: (isAnswer || isWrong) ? 'none' : `1px solid ${T.border}`,
                    background: isAnswer ? T.success : isWrong ? T.error : T.bgInput,
                    color: (isAnswer || isWrong) ? '#fff' : T.textMuted, textTransform: 'none',
                  }}><span dir="ltr">{opt.root} {scaleName(opt.scale)}</span></button>
                );
              })}
            </div>
            {revealed && (
              <button onClick={() => startEar()} style={{ width: '100%', marginTop: 14, padding: '12px 0', borderRadius: 0, cursor: 'pointer', fontSize: 14, fontWeight: 600, background: T.secondary, color: '#fff', border: 'none', borderLeft: '4px solid var(--gc-bar-color)' }}>{t.next}</button>
            )}
          </div>
        )
      ) : !ch ? (
        <div style={{ ...card({ padding: 28 }), textAlign: 'center' }}>
          <p style={{ margin: '0 0 16px', fontSize: 14, lineHeight: 1.6, color: T.textMuted }}>{t.spellPrompt}</p>
          <button onClick={() => startSpell()} style={{ padding: '12px 40px', borderRadius: 0, cursor: 'pointer', fontSize: 15, fontWeight: 500, background: T.primary, color: T.white, border: 'none', borderLeft: '4px solid var(--gc-bar-color)' }}>{t.start}</button>
        </div>
      ) : (
        <div style={card({ padding: 16 })}>
          <h3 dir="ltr" style={{ margin: '0 0 2px', fontSize: 22, fontWeight: 700, color: T.text, textAlign: 'center' }}>{ch.root} {scaleName(ch.scale)}</h3>
          <p style={{ margin: '0 0 14px', fontSize: 12, color: T.textDim, textAlign: 'center', fontFamily: 'var(--gc-mono)' }}>
            {phase === 'spell' ? `${t.spell} · ${SCALE_DATA[ch.scale][lang].formula}` : '✓'}
          </p>
          <div dir="ltr" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginBottom: 16 }}>
            {ch.notes.map((n, i) => {
              const isFilled = i < filled;
              const isCurrent = phase === 'spell' && i === filled;
              return (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                  <div style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700,
                    background: isFilled ? (i === 0 ? T.primary : T.success) : T.bgInput, color: isFilled ? '#fff' : T.textDim,
                    border: isCurrent ? `2px solid ${T.secondary}` : `1px solid ${T.border}` }}>{isFilled ? n : ''}</div>
                  <span style={{ fontSize: 10, color: isCurrent ? T.text : T.textDim, fontFamily: 'var(--gc-mono)', fontWeight: isCurrent ? 700 : 400 }}>{i + 1}</span>
                </div>
              );
            })}
          </div>
          {phase === 'spell' ? (
            <>
              <p style={LBL}>{t.noteBank}</p>
              <div dir="ltr" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(52px, 1fr))', gap: 5 }}>
                {NOTE_BANK.map(n => {
                  const isErr = errBtn === n;
                  return (
                    <button key={n} onClick={() => pick(n)} style={{ padding: '11px 2px', borderRadius: 0, cursor: 'pointer', fontSize: 14, fontWeight: 600,
                      border: isErr ? 'none' : `1px solid ${T.border}`, background: isErr ? T.error : T.bgInput, color: isErr ? '#fff' : T.textMuted, textTransform: 'none' }}>{n}</button>
                  );
                })}
              </div>
              <div style={{ minHeight: 34, marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {hint === 'retry' && <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>✕ {t.retry}</span>}
                {hint === 'reset' && <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>✕ {t.reset}</span>}
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button onClick={() => playScale(ch.midis)} style={{ flex: 1, padding: '11px 0', borderRadius: 0, cursor: 'pointer', fontSize: 14, fontWeight: 600, background: T.bgInput, color: T.text, border: `1px solid ${T.border}`, borderLeft: '3px solid var(--gc-bar-color)' }}>{t.play}</button>
              </div>
              <button onClick={() => startSpell()} style={{ width: '100%', marginTop: 10, padding: '12px 0', borderRadius: 0, cursor: 'pointer', fontSize: 14, fontWeight: 600, background: T.secondary, color: '#fff', border: 'none', borderLeft: '4px solid var(--gc-bar-color)' }}>{t.next}</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
