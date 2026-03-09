import { Chord as TonalChord, ChordType, Interval } from '@tonaljs/tonal';
import type { Chord, FretPosition } from '../types/music';
import { fretPositionsToNotes, notesToPitchClasses, fretToNote } from './musicTheory';

// ── Note helpers ───────────────────────────────────────────
const CHROMATIC = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const ENHARMONICS: Record<string, string> = {
  'C#':'Db','D#':'Eb','F#':'Gb','G#':'Ab','A#':'Bb',
  'Db':'C#','Eb':'D#','Gb':'F#','Ab':'G#','Bb':'A#',
};
function noteToSemitone(note: string): number {
  const idx = CHROMATIC.indexOf(note);
  if (idx !== -1) return idx;
  return CHROMATIC.indexOf(ENHARMONICS[note] ?? '') ?? -1;
}
function samePitch(a: string, b: string): boolean {
  return a === b || ENHARMONICS[a] === b || a === ENHARMONICS[b];
}

// ── Chord type priority (lower = more common / preferred) ──
function chordTypeScore(name: string): number {
  const root   = name.match(/^[A-G][b#]?/)?.[0] ?? '';
  const suffix = name.slice(root.length);
  if (suffix === 'M' || suffix === 'm' || suffix === '')       return 0; // major / minor
  if (/^[mM]?7$|^maj7$|^m7b5$|^dim7$|^mM7$/.test(suffix))   return 1; // 7th chords
  if (/^sus|add|^[mM]?6$|^[mM]?9$|^dim$|^aug$/.test(suffix)) return 2; // sus / add / 6 / dim / aug
  if (/[#b]/.test(suffix))                                     return 4; // altered
  return 3;
}

// ── Ranking: non-slash → bass match → chord type → length ──
function rankNames(names: string[], bassNote?: string): string[] {
  return [...names].sort((a, b) => {
    // 1. Non-slash chords first
    const aSlash = a.includes('/') ? 1 : 0, bSlash = b.includes('/') ? 1 : 0;
    if (aSlash !== bSlash) return aSlash - bSlash;

    // 2. Prefer chord whose root matches the bass note
    if (bassNote) {
      const aRoot = TonalChord.get(a).tonic ?? '';
      const bRoot = TonalChord.get(b).tonic ?? '';
      const aMatch = samePitch(aRoot, bassNote) ? 0 : 1;
      const bMatch = samePitch(bRoot, bassNote) ? 0 : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;
    }

    // 3. Common chord types first
    const tA = chordTypeScore(a), tB = chordTypeScore(b);
    if (tA !== tB) return tA - tB;

    // 4. Shorter name = simpler
    return a.length - b.length;
  });
}

// ── Step 1: Try all note rotations with Tonal.js ───────────
// Chord.detect is order-sensitive: ['G','C','E'] → 'CM/G' instead of 'CM'.
// Fix: try each note as the starting position so each can be root.
function detectAllRotations(notes: string[], bassNote?: string): string[] {
  const seen   = new Set<string>();
  const result: string[] = [];
  for (let i = 0; i < notes.length; i++) {
    const rotated = [...notes.slice(i), ...notes.slice(0, i)];
    for (const name of TonalChord.detect(rotated)) {
      if (!seen.has(name)) { seen.add(name); result.push(name); }
    }
  }
  return rankNames(result, bassNote);
}

// ── Step 2: Enharmonic substitutions ──────────────────────
function detectWithEnharmonics(notes: string[], bassNote?: string): string[] {
  const variants: string[][] = [notes];
  for (let i = 0; i < notes.length && variants.length < 64; i++) {
    const enh = ENHARMONICS[notes[i]];
    if (!enh) continue;
    for (const v of [...variants]) {
      const alt = [...v]; alt[i] = enh; variants.push(alt);
    }
  }
  const seen   = new Set<string>();
  const result: string[] = [];
  for (const variant of variants.slice(1)) {
    for (const name of detectAllRotations(variant, bassNote)) {
      if (!seen.has(name)) { seen.add(name); result.push(name); }
    }
    if (result.length > 0) return result;
  }
  return result;
}

// ── Step 3: Score-based fallback ───────────────────────────
interface CachedCT { name: string; semitones: Set<number>; aliases: string[]; complexity: number }
let _cache: CachedCT[] | null = null;
function getCache(): CachedCT[] {
  if (_cache) return _cache;
  _cache = ChordType.all()
    .filter(ct => !ct.empty && ct.intervals.length >= 2)
    .map(ct => {
      const semitones = new Set(
        ct.intervals.map(i => Interval.get(i).semitones ?? -1).filter(s => s >= 0).map(s => s % 12)
      );
      return { name: ct.aliases[0] ?? ct.name, semitones, aliases: ct.aliases, complexity: semitones.size };
    })
    .filter(ct => ct.semitones.size >= 2);
  return _cache;
}

function scoreBasedDetect(pitchClasses: string[], bassNote?: string): Chord[] {
  const semitones = pitchClasses.map(noteToSemitone).filter(s => s >= 0);
  if (semitones.length < 2) return [];
  const results: Array<Chord & { score: number }> = [];
  for (let rootSt = 0; rootSt < 12; rootSt++) {
    const intervals = semitones.map(s => (s - rootSt + 12) % 12);
    for (const ct of getCache()) {
      if (!intervals.every(i => ct.semitones.has(i))) continue;
      const coverage = intervals.length / ct.complexity;
      const score    = coverage * 10 - ct.complexity * 0.5;
      for (const root of [CHROMATIC[rootSt], ENHARMONICS[CHROMATIC[rootSt]]].filter(Boolean) as string[]) {
        const name  = `${root}${ct.name}`;
        const notes = [...ct.semitones].map(s => CHROMATIC[(rootSt + s) % 12]);
        results.push({ name, notes, aliases: ct.aliases, score });
      }
    }
  }
  results.sort((a, b) => b.score - a.score);
  const seen = new Set<string>();
  const ranked = rankNames(
    results.filter(r => { if (seen.has(r.name)) return false; seen.add(r.name); return true; })
           .slice(0, 12).map(r => r.name),
    bassNote
  );
  return ranked.slice(0, 6).map(name => {
    const r = results.find(x => x.name === name)!;
    return { name, notes: r.notes, aliases: r.aliases };
  });
}

// ── Display formatter ──────────────────────────────────────
// Tonal.js appends 'M' for major chords (e.g. "CM"). Strip it for display.
export function formatChordName(name: string): string {
  return name.replace(/^([A-G][b#]?)M(\/.*)?$/, '$1$2');
}

// ── Public API ─────────────────────────────────────────────
export function identifyChord(
  positions: FretPosition[],
  tuning?: string[],
  capo = 0,
): Chord[] {
  if (positions.length < 2) return [];

  // Determine bass note = lowest string with an active dot
  const lowest   = [...positions].sort((a, b) => a.string - b.string)[0];
  const bassNote = fretToNote(lowest.string, lowest.fret, tuning, capo);

  const allNotes    = fretPositionsToNotes(positions, tuning, capo);
  const pitchClasses = notesToPitchClasses(allNotes);
  if (pitchClasses.length < 2) return [];

  // 1. All rotations via Tonal.js
  let names = detectAllRotations(pitchClasses, bassNote);

  // 2. Enharmonic variants
  if (names.length === 0) names = detectWithEnharmonics(pitchClasses, bassNote);

  if (names.length > 0) {
    return names.slice(0, 6).map(name => {
      const info = TonalChord.get(name);
      return { name, notes: info.notes, aliases: info.aliases };
    });
  }

  // 3. Score-based fallback
  return scoreBasedDetect(pitchClasses, bassNote);
}
