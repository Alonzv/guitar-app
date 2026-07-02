// ── Anthropic proxy — Vercel serverless function ──────────────────────────────
// Holds the real API key in the server-only ANTHROPIC_API_KEY env var and
// forwards Messages API requests from the browser, so the key never ships in
// the client bundle. Set it in Vercel → Project → Settings → Environment
// Variables, and REMOVE the old VITE_ANTHROPIC_API_KEY (a VITE_ var is baked
// into public JS and readable by anyone via DevTools).
//
// Deliberately minimal, with hard limits so a scraped endpoint can't be
// abused as a general-purpose Claude gateway:
//   - POST only, JSON only
//   - model must be one the app actually uses
//   - max_tokens capped
//   - no streaming, no tools, no system prompts from the client

const ALLOWED_MODELS = new Set(['claude-sonnet-4-6', 'claude-haiku-4-5']);
const MAX_TOKENS_CAP = 4096;

interface ProxyRequest {
  method?: string;
  body?: unknown;
}
interface ProxyResponse {
  status: (code: number) => ProxyResponse;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
}

export const config = { maxDuration: 60 };

export default async function handler(req: ProxyRequest, res: ProxyResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'POST only' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY is not configured on the server' });
    return;
  }

  const body = req.body as Record<string, unknown> | undefined;
  if (!body || typeof body !== 'object') {
    res.status(400).json({ error: 'JSON body required' });
    return;
  }

  const model = body.model;
  if (typeof model !== 'string' || !ALLOWED_MODELS.has(model)) {
    res.status(400).json({ error: 'model not allowed' });
    return;
  }
  const maxTokens = typeof body.max_tokens === 'number' ? body.max_tokens : 0;
  if (!Number.isFinite(maxTokens) || maxTokens < 1 || maxTokens > MAX_TOKENS_CAP) {
    res.status(400).json({ error: `max_tokens must be 1..${MAX_TOKENS_CAP}` });
    return;
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    res.status(400).json({ error: 'messages required' });
    return;
  }
  if (body.stream) {
    res.status(400).json({ error: 'streaming not supported' });
    return;
  }

  // Forward only the fields the app uses — nothing else passes through.
  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: body.messages,
    }),
  });

  const data = await upstream.json().catch(() => ({ error: 'upstream returned non-JSON' }));
  res.status(upstream.status).json(data);
}
