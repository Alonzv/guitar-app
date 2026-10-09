import type { ChordInProgression } from '../types/music';
import type { TabContent } from '../services/types';
import type { KeyGuess } from '../utils/harmonicAnalysis';

// ── The song ─────────────────────────────────────────────────────────────────
// One composition that every tool works on together. It holds what used to be
// set again in each tool — key, tempo, metre, tuning, capo — plus the chords
// (split into sections: verse, chorus…) and the melody. Tools read what they
// need from it and hand their results back to it, so a chord found in By Name,
// voiced in VL Studio and reharmonised in Reharm is the same chord all along.

export type Meter = '4/4' | '3/4' | '6/8';

export interface Section {
  id: string;
  name: string;
  progression: ChordInProgression[];
  /** Alternative versions of this section's chords (e.g. a reharm), by name. */
  variants?: { id: string; name: string; progression: ChordInProgression[] }[];
}

export interface Song {
  id: string;
  title: string;
  /** null = follow the chords (detected); set = chosen by the player. */
  keyOverride: KeyGuess | null;
  bpm: number;
  meter: Meter;
  tuningName: string;
  capo: number;
  sections: Section[];
  activeSection: string;
  /** The tune: written in Tab Builder, sung into Audio→Tab, harmonised in Harmonize. */
  melody: TabContent | null;
  /** Which tool last wrote the melody — so a tool doesn't reload its own edits. */
  melodyFrom?: string;
  updatedAt: number;
}

export const SECTION_NAMES = ['Intro', 'Verse', 'Pre-chorus', 'Chorus', 'Bridge', 'Solo', 'Outro'];

export const newId = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export function newSong(progression: ChordInProgression[] = []): Song {
  const section: Section = { id: newId('sec'), name: 'Verse', progression };
  return {
    id: newId('song'), title: '', keyOverride: null, bpm: 90, meter: '4/4',
    tuningName: 'standard', capo: 0,
    sections: [section], activeSection: section.id,
    melody: null, updatedAt: Date.now(),
  };
}

export const beatsPerBar = (m: Meter) => (m === '3/4' ? 3 : m === '6/8' ? 6 : 4);

// ── Persistence ──────────────────────────────────────────────────────────────
// The working song lives on the device so nothing is lost between visits.
// Before songs existed, the app kept a bare progression and its own
// localStorage keys; the first load folds those into the new song.

const KEY = 'scaleup_song';

export function loadSong(): Song {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Song;
      if (s && Array.isArray(s.sections) && s.sections.length) {
        if (!s.sections.some(x => x.id === s.activeSection)) s.activeSection = s.sections[0].id;
        return { ...newSong(), ...s };
      }
    }
  } catch { /* corrupt — start fresh below */ }
  let legacy: ChordInProgression[] = [];
  try { legacy = JSON.parse(localStorage.getItem('scaleup_progression') || '[]'); } catch { /* none */ }
  return newSong(Array.isArray(legacy) ? legacy : []);
}

export function saveSong(song: Song): void {
  try { localStorage.setItem(KEY, JSON.stringify(song)); } catch { /* private mode / full */ }
}

export function activeSection(song: Song): Section {
  return song.sections.find(s => s.id === song.activeSection) ?? song.sections[0];
}

/** Every chord of the song in order — what "the song's chords" means to tools. */
export function allChords(song: Song): ChordInProgression[] {
  return song.sections.flatMap(s => s.progression);
}
