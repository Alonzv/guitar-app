import { T } from '../theme';

// ── Wordmark ─────────────────────────────────────────────────────────────────
// SCALEUP in the display face — condensed, black, uppercase — with "Up" in the
// one colour. Rendered as text so it follows the theme and the page language.

export function Wordmark({ size = 64 }: { size?: number }) {
  return (
    <span aria-label="ScaleUp" style={{
      fontFamily: 'var(--su-display)', fontStretch: '62%', fontWeight: 900, fontSize: size,
      lineHeight: 0.8, letterSpacing: '-0.01em', textTransform: 'uppercase', color: T.text,
      display: 'inline-block', whiteSpace: 'nowrap',
    }}>
      Scale<span style={{ color: T.brandAccent }}>Up</span>
    </span>
  );
}
