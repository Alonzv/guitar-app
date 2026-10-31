import { T } from '../theme';

// ── Wordmark ─────────────────────────────────────────────────────────────────
// "ScaleUp" in the system display face, with "Up" in the tint. Rendered as
// text so it follows the page language and the theme.

export function Wordmark({ size = 34 }: { size?: number | string }) {
  return (
    <span aria-label="ScaleUp" style={{
      fontFamily: 'var(--su-display)', fontWeight: 700, fontSize: size,
      lineHeight: 1.1, letterSpacing: '-0.03em', color: T.text,
      display: 'inline-block', whiteSpace: 'nowrap', direction: 'ltr',
    }}>
      Scale<span style={{ color: T.tintLabel }}>Up</span>
    </span>
  );
}
