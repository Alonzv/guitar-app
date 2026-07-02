import Anthropic from '@anthropic-ai/sdk';

// ── Shared Claude client ──────────────────────────────────────────────────────
// Single entry point for every AI call in the app, with two transports:
//
//   1. Direct browser SDK — used only when VITE_ANTHROPIC_API_KEY is present
//      (local development) or an explicit override is passed (the Node eval
//      harness). NOTE: a VITE_-prefixed key is baked into the client bundle
//      and readable by anyone via DevTools — never set it in production.
//
//   2. /api/anthropic proxy — the production path. The serverless function
//      (api/anthropic.ts) holds the real key in a server-only env var
//      (ANTHROPIC_API_KEY) and forwards the request, so no secret ever
//      reaches the browser.
//
// The proxy returns the raw Anthropic Messages API JSON, which is shape-
// compatible with the SDK's return value for everything callers read
// (content[0].text), so call sites don't care which transport ran.

export type AIMessageParams = Anthropic.MessageCreateParamsNonStreaming;

export interface AIRequestOptions {
  signal?: AbortSignal;
  /** Direct-SDK key override for Node harnesses (bypasses the proxy). */
  apiKeyOverride?: string;
}

export async function createAIMessage(
  params: AIMessageParams,
  opts: AIRequestOptions = {},
): Promise<Anthropic.Message> {
  // Optional chaining keeps this readable under plain Node (tsx), where
  // import.meta.env doesn't exist; Vite injects it in the browser bundle.
  const directKey = opts.apiKeyOverride ?? import.meta.env?.VITE_ANTHROPIC_API_KEY;

  if (directKey) {
    const client = new Anthropic({ apiKey: directKey, dangerouslyAllowBrowser: true });
    return client.messages.create(params, { signal: opts.signal });
  }

  const res = await fetch('/api/anthropic', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
    signal: opts.signal,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`AI proxy error ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<Anthropic.Message>;
}
