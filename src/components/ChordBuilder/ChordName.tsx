import React from 'react';
import type { FretPosition } from '../../types/music';
import { identifyChord, formatChordName } from '../../utils/chordIdentifier';
import { useLang } from '../../contexts/LanguageContext';
import { T } from '../../theme';
import { ChordPoster } from './ChordParts';

interface Props {
  positions: FretPosition[];
  tuning?: string[];
  capo?: number;
  /** Poster size cap (px). */
  max?: number;
}

// The chord the placed notes make, as a poster: root solid, suffix outlined,
// with its notes, the capo and the other names it goes by underneath.
export const ChordName: React.FC<Props> = ({ positions, tuning, capo = 0, max }) => {
  const { lang } = useLang();
  const he = lang === 'he';
  const chords = identifyChord(positions, tuning, capo);

  if (positions.length < 2 || chords.length === 0) {
    return (
      <ChordPoster name={null} max={max} aside={
        <span className="su-label">
          {positions.length < 2
            ? (he ? 'הקישו על הצוואר כדי להניח תווים' : 'Tap the neck to place notes')
            : (he ? 'לא זוהה אקורד' : 'No chord detected')}
        </span>
      } />
    );
  }

  const [primary, ...alts] = chords;
  return (
    <ChordPoster name={primary.name} max={max} aside={
      <>
        {primary.notes.length > 0 && <span className="su-label" style={{ color: T.text }}>{primary.notes.join(' · ')}</span>}
        {capo > 0 && (
          <span className="su-label">
            {he ? `קאפו ${capo} — נשמע כמו ${formatChordName(primary.name)}` : `Capo ${capo} — sounds like ${formatChordName(primary.name)}`}
          </span>
        )}
        {alts.length > 0 && (
          <span className="su-label" style={{ textTransform: 'none' }}>
            {he ? 'גם' : 'ALSO'} · {alts.slice(0, 4).map(c => formatChordName(c.name)).join(' · ')}
          </span>
        )}
      </>
    } />
  );
};
