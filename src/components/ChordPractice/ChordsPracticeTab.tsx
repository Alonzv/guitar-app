import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chord as TonalChord, Note } from '@tonaljs/tonal';
import { NOTE_BANK, pcOf } from '../ScaleTrainer/engine';
import { playMidi } from '../../utils/audioPlayback';
import { answeredRight, answeredWrong } from '../../practice/feedback';
import { StreakBoard } from '../Practice/StreakBoard';
import { PlayToAnswer } from '../Practice/PlayToAnswer';
import { useMicNotes } from '../../practice/useMicNotes';
import { T, btn } from '../../theme';
import { PosterTitle, Rule, Pill, PillRow, Cta } from '../Transit/parts';
import { keyStyle } from '../Transit/styles';
import { useLang } from '../../contexts/LanguageContext';
import { useOptionalSong } from '../../song/SongContext';

// ── Chords → Practice ────────────────────────────────────────────────────────
// Two drills: a Chord Speller (Theory) and Ear Training, both built out.
// Difficulty toggle + the shared
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

type Mode = 'theory' | 'ear';
type Diff = 'basic' | 'advanced' | 'song';

interface Challenge { root: string; quality: string; chordName: string; notes: string[]; degrees: string[]; midis: number[] }

// A song chord in this drill's terms, when the drill can ask for it.
const QUALITY_OF: Record<string, string> = { '': 'maj', M: 'maj', m: 'min', maj7: 'maj7', m7: 'min7', '7': 'dom7', dim: 'dim', aug: 'aug' };
function songChordPairs(names: string[]): { root: string; quality: string }[] {
  const out: { root: string; quality: string }[] = [];
  for (const n of names) {
    const m = n.match(/^([A-G][b#]?)(.*)$/);
    const quality = m ? QUALITY_OF[m[2]] : undefined;
    if (m && quality && !out.some(o => o.root === m[1] && o.quality === quality)) out.push({ root: m[1], quality });
  }
  return out;
}

function makeChallenge(diff: Diff, songPairs: { root: string; quality: string }[] = []): Challenge {
  const pool = diff === 'advanced' ? ADVANCED : BASIC;
  for (let attempt = 0; attempt < 200; attempt++) {
    const pick = diff === 'song' && songPairs.length ? songPairs[Math.floor(Math.random() * songPairs.length)] : null;
    const root = pick?.root ?? ROOT_POOL[Math.floor(Math.random() * ROOT_POOL.length)];
    const quality = pick?.quality ?? pool[Math.floor(Math.random() * pool.length)];
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

export function ChordsPracticeTab({ desktop }: { desktop?: boolean } = {}) {
  const { lang, rtl } = useLang();
  const [mode, setMode] = useState<Mode>('theory');
  const [diff, setDiff] = useState<Diff>('basic');
  // "My song": spell and hear the chords of the song being written.
  const songNames = (useOptionalSong()?.song.sections ?? []).flatMap(sec => sec.progression.map(c => c.chord.name)).join('|');
  const songPairs = useMemo(() => songChordPairs(songNames.split('|')).filter(p => {
    const notes = TonalChord.get(p.root + TONAL_SUFFIX[p.quality]).notes;
    return notes.length > 0 && notes.every(n => BANK.has(n));
  }), [songNames]);

  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [filled, setFilled] = useState(1);          // degree 1 (root) pre-filled
  const [phase, setPhase] = useState<'spell' | 'done'>('spell');
  const [wrongs, setWrongs] = useState(0);          // wrong taps on the current chord
  const [errBtn, setErrBtn] = useState<string | null>(null);
  const [hint, setHint] = useState<'retry' | 'wrongSpot' | 'reset' | null>(null);

  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState<number>(loadBest);
  const errTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const answerArea = useRef<HTMLDivElement>(null);   // shakes on a wrong answer
  useEffect(() => () => { if (errTimer.current) clearTimeout(errTimer.current); }, []);

  const start = useCallback((d: Diff = diff) => {
    setChallenge(makeChallenge(d, songPairs));
    setFilled(1); setPhase('spell'); setWrongs(0); setErrBtn(null); setHint(null);
  }, [diff, songPairs]);

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
        answeredRight();
        setPhase('done');
      }
    } else {
      answeredWrong(answerArea.current);
      setErrBtn(name);
      const w = wrongs + 1;
      setWrongs(w);
      // A chord tone picked out of turn is a different mistake from a note that
      // isn't in the chord at all — saying "not in this chord" about the root
      // tells a learner their correct answer was wrong.
      const inChord = challenge.notes.some(n => pcOf(n) === pcOf(name));
      if (w >= 2) { setStreak(0); setHint('reset'); } else { setHint(inChord ? 'wrongSpot' : 'retry'); }
      if (errTimer.current) clearTimeout(errTimer.current);
      errTimer.current = setTimeout(() => setErrBtn(null), 500);
    }
  }, [challenge, phase, filled, wrongs]);

  const playChord = () => { if (challenge) challenge.midis.forEach(m => playMidi(m, 1.1)); };

  // Answer by playing: the played note's pitch picks the bank note with it.
  const mic = useMicNotes(midi => {
    if (!challenge || phase !== 'spell') return;
    const pc = ((midi % 12) + 12) % 12;
    const expected = challenge.notes[filled];
    handlePick(pcOf(expected) === pc ? expected : (NOTE_BANK.find(n => pcOf(n) === pc) ?? expected));
  });

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
    const correct = makeChallenge(d, songPairs);
    const seen = new Set([optKey(correct)]);
    const opts = [correct];
    for (let g = 0; opts.length < 4 && g < 300; g++) {
      const dis = makeChallenge(d === 'song' ? 'advanced' : d);
      if (!seen.has(optKey(dis))) { seen.add(optKey(dis)); opts.push(dis); }
    }
    for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
    setEarCh(correct); setEarOpts(opts); setWrongPicks(new Set()); setRevealed(false);
    setTimeout(() => playHarmonic(correct), 140);
  }, [diff, songPairs]);
  const guess = (opt: Challenge) => {
    if (!earCh || revealed) return;
    if (opt.root === earCh.root && opt.quality === earCh.quality) {
      setRevealed(true);
      answeredRight();
      if (wrongPicks.size === 0)   // first-try correct only
        setStreak(s => { const v = s + 1; setBest(b => { const nb = Math.max(b, v); if (nb !== b) saveBest(nb); return nb; }); return v; });
    } else {
      answeredWrong(answerArea.current);
      const nw = new Set(wrongPicks); nw.add(optKey(opt)); setWrongPicks(nw);
      if (nw.size >= 2) { setStreak(0); setRevealed(true); }   // second wrong → reset + reveal
    }
  };

  const qName = challenge ? chordData[challenge.quality][lang].name : '';
  const formula = challenge ? chordData[challenge.quality].en.formula : '';

  const t = {
    en: { theory: 'Theory', ear: 'Ear Training', basic: 'Basic', advanced: 'Advanced', streak: 'Streak', best: 'Best',
      start: 'Start', next: 'Next →', spell: 'Spell the chord — fill the boxes in order', noteBank: 'Note bank',
      retry: 'Not in this chord — try again.', wrongSpot: 'That note is in the chord, but not in this position.', reset: 'Streak reset — check the formula.', done: 'Correct!', hear: '▶ Hear chord',
      startPrompt: 'Spell chords from their formulas, note by note.',
      earPrompt: 'Hear a chord and pick it from four options.', which: 'Which chord?',
      harm: '▶ Harmonic', arp: '▶ Arpeggio', earStart: 'Play a chord' },
    he: { theory: 'תאוריה', ear: 'שמיעה', basic: 'בסיסי', advanced: 'מתקדם', streak: 'רצף', best: 'שיא',
      start: 'התחל', next: 'הבא →', spell: 'אייתו את האקורד — מלאו את הקופסאות לפי הסדר', noteBank: 'בנק תווים',
      retry: 'לא באקורד — נסו שוב.', wrongSpot: 'התו הזה כן באקורד, אבל לא במקום הזה.', reset: 'הרצף אופס — בדקו את הנוסחה.', done: 'נכון!', hear: '▶ השמע אקורד',
      startPrompt: 'אייתו אקורדים מהנוסחה שלהם, תו אחר תו.',
      earPrompt: 'שמעו אקורד ובחרו אותו מתוך ארבע אפשרויות.', which: 'איזה אקורד?',
      harm: '▶ הרמוני', arp: '▶ ארפג׳ו', earStart: 'נגן אקורד' },
  }[lang];

  const diffs = (songPairs.length ? ['basic', 'advanced', 'song'] : ['basic', 'advanced']) as Diff[];
  const tile = (bg: string, fg: string): React.CSSProperties => ({
    ...keyStyle(false), background: bg, color: fg, letterSpacing: 'normal', textTransform: 'none',
  });

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} style={{ fontFamily: 'var(--gc-font)', width: '100%', maxWidth: desktop ? 720 : undefined, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Theory / Ear, then difficulty */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <PillRow items={[{ id: 'theory' as Mode, label: t.theory }, { id: 'ear' as Mode, label: t.ear }]} value={mode} onChange={setMode} wrap
          label={lang === 'he' ? 'סוג תרגול' : 'Drill'} />
        <PillRow items={diffs.map(d => ({ id: d, label: d === 'basic' ? t.basic : d === 'advanced' ? t.advanced : (lang === 'he' ? 'השיר שלי' : 'My song') }))}
          value={diff} onChange={d => { setDiff(d); if (challenge) start(d); if (earCh) startEar(d); }} wrap
          label={lang === 'he' ? 'רמה' : 'Level'} />
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
            <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
              <Pill onClick={() => playHarmonic(earCh)}>{t.harm}</Pill>
              <Pill onClick={() => playArpeggio(earCh)}>{t.arp}</Pill>
            </div>
            <p className="su-label" style={{ margin: '0 0 8px' }}>{lang === 'he' ? 'אפשרויות' : 'Options'}</p>
            <div ref={answerArea} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              {earOpts.map(opt => {
                const isAnswer = revealed && opt.root === earCh.root && opt.quality === earCh.quality;
                const isWrong = wrongPicks.has(optKey(opt));
                return (
                  <button key={optKey(opt)} onClick={() => guess(opt)} disabled={revealed} className="gc-no-bar gc-notation" style={{
                    ...tile(isAnswer ? T.primary : isWrong ? T.secondary : T.bgInput, isAnswer ? T.onPrimary : isWrong ? T.white : T.text),
                    minHeight: 60, fontSize: 20, cursor: revealed ? 'default' : 'pointer',
                    textDecoration: isWrong ? 'line-through' : undefined,
                  }}>{opt.root} {chordData[opt.quality][lang].name}</button>
                );
              })}
            </div>
            {revealed && (
              <button onClick={() => startEar()} className="gc-no-bar" style={{ ...btn.primary(), width: '100%', marginTop: 14 }}>{t.next}</button>
            )}
          </Rule>
        )
      ) : !challenge ? (
            <Rule>
              <p style={{ margin: '4px 0 16px', fontSize: 14, lineHeight: 1.6, color: T.text }}>{t.startPrompt}</p>
              <Cta onClick={() => start()}>{t.start}</Cta>
            </Rule>
          ) : (
            <Rule>
              <div dir="ltr">
                <PosterTitle head={`${challenge.root} `} tail={<span style={{ WebkitTextStrokeColor: T.text }}>{qName}</span>} max={desktop ? 120 : 76} min={32} as="div" />
              </div>
              <p className="su-label" style={{ margin: '12px 0 14px', color: phase === 'done' ? T.primary : T.textMuted }}>
                {phase === 'spell' ? `${t.spell} · ${formula}` : t.done}
              </p>

              {/* Degree boxes — wrap so wide chords never overflow on mobile;
                  the finished chord is the one cobalt thing */}
              <div dir="ltr" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 18 }}>
                {challenge.notes.map((n, i) => {
                  const isFilled = i < filled;
                  const isCurrent = phase === 'spell' && i === filled;
                  const done = phase === 'done';
                  return (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <div className={`su-semi${isFilled && i > 0 ? ' gc-pop' : ''}`} style={{
                        width: 60, height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
                        fontSize: 24,
                        background: isFilled ? (done ? T.primary : T.secondary) : T.bgInput,
                        color: isFilled ? (done ? T.onPrimary : T.white) : T.textMuted,
                        border: isCurrent ? `var(--su-rule) solid ${T.text}` : 'none',
                      }}>{isFilled ? n : ''}</div>
                      <span style={{ fontSize: 11, color: isCurrent ? T.text : T.textMuted, fontFamily: 'var(--gc-mono)', fontWeight: 700 }}>{challenge.degrees[i]}</span>
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
                        <button key={n} onClick={() => handlePick(n)} className="gc-no-bar gc-notation"
                          style={tile(isErr ? T.secondary : T.bgInput, isErr ? T.white : T.text)}>{n}</button>
                      );
                    })}
                  </div>
                  <div role="status" style={{ minHeight: 34, marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {hint === 'retry' && <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>✕ {t.retry}</span>}
                    {hint === 'wrongSpot' && <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>✕ {t.wrongSpot}</span>}
                    {hint === 'reset' && <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>✕ {t.reset}</span>}
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Pill onClick={playChord}>{t.hear}</Pill>
                  <button onClick={() => start()} className="gc-no-bar" style={{ ...btn.primary(), flex: 1 }}>{t.next}</button>
                </div>
              )}
            </Rule>
          )}
    </div>
  );
}
