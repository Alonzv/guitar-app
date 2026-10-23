// ── Help coverage guard ───────────────────────────────────────────
// HelpButton returns null for a topic it does not know, so a stop whose help
// entry is missing or renamed loses its "?" silently — no error, no gap in the
// layout, nothing to notice. That has happened twice. This walks every help
// topic the stops in src/data/tools.ts point at and fails the build if one has
// no entry.

import { readFileSync } from 'node:fs';
const R = p => readFileSync(p, 'utf8');

const help = new Set([...R('src/content/helpContent.ts').matchAll(/^\s*'([a-z]+:[a-z0-9]+)':/gm)].map(m => m[1]));
const reachable = new Set([...R('src/data/tools.ts').matchAll(/help: '([a-z]+:[a-z0-9]+)'/g)].map(m => m[1]));

let bad = 0;
for (const topic of reachable) {
  if (!help.has(topic)) { console.log('  MISSING help topic:', topic); bad++; }
}
console.log(bad
  ? `✗ Help guard: ${bad} stop view(s) would show no "?" at all.`
  : `✓ Help guard: all ${reachable.size} stop views have help text.`);

// the reverse: entries nothing can reach
const orphans = [...help].filter(t => !reachable.has(t));
// Unreachable entries are deliberate (a retired view parked for later), so
// they are reported but never fail the build.
if (orphans.length) console.log('  (parked, unreachable: ' + orphans.join(', ') + ')');
if (bad) process.exit(1);
