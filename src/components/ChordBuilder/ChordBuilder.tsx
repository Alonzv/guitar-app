import React, { useState } from 'react';
import type { ChordInProgression, FretPosition } from '../../types/music';
import { InteractiveFretboard } from '../Fretboard/InteractiveFretboard';
import { ChordName } from './ChordName';
import { identifyChord } from '../../utils/chordIdentifier';

interface Props {
  onAddToProgression: (item: ChordInProgression) => void;
}

export const ChordBuilder: React.FC<Props> = ({ onAddToProgression }) => {
  const [activeDots, setActiveDots] = useState<FretPosition[]>([]);

  const handleToggle = (pos: FretPosition) => {
    setActiveDots(prev => {
      const exists = prev.findIndex(d => d.string === pos.string && d.fret === pos.fret);
      if (exists !== -1) {
        return prev.filter((_, i) => i !== exists);
      }
      // Only one dot per string
      const filtered = prev.filter(d => d.string !== pos.string);
      return [...filtered, pos];
    });
  };

  const handleClear = () => setActiveDots([]);

  const handleAdd = () => {
    const chords = identifyChord(activeDots);
    if (chords.length === 0) return;
    const chord = chords[0];
    onAddToProgression({
      id: `chord-${Date.now()}`,
      chord,
      fretPositions: [...activeDots],
    });
  };

  const chords = identifyChord(activeDots);
  const canAdd = chords.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Fretboard — click to place notes
        </h2>
        <InteractiveFretboard activeDots={activeDots} onToggle={handleToggle} />
      </div>

      <div className="bg-gray-900 rounded-xl p-5 border border-gray-800 min-h-[110px] flex flex-col items-center justify-center">
        <ChordName positions={activeDots} />
      </div>

      <div className="flex gap-3">
        <button
          onClick={handleClear}
          className="flex-1 py-2.5 rounded-lg bg-gray-800 text-gray-300 text-sm font-medium hover:bg-gray-700 transition-colors border border-gray-700"
        >
          Clear
        </button>
        <button
          onClick={handleAdd}
          disabled={!canAdd}
          className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors
            bg-indigo-600 hover:bg-indigo-500 text-white
            disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Add to Progression
        </button>
      </div>

      <p className="text-center text-xs text-gray-600">
        Tip: click a fret to place a note · click again to remove · one note per string
      </p>
    </div>
  );
};
