import { useMemo, useState } from 'react';
import { Chord as TonalChord, Note } from '@tonaljs/tonal';
import { STANDARD_OPEN_MIDI, CHROMATIC } from '../../utils/musicTheory';
import { playInterval } from '../../utils/audioPlayback';
import { T, card, alpha } from '../../theme';

// ── In a Chord — see any interval within a chord, laid out on the neck ────────
// Pick a chord (sets the root + shows every chord tone across the fretboard as
// dim context) and an interval; the tool highlights that interval measured from
// the chord's root — but ONLY where a human hand can actually grab it. Harmonic
// pairs must sit on different strings within a reachable stretch; melodic pairs
// may share a string. A target note that is itself a chord tone is ringed.

const OPEN = STANDARD_OPEN_MIDI;
const N_STR = 6, N_FRET = 12;

// Geometry — mirrors the other interval necks for visual parity.
const FB_W = 580, FB_H = 165, NUT = 44;
const FRET_SP = (FB_W - NUT - 16) / 12;
const STR_SP = (FB_H - 30) / 5;
const FB_TOP = 12;
const strY = (s: number) => FB_TOP + (5 - s) * STR_SP;
const noteX = (f: number) => (f === 0 ? NUT - 14 : NUT + (f - 0.5) * FRET_SP);
const midiName = (m: number) => CHROMATIC[((m % 12) + 12) % 12];

const ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const TRIADS: { display: string; key: string }[] = [
  { display: 'Major', key: 'M' }, { display: 'Minor', key: 'm' },
  { display: 'dim', key: 'dim' }, { display: 'aug', key: 'aug' },
  { display: 'sus2', key: 'sus2' }, { display: 'sus4', key: 'sus4' },
];
const EXTENSIONS: { display: string; key: string }[] = [
  { display: '—', key: '' }, { display: '7', key: '7' }, { display: 'maj7', key: 'maj7' },
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
type Region = 'all' | 'low' | 'mid' | 'high';
const REGIONS: { id: Region; label: string; lo: number; hi: number }[] = [
  { id: 'all', label: 'All', lo: 0, hi: 12 },
  { id: 'low', label: 'Low', lo: 0, hi: 4 },
  { id: 'mid', label: 'Mid', lo: 4, hi: 9 },
  { id: 'high', label: 'High', lo: 8, hi: 12 },
];

interface Pos { string: number; fret: number }
interface Pair { root: Pos; target: Pos; rMidi: number; tMidi: number; span: number }

const A_COLOR = 'var(--gc-success)';  // interval root
const B_COLOR = T.primary;            // interval target

const LBL: React.CSSProperties = {
  margin: '0 0 8px', fontSize: 10, color: '#9C958C',
  fontFamily: 'var(--gc-mono)', letterSpacing: '0.14em', textTransform: 'uppercase',
};

export function IntervalInChord() {
  const [root, setRoot] = useState('C');
  const [triad, setTriad] = useState('M');
  const [ext, setExt] = useState('');
  const [semis, setSemis] = useState(7);         // default P5
  const [mode, setMode] = useState<Mode>('harmonic');
  const [region, setRegion] = useState<Region>('all');
  const [dense, setDense] = useState(true);      // true = one clean shape per zone
  const [maxStretch, setMaxStretch] = useState(4);

  const validExt = VALID_EXT[triad] ?? [''];
  const effExt = validExt.includes(ext) ? ext : '';
  const chordName = root + (SUFFIX[triad]?.[effExt] ?? '');

  // Chord tones (pitch classes) + role of each for context.
  const { chordPcs, rootPc } = useMemo(() => {
    const c = TonalChord.get(chordName);
    const pcs = new Set<number>();
    (c.notes ?? []).forEach(n => { const ch = Note.chroma(n); if (ch != null) pcs.add(ch); });
    const rp = Note.chroma(root) ?? 0;
    pcs.add(rp);
    return { chordPcs: pcs, rootPc: rp };
  }, [chordName, root]);

  const targetPc = (rootPc + semis) % 12;
  const targetInChord = chordPcs.has(targetPc);

  const region_ = REGIONS.find(r => r.id === region)!;
  const inRegion = (f: number) => f >= region_.lo && f <= region_.hi;

  // Playable instances of the interval, measured from the chord root.
  const pairs = useMemo<Pair[]>(() => {
    const out: Pair[] = [];
    for (let s = 0; s < N_STR; s++) {
      for (let f = 0; f <= N_FRET; f++) {
        if ((OPEN[s] + f) % 12 !== rootPc) continue;   // a root note
        if (!inRegion(f)) continue;
        const rMidi = OPEN[s] + f;
        const tMidi = rMidi + semis;                    // exact interval above
        for (let s2 = 0; s2 < N_STR; s2++) {
          const f2 = tMidi - OPEN[s2];
          if (f2 < 0 || f2 > N_FRET) continue;
          if (!inRegion(f2)) continue;
          const open = f === 0 || f2 === 0;
          const span = Math.abs(f - f2);
          if (mode === 'harmonic') {
            if (s2 === s) continue;                      // same string can't ring together
            if (!open && span > maxStretch) continue;
          } else {
            // melodic: same string is fine; cross-string still bounded
            if (s2 !== s && !open && span > maxStretch + 2) continue;
          }
          out.push({ root: { string: s, fret: f }, target: { string: s2, fret: f2 }, rMidi, tMidi, span });
        }
      }
    }
    if (!dense) return out;
    // "clean": keep the tightest, most adjacent shape per neck zone.
    const zone = (f: number) => (f <= 4 ? 0 : f <= 8 ? 1 : 2);
    const best = new Map<number, Pair>();
    for (const p of out) {
      const z = zone(p.root.fret);
      const cur = best.get(z);
      const score = (x: Pair) => x.span * 2 + Math.abs(x.root.string - x.target.string);
      if (!cur || score(p) < score(cur)) best.set(z, p);
    }
    return [...best.values()];
  }, [rootPc, semis, mode, region, dense, maxStretch]);

  const play = (p: Pair) => playInterval(p.rMidi, p.tMidi, mode);

  // Every chord-tone position (dim context).
  const context: Pos[] = useMemo(() => {
    const out: Pos[] = [];
    for (let s = 0; s < N_STR; s++)
      for (let f = 0; f <= N_FRET; f++)
        if (chordPcs.has((OPEN[s] + f) % 12)) out.push({ string: s, fret: f });
    return out;
  }, [chordPcs]);

  const btn = (active: boolean): React.CSSProperties => ({
    padding: '9px 2px', borderRadius: 0, cursor: 'pointer', fontSize: 13, fontWeight: 600,
    border: active ? 'none' : `1px solid ${T.border}`,
    background: active ? T.secondary : T.bgInput,
    color: active ? '#fff' : T.textMuted, textTransform: 'none',
  });
  const pill = (active: boolean): React.CSSProperties => ({
    padding: '6px 12px', borderRadius: 0, cursor: 'pointer', fontSize: 11, fontWeight: 600,
    border: 'none', borderLeft: '3px solid var(--gc-bar-color)',
    background: active ? T.secondary : T.bgInput, color: active ? '#fff' : T.textMuted,
  });

  const selName = INTERVALS.find(i => i.semis === semis)?.name ?? '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* ── Chord picker ── */}
      <div style={card({ padding: '14px 16px' })}>
        <p style={LBL}>Chord</p>
        <div dir="ltr" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 5, marginBottom: 10 }}>
          {ROOTS.map(r => (
            <button key={r} onClick={() => setRoot(r)} style={btn(root === r)}>{r}</button>
          ))}
        </div>
        <div dir="ltr" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 5, marginBottom: 10 }}>
          {TRIADS.map(q => (
            <button key={q.key} onClick={() => setTriad(q.key)} style={btn(triad === q.key)}>{q.display}</button>
          ))}
        </div>
        <div dir="ltr" style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 5 }}>
          {EXTENSIONS.map(e => {
            const ok = validExt.includes(e.key);
            return (
              <button key={e.key} disabled={!ok} onClick={() => setExt(e.key)}
                style={{ ...btn(effExt === e.key && ok), opacity: ok ? 1 : 0.3, cursor: ok ? 'pointer' : 'not-allowed' }}>
                {e.display}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Interval picker ── */}
      <div style={card({ padding: '14px 16px' })}>
        <p style={LBL}>Interval from the root</p>
        <div dir="ltr" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 5 }}>
          {INTERVALS.map(iv => {
            const inCh = chordPcs.has((rootPc + iv.semis) % 12);
            const active = semis === iv.semis;
            return (
              <button key={iv.semis} onClick={() => setSemis(iv.semis)}
                style={{ ...btn(active), position: 'relative' }} title={iv.name}>
                {iv.ab}
                {inCh && (
                  <span style={{
                    position: 'absolute', top: 3, insetInlineEnd: 4, width: 5, height: 5, borderRadius: '50%',
                    background: active ? '#fff' : A_COLOR,
                  }} />
                )}
              </button>
            );
          })}
        </div>
        <p style={{ margin: '10px 0 0', fontSize: 12, color: T.textMuted }}>
          <span style={{ fontWeight: 700, color: T.text }}>{chordName}</span> · {selName} from {root}
          {targetInChord
            ? <span style={{ color: A_COLOR, fontWeight: 600 }}> — this interval is a chord tone ({midiName(rootPc + semis)})</span>
            : <span style={{ color: T.textDim }}> — not a chord tone</span>}
        </p>
      </div>

      {/* ── Controls ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <div style={{ display: 'flex', border: `1px solid ${T.border}` }}>
          {(['harmonic', 'melodic'] as Mode[]).map(m => (
            <button key={m} onClick={() => setMode(m)} style={pill(mode === m)}>{m === 'harmonic' ? 'Harmonic' : 'Melodic'}</button>
          ))}
        </div>
        <div style={{ display: 'flex', border: `1px solid ${T.border}` }}>
          {REGIONS.map(r => (
            <button key={r.id} onClick={() => setRegion(r.id)} style={pill(region === r.id)}>{r.label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', border: `1px solid ${T.border}` }}>
          <button onClick={() => setDense(true)} style={pill(dense)}>Clean</button>
          <button onClick={() => setDense(false)} style={pill(!dense)}>All</button>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: T.textMuted }}>
          Reach {maxStretch}fr
          <input type="range" min={2} max={6} value={maxStretch} onChange={e => setMaxStretch(+e.target.value)}
            style={{ width: 90, accentColor: 'var(--gc-secondary)' }} />
        </label>
      </div>

      {/* ── Neck ── */}
      <div style={{ background: 'var(--gc-fretboard-bg)', padding: '10px 10px 6px', border: `1px solid ${T.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, fontSize: 11 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: A_COLOR }} />
            <span style={{ color: 'var(--gc-text)' }}>root</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: B_COLOR, border: '1px solid var(--gc-border)' }} />
            <span style={{ color: 'var(--gc-text)' }}>+{selName}</span>
          </span>
          <span style={{ marginInlineStart: 'auto', color: T.textDim, fontSize: 10 }}>
            {pairs.length} playable{dense ? '' : ' (all)'}
          </span>
        </div>

        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <svg viewBox={`0 0 ${FB_W} ${FB_H + 6}`} style={{ display: 'block', width: '140%', minWidth: 460, userSelect: 'none' }}>
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
            {/* string names */}
            {Array.from({ length: 6 }).map((_, s) => (
              <text key={`o${s}`} x={NUT - 30} y={strY(s) + 3.5} textAnchor="middle" fontSize={11} fontWeight="700" fill="var(--gc-text)">
                {midiName(OPEN[s])}
              </text>
            ))}
            {/* fret numbers */}
            {[3, 5, 7, 9, 12].map(f => (
              <text key={f} x={NUT + (f - 0.5) * FRET_SP} y={FB_TOP + 5 * STR_SP + 11} textAnchor="middle" fontSize={10} fontWeight="700" fill="var(--gc-text)">{f}</text>
            ))}

            {/* dim chord-tone context */}
            {context.map((p, i) => {
              const isRoot = (OPEN[p.string] + p.fret) % 12 === rootPc;
              return (
                <circle key={`c${i}`} cx={noteX(p.fret)} cy={strY(p.string)} r={5.5}
                  fill={isRoot ? alpha(A_COLOR, 34) : alpha('var(--gc-text)', 20)}
                  stroke={isRoot ? alpha(A_COLOR, 55) : 'none'} strokeWidth={1} />
              );
            })}

            {/* interval connectors */}
            {pairs.map((p, i) => (
              <line key={`l${i}`} x1={noteX(p.root.fret)} y1={strY(p.root.string)}
                x2={noteX(p.target.fret)} y2={strY(p.target.string)}
                stroke={A_COLOR} strokeWidth={1.6} strokeDasharray={mode === 'melodic' ? '5 3' : undefined} opacity={0.75} />
            ))}
            {/* interval notes */}
            {pairs.map((p, i) => (
              <g key={`p${i}`} style={{ cursor: 'pointer' }} onClick={() => play(p)}>
                <circle cx={noteX(p.root.fret)} cy={strY(p.root.string)} r={11} fill={A_COLOR} stroke="#fff" strokeWidth={1.5} />
                <text x={noteX(p.root.fret)} y={strY(p.root.string)} dominantBaseline="central" textAnchor="middle" fontSize={9} fontWeight="700" fill="#fff">R</text>
                <circle cx={noteX(p.target.fret)} cy={strY(p.target.string)} r={11} fill={B_COLOR} stroke="#fff" strokeWidth={1.5} />
                {chordPcs.has(p.tMidi % 12) && (
                  <circle cx={noteX(p.target.fret)} cy={strY(p.target.string)} r={14} fill="none" stroke={A_COLOR} strokeWidth={1.5} />
                )}
                <text x={noteX(p.target.fret)} y={strY(p.target.string)} dominantBaseline="central" textAnchor="middle" fontSize={9} fontWeight="700" fill="#fff">
                  {midiName(p.tMidi)}
                </text>
              </g>
            ))}
          </svg>
        </div>
        {pairs.length === 0 && (
          <p style={{ textAlign: 'center', color: T.textDim, fontSize: 12, padding: '8px 0 2px' }}>
            No hand-playable {selName.toLowerCase()} in this region — widen the reach or region.
          </p>
        )}
      </div>
      <p style={{ margin: 0, fontSize: 11, color: T.textDim, textAlign: 'center' }}>Tap a highlighted pair to hear it.</p>
    </div>
  );
}
