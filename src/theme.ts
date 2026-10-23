// ── Guitar Composer Design Tokens ──────────────────────────
// Values are CSS custom-property references so light/dark themes
// can be toggled by adding/removing the 'dark' class on <body>.
export const T = {
  bgDeep:          'var(--gc-bg-deep)',
  bgCard:          'var(--gc-bg-card)',
  bgInput:         'var(--gc-bg-input)',
  border:          'var(--gc-border)',
  // Wordmark-only red accent — deliberately separate from `primary` so
  // action/confirm buttons stay black while the logo keeps its red "Up".
  brandAccent:     'var(--gc-brand-accent)',
  primary:         'var(--gc-primary)',
  primaryHov:      'var(--gc-primary-hov)',
  primaryBg:       'var(--gc-primary-bg)',
  secondary:       'var(--gc-secondary)',
  secondaryBg:     'var(--gc-secondary-bg)',
  coral:           'var(--gc-coral)',
  text:            'var(--gc-text)',
  textMuted:       'var(--gc-text-muted)',
  textDim:         'var(--gc-text-dim)',
  white:           'var(--gc-white)',
  primarySoft:     'var(--gc-primary-soft)',
  primaryGlow:     'var(--gc-primary-glow)',
  whiteSoft:       'var(--gc-white-soft)',
  secondaryFaint:  'var(--gc-secondary-faint)',
  coralFaint:      'var(--gc-coral-faint)',
  coralFaint2:     'var(--gc-coral-faint2)',
  offset:          'var(--gc-offset)',
  offsetSm:        'var(--gc-offset-sm)',
  // Semantic feedback (ear-training success / error) — palette-derived, never
  // generic green/red. See --gc-success / --gc-error in index.css.
  success:         'var(--gc-success)',
  successSoft:     'var(--gc-success-soft)',
  error:           'var(--gc-error)',
  errorSoft:       'var(--gc-error-soft)',
  // Transit
  hairline:        'var(--su-hairline)',
  onPrimary:       'var(--su-on-primary)',
} as const;

export type Theme = typeof T;

// Alpha variant of any palette color. Unlike hex concatenation (`color + '33'`),
// this also works with var() tokens, so theme-aware colors can be dimmed too.
export const alpha = (color: string, pct: number): string =>
  `color-mix(in srgb, ${color} ${pct}%, transparent)`;

// A section, not a box: a 2px ink rule on top and room under it. Transit
// builds structure from rules rather than card outlines or shadows.
export const card = (extra?: React.CSSProperties): React.CSSProperties => {
  const { padding: explicitPad, ...rest } = extra ?? {};
  return {
    background: 'transparent',
    borderRadius: 0,
    padding: explicitPad ?? '14px 0 0',
    borderTop: `var(--su-rule) solid ${T.border}`,
    ...rest,
  };
};

// Display type — Archivo condensed for posters and big numbers, semi-condensed
// for keys and list items. Spread into a style.
export const display = (size: number, weight = 900): React.CSSProperties => ({
  fontFamily: 'var(--su-display)', fontStretch: 'var(--su-display-cond)' as React.CSSProperties['fontStretch'],
  fontWeight: weight, fontSize: size, lineHeight: 0.8, letterSpacing: '-0.02em',
});
export const semi = (size: number, weight = 800): React.CSSProperties => ({
  fontFamily: 'var(--su-display)', fontStretch: 'var(--su-display-semi)' as React.CSSProperties['fontStretch'],
  fontWeight: weight, fontSize: size, lineHeight: 1,
});
// The small mono label above a group: 10px, wide tracking, muted.
export const label: React.CSSProperties = {
  margin: 0, fontFamily: 'var(--gc-font)', fontSize: 10, letterSpacing: '0.14em',
  textTransform: 'uppercase', color: T.textMuted,
};

// Buttons are pills (1.5px ink outline; selected = filled ink). Keys and tiles
// are square (see key()). Cobalt is kept for the one primary action (cta).
// Text on a filled dot or key: white on cobalt, paper on ink (sand at night).
export const onFill = (fill: string | undefined): string => fill === T.primary ? T.onPrimary : T.white;

export const btn = {
  primary: (disabled?: boolean): React.CSSProperties => ({
    padding: '12px 18px', minHeight: 44,
    borderRadius: 'var(--su-pill)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontWeight: 700, fontSize: 13, letterSpacing: '0.1em',
    background: disabled ? T.bgInput : T.secondary,
    color: disabled ? T.textDim : T.white,
    border: `1.5px solid ${disabled ? T.bgInput : T.secondary}`,
  }),
  secondary: (): React.CSSProperties => ({
    padding: '12px 18px', minHeight: 44,
    borderRadius: 'var(--su-pill)',
    border: `1.5px solid ${T.text}`,
    cursor: 'pointer',
    fontWeight: 700, fontSize: 13, letterSpacing: '0.1em',
    background: 'transparent',
    color: T.text,
  }),
  pill: (active: boolean): React.CSSProperties => ({
    padding: '0 14px', minHeight: 36,
    borderRadius: 'var(--su-pill)',
    border: `1.5px solid ${T.text}`,
    cursor: 'pointer',
    fontSize: 12, fontWeight: 700,
    background: active ? T.secondary : 'transparent',
    color: active ? T.white : T.text,
  }),
  cta: (disabled?: boolean): React.CSSProperties => ({
    padding: '12px 22px', minHeight: 44,
    borderRadius: 'var(--su-pill)', border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontWeight: 700, fontSize: 13, letterSpacing: '0.14em',
    background: disabled ? T.bgInput : T.primary,
    color: disabled ? T.textDim : 'var(--su-on-primary)',
  }),
};

// A square key (roots, notes, degrees): chip grey, or ink when selected.
export const key = (active: boolean): React.CSSProperties => ({
  minHeight: 44, borderRadius: 0, border: 'none', cursor: 'pointer',
  background: active ? T.secondary : T.bgInput,
  color: active ? T.white : T.text,
  ...semi(17),
});
