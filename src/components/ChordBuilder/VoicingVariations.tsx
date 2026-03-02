import React from 'react';
import type { FretPosition } from '../../types/music';
import { MiniFretboard } from '../Fretboard/MiniFretboard';
import { T, card } from '../../theme';

interface Props {
  voicings: FretPosition[][];
  onSelect: (voicing: FretPosition[], index: number) => void;
  selectedIndex?: number;
}

export const VoicingVariations: React.FC<Props> = ({ voicings, onSelect, selectedIndex }) => {
  if (voicings.length === 0) return null;

  return (
    <div style={card({ marginTop: 0 })}>
      <p style={{ margin: '0 0 10px', fontSize: 11, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Voicing Variations · tap to load
      </p>
      <div className="gc-voicing-grid">
        {voicings.map((voicing, i) => {
          const isSelected = i === selectedIndex;
          return (
            <div
              key={i}
              onClick={() => onSelect(voicing, i)}
              style={{
                cursor: 'pointer',
                borderRadius: 10,
                border: `2px solid ${isSelected ? T.secondary : T.border}`,
                background: isSelected ? T.secondaryBg : T.bgInput,
                padding: '6px 4px 2px',
                transition: 'border-color 0.15s, background 0.15s',
              }}
            >
              <MiniFretboard voicing={voicing} dotColor={isSelected ? T.secondary : T.primary} />
            </div>
          );
        })}
      </div>
    </div>
  );
};
