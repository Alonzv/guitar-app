import { useEffect, useMemo, useRef, useState } from 'react';
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
import { Rule, Pill, PillRow, KeyGrid, Cta } from '../Transit/parts';
import { Route } from './Route';
import { VoiceChart } from './VoiceChart';
import { SelectPill } from './SelectPill';

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

export function VoiceLeadingStudio({ globalProgression, onChordsChange }: {
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
    setChords(c => [...c, name]); setResult(null); setPickOpen(false);
  };
  const removeChord = (i: number) => { setChords(c => c.filter((_, j) => j !== i)); setResult(null); };
  const clearChords = () => { setChords([]); setResult(null); setSelVoice(null); setSelDeg(null); setPickOpen(false); };

  const he = lang === 'he';
  const WARN = '⚠︎';   // text presentation, never the emoji

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} style={{ fontFamily: 'var(--gc-font)', display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* The progression as a route — the chord sounding now is the cobalt station */}
      <Rule label={he ? 'המהלך' : 'Progression'} right={chords.length > 0 && (
        <Pill size="sm" onClick={clearChords}>{t.clear}</Pill>
      )}>
        <Route
          label={he ? 'המהלך' : 'Progression'}
          stations={chords.map(c => ({ name: toDisplayChord(c) }))}
          current={playCol}
          onRemove={removeChord}
          trailing={
            <Pill active={pickOpen} onClick={() => setPickOpen(o => !o)} label={he ? 'הוספת אקורד' : 'Add a chord'} style={{ padding: 0, width: 44 }}>+</Pill>
          }
        />
        {pickOpen && (
          <div dir="ltr" style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14, maxWidth: 560 }}>
            <KeyGrid label={he ? 'שורש' : 'Root'} items={ROOTS.map(r => ({ id: r, label: r }))} value={pRoot} onChange={setPRoot} />
            <PillRow label={he ? 'סוג' : 'Quality'} items={TRIADS.map(q => ({ id: q.k, label: q.l }))} value={pTri}
              onChange={k => { setPTri(k); setPExt(''); }} wrap />
            <PillRow label={he ? 'הרחבה' : 'Extension'} items={validExts(pTri).map(e => ({ id: e.k || 'none', label: e.l }))}
              value={pExt || 'none'} onChange={k => setPExt(k === 'none' ? '' : k)} wrap />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className="su-semi gc-notation" style={{ fontSize: 26, flex: 1 }}>
                {toDisplayChord(buildName(pRoot, pTri, validExts(pTri).some(e => e.k === pExt) ? pExt : ''))}
              </span>
              <Pill active onClick={addChord}>+ {t.addChord}</Pill>
            </div>
          </div>
        )}
      </Rule>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <Cta onClick={calc} disabled={!chords.length}>{t.calc}</Cta>
        {result && <Pill active={playCol != null} onClick={play}>{t.play}</Pill>}
        {analysis && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginInlineStart: 'auto' }}>
            <span className="su-label">{t.key}</span>
            <SelectPill label={t.key}
              value={keyOverride ? keyToStr(keyOverride) : 'auto'}
              onChange={v => setKeyOverride(v === 'auto' ? null : ALL_KEYS.find(k => keyToStr(k) === v) ?? null)}>
              <option value="auto">{t.auto} · {keyName(analysis.detected, lang)}</option>
              {ALL_KEYS.map(k => <option key={keyToStr(k)} value={keyToStr(k)}>{keyName(k, lang)}</option>)}
            </SelectPill>
          </div>
        )}
      </div>

      {/* Degree highlight */}
      {result && presentDegs.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span className="su-label">{t.mark}</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {presentDegs.map(d => (
              <Pill key={d} size="sm" active={selDeg === d} onClick={() => pickDeg(d)}>{degLabelShort(d, lang)}</Pill>
            ))}
          </div>
        </div>
      )}

      {/* Result — four-voice grid */}
      {!result ? (
        <Rule style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 18, padding: '22px 0 6px' }}>
          <p style={{ margin: 0, fontSize: 14, color: T.textMuted }}>{t.build}</p>
          {!chords.length && <ExampleChips onPick={ex => setChords(ex)} />}
        </Rule>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <VoiceChart result={result} chords={result.chords.map((_, ci) => ({ roman: analysis?.chords[ci]?.roman, diatonic: analysis?.chords[ci]?.diatonic }))}
            playCol={playCol} selVoice={selVoice} selDeg={selDeg} degOf={degNum} onPickVoice={pickVoice} warn={WARN} voiceLabel={t.voice} />
          {/* Follow one voice — top line is voice 1 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span className="su-label">{he ? 'מעקב אחרי קול' : 'Follow a voice'}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {result.voices.map((_, vi) => (
                <Pill key={vi} size="sm" active={selVoice === vi} onClick={() => pickVoice(vi)} label={`${t.voice} ${vi + 1}`}>{vi + 1}</Pill>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Omitted-tone info — extensions dropped to fit four voices (informational, not a warning) */}
      {result && result.omitted.some(o => o.length > 0) && (
        <Rule label={he ? 'הושמטו' : 'Omitted'}>
          {result.omitted.map((o, ci) => o.length ? (
            <p key={ci} dir="ltr" style={{ margin: 0, padding: '2px 0', fontSize: 12, color: T.textMuted }}>
              <span style={{ fontWeight: 700, color: T.text }}>{result.chords[ci]}</span>
              <span> — {t.omit}: </span>
              <span style={{ fontFamily: 'var(--gc-mono)', fontWeight: 700 }}>{o.join(', ')}</span>
            </p>
          ) : null)}
        </Rule>
      )}

      {/* Advisor strip — out-of-key chords, parallel 5ths/8ves, and large leaps */}
      {(flagged.length > 0 || parallels.length > 0 || leaps.length > 0) && (
        <Rule label={he ? 'הערות' : 'Notes'}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {flagged.map((c, i) => (
              <p key={`k${i}`} dir="ltr" style={{ margin: 0, fontSize: 12, color: T.text }}>
                <span style={{ fontWeight: 700 }}>{WARN} </span>
                <span style={{ fontWeight: 700 }}>{toDisplayChord(c.name)}</span>
                <span style={{ fontFamily: 'var(--gc-mono)', color: T.textMuted }}> · {c.roman}</span>
                <span style={{ color: T.textMuted }}> — {t.outKey}</span>
              </p>
            ))}
            {parallels.map((pl, i) => (
              <p key={`p${i}`} dir="ltr" style={{ margin: 0, fontSize: 12, color: T.text }}>
                <span style={{ fontWeight: 700 }}>{WARN} </span>
                <span>{t.voice} {pl.a + 1} &amp; {pl.b + 1}: </span>
                <span style={{ fontWeight: 700 }}>{pl.type === '5' ? t.par5 : t.par8}</span>
                <span style={{ fontFamily: 'var(--gc-mono)', color: T.textMuted }}> ({result?.chords[pl.ci - 1]}→{result?.chords[pl.ci]})</span>
              </p>
            ))}
            {leaps.map((lp, i) => (
              <p key={`l${i}`} dir="ltr" style={{ margin: 0, fontSize: 12, color: T.text }}>
                <span style={{ fontWeight: 700 }}>{WARN} </span>
                <span>{t.voice} {lp.voice + 1}: </span>
                <span style={{ fontWeight: 700 }}>{lp.from}→{lp.to}</span>
                <span style={{ color: T.textMuted }}> — {t.leap}</span>
              </p>
            ))}
          </div>
        </Rule>
      )}

      {(selVoice != null || selDeg != null) && (
        <p className="su-label" style={{ margin: 0, textAlign: 'center', color: T.text }}>
          {selVoice != null ? t.follow(String(selVoice + 1)) : t.degOf(degLabelShort(selDeg!, lang))}
        </p>
      )}
    </div>
  );
}
