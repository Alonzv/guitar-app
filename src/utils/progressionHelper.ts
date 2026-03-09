import { Key, Chord as TonalChord, Note as TonalNote } from '@tonaljs/tonal';
import type { Chord, ChordInProgression, Genre, ProgressionSuggestion } from '../types/music';
import { GENRE_PATTERNS, DIATONIC_SUGGESTIONS } from '../data/genreProgressions';

const CHROMATIC    = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const FLAT_CHROMA  = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
const FLAT_KEYS    = new Set(['F','Bb','Eb','Ab','Db','Gb']);

// Detect the most likely key from a list of chords.
// Compares chord roots (as chromas) against all 24 keys using semitone offsets,
// with tiebreaker bonuses so relative keys (e.g. C major vs A minor) resolve correctly.
export function detectKey(chords: Chord[]): string {
  if (chords.length === 0) return '';

  // Semitone offsets of diatonic chord roots relative to key tonic
  const MAJOR_OFFSETS = [0, 2, 4, 5, 7, 9, 11];
  const MINOR_OFFSETS = [0, 2, 3, 5, 7, 8, 10]; // natural minor

  const progressionRoots = chords.map(c => {
    const tonic = TonalChord.get(c.name).tonic ?? c.name[0];
    return TonalNote.chroma(tonic) ?? -1;
  }).filter(r => r >= 0);

  if (progressionRoots.length === 0) return '';

  const firstChordQuality = TonalChord.get(chords[0].name).quality ?? '';

  let bestKey = '';
  let bestScore = -1;

  for (const keyRoot of CHROMATIC) {
    const keyChroma = TonalNote.chroma(keyRoot)!;

    for (const [mode, offsets] of [
      ['major', MAJOR_OFFSETS] as const,
      ['minor', MINOR_OFFSETS] as const,
    ]) {
      const diatonic = new Set(offsets.map(o => (keyChroma + o) % 12));
      const fit = progressionRoots.filter(r => diatonic.has(r)).length;

      // Tiebreaker bonuses (fractional so they never override a real fit difference)
      const tonicInProg  = progressionRoots.includes(keyChroma) ? 0.4 : 0;
      const firstIsTonic = progressionRoots[0] === keyChroma    ? 0.3 : 0;
      const qualityMatch = (
        (mode === 'minor' && firstChordQuality === 'Minor') ||
        (mode === 'major' && firstChordQuality === 'Major')
      ) ? 0.2 : 0;

      const score = fit + tonicInProg + firstIsTonic + qualityMatch;
      if (score > bestScore) { bestScore = score; bestKey = `${keyRoot} ${mode}`; }
    }
  }

  return bestKey;
}

// Convert a Roman-numeral pattern token (e.g. "IIm7", "bVII7", "Imaj7") to a
// concrete chord name in the given key (e.g. "Dm7", "Bb7", "Cmaj7").
function buildChordFromNumeral(numeral: string, keyRoot: string, _isMajor: boolean): string {
  // Match: optional ♭/♯  +  scale degree  +  quality suffix
  const m = numeral.match(
    /^(b|#)?(VII|VI|IV|V|III|II|I)(m7b5|maj7|maj9|mM7|dim7|add9|sus2|sus4|m7|m9|m6|m|13|11|9|7|6|5|aug|dim|o|)$/i
  );
  if (!m) return '';

  const accidental = m[1] ?? '';
  const degree     = m[2].toUpperCase();
  const rawQuality = m[3];

  const DEG: Record<string, number> = { I:0, II:2, III:4, IV:5, V:7, VI:9, VII:11 };
  let semi = DEG[degree];
  if (semi === undefined) return '';
  if (accidental === 'b') semi = (semi - 1 + 12) % 12;
  else if (accidental === '#') semi = (semi + 1) % 12;

  const rootSemi = CHROMATIC.indexOf(keyRoot) !== -1
    ? CHROMATIC.indexOf(keyRoot)
    : FLAT_CHROMA.indexOf(keyRoot);
  if (rootSemi === -1) return '';

  const noteIndex = (rootSemi + semi) % 12;
  const noteName  = FLAT_KEYS.has(keyRoot) ? FLAT_CHROMA[noteIndex] : CHROMATIC[noteIndex];

  // Map raw quality notation to Tonal.js suffix
  const Q: Record<string, string> = {
    '': 'M', m: 'm', '7': '7', m7: 'm7', maj7: 'maj7', maj9: 'maj9',
    mM7: 'mM7', dim7: 'dim7', add9: 'add9', sus2: 'sus2', sus4: 'sus4',
    m7b5: 'm7b5', m9: 'm9', m6: 'm6', '13': '13', '11': '11', '9': '9',
    '6': '6', '5': '5', aug: 'aug', dim: 'dim', o: 'dim',
  };
  const suffix = Q[rawQuality] ?? rawQuality;
  return `${noteName}${suffix}`;
}

// Suggest next chords given the current progression + genre
export function suggestNextChords(
  progression: ChordInProgression[],
  genre: Genre
): ProgressionSuggestion[] {
  if (progression.length === 0) return [];

  const lastChord  = progression[progression.length - 1].chord;
  const results: ProgressionSuggestion[] = [];
  const seen = new Set<string>();

  const add = (chordName: string, reason: string, numeral: string, genreLabel?: string) => {
    if (!chordName || seen.has(chordName)) return;
    seen.add(chordName);
    const info = TonalChord.get(chordName);
    results.push({
      chord: { name: chordName, notes: info.notes, aliases: info.aliases },
      reason,
      romanNumeral: numeral,
      genre: genreLabel,
    });
  };

  // ── Detect key ──────────────────────────────────────────────────────────────
  const detectedKey = detectKey(progression.map(c => c.chord));
  const keyRoot  = detectedKey.split(' ')[0];
  const isMajor  = detectedKey.includes('major');
  const keyInfo  = isMajor ? Key.majorKey(keyRoot) : Key.minorKey(keyRoot);
  const diatonicChords = isMajor
    ? (keyInfo as ReturnType<typeof Key.majorKey>).chords
    : (keyInfo as ReturnType<typeof Key.minorKey>).natural.chords;

  const majorNumerals = ['I', 'IIm', 'IIIm', 'IV', 'V', 'VIm', 'VIIo'];
  const minorNumerals = ['Im', 'IIo', 'bIII', 'IVm', 'Vm', 'bVI', 'bVII'];
  const scaleNumerals = isMajor ? majorNumerals : minorNumerals;

  // ── Diatonic path ───────────────────────────────────────────────────────────
  // Find the last chord's position in the key and look up its common resolutions
  diatonicChords.forEach((chordName, idx) => {
    if (chordName !== lastChord.name) return;
    const numeral   = scaleNumerals[idx] ?? `${idx + 1}`;
    const entry     = DIATONIC_SUGGESTIONS[numeral];
    if (!entry) return;
    entry.next.forEach((nextNum, i) => {
      const nextIdx  = scaleNumerals.indexOf(nextNum);
      const nextName = nextIdx !== -1 ? diatonicChords[nextIdx] : null;
      if (nextName) add(nextName, entry.reasons[i] ?? 'diatonic', nextNum);
    });
  });

  // ── Genre path ──────────────────────────────────────────────────────────────
  if (genre !== 'any') {
    GENRE_PATTERNS.filter(p => p.genre === genre).forEach(pattern => {
      pattern.numerals.forEach((_num, idx) => {
        if (idx >= pattern.numerals.length - 1) return;
        const nextNumeral  = pattern.numerals[idx + 1];
        const reason       = pattern.reasons[idx + 1] ?? pattern.name;
        const nextChordName = buildChordFromNumeral(nextNumeral, keyRoot, isMajor);
        if (nextChordName) add(nextChordName, reason, nextNumeral, genre);
      });
    });
  }

  // ── Fallback for "any" or empty diatonic results ────────────────────────────
  // When no diatonic match was found (last chord outside the key, or minor key
  // with no DIATONIC_SUGGESTIONS entry), suggest the most useful key chords.
  if (results.length === 0) {
    const fallback = isMajor
      ? [
          { idx: 3, reason: 'subdominant motion' },
          { idx: 4, reason: 'dominant motion' },
          { idx: 5, reason: 'relative minor' },
          { idx: 0, reason: 'return to tonic' },
          { idx: 1, reason: 'supertonic' },
          { idx: 6, reason: 'leading tone' },
        ]
      : [
          { idx: 3, reason: 'subdominant minor' },
          { idx: 4, reason: 'dominant' },
          { idx: 5, reason: 'submediant' },
          { idx: 6, reason: 'subtonic' },
          { idx: 0, reason: 'return to tonic' },
          { idx: 2, reason: 'relative major' },
        ];
    fallback.forEach(({ idx, reason }) => {
      const name = diatonicChords[idx];
      if (name && name !== lastChord.name) add(name, reason, scaleNumerals[idx] ?? `${idx + 1}`);
    });
  }

  // ── Also push genre suggestions when diatonic produced results but genre is set ─
  // (already handled above — genre path runs after diatonic and fills remaining slots)

  return results.slice(0, 6);
}

// Suggest chords from a user-entered Roman numeral string (e.g. "I IV V vi")
export function suggestCustomChords(
  progression: ChordInProgression[],
  numeralString: string,
): ProgressionSuggestion[] {
  if (progression.length === 0 || !numeralString.trim()) return [];

  const detectedKey = detectKey(progression.map(c => c.chord));
  const keyRoot = detectedKey.split(' ')[0] || 'C';
  const isMajor = detectedKey.includes('major');

  const tokens = numeralString.trim().split(/\s+/);
  const results: ProgressionSuggestion[] = [];
  const seen = new Set<string>();

  for (const token of tokens) {
    const chordName = buildChordFromNumeral(token, keyRoot, isMajor);
    if (!chordName || seen.has(chordName)) continue;
    seen.add(chordName);
    const info = TonalChord.get(chordName);
    if (info.empty) continue;
    results.push({
      chord: { name: chordName, notes: info.notes, aliases: info.aliases },
      reason: `custom: ${token}`,
      romanNumeral: token,
    });
  }
  return results.slice(0, 6);
}
