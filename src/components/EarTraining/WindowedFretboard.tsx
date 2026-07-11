import React from 'react';
import { T } from '../../theme';
import { OPEN_MIDI, N_STRINGS, WINDOW, midiAt, noteName } from './engine';
import type { Pos } from './engine';

export interface Feedback { picked: Pos; correct: boolean }

interface Props {
  winStart: number;
  root: Pos;
  targetPositions: Pos[];
  feedback: Feedback | null;
  /** Reveal the correct target(s) — set after a wrong answer. */
  showAnswer: boolean;
  disabled: boolean;
  onPick: (pos: Pos) => void;
}

// ── Geometry ────────────────────────────────────────────────────────────────
const PAD_L = 44;   // open-note labels / nut margin
const PAD_R = 16;
const COL_W = 120;
const TOP_Y = 18;
const STR_GAP = 30;
const BOARD_H = (N_STRINGS - 1) * STR_GAP;
const SVG_W = PAD_L + WINDOW * COL_W + PAD_R;
const SVG_H = TOP_Y + BOARD_H + 30;
const DOT_R = 13;

// string index 0 = low E → drawn at the BOTTOM (matches the app's other boards)
const strY = (s: number) => TOP_Y + (N_STRINGS - 1 - s) * STR_GAP;
const colX = (c: number) => PAD_L + c * COL_W + COL_W / 2;
const MARKERS = new Set([3, 5, 7, 9, 12]);

export const WindowedFretboard: React.FC<Props> = ({
  winStart, root, targetPositions, feedback, showAnswer, disabled, onPick,
}) => {
  // The root always shows its actual pitch name so it's obvious the pinned dot
  // is the FIRST note the exercise plays — not an abstract "R".
  const rootLabel = noteName(midiAt(root.string, root.fret));
  const atNut = winStart === 0;
  const frets = Array.from({ length: WINDOW }, (_, c) => winStart + c);

  const isRoot   = (s: number, f: number) => root.string === s && root.fret === f;
  const isTarget = (s: number, f: number) => targetPositions.some(t => t.string === s && t.fret === f);
  const isPicked = (s: number, f: number) => !!feedback && feedback.picked.string === s && feedback.picked.fret === f;

  return (
    <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} style={{ width: '100%', maxWidth: 640, userSelect: 'none', display: 'block', margin: '0 auto' }}>
      {/* board background */}
      <rect x={PAD_L} y={TOP_Y - 12} width={WINDOW * COL_W} height={BOARD_H + 24} fill="var(--gc-fretboard-bg)" />

      {/* inlay markers */}
      {frets.map((f, c) => (
        MARKERS.has(f) ? (
          f === 12 ? (
            <g key={`m${f}`}>
              <circle cx={colX(c)} cy={TOP_Y + STR_GAP} r={4.5} fill="var(--gc-fretboard-pos)" />
              <circle cx={colX(c)} cy={TOP_Y + 4 * STR_GAP} r={4.5} fill="var(--gc-fretboard-pos)" />
            </g>
          ) : (
            <circle key={`m${f}`} cx={colX(c)} cy={TOP_Y + BOARD_H / 2} r={5.5} fill="var(--gc-fretboard-pos)" />
          )
        ) : null
      ))}

      {/* fret wires (right edge of each fret column) */}
      {frets.map((f, c) => (
        <line key={`fw${f}`} x1={PAD_L + (c + 1) * COL_W} y1={TOP_Y} x2={PAD_L + (c + 1) * COL_W} y2={TOP_Y + BOARD_H} stroke="var(--gc-fretboard-fret)" strokeWidth={2} />
      ))}

      {/* strings — graduating thickness low E → high e */}
      {Array.from({ length: N_STRINGS }).map((_, s) => (
        <line key={`s${s}`} x1={PAD_L} y1={strY(s)} x2={PAD_L + WINDOW * COL_W} y2={strY(s)}
          stroke="var(--gc-fretboard-str)" strokeWidth={2.0 + s * 0.4} />
      ))}

      {/* nut (open position) OR left-edge fret line for a mid-neck window */}
      {atNut
        ? <rect x={PAD_L - 4} y={TOP_Y - 12} width={6} height={BOARD_H + 24} fill="var(--gc-fretboard-nut)" />
        : <line x1={PAD_L} y1={TOP_Y} x2={PAD_L} y2={TOP_Y + BOARD_H} stroke="var(--gc-fretboard-fret)" strokeWidth={2} />}

      {/* fret numbers */}
      {frets.map((f, c) => (
        <text key={`fn${f}`} x={colX(c)} y={SVG_H - 8} textAnchor="middle" fontSize={11}
          fontWeight={MARKERS.has(f) ? 700 : 400}
          fill={MARKERS.has(f) ? T.textMuted : T.textDim} opacity={MARKERS.has(f) ? 0.9 : 0.55}>
          {f}
        </text>
      ))}

      {/* open-string note labels */}
      {Array.from({ length: N_STRINGS }).map((_, s) => (
        <text key={`ol${s}`} x={PAD_L - 22} y={strY(s) + 4} textAnchor="middle" fontSize={10} fill={T.textDim}>
          {noteName(OPEN_MIDI[s])}
        </text>
      ))}

      {/* interactive cells + dots */}
      {Array.from({ length: N_STRINGS }).map((_, s) =>
        frets.map((f, c) => {
          const cx = colX(c);
          const cy = strY(s);
          const rootHere   = isRoot(s, f);
          const pickedHere = isPicked(s, f);
          const revealHere = showAnswer && isTarget(s, f) && !pickedHere;

          let fill: string | null = null;
          let ring = '#fff';
          let label = '';
          if (rootHere) { fill = T.primary; ring = T.white; label = rootLabel; }
          else if (pickedHere) {
            fill = feedback!.correct ? T.success : T.error;
            ring = '#fff';
            label = noteName(midiAt(s, f));
          } else if (revealHere) {
            fill = T.success; ring = '#fff'; label = noteName(midiAt(s, f));
          }

          return (
            <g key={`${s}-${f}`}
              onClick={() => { if (disabled || rootHere) return; navigator.vibrate?.(20); onPick({ string: s, fret: f }); }}
              style={{ cursor: disabled || rootHere ? 'default' : 'pointer' }}>
              <rect x={cx - COL_W / 2} y={cy - STR_GAP / 2} width={COL_W} height={STR_GAP} fill="transparent" />
              {fill && (
                <>
                  <circle cx={cx} cy={cy} r={DOT_R} fill={fill} stroke={ring} strokeWidth={2} />
                  <text x={cx} y={cy + 3.5} textAnchor="middle" fontSize={10} fontWeight={700} fill="#fff">{label}</text>
                </>
              )}
            </g>
          );
        }),
      )}
    </svg>
  );
};
