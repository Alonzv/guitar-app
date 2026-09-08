// ── Help coverage guard ───────────────────────────────────────────
// HelpButton returns null for a topic it does not know, so a sub-tab whose
// help entry is missing or renamed loses its "?" silently — no error, no gap
// in the layout, nothing to notice. That has happened twice. This walks every
// sub-tab the shells can render and fails the build if one has no entry.

import { readFileSync } from 'node:fs';
const R = p => readFileSync(p, 'utf8');

const help = new Set([...R('src/content/helpContent.ts').matchAll(/^\s*'([a-z]+:[a-z0-9]+)':/gm)].map(m => m[1]));

// every SEGS list in App.tsx, paired with the helpPrefix it is rendered with
const app = R('src/App.tsx');
const lists = {};
for (const m of app.matchAll(/const (\w+_SEGS)\s*=\s*\[([\s\S]*?)\];/g))
  lists[m[1]] = [...m[2].matchAll(/id: '([a-z0-9]+)'/g)].map(x => x[1]);
const pairs = [...app.matchAll(/items=\{(\w+_SEGS)\}[^>]*helpPrefix="([a-z]+)"/g)];

let bad = 0;
const counted = [];
const reachableCount = () => new Set(counted).size;
for (const [, list, prefix] of pairs) {
  for (const id of lists[list] ?? []) {
    const topic = `${prefix}:${id}`;
    counted.push(topic);
    if (!help.has(topic)) { console.log('  MISSING help topic:', topic); bad++; }
  }
}
// the Intervals tab builds its own bar
for (const id of [...R('src/components/Intervals/IntervalsTab.tsx').matchAll(/id: '([a-z]+)'/g)].map(m => m[1])) {
  const topic = `intervals:${id}`;
  counted.push(topic);
  if (!help.has(topic)) { console.log('  MISSING help topic:', topic); bad++; }
}
console.log(bad
  ? `\u2717 Help guard: ${bad} sub-tab(s) would show no "?" at all.`
  : `\u2713 Help guard: all ${reachableCount()} rendered sub-tabs have help text.`);

// the reverse: entries nothing can reach
const reachable = new Set();
for (const [, list, prefix] of pairs) for (const id of lists[list] ?? []) reachable.add(`${prefix}:${id}`);
for (const id of [...R('src/components/Intervals/IntervalsTab.tsx').matchAll(/id: '([a-z]+)'/g)].map(m=>m[1])) reachable.add(`intervals:${id}`);
const orphans = [...help].filter(t => !reachable.has(t));
// Unreachable entries are deliberate (a retired sub-tab parked for later), so
// they are reported but never fail the build.
if (orphans.length) console.log('  (parked, unreachable: ' + orphans.join(', ') + ')');
if (bad) process.exit(1);
