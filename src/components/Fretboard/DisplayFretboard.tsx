import React from 'react';
import type { FretPosition } from '../../types/music';
import { fretToNote, FRET_COUNT, STRING_COUNT } from '../../utils/musicTheory';
import { T } from '../../theme';

export interface DisplayDot extends FretPosition {
  color: string;
  label?: string;
  opacity?: number;
}

interface Props { dots: DisplayDot[]; compact?: boolean }

const SVG_W = 660;
const SVG_H = 168;
const NUT_X = 48;
const FRET_SP = (SVG_W - NUT_X - 16) / FRET_COUNT;
const STR_SP  = (SVG_H - 36) / (STRING_COUNT - 1);
const TOP_Y   = 14;
const DOT_R   = 9;

const fretX = (f: number) => f === 0 ? NUT_X - FRET_SP * 0.5 : NUT_X + (f - 0.5) * FRET_SP;
const strY  = (s: number) => TOP_Y + (STRING_COUNT - 1 - s) * STR_SP;

export const DisplayFretboard: React.FC<Props> = ({ dots, compact }) => (
  <div className={compact ? 'gc-fretboard-compact' : 'gc-fretboard-wrap'}>
    <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} style={{ width: '100%', maxHeight: 190, display: 'block' }}>

      {/* Fret lines */}
      {Array.from({ length: FRET_COUNT + 1 }).map((_, i) => (
        <line key={i}
          x1={NUT_X + i * FRET_SP} y1={TOP_Y}
          x2={NUT_X + i * FRET_SP} y2={TOP_Y + (STRING_COUNT - 1) * STR_SP}
          stroke={i === 0 ? T.text : T.border}
          strokeWidth={i === 0 ? 3.5 : 1.2}
          opacity={i === 0 ? 0.7 : 1}
        />
      ))}

      {/* String lines */}
      {Array.from({ length: STRING_COUNT }).map((_, s) => (
        <line key={s}
          x1={NUT_X} y1={strY(s)}
          x2={NUT_X + FRET_COUNT * FRET_SP} y2={strY(s)}
          stroke={T.secondary} strokeWidth={0.9 + s * 0.22} opacity={0.55}
        />
      ))}

      {/* Fret markers */}
      {[3, 5, 7, 9].map(f => (
        <circle key={f} cx={NUT_X + (f - 0.5) * FRET_SP} cy={SVG_H / 2}
          r={4} fill={T.border} opacity={0.4} />
      ))}
      <circle cx={NUT_X + 11.5 * FRET_SP} cy={TOP_Y + STR_SP} r={3.5} fill={T.border} opacity={0.4} />
      <circle cx={NUT_X + 11.5 * FRET_SP} cy={TOP_Y + 4 * STR_SP} r={3.5} fill={T.border} opacity={0.4} />

      {/* Fret numbers */}
      {[3, 5, 7, 9, 12].map(f => (
        <text key={f} x={NUT_X + (f - 0.5) * FRET_SP} y={SVG_H - 3}
          textAnchor="middle" fontSize={9} fill={T.textDim}>{f}</text>
      ))}

      {/* String labels */}
      {Array.from({ length: STRING_COUNT }).map((_, s) => (
        <text key={s} x={NUT_X - 28} y={strY(s) + 4}
          textAnchor="middle" fontSize={10} fill={T.textMuted}>{fretToNote(s, 0)}</text>
      ))}

      {/* Scale dots */}
      {dots.map((dot, i) => {
        const cx = fretX(dot.fret);
        const cy = strY(dot.string);
        const label = dot.label ?? fretToNote(dot.string, dot.fret);
        return (
          <g key={i}>
            <circle cx={cx} cy={cy} r={DOT_R} fill={dot.color} stroke={T.bgDeep} strokeWidth={1.5} opacity={dot.opacity ?? 0.92} />
            <text x={cx} y={cy + 4} textAnchor="middle" fontSize={7.5} fill="#fff" fontWeight="700">{label}</text>
          </g>
        );
      })}
    </svg>
  </div>
);
