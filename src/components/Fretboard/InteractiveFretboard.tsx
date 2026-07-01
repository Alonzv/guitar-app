import React from 'react';
import type { FretPosition } from '../../types/music';
import { fretToNote, FRET_COUNT, STRING_COUNT } from '../../utils/musicTheory';
import { T } from '../../theme';

interface Props {
  activeDots: FretPosition[];
  onToggle: (pos: FretPosition) => void;
  readonly?: boolean;
  tuning?: string[];
  capo?: number;
}

const SVG_W  = 680;
const SVG_H  = 168;
const NUT_X  = 60;
const FRET_SP = (SVG_W - NUT_X - 14) / FRET_COUNT;
const STR_SP  = (SVG_H - 36) / (STRING_COUNT - 1);
const TOP_Y   = 14;
const DOT_R   = 11;
const NUT_W   = 7;

const fretX = (f: number) => f === 0 ? NUT_X - FRET_SP * 0.5 : NUT_X + (f - 0.5) * FRET_SP;
const strY  = (s: number) => TOP_Y + (STRING_COUNT - 1 - s) * STR_SP;

// String thickness: high-e thin → low-E thick
const strW = (s: number) => 2.0 + s * 0.40;

export const InteractiveFretboard: React.FC<Props> = ({ activeDots, onToggle, readonly, tuning, capo = 0 }) => {
  const isActive  = (s: number, f: number) => activeDots.some(d => d.string === s && d.fret === f);
  const hasAnyDot = activeDots.length > 0;

  return (
    <div className="gc-fretboard-wrap">
      <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        style={{ width: '100%', maxHeight: 195, userSelect: 'none', display: 'block' }}>

        {/* Fretboard background */}
        <rect x={NUT_X - FRET_SP * 0.5} y={TOP_Y - 13}
          width={FRET_COUNT * FRET_SP + FRET_SP * 0.5 + 8} height={(STRING_COUNT - 1) * STR_SP + 26}
          fill="var(--gc-fretboard-bg)" />

        {/* Fret lines */}
        {Array.from({ length: FRET_COUNT + 1 }).map((_, i) => (
          <line key={i}
            x1={NUT_X + i * FRET_SP} y1={TOP_Y}
            x2={NUT_X + i * FRET_SP} y2={TOP_Y + (STRING_COUNT - 1) * STR_SP}
            stroke="var(--gc-fretboard-fret)"
            strokeWidth={2}
          />
        ))}

        {/* Position dots: 3,5,7,9 single • 12 double */}
        {[3, 5, 7, 9].map(f => (
          <circle key={f} cx={NUT_X + (f - 0.5) * FRET_SP} cy={SVG_H / 2}
            r={5} fill="var(--gc-fretboard-pos)" />
        ))}
        <circle cx={NUT_X + 11.5 * FRET_SP} cy={TOP_Y + STR_SP}     r={4.5} fill="var(--gc-fretboard-pos)" />
        <circle cx={NUT_X + 11.5 * FRET_SP} cy={TOP_Y + 4 * STR_SP} r={4.5} fill="var(--gc-fretboard-pos)" />

        {/* String lines — graduating thickness */}
        {Array.from({ length: STRING_COUNT }).map((_, s) => (
          <line key={s}
            x1={NUT_X} y1={strY(s)}
            x2={NUT_X + FRET_COUNT * FRET_SP} y2={strY(s)}
            stroke="var(--gc-fretboard-str)" strokeWidth={strW(s)}
          />
        ))}

        {/* Nut — drawn last so it covers overlapping fret/string lines */}
        <rect x={NUT_X - 1} y={TOP_Y - 13}
          width={NUT_W} height={(STRING_COUNT - 1) * STR_SP + 26}
          fill="var(--gc-fretboard-nut)" />

        {/* Fret number labels — all 1-12 */}
        {Array.from({ length: FRET_COUNT }, (_, i) => i + 1).map(f => (
          <text key={f} x={NUT_X + (f - 0.5) * FRET_SP} y={SVG_H - 3}
            textAnchor="middle" fontSize={8}
            fontWeight={[3,5,7,9,12].includes(f) ? '700' : '400'}
            fill={[3,5,7,9,12].includes(f) ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.38)'}>{f}</text>
        ))}

        {/* String labels (open note) + mute × */}
        {Array.from({ length: STRING_COUNT }).map((_, s) => {
          const stringHasDot = activeDots.some(d => d.string === s);
          const muted = hasAnyDot && !stringHasDot;
          return (
            <g key={s}>
              <text x={NUT_X - 42} y={strY(s) + 4}
                textAnchor="middle" fontSize={10}
                fill={muted ? T.textDim : T.textMuted}>
                {fretToNote(s, 0, tuning, capo)}
              </text>
              {muted && (
                <text x={NUT_X - 14} y={strY(s) + 5}
                  textAnchor="middle" fontSize={14} fontWeight="700"
                  fill="#110CF0">
                  ×
                </text>
              )}
            </g>
          );
        })}

        {/* Clickable areas + dots */}
        {Array.from({ length: STRING_COUNT }).map((_, s) =>
          Array.from({ length: FRET_COUNT + 1 }).map((_, f) => {
            const active = isActive(s, f);
            const cx = fretX(f);
            const cy = strY(s);
            return (
              <g key={`${s}-${f}`}
                onClick={() => { if (readonly) return; navigator.vibrate?.(30); onToggle({ string: s, fret: f }); }}
                style={{ cursor: readonly ? 'default' : 'pointer' }}>
                <rect x={cx - DOT_R - 3} y={cy - DOT_R - 3}
                  width={(DOT_R + 3) * 2} height={(DOT_R + 3) * 2} fill="transparent" />
                {active && (
                  <>
                    <circle cx={cx} cy={cy} r={DOT_R} fill={T.primary} stroke="#fff" strokeWidth={1.9} />
                    <text x={cx} y={cy + 4} textAnchor="middle" fontSize={9}
                      fill="#fff" fontWeight="700">{fretToNote(s, f, tuning, capo)}</text>
                  </>
                )}
              </g>
            );
          })
        )}
      </svg>
    </div>
  );
};
