import Anthropic from '@anthropic-ai/sdk';

export interface ReharmonizeResult {
  chords: string[];   // chord names compatible with tonaljs Chord.get()
  analysis: string;  // 1 sentence Hebrew — harmonic character
  theory: string;    // 2 sentences Hebrew — substitution techniques used
}

export async function reharmonize(
  chords: string[],
  genre: string,
  tension: number, // 1–5
): Promise<ReharmonizeResult | null> {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

    const tensionInstructions =
      tension <= 2
        ? 'Tension level: LOW (1-2). Use simple extensions only: add7, add9, sus2, sus4. Keep it close to the original harmony.'
        : tension === 3
        ? 'Tension level: MEDIUM (3). Use sus chords, borrowed chords, 9ths, add9. Moderate harmonic adventure.'
        : 'Tension level: HIGH (4-5). Use tritone substitutions, altered dominants (7b9, 7#11, 7alt), modal interchange, chromatic mediants. Push the harmony far.';

    const genreInstructions = (() => {
      switch (genre.toLowerCase()) {
        case 'jazz':
        case 'jazz / neo-soul':
          return 'Genre: Jazz/Neo-Soul. Favor extended chords (maj7, m9, 13, 7#11), tritone substitutions, ii-V-I motion, chromatic voice leading. Use rich upper extensions.';
        case 'blues':
          return 'Genre: Blues. Keep dominant 7ths (7, 9, 13) throughout. Use IV7, I7, V7 relationships. Blues scale harmony. Dominant substitutions only.';
        case 'rock':
          return 'Genre: Rock. Use power chord equivalents (no 3rd), sus2 and sus4 suspensions, add9 for color. Keep it raw and guitar-friendly.';
        case 'desert noir':
          return 'Genre: Desert Noir. Use minor modal sounds (Phrygian, Dorian), dim7 passing chords, augmented chords, mysterious flat-II (bII) substitutions.';
        case 'country':
          return 'Genre: Country. Use open-position friendly chords, add9, suspended chords, major 7ths. Bright, clean harmonic motion.';
        default:
          return `Genre: ${genre}. Use genre-appropriate chord substitutions and extensions.`;
      }
    })();

    const msg = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: `You are a professional harmony arranger. Re-harmonize the following chord progression.

Original progression (${chords.length} chords): ${chords.join(' → ')}

${genreInstructions}
${tensionInstructions}

CRITICAL — Chord name format rules (must be compatible with tonaljs Chord.get()):
- Major triad: "C" (not "Cmaj")
- Minor triad: "Am"
- Major 7th: "Cmaj7"
- Minor 7th: "Am7"
- Dominant 7th: "G7"
- Dominant 7b9: "G7b9"
- Dominant 7#11: "G7#11"
- Dominant 7alt: "G7alt" (if supported) or "G7b9"
- Sus2: "Csus2"
- Sus4: "Csus4"
- Diminished: "Bdim"
- Diminished 7th: "Bdim7"
- Half-diminished: "Bm7b5"
- Major 9th: "Cmaj9"
- Minor 9th: "Am9"
- Dominant 9th: "G9"
- Add9: "Cadd9"

You MUST return exactly ${chords.length} chords — one for each chord in the original progression.
Write "analysis" and "theory" in fluent, natural Israeli Hebrew — no English loanwords, no transliterations.

Return valid JSON only, no markdown:
{
  "chords": [<exactly ${chords.length} chord name strings>],
  "analysis": "<1 sentence in natural Hebrew describing the harmonic character of the re-harmonization>",
  "theory": "<2 sentences in natural Hebrew explaining the substitution techniques used>"
}`,
        },
      ],
    });

    const text = (msg.content[0] as { type: string; text: string }).text.trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1) return null;

    const parsed = JSON.parse(text.slice(start, end + 1)) as ReharmonizeResult;

    // Validate
    if (!Array.isArray(parsed.chords) || parsed.chords.length !== chords.length) return null;
    if (typeof parsed.analysis !== 'string' || typeof parsed.theory !== 'string') return null;

    return parsed;
  } catch (err) {
    console.error('[reharmonize] API error:', err);
    return null;
  }
}
