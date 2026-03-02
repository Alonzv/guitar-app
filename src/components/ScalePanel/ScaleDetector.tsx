import React from 'react';
import type { ChordInProgression, ScaleMatch } from '../../types/music';
import { detectScales } from '../../utils/scaleUtils';
import { T, card } from '../../theme';

interface Props {
  progression: ChordInProgression[];
  onSelectScale: (scale: ScaleMatch) => void;
}

export const ScaleDetector: React.FC<Props> = ({ progression, onSelectScale }) => {
  const scales = detectScales(progression);

  if (progression.length === 0) return (
    <div style={{ textAlign: 'center', padding: '48px 16px', color: T.textDim, fontSize: 14, border: `1px dashed ${T.border}`, borderRadius: 14 }}>
      Add chords to the progression to detect matching scales
    </div>
  );

  if (scales.length === 0) return (
    <div style={{ textAlign: 'center', padding: 24, color: T.textMuted, fontSize: 13 }}>
      Could not detect matching scales
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ margin: '0 0 4px', fontSize: 12, color: T.textMuted }}>
        Top scales matching your chord progression:
      </p>
      {scales.map((scale, i) => (
        <button key={i} onClick={() => onSelectScale(scale)} style={{
          ...card(),
          cursor: 'pointer', textAlign: 'left', color: T.text,
          borderLeft: `3px solid ${i === 0 ? T.primary : T.secondary}`,
          transition: 'background 0.15s',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 16, fontWeight: 800 }}>{scale.name}</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: i === 0 ? T.primary : T.secondary }}>
              {scale.fitPercent}%
            </span>
          </div>
          {/* Fit bar */}
          <div style={{ height: 5, background: T.bgInput, borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
            <div style={{
              height: '100%', borderRadius: 3,
              background: i === 0 ? T.primary : T.secondary,
              width: `${scale.fitPercent}%`, transition: 'width 0.4s',
            }} />
          </div>
          <div style={{ display: 'flex', gap: 16, fontSize: 11, color: T.textMuted }}>
            <span>Root: <strong style={{ color: T.text }}>{scale.root}</strong></span>
            <span>Type: <strong style={{ color: T.text, textTransform: 'capitalize' }}>{scale.type}</strong></span>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: i === 0 ? T.primary : T.secondary }}>
            Tap to visualize →
          </div>
        </button>
      ))}
    </div>
  );
};
