import React from 'react';
import { Formula } from '../Transit/parts';
import { chordFormula } from './chordFormula';

interface Props { chordName: string }

/** The chord's formula: degree over note on a 4px rule, the defining tone cobalt. */
export const ChordStructure: React.FC<Props> = ({ chordName }) => {
  const f = chordFormula(chordName);
  if (!f) return null;
  return <Formula tones={f.tones} mark={f.mark >= 0 ? f.mark : undefined} />;
};
