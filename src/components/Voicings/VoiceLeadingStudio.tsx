import { useEffect, useMemo, useRef, useState } from 'react';
import { Chord as TonalChord, Note, Interval } from '@tonaljs/tonal';
import type { ChordInProgression, Tuning } from '../../types/music';
import { playMidi, unlockAudio } from '../../utils/audioPlayback';
import { analyzeProgression, keyName, ALL_KEYS } from '../../utils/harmonicAnalysis';
import type { KeyGuess } from '../../utils/harmonicAnalysis';
import { T, card, alpha } from '../../theme';

// ── Voice Leading Studio ─────────────────────────────────────────────────────
// Build a progression, press Calculate, and get one box per chord. Under each
// box sit the chord's degrees (degree + note). Click any degree to thread that
// voice — every chord's matching degree (same degree *number*, so a Major 3rd
// and a minor 3rd both light up) is highlighted across the whole progression.
// Global chips mute a degree (1/3/5/7) from playback; Play walks the chords.
// No fretboard, palette colours only.

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

// Degrees that can be muted globally (the structural voices), by degree number.
const MUTABLE = [1, 3, 5, 7];

interface Tone { num: number; label: string; note: string; midi: number }
interface ChordCol { name: string; tones: Tone[] }

// Interval string ('3M', '5d', '7m', '9M'…) → degree number + display label.
function degOf(iv: string): { num: number; label: string } {
  const it = Interval.get(iv);
  const num = it.num ?? 0;
  const alt = it.alt ?? 0;
  const acc = alt > 0 ? '#'.repeat(alt) : alt < 0 ? 'b'.repeat(-alt) : '';
  return { num, label: `${acc}${num}` };
}

function toColumn(name: string): ChordCol {
  const info = TonalChord.get(name);
  const notes = info.notes;
  const ivs = info.intervals;
  let prev = -Infinity;
  const tones: Tone[] = notes.map((note, i) => {
    let midi = Note.midi(`${note}3`) ?? 48;
    while (midi <= prev) midi += 12;   // keep the voicing ascending for playback
    prev = midi;
    const { num, label } = degOf(ivs[i] ?? '');
    return { num, label, note, midi };
  });
  return { name, tones };
}

export function VoiceLeadingStudio({ desktop, globalProgression }: {
  desktop?: boolean; globalProgression?: ChordInProgression[]; tuning?: Tuning;
} = {}) {
  const [lang, setLang] = useState<'en' | 'he'>('en');
  const rtl = lang === 'he';

  const [chords, setChords] = useState<string[]>(() => {
    const g = (globalProgression ?? []).map(c => c.chord.name).filter(Boolean);
    return g.length ? g.slice(0, 12) : ['Cmaj7', 'Am7', 'Dm7', 'G7'];
  });
  const [muted, setMuted] = useState<Set<number>>(new Set());
  const [sel, setSel] = useState<number | null>(null);       // threaded degree number
  const [result, setResult] = useState<ChordCol[] | null>(null);
  const [keyOverride, setKeyOverride] = useState<KeyGuess | null>(null);   // null = auto-detect
  const [pickOpen, setPickOpen] = useState(false);
  const [pRoot, setPRoot] = useState('C'); const [pTri, setPTri] = useState('M'); const [pExt, setPExt] = useState('');
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const t = lang === 'he'
    ? { title: 'סטודיו הולכת קולות', mute: 'ניטרול דרגות', calc: 'חשב', play: '▶ נגן',
        build: 'בנו מהלך אקורדים ולחצו על "חשב"', addChord: 'הוסף', threadOf: (d: string) => `מדגיש את דרגה ${d} לאורך המהלך`,
        key: 'סולם', auto: 'אוטומטי', outKey: 'מחוץ לסולם', allIn: 'כל האקורדים בתוך הסולם ✓' }
    : { title: 'Voice Leading Studio', mute: 'Mute degrees', calc: 'Calculate', play: '▶ Play',
        build: 'Build a progression, then press Calculate', addChord: 'Add', threadOf: (d: string) => `Threading degree ${d} across the progression`,
        key: 'Key', auto: 'Auto', outKey: 'out of key', allIn: 'All chords are diatonic ✓' };

  const keyToStr = (k: KeyGuess) => `${k.tonicPc}:${k.mode}`;

  const calc = () => { if (!chords.length) return; setSel(null); setKeyOverride(null); setResult(chords.map(toColumn)); };

  // Functional analysis — key + Roman numerals, recomputed when the key override changes.
  const analysis = useMemo(
    () => result ? analyzeProgression(result.map(c => c.name), keyOverride) : null,
    [result, keyOverride],
  );
  const flagged = analysis ? analysis.chords.filter(c => !c.diatonic) : [];

  const play = () => {
    if (!result) return;
    unlockAudio().then(() => {
      timers.current.forEach(clearTimeout); timers.current = [];
      result.forEach((col, i) => {
        timers.current.push(setTimeout(() => {
          col.tones.filter(t2 => !muted.has(t2.num)).forEach(t2 => playMidi(t2.midi, 1.1));
        }, i * 1250));
      });
    });
  };

  const addChord = () => {
    const name = buildName(pRoot, pTri, validExts(pTri).some(e => e.k === pExt) ? pExt : '');
    setChords(c => [...c, name]); setResult(null); setPickOpen(false);
  };
  const removeChord = (i: number) => { setChords(c => c.filter((_, j) => j !== i)); setResult(null); };
  const toggleMute = (n: number) => setMuted(m => { const s = new Set(m); s.has(n) ? s.delete(n) : s.add(n); return s; });

  const sel_: React.CSSProperties = {
    appearance: 'none', WebkitAppearance: 'none', background: T.bgInput, border: `1px solid ${T.border}`,
    borderRadius: 0, color: T.text, fontSize: 13, fontWeight: 600, padding: '7px 10px', cursor: 'pointer', outline: 'none',
  };
  const LBL: React.CSSProperties = { margin: '0 0 8px', fontSize: 10, color: '#9C958C', fontFamily: 'var(--gc-mono)', letterSpacing: '0.14em', textTransform: 'uppercase' };
  const THREAD = T.success;   // the only distinct hue in this near-monochrome palette (cobalt)

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

      {/* Muting chips */}
      <p style={LBL}>{t.mute}</p>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {MUTABLE.map(d => (
          <button key={d} onClick={() => toggleMute(d)} title={String(d)} style={{
            width: 40, height: 40, borderRadius: 0, cursor: 'pointer', fontSize: 14, fontWeight: 700,
            border: `1px solid ${T.border}`, borderLeft: '3px solid var(--gc-bar-color)',
            background: muted.has(d) ? 'transparent' : T.bgInput,
            color: muted.has(d) ? T.textDim : T.text,
            opacity: muted.has(d) ? 0.4 : 1, textDecoration: muted.has(d) ? 'line-through' : 'none',
          }}>{d}</button>
        ))}
      </div>

      {/* Timeline */}
      <div style={{ ...card({ padding: '12px 12px' }), marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', alignItems: 'center', paddingBottom: 4 }}>
          {chords.map((c, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, background: T.bgInput, border: `1px solid ${T.border}`, borderLeft: '3px solid var(--gc-bar-color)', padding: '8px 6px 8px 12px', flexShrink: 0 }}>
              <span dir="ltr" style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{c}</span>
              <button onClick={() => removeChord(i)} style={{ border: 'none', background: 'transparent', color: T.textDim, cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: '0 2px' }}>×</button>
            </div>
          ))}
          <button onClick={() => setPickOpen(o => !o)} style={{ flexShrink: 0, width: 38, height: 38, borderRadius: 0, cursor: 'pointer', fontSize: 20, fontWeight: 500, border: `1px dashed ${T.border}`, background: 'transparent', color: T.textMuted }}>+</button>
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

      {/* Result — one box per chord, degrees below */}
      {!result ? (
        <div style={{ ...card({ padding: 28 }), textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 14, color: T.textMuted }}>{t.build}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8, alignItems: 'flex-start' }}>
          {result.map((col, i) => {
            const an = analysis?.chords[i];
            return (
            <div key={i} style={{ ...card({ padding: 10 }), width: desktop ? 148 : 132, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                <span dir="ltr" style={{ fontSize: 16, fontWeight: 700, color: T.text }}>{col.name}</span>
                <button onClick={() => removeChord(i)} style={{ border: 'none', background: 'transparent', color: T.textDim, cursor: 'pointer', fontSize: 15 }}>×</button>
              </div>
              {an && (
                <div dir="ltr" style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: -2 }}>
                  <span style={{ fontFamily: 'var(--gc-mono)', fontSize: 13, fontWeight: 700, color: an.diatonic ? T.textMuted : T.error }}>{an.roman}</span>
                  {!an.diatonic && <span title={t.outKey} style={{ fontSize: 12, color: T.error, fontWeight: 700 }}>⚠</span>}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {col.tones.map((tn, j) => {
                  const isSel = sel === tn.num;
                  const isMuted = muted.has(tn.num);
                  return (
                    <button key={j} onClick={() => setSel(s => s === tn.num ? null : tn.num)} dir="ltr" style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
                      padding: '8px 10px', borderRadius: 0, cursor: 'pointer', fontSize: 13, fontWeight: 700,
                      border: isSel ? 'none' : `1px solid ${T.border}`, borderLeft: `3px solid ${isSel ? THREAD : 'var(--gc-bar-color)'}`,
                      background: isSel ? THREAD : T.bgInput, color: isSel ? '#fff' : (isMuted ? T.textDim : T.text),
                      opacity: isMuted && !isSel ? 0.4 : 1, textDecoration: isMuted ? 'line-through' : 'none',
                    }}>
                      <span style={{ fontFamily: 'var(--gc-mono)', minWidth: 22, textAlign: 'start' }}>{tn.label}</span>
                      <span>{tn.note}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            );
          })}
        </div>
      )}
      {flagged.length > 0 && (
        <div style={{ ...card({ padding: '10px 14px' }), marginTop: 12 }}>
          {flagged.map((c, i) => (
            <p key={i} dir="ltr" style={{ margin: i ? '6px 0 0' : 0, fontSize: 12, color: T.text }}>
              <span style={{ color: T.error, fontWeight: 700 }}>⚠ </span>
              <span style={{ fontWeight: 700 }}>{c.name}</span>
              <span style={{ fontFamily: 'var(--gc-mono)', color: T.textMuted }}> · {c.roman}</span>
              <span style={{ color: T.textDim }}> — {t.outKey}</span>
            </p>
          ))}
        </div>
      )}
      {sel != null && (
        <p style={{ margin: '10px 0 0', fontSize: 12, color: T.textDim, textAlign: 'center' }}>
          <span style={{ display: 'inline-block', width: 10, height: 10, background: alpha(THREAD, 100), marginInlineEnd: 6, verticalAlign: 'middle' }} />
          {t.threadOf(String(sel))}
        </p>
      )}
    </div>
  );
}
