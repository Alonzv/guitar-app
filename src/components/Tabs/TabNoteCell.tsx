import { T } from '../../theme';

// ── Shared tab-grid cell ──────────────────────────────────────────────────────
// The single source of truth for how one tab cell (fret number + technique
// marks + hover/selection feedback) is drawn. Used by BOTH the Tab Builder
// and the Melody Harmonizer so the two editors can never drift apart again.
//
// Layout contract: the parent renders a flex row of these cells (plus its own
// string label / bar-line separators); each cell is a fixed cw×ch box with
// the string line through its vertical center.

export interface TabCellData {
  fret: string;
  tech?: string; // 'h' | 'p' | '/' | '\\' | 'b' | '~'
}

interface Props {
  cell: TabCellData;
  cw: number;
  ch: number;
  fs: number;
  circleD: number;
  isSel?: boolean;
  isHov?: boolean;
  editable?: boolean;
  onClick?: () => void;
  onMouseEnter?: () => void;
  /** Bold the fret number (harmonizer: the user's original melody in results). */
  emphasized?: boolean;
  /** Highlighter square drawn behind the note (harmonizer melody mark). */
  markColor?: string;
  /** Fret number color override (harmonizer: blue for AI-added harmony). */
  fretColor?: string;
  /** Render the harmonizer's › anchor marker at the cell's top-left. */
  anchorMark?: boolean;
}

export function TabNoteCell({
  cell, cw, ch, fs, circleD,
  isSel = false, isHov = false, editable = false,
  onClick, onMouseEnter,
  emphasized = false, markColor, fretColor, anchorMark = false,
}: Props) {
  return (
    <div
      // onClick isn't gated on `editable` — result views pass a click handler
      // for revoicable columns while staying non-editable.
      onClick={onClick}
      onMouseEnter={editable ? onMouseEnter : undefined}
      style={{
        width: cw, height: ch, flexShrink: 0, position: 'relative',
        cursor: editable || onClick ? 'pointer' : 'default',
      }}
    >
      {/* String line through vertical center */}
      <div style={{
        position: 'absolute', top: '50%', left: 0, right: 0, height: 0,
        borderTop: `2px solid ${T.border}`, transform: 'translateY(-0.5px)',
        pointerEvents: 'none',
      }} />

      {/* Hover circle (light) */}
      {isHov && !isSel && (
        <div style={{
          position: 'absolute', width: circleD, height: circleD, borderRadius: 0,
          background: 'var(--gc-error-soft)',
          top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
        }} />
      )}

      {/* Selected circle (solid) */}
      {isSel && (
        <div style={{
          position: 'absolute', width: circleD, height: circleD, borderRadius: 0,
          background: 'var(--gc-error-soft)',
          top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
        }} />
      )}

      {/* Highlighter behind the note (e.g. harmonizer melody mark) */}
      {markColor && cell.fret !== '' && (
        <div style={{
          position: 'absolute', width: circleD, height: circleD, background: markColor,
          top: '50%', left: '50%', transform: 'translate(-50%,-50%)', pointerEvents: 'none',
        }} />
      )}

      {/* Anchor marker */}
      {anchorMark && (
        <span style={{ position: 'absolute', top: -2, left: 2, fontSize: 12, fontWeight: 700, color: T.secondary, lineHeight: 1, zIndex: 2, pointerEvents: 'none' }}>
          ›
        </span>
      )}

      {/* Fret number */}
      {cell.fret !== '' && (
        <span style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          fontSize: fs, fontFamily: 'monospace',
          fontWeight: emphasized ? 700 : 400,
          color: fretColor ?? T.text,
          lineHeight: 1, zIndex: 1,
        }}>
          {cell.fret}
        </span>
      )}

      {/* Technique marks */}
      {(cell.tech === '/' || cell.tech === '\\') && (
        <span style={{
          position: 'absolute', top: '50%', right: 0,
          transform: 'translate(50%, -50%)',
          fontSize: Math.round(fs * 1.5), fontFamily: 'monospace',
          fontWeight: 400, color: T.coral,
          lineHeight: 1, zIndex: 2, pointerEvents: 'none',
        }}>
          {cell.tech}
        </span>
      )}
      {(cell.tech === 'h' || cell.tech === 'p') && (
        <span style={{
          position: 'absolute', top: -2, right: 0,
          transform: 'translateX(50%)',
          fontSize: Math.round(fs * 1.1), fontFamily: 'monospace',
          fontWeight: 400, fontStyle: 'italic', color: T.coral,
          lineHeight: 1, zIndex: 2, pointerEvents: 'none',
        }}>
          {cell.tech}
        </span>
      )}
      {cell.tech === 'b' && (
        <svg
          width={Math.round(cw * 0.7)} height={Math.round(ch * 0.32)}
          viewBox="0 0 20 8"
          style={{
            position: 'absolute', top: 0, right: 0,
            transform: 'translateX(50%)',
            zIndex: 2, pointerEvents: 'none',
          }}>
          <path d="M 1 7 Q 10 -3 19 7" fill="none"
            stroke="currentColor" strokeWidth="1.6"
            strokeLinecap="round" style={{ color: T.coral }} />
        </svg>
      )}
      {cell.tech === '~' && (
        <span style={{
          position: 'absolute', top: -1, left: '50%',
          transform: 'translateX(-50%)',
          fontSize: Math.round(fs * 1.3), fontFamily: 'monospace',
          fontWeight: 400, color: T.coral,
          lineHeight: 1, zIndex: 2, pointerEvents: 'none',
          letterSpacing: -1,
        }}>
          ~
        </span>
      )}
    </div>
  );
}
