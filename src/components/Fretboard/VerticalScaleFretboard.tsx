import React from 'react';
import { Note as TonalNote, Scale } from '@tonaljs/tonal';
import { fretToNote, STRING_COUNT, FRET_COUNT } from '../../utils/musicTheory';
import { T } from '../../theme';

interface Props {
  root: string;          // scale root, e.g. "G"
  type: string;          // scale type, e.g. "major"
  tuning?: string[];
}

// Vertical neck: strings as columns (low E … high e, left→right),
// frets as rows (0/open at top → 12 at bottom). Fits mobile portrait.
const COL_STR = ['E', 'A', 'D', 'G', 'B', 'e'];

export const VerticalScaleFretboard: React.FC<Props> = ({ root, type, tuning }) => {
  const scale = Scale.get(`${root} ${type}`);
  const scaleChromas = new Set(
    scale.notes.map(n => TonalNote.chroma(n)).filter((c): c is number => c !== undefined)
  );
  const rootChroma = TonalNote.chroma(root);

  const COL_W = 38;
  const ROW_H = 26;
  const TOP = 22;        // room for open-string notes + string labels
  const LEFT = 16;
  const W = LEFT * 2 + (STRING_COUNT - 1) * COL_W;
  const H = TOP + (FRET_COUNT + 0.5) * ROW_H + 6;

  const colX = (s: number) => LEFT + s * COL_W;
  const rowY = (f: number) => TOP + f * ROW_H;

  const inScale = (s: number, f: number) =>
    scaleChromas.has(TonalNote.chroma(fretToNote(s, f, tuning)) ?? -1);

  const dots: { s: number; f: number; note: string; isRoot: boolean }[] = [];
  for (let s = 0; s < STRING_COUNT; s++) {
    for (let f = 0; f <= FRET_COUNT; f++) {
      if (inScale(s, f)) {
        const note = fretToNote(s, f, tuning);
        dots.push({ s, f, note, isRoot: TonalNote.chroma(note) === rootChroma });
      }
    }
  }

  const DOT_FRETS = [3, 5, 7, 9];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: 280, display: 'block', margin: '0 auto' }}>

      {/* Fretboard background */}
      <rect x={LEFT} y={TOP - 3}
        width={(STRING_COUNT - 1) * COL_W} height={rowY(FRET_COUNT) - TOP + 3}
        fill="var(--gc-fretboard-bg)" />

      {/* Inlay markers */}
      {DOT_FRETS.map(f => (
        <circle key={f} cx={W / 2} cy={rowY(f - 0.5)} r={3.5} fill="var(--gc-fretboard-pos)" />
      ))}
      <circle cx={W / 2 - 7} cy={rowY(11.5)} r={3.5} fill="var(--gc-fretboard-pos)" />
      <circle cx={W / 2 + 7} cy={rowY(11.5)} r={3.5} fill="var(--gc-fretboard-pos)" />

      {/* Fret lines (rows) */}
      {Array.from({ length: FRET_COUNT + 1 }).map((_, f) => (
        <line key={f}
          x1={LEFT} y1={rowY(f)} x2={LEFT + (STRING_COUNT - 1) * COL_W} y2={rowY(f)}
          stroke="var(--gc-fretboard-fret)" strokeWidth={1} />
      ))}

      {/* Strings (columns) — graduating low-E thick */}
      {Array.from({ length: STRING_COUNT }).map((_, s) => (
        <line key={s}
          x1={colX(s)} y1={TOP} x2={colX(s)} y2={rowY(FRET_COUNT)}
          stroke="var(--gc-fretboard-str)" strokeWidth={1.5 + s * 0.22} />
      ))}

      {/* Nut — drawn last to cover overlapping lines */}
      <rect x={LEFT} y={TOP - 3} width={(STRING_COUNT - 1) * COL_W} height={5} fill="var(--gc-fretboard-nut)" />

      {/* String labels (top) */}
      {COL_STR.map((lbl, s) => (
        <text key={s} x={colX(s)} y={11} textAnchor="middle" fontSize={9} fontWeight={600} fill={T.textMuted}>
          {lbl}
        </text>
      ))}

      {/* Scale dots */}
      {dots.map((d, i) => (
        <g key={i}>
          <circle cx={colX(d.s)} cy={rowY(d.f - 0.5)} r={9}
            fill={d.isRoot ? T.primary : T.secondary}
            stroke={d.isRoot ? T.text : 'none'} strokeWidth={d.isRoot ? 1.9 : 0}
            opacity={d.isRoot ? 0.95 : 0.8} />
          <text x={colX(d.s)} y={rowY(d.f - 0.5) + 3} textAnchor="middle" fontSize={7.5} fill="#fff" fontWeight="700">
            {d.note}
          </text>
        </g>
      ))}

      {/* Fret numbers (left edge) */}
      {[3, 5, 7, 9, 12].map(f => (
        <text key={f} x={4} y={rowY(f - 0.5) + 3} fontSize={8} fill={T.textMuted}>{f}</text>
      ))}
    </svg>
  );
};
