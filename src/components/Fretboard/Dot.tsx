import type { ReactNode } from 'react';

// ── A fretboard dot that moves and sounds ────────────────────────────────────
// Shared by every fretboard. Give a dot a stable `key` that follows the note
// (its string, or its scale degree) and changing x/y slides it to the new
// fret instead of blinking; `glow` swells it and throws a ring while its note
// is sounding. Styles: .gc-dot-* in index.css.

interface Props {
  x: number;
  y: number;
  r: number;
  glow?: boolean;
  ringColor?: string;
  children: ReactNode;   // drawn centred on (0, 0)
}

export function Dot({ x, y, r, glow, ringColor = 'var(--gc-success)', children }: Props) {
  return (
    <g className="gc-dot-pos" style={{ transform: `translate(${x}px, ${y}px)` }}>
      {glow && <circle className="gc-dot-ring" r={r} fill="none" stroke={ringColor} strokeWidth={2} />}
      <g className={glow ? 'gc-dot-glow gc-glow' : 'gc-dot-glow'}>
        <g className="gc-dot-face">{children}</g>
      </g>
    </g>
  );
}
