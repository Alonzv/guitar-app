// ── Guitar Composer Design Tokens ──────────────────────────
// Values are CSS custom-property references so light/dark themes
// can be toggled by adding/removing the 'dark' class on <body>.
export const T = {
  bgDeep:          'var(--gc-bg-deep)',
  bgCard:          'var(--gc-bg-card)',
  bgInput:         'var(--gc-bg-input)',
  border:          'var(--gc-border)',
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
  // Alpha / translucent variants (previously written as ${T.x}HH hex suffix)
  primarySoft:     'var(--gc-primary-soft)',    // ≈ primary @ 12 %
  primaryGlow:     'var(--gc-primary-glow)',    // ≈ primary @ 33 % (box-shadow)
  whiteSoft:       'var(--gc-white-soft)',      // ≈ white   @ 73 %
  secondaryFaint:  'var(--gc-secondary-faint)', // ≈ secondary @ 27 %
  coralFaint:      'var(--gc-coral-faint)',     // ≈ coral   @ 9 %
  coralFaint2:     'var(--gc-coral-faint2)',    // ≈ coral   @ 13 %
} as const;

export type Theme = typeof T;

// Shared card style — padding uses a CSS variable so media queries can scale it
export const card = (extra?: React.CSSProperties): React.CSSProperties => {
  const { padding: explicitPad, ...rest } = extra ?? {};
  return {
    background: T.bgCard,
    borderRadius: 14,
    padding: explicitPad ?? 'var(--gc-card-pad)',
    border: `1px solid ${T.border}`,
    ...rest,
  };
};

// Button variants
export const btn = {
  primary: (disabled?: boolean): React.CSSProperties => ({
    padding: '11px 0',
    borderRadius: 10,
    border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontWeight: 700,
    fontSize: 14,
    background: disabled ? T.border : T.primary,
    color: disabled ? T.textDim : T.white,
    transition: 'background 0.15s',
  }),
  secondary: (): React.CSSProperties => ({
    padding: '11px 0',
    borderRadius: 10,
    border: `1px solid ${T.border}`,
    cursor: 'pointer',
    fontWeight: 500,
    fontSize: 14,
    background: T.bgInput,
    color: T.textMuted,
  }),
  pill: (active: boolean): React.CSSProperties => ({
    padding: '5px 14px',
    borderRadius: 20,
    border: 'none',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: active ? 600 : 400,
    background: active ? T.primary : T.bgInput,
    color: active ? T.white : T.textMuted,
    transition: 'background 0.15s',
  }),
};
