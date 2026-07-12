#!/usr/bin/env node
// ── Palette guard ────────────────────────────────────────────────────────────
// Fails the build if any component/util introduces a colour that isn't part of
// the official design palette. Every brand/semantic colour must come through a
// CSS variable token (var(--gc-*)) or the T.* theme object — never a raw hex or
// saturated rgb() literal.
//
// What's allowed as a *literal* in .ts/.tsx:
//   • var(--gc-*) tokens                      (the palette — always fine)
//   • pure black / white, any alpha           (#fff, #000, rgba(0,0,0,.5) …)
//   • the exact palette hex values            (see PALETTE below — for the few
//     places that legitimately need a concrete colour, e.g. PDF export)
//   • low-chroma neutral tones                (the warm-grey ramp)
// Anything else — a new hex, a saturated rgb(), or a named colour like "blue"
// or "gold" — is rejected, with the file, line and offending value printed.
//
// Source of truth for the palette is src/index.css. If you add a new palette
// colour there, add its hex to PALETTE below so concrete uses stay allowed.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const SRC = join(ROOT, 'src');

// Exact palette hex values (lowercased, no #). Mirrors src/index.css :root and
// body.dark, plus the vetted neutral warm-grey ramp used across the app.
const PALETTE = new Set([
  // light
  'ffffff', 'f0f0f0', 'd0d0d0', '1a1818', '322f2f', '000000', 'c9c2b8',
  '2b54d4', 'b4741a',
  // dark
  '111110', '1a1918', '242220', '383530', '6b655c', '7d766b', '9a938a',
  'f0ead8', 'f5eed8', '4a453e', '5e86ff', 'd99a3c', '15140f',
  // neutral warm-grey ramp (labels / categorical shades)
  '9c958c', '8a8378', '5c5650', '3a3a3a', '3a352f', '2e2a26', 'e4e0d8',
  'eae7e2', '222',
  // short forms of black/white
  'fff', '000',
]);

// Named CSS colours that must never appear as literals (use tokens instead).
const NAMED = /\b(red|green|blue|yellow|orange|purple|pink|cyan|teal|magenta|lime|navy|maroon|olive|gold|goldenrod|salmon|coral|crimson|indigo|violet|turquoise|aqua|fuchsia|khaki|tan|brown)\b/i;

// A colour is "saturated" (a hue, not a neutral) if its channels spread wide.
const SATURATION_LIMIT = 40;
const spread = (r, g, b) => Math.max(r, g, b) - Math.min(r, g, b);

function hexToRgb(h) {
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (h.length === 4) h = h.slice(0, 3).split('').map(c => c + c).join(''); // #rgba → rgb
  if (h.length === 8) h = h.slice(0, 6);
  if (h.length !== 6) return null;
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
}

const violations = [];

// Blank out comments (block + line) while preserving newlines, so line numbers
// stay accurate and colour names/hex inside comments aren't flagged.
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, m => ' '.repeat(m.length));
}

function scan(file, raw) {
  const text = stripComments(raw);
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    // Hex literals (skip HTML numeric entities like &#9654;)
    for (const m of line.matchAll(/(?<!&)#[0-9a-fA-F]{3,8}\b/g)) {
      const hex = m[0].slice(1).toLowerCase();
      if (PALETTE.has(hex)) continue;
      const rgb = hexToRgb(hex);
      // Allow greys (low chroma) even if not explicitly listed — the ramp is
      // neutral by design. Reject anything with a real hue.
      if (rgb && spread(...rgb) <= SATURATION_LIMIT) continue;
      violations.push({ file, line: i + 1, value: m[0] });
    }
    // rgb()/rgba() literals — reject saturated ones (neutrals/alpha pass)
    for (const m of line.matchAll(/rgba?\(\s*([0-9]+)\s*,\s*([0-9]+)\s*,\s*([0-9]+)/g)) {
      const rgb = [m[1], m[2], m[3]].map(Number);
      if (spread(...rgb) > SATURATION_LIMIT) {
        violations.push({ file, line: i + 1, value: m[0] + '…)' });
      }
    }
    // Named colours in a colour context (fill/stroke/background/color/border)
    if (/\b(fill|stroke|background|color|border|box-?shadow|stopColor)\b/i.test(line)) {
      const nm = line.match(NAMED);
      // ignore identifiers like "colorFor", "Blue" in prop names — require the
      // name to sit right after a quote or colon-space.
      if (nm && new RegExp(`['":]\\s*['"]?${nm[0]}['"]?`, 'i').test(line)) {
        violations.push({ file, line: i + 1, value: nm[0] });
      }
    }
  });
}

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else if (['.ts', '.tsx'].includes(extname(p))) scan(p.replace(ROOT + '/', ''), readFileSync(p, 'utf8'));
  }
}

walk(SRC);

if (violations.length) {
  console.error(`\n✖ Palette guard: ${violations.length} off-palette colour${violations.length > 1 ? 's' : ''} found.\n`);
  for (const v of violations) console.error(`  ${v.file}:${v.line}  →  ${v.value}`);
  console.error(`\nUse a palette token instead: var(--gc-*) or a T.* value from src/theme.ts.`);
  console.error(`If you genuinely added a new palette colour, define it in src/index.css and add its hex to scripts/check-palette.mjs.\n`);
  process.exit(1);
}

console.log('✓ Palette guard: all colours are on-palette.');
