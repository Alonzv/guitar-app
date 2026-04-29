import { Chord as TonalChord, ChordType, Interval } from '@tonaljs/tonal';
import type { Chord, FretPosition } from '../types/music';
import { fretPositionsToNotes, notesToPitchClasses, fretToNote, CHROMATIC, ENHARMONICS } from './musicTheory';

function noteToSemitone(note: string): number {
  const idx = CHROMATIC.indexOf(note);
  if (idx !== -1) return idx;
  const enh = ENHARMONICS[note];
  return enh ? CHROMATIC.indexOf(enh) : -1;
}

function samePitch(a: string, b: string): boolean {
  return a === b || ENHARMONICS[a] === b || a === ENHARMONICS[b];
}

// ── Chord type priority for guitar (lower = more common / preferred) ──────────
function chordTypePriority(suffix: string): number {
  const s = suffix.replace(/\/.*$/, ''); // strip slash bass
  if (s === '' || s === 'M')                               return 0; // major
  if (s === 'm')                                           return 0; // minor
  if (s === '5')                                           return 1; // power chord
  if (s === '7' || s === 'm7')                             return 1; // dom/min 7
  if (s === 'maj7' || s === 'mM7')                         return 2; // major 7
  if (s === 'dim' || s === 'aug')                          return 2; // dim / aug
  if (s === 'dim7' || s === 'm7b5')                        return 2; // half-dim
  if (/^sus[24]?$/.test(s))                                return 2; // sus
  if (/^add|^[mM]?6$|^[mM]?9$/.test(s))                  return 3; // add/6/9
  if (/[#b]/.test(s) && !s.startsWith('m') && s !== 'dim7') return 5; // altered
  return 4;
}

function chordTypeScore(name: string): number {
  const root = name.match(/^[A-G][b#]?/)?.[0] ?? '';
  return chordTypePriority(name.slice(root.length));
}

// ── Ranking: non-slash → bass match → chord type → length ────────────────────
function rankNames(names: string[], bassNote?: string): string[] {
  return [...names].sort((a, b) => {
    const aSlash = a.includes('/') ? 1 : 0;
    const bSlash = b.includes('/') ? 1 : 0;
    if (aSlash !== bSlash) return aSlash - bSlash;

    if (bassNote) {
      const aRoot = TonalChord.get(a).tonic ?? '';
      const bRoot = TonalChord.get(b).tonic ?? '';
      const aMatch = samePitch(aRoot, bassNote) ? 0 : 1;
      const bMatch = samePitch(bRoot, bassNote) ? 0 : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;
    }

    const tA = chordTypeScore(a);
    const tB = chordTypeScore(b);
    if (tA !== tB) return tA - tB;

    return a.length - b.length;
  });
}

// ── Step 1: Tonal.js detection with all rotations ─────────────────────────────
// Tries bass-note-first (for inversion detection) plus every rotation.
// Tonal.js treats the first element as the bass note, so:
//   ['E','C','G'] → 'CM/E' (first inversion)
//   ['C','E','G'] → 'CM'   (root position)
function detectAllRotations(notes: string[], bassNote?: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  const add = (name: string) => {
    if (!seen.has(name)) { seen.add(name); result.push(name); }
  };

  // Bass-first rotation gets priority — identifies inversions correctly
  if (bassNote) {
    const bassIdx = notes.findIndex(n => samePitch(n, bassNote));
    if (bassIdx > 0) {
      const bassFirst = [...notes.slice(bassIdx), ...notes.slice(0, bassIdx)];
      for (const name of TonalChord.detect(bassFirst)) add(name);
    }
  }

  // All rotations (each note as potential leading/bass)
  for (let i = 0; i < notes.length; i++) {
    const rotated = [...notes.slice(i), ...notes.slice(0, i)];
    for (const name of TonalChord.detect(rotated)) add(name);
  }

  return rankNames(result, bassNote);
}

// ── Step 2: Enharmonic substitutions ─────────────────────────────────────────
function detectWithEnharmonics(notes: string[], bassNote?: string): string[] {
  const variants: string[][] = [];

  // Generate combinations where each note can be its enharmonic equivalent
  const choices = notes.map(n => [n, ENHARMONICS[n]].filter(Boolean) as string[]);
  const total = Math.min(64, choices.reduce((acc, c) => acc * c.length, 1));

  for (let mask = 1; mask < total; mask++) {
    const variant: string[] = [];
    let tmp = mask;
    for (let i = 0; i < notes.length; i++) {
      variant.push(choices[i][tmp % choices[i].length]);
      tmp = Math.floor(tmp / choices[i].length);
    }
    variants.push(variant);
  }

  const seen = new Set<string>();
  const result: string[] = [];

  for (const variant of variants) {
    for (const name of detectAllRotations(variant, bassNote)) {
      if (!seen.has(name)) { seen.add(name); result.push(name); }
    }
    if (result.length > 0) break;
  }

  return result;
}

// ── Step 3: Score-based fallback ──────────────────────────────────────────────
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

  const bassSt = bassNote ? noteToSemitone(bassNote) : -1;
  const results: Array<Chord & { score: number }> = [];

  for (let rootSt = 0; rootSt < 12; rootSt++) {
    const intervals = semitones.map(s => (s - rootSt + 12) % 12);

    for (const ct of getCache()) {
      if (!intervals.every(i => ct.semitones.has(i))) continue;

      const coverage   = intervals.length / ct.complexity;
      const bassBonus  = bassSt >= 0 && bassSt === rootSt ? 2 : 0;
      const typeBonus  = (5 - chordTypePriority(ct.name)) * 0.4;
      const score      = coverage * 10 + bassBonus + typeBonus - ct.complexity * 0.3;

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
    results
      .filter(r => { if (seen.has(r.name)) return false; seen.add(r.name); return true; })
      .slice(0, 12)
      .map(r => r.name),
    bassNote
  );

  return ranked.slice(0, 6).map(name => {
    const r = results.find(x => x.name === name)!;
    return { name, notes: r.notes, aliases: r.aliases };
  });
}

// ── Display formatter ─────────────────────────────────────────────────────────
// Tonal.js appends 'M' for major chords (e.g. "CM"). Strip for display.
export function formatChordName(name: string): string {
  return name.replace(/^([A-G][b#]?)M(\/.*)?$/, '$1$2');
}

// ── Public API ────────────────────────────────────────────────────────────────
export function identifyChord(
  positions: FretPosition[],
  tuning?: string[],
  capo = 0,
): Chord[] {
  if (positions.length < 2) return [];

  // Sort by string index: string 0 = low E = bass
  const sorted    = [...positions].sort((a, b) => a.string - b.string);
  const bassNote  = fretToNote(sorted[0].string, sorted[0].fret, tuning, capo);

  // Build note list bass-first (preserves string order for Tonal.js)
  const orderedNotes  = sorted.map(p => fretToNote(p.string, p.fret, tuning, capo));
  const pitchClasses  = notesToPitchClasses(orderedNotes);
  if (pitchClasses.length < 2) return [];

  // 1. All rotations via Tonal.js (bass-first priority)
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
