import React from 'react';
import type { FretPosition } from '../../types/music';
import { fretToNote, STRING_COUNT } from '../../utils/musicTheory';
import { T } from '../../theme';

interface Props {
  voicing: FretPosition[];
  dotColor?: string;
  tuning?: string[];
}

export const MiniFretboard: React.FC<Props> = ({ voicing, dotColor = T.primary, tuning }) => {
  const hasOpen = voicing.some(p => p.fret === 0);
  const nonZeroFrets = voicing.map(p => p.fret).filter(f => f > 0);
  const minFret = nonZeroFrets.length > 0 ? Math.min(...nonZeroFrets) : 0;
  const maxFret = voicing.length > 0 ? Math.max(...voicing.map(p => p.fret)) : 0;

  const displayMin = hasOpen ? 0 : Math.max(0, minFret - 1);
  const displayMax = Math.max(maxFret, displayMin + 4);
  const fretCount = displayMax - displayMin;

  const W = 200, H = 90;
  const LEFT = displayMin === 0 ? 12 : 24;
  const fretSp = (W - LEFT - 8) / fretCount;
  const strSp = (H - 20) / (STRING_COUNT - 1);
  const topY = 8;

  const fretX = (f: number) =>
    f === 0 ? LEFT - fretSp * 0.5 : LEFT + (f - displayMin - 0.5) * fretSp;
  const strY = (s: number) => topY + (STRING_COUNT - 1 - s) * strSp;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
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
      {Array.from({ length: STRING_COUNT }).map((_, s) => (
        <line key={s}
          x1={LEFT} y1={strY(s)}
          x2={LEFT + fretCount * fretSp} y2={strY(s)}
          stroke={T.secondary} strokeWidth={0.7 + s * 0.18} opacity={0.5}
        />
      ))}
      {displayMin > 0 && (
        <text x={LEFT - 4} y={topY + (STRING_COUNT - 1) * strSp / 2 + 4}
          textAnchor="end" fontSize={7} fill={T.textMuted}>{displayMin + 1}fr</text>
      )}
      {voicing.map((p, i) => {
        const cx = fretX(p.fret);
        const cy = strY(p.string);
        const note = fretToNote(p.string, p.fret, tuning);
        return (
          <g key={i}>
            <circle cx={cx} cy={cy} r={7} fill={dotColor} stroke={T.bgDeep} strokeWidth={1} opacity={0.92} />
            <text x={cx} y={cy + 3} textAnchor="middle" fontSize={6} fill="#fff" fontWeight="700">{note}</text>
          </g>
        );
      })}
    </svg>
  );
};
