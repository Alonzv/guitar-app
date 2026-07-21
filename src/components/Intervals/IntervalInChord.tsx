import { useMemo, useState } from 'react';
import { Chord as TonalChord, Note } from '@tonaljs/tonal';
import { STANDARD_OPEN_MIDI, CHROMATIC } from '../../utils/musicTheory';
import { playInterval } from '../../utils/audioPlayback';
import { T, card, alpha } from '../../theme';

// ── In a Chord — find every occurrence of an interval inside a chord ──────────
// Pick a chord; the tool shows each chord tone across the neck as dim context.
// Pick an interval and it highlights every place two CHORD TONES sit exactly
// that interval apart and can be grabbed together (different strings, within
// reach) — e.g. the minor 6th in Em is the B→G pair, shown wherever it's
// playable. Intervals the chord doesn't contain are disabled.

const OPEN = STANDARD_OPEN_MIDI;
const N_STR = 6, N_FRET = 12;
const MAX_STRETCH = 5;   // fixed, hand-reachable double-stop span

// Geometry — standard neck size, matching the other interval necks.
const FB_W = 580, FB_H = 165, NUT = 44;
const FRET_SP = (FB_W - NUT - 16) / 12;
const STR_SP = (FB_H - 30) / 5;
const FB_TOP = 12;
const strY = (s: number) => FB_TOP + (5 - s) * STR_SP;
const noteX = (f: number) => (f === 0 ? NUT - 14 : NUT + (f - 0.5) * FRET_SP);
const pcName = (m: number) => CHROMATIC[((m % 12) + 12) % 12];

const ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const TRIADS = [
  { display: 'Major', key: 'M' }, { display: 'Minor', key: 'm' },
  { display: 'dim', key: 'dim' }, { display: 'aug', key: 'aug' },
  { display: 'sus2', key: 'sus2' }, { display: 'sus4', key: 'sus4' },
];
const EXTENSIONS = [
  { display: '— (triad)', key: '' }, { display: '7', key: '7' }, { display: 'maj7', key: 'maj7' },
  { display: '9', key: '9' }, { display: 'add9', key: 'add9' }, { display: '6', key: '6' },
  { display: '11', key: '11' }, { display: '13', key: '13' },
];
const VALID_EXT: Record<string, string[]> = {
  M: ['', '7', 'maj7', '9', 'add9', '6', '11', '13'],
  m: ['', '7', 'maj7', '9', 'add9', '6', '11', '13'],
  dim: ['', '7'], aug: ['', '7'], sus2: [''], sus4: [''],
};
const SUFFIX: Record<string, Record<string, string>> = {
  M: { '': '', '7': '7', maj7: 'maj7', '9': '9', add9: 'add9', '6': '6', '11': '11', '13': '13' },
  m: { '': 'm', '7': 'm7', maj7: 'mM7', '9': 'm9', add9: 'madd9', '6': 'm6', '11': 'm11', '13': 'm13' },
  dim: { '': 'dim', '7': 'dim7' }, aug: { '': 'aug', '7': 'aug7' },
  sus2: { '': 'sus2' }, sus4: { '': 'sus4' },
};

const INTERVALS = [
  { semis: 1, ab: 'm2', name: 'Minor 2nd' }, { semis: 2, ab: 'M2', name: 'Major 2nd' },
  { semis: 3, ab: 'm3', name: 'Minor 3rd' }, { semis: 4, ab: 'M3', name: 'Major 3rd' },
  { semis: 5, ab: 'P4', name: 'Perfect 4th' }, { semis: 6, ab: 'TT', name: 'Tritone' },
  { semis: 7, ab: 'P5', name: 'Perfect 5th' }, { semis: 8, ab: 'm6', name: 'Minor 6th' },
  { semis: 9, ab: 'M6', name: 'Major 6th' }, { semis: 10, ab: 'm7', name: 'Minor 7th' },
  { semis: 11, ab: 'M7', name: 'Major 7th' }, { semis: 12, ab: 'P8', name: 'Octave' },
];

type Mode = 'harmonic' | 'melodic';
interface Pos { string: number; fret: number }
interface Pair { lo: Pos; hi: Pos; loMidi: number; hiMidi: number }

const LO_COLOR = 'var(--gc-success)';   // lower note of the interval
const HI_COLOR = T.primary;             // upper note

const LBL: React.CSSProperties = {
  margin: '0 0 8px', fontSize: 10, color: '#9C958C',
  fontFamily: 'var(--gc-mono)', letterSpacing: '0.14em', textTransform: 'uppercase',
};
const SELECT: React.CSSProperties = {
  appearance: 'none', WebkitAppearance: 'none', width: '100%',
  background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 0,
  color: T.text, fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
  padding: '8px 26px 8px 10px', cursor: 'pointer', outline: 'none',
  borderLeft: '3px solid var(--gc-bar-color)',
};

export function IntervalInChord({ desktop }: { desktop?: boolean } = {}) {
  const [root, setRoot] = useState('C');
  const [triad, setTriad] = useState('m');
  const [ext, setExt] = useState('');
  const [semis, setSemis] = useState(8);          // default m6 (the example)
  const [mode, setMode] = useState<Mode>('harmonic');

  const validExt = VALID_EXT[triad] ?? [''];
  const effExt = validExt.includes(ext) ? ext : '';
  const chordName = root + (SUFFIX[triad]?.[effExt] ?? '');

  const chord = useMemo(() => {
    const c = TonalChord.get(chordName);
    const pcs = new Set<number>();
    const spelling = new Map<number, string>();   // pc → theory-correct name (Eb, not D#)
    (c.notes ?? []).forEach(n => { const ch = Note.chroma(n); if (ch != null) { pcs.add(ch); if (!spelling.has(ch)) spelling.set(ch, n); } });
    const rp = Note.chroma(root); if (rp != null) { pcs.add(rp); if (!spelling.has(rp)) spelling.set(rp, root); }
    return { pcs, spelling };
  }, [chordName, root]);
  const chordPcs = chord.pcs;
  const spell = (m: number) => chord.spelling.get(((m % 12) + 12) % 12) ?? pcName(m);

  // Which intervals actually occur between two chord tones.
  const present = useMemo(() => {
    const s = new Set<number>();
    for (const iv of INTERVALS)
      for (const a of chordPcs)
        if (chordPcs.has((a + iv.semis) % 12)) { s.add(iv.semis); break; }
    return s;
  }, [chordPcs]);

  const effSemis = present.has(semis) ? semis : (INTERVALS.find(i => present.has(i.semis))?.semis ?? semis);

  // Every hand-playable placement of the interval between two chord tones.
  const pairs = useMemo<Pair[]>(() => {
    const out: Pair[] = [];
    for (let s = 0; s < N_STR; s++) {
      for (let f = 0; f <= N_FRET; f++) {
        const loMidi = OPEN[s] + f;
        if (!chordPcs.has(loMidi % 12)) continue;          // lower note must be a chord tone
        const hiMidi = loMidi + effSemis;
        if (!chordPcs.has(hiMidi % 12)) continue;          // upper note must be a chord tone too
        for (let s2 = 0; s2 < N_STR; s2++) {
          if (s2 === s) continue;                          // different strings (grabbable together)
          const f2 = hiMidi - OPEN[s2];
          if (f2 < 0 || f2 > N_FRET) continue;
          const open = f === 0 || f2 === 0;
          if (!open && Math.abs(f - f2) > MAX_STRETCH) continue;
          out.push({ lo: { string: s, fret: f }, hi: { string: s2, fret: f2 }, loMidi, hiMidi });
        }
      }
    }
    return out;
  }, [chordPcs, effSemis]);

  const context: Pos[] = useMemo(() => {
    const out: Pos[] = [];
    for (let s = 0; s < N_STR; s++)
      for (let f = 0; f <= N_FRET; f++)
        if (chordPcs.has((OPEN[s] + f) % 12)) out.push({ string: s, fret: f });
    return out;
  }, [chordPcs]);

  const play = (p: Pair) => playInterval(p.loMidi, p.hiMidi, mode);
  const playExample = () => { if (pairs.length) play([...pairs].sort((a, b) => a.loMidi - b.loMidi)[0]); };

  const ivName = INTERVALS.find(i => i.semis === effSemis)?.name ?? '';
  // For every interval, which chord-tone pairs form it (e.g. M3 in Cmaj7 →
  // ["C→E", "G→B"]). Shown on the picker buttons so it's obvious which pair
  // each interval maps to — and that e.g. A→F# is the MAJOR 6th, not m6.
  const pairLabels = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const iv of INTERVALS) {
      const res: string[] = [];
      for (const a of chordPcs) {
        const b = (a + iv.semis) % 12;
        if (chordPcs.has(b)) res.push(`${chord.spelling.get(a) ?? pcName(a)}→${chord.spelling.get(b) ?? pcName(b)}`);
      }
      if (res.length) map.set(iv.semis, res);
    }
    return map;
  }, [chordPcs, chord]);
  const ivPairs = pairLabels.get(effSemis) ?? [];
  const pillBtn = (active: boolean): React.CSSProperties => ({
    padding: '7px 12px', borderRadius: 0, cursor: 'pointer', fontSize: 11, fontWeight: 600,
    border: 'none', borderLeft: '3px solid var(--gc-bar-color)',
    background: active ? T.secondary : T.bgInput, color: active ? '#fff' : T.textMuted,
  });

  const controls = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={card({ padding: '14px 16px' })}>
        <p style={LBL}>Chord</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <select value={root} onChange={e => setRoot(e.target.value)} style={SELECT}>
            {ROOTS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <select value={triad} onChange={e => setTriad(e.target.value)} style={SELECT}>
            {TRIADS.map(q => <option key={q.key} value={q.key}>{q.display}</option>)}
          </select>
          <select value={effExt} onChange={e => setExt(e.target.value)} style={SELECT}>
            {EXTENSIONS.filter(e => validExt.includes(e.key)).map(e => <option key={e.key} value={e.key}>{e.display}</option>)}
          </select>
        </div>
      </div>

      <div style={card({ padding: '14px 16px' })}>
        <p style={LBL}>Interval in the chord</p>
        <div dir="ltr" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5 }}>
          {INTERVALS.map(iv => {
            const has = present.has(iv.semis);
            const active = effSemis === iv.semis;
            const labels = pairLabels.get(iv.semis) ?? [];
            return (
              <button key={iv.semis} disabled={!has} onClick={() => setSemis(iv.semis)} title={iv.name}
                style={{
                  padding: '6px 2px 5px', borderRadius: 0, fontSize: 12, fontWeight: 600, textTransform: 'none',
                  border: active ? 'none' : `1px solid ${T.border}`,
                  background: active ? T.secondary : T.bgInput,
                  color: active ? '#fff' : T.textMuted,
                  opacity: has ? 1 : 0.28, cursor: has ? 'pointer' : 'not-allowed',
                  lineHeight: 1.25,
                }}>
                <span style={{ display: 'block' }}>{iv.ab}</span>
                {/* the chord-tone pair this interval maps to, e.g. A→F# on M6 */}
                {has && labels.length > 0 && (
                  <span style={{ display: 'block', fontSize: 8, fontWeight: 400, opacity: 0.8, fontFamily: 'var(--gc-mono)' }}>
                    {labels[0]}{labels.length > 1 ? ` +${labels.length - 1}` : ''}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div style={card({ padding: '14px 16px' })}>
        <p style={LBL}>Hear it</p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
          <div style={{ display: 'flex', border: `1px solid ${T.border}`, flex: 1 }}>
            {(['melodic', 'harmonic'] as Mode[]).map(m => (
              <button key={m} onClick={() => setMode(m)} style={{ ...pillBtn(mode === m), flex: 1 }}>
                {m === 'melodic' ? 'Melodic' : 'Harmonic'}
              </button>
            ))}
          </div>
          <button onClick={playExample} disabled={!pairs.length} style={{
            padding: '7px 18px', borderRadius: 0, fontSize: 12, fontWeight: 700,
            border: 'none', borderLeft: '3px solid var(--gc-bar-color)',
            background: pairs.length ? T.primary : T.border, color: T.white,
            cursor: pairs.length ? 'pointer' : 'not-allowed',
          }}>▶ Play</button>
        </div>
      </div>
    </div>
  );

  const neck = (
    <div style={{ background: 'var(--gc-fretboard-bg)', padding: '10px 10px 6px', border: `1px solid ${T.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, fontSize: 11 }}>
        <span style={{ fontFamily: 'var(--gc-mono)', letterSpacing: '0.1em', color: 'var(--gc-text)', fontWeight: 600 }}>
          {chordName} · {ivName}{ivPairs.length ? ` · ${ivPairs.join(', ')}` : ''}
        </span>
        <span style={{ marginInlineStart: 'auto', color: T.textDim, fontSize: 10 }}>
          {pairs.length} on the neck
        </span>
      </div>
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <svg viewBox={`0 0 ${FB_W} ${FB_H + 6}`} style={{ display: 'block', width: '100%', minWidth: 320, userSelect: 'none' }}>
          <rect x={0} y={0} width={FB_W} height={FB_H + 6} fill="var(--gc-fretboard-bg)" />
          {[3, 5, 7, 9].map(f => (
            <circle key={f} cx={NUT + (f - 0.5) * FRET_SP} cy={FB_TOP + 2.5 * STR_SP} r={5} fill="var(--gc-fretboard-pos)" />
          ))}
          <circle cx={NUT + 11.5 * FRET_SP} cy={FB_TOP + 1 * STR_SP} r={4} fill="var(--gc-fretboard-pos)" />
          <circle cx={NUT + 11.5 * FRET_SP} cy={FB_TOP + 4 * STR_SP} r={4} fill="var(--gc-fretboard-pos)" />
          {Array.from({ length: 13 }).map((_, i) => (
            <line key={i} x1={NUT + i * FRET_SP} y1={FB_TOP} x2={NUT + i * FRET_SP} y2={FB_TOP + 5 * STR_SP}
              stroke="var(--gc-fretboard-fret)" strokeWidth={2} />
          ))}
          <rect x={NUT - 6} y={FB_TOP} width={6} height={5 * STR_SP} fill="var(--gc-fretboard-nut)" />
          {Array.from({ length: 6 }).map((_, s) => (
            <line key={s} x1={NUT} y1={strY(s)} x2={NUT + 12 * FRET_SP} y2={strY(s)}
              stroke="var(--gc-fretboard-str)" strokeWidth={0.8 + (5 - s) * 0.32} />
          ))}
          {Array.from({ length: 6 }).map((_, s) => (
            <text key={`o${s}`} x={NUT - 30} y={strY(s) + 3.5} textAnchor="middle" fontSize={11} fontWeight="700" fill="var(--gc-text)">
              {pcName(OPEN[s])}
            </text>
          ))}
          {[3, 5, 7, 9, 12].map(f => (
            <text key={f} x={NUT + (f - 0.5) * FRET_SP} y={FB_TOP + 5 * STR_SP + 11} textAnchor="middle" fontSize={10} fontWeight="700" fill="var(--gc-text)">{f}</text>
          ))}

          {/* dim chord-tone context */}
          {context.map((p, i) => (
            <circle key={`c${i}`} cx={noteX(p.fret)} cy={strY(p.string)} r={5.5} fill={alpha('var(--gc-text)', 22)} />
          ))}

          {/* interval occurrences */}
          {pairs.map((p, i) => (
            <line key={`l${i}`} x1={noteX(p.lo.fret)} y1={strY(p.lo.string)} x2={noteX(p.hi.fret)} y2={strY(p.hi.string)}
              stroke={LO_COLOR} strokeWidth={1.6} opacity={0.7} />
          ))}
          {pairs.map((p, i) => (
            <g key={`p${i}`} style={{ cursor: 'pointer' }} onClick={() => play(p)}>
              <circle cx={noteX(p.lo.fret)} cy={strY(p.lo.string)} r={10.5} fill={LO_COLOR} stroke="#fff" strokeWidth={1.5} />
              <text x={noteX(p.lo.fret)} y={strY(p.lo.string)} dominantBaseline="central" textAnchor="middle" fontSize={9} fontWeight="700" fill="#fff">{spell(p.loMidi)}</text>
              <circle cx={noteX(p.hi.fret)} cy={strY(p.hi.string)} r={10.5} fill={HI_COLOR} stroke="#fff" strokeWidth={1.5} />
              <text x={noteX(p.hi.fret)} y={strY(p.hi.string)} dominantBaseline="central" textAnchor="middle" fontSize={9} fontWeight="700" fill="#fff">{spell(p.hiMidi)}</text>
            </g>
          ))}
        </svg>
      </div>
      {pairs.length === 0 && (
        <p style={{ textAlign: 'center', color: T.textDim, fontSize: 12, padding: '8px 0 2px' }}>
          No hand-playable {ivName.toLowerCase()} between these chord tones.
        </p>
      )}
    </div>
  );

  if (!desktop) return <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>{controls}{neck}</div>;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 24, alignItems: 'start' }}>
      {controls}
      {neck}
    </div>
  );
}
