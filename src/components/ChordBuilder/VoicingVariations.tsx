import React, { useMemo } from 'react';
import type { FretPosition } from '../../types/music';
import { MiniFretboard } from '../Fretboard/MiniFretboard';
import { buildChromaColorMap } from './ChordStructure';
import { fretToNote } from '../../utils/musicTheory';
import { Note } from '@tonaljs/tonal';
import { T, card } from '../../theme';

interface Props {
  voicings: FretPosition[][];
  onSelect: (voicing: FretPosition[], index: number) => void;
  selectedIndex?: number;
  chordName?: string;
  tuning?: string[];
}

export const VoicingVariations: React.FC<Props> = ({ voicings, onSelect, selectedIndex, chordName, tuning }) => {
  const chromaColors = useMemo(
    () => chordName ? buildChromaColorMap(chordName) : null,
    [chordName]
  );

  if (voicings.length === 0) return null;

  return (
    <div style={card({ marginTop: 0 })}>
      <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Voicing Variations · tap to load
      </p>
      <div className="gc-voicing-grid">
        {voicings.map((voicing, i) => {
          const isSelected = i === selectedIndex;

          const dotColors = chromaColors
            ? voicing.map(p => {
                const note = fretToNote(p.string, p.fret, tuning);
                const chroma = Note.chroma(note);
                return chroma != null ? (chromaColors.get(chroma) ?? T.primary) : T.primary;
              })
            : undefined;

          return (
            <div
              key={i}
              className="gc-voicing-tile"
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
              <MiniFretboard
                voicing={voicing}
                dotColors={dotColors}
                dotColor={isSelected ? T.secondary : T.primary}
                tuning={tuning}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};
