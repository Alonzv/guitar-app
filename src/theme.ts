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
} as const;

export type Theme = typeof T;

// Shared card style — flat Arturia-style, no border-radius
export const card = (extra?: React.CSSProperties): React.CSSProperties => {
  const { padding: explicitPad, ...rest } = extra ?? {};
  return {
    background: T.bgCard,
    borderRadius: 0,
    padding: explicitPad ?? 'var(--gc-card-pad)',
    border: `1px solid ${T.border}`,
    borderLeft: '4px solid var(--gc-bar-color)',
    ...rest,
  };
};

// Button variants — sharp corners, flat offset shadow
export const btn = {
  primary: (disabled?: boolean): React.CSSProperties => ({
    padding: '12px 0',
    borderRadius: 0,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontWeight: 400,
    fontSize: 15,
    background: disabled ? T.border : T.primary,
    color: disabled ? T.textDim : T.white,
    borderLeft: disabled ? 'none' : '4px solid var(--gc-bar-color)',
    transition: 'background 0.1s',
  }),
  secondary: (): React.CSSProperties => ({
    padding: '12px 0',
    borderRadius: 0,
    border: `1px solid ${T.border}`,
    cursor: 'pointer',
    fontWeight: 400,
    fontSize: 15,
    background: T.bgInput,
    color: T.textMuted,
    borderLeft: '4px solid var(--gc-bar-color)',
  }),
  pill: (active: boolean): React.CSSProperties => ({
    padding: '5px 14px',
    borderRadius: 0,
    border: active ? 'none' : `1px solid ${T.border}`,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: active ? 500 : 400,
    background: active ? T.primary : T.bgInput,
    color: active ? T.white : T.textMuted,
    borderLeft: '3px solid var(--gc-bar-color)',
    transition: 'background 0.1s',
  }),
};
