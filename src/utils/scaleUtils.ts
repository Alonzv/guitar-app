import { Chord as TonalChord, Scale, Note as TonalNote } from '@tonaljs/tonal';
import type { ChordInProgression, FretPosition, Note, ScaleMatch } from '../types/music';
import { fretPositionsToNotes, notesToPitchClasses, FRET_COUNT, STRING_COUNT, fretToNote, CHROMATIC } from './musicTheory';

// Conventional flat notation for display (A# → Bb, D# → Eb, G# → Ab)
const SHARP_TO_FLAT: Record<string, string> = { 'A#': 'Bb', 'D#': 'Eb', 'G#': 'Ab' };

const MINOR_FAMILY = new Set([
  'minor', 'harmonic minor', 'melodic minor',
  'dorian', 'phrygian', 'locrian', 'minor pentatonic', 'blues',
]);
const MAJOR_FAMILY = new Set([
  'major', 'lydian', 'mixolydian', 'major pentatonic',
]);

function inFamily(type: string, prefType: string): boolean {
  if (prefType === 'minor') return MINOR_FAMILY.has(type);
  if (prefType === 'major') return MAJOR_FAMILY.has(type);
  return type === prefType;
}

// Detect best-fitting scales from a set of chords
export function detectScales(chords: ChordInProgression[], preferredKey?: string): ScaleMatch[] {
  if (chords.length === 0) return [];

  // Extract notes: prefer fretPositions; fall back to chord's theoretical notes
  const allNotes = chords.flatMap(c => {
    if (c.fretPositions.length > 0) return fretPositionsToNotes(c.fretPositions);
    const theoretical = c.chord.notes.length > 0
      ? c.chord.notes
      : TonalChord.get(c.chord.name).notes;
    return theoretical;
  });
  const pitchClasses = notesToPitchClasses(allNotes);
  if (pitchClasses.length === 0) return [];

  const results: ScaleMatch[] = [];

  const COMMON_TYPES = [
    'major', 'minor', 'dorian', 'mixolydian', 'phrygian', 'lydian', 'locrian',
    'minor pentatonic', 'major pentatonic', 'blues', 'harmonic minor', 'melodic minor',
  ];

  const prefParts  = preferredKey?.split(' ') ?? [];
  const prefRoot   = prefParts[0] ?? '';
  const prefType   = prefParts.slice(1).join(' ');
  const prefChroma = prefRoot !== '' ? TonalNote.chroma(prefRoot) : null;

  for (const root of CHROMATIC) {
    for (const type of COMMON_TYPES) {
      const scale = Scale.get(`${root} ${type}`);
      if (!scale || scale.empty) continue;
      const scaleNotes = scale.notes;
      const covered = pitchClasses.filter(pc =>
        scaleNotes.includes(pc) || scaleNotes.includes(TonalNote.enharmonic(pc) ?? pc)
      );
      const fitPercent = Math.round((covered.length / pitchClasses.length) * 100);
      if (fitPercent > 0) {
        const displayRoot = SHARP_TO_FLAT[root] ?? root;
        results.push({ name: `${displayRoot} ${type}`, root: displayRoot, type, fitPercent, positions: getScalePositions(root, type) });
      }
    }
  }

  // Sort: fit% desc, then preferred root family first (tiebreaker)
  results.sort((a, b) => {
    if (b.fitPercent !== a.fitPercent) return b.fitPercent - a.fitPercent;
    if (prefChroma !== null) {
      const aMatch = TonalNote.chroma(a.root) === prefChroma && inFamily(a.type, prefType);
      const bMatch = TonalNote.chroma(b.root) === prefChroma && inFamily(b.type, prefType);
      if (aMatch !== bMatch) return aMatch ? -1 : 1;
    }
    return 0;
  });

  // Deduplicate by identical note set, preferring preferred root+family
  const seen = new Map<string, number>();
  const unique: ScaleMatch[] = [];
  for (const s of results) {
    const noteKey = Scale.get(s.name).notes
      .map(n => TonalNote.chroma(n) ?? -1).filter(c => c >= 0)
      .sort((a, b) => a - b).join(',');
    if (!seen.has(noteKey)) {
      seen.set(noteKey, unique.length);
      unique.push(s);
    } else if (prefChroma !== null) {
      const idx      = seen.get(noteKey)!;
      const existing = unique[idx];
      const thisMatches = TonalNote.chroma(s.root) === prefChroma && inFamily(s.type, prefType);
      const prevMatches = TonalNote.chroma(existing.root) === prefChroma && inFamily(existing.type, prefType);
      if (thisMatches && !prevMatches) unique[idx] = s;
    }
  }

  const top = unique.slice(0, 3);

  // Guarantee the preferred key's best scale appears in results (even if ranked lower)
  if (prefChroma !== null) {
    const alreadyIncluded = top.some(
      s => TonalNote.chroma(s.root) === prefChroma && inFamily(s.type, prefType)
    );
    if (!alreadyIncluded) {
      const best = unique.find(
        s => TonalNote.chroma(s.root) === prefChroma && inFamily(s.type, prefType)
      );
      if (best) top.push(best);
    }
  }

  return top;
}

// Get all fret positions for a scale across the entire fretboard
export function getScalePositions(root: Note, scaleType: string, tuning?: string[]): FretPosition[] {
  const scale = Scale.get(`${root} ${scaleType}`);
  if (!scale || scale.empty) return [];

  const scaleNotes = scale.notes;
  const positions: FretPosition[] = [];

  for (let s = 0; s < STRING_COUNT; s++) {
    for (let f = 0; f <= FRET_COUNT; f++) {
      const note = fretToNote(s, f, tuning);
      const enharmonic = TonalNote.enharmonic(note) ?? note;
      if (scaleNotes.includes(note) || scaleNotes.includes(enharmonic)) {
        positions.push({ string: s, fret: f });
      }
    }
  }

  return positions;
}

// ── Scales that fully contain a given chord ───────────────────────────────
// Used by Target Note "Fits in" — find the diatonic homes of a chord/note.
const SCALE_TYPE_PRIORITY: Record<string, number> = {
  'major': 0, 'minor': 1, 'mixolydian': 2, 'dorian': 3, 'lydian': 4,
  'major pentatonic': 5, 'minor pentatonic': 6, 'blues': 7,
  'phrygian': 8, 'locrian': 9, 'harmonic minor': 10, 'melodic minor': 11,
};

export interface ScaleFit {
  name: string;   // "C major"
  root: string;   // "C"
  type: string;   // "major"
}

export function scalesContainingNotes(chordNotes: string[], max = 5): ScaleFit[] {
  const wanted = chordNotes
    .map(n => TonalNote.chroma(n))
    .filter((c): c is number => c !== undefined);
  if (wanted.length === 0) return [];

  const types = Object.keys(SCALE_TYPE_PRIORITY);
  const matches: ScaleFit[] = [];

  for (const root of CHROMATIC) {
    for (const type of types) {
      const scale = Scale.get(`${root} ${type}`);
      if (!scale || scale.empty) continue;
      const scaleChromas = new Set(
        scale.notes.map(n => TonalNote.chroma(n)).filter((c): c is number => c !== undefined)
      );
      // Every chord note must be in the scale
      if (wanted.every(c => scaleChromas.has(c))) {
        const displayRoot = SHARP_TO_FLAT[root] ?? root;
        matches.push({ name: `${displayRoot} ${type}`, root: displayRoot, type });
      }
    }
  }

  // Dedupe by identical note set, keep the highest-priority type
  const byNoteSet = new Map<string, ScaleFit>();
  for (const m of matches) {
    const key = Scale.get(m.name).notes
      .map(n => TonalNote.chroma(n) ?? -1).filter(c => c >= 0)
      .sort((a, b) => a - b).join(',');
    const existing = byNoteSet.get(key);
    if (!existing || SCALE_TYPE_PRIORITY[m.type] < SCALE_TYPE_PRIORITY[existing.type]) {
      byNoteSet.set(key, m);
    }
  }

  return [...byNoteSet.values()]
    .sort((a, b) => SCALE_TYPE_PRIORITY[a.type] - SCALE_TYPE_PRIORITY[b.type])
    .slice(0, max);
}

// Assign CAGED position index (0-4) to each fret position
export function getPositionIndex(fret: number, totalFrets: number = FRET_COUNT): number {
  const segment = Math.floor((fret / totalFrets) * 5);
  return Math.min(segment, 4);
}
