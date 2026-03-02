import React from 'react';
import type { ProgressionSuggestion } from '../../types/music';
import { formatChordName } from '../../utils/chordIdentifier';

interface Props {
  suggestions: ProgressionSuggestion[];
  onSelect: (suggestion: ProgressionSuggestion) => void;
}

const GENRE_COLORS: Record<string, string> = {
  blues: 'bg-amber-900/50 text-amber-300',
  jazz: 'bg-emerald-900/50 text-emerald-300',
  pop: 'bg-pink-900/50 text-pink-300',
  rock: 'bg-red-900/50 text-red-300',
  metal: 'bg-gray-700/80 text-gray-200',
};

export const ChordSuggestions: React.FC<Props> = ({ suggestions, onSelect }) => {
  if (suggestions.length === 0) {
    return (
      <div className="text-center text-gray-500 text-sm py-4">
        Add chords to the progression first
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {suggestions.map((s, i) => (
        <button
          key={i}
          onClick={() => onSelect(s)}
          className="flex flex-col gap-1 p-3 rounded-xl bg-gray-800 border border-gray-700 hover:border-indigo-500 hover:bg-gray-750 transition-all text-left"
        >
          <div className="flex items-center justify-between gap-1">
            <span className="text-base font-bold text-white">{formatChordName(s.chord.name)}</span>
            <span className="text-xs text-gray-400 font-mono">{s.romanNumeral}</span>
          </div>
          <span className="text-xs text-gray-400 leading-snug">{s.reason}</span>
          {s.genre && (
            <span className={`text-xs px-1.5 py-0.5 rounded self-start ${GENRE_COLORS[s.genre] ?? 'bg-gray-700 text-gray-300'}`}>
              {s.genre}
            </span>
          )}
        </button>
      ))}
    </div>
  );
};
