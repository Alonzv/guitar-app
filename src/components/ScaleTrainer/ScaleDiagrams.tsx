import React from 'react';
import { T } from '../../theme';
import { OPEN_MIDI, N_STRINGS, BOX_WINDOW, pcOf } from './engine';
import type { BoxDot } from './engine';

// ── Shared geometry (mirrors the Ear Training neck conventions) ─────────────
const STR_GAP = 30;
const TOP_Y = 18;
const DOT_R = 13;
const MARKERS = [3, 5, 7, 9, 12];

const NOTE_FOR_STRING = ['E', 'A', 'D', 'G', 'B', 'e'];

const dropKeyframes = `
@keyframes gcScaleDrop {
  from { opacity: 0; transform: translateY(-26px); }
  60%  { opacity: 1; transform: translateY(3px); }
  to   { opacity: 1; transform: translateY(0); }
}`;

// ════════════════════════════════════════════════════════════════════════════
//  Box diagram — a 5-fret window across all six strings
// ════════════════════════════════════════════════════════════════════════════
interface BoxProps {
  winStart: number;
  dots: BoxDot[];
  /** Stagger a drop-in animation per dot (the practice-completion reward). */
  animate?: boolean;
}

export const BoxFretboard: React.FC<BoxProps> = ({ winStart, dots, animate }) => {
  const FRET_SP = 92;
  const BOARD_H = (N_STRINGS - 1) * STR_GAP;
  const LABEL_W = 20;
  const LEFT = LABEL_W + 8;
  const winEnd = winStart + BOX_WINDOW - 1;
  const displayMin = Math.max(0, winStart - 1);
  const showNut = displayMin === 0;
  const fretCount = winEnd - displayMin;
  const boardRight = LEFT + fretCount * FRET_SP;
  const SVG_W = boardRight + 14;
  const SVG_H = TOP_Y + BOARD_H + 28;

  const strY = (s: number) => TOP_Y + (N_STRINGS - 1 - s) * STR_GAP;
  const fretX = (f: number) => LEFT + (f - displayMin - 0.5) * FRET_SP;

  return (
    <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} style={{ width: '100%', maxWidth: 560, userSelect: 'none', display: 'block', margin: '0 auto' }}>
      {animate && <style>{dropKeyframes}</style>}
      <rect x={LEFT} y={TOP_Y - 10} width={fretCount * FRET_SP} height={BOARD_H + 20} fill="var(--gc-fretboard-bg)" />

      {MARKERS.filter(f => f > displayMin && f <= winEnd).map(f => (
        f === 12 ? (
          <g key={`m${f}`}>
            <circle cx={fretX(f)} cy={strY(4)} r={5} fill="var(--gc-fretboard-pos)" />
            <circle cx={fretX(f)} cy={strY(1)} r={5} fill="var(--gc-fretboard-pos)" />
          </g>
        ) : (
          <circle key={`m${f}`} cx={fretX(f)} cy={TOP_Y + BOARD_H / 2} r={6} fill="var(--gc-fretboard-pos)" />
        )
      ))}

      {Array.from({ length: fretCount + 1 }).map((_, i) => (
        <line key={`fw${i}`}
          x1={LEFT + i * FRET_SP} y1={TOP_Y} x2={LEFT + i * FRET_SP} y2={TOP_Y + BOARD_H}
          stroke="var(--gc-fretboard-fret)" strokeWidth={2} />
      ))}

      {Array.from({ length: N_STRINGS }).map((_, s) => (
        <line key={`s${s}`} x1={LEFT} y1={strY(s)} x2={boardRight} y2={strY(s)}
          stroke="var(--gc-fretboard-str)" strokeWidth={2.0 + s * 0.4} />
      ))}

      {showNut && <rect x={LEFT - 1} y={TOP_Y - 10} width={6} height={BOARD_H + 20} fill="var(--gc-fretboard-nut)" />}

      {Array.from({ length: fretCount }).map((_, i) => {
        const f = displayMin + 1 + i;
        const marker = MARKERS.includes(f);
        return (
          <text key={`fn${f}`} x={fretX(f)} y={SVG_H - 7} textAnchor="middle" fontSize={12}
            fontWeight={marker ? 700 : 400}
            fill={marker ? T.textMuted : T.textDim} opacity={marker ? 0.9 : 0.55}>
            {f}
          </text>
        );
      })}

      {Array.from({ length: N_STRINGS }).map((_, s) => (
        <text key={`sl${s}`} x={LABEL_W / 2} y={strY(s) + 4} textAnchor="middle" fontSize={11} fill={T.textDim}>
          {NOTE_FOR_STRING[s]}
        </text>
      ))}

      {dots.map((d, i) => (
        <g key={`${d.string}-${d.fret}`}
          style={animate ? {
            animation: 'gcScaleDrop .45s ease both',
            animationDelay: `${i * 60}ms`,
            transformBox: 'fill-box',
            transformOrigin: 'center',
          } : undefined}>
          <circle cx={fretX(d.fret)} cy={strY(d.string)} r={DOT_R}
            fill={d.isRoot ? T.primary : T.success} stroke="#fff" strokeWidth={2} />
          <text x={fretX(d.fret)} y={strY(d.string) + 3.5} textAnchor="middle"
            fontSize={10} fontWeight={700} fill="#fff">
            {d.label}
          </text>
        </g>
      ))}
    </svg>
  );
};

// ════════════════════════════════════════════════════════════════════════════
//  One-string diagram — the scale laid out linearly along a single string
// ════════════════════════════════════════════════════════════════════════════
interface LinearProps {
  /** String index 0-5 (0 = low E). */
  string: number;
  /** Spelled scale notes; notes[0] is the root. */
  notes: string[];
}

export const OneStringDiagram: React.FC<LinearProps> = ({ string, notes }) => {
  const FRET_SP = 64;
  const LABEL_W = 22;
  const LEFT = LABEL_W + 8;
  const FRETS = 12;
  const Y = 34;
  const boardRight = LEFT + FRETS * FRET_SP;
  const SVG_W = boardRight + 14;
  const SVG_H = 76;

  const byPc = new Map<number, { label: string; isRoot: boolean }>();
  notes.forEach((n, i) => byPc.set(pcOf(n), { label: n, isRoot: i === 0 }));
  const openPc = OPEN_MIDI[string] % 12;

  const fretX = (f: number) => LEFT + (f - 0.5) * FRET_SP;

  return (
    <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} style={{ width: '100%', userSelect: 'none', display: 'block', margin: '0 auto' }}>
      <rect x={LEFT} y={Y - 18} width={FRETS * FRET_SP} height={36} fill="var(--gc-fretboard-bg)" />
      {Array.from({ length: FRETS + 1 }).map((_, i) => (
        <line key={`fw${i}`} x1={LEFT + i * FRET_SP} y1={Y - 18} x2={LEFT + i * FRET_SP} y2={Y + 18}
          stroke="var(--gc-fretboard-fret)" strokeWidth={2} />
      ))}
      <rect x={LEFT - 1} y={Y - 18} width={5} height={36} fill="var(--gc-fretboard-nut)" />
      <line x1={LEFT} y1={Y} x2={boardRight} y2={Y} stroke="var(--gc-fretboard-str)" strokeWidth={2.2} />
      <text x={LABEL_W / 2} y={Y + 4} textAnchor="middle" fontSize={11} fill={T.textDim}>
        {NOTE_FOR_STRING[string]}
      </text>

      {MARKERS.map(f => (
        <text key={`fn${f}`} x={fretX(f)} y={SVG_H - 4} textAnchor="middle" fontSize={11}
          fontWeight={700} fill={T.textMuted} opacity={0.9}>
          {f}
        </text>
      ))}

      {Array.from({ length: FRETS }, (_, i) => i + 1).map(f => {
        const info = byPc.get((openPc + f) % 12);
        if (!info) return null;
        const cx = fretX(f);
        return (
          <g key={`d${f}`}>
            <circle cx={cx} cy={Y} r={12} fill={info.isRoot ? T.primary : T.success} stroke="#fff" strokeWidth={2} />
            <text x={cx} y={Y + 3.5} textAnchor="middle" fontSize={9.5} fontWeight={700} fill="#fff">
              {info.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
};
