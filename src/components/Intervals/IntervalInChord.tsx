import { useMemo, useState } from 'react';
import { Chord as TonalChord, Note } from '@tonaljs/tonal';
import { STANDARD_OPEN_MIDI, CHROMATIC } from '../../utils/musicTheory';
import { IntervalNeck, strY, noteX } from './IntervalNeck';
import { playInterval } from '../../utils/audioPlayback';
import { T, card, alpha } from '../../theme';
import { toDisplayChord } from '../../utils/chordName';

// ── In a Chord — which intervals occur inside a chord ─────────────────────────
// The question is "which intervals are in this chord", so the answer is a list
// of the intervals that ARE there — one row each, nothing to decode. A row
// names the interval, the chord-tone pairs that form it (a major 3rd in Cmaj7
// is both C→E and G→B) and its size. Opening a row shows it on the neck: every
// playable placement as a dim marker, one of them highlighted and steppable, so
// you get the spread across the neck without a tangle of crossing lines.

const OPEN = STANDARD_OPEN_MIDI;
const N_STR = 6, N_FRET = 12;
const MAX_STRETCH = 5;   // fixed, hand-reachable double-stop span

// Geometry — standard neck size, matching the other interval necks.
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
  m: { '': 'm', '7': 'm7', maj7: 'mMaj7', '9': 'm9', add9: 'madd9', '6': 'm6', '11': 'm11', '13': 'm13' },
  dim: { '': 'dim', '7': 'dim7' }, aug: { '': 'aug', '7': 'aug7' },
  sus2: { '': 'sus2' }, sus4: { '': 'sus4' },
};

const INTERVALS = [
  { semis: 1, name: 'Minor 2nd' }, { semis: 2, name: 'Major 2nd' },
  { semis: 3, name: 'Minor 3rd' }, { semis: 4, name: 'Major 3rd' },
  { semis: 5, name: 'Perfect 4th' }, { semis: 6, name: 'Tritone' },
  { semis: 7, name: 'Perfect 5th' }, { semis: 8, name: 'Minor 6th' },
  { semis: 9, name: 'Major 6th' }, { semis: 10, name: 'Minor 7th' },
  { semis: 11, name: 'Major 7th' },
];

// Widening by an octave turns an interval into its compound form.
const widenName = (name: string) =>
  name.replace(/(\d+)(st|nd|rd|th)$/, (_, n: string) => {
    const d = Number(n) + 7;
    const suffix = d === 11 || d === 12 || d === 13 ? 'th'
      : d % 10 === 1 ? 'st' : d % 10 === 2 ? 'nd' : d % 10 === 3 ? 'rd' : 'th';
    return `${d}${suffix}`;
  });

type Mode = 'harmonic' | 'melodic';
interface Pos { string: number; fret: number }
interface Pair { lo: Pos; hi: Pos; loMidi: number; hiMidi: number }
interface Row { semis: number; name: string; pairs: string[] }

const LBL: React.CSSProperties = {
  margin: 0, fontSize: 10, color: '#9C958C',
  fontFamily: 'var(--gc-mono)', letterSpacing: '0.14em', textTransform: 'uppercase',
};
const SELECT: React.CSSProperties = {
  appearance: 'none', WebkitAppearance: 'none',
  background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 0,
  color: T.text, fontFamily: 'inherit', fontSize: 14, fontWeight: 700,
  padding: '9px 24px 9px 12px', cursor: 'pointer', outline: 'none',
  borderLeft: '3px solid var(--gc-bar-color)',
};

export function IntervalInChord({ desktop }: { desktop?: boolean } = {}) {
  const [root, setRoot] = useState('C');
  const [triad, setTriad] = useState('m');
  const [ext, setExt] = useState('');
  const [open, setOpen] = useState<number | null>(null);   // expanded row, by semitones
  const [shape, setShape] = useState(0);                   // highlighted placement
  const [wide, setWide] = useState(false);
  const [mode, setMode] = useState<Mode>('harmonic');

  const validExt = VALID_EXT[triad] ?? [''];
  const effExt = validExt.includes(ext) ? ext : '';
  const chordName = root + (SUFFIX[triad]?.[effExt] ?? '');

  const chord = useMemo(() => {
    const c = TonalChord.get(chordName);
    const pcs = new Set<number>();
    const spelling = new Map<number, string>();   // pc → theory-correct name (Eb, not D#)
    (c.notes ?? []).forEach(n => { const ch = Note.chroma(n); if (ch != null) { pcs.add(ch); if (!spelling.has(ch)) spelling.set(ch, n); } });
    return { pcs, spelling, notes: c.notes ?? [] };
  }, [chordName]);
  const chordPcs = chord.pcs;
  const spell = (m: number) => chord.spelling.get(((m % 12) + 12) % 12) ?? pcName(m);

  // The answer: one row per interval that occurs between two chord tones, with
  // every chord-tone pair that forms it. Unison and octave are left out — they
  // hold for any chord and say nothing about it.
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const iv of INTERVALS) {
      const pairs: string[] = [];
      for (const a of chordPcs) {
        if (chordPcs.has((a + iv.semis) % 12)) pairs.push(`${spell(a)}→${spell(a + iv.semis)}`);
      }
      if (pairs.length) out.push({ semis: iv.semis, name: iv.name, pairs });
    }
    return out;
  }, [chordPcs, chord]);   // eslint-disable-line react-hooks/exhaustive-deps

  const openRow = rows.find(r => r.semis === open) ?? null;
  const effSemis = openRow ? openRow.semis + (wide ? 12 : 0) : 0;

  // Every hand-playable placement of the open interval between two chord tones.
  const pairs = useMemo<Pair[]>(() => {
    if (!openRow) return [];
    const out: Pair[] = [];
    for (let s = 0; s < N_STR; s++) {
      for (let f = 0; f <= N_FRET; f++) {
        const loMidi = OPEN[s] + f;
        if (!chordPcs.has(loMidi % 12)) continue;
        const hiMidi = loMidi + effSemis;
        if (!chordPcs.has(hiMidi % 12)) continue;
        for (let s2 = 0; s2 < N_STR; s2++) {
          if (s2 === s) continue;                          // different strings (grabbable together)
          const f2 = hiMidi - OPEN[s2];
          if (f2 < 0 || f2 > N_FRET) continue;
          const openStr = f === 0 || f2 === 0;
          if (!openStr && Math.abs(f - f2) > MAX_STRETCH) continue;
          out.push({ lo: { string: s, fret: f }, hi: { string: s2, fret: f2 }, loMidi, hiMidi });
        }
      }
    }
    return out.sort((a, b) => a.loMidi - b.loMidi);
  }, [chordPcs, effSemis, openRow]);

  const idx = pairs.length ? Math.min(shape, pairs.length - 1) : 0;
  const current = pairs[idx] ?? null;
  const openName = openRow ? (wide ? widenName(openRow.name) : openRow.name) : '';

  const pickRow = (semis: number) => {
    setOpen(o => (o === semis ? null : semis));
    setShape(0); setWide(false);
  };
  const step = (d: number) => setShape(i => {
    const n = pairs.length;
    return n ? (((idx + d) % n) + n) % n : i;
  });
  const playCurrent = () => { if (current) playInterval(current.loMidi, current.hiMidi, mode); };
  const playRow = (r: Row) => {
    // Sound the row straight from the picker: the chord tones themselves.
    const a = [...chordPcs].find(pc => chordPcs.has((pc + r.semis) % 12));
    if (a == null) return;
    const lo = 48 + a;
    playInterval(lo, lo + r.semis, mode);
  };

  const chordCard = (
    <div style={{ ...card({ padding: desktop ? '16px 18px' : '14px' }), display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: desktop ? 20 : 12 }}>
      <p style={{ ...LBL, flexShrink: 0 }}>Chord</p>
      <div dir="ltr" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select value={root} onChange={e => setRoot(e.target.value)} style={SELECT}>
          {ROOTS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={triad} onChange={e => setTriad(e.target.value)} style={SELECT}>
          {TRIADS.map(q => <option key={q.key} value={q.key}>{q.display}</option>)}
        </select>
        <select value={effExt} onChange={e => setExt(e.target.value)} style={{ ...SELECT, fontWeight: 400, color: T.textDim }}>
          {EXTENSIONS.filter(e => validExt.includes(e.key)).map(e => <option key={e.key} value={e.key}>{e.display}</option>)}
        </select>
      </div>
      <div style={{ marginInlineStart: 'auto', display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={LBL}>Notes</span>
        <span dir="ltr" style={{ fontSize: 16, fontWeight: 700, color: T.text, letterSpacing: '0.06em' }}>
          {chord.notes.join(' · ')}
        </span>
      </div>
    </div>
  );

  const neck = current && openRow && (
    <div style={{ padding: desktop ? '0 18px 18px' : '0 12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ background: 'var(--gc-fretboard-bg)', border: `1px solid ${T.border}`, padding: '10px 10px 4px' }}>
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <IntervalNeck showOpenNotes>
            {/* Every other placement, dim — the spread across the neck at a glance */}
            {pairs.map((p, i) => i === idx ? null : (
              <g key={`d${i}`}>
                <circle cx={noteX(p.lo.fret)} cy={strY(p.lo.string)} r={5} fill={alpha(T.primary, 22)} />
                <circle cx={noteX(p.hi.fret)} cy={strY(p.hi.string)} r={5} fill={alpha(T.primary, 22)} />
              </g>
            ))}

            {/* The one in focus — the only line on the neck */}
            <line x1={noteX(current.lo.fret)} y1={strY(current.lo.string)}
              x2={noteX(current.hi.fret)} y2={strY(current.hi.string)}
              stroke="var(--gc-success)" strokeWidth={2} />
            <circle cx={noteX(current.lo.fret)} cy={strY(current.lo.string)} r={11} fill={T.primary} />
            <text x={noteX(current.lo.fret)} y={strY(current.lo.string) + 3.5} textAnchor="middle" fontSize={10} fontWeight="700" fill={T.white}>
              {spell(current.loMidi)}
            </text>
            <circle cx={noteX(current.hi.fret)} cy={strY(current.hi.string)} r={11} fill="var(--gc-success)" />
            <text x={noteX(current.hi.fret)} y={strY(current.hi.string) + 3.5} textAnchor="middle" fontSize={10} fontWeight="700" fill="#fff">
              {spell(current.hiMidi)}
            </text>
          </IntervalNeck>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'stretch', border: `1px solid ${T.border}` }}>
          <button onClick={() => step(-1)} style={stepBtn}>‹</button>
          <span style={{ padding: '7px 12px', fontSize: 10, color: '#9C958C', fontFamily: 'var(--gc-mono)', letterSpacing: '0.1em', alignSelf: 'center' }}>
            SHAPE {idx + 1} / {pairs.length}
          </span>
          <button onClick={() => step(1)} style={{ ...stepBtn, borderLeft: `1px solid ${T.border}`, borderRight: 'none' }}>›</button>
        </div>

        <div style={{ display: 'flex', border: `1px solid ${T.border}` }}>
          {(['harmonic', 'melodic'] as Mode[]).map((m, i) => (
            <button key={m} onClick={() => setMode(m)} style={{
              padding: '7px 12px', borderRadius: 0, cursor: 'pointer', fontSize: 11,
              fontWeight: mode === m ? 600 : 400, border: 'none',
              borderLeft: i > 0 ? `1px solid ${T.border}` : 'none',
              background: mode === m ? T.secondary : 'transparent',
              color: mode === m ? '#fff' : T.textDim,
            }}>{m === 'harmonic' ? 'Together' : 'One by one'}</button>
          ))}
        </div>

        <button onClick={() => setWide(w => { setShape(0); return !w; })} className="gc-notation" style={{
          padding: '7px 12px', borderRadius: 0, cursor: 'pointer', fontSize: 11,
          fontWeight: wide ? 600 : 400,
          border: wide ? 'none' : `1px solid ${T.border}`,
          background: wide ? T.secondary : 'transparent',
          color: wide ? '#fff' : T.textDim,
        }}>Octave wider — {widenName(openRow.name)}</button>

        <button onClick={playCurrent} style={{
          padding: '7px 16px', borderRadius: 0, cursor: 'pointer', fontSize: 11, fontWeight: 700,
          border: 'none', borderLeft: '3px solid var(--gc-bar-color)',
          background: T.primary, color: T.white,
        }}>▶ Play</button>

        <span dir="ltr" style={{ marginInlineStart: 'auto', fontSize: 11, color: '#9C958C' }}>
          {pcName(OPEN[current.lo.string])} string fret {current.lo.fret} · {pcName(OPEN[current.hi.string])} string fret {current.hi.fret}
        </span>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: desktop ? 900 : undefined, margin: desktop ? '0 auto' : undefined }}>
      {chordCard}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <p style={LBL}>Intervals in this chord</p>
          <span style={LBL}>{rows.length} found</span>
        </div>

        <div style={card({ padding: 0 })}>
          {rows.length === 0 ? (
            <p style={{ margin: 0, padding: 20, fontSize: 13, color: T.textMuted, textAlign: 'center' }}>
              {toDisplayChord(chordName)} has no two tones to compare.
            </p>
          ) : rows.map((r, i) => {
            const isOpen = open === r.semis;
            return (
              <div key={r.semis} style={{
                borderBottom: i < rows.length - 1 ? `1px solid ${T.border}` : 'none',
                borderLeft: isOpen ? '3px solid var(--gc-success)' : '3px solid transparent',
                background: isOpen ? alpha('var(--gc-success)', 7) : 'transparent',
              }}>
                <div
                  onClick={() => pickRow(r.semis)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: desktop ? 16 : 10,
                    padding: desktop ? '0 18px' : '0 12px', minHeight: 58, cursor: 'pointer',
                    flexWrap: desktop ? 'nowrap' : 'wrap',
                  }}
                >
                  <span style={{
                    fontSize: 14, fontWeight: 600, flexShrink: 0,
                    width: desktop ? 118 : undefined,
                    color: isOpen ? 'var(--gc-success)' : T.text,
                  }}>{isOpen ? openName : r.name}</span>

                  <span dir="ltr" style={{
                    flexGrow: 1, minWidth: 0, fontSize: 12, fontFamily: 'var(--gc-mono)',
                    color: isOpen ? 'var(--gc-success)' : '#9C958C',
                  }}>{r.pairs.join(', ')}</span>

                  <span style={{ fontSize: 11, color: '#9C958C', fontFamily: 'var(--gc-mono)', flexShrink: 0 }}>
                    {r.semis} semitone{r.semis === 1 ? '' : 's'}
                  </span>

                  <button
                    onClick={e => { e.stopPropagation(); playRow(r); }}
                    title="Hear it"
                    style={{
                      flexShrink: 0, width: 26, height: 26, padding: 0, borderRadius: 0,
                      border: 'none', background: 'transparent', cursor: 'pointer',
                      fontSize: 11, color: isOpen ? 'var(--gc-success)' : T.textDim,
                    }}
                  >▶</button>
                </div>

                {isOpen && (pairs.length ? neck : (
                  <p style={{ margin: 0, padding: '0 18px 16px', fontSize: 12, color: '#9C958C' }}>
                    No hand-playable shape for this one on the first 12 frets.
                  </p>
                ))}
              </div>
            );
          })}
        </div>

        {open == null && rows.length > 0 && (
          <p style={{ margin: 0, fontSize: 11, color: '#9C958C', lineHeight: 1.5 }}>
            Tap a row to see it on the neck.
          </p>
        )}
      </div>
    </div>
  );
}

const stepBtn: React.CSSProperties = {
  padding: '7px 12px', borderRadius: 0, cursor: 'pointer', fontSize: 13,
  border: 'none', background: 'transparent', color: 'var(--gc-text-dim)',
};
