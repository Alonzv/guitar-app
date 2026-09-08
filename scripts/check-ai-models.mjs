// ── Model allowlist guard ────────────────────────────────────────────────────
// The client picks a model from src/utils/aiModels.ts; the serverless proxy in
// api/anthropic.ts refuses anything outside its own allowlist. api/ is compiled
// by the host rather than this repo's tsconfig, so the two can't share a module
// and nothing else would catch them drifting — a bump on one side alone turns
// every AI tool into "model not allowed" only once it is deployed.

import { readFileSync } from 'node:fs';

const ids = src => [...src.matchAll(/'(claude-[a-z0-9.-]+)'/g)].map(m => m[1]);

const client = ids(readFileSync('src/utils/aiModels.ts', 'utf8'));
const proxy  = ids(readFileSync('api/anthropic.ts', 'utf8'));

if (!client.length) {
  console.error('✗ AI model guard: no model ids found in src/utils/aiModels.ts');
  process.exit(1);
}

const missing = client.filter(id => !proxy.includes(id));
if (missing.length) {
  console.error(`✗ AI model guard: ${missing.join(', ')} used by the app but not allowed by api/anthropic.ts`);
  console.error('  Add them to ALLOWED_MODELS there, or the deployed proxy will reject every call.');
  process.exit(1);
}

console.log(`✓ AI model guard: proxy allows all ${client.length} models the app uses.`);
