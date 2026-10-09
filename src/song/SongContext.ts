import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ChordInProgression, Tuning } from '../types/music';
import type { TabContent } from '../services/types';
import { TUNINGS } from '../utils/musicTheory';
import { detectKey, type KeyGuess } from '../utils/harmonicAnalysis';
import { namesToProgression } from '../utils/progressionBridge';
import {
  type Song, type Section, loadSong, saveSong, activeSection, allChords, newSong, newId,
} from './song';

// ── Song state ───────────────────────────────────────────────────────────────
// App owns the song through useSongState() and shares it with every tool via
// <SongProvider>; a tool calls useSong() to read the key, tempo, tuning,
// chords and melody, and to hand its results back. Every change to the song
// goes through one history, so undo/redo covers the whole song.

export interface SongApi {
  song: Song;
  /** The section being worked on. */
  section: Section;
  /** Its chords — what the progression panel, VL Studio and Reharm edit. */
  progression: ChordInProgression[];
  /** The key: chosen by the player, or else detected from the song's chords. */
  key: KeyGuess | null;
  keyIsAuto: boolean;
  tuning: Tuning;

  /** Title, key, tempo, metre, tuning, capo… (not undoable). */
  update: (patch: Partial<Omit<Song, 'sections' | 'activeSection'>>) => void;
  /** Replace the active section's chords (undoable). */
  setProgression: (next: ChordInProgression[]) => void;
  /** Replace the active section's chords by name, keeping known shapes (undoable). */
  setChordNames: (names: string[]) => void;
  setMelody: (m: TabContent | null) => void;

  // Sections
  selectSection: (id: string) => void;
  addSection: (name: string, copyFrom?: string) => void;
  renameSection: (id: string, name: string) => void;
  removeSection: (id: string) => void;
  moveSection: (id: string, dir: -1 | 1) => void;
  saveVariant: (name: string, progression: ChordInProgression[]) => void;
  useVariant: (variantId: string) => void;

  /** Start a new song (the current one is replaced; undo brings it back). */
  newSong: () => void;
  loadSong: (s: Song) => void;

  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const LIMIT = 50;

export function useSongState(): SongApi {
  const [song, setSongState] = useState<Song>(loadSong);
  const [undoStack, setUndo] = useState<Song[]>([]);
  const [redoStack, setRedo] = useState<Song[]>([]);
  // The ref moves with every change (not just on render) so several edits in
  // one handler — a template progression added chord by chord — each build on
  // the one before instead of all starting from the same snapshot.
  const ref = useRef(song);

  useEffect(() => { saveSong(song); }, [song]);

  const set = useCallback((next: Song, history: boolean) => {
    const prev = ref.current;
    next = { ...next, updatedAt: Date.now() };
    ref.current = next;
    if (history) { setUndo(s => [...s.slice(-(LIMIT - 1)), prev]); setRedo([]); }
    setSongState(next);
  }, []);

  const mapSection = (s: Song, id: string, fn: (sec: Section) => Section): Song =>
    ({ ...s, sections: s.sections.map(x => (x.id === id ? fn(x) : x)) });

  const tuning = TUNINGS.find(t => t.name === song.tuningName) ?? TUNINGS[0];
  const section = activeSection(song);
  const names = useMemo(() => allChords(song).map(c => c.chord.name).filter(Boolean), [song]);
  const detected = useMemo(() => (names.length ? detectKey(names) : null), [names]);

  const api: SongApi = {
    song, section, progression: section.progression,
    key: song.keyOverride ?? detected, keyIsAuto: !song.keyOverride, tuning,

    update: patch => set({ ...ref.current, ...patch }, false),
    setProgression: next => {
      const s = ref.current;
      set(mapSection(s, activeSection(s).id, sec => ({ ...sec, progression: next })), true);
    },
    setChordNames: chordNames => {
      const s = ref.current;
      const t = TUNINGS.find(x => x.name === s.tuningName) ?? TUNINGS[0];
      const sec = activeSection(s);
      set(mapSection(s, sec.id, x => ({ ...x, progression: namesToProgression(chordNames, t.notes, sec.progression) })), true);
    },
    setMelody: m => set({ ...ref.current, melody: m }, true),

    selectSection: id => set({ ...ref.current, activeSection: id }, false),
    addSection: (name, copyFrom) => {
      const s = ref.current;
      const src = s.sections.find(x => x.id === copyFrom);
      const sec: Section = {
        id: newId('sec'), name,
        progression: src ? src.progression.map((c, i) => ({ ...c, id: `${c.id}-c${i}-${Date.now()}` })) : [],
      };
      set({ ...s, sections: [...s.sections, sec], activeSection: sec.id }, true);
    },
    renameSection: (id, name) => set(mapSection(ref.current, id, x => ({ ...x, name })), true),
    removeSection: id => {
      const s = ref.current;
      if (s.sections.length < 2) return;
      const sections = s.sections.filter(x => x.id !== id);
      set({ ...s, sections, activeSection: s.activeSection === id ? sections[0].id : s.activeSection }, true);
    },
    moveSection: (id, dir) => {
      const s = ref.current;
      const i = s.sections.findIndex(x => x.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= s.sections.length) return;
      const sections = [...s.sections];
      [sections[i], sections[j]] = [sections[j], sections[i]];
      set({ ...s, sections }, true);
    },
    saveVariant: (name, progression) => {
      const s = ref.current;
      set(mapSection(s, activeSection(s).id, x => ({
        ...x, variants: [...(x.variants ?? []), { id: newId('var'), name, progression }],
      })), true);
    },
    useVariant: variantId => {
      // Swap: the variant becomes the section's chords and the chords it
      // replaces become a variant, so nothing is ever lost by trying one.
      const s = ref.current;
      set(mapSection(s, activeSection(s).id, x => {
        const v = x.variants?.find(y => y.id === variantId);
        if (!v) return x;
        const kept = { id: newId('var'), name: 'Original', progression: x.progression };
        return { ...x, progression: v.progression, variants: [...(x.variants ?? []).filter(y => y.id !== variantId), kept] };
      }), true);
    },

    newSong: () => {
      const s = ref.current;
      set({ ...newSong(), bpm: s.bpm, tuningName: s.tuningName, capo: s.capo }, true);
    },
    loadSong: loaded => set({ ...newSong(), ...loaded }, true),

    undo: () => {
      if (!undoStack.length) return;
      const prev = undoStack[undoStack.length - 1];
      setRedo(r => [ref.current, ...r]);
      setUndo(u => u.slice(0, -1));
      ref.current = prev;
      setSongState(prev);
    },
    redo: () => {
      if (!redoStack.length) return;
      const next = redoStack[0];
      setUndo(u => [...u, ref.current]);
      setRedo(r => r.slice(1));
      ref.current = next;
      setSongState(next);
    },
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
  };
  return api;
}

const SongContext = createContext<SongApi | null>(null);
export const SongProvider = SongContext.Provider;

export function useSong(): SongApi {
  const v = useContext(SongContext);
  if (!v) throw new Error('useSong must be used inside <SongProvider>');
  return v;
}

/** For tools that can also be rendered on their own, outside the app shell. */
export function useOptionalSong(): SongApi | null {
  return useContext(SongContext);
}
