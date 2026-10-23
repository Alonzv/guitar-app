import type { CSSProperties, ReactNode } from 'react';
import { selectPill } from './ui';

/** A native <select> drawn as an outlined pill with a ▾ at its end. */
export function SelectPill({ value, onChange, children, label, style }: {
  value: string; onChange: (v: string) => void; children: ReactNode; label: string; style?: CSSProperties;
}) {
  return (
    <span style={{ position: 'relative', display: 'inline-flex', minWidth: 0, ...style }}>
      <select value={value} onChange={e => onChange(e.target.value)} aria-label={label} style={selectPill({ width: '100%' })}>
        {children}
      </select>
      <span aria-hidden style={{ position: 'absolute', insetInlineEnd: 13, top: '50%', transform: 'translateY(-50%)', fontSize: 10, pointerEvents: 'none' }}>▾</span>
    </span>
  );
}
