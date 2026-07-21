import { useCallback, useEffect, useRef, useState } from 'react';
import { Chord as TonalChord, Note } from '@tonaljs/tonal';
import { NOTE_BANK, pcOf } from '../ScaleTrainer/engine';
import { playMidi, playError } from '../../utils/audioPlayback';
import { T, card } from '../../theme';

// ── Chords → Practice ────────────────────────────────────────────────────────
// Phase 2 of the unified Practice Mode: a Chord Speller (Theory) plus a
// placeholder for Ear Training (Phase 3). Difficulty toggle + the shared
// second-chance streak (first wrong answer is forgiven with a palette-Error
// flash; a second wrong on the same chord resets the streak). Colours come only
// from the palette — never generic green/red.

// Hard-coded theory content (do NOT generate) — names + formulas, en/he.
const chordData: Record<string, { en: { name: string; formula: string }; he: { name: string; formula: string } }> = {
  maj:  { en: { name: 'Major',        formula: '1-3-5' },    he: { name: 'מז׳ור',    formula: '1-3-5' } },
  min:  { en: { name: 'Minor',        formula: '1-b3-5' },   he: { name: 'מינור',    formula: '1-b3-5' } },
  maj7: { en: { name: 'Major 7',      formula: '1-3-5-7' },  he: { name: 'מז׳ור 7',  formula: '1-3-5-7' } },
  min7: { en: { name: 'Minor 7',      formula: '1-b3-5-b7' },he: { name: 'מינור 7',  formula: '1-b3-5-b7' } },
  dom7: { en: { name: 'Dominant 7',   formula: '1-3-5-b7' }, he: { name: 'דומיננט 7',formula: '1-3-5-b7' } },
  dim:  { en: { name: 'Diminished',   formula: '1-b3-b5' },  he: { name: 'מוקטן',    formula: '1-b3-b5' } },
  aug:  { en: { name: 'Augmented',    formula: '1-3-#5' },   he: { name: 'מוגדל',    formula: '1-3-#5' } },
};
const TONAL_SUFFIX: Record<string, string> = {
  maj: '', min: 'm', maj7: 'maj7', min7: 'm7', dom7: '7', dim: 'dim', aug: 'aug',
};
const BASIC: string[] = ['maj', 'min', 'maj7', 'min7', 'dom7'];
const ADVANCED: string[] = [...BASIC, 'dim', 'aug'];
// Common roots only — keeps the enharmonic spelling answerable from the bank.
const ROOT_POOL = ['C', 'G', 'D', 'A', 'E', 'F', 'Bb', 'Eb'];
const BANK = new Set<string>(NOTE_BANK as readonly string[]);

type Lang = 'en' | 'he';
type Mode = 'theory' | 'ear';
type Diff = 'basic' | 'advanced';

interface Challenge { root: string; quality: string; chordName: string; notes: string[]; degrees: string[]; midis: number[] }

function makeChallenge(diff: Diff): Challenge {
  const pool = diff === 'advanced' ? ADVANCED : BASIC;
  for (let attempt = 0; attempt < 200; attempt++) {
    const root = ROOT_POOL[Math.floor(Math.random() * ROOT_POOL.length)];
    const quality = pool[Math.floor(Math.random() * pool.length)];
    const chordName = root + TONAL_SUFFIX[quality];
    const notes = TonalChord.get(chordName).notes;
    if (!notes.length) continue;
    if (!notes.every(n => BANK.has(n))) continue;   // spelling must be answerable from the bank
    const degrees = chordData[quality].en.formula.split('-');
    if (degrees.length !== notes.length) continue;
    // ascending MIDI for playback
    let prev = -Infinity;
    const midis = notes.map(n => { let m = Note.midi(n + '3') ?? 48; while (m <= prev) m += 12; prev = m; return m; });
    return { root, quality, chordName, notes, degrees, midis };
  }
  // Fallback — C major always works.
  const notes = TonalChord.get('C').notes;
  return { root: 'C', quality: 'maj', chordName: 'C', notes, degrees: ['1', '3', '5'], midis: notes.map((_, i) => 48 + [0, 4, 7][i]) };
}

const STORE = 'scaleup_chord_practice';
const loadBest = () => { try { return JSON.parse(localStorage.getItem(STORE) || '{}').best ?? 0; } catch { return 0; } };
const saveBest = (best: number) => { try { localStorage.setItem(STORE, JSON.stringify({ best })); } catch { /* private mode */ } };

const LBL: React.CSSProperties = {
  margin: '0 0 8px', fontSize: 10, color: '#9C958C',
  fontFamily: 'var(--gc-mono)', letterSpacing: '0.14em', textTransform: 'uppercase',
};

export function ChordsPracticeTab({ desktop }: { desktop?: boolean } = {}) {
  const [lang, setLang] = useState<Lang>('en');
  const [mode, setMode] = useState<Mode>('theory');
  const [diff, setDiff] = useState<Diff>('basic');
  const rtl = lang === 'he';

  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [filled, setFilled] = useState(1);          // degree 1 (root) pre-filled
  const [phase, setPhase] = useState<'spell' | 'done'>('spell');
  const [wrongs, setWrongs] = useState(0);          // wrong taps on the current chord
  const [errBtn, setErrBtn] = useState<string | null>(null);
  const [hint, setHint] = useState<'retry' | 'reset' | null>(null);

  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState<number>(loadBest);
  const errTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (errTimer.current) clearTimeout(errTimer.current); }, []);

  const start = useCallback((d: Diff = diff) => {
    setChallenge(makeChallenge(d));
    setFilled(1); setPhase('spell'); setWrongs(0); setErrBtn(null); setHint(null);
  }, [diff]);

  const handlePick = useCallback((name: string) => {
    if (!challenge || phase !== 'spell') return;
    const expected = challenge.notes[filled];
    const rightPitch = pcOf(name) === pcOf(expected);
    const used = new Set(challenge.notes.slice(0, filled).map(n => n[0]));
    const repeatsLetter = name[0] !== expected[0] && used.has(name[0]);
    const accept = name === expected || (rightPitch && !repeatsLetter);

    if (accept) {
      setErrBtn(null); setHint(null);
      const next = filled + 1;
      setFilled(next);
      if (next === challenge.notes.length) {
        // chord complete — count it unless the run already broke this chord
        if (wrongs === 0) {   // streak grows only on a clean, first-try chord
          setStreak(s => { const v = s + 1; setBest(b => { const nb = Math.max(b, v); if (nb !== b) saveBest(nb); return nb; }); return v; });
        }
        setPhase('done');
      }
    } else {
      playError();
      navigator.vibrate?.(30);
      setErrBtn(name);
      const w = wrongs + 1;
      setWrongs(w);
      if (w >= 2) { setStreak(0); setHint('reset'); } else { setHint('retry'); }
      if (errTimer.current) clearTimeout(errTimer.current);
      errTimer.current = setTimeout(() => setErrBtn(null), 500);
    }
  }, [challenge, phase, filled, wrongs]);

  const playChord = () => { if (challenge) challenge.midis.forEach(m => playMidi(m, 1.1)); };

  // ── Ear training — play a chord, pick the whole chord from 4 options ────────
  const [earCh, setEarCh] = useState<Challenge | null>(null);
  const [earOpts, setEarOpts] = useState<Challenge[]>([]);
  const [wrongPicks, setWrongPicks] = useState<Set<string>>(new Set());
  const [revealed, setRevealed] = useState(false);
  const arpTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => arpTimers.current.forEach(clearTimeout), []);

  const optKey = (c: Challenge) => `${c.root}|${c.quality}`;
  const playHarmonic = (ch: Challenge) => ch.midis.forEach(m => playMidi(m, 1.3));
  const playArpeggio = (ch: Challenge) => {
    arpTimers.current.forEach(clearTimeout); arpTimers.current = [];
    ch.midis.forEach((m, i) => arpTimers.current.push(setTimeout(() => playMidi(m, 0.7), i * 300)));
  };
  const startEar = useCallback((d: Diff = diff) => {
    const correct = makeChallenge(d);
    const seen = new Set([optKey(correct)]);
    const opts = [correct];
    for (let g = 0; opts.length < 4 && g < 300; g++) {
      const dis = makeChallenge(d);
      if (!seen.has(optKey(dis))) { seen.add(optKey(dis)); opts.push(dis); }
    }
    for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
    setEarCh(correct); setEarOpts(opts); setWrongPicks(new Set()); setRevealed(false);
    setTimeout(() => playHarmonic(correct), 140);
  }, [diff]);
  const guess = (opt: Challenge) => {
    if (!earCh || revealed) return;
    if (opt.root === earCh.root && opt.quality === earCh.quality) {
      setRevealed(true);
      if (wrongPicks.size === 0)   // first-try correct only
        setStreak(s => { const v = s + 1; setBest(b => { const nb = Math.max(b, v); if (nb !== b) saveBest(nb); return nb; }); return v; });
    } else {
      playError();
      const nw = new Set(wrongPicks); nw.add(optKey(opt)); setWrongPicks(nw);
      if (nw.size >= 2) { setStreak(0); setRevealed(true); }   // second wrong → reset + reveal
    }
  };

  const qName = challenge ? chordData[challenge.quality][lang].name : '';
  const formula = challenge ? chordData[challenge.quality].en.formula : '';

  const t = {
    en: { theory: 'Theory', ear: 'Ear Training', basic: 'Basic', advanced: 'Advanced', streak: 'Streak', best: 'Best',
      start: 'Start', next: 'Next →', spell: 'Spell the chord — fill the boxes in order', noteBank: 'Note bank',
      retry: 'Not in this chord — try again.', reset: 'Streak reset — check the formula.', done: 'Correct!', hear: '▶ Hear chord',
      startPrompt: 'Spell chords from their formulas, note by note.',
      earPrompt: 'Hear a chord and pick it from four options.', which: 'Which chord?',
      harm: '▶ Harmonic', arp: '▶ Arpeggio', earStart: 'Play a chord' },
    he: { theory: 'תאוריה', ear: 'שמיעה', basic: 'בסיסי', advanced: 'מתקדם', streak: 'רצף', best: 'שיא',
      start: 'התחל', next: 'הבא →', spell: 'אייתו את האקורד — מלאו את הקופסאות לפי הסדר', noteBank: 'בנק תווים',
      retry: 'לא באקורד — נסו שוב.', reset: 'הרצף אופס — בדקו את הנוסחה.', done: 'נכון!', hear: '▶ השמע אקורד',
      startPrompt: 'אייתו אקורדים מהנוסחה שלהם, תו אחר תו.',
      earPrompt: 'שמעו אקורד ובחרו אותו מתוך ארבע אפשרויות.', which: 'איזה אקורד?',
      harm: '▶ הרמוני', arp: '▶ ארפג׳ו', earStart: 'נגן אקורד' },
  }[lang];

  const seg = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '9px 4px', borderRadius: 0, cursor: 'pointer', fontSize: 12, letterSpacing: '0.04em',
    fontWeight: active ? 600 : 400, background: active ? T.secondary : 'transparent',
    color: active ? '#fff' : T.textDim, border: 'none',
  });

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} style={{ fontFamily: 'var(--gc-font)', maxWidth: desktop ? 680 : undefined, margin: desktop ? '0 auto' : undefined }}>
      {/* Header: title + lang */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: T.text }}>{rtl ? 'תרגול אקורדים' : 'Chord Practice'}</h2>
        <div style={{ display: 'flex', border: `1px solid ${T.border}` }}>
          {(['en', 'he'] as Lang[]).map((l, i) => (
            <button key={l} onClick={() => setLang(l)} style={{
              padding: '6px 14px', borderRadius: 0, cursor: 'pointer', fontSize: 12, fontWeight: lang === l ? 600 : 400,
              borderLeft: i > 0 ? `1px solid ${T.border}` : 'none', background: lang === l ? T.secondary : 'transparent',
              color: lang === l ? '#fff' : T.textDim,
            }}>{l === 'en' ? 'EN' : 'HE'}</button>
          ))}
        </div>
      </div>

      {/* Theory / Ear toggle */}
      <div style={{ display: 'flex', border: `1px solid ${T.border}`, marginBottom: 12 }}>
        {(['theory', 'ear'] as Mode[]).map((m, i) => (
          <button key={m} onClick={() => setMode(m)} style={{ ...seg(mode === m), borderLeft: i > 0 ? `1px solid ${T.border}` : 'none', textTransform: 'uppercase' }}>
            {m === 'theory' ? t.theory : t.ear}
          </button>
        ))}
      </div>

      {/* Difficulty */}
      <div style={{ display: 'flex', border: `1px solid ${T.border}`, marginBottom: 16 }}>
        {(['basic', 'advanced'] as Diff[]).map((d, i) => (
          <button key={d} onClick={() => { setDiff(d); if (challenge) start(d); if (earCh) startEar(d); }} style={{ ...seg(diff === d), borderLeft: i > 0 ? `1px solid ${T.border}` : 'none' }}>
            {d === 'basic' ? t.basic : t.advanced}
          </button>
        ))}
      </div>

      {/* Streak cards — both modes */}
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
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <button onClick={() => playHarmonic(earCh)} style={{ flex: 1, padding: '12px 0', borderRadius: 0, cursor: 'pointer', fontSize: 14, fontWeight: 600, background: T.bgInput, color: T.text, border: `1px solid ${T.border}`, borderLeft: '3px solid var(--gc-bar-color)' }}>{t.harm}</button>
              <button onClick={() => playArpeggio(earCh)} style={{ flex: 1, padding: '12px 0', borderRadius: 0, cursor: 'pointer', fontSize: 14, fontWeight: 600, background: T.bgInput, color: T.text, border: `1px solid ${T.border}`, borderLeft: '3px solid var(--gc-bar-color)' }}>{t.arp}</button>
            </div>
            <p style={LBL}>{t.which}</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {earOpts.map(opt => {
                const isAnswer = revealed && opt.root === earCh.root && opt.quality === earCh.quality;
                const isWrong = wrongPicks.has(optKey(opt));
                return (
                  <button key={optKey(opt)} onClick={() => guess(opt)} disabled={revealed} style={{
                    padding: '13px 6px', borderRadius: 0, cursor: revealed ? 'default' : 'pointer', fontSize: 14, fontWeight: 600,
                    border: (isAnswer || isWrong) ? 'none' : `1px solid ${T.border}`,
                    background: isAnswer ? T.success : isWrong ? T.error : T.bgInput,
                    color: (isAnswer || isWrong) ? '#fff' : T.textMuted, textTransform: 'none',
                  }}>{opt.root} {chordData[opt.quality][lang].name}</button>
                );
              })}
            </div>
            {revealed && (
              <button onClick={() => startEar()} style={{ width: '100%', marginTop: 14, padding: '12px 0', borderRadius: 0, cursor: 'pointer', fontSize: 14, fontWeight: 600, background: T.secondary, color: '#fff', border: 'none', borderLeft: '4px solid var(--gc-bar-color)' }}>{t.next}</button>
            )}
          </div>
        )
      ) : !challenge ? (
            <div style={{ ...card({ padding: 28 }), textAlign: 'center' }}>
              <p style={{ margin: '0 0 16px', fontSize: 14, lineHeight: 1.6, color: T.textMuted }}>{t.startPrompt}</p>
              <button onClick={() => start()} style={{ padding: '12px 40px', borderRadius: 0, cursor: 'pointer', fontSize: 15, fontWeight: 500, background: T.primary, color: T.white, border: 'none', borderLeft: '4px solid var(--gc-bar-color)' }}>{t.start}</button>
            </div>
          ) : (
            <div style={card({ padding: 16 })}>
              <h3 dir="ltr" style={{ margin: '0 0 2px', fontSize: 22, fontWeight: 700, color: T.text, textAlign: 'center' }}>
                {challenge.root} {qName}
              </h3>
              <p style={{ margin: '0 0 14px', fontSize: 12, color: T.textDim, textAlign: 'center', fontFamily: 'var(--gc-mono)' }}>
                {phase === 'spell' ? `${t.spell} · ${formula}` : t.done}
              </p>

              {/* Degree boxes — flex-wrap so wide chords never overflow on mobile */}
              <div dir="ltr" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginBottom: 16 }}>
                {challenge.notes.map((n, i) => {
                  const isFilled = i < filled;
                  const isCurrent = phase === 'spell' && i === filled;
                  return (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                      <div style={{
                        width: 46, height: 46, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 16, fontWeight: 700,
                        background: isFilled ? (i === 0 ? T.primary : T.success) : T.bgInput,
                        color: isFilled ? '#fff' : T.textDim,
                        border: isCurrent ? `2px solid ${T.secondary}` : `1px solid ${T.border}`,
                      }}>{isFilled ? n : ''}</div>
                      <span style={{ fontSize: 10, color: isCurrent ? T.text : T.textDim, fontFamily: 'var(--gc-mono)', fontWeight: isCurrent ? 700 : 400 }}>{challenge.degrees[i]}</span>
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
                        <button key={n} onClick={() => handlePick(n)} style={{
                          padding: '11px 2px', borderRadius: 0, cursor: 'pointer', fontSize: 14, fontWeight: 600,
                          border: isErr ? 'none' : `1px solid ${T.border}`,
                          background: isErr ? T.error : T.bgInput,
                          color: isErr ? '#fff' : T.textMuted, textTransform: 'none',
                        }}>{n}</button>
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
                    <button onClick={playChord} style={{ flex: 1, padding: '11px 0', borderRadius: 0, cursor: 'pointer', fontSize: 14, fontWeight: 600, background: T.bgInput, color: T.text, border: `1px solid ${T.border}`, borderLeft: '3px solid var(--gc-bar-color)' }}>{t.hear}</button>
                  </div>
                  <button onClick={() => start()} style={{ width: '100%', marginTop: 10, padding: '12px 0', borderRadius: 0, cursor: 'pointer', fontSize: 14, fontWeight: 600, background: T.secondary, color: '#fff', border: 'none', borderLeft: '4px solid var(--gc-bar-color)' }}>{t.next}</button>
                </>
              )}
            </div>
          )}
    </div>
  );
}
