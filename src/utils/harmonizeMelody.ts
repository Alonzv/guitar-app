import Anthropic from '@anthropic-ai/sdk';
import { Note as TonalNote } from '@tonaljs/tonal';
import type { Tuning } from '../types/music';

// ── Types ───────────────────────────────────────────────────────────────────
// The harmonizer works on the same 6-row grid the Tab Builder uses.
// Row order (top → bottom): e B G D A E  (row 0 = high e, row 5 = low E).
export const STR_LABELS = ['e', 'B', 'G', 'D', 'A', 'E'] as const;
export type StrLabel = typeof STR_LABELS[number];

// Map a grid row label to the low-E-based string index used by the audio
// engine and tuning arrays (0 = low E … 5 = high e).
const LABEL_TO_LOWE: Record<StrLabel, number> = { E: 0, A: 1, D: 2, G: 3, B: 4, e: 5 };

export type HarmonizeStyle = 'vertical' | 'melodic' | '3rds' | '4ths5ths';

export const HARMONY_STYLES: { id: HarmonizeStyle; label: string; hint: string }[] = [
  { id: 'vertical', label: 'Vertical Chords', hint: 'Full chordal harmony under each melody note' },
  { id: 'melodic',  label: 'Melodic',         hint: 'Horizontal voice-leading — one moving harmony line' },
  { id: '3rds',     label: '3rds',            hint: 'Diatonic thirds below the melody' },
  { id: '4ths5ths', label: '4ths / 5ths',     hint: 'Quartal / power-interval harmony' },
];

export interface HarmNote {
  str: StrLabel;
  fret: number;
  added: boolean;      // true = AI harmony note, false = original melody note
  tech?: string;       // technique carried from the original note
}

export interface HarmColumn {
  col: number;         // original grid column index
  notes: HarmNote[];
}

export interface HarmonizeResult {
  columns: HarmColumn[];
  analysis: string;    // 1–2 sentences, English
}

interface Cell { fret: string; tech?: string }

// ── Melody extraction ────────────────────────────────────────────────────────
interface MelodyEvent {
  col: number;
  notes: { str: StrLabel; fret: number; note: string; tech?: string }[];
}

/** Pull the sparse melody events (non-empty columns) out of the grid. */
export function extractMelodyEvents(grid: Cell[][], tuning: Tuning): MelodyEvent[] {
  const numCols = grid[0]?.length ?? 0;
  const events: MelodyEvent[] = [];

  for (let c = 0; c < numCols; c++) {
    const notes: MelodyEvent['notes'] = [];
    for (let row = 0; row < grid.length && row < 6; row++) {
      const raw = grid[row]?.[c]?.fret;
      if (raw === undefined || raw === '') continue;
      const fret = parseInt(raw, 10);
      if (Number.isNaN(fret)) continue;
      const str = STR_LABELS[row];
      const openMidi = TonalNote.midi(tuning.notes[LABEL_TO_LOWE[str]]) ?? 40;
      const note = TonalNote.fromMidi(openMidi + fret);
      notes.push({ str, fret, note, tech: grid[row][c].tech });
    }
    if (notes.length > 0) events.push({ col: c, notes });
  }
  return events;
}

// ── AI harmonization ─────────────────────────────────────────────────────────
export async function harmonizeMelody(
  grid: Cell[][],
  scaleName: string,
  styles: HarmonizeStyle[],
  tuning: Tuning,
  regenerateSeed = 0,
): Promise<HarmonizeResult | null> {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const events = extractMelodyEvents(grid, tuning);
  if (events.length === 0) return null;
  if (styles.length === 0) return null;

  const styleLines = styles
    .map(s => `- ${HARMONY_STYLES.find(h => h.id === s)?.label}: ${HARMONY_STYLES.find(h => h.id === s)?.hint}`)
    .join('\n');

  // Compact melody payload for the model.
  const melodyJson = JSON.stringify(
    events.map(e => ({
      col: e.col,
      notes: e.notes.map(n => ({ str: n.str, fret: n.fret, note: n.note, ...(n.tech ? { tech: n.tech } : {}) })),
    })),
  );

  const regenNote = regenerateSeed > 0
    ? `\nThis is REGENERATE request #${regenerateSeed}: produce a DIFFERENT voice-leading and/or alternate fingering than an obvious first pass — same melody, fresh harmonic choices.`
    : '';

  try {
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: `You are a world-class guitar arranger. Harmonize a single-line melody for a 6-string guitar, producing a realistic, PLAYABLE tab.

Tuning (low→high): ${tuning.notes.join(' ')} (${tuning.label})
Diatonic context — the melody sits in: ${scaleName}. Treat this as the key/mode boundary.

String labels used in the data: e = high e (1st string), then B G D A E = low E (6th string).

Melody events (each is a grid column that already contains original note(s)):
${melodyJson}

Requested harmony style(s) — combine them tastefully:
${styleLines}

RULES — follow every one:
1. VOICE LEADING: move added harmony voices smoothly (small intervals, shared/common tones) from column to column. Avoid parallel awkward jumps.
2. ACCIDENTALS: notes outside ${scaleName} are passing tones or borrowed-chord tones — harmonize them as chromatic approach or secondary-dominant color, don't force them diatonic.
3. PLAYABILITY (critical): every column must be a real fingering one hand can hold. Max 6 notes per column, at most ONE note per string, frets within a ~4-fret span where possible. If a harmony note collides with the melody's string, you MAY relocate the ORIGINAL melody note to a neighbouring string/fret that produces the SAME pitch, to free the fingering — keep it flagged added:false.
4. TECHNIQUES: if an original note has a tech of "b" (bend), "~" (vibrato), "h"/"p" (hammer/pull), or "/"/"\\" (slide), the harmony notes you add in that column must be STATIC pedal-points — do NOT imitate the bend/slide. Keep added notes on frozen frets so the hand can still execute the technique. Carry the original tech only on the original note.
5. Keep the ORIGINAL melody note in every column (added:false). Add harmony notes as added:true.
6. Return the SAME columns in the SAME order, using the SAME col indices.${regenNote}

Return VALID JSON only, no markdown:
{
  "columns": [
    { "col": <int>, "notes": [ { "str": "e|B|G|D|A|E", "fret": <int 0-24>, "added": <bool>, "tech": "<optional>" } ] }
  ],
  "analysis": "<1-2 sentences, English — describe the harmonic approach used>"
}`,
        },
      ],
    });

    const text = (msg.content[0] as { type: string; text: string }).text.trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1) return null;

    const parsed = JSON.parse(text.slice(start, end + 1)) as HarmonizeResult;
    if (!Array.isArray(parsed.columns) || parsed.columns.length === 0) return null;

    // ── Local validation / playability sanity pass ───────────────────────────
    const validLabels = new Set(STR_LABELS);
    const cleaned: HarmColumn[] = [];
    for (const col of parsed.columns) {
      if (typeof col.col !== 'number' || !Array.isArray(col.notes)) continue;
      const perString = new Map<StrLabel, HarmNote>();
      for (const n of col.notes) {
        if (!validLabels.has(n.str as StrLabel)) continue;
        const fret = Math.round(Number(n.fret));
        if (Number.isNaN(fret) || fret < 0 || fret > 24) continue;
        const note: HarmNote = { str: n.str as StrLabel, fret, added: !!n.added, tech: n.tech };
        // One note per string — an original (added:false) always wins a collision.
        const existing = perString.get(note.str);
        if (!existing || (existing.added && !note.added)) perString.set(note.str, note);
      }
      const notes = [...perString.values()].slice(0, 6);
      if (notes.length > 0) cleaned.push({ col: col.col, notes });
    }

    if (cleaned.length === 0) return null;
    return {
      columns: cleaned,
      analysis: typeof parsed.analysis === 'string' ? parsed.analysis : '',
    };
  } catch (err) {
    console.error('[harmonizeMelody] API error:', err);
    return null;
  }
}

/** Map a string label back to the low-E-based index (0 = low E … 5 = high e). */
export function labelToLowEIndex(str: StrLabel): number {
  return LABEL_TO_LOWE[str];
}

/** Grid row index (0 = high e … 5 = low E) for a string label. */
export function labelToRow(str: StrLabel): number {
  return STR_LABELS.indexOf(str);
}
