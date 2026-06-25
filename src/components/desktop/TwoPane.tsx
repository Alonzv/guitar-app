import React from 'react';

interface Props {
  left: React.ReactNode;
  right: React.ReactNode;
  leftWidth?: number;
  gap?: number;
  stickyRight?: boolean;
}

export function TwoPane({ left, right, leftWidth = 340, gap = 30, stickyRight = true }: Props) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `${leftWidth}px 1fr`,
      gap,
      alignItems: 'start',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {left}
      </div>
      <div style={stickyRight ? { position: 'sticky', top: 24 } : undefined}>
        {right}
      </div>
    </div>
  );
}
