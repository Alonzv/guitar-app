import React, { useRef } from 'react';
import { Formula } from '../Transit/parts';
import { stagger, useOnChange } from '../../utils/motion';
import { chordFormula } from './chordFormula';

interface Props { chordName: string }

/** The chord's formula: degree over note on a 4px rule, the defining tone cobalt. */
export const ChordStructure: React.FC<Props> = ({ chordName }) => {
  const f = chordFormula(chordName);
  // A new chord: its tones cascade in, left to right.
  const ref = useRef<HTMLDivElement>(null);
  useOnChange(chordName, () => stagger(ref.current?.firstElementChild));
  if (!f) return null;
  return <div ref={ref}><Formula tones={f.tones} mark={f.mark >= 0 ? f.mark : undefined} /></div>;
};
