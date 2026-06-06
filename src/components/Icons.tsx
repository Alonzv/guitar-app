import React from 'react';

interface P { size?: number }

const base: React.CSSProperties = { display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 };

// ── Two eighth notes (Theory, shared chord) ───────────────────────────────────
export function IconNote({ size = 16 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden style={base}>
      <ellipse cx="4.2" cy="13.2" rx="2.6" ry="2" transform="rotate(-18 4.2 13.2)" />
      <ellipse cx="10.6" cy="11.4" rx="2.6" ry="2" transform="rotate(-18 10.6 11.4)" />
      <rect x="6.5" y="2.5" width="1.3" height="10.7" rx="0.5" />
      <rect x="12.9" y="0.8" width="1.3" height="10.5" rx="0.5" />
      <polygon points="6.5,2.5 14.2,0.8 14.2,2.8 6.5,4.5" />
    </svg>
  );
}

// ── Three horizontal sliders (Tools) ──────────────────────────────────────────
export function IconSliders({ size = 16 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden style={base}>
      <line x1="1" y1="4"  x2="15" y2="4"  />
      <line x1="1" y1="8"  x2="15" y2="8"  />
      <line x1="1" y1="12" x2="15" y2="12" />
      <circle cx="5"  cy="4"  r="2" fill="currentColor" stroke="none" />
      <circle cx="10" cy="8"  r="2" fill="currentColor" stroke="none" />
      <circle cx="6"  cy="12" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

// ── Chord diagram grid (Chords sub) ───────────────────────────────────────────
export function IconChord({ size = 16 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden style={base}>
      {/* Nut */}
      <rect x="2" y="2" width="12" height="1.8" rx="0.5" />
      {/* Strings (vertical) */}
      {[4, 8, 12].map(x => <rect key={x} x={x - 0.6} y="2" width="1.2" height="12" rx="0.4" opacity={0.4} />)}
      {/* Frets (horizontal) */}
      {[6, 10, 14].map(y => <rect key={y} x="2" y={y - 0.5} width="12" height="1" rx="0.4" opacity={0.4} />)}
      {/* Dots */}
      <circle cx="4"  cy="7.5" r="2.2" />
      <circle cx="8"  cy="11.5" r="2.2" />
      <circle cx="12" cy="7.5" r="2.2" />
    </svg>
  );
}

// ── Ascending staircase (Scales sub) ──────────────────────────────────────────
export function IconSteps({ size = 16 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={base}>
      <polyline points="1,14 1,11 5,11 5,7.5 9,7.5 9,4 13,4 13,2" />
    </svg>
  );
}

// ── Triangle with vertex dots (Triads sub) ────────────────────────────────────
export function IconTriangle({ size = 16 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden style={base}>
      <polygon points="8,1 15,14 1,14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="8"  cy="1.5" r="2.2" fill="currentColor" />
      <circle cx="1.5" cy="14" r="2.2" fill="currentColor" />
      <circle cx="14.5" cy="14" r="2.2" fill="currentColor" />
    </svg>
  );
}

// ── Two pitches with arrow (Intervals sub) ────────────────────────────────────
export function IconInterval({ size = 16 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden style={base}>
      {/* Left note */}
      <ellipse cx="2.8" cy="13.5" rx="2.2" ry="1.7" transform="rotate(-20 2.8 13.5)" />
      <rect x="4.7" y="4.5" width="1.2" height="9" rx="0.4" />
      {/* Right note */}
      <ellipse cx="10.8" cy="13.5" rx="2.2" ry="1.7" transform="rotate(-20 10.8 13.5)" />
      <rect x="12.7" y="2.5" width="1.2" height="11" rx="0.4" />
      {/* Horizontal arrow */}
      <rect x="5" y="7.4" width="6.5" height="1.2" rx="0.4" />
      <polygon points="11.5,5.5 14,8 11.5,10.5" />
      <polygon points="5,5.5 2.5,8 5,10.5" />
    </svg>
  );
}

// ── Concentric circles (Wheel sub) ───────────────────────────────────────────
export function IconWheel({ size = 16 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden style={base}>
      <circle cx="8" cy="8" r="6.5" />
      <circle cx="8" cy="8" r="3.2" />
      {/* Radial spokes */}
      {[0, 60, 120, 180, 240, 300].map(deg => {
        const r = Math.PI * deg / 180;
        const x1 = 8 + Math.cos(r) * 3.5, y1 = 8 + Math.sin(r) * 3.5;
        const x2 = 8 + Math.cos(r) * 6.2, y2 = 8 + Math.sin(r) * 6.2;
        return <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth="1.2" />;
      })}
    </svg>
  );
}

// ── Magnifying glass (Search / By Name / Analyze empty) ───────────────────────
export function IconSearch({ size = 16 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden style={base}>
      <circle cx="6.8" cy="6.8" r="4.5" />
      <line x1="10.2" y1="10.2" x2="14.5" y2="14.5" />
    </svg>
  );
}

// ── Bar chart (Analyze) ───────────────────────────────────────────────────────
export function IconBars({ size = 16 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden style={base}>
      <rect x="1"  y="8"  width="3.5" height="7" rx="0.7" />
      <rect x="6"  y="4"  width="3.5" height="11" rx="0.7" />
      <rect x="11" y="6"  width="3.5" height="9" rx="0.7" />
      <rect x="1"  y="14.5" width="13.5" height="1" rx="0.4" />
    </svg>
  );
}

// ── Guitar silhouette (By Ear) ────────────────────────────────────────────────
export function IconGuitar({ size = 16 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={base}>
      {/* Body */}
      <path d="M7 10 C3.5 10 2 12 2 13.5 C2 15 3.5 15.5 5.5 15 C7 14.5 8 13 8 13 C8 13 9 14.5 10.5 15 C12.5 15.5 14 15 14 13.5 C14 12 12.5 10 9 10 Z" />
      {/* Neck */}
      <rect x="7.2" y="2" width="1.6" height="8.5" rx="0.5" />
      {/* Headstock */}
      <rect x="6" y="1" width="4" height="2.5" rx="0.6" />
      {/* Sound hole */}
      <circle cx="8" cy="12.5" r="1.5" />
      {/* Fret lines */}
      <line x1="7.2" y1="5" x2="8.8" y2="5" />
      <line x1="7.2" y1="7.5" x2="8.8" y2="7.5" />
    </svg>
  );
}

// ── Crescent moon ─────────────────────────────────────────────────────────────
export function IconMoon({ size = 16 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden style={base}>
      <path d="M12.5 10 A6 6 0 1 1 6 3.5 A4.5 4.5 0 1 0 12.5 10 Z" />
    </svg>
  );
}

// ── Sun with rays ─────────────────────────────────────────────────────────────
export function IconSun({ size = 16 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden style={base}>
      <circle cx="8" cy="8" r="3" fill="currentColor" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map(deg => {
        const r = Math.PI * deg / 180;
        return (
          <line key={deg}
            x1={8 + Math.cos(r) * 4.2} y1={8 + Math.sin(r) * 4.2}
            x2={8 + Math.cos(r) * 6}   y2={8 + Math.sin(r) * 6}
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}

// ── Microphone ────────────────────────────────────────────────────────────────
export function IconMic({ size = 16 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden style={base}>
      <rect x="5" y="1.5" width="6" height="7.5" rx="3" />
      <path d="M2.5 8.5 A5.5 5.5 0 0 0 13.5 8.5" />
      <line x1="8" y1="14" x2="8" y2="11" />
      <line x1="5" y1="14.5" x2="11" y2="14.5" />
    </svg>
  );
}

// ── Metronome pendulum ────────────────────────────────────────────────────────
export function IconMetronome({ size = 16 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={base}>
      {/* Trapezoid body */}
      <polygon points="4,14 12,14 10,2 6,2" />
      {/* Pendulum */}
      <line x1="8" y1="13" x2="12" y2="5" strokeWidth="1.8" />
      {/* Weight */}
      <circle cx="12" cy="5" r="1.6" fill="currentColor" stroke="none" />
      {/* Base mark */}
      <line x1="3" y1="14" x2="13" y2="14" strokeWidth="2" />
    </svg>
  );
}

// ── Warning triangle ──────────────────────────────────────────────────────────
export function IconWarn({ size = 32 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={base}>
      <polygon points="8,1.5 14.5,13.5 1.5,13.5" />
      <line x1="8" y1="6.5" x2="8" y2="9.5" />
      <circle cx="8" cy="11.5" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

// ── Clipboard (Copy) ──────────────────────────────────────────────────────────
export function IconClipboard({ size = 16 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={base}>
      <rect x="4" y="3.5" width="9" height="11" rx="1.5" />
      <path d="M6 3.5 V2.5 A2 2 0 0 1 10 2.5 V3.5" />
    </svg>
  );
}

// ── Link / chain (Share) ──────────────────────────────────────────────────────
export function IconLink({ size = 16 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={base}>
      <path d="M6.5 9.5 A3 3 0 0 0 9.5 12 A3 3 0 0 0 12.5 9 L13.5 8 A3.5 3.5 0 0 0 8.5 3 L7.5 4" />
      <path d="M9.5 6.5 A3 3 0 0 0 6.5 4 A3 3 0 0 0 3.5 7 L2.5 8 A3.5 3.5 0 0 0 7.5 13 L8.5 12" />
    </svg>
  );
}

// ── Keyboard/piano (By Name) ──────────────────────────────────────────────────
export function IconPiano({ size = 16 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden style={base}>
      {/* White keys */}
      {[1, 3.2, 5.4, 7.6, 9.8, 12, 14.2].map((x, i) => (
        <rect key={i} x={x - 0.9} y="4" width="1.8" height="9" rx="0.4" />
      ))}
      {/* White key outlines */}
      <rect x="1" y="4" width="13.8" height="9" rx="0.5" fill="none" stroke="currentColor" strokeWidth="0.8" />
      {[2.2, 4.4, 8.5, 10.7, 12.9].map((x, i) => (
        <rect key={i} x={x - 0.8} y="4" width="1.6" height="5.5" rx="0.3" fill="#222" />
      ))}
    </svg>
  );
}

// ── Fretboard icon (Fretboard/Tab toggle) ────────────────────────────────────
export function IconFretboard({ size = 16 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden style={base}>
      {/* Neck outline */}
      <rect x="1" y="3" width="14" height="10" rx="1" />
      {/* Nut */}
      <line x1="3" y1="3" x2="3" y2="13" strokeWidth="2" />
      {/* Strings */}
      {[5, 7, 9, 11].map(y => <line key={y} x1="1" y1={y} x2="15" y2={y} />)}
      {/* Frets */}
      {[6, 10].map(x => <line key={x} x1={x} y1="3" x2={x} y2="13" />)}
      {/* Dots */}
      <circle cx="8" cy="7" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="8" cy="11" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

// ── Sheet music lines (Tab notation) ─────────────────────────────────────────
export function IconSheet({ size = 16 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden style={base}>
      {[3, 6, 9, 12].map(y => <rect key={y} x="2" y={y - 0.5} width="12" height="1" rx="0.4" />)}
      <rect x="2" y="2.5" width="1.5" height="11" rx="0.4" />
    </svg>
  );
}

// ── Minor/moon for AI ─────────────────────────────────────────────────────────
export { IconMoon as IconMinor };

// ── Text/pencil for Lyrics ────────────────────────────────────────────────────
export function IconPencil({ size = 16 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={base}>
      <path d="M10.5 2.5 L13.5 5.5 L5 14 L1.5 14.5 L2 11 Z" />
      <line x1="8" y1="5" x2="11" y2="8" />
    </svg>
  );
}

// ── Complexity icons for AI ───────────────────────────────────────────────────
export function IconSimple({ size = 16 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden style={base}>
      <rect x="2" y="10" width="4" height="5" rx="0.5" />
      <rect x="8" y="6"  width="4" height="9" rx="0.5" opacity={0.4} />
      <rect x="14" y="3" width="4" height="12" rx="0.5" opacity={0.2} />
    </svg>
  );
}

export function IconMedium({ size = 16 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden style={base}>
      <rect x="1"  y="10" width="4" height="5" rx="0.5" />
      <rect x="6.5" y="6"  width="4" height="9" rx="0.5" />
      <rect x="12" y="3"  width="4" height="12" rx="0.5" opacity={0.4} />
    </svg>
  );
}

export function IconComplex({ size = 16 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden style={base}>
      <rect x="1"  y="10" width="4" height="5" rx="0.5" />
      <rect x="6.5" y="6"  width="4" height="9" rx="0.5" />
      <rect x="12" y="3"  width="4" height="12" rx="0.5" />
    </svg>
  );
}

// ── Voicing paths (connected dots across neck) ───────────────────────────────
export function IconPath({ size = 16 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden style={base}>
      <circle cx="2.5" cy="13"  r="1.8" fill="currentColor" stroke="none" />
      <circle cx="8"   cy="3"   r="1.8" fill="currentColor" stroke="none" />
      <circle cx="13.5" cy="10" r="1.8" fill="currentColor" stroke="none" />
      <polyline points="2.5,11.2 8,4.8 13.5,8.2" />
    </svg>
  );
}
