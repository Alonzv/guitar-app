import type { ReactNode } from 'react';
import { CHROMATIC, STANDARD_OPEN_MIDI } from '../../utils/musicTheory';

// ── The Intervals neck ───────────────────────────────────────────────────────
// Explore, Measure and In a Chord all draw the same 12-fret neck and then paint
// their own marks on top of it. The geometry below and the ~25 lines of chrome
// that follow used to be copied into all three, byte for byte, so the neck could
// only be restyled by editing the same code three times.
//
// This is deliberately not merged with the components under Fretboard/ — those
// are four differently-sized boards built for different jobs (a chord diagram, a
// scale display, a tappable board, a windowed one), not copies of each other.

export const FB_W = 580;
export const FB_H = 165;
export const NUT = 44;
export const FRET_SP = (FB_W - NUT - 16) / 12;
export const STR_SP = (FB_H - 30) / 5;
export const FB_TOP = 12;
export const DOT_R = 12;

/** Y centre of a string. String 0 is the low E, drawn at the bottom. */
export const strY = (s: number) => FB_TOP + (5 - s) * STR_SP;

/** X centre of a fret's note. Fret 0 (open) sits left of the nut. */
export const noteX = (f: number) => (f === 0 ? NUT - 14 : NUT + (f - 0.5) * FRET_SP);

/** Sounding MIDI note at a position, in standard tuning. */
export const midiAt = (p: { string: number; fret: number }) => STANDARD_OPEN_MIDI[p.string] + p.fret;

const pcName = (m: number) => CHROMATIC[((m % 12) + 12) % 12];

interface Props {
  /** Total SVG height. Defaults to the board plus the fret-number row. */
  height?: number;
  /** Minimum rendered width in px before the board scrolls. */
  minWidth?: number;
  /** CSS width, e.g. '140%' to let the board overflow a narrow column. */
  width?: string;
  /** Open-string note names left of the nut. */
  showOpenNotes?: boolean;
  /** The marks this particular tool paints on the board. */
  children?: ReactNode;
}

export function IntervalNeck({
  height = FB_H + 6,
  minWidth = 300,
  width = '100%',
  showOpenNotes = false,
  children,
}: Props) {
  return (
    <svg
      viewBox={`0 0 ${FB_W} ${height}`}
      style={{ display: 'block', width, minWidth, userSelect: 'none' }}
    >
      <rect x={0} y={0} width={FB_W} height={height} fill="var(--gc-fretboard-bg)" />

      {/* Position markers */}
      {[3, 5, 7, 9].map(f => (
        <circle key={f} cx={NUT + (f - 0.5) * FRET_SP} cy={FB_TOP + 2.5 * STR_SP}
          r={5} fill="var(--gc-fretboard-pos)" />
      ))}
      <circle cx={NUT + 11.5 * FRET_SP} cy={FB_TOP + STR_SP} r={4} fill="var(--gc-fretboard-pos)" />
      <circle cx={NUT + 11.5 * FRET_SP} cy={FB_TOP + 4 * STR_SP} r={4} fill="var(--gc-fretboard-pos)" />

      {/* Frets, then the nut over the first one */}
      {Array.from({ length: 13 }).map((_, i) => (
        <line key={i}
          x1={NUT + i * FRET_SP} y1={FB_TOP}
          x2={NUT + i * FRET_SP} y2={FB_TOP + 5 * STR_SP}
          stroke="var(--gc-fretboard-fret)" strokeWidth={2} />
      ))}
      <rect x={NUT - 6} y={FB_TOP} width={6} height={5 * STR_SP} fill="var(--gc-fretboard-nut)" />

      {/* Strings, thickening toward the low E */}
      {Array.from({ length: 6 }).map((_, s) => (
        <line key={s}
          x1={NUT} y1={strY(s)} x2={NUT + 12 * FRET_SP} y2={strY(s)}
          stroke="var(--gc-fretboard-str)" strokeWidth={0.8 + (5 - s) * 0.32} />
      ))}

      {showOpenNotes && Array.from({ length: 6 }).map((_, s) => (
        <text key={`open-${s}`} x={NUT - 30} y={strY(s) + 3.5}
          textAnchor="middle" fontSize={11} fontWeight="700" fill="var(--gc-text)">
          {pcName(STANDARD_OPEN_MIDI[s])}
        </text>
      ))}

      {[3, 5, 7, 9, 12].map(f => (
        <text key={f} x={NUT + (f - 0.5) * FRET_SP} y={FB_TOP + 5 * STR_SP + 11}
          textAnchor="middle" fontSize={11} fontWeight="700" fill="var(--gc-text)">{f}</text>
      ))}

      {children}
    </svg>
  );
}
