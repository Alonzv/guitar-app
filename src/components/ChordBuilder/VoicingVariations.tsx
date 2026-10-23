import React, { useMemo } from 'react';
import type { FretPosition } from '../../types/music';
import { MiniFretboard } from '../Fretboard/MiniFretboard';
import { buildChromaColorMap } from './chordColors';
import { degreeLabels, shapeMeta } from './chordFormula';
import { fretToNote } from '../../utils/musicTheory';
import { Note } from '@tonaljs/tonal';
import { T } from '../../theme';
import { useLang } from '../../contexts/LanguageContext';
import { Rule } from '../Transit/parts';

interface Props {
  voicings: FretPosition[][];
  onSelect: (voicing: FretPosition[], index: number) => void;
  selectedIndex?: number;
  chordName?: string;
  tuning?: string[];
  gridColumns?: number;
}

// Square tiles, one shape each: the root dot cobalt, every dot its degree,
// the shape spelled underneath. The chosen tile is framed in ink.
export const VoicingVariations: React.FC<Props> = ({ voicings, onSelect, selectedIndex, chordName, tuning, gridColumns }) => {
  const { lang } = useLang();
  const he = lang === 'he';
  const chromaColors = useMemo(
    () => chordName ? buildChromaColorMap(chordName) : null,
    [chordName]
  );
  const grid: React.CSSProperties = gridColumns ? { gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))` } : {};

  if (voicings.length === 0) return (
    <Rule label={he ? 'וריאציות' : 'Voicing variations'}>
      <div className="gc-voicing-grid" style={{ ...grid, opacity: 0.45 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ background: T.bgInput, padding: '10px 6px 4px' }}>
            <MiniFretboard voicing={[]} />
          </div>
        ))}
      </div>
      <p className="su-label" style={{ margin: '12px 0 0' }}>
        {he ? 'בחרו שורש ואיכות כדי לראות צורות' : 'Pick a root and quality to see shapes'}
      </p>
    </Rule>
  );

  return (
    <Rule label={he ? `וריאציות · ${voicings.length} · הקישו להגדלה` : `Voicings · ${voicings.length} · tap to enlarge`}>
      <div className="gc-voicing-grid" style={grid}>
        {voicings.map((voicing, i) => {
          const isSelected = i === selectedIndex;
          const dotColors = chromaColors
            ? voicing.map(p => {
                const chroma = Note.chroma(fretToNote(p.string, p.fret, tuning));
                return chroma != null ? (chromaColors.get(chroma) ?? T.secondary) : T.secondary;
              })
            : undefined;
          return (
            <button
              key={i}
              type="button"
              className="gc-voicing-tile gc-no-bar gc-notation"
              onClick={() => onSelect(voicing, i)}
              aria-pressed={selectedIndex !== undefined ? isSelected : undefined}
              aria-label={`${he ? 'צורה' : 'Shape'} ${i + 1}: ${shapeMeta(voicing, tuning).shape}`}
              style={{
                cursor: 'pointer', borderRadius: 0, textAlign: 'start', letterSpacing: 'normal',
                border: `2px solid ${isSelected ? T.text : 'transparent'}`,
                background: T.bgInput, padding: '10px 6px 6px', minWidth: 0,
                display: 'flex', flexDirection: 'column', gap: 4, color: T.text,
              }}
            >
              <MiniFretboard voicing={voicing} dotColors={dotColors} tuning={tuning}
                dotLabels={chordName ? degreeLabels(voicing, chordName, tuning) : undefined} />
              <span dir="ltr" style={{ display: 'flex', justifyContent: 'space-between', gap: 6, padding: '0 4px', fontFamily: 'var(--gc-mono)', fontSize: 10, letterSpacing: '0.06em', minWidth: 0 }}>
                <span style={{ color: T.textMuted, flex: 'none' }}>{String(i + 1).padStart(2, '0')}</span>
                <span style={{ fontWeight: 700, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shapeMeta(voicing, tuning).shape}</span>
              </span>
            </button>
          );
        })}
      </div>
    </Rule>
  );
};
