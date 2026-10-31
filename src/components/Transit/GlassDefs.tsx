// The refraction map behind `.lg-bar` (Chromium honours url() in
// backdrop-filter; Safari falls back to plain blur). Mounted once per shell.
export function GlassDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
      <filter id="lgRefract" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.004 0.009" numOctaves="1" seed="7" result="n" />
        <feGaussianBlur in="n" stdDeviation="4" result="b" />
        <feDisplacementMap in="SourceGraphic" in2="b" scale="18" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  );
}
