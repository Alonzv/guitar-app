import { STANDARD_OPEN_MIDI, CHROMATIC } from '../../utils/musicTheory';
import { playMidi, unlockAudio } from '../../utils/audioPlayback';
import { useSounding } from '../../motion/useSounding';
import { useLang } from '../../contexts/LanguageContext';
import { Dot } from './Dot';
import { T } from '../../theme';

// ── The neck ─────────────────────────────────────────────────────────────────
// One fretboard for every tool. Transparent board, ink strings that thicken
// toward the low E, ink frets and a 7px nut. Each dot carries its degree
// (1, ♭3, 5…): the root is the one cobalt thing on the neck, other tones are
// ink, open strings are outlined, and 'faded' tones drop to 12% (the degree
// legend's isolate filter). Every dot is a button that plays its note.
//
// Horizontal: high e on top, frets left to right (desktop, and any tool
// that wants a wide neck). Vertical: low E on the left, frets running down
// from the nut (the phone's Scales view).

export type NeckKind = 'root' | 'tone' | 'faded' | 'ghost';

export interface NeckDot {
  string: number;   // 0 = low E
  fret: number;
  label?: string;
  kind?: NeckKind;
  /** Follows the note across changes so the dot slides instead of blinking. */
  id?: string;
  /** Ringed: a note to aim for. */
  target?: boolean;
}

interface Props {
  dots: NeckDot[];
  /** First and last fret shown (default 0–15). */
  from?: number;
  to?: number;
  vertical?: boolean;
  /** Open-string MIDI notes, low E first (the song's tuning). */
  openMidi?: readonly number[];
  /** Capo fret: sounding pitch is raised by it. */
  capo?: number;
  /** Called after the dot's note plays. */
  onDot?: (dot: NeckDot) => void;
  /** Turn off the built-in sound (the caller plays something else). */
  silent?: boolean;
  /** A 2px ink bracket under the neck, from one fret to another, labelled. */
  bracket?: { from: number; to: number; label: string };
  /** Accessible name for the whole neck. */
  label?: string;
  maxHeight?: number;
}

const FRET_MARKS = [3, 5, 7, 9, 12, 15, 17, 19, 21];

export function Neck({
  dots, from = 0, to = 15, vertical, openMidi = STANDARD_OPEN_MIDI, capo = 0,
  onDot, silent, bracket, label, maxHeight,
}: Props) {
  const sounding = useSounding();
  const { lang } = useLang();
  const strings = openMidi.length;
  const frets = to - from;                 // fret spaces drawn
  const open = from === 0;                 // a nut and an open-string column
  const SP_STR = 26;                       // string spacing
  const SP_FRET = vertical ? 46 : 50;
  const OPEN = open ? 34 : 14;             // room before the first fret line
  const PAD = 18;
  const R = 11;
  const along = OPEN + frets * SP_FRET;    // neck length
  const across = (strings - 1) * SP_STR;
  const W = vertical ? across + PAD * 2 + 20 : along + PAD + 28;
  const H = vertical ? along + PAD + 28 : across + PAD * 2 + 20 + (bracket ? 30 : 0);

  // Positions along the neck (a) and across it (c).
  const fretLine = (f: number) => OPEN + (f - from) * SP_FRET;     // line after fret f
  const fretMid = (f: number) => f === 0 ? OPEN / 2 - 2 : fretLine(f) - SP_FRET / 2;
  const strC = (s: number) => vertical ? s * SP_STR : (strings - 1 - s) * SP_STR;   // high e on top
  const x0 = vertical ? PAD + 10 : 22;
  const y0 = vertical ? 22 : PAD;
  const xy = (a: number, c: number) => vertical ? { x: x0 + c, y: y0 + a } : { x: x0 + a, y: y0 + c };
  const line = (a1: number, c1: number, a2: number, c2: number) => {
    const p = xy(a1, c1), q = xy(a2, c2);
    return { x1: p.x, y1: p.y, x2: q.x, y2: q.y };
  };

  const strW = (s: number) => 2.6 - s * 0.32;    // low E thickest
  const midiOf = (d: NeckDot) => openMidi[d.string] + d.fret + capo;
  const noteName = (d: NeckDot) => CHROMATIC[midiOf(d) % 12];

  const press = (d: NeckDot) => {
    if (!silent) unlockAudio().then(() => playMidi(midiOf(d)));
    onDot?.(d);
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label={label ?? (lang === 'he' ? 'צוואר הגיטרה' : 'Guitar neck')}
      style={{ width: '100%', maxHeight, display: 'block', overflow: 'visible' }}>
      {/* Frets */}
      {Array.from({ length: frets + 1 }, (_, i) => from + i).map(f => (f === 0 ? null :
        <line key={`f${f}`} {...line(fretLine(f), 0, fretLine(f), across)} stroke="var(--gc-fretboard-fret)" strokeWidth={1.5} />
      ))}
      {/* Strings */}
      {Array.from({ length: strings }, (_, s) => (
        <line key={`s${s}`} {...line(open ? OPEN - 4 : 0, strC(s), along, strC(s))} stroke="var(--gc-fretboard-str)" strokeWidth={strW(s)} />
      ))}
      {/* Nut */}
      {open && (() => {
        const p = xy(OPEN - 7, -1), q = xy(OPEN, across + 1);
        return <rect x={Math.min(p.x, q.x)} y={Math.min(p.y, q.y)} width={Math.abs(q.x - p.x) || 7} height={Math.abs(q.y - p.y) || 7}
          fill="var(--gc-fretboard-nut)" />;
      })()}
      {/* Fret numbers */}
      {FRET_MARKS.filter(f => f > from && f <= to).map(f => {
        const p = xy(fretMid(f), vertical ? -16 : across + 16);
        return <text key={`n${f}`} x={p.x} y={p.y + 3.5} textAnchor="middle" fontSize={9.5} fill={T.textMuted}
          fontFamily="var(--gc-mono)" letterSpacing="0.06em">{f}</text>;
      })}

      {/* Interval bracket */}
      {bracket && !vertical && (() => {
        const a1 = fretMid(bracket.from), a2 = fretMid(bracket.to);
        const yb = y0 + across + 30;
        const xa = x0 + Math.min(a1, a2), xb = x0 + Math.max(a1, a2);
        return (
          <g>
            <path d={`M${xa} ${yb - 7} V${yb} H${xb} V${yb - 7}`} fill="none" stroke={T.text} strokeWidth={2} />
            <text x={(xa + xb) / 2} y={yb + 14} textAnchor="middle" fontSize={10} fill={T.text}
              fontFamily="var(--gc-mono)" letterSpacing="0.14em">{bracket.label.toUpperCase()}</text>
          </g>
        );
      })()}

      {/* Dots */}
      {dots.filter(d => d.fret >= from && d.fret <= to && d.string < strings).map(d => {
        const p = xy(fretMid(d.fret), strC(d.string));
        const kind: NeckKind = d.kind ?? 'tone';
        const isOpen = d.fret === 0 && kind !== 'root';
        const fill = kind === 'root' ? T.primary : kind === 'ghost' || isOpen ? T.bgDeep : T.secondary;
        const ink = kind === 'root' ? T.onPrimary : kind === 'ghost' || isOpen ? T.text : T.white;
        const text = d.label ?? noteName(d);
        const name = `${noteName(d)} · ${lang === 'he' ? `מיתר ${6 - d.string} שריג ${d.fret}` : `string ${6 - d.string} fret ${d.fret}`}`;
        return (
          <g key={d.id ?? `${d.string}-${d.fret}`} role="button" tabIndex={kind === 'faded' ? -1 : 0} aria-label={name}
            className="su-neck-dot" style={{ cursor: 'pointer', opacity: kind === 'faded' ? 0.12 : 1, transition: 'opacity var(--gc-dur-base) var(--gc-ease-out)' }}
            onClick={() => press(d)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); press(d); } }}>
            <Dot x={p.x} y={p.y} r={R} glow={sounding.midi(midiOf(d))} ringColor={T.primary}>
              {d.target && <circle r={R + 4.5} fill="none" stroke={T.text} strokeWidth={2} />}
              <circle r={R} fill={fill} stroke={kind === 'ghost' ? T.textMuted : T.text} strokeWidth={isOpen || kind === 'ghost' ? 2 : 0} />
              <text y={3.6} textAnchor="middle" fontSize={text.length > 2 ? 8.5 : 10} fill={ink} fontWeight={700}
                fontFamily="var(--gc-mono)">{text}</text>
            </Dot>
          </g>
        );
      })}
    </svg>
  );
}
