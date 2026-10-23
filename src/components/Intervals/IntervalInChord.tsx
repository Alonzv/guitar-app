import { useMemo, useState } from 'react';
import { Chord as TonalChord, Note } from '@tonaljs/tonal';
import { STANDARD_OPEN_MIDI, CHROMATIC } from '../../utils/musicTheory';
import { IntervalNeck, strY, noteX, FB_H, FB_TOP, STR_SP } from './IntervalNeck';
import { playInterval } from '../../utils/audioPlayback';
import { T } from '../../theme';
import { Rule, Pill, PillRow, Cta, PosterTitle } from '../Transit/parts';
import { toDisplayChord } from '../../utils/chordName';
import { previewChordName } from '../../utils/previewSound';
import { useOptionalSong } from '../../song/SongContext';

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

// A raised field: card paper with a 2px ink frame.
const SELECT: React.CSSProperties = {
  appearance: 'none', WebkitAppearance: 'none',
  background: T.bgCard, border: `2px solid ${T.text}`, borderRadius: 0,
  color: T.text, fontFamily: 'inherit', fontSize: 14, fontWeight: 700,
  minHeight: 44, padding: '0 28px 0 12px', cursor: 'pointer',
  };

// "Ebmaj7" → { root: 'D#', triad: 'M', ext: 'maj7' } in this tool's own terms,
// or null when the chord is something its pickers can't show.
function splitChordName(name: string): { root: string; triad: string; ext: string } | null {
  const m = name.match(/^([A-G][b#]?)(.*)$/);
  if (!m) return null;
  const pc = Note.chroma(m[1]);
  if (pc == null) return null;
  const root = ROOTS.find(r => Note.chroma(r) === pc) ?? m[1];
  const sfx = m[2] === 'M' ? '' : m[2];
  for (const t of Object.keys(SUFFIX)) {
    for (const [ext, full] of Object.entries(SUFFIX[t])) {
      if (full === sfx || (t === 'M' && ext === '' && sfx === '')) return { root, triad: t, ext };
    }
  }
  return null;
}

export function IntervalInChord({ desktop }: { desktop?: boolean } = {}) {
  const [root, setRoot] = useState('C');
  const [triad, setTriad] = useState('m');
  const [ext, setExt] = useState('');
  const [open, setOpen] = useState<number | null>(null);   // expanded row, by semitones

  // Opens on the chord tapped in the song dock and follows it.
  const picked = useOptionalSong()?.selectedChord?.chord.name ?? '';
  const [seenPick, setSeenPick] = useState('');
  if (picked !== seenPick) {
    setSeenPick(picked);
    const parts = picked ? splitChordName(picked) : null;
    if (parts) { setRoot(parts.root); setTriad(parts.triad); setExt(parts.ext); setOpen(null); }
  }
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
  // A new chord is heard as soon as it is picked.
  const hearChord = (r: string, t: string, x: string) => {
    const ok = (VALID_EXT[t] ?? ['']).includes(x) ? x : '';
    previewChordName(r + (SUFFIX[t]?.[ok] ?? ''));
  };
  const playCurrent = () => { if (current) playInterval(current.loMidi, current.hiMidi, mode); };
  const playRow = (r: Row) => {
    // Sound the row straight from the picker: the chord tones themselves.
    const a = [...chordPcs].find(pc => chordPcs.has((pc + r.semis) % 12));
    if (a == null) return;
    const lo = 48 + a;
    playInterval(lo, lo + r.semis, mode);
  };

  const chordCard = (
    <Rule label="Chord" right={<span className="su-label">{rows.length} intervals</span>}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: desktop ? 24 : 12 }}>
        <PosterTitle head={toDisplayChord(chordName)} keepCase max={desktop ? 120 : 88} min={40} style={{ flex: '1 1 160px' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: '0 1 auto' }}>
          <div dir="ltr" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select aria-label="Root" value={root} onChange={e => { setRoot(e.target.value); hearChord(e.target.value, triad, effExt); }} style={SELECT}>
              {ROOTS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <select aria-label="Triad" value={triad} onChange={e => { setTriad(e.target.value); hearChord(root, e.target.value, ''); }} style={SELECT}>
              {TRIADS.map(q => <option key={q.key} value={q.key}>{q.display}</option>)}
            </select>
            <select aria-label="Extension" value={effExt} onChange={e => { setExt(e.target.value); hearChord(root, triad, e.target.value); }} style={{ ...SELECT, fontWeight: 400 }}>
              {EXTENSIONS.filter(e => validExt.includes(e.key)).map(e => <option key={e.key} value={e.key}>{e.display}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span className="su-label">Notes</span>
            <span dir="ltr" style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--gc-mono)', letterSpacing: '0.06em' }}>
              {chord.notes.join(' · ')}
            </span>
          </div>
        </div>
      </div>
    </Rule>
  );

  const bracket = current && current.lo.fret !== current.hi.fret
    ? { xL: noteX(Math.min(current.lo.fret, current.hi.fret)), xR: noteX(Math.max(current.lo.fret, current.hi.fret)), frets: Math.abs(current.lo.fret - current.hi.fret) }
    : null;
  const neck = current && openRow && (
    <div style={{ padding: '4px 0 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <IntervalNeck showOpenNotes height={FB_H + 40}>
          {/* Every other placement, dim — the spread across the neck at a glance */}
          {pairs.map((p, i) => i === idx ? null : (
            <g key={`d${i}`} opacity={0.35}>
              <circle cx={noteX(p.lo.fret)} cy={strY(p.lo.string)} r={5} fill={T.textMuted} />
              <circle cx={noteX(p.hi.fret)} cy={strY(p.hi.string)} r={5} fill={T.textMuted} />
            </g>
          ))}

          {/* The one in focus — the only line on the neck */}
          <line x1={noteX(current.lo.fret)} y1={strY(current.lo.string)}
            x2={noteX(current.hi.fret)} y2={strY(current.hi.string)}
            stroke={T.text} strokeWidth={2} />
          <circle cx={noteX(current.lo.fret)} cy={strY(current.lo.string)} r={11} fill={T.primary} />
          <text x={noteX(current.lo.fret)} y={strY(current.lo.string) + 3.5} textAnchor="middle" fontSize={10} fontWeight="700" fill={T.onPrimary} fontFamily="var(--gc-mono)">
            {spell(current.loMidi)}
          </text>
          <circle cx={noteX(current.hi.fret)} cy={strY(current.hi.string)} r={11} fill={T.secondary} />
          <text x={noteX(current.hi.fret)} y={strY(current.hi.string) + 3.5} textAnchor="middle" fontSize={10} fontWeight="700" fill={T.white} fontFamily="var(--gc-mono)">
            {spell(current.hiMidi)}
          </text>

          {/* The distance: a 2px ink bracket under the neck, labelled in mono */}
          {bracket && (() => {
            const bY = FB_TOP + 5 * STR_SP + 18;
            return (
              <g>
                <path d={`M${bracket.xL} ${bY} V${bY + 7} H${bracket.xR} V${bY}`} fill="none" stroke={T.text} strokeWidth={2} />
                <text x={(bracket.xL + bracket.xR) / 2} y={bY + 19} textAnchor="middle" fontSize={8.5} fill={T.text}
                  fontFamily="var(--gc-mono)" letterSpacing="0.14em">
                  {`${openName.toUpperCase()} · ${bracket.frets} FRET${bracket.frets !== 1 ? 'S' : ''}`}
                </text>
              </g>
            );
          })()}
        </IntervalNeck>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div role="group" aria-label="Shape" dir="ltr" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Pill size="sm" onClick={() => step(-1)} label="Previous shape" style={{ padding: 0 }}>‹</Pill>
          <span className="su-label" style={{ color: T.text, minWidth: 74, textAlign: 'center' }}>Shape {idx + 1} / {pairs.length}</span>
          <Pill size="sm" onClick={() => step(1)} label="Next shape" style={{ padding: 0 }}>›</Pill>
        </div>
        <PillRow label="Play mode" items={[{ id: 'harmonic' as Mode, label: 'Together' }, { id: 'melodic' as Mode, label: 'One by one' }]}
          value={mode} onChange={setMode} />
        <Pill size="sm" active={wide} onClick={() => setWide(w => { setShape(0); return !w; })} style={{ textTransform: 'none', letterSpacing: '0.02em' }}>
          Octave wider — {widenName(openRow.name)}
        </Pill>
        <Cta onClick={playCurrent}>▶ Play</Cta>
        <span dir="ltr" className="su-label" style={{ marginInlineStart: 'auto' }}>
          {pcName(OPEN[current.lo.string])} string fret {current.lo.fret} · {pcName(OPEN[current.hi.string])} string fret {current.hi.fret}
        </span>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: desktop ? 960 : undefined }}>
      {chordCard}

      <Rule label="Intervals in this chord" right={open == null && rows.length > 0 ? <span className="su-label">Tap a row to see it on the neck</span> : undefined}>
        {rows.length === 0 ? (
          <p style={{ margin: 0, padding: 20, fontSize: 13, color: T.textMuted, textAlign: 'center' }}>
            {toDisplayChord(chordName)} has no two tones to compare.
          </p>
        ) : rows.map(r => {
          const isOpen = open === r.semis;
          return (
            <div key={r.semis} style={{ borderBottom: `1px solid ${T.hairline}` }}>
              <div
                role="button" tabIndex={0} aria-expanded={isOpen}
                onClick={() => pickRow(r.semis)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickRow(r.semis); } }}
                style={{
                  display: 'flex', alignItems: 'center', gap: desktop ? 16 : 10,
                  minHeight: 58, cursor: 'pointer', flexWrap: desktop ? 'nowrap' : 'wrap', padding: '6px 0',
                }}
              >
                <span className="su-semi" style={{
                  fontSize: isOpen ? 24 : 19, flexShrink: 0, textTransform: 'uppercase', lineHeight: 1,
                  width: desktop ? 170 : undefined,
                }}>{isOpen ? openName : r.name}</span>

                <span dir="ltr" style={{
                  flexGrow: 1, minWidth: 0, fontSize: 12, fontFamily: 'var(--gc-mono)',
                  color: isOpen ? T.text : T.textMuted, fontWeight: isOpen ? 700 : 400,
                }}>{r.pairs.join(', ')}</span>

                <span style={{ fontSize: 11, color: T.textMuted, fontFamily: 'var(--gc-mono)', flexShrink: 0 }}>
                  {r.semis} semitone{r.semis === 1 ? '' : 's'}
                </span>

                <span onClick={e => e.stopPropagation()} style={{ flexShrink: 0 }}>
                  <Pill active={isOpen} onClick={() => playRow(r)} label={`Hear ${r.name}`} title="Hear it" style={{ padding: 0 }}>▶</Pill>
                </span>
              </div>

              {isOpen && (pairs.length ? neck : (
                <p className="su-label" style={{ margin: 0, padding: '0 0 16px' }}>
                  No hand-playable shape for this one on the first 12 frets.
                </p>
              ))}
            </div>
          );
        })}
      </Rule>
    </div>
  );
}
