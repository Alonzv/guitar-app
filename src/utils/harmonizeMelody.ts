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
const VALID_LABELS = new Set<string>(STR_LABELS);

// Each original melody column is placed on a slot = gridCol * SLOT_MULT, leaving
// (SLOT_MULT - 1) empty slots between consecutive melody notes. This gives the AI
// real "time" to insert an independent, horizontally-moving melodic harmony line
// instead of only ever stacking notes vertically under existing melody columns.
export const SLOT_MULT = 4;

export type HarmonizeStyle = 'vertical' | 'melodic' | '3rds' | '4ths5ths' | 'chordmelody';

export const HARMONY_STYLES: { id: HarmonizeStyle; label: string; hint: string }[] = [
  { id: 'vertical',    label: 'Vertical Chords', hint: 'Full chordal harmony under each melody note' },
  { id: 'melodic',     label: 'Melodic',         hint: 'Horizontal voice-leading — an independent moving harmony line, with its own passing notes between melody notes' },
  { id: '3rds',        label: '3rds',            hint: 'Diatonic thirds below the melody' },
  { id: '4ths5ths',    label: '4ths / 5ths',     hint: 'Quartal / power-interval harmony' },
  { id: 'chordmelody', label: 'Chord-Melody',    hint: 'The melody is always the top (highest-pitched) note — every harmony/bass note sounds below it' },
];

export interface HarmNote {
  str: StrLabel;
  fret: number;
  added: boolean;      // true = AI harmony note, false = original melody note
  tech?: string;       // technique carried from the original note
}

export interface HarmColumn {
  col: number;         // slot number (gridCol * SLOT_MULT for original notes; any
                        // integer strictly between two original slots for inserted
                        // melodic passing tones)
  notes: HarmNote[];
}

export interface HarmonizeResult {
  columns: HarmColumn[];
  analysis: string;    // 1–2 sentences, English
}

interface Cell { fret: string; tech?: string }

// ── Melody extraction ────────────────────────────────────────────────────────
interface OriginalNote { str: StrLabel; fret: number; midi: number; note: string; tech?: string }
interface MelodyEvent {
  col: number;          // slot number
  notes: OriginalNote[];
}

function noteMidi(str: StrLabel, fret: number, tuning: Tuning): number {
  const openMidi = TonalNote.midi(tuning.notes[LABEL_TO_LOWE[str]]) ?? 40;
  return openMidi + fret;
}

/** Pull the sparse melody events (non-empty columns) out of the grid, placed on slots. */
export function extractMelodyEvents(grid: Cell[][], tuning: Tuning): MelodyEvent[] {
  const numCols = grid[0]?.length ?? 0;
  const events: MelodyEvent[] = [];

  for (let c = 0; c < numCols; c++) {
    const notes: OriginalNote[] = [];
    for (let row = 0; row < grid.length && row < 6; row++) {
      const raw = grid[row]?.[c]?.fret;
      if (raw === undefined || raw === '') continue;
      const fret = parseInt(raw, 10);
      if (Number.isNaN(fret)) continue;
      const str = STR_LABELS[row];
      const midi = noteMidi(str, fret, tuning);
      notes.push({ str, fret, midi, note: TonalNote.fromMidi(midi), tech: grid[row][c].tech });
    }
    if (notes.length > 0) events.push({ col: c * SLOT_MULT, notes });
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

  const originalBySlot = new Map<number, OriginalNote[]>();
  events.forEach(e => originalBySlot.set(e.col, e.notes));
  const originalSlots = events.map(e => e.col).sort((a, b) => a - b);
  const minSlot = originalSlots[0];
  const maxSlot = originalSlots[originalSlots.length - 1];
  const wantsMelodic = styles.includes('melodic');
  const wantsChordMelody = styles.includes('chordmelody');

  const styleLines = styles
    .map(s => `- ${HARMONY_STYLES.find(h => h.id === s)?.label}: ${HARMONY_STYLES.find(h => h.id === s)?.hint}`)
    .join('\n');

  const melodyJson = JSON.stringify(
    events.map(e => ({
      col: e.col,
      notes: e.notes.map(n => ({ str: n.str, fret: n.fret, note: n.note, ...(n.tech ? { tech: n.tech } : {}) })),
    })),
  );

  const regenNote = regenerateSeed > 0
    ? `\nThis is REGENERATE request #${regenerateSeed}: produce a DIFFERENT voice-leading and/or alternate fingering than an obvious first pass — same melody, fresh harmonic choices.`
    : '';

  const melodicRule = wantsMelodic
    ? `7. HORIZONTAL/MELODIC MOTION (requested — this is important): original melody slots are spaced ${SLOT_MULT} apart (${originalSlots.join(', ')}) specifically to leave room between them. Use that room: add EXTRA columns with integer "col" values strictly BETWEEN two consecutive original slots (never below ${minSlot} or above ${maxSlot}) containing ONLY added:true notes. These extra columns are an independent, horizontally-moving harmony voice — passing tones, neighbor tones, counter-melody motion that has its own rhythm and doesn't just double the melody vertically. Do not put an added:true note in EVERY gap between EVERY pair of melody notes — use them where they make musical sense, like a real second voice would move.`
    : `7. Original melody slots are spaced ${SLOT_MULT} apart purely so column numbers aren't sequential — don't add notes in the gaps between them, stay aligned to the melody's own columns for the requested style(s).`;

  const chordMelodyRule = wantsChordMelody
    ? `\n8. CHORD-MELODY (requested — CRITICAL, this is a hard physical/musical constraint, not a style preference): the melody note MUST be the TOP VOICE — the single highest-pitched note — in every column. EVERY added:true harmony or bass note you place must sound STRICTLY LOWER in pitch than the melody note in that same column, with no exceptions. If the melody's current string doesn't leave physical room underneath it for a full chord, relocate the melody note itself (per rule 3) to a thinner/higher string at the EXACT SAME pitch — freeing the thicker strings below for harmony — rather than compromise and let any harmony note outrank it. The melody must end up literally above every other note in pitch, not merely listed first.`
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

Melody events (each is an original grid column — a "slot" — that already contains original note(s)):
${melodyJson}

Requested harmony style(s) — combine them tastefully:
${styleLines}

RULES — follow every one:
1. VOICE LEADING: move added harmony voices smoothly (small intervals, shared/common tones) from event to event. Avoid parallel awkward jumps.
2. ACCIDENTALS: notes outside ${scaleName} are passing tones or borrowed-chord tones — harmonize them as chromatic approach or secondary-dominant color, don't force them diatonic.
3. PLAYABILITY (critical): every column must be a real fingering one hand can hold. Max 6 notes per column, at most ONE note per string, frets within a ~4-fret span where possible. If a harmony note collides with the melody's string, you MAY relocate the ORIGINAL melody note to a neighbouring string/fret that produces the EXACT SAME pitch, to free the fingering — keep it flagged added:false and make sure it's still the identical note.
4. TECHNIQUES: if an original note has a tech of "b" (bend), "~" (vibrato), "h"/"p" (hammer/pull), or "/"/"\\" (slide), the harmony notes you add in that column must be STATIC pedal-points — do NOT imitate the bend/slide. Keep added notes on frozen frets so the hand can still execute the technique. Carry the original tech only on the original note.
5. Keep the ORIGINAL melody note present at every original slot (added:false), reproducing its exact "str"/"fret" unless relocating per rule 3 (same pitch, different string).
6. Original slot numbers are fixed: ${originalSlots.join(', ')}. Do not change these numbers or drop any of them.
${melodicRule}${chordMelodyRule}${regenNote}

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
    if (!Array.isArray(parsed.columns)) return null;

    // ── Deterministic melody-preservation + playability guardrail ────────────
    // We do NOT trust the model's added:false claims blindly — every original
    // note is verified against the source grid by exact pitch match, and any
    // slot the model dropped or corrupted is re-injected from the real data.
    const aiBySlot = new Map<number, { str: string; fret: number; added: boolean; tech?: string }[]>();
    for (const col of parsed.columns) {
      if (typeof col.col !== 'number' || !Array.isArray(col.notes)) continue;
      aiBySlot.set(Math.round(col.col), col.notes);
    }

    const allSlots = new Set<number>([...originalSlots, ...aiBySlot.keys()]);
    const cleaned: HarmColumn[] = [];

    for (const slot of [...allSlots].sort((a, b) => a - b)) {
      if (slot < minSlot || slot > maxSlot) continue; // ignore out-of-range hallucinated slots
      const isOriginalSlot = originalBySlot.has(slot);
      if (!isOriginalSlot && !wantsMelodic) continue; // inserted slot but melodic style wasn't requested

      const origNotes = originalBySlot.get(slot) ?? [];
      const aiNotes = aiBySlot.get(slot) ?? [];
      const perString = new Map<StrLabel, HarmNote>();

      if (isOriginalSlot) {
        // Accept an added:false claim only if its pitch truly matches an
        // original note (possibly on a different string — a valid relocation).
        const consumed = new Set<number>();
        for (const n of aiNotes) {
          if (n.added) continue;
          if (!VALID_LABELS.has(n.str)) continue;
          const fret = Math.round(Number(n.fret));
          if (Number.isNaN(fret) || fret < 0 || fret > 24) continue;
          const str = n.str as StrLabel;
          const midi = noteMidi(str, fret, tuning);
          const matchIdx = origNotes.findIndex((o, i) => !consumed.has(i) && o.midi === midi);
          if (matchIdx === -1) continue; // hallucinated / wrong pitch — discard
          consumed.add(matchIdx);
          perString.set(str, { str, fret, added: false, tech: n.tech });
        }
        // Re-inject any original note the model dropped, altered, or never mentioned.
        origNotes.forEach((o, i) => {
          if (consumed.has(i)) return;
          if (!perString.has(o.str)) perString.set(o.str, { str: o.str, fret: o.fret, added: false, tech: o.tech });
        });
      }

      // Added:true harmony notes are trusted, subject to caps and never
      // overriding a confirmed original note on the same string.
      for (const n of aiNotes) {
        if (!n.added) continue;
        if (!VALID_LABELS.has(n.str)) continue;
        const fret = Math.round(Number(n.fret));
        if (Number.isNaN(fret) || fret < 0 || fret > 24) continue;
        const str = n.str as StrLabel;
        const existing = perString.get(str);
        if (existing && !existing.added) continue;
        if (!existing) perString.set(str, { str, fret, added: true, tech: n.tech });
      }

      // CHORD-MELODY guardrail — do not rely on the model to actually keep
      // the melody on top; enforce it. Any harmony note whose pitch equals
      // or exceeds the melody's (possibly relocated, per rule 3) pitch in
      // this column is dropped rather than allowed to outrank the melody.
      if (wantsChordMelody) {
        const melodyPitches = [...perString.values()]
          .filter(n => !n.added)
          .map(n => noteMidi(n.str, n.fret, tuning));
        if (melodyPitches.length > 0) {
          const topMidi = Math.max(...melodyPitches);
          for (const [str, n] of perString) {
            if (n.added && noteMidi(n.str, n.fret, tuning) >= topMidi) perString.delete(str);
          }
        }
      }

      const notes = [...perString.values()].slice(0, 6);
      if (notes.length > 0) cleaned.push({ col: slot, notes });
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
