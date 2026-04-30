import React from 'react';
import { CircleOfFifths } from '../ScalePanel/CircleOfFifths';
import type { ChordInProgression, Tuning } from '../../types/music';

interface Props {
  tuning: Tuning;
  onAddToProgression: (item: ChordInProgression) => void;
}

export const WheelTab: React.FC<Props> = ({ onAddToProgression }) => (
  <CircleOfFifths onAddToProgression={onAddToProgression} />
);
