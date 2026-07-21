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

// ── Geometry (mirrors the app's MiniFretboard conventions) ──────────────────
// Open notes (fret 0) sit to the LEFT of the nut — fret 0 is never a boxed
// column. The nut is thick only when the window reaches open position; a
// mid-neck window shows a thin fret wire on its left edge instead.
const FRET_SP = 112;
const STR_GAP = 30;
const TOP_Y = 18;
const BOARD_H = (N_STRINGS - 1) * STR_GAP;
const OPEN_OFF = 26;   // how far left of the nut open-string dots sit
const LABEL_W = 20;    // string-name label gutter
const DOT_R = 13;
const NUT_W = 6;
const MARKERS = [3, 5, 7, 9, 12];

const strY = (s: number) => TOP_Y + (N_STRINGS - 1 - s) * STR_GAP;
const strW = (s: number) => 2.0 + s * 0.4; // low E thick → high e thin

export const WindowedFretboard: React.FC<Props> = ({
  winStart, root, targetPositions, feedback, showAnswer, disabled, onPick,
}) => {
  const winEnd = winStart + WINDOW - 1;
  const displayMin = Math.max(0, winStart - 1); // fret index at the left edge
  const showNut = displayMin === 0;             // nut = boundary before fret 1
  const showOpen = winStart === 0;              // open strings are in play
  const fretCount = winEnd - displayMin;        // number of drawn fret spaces

  const LEFT = LABEL_W + (showOpen ? OPEN_OFF + 8 : 8);
  const boardRight = LEFT + fretCount * FRET_SP;
  const SVG_W = boardRight + 14;
  const SVG_H = TOP_Y + BOARD_H + 28;

  // Note dot X: open notes half-ish a space left of the nut, fretted notes
  // centred in their fret space.
  const fretX = (f: number) =>
    f === 0 ? LEFT - OPEN_OFF : LEFT + (f - displayMin - 0.5) * FRET_SP;

  const rootLabel = noteName(midiAt(root.string, root.fret));
  const isRoot   = (s: number, f: number) => root.string === s && root.fret === f;
  const isTarget = (s: number, f: number) => targetPositions.some(t => t.string === s && t.fret === f);
  const isPicked = (s: number, f: number) => !!feedback && feedback.picked.string === s && feedback.picked.fret === f;

  const labelledFrets: number[] = [];
  for (let f = displayMin + 1; f <= winEnd; f++) labelledFrets.push(f);

  // Every clickable fret in the window (includes fret 0 only when open is shown)
  const cellFrets: number[] = [];
  for (let f = winStart; f <= winEnd; f++) cellFrets.push(f);

  return (
    <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} style={{ width: '100%', maxWidth: 620, userSelect: 'none', display: 'block', margin: '0 auto' }}>
      {/* board background */}
      <rect x={LEFT} y={TOP_Y - 10} width={fretCount * FRET_SP} height={BOARD_H + 20} fill="var(--gc-fretboard-bg)" />

      {/* inlay markers */}
      {MARKERS.filter(f => f > displayMin && f <= winEnd).map(f => (
        f === 12 ? (
          <g key={`m${f}`}>
            <circle cx={LEFT + (f - displayMin - 0.5) * FRET_SP} cy={strY(4)} r={5} fill="var(--gc-fretboard-pos)" />
            <circle cx={LEFT + (f - displayMin - 0.5) * FRET_SP} cy={strY(1)} r={5} fill="var(--gc-fretboard-pos)" />
          </g>
        ) : (
          <circle key={`m${f}`} cx={LEFT + (f - displayMin - 0.5) * FRET_SP} cy={TOP_Y + BOARD_H / 2} r={6} fill="var(--gc-fretboard-pos)" />
        )
      ))}

      {/* fret wires (fretCount + 1 boundary lines) */}
      {Array.from({ length: fretCount + 1 }).map((_, i) => (
        <line key={`fw${i}`}
          x1={LEFT + i * FRET_SP} y1={TOP_Y}
          x2={LEFT + i * FRET_SP} y2={TOP_Y + BOARD_H}
          stroke="var(--gc-fretboard-fret)" strokeWidth={2} />
      ))}

      {/* strings */}
      {Array.from({ length: N_STRINGS }).map((_, s) => (
        <line key={`s${s}`} x1={LEFT} y1={strY(s)} x2={boardRight} y2={strY(s)}
          stroke="var(--gc-fretboard-str)" strokeWidth={strW(s)} />
      ))}

      {/* nut — thick, drawn over the leftmost fret wire when at the nut */}
      {showNut && (
        <rect x={LEFT - 1} y={TOP_Y - 10} width={NUT_W} height={BOARD_H + 20} fill="var(--gc-fretboard-nut)" />
      )}

      {/* fret numbers (never labels fret 0) */}
      {labelledFrets.map(f => {
        const marker = MARKERS.includes(f);
        return (
          <text key={`fn${f}`} x={LEFT + (f - displayMin - 0.5) * FRET_SP} y={SVG_H - 7}
            textAnchor="middle" fontSize={12}
            fontWeight={marker ? 700 : 400}
            fill={marker ? T.textMuted : T.textDim} opacity={marker ? 0.9 : 0.55}>
            {f}
          </text>
        );
      })}

      {/* string name labels + open-string 'O' when at the nut */}
      {Array.from({ length: N_STRINGS }).map((_, s) => (
        <g key={`sl${s}`}>
          <text x={LABEL_W / 2} y={strY(s) + 4} textAnchor="middle" fontSize={11} fill={T.textDim}>
            {noteName(OPEN_MIDI[s])}
          </text>
        </g>
      ))}

      {/* interactive cells + dots */}
      {Array.from({ length: N_STRINGS }).map((_, s) =>
        cellFrets.map(f => {
          const cx = fretX(f);
          const cy = strY(s);
          const rootHere   = isRoot(s, f);
          const pickedHere = isPicked(s, f);
          const revealHere = showAnswer && isTarget(s, f) && !pickedHere;

          let fill: string | null = null;
          let label = '';
          if (rootHere) { fill = T.primary; label = rootLabel; }
          else if (pickedHere) { fill = feedback!.correct ? T.success : T.error; label = noteName(midiAt(s, f)); }
          else if (revealHere) { fill = T.success; label = noteName(midiAt(s, f)); }

          return (
            <g key={`${s}-${f}`}
              onClick={() => { if (disabled || rootHere) return; navigator.vibrate?.(20); onPick({ string: s, fret: f }); }}
              style={{
                cursor: disabled || rootHere ? 'default' : 'pointer',
                ...(revealHere ? { animation: 'gc-reveal 400ms ease-out', transformBox: 'fill-box', transformOrigin: 'center' } : {}),
              }}>
              <rect x={cx - FRET_SP / 2} y={cy - STR_GAP / 2} width={FRET_SP} height={STR_GAP} fill="transparent" />
              {fill && (
                <>
                  <circle cx={cx} cy={cy} r={DOT_R} fill={fill} stroke="#fff" strokeWidth={2} />
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
