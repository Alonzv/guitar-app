import React from 'react';
import type { FretPosition } from '../../types/music';
import { fretToNote, FRET_COUNT, STRING_COUNT } from '../../utils/musicTheory';
import { T } from '../../theme';

interface Props {
  activeDots: FretPosition[];
  onToggle: (pos: FretPosition) => void;
  readonly?: boolean;
}

const SVG_W  = 680;
const SVG_H  = 168;
const NUT_X  = 60;   // left margin — room for note label + mute ×
const FRET_SP = (SVG_W - NUT_X - 14) / FRET_COUNT;
const STR_SP  = (SVG_H - 36) / (STRING_COUNT - 1);
const TOP_Y   = 14;
const DOT_R   = 11;

const fretX = (f: number) => f === 0 ? NUT_X - FRET_SP * 0.5 : NUT_X + (f - 0.5) * FRET_SP;
const strY  = (s: number) => TOP_Y + (STRING_COUNT - 1 - s) * STR_SP;

export const InteractiveFretboard: React.FC<Props> = ({ activeDots, onToggle, readonly }) => {
  const isActive  = (s: number, f: number) => activeDots.some(d => d.string === s && d.fret === f);
  const hasAnyDot = activeDots.length > 0;

  return (
    <div className="gc-fretboard-wrap">
      <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        style={{ width: '100%', maxHeight: 195, userSelect: 'none', display: 'block' }}>

        {/* ── Fret position markers ── */}
        {[3, 5, 7, 9].map(f => (
          <circle key={f} cx={NUT_X + (f - 0.5) * FRET_SP} cy={SVG_H / 2}
            r={4} fill={T.border} opacity={0.5} />
        ))}
        <circle cx={NUT_X + 11.5 * FRET_SP} cy={TOP_Y + STR_SP}   r={3.5} fill={T.border} opacity={0.5} />
        <circle cx={NUT_X + 11.5 * FRET_SP} cy={TOP_Y + 4 * STR_SP} r={3.5} fill={T.border} opacity={0.5} />

        {/* ── Fret lines ── */}
        {Array.from({ length: FRET_COUNT + 1 }).map((_, i) => (
          <line key={i}
            x1={NUT_X + i * FRET_SP} y1={TOP_Y}
            x2={NUT_X + i * FRET_SP} y2={TOP_Y + (STRING_COUNT - 1) * STR_SP}
            stroke={i === 0 ? T.text : T.border}
            strokeWidth={i === 0 ? 3.5 : 1.2}
            opacity={i === 0 ? 0.65 : 1}
          />
        ))}

        {/* ── String lines ── */}
        {Array.from({ length: STRING_COUNT }).map((_, s) => (
          <line key={s}
            x1={NUT_X} y1={strY(s)}
            x2={NUT_X + FRET_COUNT * FRET_SP} y2={strY(s)}
            stroke={T.secondary} strokeWidth={0.9 + s * 0.22} opacity={0.55}
          />
        ))}

        {/* ── Fret number labels ── */}
        {[3, 5, 7, 9, 12].map(f => (
          <text key={f} x={NUT_X + (f - 0.5) * FRET_SP} y={SVG_H - 3}
            textAnchor="middle" fontSize={9} fill={T.textDim}>{f}</text>
        ))}

        {/* ── String labels (open note) + mute × ── */}
        {Array.from({ length: STRING_COUNT }).map((_, s) => {
          const stringHasDot = activeDots.some(d => d.string === s);
          const muted = hasAnyDot && !stringHasDot;
          return (
            <g key={s}>
              {/* Open string note name */}
              <text x={NUT_X - 42} y={strY(s) + 4}
                textAnchor="middle" fontSize={10}
                fill={muted ? T.textDim : T.textMuted}>
                {fretToNote(s, 0)}
              </text>
              {/* Mute × symbol */}
              {muted && (
                <text x={NUT_X - 14} y={strY(s) + 5}
                  textAnchor="middle" fontSize={14} fontWeight="700"
                  fill="#e05252">
                  ×
                </text>
              )}
            </g>
          );
        })}

        {/* ── Clickable areas + dots ── */}
        {Array.from({ length: STRING_COUNT }).map((_, s) =>
          Array.from({ length: FRET_COUNT + 1 }).map((_, f) => {
            const active = isActive(s, f);
            const cx = fretX(f);
            const cy = strY(s);
            return (
              <g key={`${s}-${f}`}
                onClick={() => !readonly && onToggle({ string: s, fret: f })}
                style={{ cursor: readonly ? 'default' : 'pointer' }}>
                {/* Invisible hit area */}
                <rect x={cx - DOT_R - 3} y={cy - DOT_R - 3}
                  width={(DOT_R + 3) * 2} height={(DOT_R + 3) * 2} fill="transparent" />
                {active ? (
                  <>
                    <circle cx={cx} cy={cy} r={DOT_R} fill={T.primary} stroke={T.text} strokeWidth={1.5} />
                    <text x={cx} y={cy + 4} textAnchor="middle" fontSize={9}
                      fill={T.text} fontWeight="700">{fretToNote(s, f)}</text>
                  </>
                ) : !readonly && (
                  <circle cx={cx} cy={cy} r={DOT_R - 5}
                    fill="transparent" stroke={T.border} strokeWidth={1} opacity={0.3} />
                )}
              </g>
            );
          })
        )}
      </svg>
    </div>
  );
};
