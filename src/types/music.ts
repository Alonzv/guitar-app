export type Note = string; // "C", "F#", "Bb"

export interface FretPosition {
  string: number; // 0=low E, 5=high E
  fret: number;   // 0=open, 1-12
}

export interface Chord {
  name: string;     // "Am7", "G7b9"
  notes: Note[];
  aliases: string[];
}

export interface ChordInProgression {
  id: string;
  chord: Chord;
  fretPositions: FretPosition[];
}

export interface ScaleMatch {
  name: string;       // "A minor pentatonic"
  root: Note;
  type: string;       // "minor pentatonic"
  fitPercent: number; // 0-100
  positions: FretPosition[];
}

export interface ProgressionSuggestion {
  chord: Chord;
  reason: string;
  romanNumeral: string;
  genre?: string;
}

export type Genre = 'blues' | 'jazz' | 'pop' | 'rock' | 'metal' | 'any';

export interface Song {
  id: string;
  name: string;
  progression: ChordInProgression[];
  createdAt: number;
}

export interface ChordPlacement {
  id: string;
  chordName: string;
  wordIndex: number;
}
