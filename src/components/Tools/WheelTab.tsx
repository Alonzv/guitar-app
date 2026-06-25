import React from 'react';
import { CircleOfFifths } from '../ScalePanel/CircleOfFifths';
import type { ChordInProgression, Tuning } from '../../types/music';

interface Props {
  tuning: Tuning;
  onAddToProgression: (item: ChordInProgression) => void;
  desktop?: boolean;
}

export const WheelTab: React.FC<Props> = ({ onAddToProgression, desktop }) => (
  <CircleOfFifths onAddToProgression={onAddToProgression} desktop={desktop} />
);
