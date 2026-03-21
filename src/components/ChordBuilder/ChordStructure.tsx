import React from 'react';
import { Chord } from '@tonaljs/tonal';
import { T } from '../../theme';

// Interval → degree label
const INTERVAL_LABEL: Record<string, string> = {
  '1P':  '1',   '2m':  '♭2',  '2M':  '2',   '2A':  '♯2',
  '3m':  '♭3',  '3M':  '3',   '4P':  '4',   '4A':  '♯4',
  '5d':  '♭5',  '5P':  '5',   '5A':  '♯5',  '6m':  '♭6',
  '6M':  '6',   '7m':  '♭7',  '7M':  '7',   '8P':  '8',
  '9m':  '♭9',  '9M':  '9',   '9A':  '♯9',  '11P': '11',
  '11A': '♯11', '13m': '♭13', '13M': '13',
};

// Colors matching the app's POS_COLORS palette from ScaleVisualizer
// Root = primary (orange), 3rds = secondary (teal), 5ths = gold, 7ths = purple, extensions = blue
const INTERVAL_COLOR: Record<string, string> = {
  '1P':  T.primary,   // Root
  '3m':  T.secondary, // minor 3rd
  '3M':  T.secondary, // major 3rd
  '4P':  '#c4a000',   // perfect 4th (sus4)
  '4A':  '#c4a000',   // augmented 4th / tritone
  '5d':  '#8a4aa0',   // diminished 5th
  '5P':  '#c4a000',   // perfect 5th
  '5A':  '#8a4aa0',   // augmented 5th
  '2m':  '#2a7aa0',   // ♭2
  '2M':  '#2a7aa0',   // 2 (sus2)
  '2A':  '#2a7aa0',   // ♯2
  '6m':  '#8a4aa0',   // ♭6
  '6M':  '#2a7aa0',   // 6
  '7m':  '#8a4aa0',   // ♭7
  '7M':  '#2a7aa0',   // major 7th
  '8P':  T.primary,   // octave
  '9m':  '#2a7aa0',   '9M':  '#2a7aa0',  '9A':  '#2a7aa0',
  '11P': '#2a7aa0',   '11A': '#2a7aa0',
  '13m': '#2a7aa0',   '13M': '#2a7aa0',
};

interface Props {
  chordName: string;
}

export const ChordStructure: React.FC<Props> = ({ chordName }) => {
  const data = Chord.get(chordName);
  if (!data || data.empty || data.notes.length === 0) return null;

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{
        fontSize: 10, fontWeight: 700, color: T.textMuted,
        textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10,
        textAlign: 'center',
      }}>
        Chord Structure
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        {data.notes.map((note, i) => {
          const interval = data.intervals[i] ?? '';
          const color = INTERVAL_COLOR[interval] ?? T.textMuted;
          const deg = INTERVAL_LABEL[interval] ?? interval;
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{
                width: 38, height: 38, borderRadius: '50%',
                background: color + '22',
                border: `2px solid ${color}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 800, color,
              }}>
                {note}
              </div>
              <div style={{
                fontSize: 10, fontWeight: 700, color,
                background: color + '1a',
                padding: '2px 7px', borderRadius: 8,
                border: `1px solid ${color}44`,
              }}>
                {deg}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
