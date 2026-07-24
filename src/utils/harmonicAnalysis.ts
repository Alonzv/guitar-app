import { Chord as TonalChord, Note } from '@tonaljs/tonal';

// ── Harmonic analysis ────────────────────────────────────────────────────────
// Light-weight functional analysis for a chord progression: detect the most
// likely key, then label each chord with a Roman numeral and flag the ones that
// fall outside the key. Deliberately conservative — it aims to be helpful and
// correct for common progressions, not a full musicological engine.

export type Mode = 'major' | 'minor';
export interface KeyGuess { tonicPc: number; mode: Mode }
export interface ChordAnalysis { name: string; roman: string; diatonic: boolean }
export interface ProgressionAnalysis {
  detected: KeyGuess;      // best auto-detected key
  key: KeyGuess;           // effective key used (override ?? detected)
  chords: ChordAnalysis[];
}

const MAJOR_SEMI = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SEMI = [0, 2, 3, 5, 7, 8, 10];
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

// Scale degree names spelled per key convention (index = tonic pitch-class).
const MAJ_TONIC = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const MIN_TONIC = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];

// rel semitone (0-11) → [degree number 1-7, accidental].
const MAJ_REL: Record<number, [number, string]> = {
  0: [1, ''], 1: [2, 'b'], 2: [2, ''], 3: [3, 'b'], 4: [3, ''], 5: [4, ''],
  6: [4, '#'], 7: [5, ''], 8: [6, 'b'], 9: [6, ''], 10: [7, 'b'], 11: [7, ''],
};
const MIN_REL: Record<number, [number, string]> = {
  0: [1, ''], 1: [2, 'b'], 2: [2, ''], 3: [3, ''], 4: [3, '#'], 5: [4, ''],
  6: [4, '#'], 7: [5, ''], 8: [6, ''], 9: [6, '#'], 10: [7, ''], 11: [7, '#'],
};

// Pitch classes that count as "in key". Minor keys include the raised 7th
// (harmonic-minor leading tone), so V and vii° read as diatonic.
function keyPcs(tonicPc: number, mode: Mode): Set<number> {
  const base = mode === 'major' ? MAJOR_SEMI : MINOR_SEMI;
  const s = new Set(base.map(x => (x + tonicPc) % 12));
  if (mode === 'minor') s.add((tonicPc + 11) % 12);
  return s;
}

interface Quality { base: 'maj' | 'min' | 'dim' | 'aug' | 'dom' | 'sus'; seventh: 'M' | 'm' | 'd' | null }

function quality(intervals: string[]): Quality {
  const iv = new Set(intervals);
  const has = (x: string) => iv.has(x);
  const third = has('3M') ? 'M' : has('3m') ? 'm' : null;
  const fifth = has('5P') ? 'P' : has('5d') ? 'd' : has('5A') ? 'A' : null;
  const seventh: Quality['seventh'] = has('7M') ? 'M' : has('7m') ? 'm' : has('7d') ? 'd' : null;
  let base: Quality['base'];
  if (!third) base = 'sus';
  else if (third === 'm' && fifth === 'd') base = 'dim';
  else if (third === 'M' && fifth === 'A') base = 'aug';
  else if (third === 'M') base = seventh === 'm' ? 'dom' : 'maj';
  else base = 'min';
  return { base, seventh };
}

// Roman numeral for one chord within a key, plus whether it's diatonic.
function analyzeChord(name: string, key: KeyGuess): ChordAnalysis {
  const info = TonalChord.get(name);
  const tonic = info.tonic;
  if (!tonic || !info.notes.length) return { name, roman: '?', diatonic: true };
  const rootPc = Note.chroma(tonic);
  if (rootPc == null) return { name, roman: '?', diatonic: true };

  const pcs = keyPcs(key.tonicPc, key.mode);
  const diatonic = info.notes.every(n => { const pc = Note.chroma(n); return pc != null && pcs.has(pc); });

  const rel = ((rootPc - key.tonicPc) % 12 + 12) % 12;
  const [num, acc] = (key.mode === 'major' ? MAJ_REL : MIN_REL)[rel];
  const q = quality(info.intervals);
  const lower = q.base === 'min' || q.base === 'dim';
  let letters = ROMAN[num - 1];
  if (lower) letters = letters.toLowerCase();

  let sym = '';
  if (q.base === 'dim') sym = q.seventh === 'd' ? '°7' : q.seventh === 'm' ? 'ø7' : '°';
  else if (q.base === 'aug') sym = '+';
  else if (q.base === 'sus') sym = 'sus' + (q.seventh ? '7' : '');
  else sym = q.seventh === 'M' ? 'maj7' : q.seventh ? '7' : '';

  return { name, roman: acc + letters + sym, diatonic };
}

// Score all 24 keys by how well the progression fits; pick the best.
export function detectKey(names: string[]): KeyGuess {
  const parsed = names.map(n => {
    const info = TonalChord.get(n);
    const tonic = info.tonic;
    return {
      root: tonic ? Note.chroma(tonic) : null,
      pcs: info.notes.map(x => Note.chroma(x)).filter((x): x is number => x != null),
    };
  });
  let best: KeyGuess = { tonicPc: 0, mode: 'major' };
  let bestScore = -Infinity;
  for (let tonic = 0; tonic < 12; tonic++) {
    for (const mode of ['major', 'minor'] as Mode[]) {
      const pcs = keyPcs(tonic, mode);
      let score = mode === 'major' ? 0.1 : 0;   // gentle tie-break toward major
      parsed.forEach((c, i) => {
        if (c.pcs.length && c.pcs.every(pc => pcs.has(pc))) score += 2;
        if (c.root != null && pcs.has(c.root)) score += 0.5;
        if (c.root === tonic) score += (i === 0 || i === parsed.length - 1) ? 0.6 : 0.2;
      });
      if (score > bestScore) { bestScore = score; best = { tonicPc: tonic, mode }; }
    }
  }
  return best;
}

export function analyzeProgression(names: string[], override?: KeyGuess | null): ProgressionAnalysis {
  const detected = detectKey(names);
  const key = override ?? detected;
  return { detected, key, chords: names.map(n => analyzeChord(n, key)) };
}

export function keyName(k: KeyGuess, lang: 'en' | 'he'): string {
  const tonic = k.mode === 'major' ? MAJ_TONIC[k.tonicPc] : MIN_TONIC[k.tonicPc];
  if (lang === 'he') return `${tonic} ${k.mode === 'major' ? "מז'ור" : 'מינור'}`;
  return `${tonic} ${k.mode}`;
}

// The 24 keys, ordered for a selector.
export const ALL_KEYS: KeyGuess[] = ([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const).flatMap(
  tonicPc => (['major', 'minor'] as Mode[]).map(mode => ({ tonicPc, mode })),
);
