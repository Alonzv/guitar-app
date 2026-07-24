import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChordInProgression, Tuning } from '../../types/music';
import { playMidi, unlockAudio } from '../../utils/audioPlayback';
import { analyzeProgression, keyName, ALL_KEYS } from '../../utils/harmonicAnalysis';
import type { KeyGuess } from '../../utils/harmonicAnalysis';
import { voiceLead } from '../../utils/voiceLeading';
import type { VoicedProgression } from '../../utils/voiceLeading';
import { T, card, alpha } from '../../theme';

// ── Voice Leading Studio ─────────────────────────────────────────────────────
// Build a progression, press Calculate, and see it arranged into four smooth
// voices (SATB-style) on a guitar-friendly grid — note names, no staff. Each
// row is a voice; follow it left-to-right to see how it moves. Common tones are
// held, upper voices step to the nearest note, and a big leap is flagged. The
// key is auto-detected and each chord gets its Roman numeral (with a ⚠ when it
// falls outside the key). Palette colours only.

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
  m: { '': 'm', '7': 'm7', maj7: 'mM7', '9': 'm9', add9: 'madd9', '6': 'm6' },
  dim: { '': 'dim', '7': 'dim7' }, aug: { '': 'aug', '7': 'aug7' },
  sus2: { '': 'sus2' }, sus4: { '': 'sus4' },
};
const validExts = (t: string) => EXTS.filter(e => SUFFIX[t]?.[e.k] !== undefined);
const buildName = (root: string, t: string, e: string) => root + (SUFFIX[t]?.[e] ?? '');

const motionGlyph = (m: number, first: boolean) => first ? '' : m === 0 ? '=' : m > 0 ? '▲' : '▼';

export function VoiceLeadingStudio({ desktop, globalProgression }: {
  desktop?: boolean; globalProgression?: ChordInProgression[]; tuning?: Tuning;
} = {}) {
  const [lang, setLang] = useState<'en' | 'he'>('en');
  const rtl = lang === 'he';

  const [chords, setChords] = useState<string[]>(() => {
    const g = (globalProgression ?? []).map(c => c.chord.name).filter(Boolean);
    return g.length ? g.slice(0, 12) : ['Cmaj7', 'Am7', 'Dm7', 'G7'];
  });
  const [selVoice, setSelVoice] = useState<number | null>(null);
  const [result, setResult] = useState<VoicedProgression | null>(null);
  const [keyOverride, setKeyOverride] = useState<KeyGuess | null>(null);   // null = auto-detect
  const [pickOpen, setPickOpen] = useState(false);
  const [pRoot, setPRoot] = useState('C'); const [pTri, setPTri] = useState('M'); const [pExt, setPExt] = useState('');
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const t = lang === 'he'
    ? { title: 'סטודיו הולכת קולות', calc: 'חשב', play: '▶ נגן', clear: 'נקה', voice: 'קול',
        build: 'בנו מהלך אקורדים ולחצו על "חשב"', addChord: 'הוסף', follow: (v: string) => `עוקב אחרי קול ${v}`,
        key: 'סולם', auto: 'אוטומטי', outKey: 'מחוץ לסולם', leap: 'קפיצה', hold: 'צליל משותף מוחזק',
        par5: 'קוינטות מקבילות', par8: 'אוקטבות מקבילות', omit: 'הושמט (אין מספיק קולות)' }
    : { title: 'Voice Leading Studio', calc: 'Calculate', play: '▶ Play', clear: 'Clear', voice: 'Voice',
        build: 'Build a progression, then press Calculate', addChord: 'Add', follow: (v: string) => `Following voice ${v}`,
        key: 'Key', auto: 'Auto', outKey: 'out of key', leap: 'leap', hold: 'common tone held',
        par5: 'parallel 5ths', par8: 'parallel octaves', omit: 'omitted (not enough voices)' };

  const keyToStr = (k: KeyGuess) => `${k.tonicPc}:${k.mode}`;

  const calc = () => { if (!chords.length) return; setSelVoice(null); setKeyOverride(null); setResult(voiceLead(chords)); };

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

  const play = () => {
    if (!result) return;
    unlockAudio().then(() => {
      timers.current.forEach(clearTimeout); timers.current = [];
      result.chords.forEach((_, ci) => {
        timers.current.push(setTimeout(() => {
          result.voices.forEach(v => playMidi(v[ci].midi, 1.1));
        }, ci * 1250));
      });
    });
  };

  const addChord = () => {
    const name = buildName(pRoot, pTri, validExts(pTri).some(e => e.k === pExt) ? pExt : '');
    setChords(c => [...c, name]); setResult(null); setPickOpen(false);
  };
  const removeChord = (i: number) => { setChords(c => c.filter((_, j) => j !== i)); setResult(null); };
  const clearChords = () => { setChords([]); setResult(null); setSelVoice(null); setPickOpen(false); };

  const sel_: React.CSSProperties = {
    appearance: 'none', WebkitAppearance: 'none', background: T.bgInput, border: `1px solid ${T.border}`,
    borderRadius: 0, color: T.text, fontSize: 13, fontWeight: 600, padding: '7px 10px', cursor: 'pointer', outline: 'none',
  };
  const LBL: React.CSSProperties = { margin: '0 0 8px', fontSize: 10, color: '#9C958C', fontFamily: 'var(--gc-mono)', letterSpacing: '0.14em', textTransform: 'uppercase' };
  const THREAD = T.success;   // the only distinct hue in this near-monochrome palette (cobalt)

  const CW = desktop ? 92 : 78;    // chord-column width
  const LW = 30;                   // left voice-label width

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} style={{ fontFamily: 'var(--gc-font)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: T.text }}>{t.title}</h2>
        <div style={{ display: 'flex', border: `1px solid ${T.border}` }}>
          {(['en', 'he'] as const).map((l, i) => (
            <button key={l} onClick={() => setLang(l)} style={{ padding: '6px 14px', borderRadius: 0, cursor: 'pointer', fontSize: 12, fontWeight: lang === l ? 600 : 400, borderLeft: i > 0 ? `1px solid ${T.border}` : 'none', background: lang === l ? T.secondary : 'transparent', color: lang === l ? '#fff' : T.textDim }}>{l === 'en' ? 'EN' : 'HE'}</button>
          ))}
        </div>
      </div>

      {/* Timeline */}
      <div style={{ ...card({ padding: '12px 12px' }), marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', alignItems: 'center', paddingBottom: 4, flex: 1 }}>
            {chords.map((c, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, background: T.bgInput, border: `1px solid ${T.border}`, borderLeft: '3px solid var(--gc-bar-color)', padding: '8px 6px 8px 12px', flexShrink: 0 }}>
                <span dir="ltr" style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{c}</span>
                <button onClick={() => removeChord(i)} style={{ border: 'none', background: 'transparent', color: T.textDim, cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: '0 2px' }}>×</button>
              </div>
            ))}
            <button onClick={() => setPickOpen(o => !o)} style={{ flexShrink: 0, width: 38, height: 38, borderRadius: 0, cursor: 'pointer', fontSize: 20, fontWeight: 500, border: `1px dashed ${T.border}`, background: 'transparent', color: T.textMuted }}>+</button>
          </div>
          {chords.length > 0 && (
            <button onClick={clearChords} style={{ flexShrink: 0, padding: '8px 14px', borderRadius: 0, cursor: 'pointer', fontSize: 12, fontWeight: 600, background: T.bgInput, color: T.textMuted, border: `1px solid ${T.border}`, borderLeft: '3px solid var(--gc-bar-color)' }}>{t.clear}</button>
          )}
        </div>
        {pickOpen && (
          <div dir="ltr" style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={pRoot} onChange={e => setPRoot(e.target.value)} style={sel_}>{ROOTS.map(r => <option key={r} value={r}>{r}</option>)}</select>
            <select value={pTri} onChange={e => { setPTri(e.target.value); setPExt(''); }} style={sel_}>{TRIADS.map(q => <option key={q.k} value={q.k}>{q.l}</option>)}</select>
            <select value={pExt} onChange={e => setPExt(e.target.value)} style={sel_}>{validExts(pTri).map(e => <option key={e.k} value={e.k}>{e.l}</option>)}</select>
            <button onClick={addChord} style={{ padding: '8px 18px', borderRadius: 0, cursor: 'pointer', fontSize: 13, fontWeight: 600, background: T.primary, color: T.white, border: 'none', borderLeft: '3px solid var(--gc-bar-color)' }}>{t.addChord}</button>
          </div>
        )}
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 18, flexWrap: 'wrap' }}>
        <button onClick={calc} style={{ padding: '9px 26px', borderRadius: 0, cursor: 'pointer', fontSize: 14, fontWeight: 700, background: T.primary, color: T.white, border: 'none', borderLeft: '4px solid var(--gc-bar-color)' }}>{t.calc}</button>
        {result && <button onClick={play} style={{ padding: '9px 20px', borderRadius: 0, cursor: 'pointer', fontSize: 14, fontWeight: 600, background: T.secondary, color: '#fff', border: 'none', borderLeft: '4px solid var(--gc-bar-color)' }}>{t.play}</button>}
        {analysis && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginInlineStart: 'auto' }}>
            <span style={{ ...LBL, margin: 0 }}>{t.key}</span>
            <select
              value={keyOverride ? keyToStr(keyOverride) : 'auto'}
              onChange={e => setKeyOverride(e.target.value === 'auto' ? null : ALL_KEYS.find(k => keyToStr(k) === e.target.value) ?? null)}
              style={sel_}
            >
              <option value="auto">{t.auto} · {keyName(analysis.detected, lang)}</option>
              {ALL_KEYS.map(k => <option key={keyToStr(k)} value={keyToStr(k)}>{keyName(k, lang)}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Result — four-voice grid */}
      {!result ? (
        <div style={{ ...card({ padding: 28 }), textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 14, color: T.textMuted }}>{t.build}</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
          <div dir="ltr" style={{ display: 'inline-flex', flexDirection: 'column', border: `1px solid ${T.border}`, borderLeft: '4px solid var(--gc-bar-color)' }}>
            {/* Header: chord name + Roman numeral */}
            <div style={{ display: 'flex', borderBottom: `2px solid ${T.border}` }}>
              <div style={{ width: LW, flexShrink: 0, background: T.bgCard }} />
              {result.chords.map((name, ci) => {
                const an = analysis?.chords[ci];
                return (
                  <div key={ci} style={{ width: CW, flexShrink: 0, padding: '6px 4px', textAlign: 'center', borderInlineStart: ci ? `1px solid ${T.border}` : 'none', background: T.bgCard }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{name}</div>
                    {an && (
                      <div style={{ fontFamily: 'var(--gc-mono)', fontSize: 11, fontWeight: 700, color: an.diatonic ? T.textMuted : T.error }}>
                        {an.roman}{!an.diatonic && ' ⚠'}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {/* Voice rows (top = soprano) */}
            {result.voices.map((voice, vi) => {
              const on = selVoice === vi;
              return (
                <div
                  key={vi}
                  onClick={() => setSelVoice(s => s === vi ? null : vi)}
                  style={{ display: 'flex', cursor: 'pointer', borderTop: vi ? `1px solid ${T.border}` : 'none', background: on ? alpha(THREAD, 12) : 'transparent' }}
                >
                  <div style={{ width: LW, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--gc-mono)', fontSize: 11, fontWeight: 700, color: on ? THREAD : T.textDim, background: T.bgCard, borderInlineEnd: `1px solid ${T.border}` }}>
                    {vi + 1}
                  </div>
                  {voice.map((cell, ci) => (
                    <div key={ci} style={{
                      width: CW, flexShrink: 0, padding: '7px 4px', textAlign: 'center',
                      borderInlineStart: ci ? `1px solid ${T.border}` : 'none',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
                      background: on ? alpha(THREAD, 14) : 'transparent',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 4 }}>
                        <span dir="ltr" style={{ fontSize: 16, fontWeight: 700, color: on ? THREAD : (cell.leap ? T.error : T.text) }}>{cell.note}</span>
                        <span style={{ fontFamily: 'var(--gc-mono)', fontSize: 10, color: T.textDim }}>{cell.deg}</span>
                      </div>
                      <div style={{ fontSize: 10, lineHeight: 1, color: cell.leap ? T.error : T.textDim, height: 12 }}>
                        {cell.leap ? '⚠' : motionGlyph(cell.motion, ci === 0)}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Omitted-tone info — extensions dropped to fit four voices (informational, not a warning) */}
      {result && result.omitted.some(o => o.length > 0) && (
        <div style={{ ...card({ padding: '10px 14px' }), marginTop: 12 }}>
          {result.omitted.map((o, ci) => o.length ? (
            <p key={ci} dir="ltr" style={{ margin: 0, padding: '2px 0', fontSize: 12, color: T.textMuted }}>
              <span style={{ fontWeight: 700, color: T.text }}>{result.chords[ci]}</span>
              <span> — {t.omit}: </span>
              <span style={{ fontFamily: 'var(--gc-mono)', fontWeight: 700 }}>{o.join(', ')}</span>
            </p>
          ) : null)}
        </div>
      )}

      {/* Advisor strip — out-of-key chords, parallel 5ths/8ves, and large leaps */}
      {(flagged.length > 0 || parallels.length > 0 || leaps.length > 0) && (
        <div style={{ ...card({ padding: '10px 14px' }), marginTop: 12 }}>
          {flagged.map((c, i) => (
            <p key={`k${i}`} dir="ltr" style={{ margin: i ? '6px 0 0' : 0, fontSize: 12, color: T.text }}>
              <span style={{ color: T.error, fontWeight: 700 }}>⚠ </span>
              <span style={{ fontWeight: 700 }}>{c.name}</span>
              <span style={{ fontFamily: 'var(--gc-mono)', color: T.textMuted }}> · {c.roman}</span>
              <span style={{ color: T.textDim }}> — {t.outKey}</span>
            </p>
          ))}
          {parallels.map((pl, i) => (
            <p key={`p${i}`} dir="ltr" style={{ margin: (i || flagged.length) ? '6px 0 0' : 0, fontSize: 12, color: T.text }}>
              <span style={{ color: T.error, fontWeight: 700 }}>⚠ </span>
              <span>{t.voice} {pl.a + 1} &amp; {pl.b + 1}: </span>
              <span style={{ fontWeight: 700 }}>{pl.type === '5' ? t.par5 : t.par8}</span>
              <span style={{ fontFamily: 'var(--gc-mono)', color: T.textMuted }}> ({result?.chords[pl.ci - 1]}→{result?.chords[pl.ci]})</span>
            </p>
          ))}
          {leaps.map((lp, i) => (
            <p key={`l${i}`} dir="ltr" style={{ margin: (i || flagged.length || parallels.length) ? '6px 0 0' : 0, fontSize: 12, color: T.text }}>
              <span style={{ color: T.error, fontWeight: 700 }}>⚠ </span>
              <span>{t.voice} {lp.voice + 1}: </span>
              <span style={{ fontWeight: 700 }}>{lp.from}→{lp.to}</span>
              <span style={{ color: T.textDim }}> — {t.leap}</span>
            </p>
          ))}
        </div>
      )}

      {selVoice != null && (
        <p style={{ margin: '10px 0 0', fontSize: 12, color: T.textDim, textAlign: 'center' }}>
          <span style={{ display: 'inline-block', width: 10, height: 10, background: alpha(THREAD, 100), marginInlineEnd: 6, verticalAlign: 'middle' }} />
          {t.follow(String(selVoice + 1))}
        </p>
      )}
    </div>
  );
}
