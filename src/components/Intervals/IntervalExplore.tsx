import { useState, useMemo } from 'react';
import { CHROMATIC, STANDARD_OPEN_MIDI, ALL_NOTES } from '../../utils/musicTheory';
import { IntervalNeck, strY, noteX, DOT_R, FB_H, FB_TOP, STR_SP } from './IntervalNeck';
import { playScale, playInterval, playMidi } from '../../utils/audioPlayback';
import { T } from '../../theme';
import { Fold, Chips, PlayButton, icon } from '../ChordBuilder/Stage';
import { StopActions } from '../Transit/StopActions';
import { useLang } from '../../contexts/LanguageContext';
import { previewInterval } from '../../utils/previewSound';
import { pickOne } from '../../utils/random';
import { INTERVAL_NAMES, CONS_LABEL, semisLabel, fretsLabel, Segment, IntervalStage, legendDot } from './names';

const OPEN_MIDI = STANDARD_OPEN_MIDI;

type Area = 'full' | '1-4' | '5-8' | '9-12';
const AREAS: { id: Area; en: string; he: string; range: [number, number] }[] = [
  { id: 'full', en: 'All',  he: 'הכול', range: [0, 12] },
  { id: '1-4',  en: '1–4',  he: '1–4',  range: [1, 4]  },
  { id: '5-8',  en: '5–8',  he: '5–8',  range: [5, 8]  },
  { id: '9-12', en: '9–12', he: '9–12', range: [9, 12] },
];

// Songs whose opening notes make the interval — the first two notes are it.
const HINTS: { semis: number; song: string; motif: number[] }[] = [
  { semis: 3, song: 'Smoke on the Water',             motif: [55, 58, 60, 55, 58, 61, 60] },
  { semis: 4, song: 'When the Saints Go Marching In', motif: [60, 64, 65, 67] },
  { semis: 5, song: 'Here Comes the Bride',           motif: [60, 65, 65, 65] },
  { semis: 6, song: 'The Simpsons',                   motif: [60, 64, 66, 69] },
  { semis: 7, song: 'Star Wars',                      motif: [60, 67, 65, 64, 62, 72, 67] },
  { semis: 9, song: 'My Bonnie Lies Over the Ocean',  motif: [60, 69, 67, 65, 67, 65, 62] },
];

let motifTimers: ReturnType<typeof setTimeout>[] = [];
function playMotif(midis: number[]) {
  motifTimers.forEach(clearTimeout);
  motifTimers = midis.map((m, i) => setTimeout(() => playMidi(m, i === 0 ? 0.5 : 0.4), i * 330));
}

const BRACKET_EXTRA = 40;

function getPositions(note: string, fretRange: [number, number]) {
  const pc = CHROMATIC.indexOf(note);
  if (pc === -1) return [];
  const res: { string: number; fret: number }[] = [];
  for (let s = 0; s < 6; s++) {
    for (let f = fretRange[0]; f <= fretRange[1]; f++) {
      if ((OPEN_MIDI[s] + f) % 12 === pc) res.push({ string: s, fret: f });
    }
  }
  return res;
}

export function IntervalExplore({ desktop }: { desktop?: boolean }) {
  const { lang } = useLang();
  const he = lang === 'he';
  const [root,     setRoot]     = useState('E');
  // Opens on a major third so the neck shows something from the first look.
  const [interval, setInterval] = useState(4);
  const [area,     setArea]     = useState<Area>('full');
  const [mode,     setMode]     = useState<'melodic' | 'harmonic'>('melodic');
  const [open,     setOpen]     = useState(false);
  const [tableOpen, setTableOpen] = useState(false);

  const iv = INTERVAL_NAMES[interval];
  const fretRange = AREAS.find(a => a.id === area)!.range;
  const rootMidi  = 60 + CHROMATIC.indexOf(root);
  const intervalNote = CHROMATIC[(CHROMATIC.indexOf(root) + interval) % 12];

  // Every pick is heard: the root and its interval.
  const hear = (r: string, semis: number) => {
    const m = 60 + CHROMATIC.indexOf(r);
    previewInterval(m, m + semis, mode);
  };
  const pick = (semis: number) => { setInterval(semis); hear(root, semis); };

  const roll = () => {
    const r = pickOne(ALL_NOTES);
    const s = pickOne(INTERVAL_NAMES).semitones;
    setRoot(r); setInterval(s); hear(r, s);
  };

  const handlePlay = () => {
    if (mode === 'melodic') playScale([rootMidi, rootMidi + interval]);
    else playInterval(rootMidi, rootMidi + interval, 'harmonic');
  };

  const rootDots     = useMemo(() => getPositions(root, fretRange), [root, fretRange]);
  const intervalDots = useMemo(() => getPositions(intervalNote, fretRange), [intervalNote, fretRange]);

  const pairs = useMemo(() => {
    const res: { string: number; rootFret: number; intFret: number }[] = [];
    rootDots.forEach(r => intervalDots.forEach(p => {
      if (p.string === r.string && r.fret !== p.fret) res.push({ string: r.string, rootFret: r.fret, intFret: p.fret });
    }));
    return res;
  }, [rootDots, intervalDots]);

  const bracketPair = pairs[0] ?? null;
  const svgH = FB_H + (bracketPair ? BRACKET_EXTRA : 8);
  const ROOT = { fill: T.primary, ink: T.onPrimary }, IV = { fill: T.secondary, ink: T.white };

  const toolbar = (
    <StopActions>
      <button onClick={roll} className="lg lg-circle gc-no-bar" aria-label={he ? 'אינטרוול אקראי' : 'Random interval'} style={{ color: T.text }}>
        {icon(<><rect x="4" y="4" width="16" height="16" rx="4" /><circle cx="9" cy="9" r="0.6" fill="currentColor" /><circle cx="15" cy="15" r="0.6" fill="currentColor" /><circle cx="15" cy="9" r="0.6" fill="currentColor" /><circle cx="9" cy="15" r="0.6" fill="currentColor" /></>)}
      </button>
    </StopActions>
  );

  const chooser = (
    <Fold title={he ? 'בחירת אינטרוול' : 'Choose an interval'} open={open} onToggle={() => setOpen(o => !o)}
      summary={<><bdi dir="ltr">{root}</bdi> · {he ? iv.he : iv.en}</>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Chips label={he ? 'אינטרוול' : 'Interval'} cols={7} value={String(interval)}
          items={INTERVAL_NAMES.map(n => ({ id: String(n.semitones), label: n.abbrev }))}
          onChange={v => pick(Number(v))} />
        <Chips label={he ? 'מאיזה תו' : 'From which note'} cols={6} value={root}
          items={ALL_NOTES.map(n => ({ id: n, label: n }))}
          onChange={n => { setRoot(n); hear(n, interval); }} />
      </div>
    </Fold>
  );

  const stage = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
      <IntervalStage desktop={desktop} abbrev={iv.abbrev} name={he ? iv.he : iv.en}
        kicker={<><bdi dir="ltr">{root} → {intervalNote}</bdi></>}
        line={<>{semisLabel(interval, he)} · {CONS_LABEL[iv.cons][lang]}</>} />
      <p style={{ margin: 0, fontSize: 17, lineHeight: 1.45, textAlign: 'center', maxWidth: 420 }}>{he ? iv.feelHe : iv.feelEn}</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' }}>
        <PlayButton onPlay={handlePlay} label={he ? 'נגן' : 'Play'} />
        <Segment label={he ? 'איך לנגן' : 'How to play'} value={mode} onChange={setMode}
          items={[{ id: 'melodic', label: he ? 'אחד אחרי השני' : 'One by one' }, { id: 'harmonic', label: he ? 'ביחד' : 'Together' }]} />
      </div>
    </div>
  );

  const neck = (
    <div style={{ borderRadius: 26, background: T.bgCard, padding: desktop ? '18px 20px' : '16px 14px', display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 17, fontWeight: 700 }}>{he ? 'על הצוואר' : 'On the neck'}</span>
        <Segment label={he ? 'אזור' : 'Area'} value={area} onChange={setArea}
          items={AREAS.map(a => ({ id: a.id, label: he ? a.he : a.en }))} />
      </div>
      <div style={{ display: 'flex', gap: 16 }}>
        {legendDot(ROOT.fill, <><bdi dir="ltr">{root}</bdi> · {he ? 'התו הראשון' : 'first note'}</>)}
        {legendDot(IV.fill, <><bdi dir="ltr">{intervalNote}</bdi> · {he ? iv.he : iv.en}</>)}
      </div>
      <div dir="ltr" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <IntervalNeck height={svgH} minWidth={520}>
          {pairs.map((p, i) => (
            <line key={`conn-${i}`} x1={noteX(p.rootFret)} y1={strY(p.string)} x2={noteX(p.intFret)} y2={strY(p.string)}
              stroke={T.text} strokeWidth={1.5} strokeDasharray="5 3" opacity={0.5} />
          ))}
          {intervalDots.map((p, i) => (
            <g key={`iv-${i}`}>
              <circle cx={noteX(p.fret)} cy={strY(p.string)} r={DOT_R} fill={IV.fill} />
              <text x={noteX(p.fret)} y={strY(p.string)} dominantBaseline="central" textAnchor="middle" fontSize={10} fill={IV.ink} fontWeight="700">{intervalNote}</text>
            </g>
          ))}
          {rootDots.map((p, i) => (
            <g key={`r-${i}`}>
              <circle cx={noteX(p.fret)} cy={strY(p.string)} r={DOT_R} fill={ROOT.fill} />
              <text x={noteX(p.fret)} y={strY(p.string)} dominantBaseline="central" textAnchor="middle" fontSize={10} fill={ROOT.ink} fontWeight="700">{root}</text>
            </g>
          ))}
          {/* The distance on one string: a bracket under the neck */}
          {bracketPair && (() => {
            const xL = Math.min(noteX(bracketPair.rootFret), noteX(bracketPair.intFret));
            const xR = Math.max(noteX(bracketPair.rootFret), noteX(bracketPair.intFret));
            const bY = FB_TOP + 5 * STR_SP + 18;
            return (
              <g>
                <path d={`M${xL} ${bY} V${bY + 7} H${xR} V${bY}`} fill="none" stroke={T.text} strokeWidth={2} strokeLinejoin="round" />
                <text x={(xL + xR) / 2} y={bY + 21} textAnchor="middle" fontSize={11} fontWeight="600" fill={T.text}
                  style={{ direction: he ? 'rtl' : 'ltr', unicodeBidi: 'plaintext' }}>
                  {fretsLabel(Math.abs(bracketPair.intFret - bracketPair.rootFret), he)}
                </text>
              </g>
            );
          })()}
        </IntervalNeck>
      </div>
    </div>
  );

  // Songs that open with an interval: the fastest way to hear one in your head.
  const songs = (
    <div style={{ borderRadius: 26, background: T.bgCard, padding: '16px 6px 6px', display: 'flex', flexDirection: 'column' }}>
      <span style={{ fontSize: 17, fontWeight: 700, padding: '0 14px 6px' }}>{he ? 'שירים שעוזרים לזכור' : 'Songs that help you remember'}</span>
      {HINTS.map(h => {
        const n = INTERVAL_NAMES[h.semis];
        return (
          <button key={h.semis} onClick={() => { playMotif(h.motif); setInterval(h.semis); }} className="gc-no-bar su-row"
            aria-label={`${he ? n.he : n.en}: ${h.song}`}
            style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 56, padding: '6px 14px', borderRadius: 20, color: T.text, textAlign: 'start' }}>
            <span className="gc-notation" dir="ltr" style={{ width: 34, fontSize: 15, fontWeight: 700, flex: 'none' }}>{n.abbrev}</span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 16, fontWeight: 600 }}>{he ? n.he : n.en}</span>
              <span style={{ fontSize: 14, color: T.textMuted }}><bdi dir="ltr">{h.song}</bdi></span>
            </span>
            <span aria-hidden style={{ width: 36, height: 36, borderRadius: 18, background: 'rgba(255,255,255,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
              <svg width="12" height="12" viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z" fill="currentColor" /></svg>
            </span>
          </button>
        );
      })}
    </div>
  );

  // All thirteen at a glance; a row picks that interval.
  const table = (
    <Fold title={he ? 'כל האינטרוולים' : 'All the intervals'} open={tableOpen} onToggle={() => setTableOpen(o => !o)}
      summary={he ? '13 מרחקים, מאוניסון עד אוקטבה' : '13 distances, unison to octave'}>
      <div style={{ display: 'flex', flexDirection: 'column', margin: '0 -12px' }}>
        {INTERVAL_NAMES.map(n => {
          const on = n.semitones === interval;
          return (
            <button key={n.semitones} onClick={() => pick(n.semitones)} className="gc-no-bar su-row" aria-pressed={on}
              style={{ display: 'grid', gridTemplateColumns: '38px minmax(0, 1fr) auto', alignItems: 'center', gap: 10, minHeight: 52, padding: '6px 12px', borderRadius: 18,
                background: on ? 'rgba(255,255,255,0.08)' : 'transparent', color: T.text, textAlign: 'start' }}>
              <span className="gc-notation" dir="ltr" style={{ fontSize: 15, fontWeight: 700 }}>{n.abbrev}</span>
              <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span style={{ fontSize: 16, fontWeight: 600 }}>{he ? n.he : n.en}</span>
                <span style={{ fontSize: 13, color: T.textMuted }}>{he ? n.feelHe : n.feelEn}</span>
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, color: T.textMuted, whiteSpace: 'nowrap' }}>{CONS_LABEL[n.cons][lang]}</span>
            </button>
          );
        })}
      </div>
    </Fold>
  );

  return (
    <div className="su-in" style={{ display: 'flex', flexDirection: 'column', gap: desktop ? 24 : 22, maxWidth: desktop ? 900 : undefined, margin: '0 auto', width: '100%' }}>
      {toolbar}
      {chooser}
      {stage}
      {neck}
      {songs}
      {table}
    </div>
  );
}
