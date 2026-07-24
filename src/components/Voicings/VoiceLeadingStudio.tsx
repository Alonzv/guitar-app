import { useRef, useState } from 'react';
import { Chord as TonalChord, Note } from '@tonaljs/tonal';
import type { ChordInProgression, FretPosition, Tuning } from '../../types/music';
import { TUNINGS, fretToNote } from '../../utils/musicTheory';
import { findVoicingPaths } from '../../utils/voicingPaths';
import type { VoicingPath } from '../../utils/voicingPaths';
import { MiniFretboard } from '../Fretboard/MiniFretboard';
import { playChord, unlockAudio } from '../../utils/audioPlayback';
import { T, card, alpha } from '../../theme';

// ── Voice Leading Studio ─────────────────────────────────────────────────────
// Build a progression, optionally mute degrees globally, then Calculate a
// voice-led arrangement: each chord is a column with a playable shape on the
// neck. Click a degree to thread that voice across the whole progression.
// Reuses findVoicingPaths (already enforces a ≤4-fret hand span), MiniFretboard,
// and the app palette — no hardcoded colours.

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

// Semitone-from-root → chord-degree label (approximate; enough for muting/threading).
const DEG_OF_SEMI: Record<number, string> = {
  0: '1', 1: '♭9', 2: '9', 3: '3', 4: '3', 5: '11', 6: '5', 7: '5', 8: '5', 9: '13', 10: '7', 11: '7',
};
const MUTABLE = ['1', '3', '5', '7'];
const DEG_ORDER = ['1', '♭9', '9', '3', '11', '5', '13', '7'];

type Rule = 'smooth' | 'open' | 'contrary';

function degOf(chordName: string, pos: FretPosition, notes: string[]): string {
  const note = fretToNote(pos.string, pos.fret, notes);
  const nc = Note.chroma(note); if (nc == null) return '';
  const tonic = TonalChord.get(chordName).tonic || (chordName.match(/^[A-G][#b]?/)?.[0] ?? 'C');
  const rc = Note.chroma(tonic) ?? 0;
  return DEG_OF_SEMI[((nc - rc) % 12 + 12) % 12] ?? '';
}

// Rule scores over the candidate paths returned by the engine.
const openScore = (p: VoicingPath) =>
  p.voicings.reduce((n, v) => n + v.filter(x => x.fret === 0).length, 0) - p.avgFret * 0.2;
function contraryScore(p: VoicingPath): number {
  let n = 0;
  for (let i = 0; i + 1 < p.voicings.length; i++) {
    const a = p.voicings[i], b = p.voicings[i + 1];
    const top = (v: FretPosition[]) => [...v].sort((x, y) => y.string - x.string)[0]?.fret ?? 0;
    const bot = (v: FretPosition[]) => [...v].sort((x, y) => x.string - y.string)[0]?.fret ?? 0;
    if (Math.sign(top(b) - top(a)) * Math.sign(bot(b) - bot(a)) < 0) n++;
  }
  return n;
}
function pickPath(paths: VoicingPath[], rule: Rule): VoicingPath | null {
  if (!paths.length) return null;
  const sorted = [...paths];
  if (rule === 'open') sorted.sort((a, b) => openScore(b) - openScore(a));
  else if (rule === 'contrary') sorted.sort((a, b) => contraryScore(b) - contraryScore(a));
  else sorted.sort((a, b) => b.smoothness - a.smoothness);
  return sorted[0];
}

interface Result { chords: string[]; voicings: FretPosition[][] }

export function VoiceLeadingStudio({ desktop, globalProgression, tuning }: {
  desktop?: boolean; globalProgression?: ChordInProgression[]; tuning?: Tuning;
} = {}) {
  const [lang, setLang] = useState<'en' | 'he'>('en');
  const rtl = lang === 'he';
  const tun = tuning ?? TUNINGS[0];

  const [chords, setChords] = useState<string[]>(() => {
    const g = (globalProgression ?? []).map(c => c.chord.name).filter(Boolean);
    return g.length ? g.slice(0, 12) : ['Cmaj7', 'Am7', 'Dm7', 'G7'];
  });
  const [muted, setMuted] = useState<Set<string>>(new Set());
  const [rule, setRule] = useState<Rule>('smooth');
  const [result, setResult] = useState<Result | null>(null);
  const [thread, setThread] = useState<string | null>(null);
  const [pickOpen, setPickOpen] = useState(false);
  const [pRoot, setPRoot] = useState('C'); const [pTri, setPTri] = useState('M'); const [pExt, setPExt] = useState('');
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const t = lang === 'he'
    ? { title: 'סטודיו הולכת קולות', mute: 'ניטרול דרגות', add: 'הוסף אקורד', calc: 'חשב', play: '▶ נגן', clear: 'נקה',
        rule: 'חוקיות', smooth: 'חלק', open: 'פתוח', contrary: 'מנוגד', build: 'בנו מהלך ולחצו על "חשב"', addChord: 'הוסף' }
    : { title: 'Voice Leading Studio', mute: 'Mute degrees', add: 'Add chord', calc: 'Calculate', play: '▶ Play', clear: 'Clear',
        rule: 'Motion', smooth: 'Smooth', open: 'Open', contrary: 'Contrary', build: 'Build a progression, then press Calculate', addChord: 'Add' };

  const calc = () => {
    if (!chords.length) return;
    const paths = findVoicingPaths(chords, { genre: 'any', mode: 'full', stringGroup: 'all', tuning: tun.notes, pathCount: 6 });
    const path = pickPath(paths, rule);
    setThread(null);
    setResult(path ? { chords: [...chords], voicings: path.voicings } : { chords: [...chords], voicings: [] });
  };

  const filtered = (voicing: FretPosition[], name: string) =>
    voicing.filter(pos => { const d = degOf(name, pos, tun.notes); return !MUTABLE.includes(d) || !muted.has(d); });

  const play = () => {
    if (!result) return;
    unlockAudio().then(() => {
      timers.current.forEach(clearTimeout); timers.current = [];
      result.voicings.forEach((v, i) => {
        timers.current.push(setTimeout(() => playChord(filtered(v, result.chords[i]), tun.openFreqs), i * 1250));
      });
    });
  };

  const addChord = () => {
    const name = buildName(pRoot, pTri, validExts(pTri).some(e => e.k === pExt) ? pExt : '');
    setChords(c => [...c, name]); setResult(null); setPickOpen(false);
  };
  const removeChord = (i: number) => { setChords(c => c.filter((_, j) => j !== i)); setResult(null); };
  const toggleMute = (d: string) => setMuted(m => { const n = new Set(m); n.has(d) ? n.delete(d) : n.add(d); return n; });

  const chip = (active: boolean): React.CSSProperties => ({
    padding: '6px 12px', borderRadius: 0, cursor: 'pointer', fontSize: 12, fontWeight: 600,
    border: 'none', borderLeft: '3px solid var(--gc-bar-color)',
    background: active ? T.secondary : T.bgInput, color: active ? '#fff' : T.textMuted,
  });
  const sel: React.CSSProperties = {
    appearance: 'none', WebkitAppearance: 'none', background: T.bgInput, border: `1px solid ${T.border}`,
    borderRadius: 0, color: T.text, fontSize: 13, fontWeight: 600, padding: '7px 10px', cursor: 'pointer', outline: 'none',
  };
  const LBL: React.CSSProperties = { margin: '0 0 8px', fontSize: 10, color: '#9C958C', fontFamily: 'var(--gc-mono)', letterSpacing: '0.14em', textTransform: 'uppercase' };
  const THREAD = T.success;   // the only distinct hue in this near-monochrome palette (cobalt) — makes the threaded voice pop

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
          <button key={d} onClick={() => toggleMute(d)} title={d} style={{
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
            <select value={pRoot} onChange={e => setPRoot(e.target.value)} style={sel}>{ROOTS.map(r => <option key={r} value={r}>{r}</option>)}</select>
            <select value={pTri} onChange={e => { setPTri(e.target.value); setPExt(''); }} style={sel}>{TRIADS.map(q => <option key={q.k} value={q.k}>{q.l}</option>)}</select>
            <select value={pExt} onChange={e => setPExt(e.target.value)} style={sel}>{validExts(pTri).map(e => <option key={e.k} value={e.k}>{e.l}</option>)}</select>
            <button onClick={addChord} style={{ padding: '8px 18px', borderRadius: 0, cursor: 'pointer', fontSize: 13, fontWeight: 600, background: T.primary, color: T.white, border: 'none', borderLeft: '3px solid var(--gc-bar-color)' }}>{t.addChord}</button>
          </div>
        )}
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 18, flexWrap: 'wrap' }}>
        <span style={{ ...LBL, margin: 0 }}>{t.rule}</span>
        <div style={{ display: 'flex', border: `1px solid ${T.border}` }}>
          {(['smooth', 'open', 'contrary'] as Rule[]).map(r => (
            <button key={r} onClick={() => setRule(r)} style={chip(rule === r)}>{t[r]}</button>
          ))}
        </div>
        <button onClick={calc} style={{ padding: '9px 26px', borderRadius: 0, cursor: 'pointer', fontSize: 14, fontWeight: 700, background: T.primary, color: T.white, border: 'none', borderLeft: '4px solid var(--gc-bar-color)' }}>{t.calc}</button>
        {result && <button onClick={play} style={{ padding: '9px 20px', borderRadius: 0, cursor: 'pointer', fontSize: 14, fontWeight: 600, background: T.secondary, color: '#fff', border: 'none', borderLeft: '4px solid var(--gc-bar-color)' }}>{t.play}</button>}
      </div>

      {/* Results */}
      {!result ? (
        <div style={{ ...card({ padding: 28 }), textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 14, color: T.textMuted }}>{t.build}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8, alignItems: 'flex-start' }}>
          {result.chords.map((name, i) => {
            const voicing = filtered(result.voicings[i] ?? [], name);
            const degs = voicing.map(pos => degOf(name, pos, tun.notes));
            const present = DEG_ORDER.filter(d => degs.includes(d));
            const dotColors = voicing.map(pos => degOf(name, pos, tun.notes) === thread ? THREAD : T.primary);
            const dotLabels = degs;
            return (
              <div key={i} style={{ ...card({ padding: 10 }), width: desktop ? 190 : 170, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                  <span dir="ltr" style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{name}</span>
                  <button onClick={() => removeChord(i)} style={{ border: 'none', background: 'transparent', color: T.textDim, cursor: 'pointer', fontSize: 15 }}>×</button>
                </div>
                {/* Smart labels — click a degree to thread that voice */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {present.map(d => (
                    <button key={d} onClick={() => setThread(td => td === d ? null : d)} style={{
                      padding: '4px 9px', borderRadius: 0, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                      border: 'none', borderLeft: '2px solid var(--gc-bar-color)',
                      background: thread === d ? THREAD : T.bgInput, color: thread === d ? '#fff' : T.textMuted,
                    }}>{d}</button>
                  ))}
                </div>
                <MiniFretboard voicing={voicing} dotColors={dotColors} dotLabels={dotLabels} tuning={tun.notes} showStringLabels showFretNumbers />
              </div>
            );
          })}
        </div>
      )}
      {thread && (
        <p style={{ margin: '10px 0 0', fontSize: 12, color: T.textDim, textAlign: 'center' }}>
          <span style={{ display: 'inline-block', width: 10, height: 10, background: alpha(THREAD, 100), marginInlineEnd: 6, verticalAlign: 'middle' }} />
          {lang === 'he' ? `מסלול הקול של דרגה ${thread}` : `Threading the ${thread} voice`}
        </p>
      )}
    </div>
  );
}
