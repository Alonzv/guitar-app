import Anthropic from '@anthropic-ai/sdk';
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
  const { pitchClasses } = extractTabNotes(grid, tuning);
  if (pitchClasses.length === 0) return null;

  const wanted = pitchClasses
    .map(n => TonalNote.chroma(n))
    .filter((c): c is number => c !== undefined);
  const wantedSet = new Set(wanted);

  let best: TabScaleResult | null = null;

  for (const root of CHROMATIC) {
    for (const type of SCALE_TYPES) {
      const scale = Scale.get(`${root} ${type}`);
      if (!scale || scale.empty) continue;
      const scaleChromas = new Set(
        scale.notes.map(n => TonalNote.chroma(n)).filter((c): c is number => c !== undefined)
      );
      let covered = 0;
      for (const c of wantedSet) if (scaleChromas.has(c)) covered++;
      const fitPercent = Math.round((covered / wantedSet.size) * 100);

      if (!best
        || fitPercent > best.fitPercent
        // tie-break: prefer simpler/more-common scales (earlier in SCALE_TYPES)
        || (fitPercent === best.fitPercent
            && SCALE_TYPES.indexOf(type) < SCALE_TYPES.indexOf(best.type))) {
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
  name: string;       // short Hebrew name/vibe for this progression
  why: string;        // 1-2 sentences Hebrew explaining the fit
}

export interface TabProgressionsResult {
  progressions: ProgressionSuggestion[];
}

export async function suggestTabProgressions(
  scaleName: string,
  melodyNotes: string[],
): Promise<TabProgressionsResult | null> {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  // Keep prompt compact — sample the melody if very long
  const melody = melodyNotes.length > 40
    ? melodyNotes.slice(0, 40).join(' ') + ' …'
    : melodyNotes.join(' ');

  try {
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 700,
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

Write "name" and "why" in fluent, natural Israeli Hebrew (no transliteration, no English loanwords).

Return valid JSON only, no markdown:
{
  "progressions": [
    { "chords": [<3-4 chord strings>], "name": "<short Hebrew vibe label>", "why": "<1-2 Hebrew sentences on why it fits the melody>" },
    { "chords": [...], "name": "...", "why": "..." },
    { "chords": [...], "name": "...", "why": "..." }
  ]
}`,
        },
      ],
    });

    const text = (msg.content[0] as { type: string; text: string }).text.trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1) return null;

    const parsed = JSON.parse(text.slice(start, end + 1)) as TabProgressionsResult;
    if (!Array.isArray(parsed.progressions) || parsed.progressions.length === 0) return null;
    // Basic shape validation
    parsed.progressions = parsed.progressions.filter(
      p => Array.isArray(p.chords) && p.chords.length > 0
        && typeof p.name === 'string' && typeof p.why === 'string'
    );
    if (parsed.progressions.length === 0) return null;

    return parsed;
  } catch (err) {
    console.error('[analyzeTab] API error:', err);
    return null;
  }
}
