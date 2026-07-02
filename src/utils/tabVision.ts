import Anthropic from '@anthropic-ai/sdk';
import type { TabContent } from '../services/types';

type ImgMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

const STR_ROWS = ['e', 'B', 'G', 'D', 'A', 'E']; // row 0 = high e … row 5 = low E

function emptyGrid(cols: number): { fret: string }[][] {
  return STR_ROWS.map(() => Array.from({ length: cols }, () => ({ fret: '' })));
}

/**
 * Extract a guitar tab from an uploaded image (screenshot / photo) into the
 * Tab Builder's grid structure using Claude vision.
 * Returns null on missing API key or unparseable output.
 */
export async function extractTabFromImage(
  base64Data: string,
  mediaType: ImgMediaType,
): Promise<TabContent | null> {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64Data },
            },
            {
              type: 'text',
              text: `Read this guitar tablature image and transcribe it into a structured grid.

The grid has exactly 6 rows in this order (top to bottom): e, B, G, D, A, E
(e = high e / 1st string, E = low E / 6th string).

Each row is an array of columns read LEFT to RIGHT in playing order. A column is a
time slot. If a string is played in that slot put the fret NUMBER as a string
("0".."24"); if not played put "" (empty string). Every row MUST have the same
number of columns. Align notes vertically by their horizontal position so notes
meant to sound together share a column.

Techniques — attach to the note's cell via "tech": one of
  "h" hammer-on, "p" pull-off, "/" slide up, "\\" slide down, "b" bend, "~" vibrato.

Use "bars" for the column indices where a barline "|" appears.

Keep it faithful — do not invent notes you cannot see. Return VALID JSON only,
no markdown:
{
  "title": "<title if visible, else empty>",
  "subtitle": "",
  "grid": [ [ {"fret":"3"}, {"fret":""}, {"fret":"5","tech":"h"} ], ... 6 rows ... ],
  "bars": [<int column indices>]
}`,
            },
          ],
        },
      ],
      // A hung request would otherwise leave the UI spinner running forever.
    }, { signal: AbortSignal.timeout(60_000) });

    const text = (msg.content[0] as { type: string; text: string }).text.trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1) return null;

    const parsed = JSON.parse(text.slice(start, end + 1)) as TabContent;
    if (!Array.isArray(parsed.grid) || parsed.grid.length === 0) return null;

    // Normalize: force exactly 6 rows of equal length, coerce cells.
    const maxCols = Math.max(1, ...parsed.grid.map(r => (Array.isArray(r) ? r.length : 0)));
    const grid = STR_ROWS.map((_, row) => {
      const src = parsed.grid[row] ?? [];
      return Array.from({ length: maxCols }, (_, c) => {
        const cell = src[c] as { fret?: string; tech?: string } | undefined;
        const fret = cell?.fret != null ? String(cell.fret) : '';
        return cell?.tech ? { fret, tech: cell.tech } : { fret };
      });
    });

    return {
      title: typeof parsed.title === 'string' ? parsed.title : '',
      subtitle: '',
      grid: grid.some(r => r.some(c => c.fret)) ? grid : emptyGrid(maxCols),
      bars: Array.isArray(parsed.bars) ? parsed.bars.filter(b => typeof b === 'number') : [],
    };
  } catch (err) {
    console.error('[tabVision] API error:', err);
    return null;
  }
}
