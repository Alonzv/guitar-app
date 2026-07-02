import { Note as TonalNote } from '@tonaljs/tonal';
import { createAIMessage } from './aiClient';
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

// Max average-fret distance (in frets) a connecting note may sit from the
// chord it's leaving or the chord it's approaching before it reads as an
// awkward jump rather than a smooth bridge, and gets dropped.
const MAX_CONNECT_JUMP = 7;

export type HarmonizeStyle = 'melodic' | '3rds' | 'chordmelody';

export const HARMONY_STYLES: { id: HarmonizeStyle; label: string; hint: string }[] = [
  { id: 'melodic',     label: 'Melodic',      hint: 'Horizontal voice-leading — an independent moving harmony line, with its own passing notes between melody notes' },
  { id: '3rds',        label: '3rds',         hint: 'Diatonic thirds below the melody' },
  { id: 'chordmelody', label: 'Chord-Melody', hint: 'Master-class solo-guitar arrangement — melody always on top, airy shell/triad voicings, bass anchored to the marked beats' },
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
  // Only set when the caller marked NO "Harmonize Anchor" notes — the slot
  // numbers (grid col * SLOT_MULT) the AI auto-selected as anchors, so the
  // UI can reflect them back onto the grid for the user to see/edit.
  autoAnchorSlots?: number[];
}

interface Cell { fret: string; tech?: string; anchor?: boolean }

// ── Melody extraction ────────────────────────────────────────────────────────
interface OriginalNote { str: StrLabel; fret: number; midi: number; note: string; tech?: string; anchor: boolean }
interface MelodyEvent {
  col: number;          // slot number
  notes: OriginalNote[];
}

/** MIDI pitch of a fret on a labeled string under the given tuning. */
export function noteMidi(str: StrLabel, fret: number, tuning: Tuning): number {
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
      notes.push({ str, fret, midi, note: TonalNote.fromMidi(midi), tech: grid[row][c].tech, anchor: !!grid[row][c].anchor });
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
  // Lets the Node-based eval harness (scripts/evalHarmonizer.ts) supply a key
  // directly, bypassing the /api/anthropic proxy.
  apiKeyOverride?: string,
): Promise<HarmonizeResult | null> {

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
  // Did the user mark any "Harmonize Anchor" notes themselves? If not, the
  // AI picks anchors itself (auto-detection) — see anchorScopeRule below.
  const hasManualAnchors = events.some(e => e.notes.some(n => n.anchor));

  const styleLines = styles
    .map(s => `- ${HARMONY_STYLES.find(h => h.id === s)?.label}: ${HARMONY_STYLES.find(h => h.id === s)?.hint}`)
    .join('\n');

  const melodyJson = JSON.stringify(
    events.map(e => ({
      col: e.col,
      notes: e.notes.map(n => ({
        str: n.str,
        fret: n.fret,
        note: n.note,
        ...(n.tech ? { tech: n.tech } : {}),
        ...(hasManualAnchors ? { anchor: n.anchor } : {}),
      })),
    })),
  );

  const regenNote = regenerateSeed > 0
    ? `\nThis is REGENERATE request #${regenerateSeed}: produce a DIFFERENT voice-leading and/or alternate fingering than an obvious first pass — same melody, fresh harmonic choices.`
    : '';

  // ── Harmonization scope: which original slots actually get harmonized ────
  const anchorScopeRule = hasManualAnchors
    ? `HARMONIZATION SCOPE — READ FIRST (overrides the style descriptions above): melody notes are marked "anchor": true or false by the user. Apply ALL style/harmony rules below ONLY at anchor:true slots — add chords, intervals, or ANY added:true notes ONLY there. At anchor:false slots, add NOTHING — return that slot with ONLY its original note(s), completely unharmonized, exactly as given. Anchor slots are the harmonic structure; anchor:false slots are melodic connective tissue between them — your gap-slot connecting material (see the connecting-notes rule) may still move underneath them on lower strings, but never add anything inside their own column.\n\n`
    : `HARMONIZATION SCOPE — READ FIRST (overrides the style descriptions above): the user did NOT mark any specific notes for harmonization. YOU must select which original slots deserve full harmony treatment — the "anchors" — based on their musical importance: notes that likely fall on strong beats (typically the first note after a gap, or a note followed by a longer gap than its neighbours, suggesting a longer duration), notes that end a melodic phrase (the last note before a bigger gap), leaps or otherwise melodically prominent notes, and chord-tones of the underlying harmony implied by ${scaleName}. Do NOT select every slot — a natural arrangement typically harmonizes roughly a third to half of the melody notes, leaving the rest as connective single notes. Apply the style/harmony rules ONLY at your chosen anchor slots; at every other original slot, add NOTHING — return ONLY its original note, unharmonized. Report your chosen anchor slots in the top-level "anchorSlots" array in the response (a subset of: ${originalSlots.join(', ')}). Briefly mention in "analysis" that anchors were auto-selected and why.\n\n`;

  const melodicRule = wantsMelodic
    ? `7. HORIZONTAL/MELODIC MOTION (requested — this is important): original melody slots are spaced ${SLOT_MULT} apart (${originalSlots.join(', ')}) specifically to leave room between them. Use that room: add EXTRA columns with integer "col" values strictly BETWEEN two consecutive original slots (never below ${minSlot} or above ${maxSlot}) containing ONLY added:true notes. These extra columns are an independent, horizontally-moving harmony voice — passing tones, neighbor tones, counter-melody motion that has its own rhythm and doesn't just double the melody vertically. Do not put an added:true note in EVERY gap between EVERY pair of melody notes — use them where they make musical sense, like a real second voice would move.`
    : `7. Original melody slots are spaced ${SLOT_MULT} apart purely so column numbers aren't sequential.`;

  const connectingNotesRule = `\n8. CONNECTING NOTES BETWEEN ANCHORS (makes it sound like a real guitarist, not stacked blocks or dead silence): between two consecutive HARMONIZED ANCHOR positions, don't just leave a gap — use the empty gap slots (spaced ${SLOT_MULT} apart, see rule 7) to bridge the two anchors with a short bass walk-up/walk-down, a chromatic or diatonic approach note into the next anchor's bass note, or a tiny melodic fill. These connecting notes are added:true, on LOWER strings than whatever melody note occupies that stretch (never colliding with an anchor:false slot's own column), and should feel like they belong to the same phrase, not random filler:
   - RHYTHMIC PLACEMENT: space connecting notes EVENLY across the available gap slots between the two anchors — e.g. one note roughly in the middle of the gap reads as an eighth-note pickup, two evenly-spaced notes read as sixteenth-note motion. Don't cram every gap slot full, and don't place connecting notes at random uneven offsets.
   - PHYSICAL CONNECTIVITY (critical): every connecting note's fret must sit within a comfortable stretch of BOTH the anchor position it's leaving and the anchor position it's arriving at — think of it as a physical bridge the fretting hand walks across, not a jump. If you can't connect smoothly, it's better to leave that particular gap empty than force an awkward jump.`;

  const chordMelodyRule = wantsChordMelody
    ? `\n9. CHORD-MELODY TOP VOICE (requested — CRITICAL, a hard physical/musical constraint, not a style preference): the melody note MUST be the TOP VOICE — the single highest-pitched note — in every harmonized column. EVERY added:true harmony or bass note must sound STRICTLY LOWER in pitch than the melody note in that same column, no exceptions. If the melody's current string doesn't leave physical room underneath it, relocate the melody note itself (per rule 3) to a thinner/higher string at the EXACT SAME pitch rather than let any harmony note outrank it.
10. NOTE ECONOMY & GUIDE TONES (hard rule): NEVER produce full 5-6 string barre-chord blocks. Every harmonized column uses AT MOST 4 notes total: the melody (mandatory, on top), a root in the bass, and the GUIDE TONES — the 3rd and the 7th. OMIT the 5th unless it IS the melody note or the chord is diminished/augmented (where the altered 5th defines the quality). Prefer triads and their inversions voiced on the upper string set (strings 1-4: e B G D); use the CAGED system only as a positional map of the neck region, never as full grip shapes.
11. BASS RHYTHMIC ANCHORING: bass notes land ONLY on the harmonize-anchor slots (the strong beats the user marked or you selected). Under the melody notes that flow BETWEEN anchors, add NO new bass note — the previous anchor's bass keeps ringing (sustain), which creates the rhythmic separation between the chord and the melody floating above it. Gap-slot connecting material (rule 8) in Chord-Melody mode is limited to a brief approach note leading INTO the next anchor's bass — not a continuous walking line under the melody.
12. CAMPANELLA & PEDAL POINTS: when choosing fingerings, give TOP priority to voicings that incorporate OPEN STRINGS — let notes ring into each other harp-like. If a bass note repeats or an open string (E, A, D in this tuning where applicable) fits the harmony across consecutive anchors, reuse it as a ringing PEDAL POINT under several chords instead of changing bass every time.
13. STRICT VOICE LEADING: the physical fret distance of the INNER VOICES from one anchor chord to the next must be minimal — prefer half-step or whole-step motion (e.g. the 3rd of one chord becoming the 7th of the next). The result should feel like choir-style continuous part-writing, with no unnecessary geographic jumps of the fretting hand.
14. POLY-CHORDS / SLASH VOICINGS: to get rich extensions (7ths, 9ths, 11ths) without finger overload, build a SIMPLE TRIAD on the upper strings and pair it with an independent, different bass note below — e.g. a C major triad over an A bass yields an open, airy Am7. Reach for this technique instead of stacking a literal extended-chord grip.
15. REHARMONIZE STATIC MELODY: if the same melody pitch repeats or sustains across several consecutive anchors, do NOT repeat the same chord — change the harmony UNDERNEATH the static note (a descending bass line, a II-V-I motion, or another progression the held note is a chord tone of) so the arrangement keeps moving even when the melody doesn't.`
    : '';

  try {
    const msg = await createAIMessage({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      // A hung request would otherwise leave the UI spinner running forever —
      // 90s is generous for a 4k-token completion, then we fail visibly.
      messages: [
        {
          role: 'user',
          content: `You are a world-class guitar arranger. Harmonize a single-line melody for a 6-string guitar, producing a realistic, PLAYABLE tab.

Tuning (low→high): ${tuning.notes.join(' ')} (${tuning.label})
Diatonic context — the melody sits in: ${scaleName}. Treat this as the key/mode boundary.

String labels used in the data: e = high e (1st string), then B G D A E = low E (6th string).

Melody events (each is an original grid column — a "slot" — that already contains original note(s)):
${melodyJson}

TIMING SEMANTICS: slot numbers are a TIME GRID — every ${SLOT_MULT} slot units equal ONE eighth-note column of the user's tab. Consecutive melody slots ${SLOT_MULT} apart are straight eighth notes; a larger gap means the previous note is HELD (or followed by a rest) for that long, making it rhythmically heavier — treat such notes as strong-beat/phrase-end candidates. Gap-slot notes you insert land proportionally in time (halfway between two slots = the "&" between their beats).

Requested harmony style(s) — combine them tastefully:
${styleLines}

${anchorScopeRule}RULES — follow every one:
1. VOICE LEADING: move added harmony voices smoothly (small intervals, shared/common tones) from event to event. Avoid parallel awkward jumps.
2. ACCIDENTALS: notes outside ${scaleName} are passing tones or borrowed-chord tones — harmonize them as chromatic approach or secondary-dominant color, don't force them diatonic.
3. PLAYABILITY (critical): every column must be a real fingering one hand can hold. Max 6 notes per column, at most ONE note per string, frets within a ~4-fret span where possible. If a harmony note collides with the melody's string, you MAY relocate the ORIGINAL melody note to a neighbouring string/fret that produces the EXACT SAME pitch, to free the fingering — keep it flagged added:false and make sure it's still the identical note.
4. TECHNIQUES: if an original note has a tech of "b" (bend), "~" (vibrato), "h"/"p" (hammer/pull), or "/"/"\\" (slide), the harmony notes you add in that column must be STATIC pedal-points — do NOT imitate the bend/slide. Keep added notes on frozen frets so the hand can still execute the technique. Carry the original tech only on the original note.
5. Keep the ORIGINAL melody note present at every original slot (added:false), reproducing its exact "str"/"fret" unless relocating per rule 3 (same pitch, different string).
6. Original slot numbers are fixed: ${originalSlots.join(', ')}. Do not change these numbers or drop any of them.
${melodicRule}${connectingNotesRule}${chordMelodyRule}${regenNote}

Return VALID JSON only, no markdown:
{
  "columns": [
    { "col": <int>, "notes": [ { "str": "e|B|G|D|A|E", "fret": <int 0-24>, "added": <bool>, "tech": "<optional>" } ] }
  ],${hasManualAnchors ? '' : `
  "anchorSlots": [<int subset of ${originalSlots.join(', ')} — the slots you auto-selected as anchors>],`}
  "analysis": "<1-2 sentences, English — describe the harmonic approach used>"
}`,
        },
      ],
    }, { signal: AbortSignal.timeout(90_000), apiKeyOverride });

    const text = (msg.content[0] as { type: string; text: string }).text.trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1) return null;

    const parsed = JSON.parse(text.slice(start, end + 1)) as HarmonizeResult;
    if (!Array.isArray(parsed.columns)) return null;

    // ── Resolve which original slots are anchors ──────────────────────────
    let anchorSlotSet: Set<number>;
    let autoAnchorSlots: number[] | undefined;
    if (hasManualAnchors) {
      anchorSlotSet = new Set(
        originalSlots.filter(s => (originalBySlot.get(s) ?? []).some(o => o.anchor)),
      );
    } else {
      const raw = Array.isArray((parsed as { anchorSlots?: unknown }).anchorSlots)
        ? (parsed as unknown as { anchorSlots: unknown[] }).anchorSlots
        : [];
      const aiChosen = raw
        .filter((s): s is number => typeof s === 'number')
        .map(s => Math.round(s))
        .filter(s => originalBySlot.has(s));
      // Safety net: if the model didn't return usable anchors, harmonize
      // everything rather than silently produce an unharmonized melody.
      anchorSlotSet = aiChosen.length > 0 ? new Set(aiChosen) : new Set(originalSlots);
      autoAnchorSlots = [...anchorSlotSet].sort((a, b) => a - b);
    }

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
      // Gap slots are always eligible for connecting notes; original slots
      // only get harmonized if they're an anchor (manual or AI-chosen).
      const isAnchorSlot = isOriginalSlot ? anchorSlotSet.has(slot) : true;

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
      // overriding a confirmed original note on the same string — but ONLY
      // at anchor slots (or any gap slot, which isn't subject to anchoring).
      if (isAnchorSlot) {
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

      // Chord-Melody hard cap: max 4 notes per column (melody + root +
      // guide tones) — matches prompt rule 10. Melody notes were inserted
      // into perString before harmony notes above, so this never truncates
      // the melody itself, only trims excess harmony notes off the tail.
      const notes = [...perString.values()].slice(0, wantsChordMelody ? 4 : 6);

      // CONNECTING NOTES guardrail — a gap-filler is only a bridge if it's
      // actually close to both the position it's leaving and the position
      // it's approaching. If it jumps too far from either neighbour, drop
      // it rather than keep an unplayable-feeling leap.
      if (!isOriginalSlot && notes.length > 0) {
        const avgFret = notes.reduce((s, n) => s + n.fret, 0) / notes.length;
        const prevCol = cleaned[cleaned.length - 1];
        const prevAvgFret = prevCol
          ? prevCol.notes.reduce((s, n) => s + n.fret, 0) / prevCol.notes.length
          : null;
        const nextOriginalSlot = originalSlots.find(s => s > slot);
        const nextOriginalNotes = nextOriginalSlot !== undefined ? originalBySlot.get(nextOriginalSlot) : undefined;
        const nextAvgFret = nextOriginalNotes?.length
          ? nextOriginalNotes.reduce((s, n) => s + n.fret, 0) / nextOriginalNotes.length
          : null;
        const tooFarFromPrev = prevAvgFret !== null && Math.abs(avgFret - prevAvgFret) > MAX_CONNECT_JUMP;
        const tooFarFromNext = nextAvgFret !== null && Math.abs(avgFret - nextAvgFret) > MAX_CONNECT_JUMP;
        if (tooFarFromPrev || tooFarFromNext) continue;
      }

      if (notes.length > 0) cleaned.push({ col: slot, notes });
    }

    if (cleaned.length === 0) return null;
    return {
      columns: cleaned,
      analysis: typeof parsed.analysis === 'string' ? parsed.analysis : '',
      ...(autoAnchorSlots ? { autoAnchorSlots } : {}),
    };
  } catch (err) {
    console.error('[harmonizeMelody] API error:', err);
    return null;
  }
}

// ── Single-column re-voice ───────────────────────────────────────────────────
// Replaces the harmony of ONE existing arrangement column, keeping everything
// else untouched — a scalpel next to Regenerate's sledgehammer. Same
// trust-but-verify treatment as the full pass: the melody at that slot is
// re-injected pitch-exact and the chord-melody caps are enforced in code.
export async function revoiceColumn(
  grid: Cell[][],
  scaleName: string,
  styles: HarmonizeStyle[],
  tuning: Tuning,
  current: HarmonizeResult,
  targetSlot: number,
  apiKeyOverride?: string,
): Promise<HarmColumn | null> {
  const events = extractMelodyEvents(grid, tuning);
  const origNotes = events.find(e => e.col === targetSlot)?.notes;
  if (!origNotes || origNotes.length === 0) return null; // only original melody slots are re-voicable

  const wantsChordMelody = styles.includes('chordmelody');
  const targetCol = current.columns.find(c => c.col === targetSlot);
  const arrangementJson = JSON.stringify(current.columns.map(c => ({
    col: c.col,
    notes: c.notes.map(n => ({ str: n.str, fret: n.fret, added: n.added })),
  })));

  const styleLines = styles
    .map(s => `- ${HARMONY_STYLES.find(h => h.id === s)?.label}: ${HARMONY_STYLES.find(h => h.id === s)?.hint}`)
    .join('\n');

  try {
    const msg = await createAIMessage({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: `You are refining ONE chord inside an existing solo-guitar arrangement. Do not touch anything else.

Tuning (low→high): ${tuning.notes.join(' ')} (${tuning.label})
Key/mode: ${scaleName}
String labels: e = high e (1st string) … E = low E (6th string).

Full arrangement (added:true = harmony, added:false = the user's melody):
${arrangementJson}

TARGET: slot ${targetSlot}. Its current notes: ${JSON.stringify(targetCol?.notes ?? [])}

Task: propose a DIFFERENT voicing for slot ${targetSlot} ONLY — fresh harmonic color or fingering, not a trivial reshuffle.

Style(s) in effect:
${styleLines}

Hard rules:
1. Keep every added:false note of the target slot at its EXACT pitch (you may relocate it to another string producing the same pitch).
2. ${wantsChordMelody
    ? 'CHORD-MELODY: the melody must remain the single highest pitch; MAX 4 notes total (melody + root + guide tones, omit the 5th); prefer open, shell-style spacing.'
    : 'At most 6 notes; the harmony should sit below the melody note.'}
3. One note per string, frets 0-24, within a ~4-fret hand span.
4. Voice-lead smoothly from the previous column and into the next one — stay physically close to both.

Return VALID JSON only, no markdown:
{ "notes": [ { "str": "e|B|G|D|A|E", "fret": <int>, "added": <bool> } ] }`,
      }],
    }, { signal: AbortSignal.timeout(60_000), apiKeyOverride });

    const text = (msg.content[0] as { type: string; text: string }).text.trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1) return null;
    const parsed = JSON.parse(text.slice(start, end + 1)) as { notes?: { str: string; fret: number; added: boolean; tech?: string }[] };
    if (!Array.isArray(parsed.notes)) return null;

    // Deterministic guardrails — same rules as the full harmonize pass.
    const perString = new Map<StrLabel, HarmNote>();
    const consumed = new Set<number>();
    for (const n of parsed.notes) {
      if (n.added) continue;
      if (!VALID_LABELS.has(n.str)) continue;
      const fret = Math.round(Number(n.fret));
      if (Number.isNaN(fret) || fret < 0 || fret > 24) continue;
      const str = n.str as StrLabel;
      const midi = noteMidi(str, fret, tuning);
      const matchIdx = origNotes.findIndex((o, i) => !consumed.has(i) && o.midi === midi);
      if (matchIdx === -1) continue;
      consumed.add(matchIdx);
      perString.set(str, { str, fret, added: false, tech: origNotes[matchIdx].tech });
    }
    origNotes.forEach((o, i) => {
      if (consumed.has(i)) return;
      if (!perString.has(o.str)) perString.set(o.str, { str: o.str, fret: o.fret, added: false, tech: o.tech });
    });
    for (const n of parsed.notes) {
      if (!n.added) continue;
      if (!VALID_LABELS.has(n.str)) continue;
      const fret = Math.round(Number(n.fret));
      if (Number.isNaN(fret) || fret < 0 || fret > 24) continue;
      const str = n.str as StrLabel;
      if (!perString.has(str)) perString.set(str, { str, fret, added: true });
    }
    if (wantsChordMelody) {
      const topMidi = Math.max(...[...perString.values()].filter(n => !n.added).map(n => noteMidi(n.str, n.fret, tuning)));
      for (const [str, n] of perString) {
        if (n.added && noteMidi(n.str, n.fret, tuning) >= topMidi) perString.delete(str);
      }
    }
    const notes = [...perString.values()].slice(0, wantsChordMelody ? 4 : 6);
    if (notes.length === 0) return null;
    return { col: targetSlot, notes };
  } catch (err) {
    console.error('[revoiceColumn] API error:', err);
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
