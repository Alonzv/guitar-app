import Anthropic from '@anthropic-ai/sdk';

export interface PathInfo {
  label: string;
  description: string;
  smoothness: number;
}

export interface MusicalAnalysis {
  key: string;
  character: string;       // Hebrew
  advice: string;          // Hebrew
  recommendedPath: number; // 0-based index into paths array
  recommendedReason: string; // Hebrew — why this path fits the vibe best
}

export async function analyzeProgression(
  chords: string[],
  genre: string,
  paths: PathInfo[],
): Promise<MusicalAnalysis | null> {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

    const pathLines = paths
      .map((p, i) => `  ${i}: "${p.label}" — smooth:${p.smoothness}/5 — ${p.description}`)
      .join('\n');

    const msg = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: `You are a guitar music expert. Analyze this chord progression for a guitarist.

Progression: ${chords.join(' → ')}
Genre/vibe: ${genre}

Available voicing paths (index: label — smoothness — description):
${pathLines}

Reply with valid JSON only, no markdown. Write "character", "advice", and "recommendedReason" in Hebrew:
{
  "key": "the musical key in English e.g. A minor",
  "character": "2 sentences in Hebrew describing the emotional/musical character of this progression",
  "advice": "1 sentence in Hebrew with a specific technique tip for this genre and progression",
  "recommendedPath": <index 0-${paths.length - 1} of the path that best fits the genre/vibe>,
  "recommendedReason": "1 sentence in Hebrew explaining why this path fits best"
}`,
      }],
    });

    const text = (msg.content[0] as { type: string; text: string }).text.trim();
    const start = text.indexOf('{');
    const end   = text.lastIndexOf('}');
    if (start === -1 || end === -1) return null;
    const parsed = JSON.parse(text.slice(start, end + 1)) as MusicalAnalysis;
    // Clamp recommendedPath to valid range
    parsed.recommendedPath = Math.max(0, Math.min(paths.length - 1, parsed.recommendedPath ?? 0));
    return parsed;
  } catch (err) {
    console.error('[musicalAnalysis] API error:', err);
    return null;
  }
}
