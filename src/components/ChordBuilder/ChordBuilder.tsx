import React, { useState } from 'react';
import type { ChordInProgression, FretPosition } from '../../types/music';
import { InteractiveFretboard } from '../Fretboard/InteractiveFretboard';
import { ChordName } from './ChordName';
import { identifyChord } from '../../utils/chordIdentifier';
import { TUNINGS } from '../../utils/musicTheory';
import { T } from '../../theme';

interface Props {
  onAddToProgression: (item: ChordInProgression) => void;
}

export const ChordBuilder: React.FC<Props> = ({ onAddToProgression }) => {
  const [activeDots, setActiveDots] = useState<FretPosition[]>([]);
  const [tuningName, setTuningName] = useState<string>(TUNINGS[0].name);
  const tuning = TUNINGS.find(t => t.name === tuningName)?.notes ?? TUNINGS[0].notes;

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
    const chords = identifyChord(activeDots, tuning);
    if (chords.length === 0) return;
    const chord = chords[0];
    onAddToProgression({
      id: `chord-${Date.now()}`,
      chord,
      fretPositions: [...activeDots],
    });
  };

  const chords = identifyChord(activeDots, tuning);
  const canAdd = chords.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider" style={{ margin: 0 }}>
            Fretboard — click to place notes
          </h2>
          <select
            value={tuningName}
            onChange={e => { setTuningName(e.target.value); setActiveDots([]); }}
            style={{
              background: T.bgInput,
              color: T.text,
              border: `1px solid ${T.border}`,
              borderRadius: 7,
              padding: '3px 8px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            {TUNINGS.map(t => (
              <option key={t.name} value={t.name}>{t.label}</option>
            ))}
          </select>
        </div>
        <InteractiveFretboard activeDots={activeDots} onToggle={handleToggle} tuning={tuning} />
      </div>

      <div className="bg-gray-900 rounded-xl p-5 border border-gray-800 min-h-[110px] flex flex-col items-center justify-center">
        <ChordName positions={activeDots} tuning={tuning} />
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
