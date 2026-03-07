// ── Guitar Composer Design Tokens ──────────────────────────
export const T = {
  bgDeep:     '#F7F0DC',           // warm cream — main background
  bgCard:     '#EDE6C8',           // slightly darker cream — cards / panels
  bgInput:    '#E8DDBA',           // input areas, secondary surfaces
  border:     '#CDBF96',           // tan / golden borders
  primary:    '#C44900',           // burnt orange — CTAs, active, root notes (pick color)
  primaryHov: '#d95200',           // hover state of primary
  primaryBg:  '#FAEBD4',           // very light warm surface for primary accent
  secondary:  '#629677',           // sage green — secondary actions, scale tones
  secondaryBg:'#DDF0EB',           // light surface for secondary accent
  coral:      '#E8736A',           // coral / salmon — "Up" accent color
  text:       '#2E4A5A',           // dark slate blue — primary text
  textMuted:  'rgba(46,74,90,0.58)',
  textDim:    'rgba(46,74,90,0.33)',
  white:      '#F9ECC3',           // warm cream — for text on colored backgrounds
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
