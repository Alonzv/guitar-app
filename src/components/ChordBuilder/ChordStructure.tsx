import React from 'react';
import { Chord, Note } from '@tonaljs/tonal';
import { T } from '../../theme';

function simplifyNote(note: string): string {
  return Note.simplify(note) || note;
}

const INTERVAL_LABEL: Record<string, string> = {
  '1P': '1', '2m': '♭2', '2M': '2', '2A': '♯2',
  '3m': '♭3', '3M': '3', '4P': '4', '4A': '♯4',
  '5d': '♭5', '5P': '5', '5A': '♯5', '6m': '♭6',
  '6M': '6', '7m': '♭7', '7M': '7', '8P': '8',
  '9m': '♭9', '9M': '9', '9A': '♯9', '11P': '11',
  '11A': '♯11', '13m': '♭13', '13M': '13',
};

const INTERVAL_NAME: Record<string, string> = {
  '1P': 'Root', '3m': 'Minor 3rd', '3M': 'Major 3rd',
  '4P': '4th', '4A': 'Tritone', '5d': 'Dim 5th',
  '5P': '5th', '5A': 'Aug 5th', '2m': '♭2nd',
  '2M': '2nd', '6m': '♭6th', '6M': '6th',
  '7m': 'Minor 7th', '7M': 'Major 7th', '9M': '9th',
  '9m': '♭9th', '11P': '11th', '13M': '13th',
};

const LIGHT_TAUPE = '#9C958C';
// Theme-aware ink: #1A1818 in light, sand #F0EAD8 in dark. A hardcoded ink
// here used to vanish against the dark background (the 3rd of every chord).
const INK   = T.text;
// Palette taupe — the same value VoicingsTab uses for 7ths; legible both modes.
const TAUPE = '#8A8378';

export const INTERVAL_COLOR: Record<string, string> = {
  '1P': T.primary,   '8P': T.primary,      // root / octave
  '3m': INK,         '3M': INK,            // 3rd — ink (sand in dark)
  '4P': T.coral,     '4A': T.coral,        // 4th
  '5P': T.coral,     '5A': LIGHT_TAUPE, '5d': LIGHT_TAUPE, // 5th / altered 5th
  '2m': TAUPE,       '2M': TAUPE,       '2A': TAUPE,       // 2nd
  '6m': LIGHT_TAUPE, '6M': TAUPE,          // 6th
  '7m': TAUPE,       '7M': TAUPE,          // 7th
  '9m': LIGHT_TAUPE, '9M': TAUPE,       '9A': LIGHT_TAUPE, // 9th
  '11P': TAUPE,      '11A': LIGHT_TAUPE,   // 11th
  '13m': LIGHT_TAUPE, '13M': TAUPE,        // 13th
};

/** Returns a chroma (0–11) → color map for the given chord */
export function buildChromaColorMap(chordName: string): Map<number, string> {
  const map = new Map<number, string>();
  const data = Chord.get(chordName);
  if (data.empty) return map;
  data.notes.forEach((note, i) => {
    const chroma = Note.chroma(note);
    if (chroma != null) map.set(chroma, INTERVAL_COLOR[data.intervals[i]] ?? T.primary);
  });
  return map;
}

interface Props { chordName: string }

export const ChordStructure: React.FC<Props> = ({ chordName }) => {
  const data = Chord.get(chordName);
  if (!data || data.empty || data.notes.length === 0) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', justifyContent: 'center' }}>
      {data.notes.map((note, i) => {
        const interval = data.intervals[i] ?? '';
        const color = INTERVAL_COLOR[interval] ?? T.textMuted;
        const deg = INTERVAL_LABEL[interval] ?? interval;
        const name = INTERVAL_NAME[interval] ?? '';
        return (
          <React.Fragment key={i}>
            {i > 0 && <span style={{ fontSize: 11, color: T.textDim }}>·</span>}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
              <span style={{ fontSize: 15, fontWeight: 800, color, lineHeight: 1 }}>{simplifyNote(note)}</span>
              <span style={{ fontSize: 10, fontWeight: 400, color, opacity: 0.85, lineHeight: 1 }}>{deg}</span>
              {name && <span style={{ fontSize: 9, color: T.textDim, lineHeight: 1, whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '-0.02em' }}>{name}</span>}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};
