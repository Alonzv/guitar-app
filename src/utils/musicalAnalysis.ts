import Anthropic from '@anthropic-ai/sdk';

export interface MusicalAnalysis {
  key: string;
  character: string;
  advice: string;
}

export async function analyzeProgression(
  chords: string[],
  genre: string,
): Promise<MusicalAnalysis | null> {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [{
        role: 'user',
        content: `Analyze this guitar chord progression: ${chords.join(' → ')}
Genre/vibe: ${genre}

Reply with valid JSON only (no markdown fences):
{"key":"the musical key e.g. A minor","character":"2-sentence emotional/musical description","advice":"1 short technique tip for this vibe"}`,
      }],
    });

    const text = (msg.content[0] as { type: string; text: string }).text.trim();
    const start = text.indexOf('{');
    const end   = text.lastIndexOf('}');
    if (start === -1 || end === -1) return null;
    return JSON.parse(text.slice(start, end + 1)) as MusicalAnalysis;
  } catch {
    return null;
  }
}
