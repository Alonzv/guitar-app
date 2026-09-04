import { requestNavigate } from '../services/navigate';
import type { NavKey } from '../services/navigate';
import { T } from '../theme';

// ── See also ─────────────────────────────────────────────────────────────────
// A quiet closing line, not a panel: the sibling tools that answer the same
// question from another angle. Kept to plain text links so it never competes
// with the tool it sits under.

export interface SeeAlsoLink { id: string; tab: number; sub: string; label: string }

/** The three tools that all answer "which chords belong to this key?". */
export const KEY_TOOLS: Record<string, SeeAlsoLink> = {
  extensions: { id: 'chords:extensions',  tab: 0, sub: 'extensions',  label: 'Extensions table' },
  wheel:      { id: 'scales:wheel',       tab: 1, sub: 'wheel',       label: 'Chord Wheel' },
  harmonize:  { id: 'voicings:harmonizer', tab: 3, sub: 'harmonizer', label: 'Harmonize a melody' },
};

interface Props {
  links: SeeAlsoLink[];
  /** Carried to the destination so it opens on the key you were looking at. */
  navKey?: NavKey;
  label?: string;
}

export function SeeAlso({ links, navKey, label = 'See also' }: Props) {
  if (!links.length) return null;
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap',
      marginTop: 4, paddingTop: 12, borderTop: `1px solid ${T.border}`,
    }}>
      <span style={{
        fontSize: 10, color: '#9C958C', fontFamily: 'var(--gc-mono)',
        letterSpacing: '0.14em', textTransform: 'uppercase', flexShrink: 0,
      }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        {links.map((l, i) => (
          <span key={l.id} style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            {i > 0 && <span style={{ fontSize: 11, color: T.textDim }}>·</span>}
            <button
              onClick={() => requestNavigate({ id: l.id, tab: l.tab, sub: l.sub, key: navKey })}
              style={{
                padding: 0, border: 'none', background: 'transparent', borderRadius: 0,
                cursor: 'pointer', fontSize: 12, color: T.textMuted,
                textDecoration: 'underline', textUnderlineOffset: 3,
              }}
            >{l.label}</button>
          </span>
        ))}
      </div>
    </div>
  );
}
