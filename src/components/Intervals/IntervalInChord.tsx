import { useMemo, useState } from 'react';
import { Chord as TonalChord, Note } from '@tonaljs/tonal';
import { STANDARD_OPEN_MIDI, CHROMATIC } from '../../utils/musicTheory';
import { IntervalNeck, strY, noteX, FB_H, FB_TOP, STR_SP } from './IntervalNeck';
import { playInterval } from '../../utils/audioPlayback';
import { T } from '../../theme';
import { toDisplayChord } from '../../utils/chordName';
import { previewChordName } from '../../utils/previewSound';
import { Fold, Chips, ChordStage, PlayButton, icon } from '../ChordBuilder/Stage';
import { Sheet } from '../Workspace/Sheet';
import { useLang } from '../../contexts/LanguageContext';
import { heName, semisLabel, fretsLabel, Segment, legendDot } from './names';
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
  { display: 'Major', he: 'מז׳ור', key: 'M' }, { display: 'Minor', he: 'מינור', key: 'm' },
  { display: 'dim', he: 'מוקטן', key: 'dim' }, { display: 'aug', he: 'מוגדל', key: 'aug' },
  { display: 'sus2', he: 'sus2', key: 'sus2' }, { display: 'sus4', he: 'sus4', key: 'sus4' },
];
const EXTENSIONS = [
  { display: 'None', key: '' }, { display: '7', key: '7' }, { display: 'maj7', key: 'maj7' },
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
  const { lang } = useLang();
  const he = lang === 'he';
  const [chooserOpen, setChooserOpen] = useState(false);
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

  const ivName = (semis: number, en: string) => he ? heName(semis) : en;

  const chooser = (
    <Fold title={he ? 'בחירת אקורד' : 'Choose a chord'} open={chooserOpen} onToggle={() => setChooserOpen(o => !o)}
      summary={<bdi dir="ltr">{toDisplayChord(chordName)}</bdi>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Chips label={he ? 'תו שורש' : 'Root note'} cols={6} value={root}
          items={ROOTS.map(r => ({ id: r, label: r }))}
          onChange={r => { setRoot(r); setOpen(null); hearChord(r, triad, effExt); }} />
        <Chips label={he ? 'סוג' : 'Type'} value={triad}
          items={TRIADS.map(q => ({ id: q.key, label: he ? q.he : q.display }))}
          onChange={q => { setTriad(q); setOpen(null); hearChord(root, q, effExt); }} />
        <Chips label={he ? 'תוספת' : 'Extension'} value={effExt}
          items={EXTENSIONS.filter(e => validExt.includes(e.key)).map(e => ({ id: e.key, label: e.key === '' ? (he ? 'בלי' : 'None') : e.display }))}
          onChange={x => { setExt(x); setOpen(null); hearChord(root, triad, x); }} />
      </div>
    </Fold>
  );

  const stage = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
      <ChordStage name={chordName} empty="" desktop={desktop}
        line={<><bdi dir="ltr">{chord.notes.join(' · ')}</bdi> · {he ? `${rows.length} אינטרוולים בפנים` : `${rows.length} intervals inside`}</>} />
      <PlayButton onPlay={() => previewChordName(chordName)} label={he ? 'נגן את האקורד' : 'Play the chord'} />
    </div>
  );

  // The answer: one row per interval between two chord tones.
  const list = (
    <div style={{ borderRadius: 26, background: T.bgCard, padding: '16px 6px 6px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, padding: '0 14px 6px' }}>
        <span style={{ fontSize: 17, fontWeight: 700 }}>{he ? 'האינטרוולים באקורד' : 'Intervals in this chord'}</span>
        {rows.length > 0 && <span style={{ fontSize: 13, color: T.textMuted }}>{he ? 'הקישו לראות בצוואר' : 'Tap to see it on the neck'}</span>}
      </div>
      {rows.length === 0 ? (
        <p style={{ margin: 0, padding: 20, fontSize: 15, color: T.textMuted, textAlign: 'center' }}>
          {he ? 'אין כאן שני תווים להשוות.' : 'No two tones to compare here.'}
        </p>
      ) : rows.map(r => (
        <div key={r.semis} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={() => pickRow(r.semis)} className="gc-no-bar su-row"
            style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 12, minHeight: 60, padding: '6px 14px', borderRadius: 20, color: T.text, textAlign: 'start' }}>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 17, fontWeight: 600 }}>{ivName(r.semis, r.name)}</span>
              <span style={{ fontSize: 14, color: T.textMuted }}>
                <bdi dir="ltr">{r.pairs.join(',  ')}</bdi> · {semisLabel(r.semis, he)}
              </span>
            </span>
            <span style={{ color: T.textMuted, display: 'flex', flex: 'none' }}>{icon(<path d={he ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6'} />, 18)}</span>
          </button>
          <button onClick={() => playRow(r)} className="gc-no-bar" aria-label={`${he ? 'השמעת' : 'Hear'} ${ivName(r.semis, r.name)}`}
            style={{ width: 44, height: 44, borderRadius: 22, background: 'rgba(255,255,255,0.10)', color: T.text, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', marginInlineEnd: 8 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden><path d="M7 4.5v15l13-7.5z" fill="currentColor" /></svg>
          </button>
        </div>
      ))}
    </div>
  );

  const bracket = current && current.lo.fret !== current.hi.fret
    ? { xL: noteX(Math.min(current.lo.fret, current.hi.fret)), xR: noteX(Math.max(current.lo.fret, current.hi.fret)), frets: Math.abs(current.lo.fret - current.hi.fret) }
    : null;
  const arrow = (d: number, label: string) => (
    <button onClick={() => step(d)} disabled={pairs.length < 2} aria-label={label} className="gc-no-bar"
      style={{ width: 50, height: 50, borderRadius: 25, background: 'rgba(255,255,255,0.10)', color: T.text, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: pairs.length < 2 ? 0.3 : 1 }}>
      {icon(<path d={d < 0 ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6'} />, 20)}
    </button>
  );

  // One interval on the neck: every placement dim, one in focus, steppable.
  const sheet = openRow && (
    <Sheet onClose={() => setOpen(null)} maxWidth={560}
      kicker={<bdi dir="ltr">{toDisplayChord(chordName)}</bdi>}
      title={<span style={{ fontSize: 34 }}>{he ? heName(effSemis) : openName}</span>}>
      {current ? (
        <>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
            {legendDot(T.primary, <><bdi dir="ltr">{spell(current.loMidi)}</bdi> · {he ? 'התו הנמוך' : 'lower'}</>)}
            {legendDot(T.secondary, <><bdi dir="ltr">{spell(current.hiMidi)}</bdi> · {he ? 'התו הגבוה' : 'upper'}</>)}
          </div>
          <div dir="ltr" style={{ borderRadius: 22, background: 'rgba(255,255,255,0.06)', padding: '12px 10px', overflowX: 'auto' }}>
            <IntervalNeck showOpenNotes height={FB_H + 40} minWidth={420}>
              {pairs.map((p, i) => i === idx ? null : (
                <g key={`d${i}`} opacity={0.35}>
                  <circle cx={noteX(p.lo.fret)} cy={strY(p.lo.string)} r={5} fill={T.textMuted} />
                  <circle cx={noteX(p.hi.fret)} cy={strY(p.hi.string)} r={5} fill={T.textMuted} />
                </g>
              ))}
              <line x1={noteX(current.lo.fret)} y1={strY(current.lo.string)} x2={noteX(current.hi.fret)} y2={strY(current.hi.string)}
                stroke={T.text} strokeWidth={2} strokeLinecap="round" />
              <circle cx={noteX(current.lo.fret)} cy={strY(current.lo.string)} r={11} fill={T.primary} />
              <text x={noteX(current.lo.fret)} y={strY(current.lo.string) + 3.5} textAnchor="middle" fontSize={10} fontWeight="700" fill={T.onPrimary}>{spell(current.loMidi)}</text>
              <circle cx={noteX(current.hi.fret)} cy={strY(current.hi.string)} r={11} fill={T.secondary} />
              <text x={noteX(current.hi.fret)} y={strY(current.hi.string) + 3.5} textAnchor="middle" fontSize={10} fontWeight="700" fill={T.white}>{spell(current.hiMidi)}</text>
              {bracket && (() => {
                const bY = FB_TOP + 5 * STR_SP + 18;
                return (
                  <g>
                    <path d={`M${bracket.xL} ${bY} V${bY + 7} H${bracket.xR} V${bY}`} fill="none" stroke={T.text} strokeWidth={2} strokeLinejoin="round" />
                    <text x={(bracket.xL + bracket.xR) / 2} y={bY + 21} textAnchor="middle" fontSize={11} fontWeight="600" fill={T.text}
                      style={{ direction: he ? 'rtl' : 'ltr', unicodeBidi: 'plaintext' }}>{fretsLabel(bracket.frets, he)}</text>
                  </g>
                );
              })()}
            </IntervalNeck>
          </div>
          <div dir="ltr" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            {arrow(-1, he ? 'המיקום הקודם' : 'Previous place')}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, textAlign: 'center' }}>
              <span style={{ fontSize: 15, fontWeight: 600 }} dir={he ? 'rtl' : 'ltr'}>
                {he ? `מיקום ${idx + 1} מתוך ${pairs.length}` : `Place ${idx + 1} of ${pairs.length}`}
              </span>
              <span style={{ fontSize: 13, color: T.textMuted }} dir={he ? 'rtl' : 'ltr'}>
                {he
                  ? <>מיתר <bdi dir="ltr">{pcName(OPEN[current.lo.string])}</bdi> סריג {current.lo.fret} · מיתר <bdi dir="ltr">{pcName(OPEN[current.hi.string])}</bdi> סריג {current.hi.fret}</>
                  : `${pcName(OPEN[current.lo.string])} string fret ${current.lo.fret} · ${pcName(OPEN[current.hi.string])} string fret ${current.hi.fret}`}
              </span>
            </div>
            {arrow(1, he ? 'המיקום הבא' : 'Next place')}
          </div>
        </>
      ) : (
        <p style={{ margin: 0, fontSize: 15, color: T.textMuted, textAlign: 'center' }}>
          {he ? 'אין לזה אחיזה נוחה ב-12 הסריגים הראשונים.' : 'No hand-playable shape for this one on the first 12 frets.'}
        </p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' }}>
          <PlayButton onPlay={playCurrent} disabled={!current} label={he ? 'נגן' : 'Play'} />
          <Segment label={he ? 'איך לנגן' : 'How to play'} value={mode} onChange={setMode}
            items={[{ id: 'harmonic', label: he ? 'ביחד' : 'Together' }, { id: 'melodic', label: he ? 'אחד אחרי השני' : 'One by one' }]} />
        </div>
        <button onClick={() => setWide(w => { setShape(0); return !w; })} aria-pressed={wide} className="gc-no-bar"
          style={{ height: 40, padding: '0 16px', borderRadius: 20, fontSize: 15, fontWeight: 600,
            background: wide ? T.text : 'rgba(255,255,255,0.08)', color: wide ? '#000' : T.text }}>
          {he ? 'רחב יותר באוקטבה' : 'An octave wider'}
        </button>
      </div>
    </Sheet>
  );

  return (
    <div className="su-in" style={{ display: 'flex', flexDirection: 'column', gap: desktop ? 24 : 22, maxWidth: desktop ? 900 : undefined, margin: '0 auto', width: '100%' }}>
      {chooser}
      {stage}
      {list}
      {sheet}
    </div>
  );
}
