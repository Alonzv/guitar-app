import { createAIMessage } from './aiClient';
import { Scale, Note as TonalNote } from '@tonaljs/tonal';
import { fretToNote, CHROMATIC } from './musicTheory';

// TabBuilder rows: index 0 = high e, 5 = low E. musicTheory expects 0 = low E.
const TAB_ROW_TO_STRING = [5, 4, 3, 2, 1, 0];

const SHARP_TO_FLAT: Record<string, string> = { 'A#': 'Bb', 'D#': 'Eb', 'G#': 'Ab' };

const SCALE_TYPES = [
  'major', 'minor', 'dorian', 'mixolydian', 'phrygian', 'lydian', 'locrian',
  'minor pentatonic', 'major pentatonic', 'blues', 'harmonic minor', 'melodic minor',
];

export interface TabScaleResult {
  name: string;        // "G major"
  root: string;
  type: string;
  fitPercent: number;  // 0-100
  noteCount: number;   // how many distinct notes the tab used
}

interface Cell { fret: string; tech?: string }

/** Pull every written note out of the grid, in left-to-right reading order. */
export function extractTabNotes(
  grid: Cell[][],
  tuning?: string[],
): { ordered: string[]; pitchClasses: string[] } {
  const numCols = grid[0]?.length ?? 0;
  const ordered: string[] = [];

  for (let c = 0; c < numCols; c++) {
    for (let row = 0; row < grid.length; row++) {
      const fret = grid[row]?.[c]?.fret;
      if (fret !== undefined && fret !== '') {
        const f = parseInt(fret, 10);
        if (!Number.isNaN(f)) {
          ordered.push(fretToNote(TAB_ROW_TO_STRING[row], f, tuning));
        }
      }
    }
  }

  const seen = new Set<string>();
  const pitchClasses: string[] = [];
  for (const n of ordered) {
    const ch = TonalNote.chroma(n);
    if (ch !== undefined && !seen.has(n)) { seen.add(n); pitchClasses.push(n); }
  }

  return { ordered, pitchClasses };
}

/** Strongest-fitting scale for a tab. Returns the single best match. */
export function detectTabScale(
  grid: Cell[][],
  tuning?: string[],
): TabScaleResult | null {
  const { ordered, pitchClasses } = extractTabNotes(grid, tuning);
  if (pitchClasses.length === 0) return null;

  const wanted = pitchClasses
    .map(n => TonalNote.chroma(n))
    .filter((c): c is number => c !== undefined);
  const wantedSet = new Set(wanted);
  const firstChroma = TonalNote.chroma(ordered[0]);
  const lastChroma  = TonalNote.chroma(ordered[ordered.length - 1]);

  // Composite score: higher is better. Tie-breaks favour a tonic the player
  // actually emphasised — root present in the melody, and especially the
  // first or last note (common tonal anchors) — then simpler scale types.
  let best: TabScaleResult | null = null;
  let bestScore = -Infinity;

  for (const root of CHROMATIC) {
    const rootChroma = TonalNote.chroma(root)!;
    for (const type of SCALE_TYPES) {
      const scale = Scale.get(`${root} ${type}`);
      if (!scale || scale.empty) continue;
      const scaleChromas = new Set(
        scale.notes.map(n => TonalNote.chroma(n)).filter((c): c is number => c !== undefined)
      );
      let covered = 0;
      for (const c of wantedSet) if (scaleChromas.has(c)) covered++;
      const fitPercent = Math.round((covered / wantedSet.size) * 100);

      let score = fitPercent * 1000;
      if (wantedSet.has(rootChroma)) score += 120;           // root is actually played
      if (rootChroma === firstChroma) score += 80;           // melody starts on the root
      if (rootChroma === lastChroma)  score += 60;           // melody resolves to the root
      score -= SCALE_TYPES.indexOf(type) * 4;                // prefer common scale types

      if (score > bestScore) {
        bestScore = score;
        const displayRoot = SHARP_TO_FLAT[root] ?? root;
        best = { name: `${displayRoot} ${type}`, root: displayRoot, type, fitPercent, noteCount: wantedSet.size };
      }
    }
  }

  return best;
}

// ── AI progression suggestions ────────────────────────────────────────────
export interface ProgressionSuggestion {
  chords: string[];   // tonaljs-compatible chord names
  name_he: string;    // short vibe label, Hebrew
  name_en: string;    // short vibe label, English
  why_he: string;     // 1-2 sentences Hebrew
  why_en: string;     // 1-2 sentences English
}

export interface TabProgressionsResult {
  progressions: ProgressionSuggestion[];
}

export async function suggestTabProgressions(
  scaleName: string,
  melodyNotes: string[],
): Promise<TabProgressionsResult | null> {
  // Keep prompt compact — sample the melody if very long
  const melody = melodyNotes.length > 40
    ? melodyNotes.slice(0, 40).join(' ') + ' …'
    : melodyNotes.join(' ');

  try {
    const msg = await createAIMessage({
      model: 'claude-sonnet-4-6',
      max_tokens: 1100,
      messages: [
        {
          role: 'user',
          content: `You are a professional guitarist and composer with great harmonic taste.

A guitarist wrote a single-line melody/riff. Analysis detected it sits in: ${scaleName}.

Melody notes in order (pitch classes, left to right): ${melody}

Suggest 3 DISTINCT chord progressions a guitarist could play underneath this melody. Make them genuinely musical — not generic I-IV-V filler. Vary the emotional character (e.g. one safe/diatonic, one with a modal or borrowed flavor, one more adventurous). Each progression should be 3-4 chords and clearly support the melody's notes.

CRITICAL — Chord name format (must parse with tonaljs Chord.get()):
- Major: "C"   Minor: "Am"   Dominant 7: "G7"   Major 7: "Cmaj7"   Minor 7: "Dm7"
- Sus: "Dsus4" "Csus2"   Diminished: "Bdim"   Half-dim: "Bm7b5"   Add9: "Cadd9"
- 9ths: "Cmaj9" "Am9" "G9"   6: "C6"

For each progression provide BOTH a Hebrew and an English version of the vibe label and explanation.
- Hebrew: fluent, natural Israeli Hebrew (no transliteration, no English loanwords).
- English: natural, concise musician English.

Return valid JSON only, no markdown:
{
  "progressions": [
    { "chords": [<3-4 chord strings>], "name_he": "<Hebrew vibe label>", "name_en": "<English vibe label>", "why_he": "<1-2 Hebrew sentences>", "why_en": "<1-2 English sentences>" },
    { "chords": [...], "name_he": "...", "name_en": "...", "why_he": "...", "why_en": "..." },
    { "chords": [...], "name_he": "...", "name_en": "...", "why_he": "...", "why_en": "..." }
  ]
}`,
        },
      ],
    }, { signal: AbortSignal.timeout(60_000) });

    const text = (msg.content[0] as { type: string; text: string }).text.trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1) return null;

    const parsed = JSON.parse(text.slice(start, end + 1)) as TabProgressionsResult;
    if (!Array.isArray(parsed.progressions) || parsed.progressions.length === 0) return null;
    // Basic shape validation
    parsed.progressions = parsed.progressions.filter(
      p => Array.isArray(p.chords) && p.chords.length > 0
        && typeof p.name_he === 'string' && typeof p.name_en === 'string'
        && typeof p.why_he === 'string' && typeof p.why_en === 'string'
    );
    if (parsed.progressions.length === 0) return null;

    return parsed;
  } catch (err) {
    console.error('[analyzeTab] API error:', err);
    return null;
  }
}
