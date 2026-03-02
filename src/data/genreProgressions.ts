import type { Genre } from '../types/music';

export interface GenrePattern {
  genre: Genre;
  name: string;
  numerals: string[];
  reasons: string[];
}

export const GENRE_PATTERNS: GenrePattern[] = [
  // Blues
  { genre: 'blues', name: '12-Bar Blues',  numerals: ['I7', 'IV7', 'I7', 'V7', 'IV7', 'I7'],       reasons: ['tonic', 'subdominant', 'tonic', 'dominant', 'subdominant', 'turnaround'] },
  { genre: 'blues', name: 'Quick Change',  numerals: ['I7', 'IV7', 'I7', 'V7'],                     reasons: ['tonic', 'quick change', 'tonic', 'turnaround'] },
  { genre: 'blues', name: 'Slow Blues 9ths', numerals: ['I9', 'IV9', 'I9', 'V9', 'IV9', 'I9'],    reasons: ['tonic 9th', 'subdominant 9th', 'tonic', 'dominant 9th', 'subdominant', 'turnaround'] },
  { genre: 'blues', name: 'Minor Blues',   numerals: ['Im7', 'IVm7', 'Im7', 'Vm7', 'IVm7', 'Im7'], reasons: ['minor tonic', 'minor subdominant', 'tonic', 'dominant', 'subdominant', 'turnaround'] },

  // Jazz
  { genre: 'jazz', name: 'II-V-I',         numerals: ['IIm7', 'V7', 'Imaj7'],                       reasons: ['supertonic', 'dominant', 'tonic resolution'] },
  { genre: 'jazz', name: 'III-VI-II-V',    numerals: ['IIIm7', 'VI7', 'IIm7', 'V7'],               reasons: ['mediant', 'backdoor dominant', 'supertonic', 'dominant'] },
  { genre: 'jazz', name: 'Rhythm Changes', numerals: ['Imaj7', 'VI7', 'IIm7', 'V7'],               reasons: ['tonic', 'secondary dominant', 'supertonic', 'dominant'] },
  { genre: 'jazz', name: 'Minor II-V-I',   numerals: ['IIm7b5', 'V7', 'Im'],                        reasons: ['half diminished', 'dominant', 'minor tonic'] },
  { genre: 'jazz', name: 'Backdoor II-V-I', numerals: ['IVm7', 'bVII7', 'Imaj7'],                  reasons: ['subdominant minor', 'backdoor dominant', 'tonic'] },
  { genre: 'jazz', name: 'Coltrane Changes', numerals: ['Imaj7', 'bIIImaj7', 'bVImaj7', 'Imaj7'], reasons: ['tonic', 'chromatic mediant', 'chromatic submediant', 'tonic'] },

  // Pop
  { genre: 'pop', name: 'Axis Progression',   numerals: ['I', 'V', 'VIm', 'IV'],              reasons: ['tonic', 'dominant', 'relative minor', 'subdominant'] },
  { genre: 'pop', name: 'I-IV-V',             numerals: ['I', 'IV', 'V'],                      reasons: ['tonic', 'subdominant', 'dominant'] },
  { genre: 'pop', name: 'I-V-VIm-IIIm',       numerals: ['I', 'V', 'VIm', 'IIIm'],           reasons: ['tonic', 'dominant', 'relative minor', 'mediant'] },
  { genre: 'pop', name: 'Neo Soul',            numerals: ['Imaj7', 'IIIm7', 'VIm7', 'IVmaj7'], reasons: ['tonic', 'mediant', 'relative minor', 'subdominant'] },
  { genre: 'pop', name: 'Jazzy Pop',           numerals: ['Imaj7', 'IIm7', 'V7', 'Imaj7'],    reasons: ['tonic', 'supertonic', 'dominant', 'resolution'] },
  { genre: 'pop', name: 'Emotional Minor',     numerals: ['VIm', 'IV', 'I', 'V'],              reasons: ['relative minor', 'subdominant', 'tonic', 'dominant'] },

  // Rock
  { genre: 'rock', name: 'I-bVII-IV',          numerals: ['I', 'bVII', 'IV'],                  reasons: ['tonic', 'subtonic', 'subdominant'] },
  { genre: 'rock', name: 'I-V-VIm-IIIm',       numerals: ['I', 'V', 'VIm', 'IIIm'],          reasons: ['tonic', 'dominant', 'relative minor', 'mediant'] },
  { genre: 'rock', name: 'Power Chord Riff',    numerals: ['I5', 'IV5', 'V5'],                  reasons: ['tonic', 'subdominant', 'dominant'] },
  { genre: 'rock', name: 'Classic Rock 7ths',   numerals: ['I7', 'IV7', 'V7'],                  reasons: ['tonic 7th', 'subdominant 7th', 'dominant 7th'] },
  { genre: 'rock', name: 'Pentatonic Bounce',   numerals: ['I', 'bVII', 'bVI', 'bVII'],        reasons: ['tonic', 'subtonic', 'submediant', 'subtonic return'] },

  // Metal
  { genre: 'metal', name: 'Minor Descend',    numerals: ['Im', 'bVII', 'bVI', 'V'],            reasons: ['tonic', 'subtonic', 'submediant', 'dominant'] },
  { genre: 'metal', name: 'Phrygian',         numerals: ['Im', 'bII', 'Im'],                   reasons: ['tonic', 'Phrygian chord', 'return to tonic'] },
  { genre: 'metal', name: 'Power Descend',    numerals: ['I5', 'bVII5', 'bVI5', 'V5'],         reasons: ['tonic', 'subtonic', 'submediant', 'dominant'] },
  { genre: 'metal', name: 'Diminished Lick',  numerals: ['Im', 'dim7', 'Im'],                  reasons: ['tonic', 'diminished tension', 'tonic release'] },
];

// Diatonic chord suggestions based on last chord's function — major AND minor keys
export const DIATONIC_SUGGESTIONS: Record<string, { next: string[]; reasons: string[] }> = {
  // ── Major key ─────────────────────────────────────────────
  I:    { next: ['IV', 'V', 'IIm', 'VIm'],    reasons: ['subdominant motion', 'dominant motion', 'supertonic', 'relative minor'] },
  IIm:  { next: ['V', 'IV', 'VIIo'],          reasons: ['II→V dominant prep', 'subdominant', 'leading tone'] },
  IIIm: { next: ['VIm', 'IV', 'I'],           reasons: ['mediant to relative minor', 'subdominant', 'resolution'] },
  IV:   { next: ['V', 'I', 'IIm', 'VIm'],     reasons: ['dominant motion', 'plagal cadence', 'supertonic', 'deceptive'] },
  V:    { next: ['I', 'VIm', 'IV'],            reasons: ['perfect cadence', 'deceptive cadence', 'backdoor'] },
  VIm:  { next: ['IIm', 'IV', 'V', 'I'],      reasons: ['supertonic', 'subdominant', 'dominant', 'resolution'] },
  VIIo: { next: ['I', 'V'],                    reasons: ['resolution', 'dominant reinforcement'] },

  // ── Minor key ─────────────────────────────────────────────
  Im:   { next: ['IVm', 'Vm', 'bVI', 'bVII'],  reasons: ['subdominant minor', 'dominant minor', 'submediant', 'subtonic'] },
  IIo:  { next: ['Vm', 'bVII', 'Im'],          reasons: ['dominant prep', 'subtonic', 'resolution'] },
  bIII: { next: ['bVII', 'Im', 'IVm'],         reasons: ['subtonic', 'tonic', 'subdominant'] },
  IVm:  { next: ['Vm', 'bVII', 'Im'],          reasons: ['dominant prep', 'subtonic', 'tonic cadence'] },
  Vm:   { next: ['Im', 'bVI', 'bVII'],         reasons: ['minor cadence', 'submediant', 'subtonic'] },
  bVI:  { next: ['bVII', 'Im', 'IVm'],         reasons: ['subtonic approach', 'tonic', 'subdominant'] },
  bVII: { next: ['Im', 'bVI', 'IVm'],          reasons: ['tonic', 'submediant', 'subdominant'] },
};
