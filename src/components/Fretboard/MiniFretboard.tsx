import React from 'react';
import type { FretPosition } from '../../types/music';
import { fretToNote, STRING_COUNT } from '../../utils/musicTheory';
import { T } from '../../theme';

const STRING_NAMES = ['E', 'A', 'D', 'G', 'B', 'e'] as const;

// Frets with position markers on a real guitar
const POSITION_DOTS = [3, 5, 7, 9, 12];

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
  const NUT_W = 5;

  const minLeftForOpen = displayMin === 0 && hasOpen
    ? Math.ceil((16 * fretCount + W - 8) / (2 * fretCount + 1))
    : 0;
  const LEFT = Math.max(displayMin === 0 ? 16 : 24, minLeftForOpen) + strLabelW;
  const fretSp = (W - LEFT - 8) / Math.max(fretCount, 1);
  const strSp = (H - 20) / (STRING_COUNT - 1);
  const topY = 8;
  const botY = topY + (STRING_COUNT - 1) * strSp;
  const midY = (topY + botY) / 2;

  const fretX = (f: number) =>
    f === 0 ? LEFT - fretSp * 0.5 : LEFT + (f - displayMin - 0.5) * fretSp;
  const strY = (s: number) => topY + (STRING_COUNT - 1 - s) * strSp;

  // String thickness: high-e thin → low-E thick
  const strW = (s: number) => 1.9 + s * 0.25;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>

      {/* Fretboard background */}
      <rect x={LEFT} y={topY - 8}
        width={fretCount * fretSp} height={(STRING_COUNT - 1) * strSp + 16}
        fill="var(--gc-fretboard-bg)" />

      {/* Fret lines */}
      {Array.from({ length: fretCount + 1 }).map((_, i) => (
        <line key={i}
          x1={LEFT + i * fretSp} y1={topY}
          x2={LEFT + i * fretSp} y2={botY}
          stroke="var(--gc-fretboard-fret)"
          strokeWidth={1.5}
        />
      ))}

      {/* Nut — thick solid bar (B2 style) */}
      {displayMin === 0 && (
        <rect x={LEFT - 1} y={topY - 8}
          width={NUT_W} height={(STRING_COUNT - 1) * strSp + 16}
          fill="var(--gc-fretboard-nut)" />
      )}

      {/* Position dots — visible when in range */}
      {POSITION_DOTS.filter(f => f > displayMin && f <= displayMax).map(f => {
        const cx = LEFT + (f - displayMin - 0.5) * fretSp;
        if (f === 12) {
          // double dot
          return (
            <g key={f}>
              <circle cx={cx} cy={midY - strSp * 0.8} r={3.5} fill="var(--gc-fretboard-pos)" />
              <circle cx={cx} cy={midY + strSp * 0.8} r={3.5} fill="var(--gc-fretboard-pos)" />
            </g>
          );
        }
        return <circle key={f} cx={cx} cy={midY} r={3.5} fill="var(--gc-fretboard-pos)" />;
      })}

      {/* String lines — graduating thickness */}
      {Array.from({ length: STRING_COUNT }).map((_, s) => (
        <line key={s}
          x1={LEFT} y1={strY(s)}
          x2={LEFT + fretCount * fretSp} y2={strY(s)}
          stroke="var(--gc-fretboard-str)" strokeWidth={strW(s)}
        />
      ))}

      {/* Fret position label (top-left, when not hidden) */}
      {displayMin > 0 && !hideFretLabel && !showFretNumbers && (
        <text x={LEFT - strLabelW - 4} y={topY + (STRING_COUNT - 1) * strSp / 2 + 4}
          textAnchor="end" fontSize={7} fill={T.textDim}>{displayMin + 1}fr</text>
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
            <circle cx={cx} cy={cy} r={7} fill={dotColors?.[i] ?? dotColor} stroke="#fff" strokeWidth={1.25} opacity={0.92} />
            <text x={cx} y={cy + 3} textAnchor="middle" fontSize={6} fill="#fff" fontWeight="700">{label}</text>
          </g>
        );
      })}
    </svg>
  );
};
