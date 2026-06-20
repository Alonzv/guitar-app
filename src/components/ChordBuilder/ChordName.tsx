import React from 'react';
import type { FretPosition } from '../../types/music';
import { identifyChord, formatChordName } from '../../utils/chordIdentifier';
import { T } from '../../theme';

interface Props {
  positions: FretPosition[];
  tuning?: string[];
  capo?: number;
}

export const ChordName: React.FC<Props> = ({ positions, tuning, capo = 0 }) => {
  const chords = identifyChord(positions, tuning, capo);

  if (positions.length < 2) return null;

  if (chords.length === 0) return (
    <p style={{ color: T.textMuted, fontSize: 13, fontStyle: 'italic', margin: 0 }}>No chord detected</p>
  );

  const [primary, ...alts] = chords;

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 'var(--gc-chord-big)', fontWeight: 800, color: T.text, letterSpacing: '-0.5px', lineHeight: 1 }}>
        <span style={{ fontWeight: 700, opacity: 0.35, letterSpacing: 0 }}>_</span>{formatChordName(primary.name)}
      </div>
      {capo > 0 && (
        <div style={{ fontSize: 11, color: T.secondary, marginTop: 4, fontWeight: 600 }}>
          Capo {capo} — sounds like {formatChordName(primary.name)}
        </div>
      )}
      {primary.notes.length > 0 && (
        <div style={{ fontSize: 11, color: T.textMuted, marginTop: 5 }}>
          {primary.notes.join(' · ')}
        </div>
      )}
      {alts.length > 0 && (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap', marginTop: 8 }}>
          {alts.slice(0, 4).map(c => (
            <span key={c.name} style={{
              padding: '3px 10px', borderRadius: 0, fontSize: 11,
              background: T.bgInput, color: T.secondary,
              border: `1px solid ${T.secondaryFaint}`,
              letterSpacing: '-0.02em', fontWeight: 500,
            }}>
              {formatChordName(c.name)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
