/**
 * Structural eval harness for the Melody Harmonizer engine.
 *
 * Runs golden melodies through the real harmonizeMelody() (live API calls)
 * and asserts the properties the feature promises — the things a human can't
 * eyeball reliably across many notes:
 *
 *   1. MELODY PRESERVED   — every original pitch present at its slot, added:false
 *   2. ANCHORS RESPECTED  — no harmony inside non-anchor original columns
 *   3. TOP VOICE          — (chord-melody) melody is the highest pitch everywhere
 *   4. NOTE ECONOMY       — (chord-melody) ≤4 notes per column
 *   5. SMOOTH BRIDGES     — gap-slot notes within 7 frets of both neighbours
 *
 * Usage:  ANTHROPIC_API_KEY=sk-... npm run eval:harmonizer
 *
 * The deterministic guardrails in harmonizeMelody should make several of
 * these impossible to violate — a failure here means a guardrail regressed.
 * The per-case log also surfaces SOFT quality signals (how many columns got
 * harmony, average notes per chord) for human review.
 */
import {
  harmonizeMelody, extractMelodyEvents, noteMidi, labelToRow,
  SLOT_MULT, STR_LABELS,
  type HarmonizeStyle, type HarmonizeResult, type StrLabel,
} from '../src/utils/harmonizeMelody';
import { TUNINGS } from '../src/utils/musicTheory';

type Cell = { fret: string; tech?: string; anchor?: boolean };

const TUNING = TUNINGS[0]; // E standard

// ── Grid helpers ─────────────────────────────────────────────────────────────
// spec: one entry per column; each entry lists notes as "<row><fret>[*]"
// where row is a string label (e B G D A E), * marks a Harmonize Anchor.
// '' = empty column (a rest).
function mkGrid(spec: string[][]): Cell[][] {
  const grid: Cell[][] = STR_LABELS.map(() =>
    spec.map(() => ({ fret: '' } as Cell)),
  );
  spec.forEach((colNotes, c) => {
    for (const token of colNotes) {
      if (!token) continue;
      const anchor = token.endsWith('*');
      const t = anchor ? token.slice(0, -1) : token;
      const str = t[0] as StrLabel;
      const fret = t.slice(1);
      const row = labelToRow(str);
      grid[row][c] = anchor ? { fret, anchor: true } : { fret };
    }
  });
  return grid;
}

interface Case {
  name: string;
  scale: string;
  styles: HarmonizeStyle[];
  spec: string[][];
}

const CASES: Case[] = [
  {
    name: 'chord-melody, manual anchors, C major line',
    scale: 'C major',
    styles: ['chordmelody'],
    // e|-0*---1---3*---1---0*-  with rests between
    spec: [['e0*'], [], ['e1'], [], ['e3*'], [], ['e1'], [], ['e0*']],
  },
  {
    name: '3rds, auto anchors, A minor pentatonic riff',
    scale: 'A minor pentatonic',
    styles: ['3rds'],
    spec: [['B5'], ['B8'], ['e5'], ['e8'], ['e5'], ['B8'], ['B5'], ['G7']],
  },
  {
    name: 'melodic, manual anchors, G major',
    scale: 'G major',
    styles: ['melodic'],
    spec: [['e3*'], [], ['B3'], [], ['e2*'], [], ['B3'], [], ['e3*']],
  },
];

// ── Assertions ───────────────────────────────────────────────────────────────
interface Failure { rule: string; detail: string }

function checkResult(c: Case, grid: Cell[][], res: HarmonizeResult): { failures: Failure[]; info: string[] } {
  const failures: Failure[] = [];
  const info: string[] = [];

  const events = extractMelodyEvents(grid, TUNING);
  const bySlot = new Map(res.columns.map(col => [col.col, col.notes]));

  // Anchor set: manual marks, or the AI's reported auto selection.
  const manualAnchors = new Set(
    events.filter(e => e.notes.some(n => n.anchor)).map(e => e.col),
  );
  const anchorSlots = manualAnchors.size > 0
    ? manualAnchors
    : new Set(res.autoAnchorSlots ?? events.map(e => e.col));
  info.push(`anchors: ${[...anchorSlots].map(s => s / SLOT_MULT).join(',')}${manualAnchors.size ? ' (manual)' : ' (auto)'}`);

  // 1. Melody preserved (pitch-exact, added:false) at every original slot.
  for (const ev of events) {
    const out = bySlot.get(ev.col) ?? [];
    for (const orig of ev.notes) {
      const found = out.some(n => !n.added && noteMidi(n.str, n.fret, TUNING) === orig.midi);
      if (!found) failures.push({ rule: 'MELODY PRESERVED', detail: `slot ${ev.col}: pitch ${orig.midi} (${orig.str}${orig.fret}) missing` });
    }
  }

  // 2. Anchors respected: added notes only at anchor slots (gap slots exempt).
  for (const ev of events) {
    if (anchorSlots.has(ev.col)) continue;
    const added = (bySlot.get(ev.col) ?? []).filter(n => n.added);
    if (added.length > 0) failures.push({ rule: 'ANCHORS RESPECTED', detail: `non-anchor slot ${ev.col} got ${added.length} harmony note(s)` });
  }

  const isChordMelody = c.styles.includes('chordmelody');
  const originalSlots = new Set(events.map(e => e.col));

  for (const col of res.columns) {
    const pitches = col.notes.map(n => ({ midi: noteMidi(n.str, n.fret, TUNING), added: n.added }));

    // 3. Top voice (chord-melody, original columns only)
    if (isChordMelody && originalSlots.has(col.col)) {
      const melodyTop = Math.max(...pitches.filter(p => !p.added).map(p => p.midi), -1);
      const harmonyTop = Math.max(...pitches.filter(p => p.added).map(p => p.midi), -Infinity);
      if (melodyTop >= 0 && harmonyTop >= melodyTop) {
        failures.push({ rule: 'TOP VOICE', detail: `slot ${col.col}: harmony ${harmonyTop} >= melody ${melodyTop}` });
      }
    }

    // 4. Note economy (chord-melody)
    if (isChordMelody && col.notes.length > 4) {
      failures.push({ rule: 'NOTE ECONOMY', detail: `slot ${col.col}: ${col.notes.length} notes` });
    }
  }

  // 5. Smooth bridges: gap columns close to both neighbours (avg fret).
  const sorted = [...res.columns].sort((a, b) => a.col - b.col);
  const avgFret = (notes: { fret: number }[]) => notes.reduce((s, n) => s + n.fret, 0) / notes.length;
  sorted.forEach((col, i) => {
    if (originalSlots.has(col.col)) return;
    const prev = sorted[i - 1];
    const next = sorted.slice(i + 1).find(sc => originalSlots.has(sc.col));
    const a = avgFret(col.notes);
    if (prev && Math.abs(a - avgFret(prev.notes)) > 7) {
      failures.push({ rule: 'SMOOTH BRIDGES', detail: `gap slot ${col.col}: ${Math.abs(a - avgFret(prev.notes)).toFixed(1)} frets from previous` });
    }
    if (next && Math.abs(a - avgFret(next.notes)) > 7) {
      failures.push({ rule: 'SMOOTH BRIDGES', detail: `gap slot ${col.col}: ${Math.abs(a - avgFret(next.notes)).toFixed(1)} frets from next` });
    }
  });

  // Soft quality signals (not pass/fail — for human review).
  const harmonized = res.columns.filter(col => originalSlots.has(col.col) && col.notes.some(n => n.added));
  const gapCols = res.columns.filter(col => !originalSlots.has(col.col));
  const perChord = harmonized.map(cc => cc.notes.length);
  info.push(`harmonized ${harmonized.length}/${events.length} melody columns, ${gapCols.length} connecting column(s)`);
  if (perChord.length) info.push(`notes per harmonized column: [${perChord.join(', ')}]`);
  info.push(`analysis: ${res.analysis}`);

  return { failures, info };
}

// ── Runner ───────────────────────────────────────────────────────────────────
async function main() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    console.error('Set ANTHROPIC_API_KEY to run the eval (live API calls, ~3 requests).');
    process.exit(2);
  }

  let failed = 0;
  for (const c of CASES) {
    console.log(`\n━━ ${c.name} ━━`);
    const grid = mkGrid(c.spec);
    const res = await harmonizeMelody(grid, c.scale, c.styles, TUNING, 0, key);
    if (!res) {
      console.error('  ✗ engine returned null (API error / unparseable output)');
      failed++;
      continue;
    }
    const { failures, info } = checkResult(c, grid, res);
    info.forEach(l => console.log(`  · ${l}`));
    if (failures.length === 0) {
      console.log('  ✓ all structural checks passed');
    } else {
      failed++;
      failures.forEach(f => console.error(`  ✗ ${f.rule}: ${f.detail}`));
    }
  }

  console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${CASES.length - failed}/${CASES.length} cases clean`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
