import React from 'react';
import type { ChordInProgression } from '../../types/music';
import { formatChordName } from '../../utils/chordIdentifier';

interface Props {
  item: ChordInProgression;
  index: number;
  onRemove: (id: string) => void;
  onClick: (item: ChordInProgression) => void;
  isSelected: boolean;
}

const CARD_COLORS = [
  'from-indigo-900/60 to-indigo-800/30 border-indigo-700/50',
  'from-purple-900/60 to-purple-800/30 border-purple-700/50',
  'from-blue-900/60 to-blue-800/30 border-blue-700/50',
  'from-violet-900/60 to-violet-800/30 border-violet-700/50',
  'from-sky-900/60 to-sky-800/30 border-sky-700/50',
  'from-fuchsia-900/60 to-fuchsia-800/30 border-fuchsia-700/50',
];

export const ChordCard: React.FC<Props> = ({ item, index, onRemove, onClick, isSelected }) => {
  const colorClass = CARD_COLORS[index % CARD_COLORS.length];

  return (
    <div
      className={`relative flex flex-col items-center min-w-[80px] p-3 rounded-xl border bg-gradient-to-b cursor-pointer transition-all
        ${colorClass}
        ${isSelected ? 'ring-2 ring-indigo-400 scale-105' : 'hover:scale-102 hover:brightness-110'}
      `}
      onClick={() => onClick(item)}
    >
      <span className="text-xs text-gray-500 mb-1">{index + 1}</span>
      <span className="text-lg font-bold text-white leading-tight">{formatChordName(item.chord.name)}</span>
      <button
        className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-gray-700 hover:bg-red-600 text-gray-300 hover:text-white text-xs flex items-center justify-center transition-colors border border-gray-600"
        onClick={e => { e.stopPropagation(); onRemove(item.id); }}
        title="Remove"
      >
        ×
      </button>
    </div>
  );
};
