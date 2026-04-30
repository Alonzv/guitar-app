import React from 'react';
import type { FretPosition } from '../../types/music';
import { fretToNote, STRING_COUNT } from '../../utils/musicTheory';
import { T } from '../../theme';

// s=0 (low E) → bottom of SVG, s=5 (high e) → top of SVG
const STRING_NAMES = ['E', 'A', 'D', 'G', 'B', 'e'] as const;

interface Props {
  voicing: FretPosition[];
  dotColor?: string;
  dotColors?: string[];
  tuning?: string[];
  dotLabels?: string[];
  hideFretLabel?: boolean;
  showStringLabels?: boolean;
  showFretNumbers?: boolean;
}

export const MiniFretboard: React.FC<Props> = ({
  voicing, dotColor = T.primary, dotColors, tuning,
  dotLabels, hideFretLabel, showStringLabels, showFretNumbers,
}) => {
  const hasOpen = voicing.some(p => p.fret === 0);
  const nonZeroFrets = voicing.map(p => p.fret).filter(f => f > 0);
  const minFret = nonZeroFrets.length > 0 ? Math.min(...nonZeroFrets) : 0;
  const maxFret = voicing.length > 0 ? Math.max(...voicing.map(p => p.fret)) : 0;

  const displayMin = hasOpen ? 0 : Math.max(0, minFret - 1);
  const displayMax = Math.max(maxFret, displayMin + 4);
  const fretCount = displayMax - displayMin;

  const W = 200, H = 90;
  const strLabelW = showStringLabels ? 14 : 0;

  const minLeftForOpen = displayMin === 0 && hasOpen
    ? Math.ceil((16 * fretCount + W - 8) / (2 * fretCount + 1))
    : 0;
  const LEFT = Math.max(displayMin === 0 ? 16 : 24, minLeftForOpen) + strLabelW;
  const fretSp = (W - LEFT - 8) / Math.max(fretCount, 1);
  const strSp = (H - 20) / (STRING_COUNT - 1);
  const topY = 8;

  const fretX = (f: number) =>
    f === 0 ? LEFT - fretSp * 0.5 : LEFT + (f - displayMin - 0.5) * fretSp;
  const strY = (s: number) => topY + (STRING_COUNT - 1 - s) * strSp;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>

      {/* Fret lines */}
      {Array.from({ length: fretCount + 1 }).map((_, i) => {
        const isNut = i === 0 && displayMin === 0;
        return (
          <line key={i}
            x1={LEFT + i * fretSp} y1={topY}
            x2={LEFT + i * fretSp} y2={topY + (STRING_COUNT - 1) * strSp}
            stroke={isNut ? T.text : T.border}
            strokeWidth={isNut ? 3 : 1}
            opacity={isNut ? 0.7 : 1}
          />
        );
      })}

      {/* Strings */}
      {Array.from({ length: STRING_COUNT }).map((_, s) => (
        <line key={s}
          x1={LEFT} y1={strY(s)}
          x2={LEFT + fretCount * fretSp} y2={strY(s)}
          stroke={T.secondary} strokeWidth={2.2 - s * 0.22} opacity={0.5}
        />
      ))}

      {/* Legacy fret position label (top-left, when not hidden) */}
      {displayMin > 0 && !hideFretLabel && !showFretNumbers && (
        <text x={LEFT - strLabelW - 4} y={topY + (STRING_COUNT - 1) * strSp / 2 + 4}
          textAnchor="end" fontSize={7} fill={T.textMuted}>{displayMin + 1}fr</text>
      )}

      {/* String name labels on the left */}
      {showStringLabels && Array.from({ length: STRING_COUNT }).map((_, s) => (
        <text key={`sl-${s}`}
          x={LEFT - strLabelW / 2 - 1}
          y={strY(s) + 2.5}
          textAnchor="middle" dominantBaseline="middle"
          fontSize={6.5} fontWeight={600} fill={T.textMuted}
        >{STRING_NAMES[s]}</text>
      ))}

      {/* Fret number labels at the bottom */}
      {showFretNumbers && Array.from({ length: fretCount }).map((_, i) => {
        const fretNum = displayMin + 1 + i;
        return (
          <text key={`fn-${fretNum}`}
            x={LEFT + (i + 0.5) * fretSp}
            y={H - 3}
            textAnchor="middle" fontSize={6.5} fill={T.textMuted}
          >{fretNum}</text>
        );
      })}

      {/* Dots */}
      {voicing.map((p, i) => {
        const cx = fretX(p.fret);
        const cy = strY(p.string);
        const label = dotLabels?.[i] ?? fretToNote(p.string, p.fret, tuning);
        return (
          <g key={i}>
            <circle cx={cx} cy={cy} r={7} fill={dotColors?.[i] ?? dotColor} stroke={T.bgDeep} strokeWidth={1} opacity={0.92} />
            <text x={cx} y={cy + 3} textAnchor="middle" fontSize={6} fill="#fff" fontWeight="700">{label}</text>
          </g>
        );
      })}
    </svg>
  );
};
