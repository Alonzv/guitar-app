// ── Guitar Composer Design Tokens ──────────────────────────
export const T = {
  bgDeep:     '#243238',           // main background (dark #495D63)
  bgCard:     '#354a51',           // card / panel
  bgInput:    '#2b3f47',           // secondary dark (inputs, inner areas)
  border:     '#495D63',           // all borders
  primary:    '#C44900',           // burnt orange — CTAs, active, root notes
  primaryHov: '#d95200',           // hover state of primary
  primaryBg:  '#321200',           // dark surface for primary accent
  secondary:  '#629677',           // sage green — secondary actions, scale tones
  secondaryBg:'#1a2e24',           // dark surface for secondary accent
  text:       '#F9ECC3',           // cream — primary text
  textMuted:  'rgba(249,236,195,0.55)',
  textDim:    'rgba(249,236,195,0.28)',
  white:      '#F9ECC3',           // alias
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
    color: disabled ? T.textDim : T.text,
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
    color: active ? T.text : T.textMuted,
    transition: 'background 0.15s',
  }),
};
