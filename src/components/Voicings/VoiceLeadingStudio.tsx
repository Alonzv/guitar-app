import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ChordInProgression, Tuning } from '../../types/music';
import { playMidi, unlockAudio } from '../../utils/audioPlayback';
import { analyzeProgression, keyName, ALL_KEYS } from '../../utils/harmonicAnalysis';
import type { KeyGuess } from '../../utils/harmonicAnalysis';
import { voiceLead } from '../../utils/voiceLeading';
import type { VoicedProgression } from '../../utils/voiceLeading';
import { T } from '../../theme';
import { useLang } from '../../contexts/LanguageContext';
import { toDisplayChord } from '../../utils/chordName';
import { ExampleChips } from '../ExampleChips';
import { Fold, Chips, PlayButton, GlassSelect, icon } from '../ChordBuilder/Stage';
import { StopActions } from '../Transit/StopActions';
import { previewChordName } from '../../utils/previewSound';
import { VoiceChart } from './VoiceChart';

// ── Voice Leading Studio ─────────────────────────────────────────────────────
// Build a progression, press Calculate, and see it arranged into four smooth
// voices (SATB-style) on a guitar-friendly grid — note names, no staff. Each
// row is a voice; follow it left-to-right to see how it moves. Common tones are
// held, upper voices step to the nearest note, and a big leap is flagged. The
// key is auto-detected and each chord gets its Roman numeral (with a ⚠ when it
// falls outside the key). Ink and grey; cobalt marks only what is sounding.

const ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const TRIADS = [
  { k: 'M', l: 'Major' }, { k: 'm', l: 'Minor' }, { k: 'dim', l: 'dim' },
  { k: 'aug', l: 'aug' }, { k: 'sus2', l: 'sus2' }, { k: 'sus4', l: 'sus4' },
];
const EXTS = [
  { k: '', l: '—' }, { k: '7', l: '7' }, { k: 'maj7', l: 'maj7' },
  { k: '9', l: '9' }, { k: 'add9', l: 'add9' }, { k: '6', l: '6' },
];
const SUFFIX: Record<string, Record<string, string>> = {
  M: { '': '', '7': '7', maj7: 'maj7', '9': '9', add9: 'add9', '6': '6' },
  m: { '': 'm', '7': 'm7', maj7: 'mMaj7', '9': 'm9', add9: 'madd9', '6': 'm6' },
  dim: { '': 'dim', '7': 'dim7' }, aug: { '': 'aug', '7': 'aug7' },
  sus2: { '': 'sus2' }, sus4: { '': 'sus4' },
};
const validExts = (t: string) => EXTS.filter(e => SUFFIX[t]?.[e.k] !== undefined);
const buildName = (root: string, t: string, e: string) => root + (SUFFIX[t]?.[e] ?? '');

const degNum = (label: string) => parseInt(label.replace(/[^0-9]/g, ''), 10) || 0;
const DEG_ORDER = [1, 3, 5, 7, 9, 11, 13, 2, 4, 6];   // display order for the degree chips
const degLabelShort = (n: number, lang: 'en' | 'he') => n === 1 ? (lang === 'he' ? 'שורש' : 'Root') : String(n);

const globalNames = (gp?: ChordInProgression[]) => (gp ?? []).map(c => c.chord.name).filter(Boolean).slice(0, 12);

export function VoiceLeadingStudio({ desktop, globalProgression, onChordsChange }: {
  desktop?: boolean; globalProgression?: ChordInProgression[]; tuning?: Tuning;
  /** Report an edit so it flows back into the shared session progression. */
  onChordsChange?: (names: string[]) => void;
} = {}) {
  const { lang, rtl } = useLang();

  // The session progression is the source of truth — no private copy and no
  // placeholder chords, so what the studio shows is exactly what the app is
  // working on. An empty session shows the empty state, and stays empty.
  // (The local list is only used when the studio is rendered standalone,
  // without a handler to report edits to.)
  const sessionNames = globalNames(globalProgression);
  const [local, setLocal] = useState<string[]>([]);
  const linked = !!onChordsChange;
  const chords = linked ? sessionNames : local;

  const setChords = (next: string[] | ((prev: string[]) => string[])) => {
    const value = typeof next === 'function' ? next(chords) : next;
    if (linked) onChordsChange!(value);
    else setLocal(value);
  };

  const [selVoice, setSelVoice] = useState<number | null>(null);   // follow a voice (a row)
  const [selDeg, setSelDeg] = useState<number | null>(null);       // highlight a degree across the grid
  const [result, setResult] = useState<VoicedProgression | null>(null);
  const [keyOverride, setKeyOverride] = useState<KeyGuess | null>(null);   // null = auto-detect
  const [pickOpen, setPickOpen] = useState(false);
  const [pRoot, setPRoot] = useState('C'); const [pTri, setPTri] = useState('M'); const [pExt, setPExt] = useState('');
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // Voice the session progression whenever it changes — arriving from another
  // tool, or an undo/redo — so the grid always shows what the app is working on.
  const sessionKey = sessionNames.join('|');
  const lastKey = useRef<string | null>(null);
  useEffect(() => {
    if (lastKey.current === sessionKey) return;
    lastKey.current = sessionKey;
    setResult(sessionNames.length ? voiceLead(sessionNames) : null);
    setSelVoice(null); setSelDeg(null);
  }, [sessionKey]);   // eslint-disable-line react-hooks/exhaustive-deps

  const t = lang === 'he'
    ? { title: 'סטודיו הולכת קולות', calc: 'חשב', play: '▶ נגן', clear: 'נקה', voice: 'קול',
        build: 'הוסיפו אקורדים עם + למעלה', addChord: 'הוסף', follow: (v: string) => `עוקב אחרי קול ${v}`,
        key: 'סולם', auto: 'אוטומטי', outKey: 'מחוץ לסולם', leap: 'קפיצה', hold: 'צליל משותף מוחזק',
        par5: 'קוינטות מקבילות', par8: 'אוקטבות מקבילות', omit: 'הושמט (אין מספיק קולות)',
        mark: 'הדגש דרגה', degOf: (d: string) => `מדגיש את דרגה ${d} בכל האקורדים` }
    : { title: 'Voice Leading Studio', calc: 'Calculate', play: '▶ Play', clear: 'Clear', voice: 'Voice',
        build: 'Add chords with + above', addChord: 'Add', follow: (v: string) => `Following voice ${v}`,
        key: 'Key', auto: 'Auto', outKey: 'out of key', leap: 'leap', hold: 'common tone held',
        par5: 'parallel 5ths', par8: 'parallel octaves', omit: 'omitted (not enough voices)',
        mark: 'Highlight degree', degOf: (d: string) => `Highlighting the ${d} in every chord` };

  const keyToStr = (k: KeyGuess) => `${k.tonicPc}:${k.mode}`;

  const calc = () => { if (!chords.length) return; setSelVoice(null); setSelDeg(null); setKeyOverride(null); setResult(voiceLead(chords)); };

  // Degrees actually present in the arrangement — used for the highlight chips.
  const presentDegs = useMemo(() => {
    if (!result) return [] as number[];
    const set = new Set<number>();
    result.voices.forEach(v => v.forEach(c => { const n = degNum(c.deg); if (n) set.add(n); }));
    return DEG_ORDER.filter(d => set.has(d));
  }, [result]);
  const pickVoice = (vi: number) => { setSelVoice(s => s === vi ? null : vi); setSelDeg(null); };
  const pickDeg = (d: number) => { setSelDeg(s => s === d ? null : d); setSelVoice(null); };

  // Functional analysis — key + Roman numerals, recomputed when the key override changes.
  const analysis = useMemo(
    () => result ? analyzeProgression(result.chords, keyOverride) : null,
    [result, keyOverride],
  );
  const flagged = analysis ? analysis.chords.filter(c => !c.diatonic) : [];

  // Large-leap findings across the upper voices.
  const leaps = useMemo(() => {
    if (!result) return [] as { voice: number; col: number; from: string; to: string }[];
    const out: { voice: number; col: number; from: string; to: string }[] = [];
    result.voices.forEach((v, vi) => v.forEach((cell, ci) => {
      if (cell.leap && ci > 0) out.push({ voice: vi, col: ci, from: v[ci - 1].note, to: cell.note });
    }));
    return out;
  }, [result]);

  // Parallel perfect fifths / octaves — two voices a P5 (or octave) apart both
  // moving the same direction into another P5 (or octave). The classic no-no.
  const parallels = useMemo(() => {
    if (!result) return [] as { a: number; b: number; ci: number; type: '5' | '8' }[];
    const V = result.voices;
    const out: { a: number; b: number; ci: number; type: '5' | '8' }[] = [];
    for (let ci = 1; ci < result.chords.length; ci++) {
      for (let a = 0; a < V.length; a++) for (let b = a + 1; b < V.length; b++) {
        const before = Math.abs(V[a][ci - 1].midi - V[b][ci - 1].midi) % 12;
        const after = Math.abs(V[a][ci].midi - V[b][ci].midi) % 12;
        const ma = V[a][ci].motion, mb = V[b][ci].motion;
        if (!(ma !== 0 && mb !== 0 && Math.sign(ma) === Math.sign(mb))) continue;
        if (before === 7 && after === 7) out.push({ a, b, ci, type: '5' });
        else if (before === 0 && after === 0) out.push({ a, b, ci, type: '8' });
      }
    }
    return out;
  }, [result]);

  // The column being played — lit in the grid and marked on the voice lines.
  const [playCol, setPlayCol] = useState<number | null>(null);
  const play = () => {
    if (!result) return;
    unlockAudio().then(() => {
      timers.current.forEach(clearTimeout); timers.current = [];
      result.chords.forEach((_, ci) => {
        timers.current.push(setTimeout(() => {
          setPlayCol(ci);
          result.voices.forEach(v => playMidi(v[ci].midi, 1.1));
        }, ci * 1250));
      });
      timers.current.push(setTimeout(() => setPlayCol(null), result.chords.length * 1250));
    });
  };

  const addChord = () => {
    const name = buildName(pRoot, pTri, validExts(pTri).some(e => e.k === pExt) ? pExt : '');
    setChords(c => [...c, name]); setResult(null);
  };
  const removeChord = (i: number) => { setChords(c => c.filter((_, j) => j !== i)); setResult(null); };
  const clearChords = () => { setChords([]); setResult(null); setSelVoice(null); setSelDeg(null); setPickOpen(false); };

  const he = lang === 'he';
  const WARN = '⚠︎';   // text presentation, never the emoji
  const small = (text: React.ReactNode) => <span style={{ fontSize: 13, fontWeight: 600, color: T.textMuted }}>{text}</span>;
  const pName = buildName(pRoot, pTri, validExts(pTri).some(e => e.k === pExt) ? pExt : '');
  const TRI_HE: Record<string, string> = { M: 'מז׳ור', m: 'מינור', dim: 'מוקטן', aug: 'מוגדל', sus2: 'sus2', sus4: 'sus4' };

  // ── Toolbar: the key ─────────────────────────────────────────────────────
  const toolbar = analysis && (
    <StopActions>
      <GlassSelect label={t.key} text={`${t.key} · ${keyName(keyOverride ?? analysis.detected, lang)}`}
        value={keyOverride ? keyToStr(keyOverride) : 'auto'}
        onChange={v => setKeyOverride(v === 'auto' ? null : ALL_KEYS.find(k => keyToStr(k) === v) ?? null)}>
        <option value="auto">{t.auto} · {keyName(analysis.detected, lang)}</option>
        {ALL_KEYS.map(k => <option key={keyToStr(k)} value={keyToStr(k)}>{keyName(k, lang)}</option>)}
      </GlassSelect>
    </StopActions>
  );

  const intro = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center' }}>
      <h2 style={{ margin: 0, fontFamily: 'var(--su-display)', fontSize: 28, lineHeight: 1.15, fontWeight: 700, letterSpacing: '-0.02em' }}>
        {he ? 'כל תו זז כמה שפחות' : 'Every note moves as little as it can'}
      </h2>
      <span className="su-sub" style={{ fontSize: 15, maxWidth: 520 }}>
        {he ? 'ארבעה קולות עוברים מאקורד לאקורד. כל קו הוא קול אחד: עקבו אחריו משמאל לימין.' : 'Four voices walk from chord to chord. Each line is one voice: follow it from left to right.'}
      </span>
    </div>
  );

  // ── The chords ───────────────────────────────────────────────────────────
  const chordsRow = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {small(he ? `האקורדים · ${chords.length}` : `Chords · ${chords.length}`)}
        {chords.length > 0 && <button onClick={clearChords} className="gc-no-bar" style={{ fontSize: 14, color: T.tintLabel }}>{t.clear}</button>}
      </div>
      {chords.length === 0 ? (
        <div style={{ borderRadius: 26, background: T.bgCard, padding: '26px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center' }}>
          <span style={{ fontSize: 17, fontWeight: 600 }}>{he ? 'עדיין אין אקורדים' : 'No chords yet'}</span>
          <span className="su-sub" style={{ fontSize: 15 }}>{he ? 'הוסיפו אקורדים, או התחילו מדוגמה.' : 'Add some chords, or start from an example.'}</span>
          <ExampleChips onPick={ex => setChords(ex)} title={he ? 'דוגמאות' : 'Examples'} />
        </div>
      ) : (
        <div role="list" dir="ltr" className="gc-no-scrollbar" style={{ display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none', padding: 2, margin: -2 }}>
          {chords.map((c, i) => {
            const now = playCol === i;
            return (
              <div key={i} role="listitem" style={{
                position: 'relative', flex: chords.length <= 5 ? '1 1 0' : '0 0 78px', minWidth: 64, height: 60, borderRadius: 22,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: now ? T.text : 'rgba(255,255,255,0.08)', color: now ? '#000' : T.text, transition: 'background 200ms ease, color 200ms ease',
              }}>
                <button onClick={() => previewChordName(c)} className="gc-no-bar gc-notation" aria-label={he ? `השמעת ${c}` : `Play ${c}`}
                  style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', color: 'inherit' }}>{toDisplayChord(c)}</button>
                <button onClick={() => removeChord(i)} aria-label={he ? `הסרת ${c}` : `Remove ${c}`} className="gc-no-bar"
                  style={{ position: 'absolute', top: 3, right: 3, width: 20, height: 20, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'inherit', opacity: 0.45 }}>
                  {icon(<path d="M6 6l12 12M18 6 6 18" />, 11)}
                </button>
              </div>
            );
          })}
        </div>
      )}
      <Fold title={he ? 'הוספת אקורד' : 'Add a chord'} open={pickOpen} onToggle={() => setPickOpen(o => !o)}
        summary={<span dir="ltr">{toDisplayChord(pName)}</span>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Chips label={he ? 'שורש' : 'Root'} cols={6} value={pRoot} onChange={r => { setPRoot(r); previewChordName(buildName(r, pTri, pExt)); }}
            items={ROOTS.map(r => ({ id: r, label: r.replace('#', '♯') }))} />
          <Chips label={he ? 'איכות' : 'Quality'} value={pTri} onChange={k => { setPTri(k); setPExt(''); previewChordName(buildName(pRoot, k, '')); }}
            items={TRIADS.map(q => ({ id: q.k, label: he ? TRI_HE[q.k] : q.l }))} />
          {validExts(pTri).length > 1 && (
            <Chips label={he ? 'צבע נוסף' : 'Add a colour'} value={pExt || 'none'} onChange={k => { const e = k === 'none' ? '' : k; setPExt(e); previewChordName(buildName(pRoot, pTri, e)); }}
              items={validExts(pTri).map(e => ({ id: e.k || 'none', label: e.k === '' ? (he ? 'בלי' : 'None') : e.l }))} />
          )}
          <button onClick={addChord} className="su-primary gc-no-bar" style={{ height: 48 }}>
            {he ? 'הוספת ' : 'Add '}<span dir="ltr" className="gc-notation">{toDisplayChord(pName)}</span>
          </button>
        </div>
      </Fold>
    </div>
  );

  // ── Play, or arrange when there is nothing yet ───────────────────────────
  const actions = chords.length > 0 && (
    <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
      {result
        ? <PlayButton onPlay={play} label={playCol != null ? (he ? 'מנגן…' : 'Playing…') : (he ? 'נגן' : 'Play')} />
        : <button onClick={calc} className="gc-no-bar" style={{ height: 50, padding: '0 26px', borderRadius: 25, background: T.text, color: '#000', fontSize: 17, fontWeight: 600 }}>{he ? 'סידור הקולות' : 'Arrange the voices'}</button>}
    </div>
  );

  // ── The voices ───────────────────────────────────────────────────────────
  const chart = result && (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ borderRadius: 26, background: T.bgCard, padding: '14px 10px 10px' }}>
        <VoiceChart result={result} chords={result.chords.map((_, ci) => ({ roman: analysis?.chords[ci]?.roman, diatonic: analysis?.chords[ci]?.diatonic }))}
          playCol={playCol} selVoice={selVoice} selDeg={selDeg} degOf={degNum} onPickVoice={pickVoice} warn={WARN} voiceLabel={t.voice} />
      </div>
      {small(selVoice != null ? t.follow(String(selVoice + 1)) : selDeg != null ? t.degOf(degLabelShort(selDeg, lang))
        : (he ? 'קו מקווקו = קפיצה גדולה. הקישו על קו כדי לעקוב אחרי קול אחד.' : 'A dashed line is a big leap. Tap a line to follow one voice.'))}
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
        <Chips label={he ? 'מעקב אחרי קול' : 'Follow a voice'} value={selVoice == null ? 'all' : String(selVoice)}
          onChange={v => { if (v === 'all') { setSelVoice(null); setSelDeg(null); } else pickVoice(Number(v)); }}
          items={[{ id: 'all', label: he ? 'כולם' : 'All' }, ...result.voices.map((_, vi) => ({ id: String(vi), label: String(vi + 1) }))]} />
        {presentDegs.length > 0 && (
          <Chips label={t.mark} value={selDeg == null ? 'none' : String(selDeg)}
            onChange={v => { if (v === 'none') setSelDeg(null); else pickDeg(Number(v)); }}
            items={[{ id: 'none', label: he ? 'בלי' : 'None' }, ...presentDegs.map(d => ({ id: String(d), label: degLabelShort(d, lang) }))]} />
        )}
      </div>
    </div>
  );

  // ── Things worth knowing ─────────────────────────────────────────────────
  const hasNotes = result && (flagged.length > 0 || parallels.length > 0 || leaps.length > 0 || result.omitted.some(o => o.length > 0));
  const line = (key: string, children: React.ReactNode) => (
    <p key={key} dir="ltr" style={{ margin: 0, fontSize: 14, color: T.text, textAlign: he ? 'right' : 'left' }}>{children}</p>
  );
  const notesCard = hasNotes && (
    <div style={{ borderRadius: 26, background: T.bgCard, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {small(he ? 'כדאי לשים לב' : 'Worth knowing')}
      {flagged.map((c, i) => line(`k${i}`, <><b>{toDisplayChord(c.name)}</b> <span style={{ color: T.textMuted }}>· {c.roman} · {t.outKey}</span></>))}
      {parallels.map((pl, i) => line(`p${i}`, <>{t.voice} {pl.a + 1} &amp; {pl.b + 1}: <b>{pl.type === '5' ? t.par5 : t.par8}</b> <span style={{ color: T.textMuted }}>({result!.chords[pl.ci - 1]} → {result!.chords[pl.ci]})</span></>))}
      {leaps.map((lp, i) => line(`l${i}`, <>{t.voice} {lp.voice + 1}: <b>{lp.from} → {lp.to}</b> <span style={{ color: T.textMuted }}>· {t.leap}</span></>))}
      {result!.omitted.map((o, ci) => o.length ? line(`o${ci}`, <><b>{toDisplayChord(result!.chords[ci])}</b> <span style={{ color: T.textMuted }}>· {t.omit}: {o.join(', ')}</span></>) : null)}
    </div>
  );

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="su-in" style={{ display: 'flex', flexDirection: 'column', gap: desktop ? 24 : 20, maxWidth: desktop ? 900 : undefined, margin: '0 auto', width: '100%' }}>
      {toolbar}
      {intro}
      {chordsRow}
      {actions}
      {chart}
      {notesCard}
    </div>
  );
}
