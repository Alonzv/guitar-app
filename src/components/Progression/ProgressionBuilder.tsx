import React, { useState } from 'react';
import type { ChordInProgression, Genre, ProgressionSuggestion } from '../../types/music';
import { ChordCard } from './ChordCard';
import { ChordSuggestions } from './ChordSuggestions';
import { suggestNextChords, detectKey } from '../../utils/progressionHelper';
import { formatChordName } from '../../utils/chordIdentifier';
import { InteractiveFretboard } from '../Fretboard/InteractiveFretboard';

interface Props {
  progression: ChordInProgression[];
  onRemove: (id: string) => void;
  onAddSuggestion: (item: ChordInProgression) => void;
}

const GENRES: Genre[] = ['any', 'blues', 'jazz', 'pop', 'rock', 'metal'];

export const ProgressionBuilder: React.FC<Props> = ({ progression, onRemove, onAddSuggestion }) => {
  const [genre, setGenre] = useState<Genre>('any');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedChord, setSelectedChord] = useState<ChordInProgression | null>(null);

  const suggestions = suggestNextChords(progression, genre);
  const detectedKey = detectKey(progression.map(c => c.chord));

  const handleSelectSuggestion = (s: ProgressionSuggestion) => {
    const item: ChordInProgression = {
      id: `chord-${Date.now()}`,
      chord: s.chord,
      fretPositions: [],
    };
    onAddSuggestion(item);
    setShowSuggestions(false);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Detected Key */}
      {detectedKey && (
        <div className="text-center text-xs text-gray-500">
          Detected key: <span className="text-indigo-400 font-semibold">{detectedKey}</span>
        </div>
      )}

      {/* Progression scroll */}
      {progression.length === 0 ? (
        <div className="text-center py-8 text-gray-600 text-sm border border-dashed border-gray-700 rounded-xl">
          No chords yet — add them from the Chord Builder tab
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2 px-1">
          {progression.map((item, i) => (
            <ChordCard
              key={item.id}
              item={item}
              index={i}
              onRemove={onRemove}
              onClick={setSelectedChord}
              isSelected={selectedChord?.id === item.id}
            />
          ))}
        </div>
      )}

      {/* Selected chord fretboard preview */}
      {selectedChord && selectedChord.fretPositions.length > 0 && (
        <div className="bg-gray-900 rounded-xl p-3 border border-gray-800">
          <div className="text-xs text-gray-500 mb-2">{formatChordName(selectedChord.chord.name)} voicing</div>
          <InteractiveFretboard
            activeDots={selectedChord.fretPositions}
            onToggle={() => {}}
            readonly
          />
        </div>
      )}

      {/* Genre selector */}
      <div className="flex gap-2 flex-wrap">
        {GENRES.map(g => (
          <button
            key={g}
            onClick={() => setGenre(g)}
            className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors
              ${genre === g
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700'
              }`}
          >
            {g}
          </button>
        ))}
      </div>

      {/* Suggest next button */}
      <button
        onClick={() => setShowSuggestions(v => !v)}
        className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors"
      >
        {showSuggestions ? 'Hide Suggestions' : 'Suggest Next Chord'}
      </button>

      {/* Suggestions panel */}
      {showSuggestions && (
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Suggested next chords
          </h3>
          <ChordSuggestions suggestions={suggestions} onSelect={handleSelectSuggestion} />
        </div>
      )}
    </div>
  );
};
