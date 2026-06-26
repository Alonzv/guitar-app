import React from 'react';
import { ChordWheel } from '../ScalePanel/ChordWheel';
import type { ChordInProgression, Tuning } from '../../types/music';

interface Props {
  tuning: Tuning;
  onAddToProgression: (item: ChordInProgression) => void;
  desktop?: boolean;
}

export const WheelTab: React.FC<Props> = ({ onAddToProgression, desktop }) => (
  <ChordWheel onAddToProgression={onAddToProgression} desktop={desktop} />
);
