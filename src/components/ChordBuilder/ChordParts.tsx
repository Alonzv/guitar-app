import type { ReactNode } from 'react';
import type { FretPosition } from '../../types/music';
import { T } from '../../theme';
import { useLang } from '../../contexts/LanguageContext';
import { PosterTitle, Meta } from '../Transit/parts';
import { MiniFretboard } from '../Fretboard/MiniFretboard';
import { splitName, degreeLabels, shapeMeta } from './chordFormula';
import { rootColors } from './chordColors';
import { CARET, SELECT_PILL } from './ui';

// ── The Chord Builder's pieces ───────────────────────────────────────────────
// Shared by By name and By ear: the poster name (root solid, suffix outlined),
// the formula on its 4px rule with the defining tone in cobalt, and the big
// diagram with its SHAPE / FRETS / NOTES meta.

export function ChordPoster({ name, empty, aside, max }: { name: string | null; empty?: string; aside?: ReactNode; max?: number }) {
  const [root, suffix] = name ? splitName(name) : [empty ?? '—', ''];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
      <PosterTitle head={root} tail={suffix || undefined} max={max ?? 200} min={44} as="h2" keepCase
        style={name ? undefined : { color: T.textMuted }} />
      {aside && <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minHeight: 20 }}>{aside}</div>}
    </div>
  );
}

/** The chord's shape, large, with what it is made of. */
export function ChordDiagram({ voicing, name, tuning, capo = 0 }: {
  voicing: FretPosition[]; name: string | null; tuning?: string[]; capo?: number;
}) {
  const { lang } = useLang();
  const he = lang === 'he';
  const meta = shapeMeta(voicing, tuning, capo);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      <div style={{ maxWidth: 460, width: '100%' }}>
        <MiniFretboard voicing={voicing} tuning={tuning} dotColors={rootColors(voicing, name, tuning)}
          dotLabels={degreeLabels(voicing, name, tuning)} showStringLabels showFretNumbers hideFretLabel />
      </div>
      <Meta items={[
        { label: he ? 'צורה' : 'Shape', value: meta.shape },
        { label: he ? 'שריגים' : 'Frets', value: meta.frets },
        { label: he ? 'תווים' : 'Notes', value: meta.notes },
      ]} />
    </div>
  );
}

/** A labelled pill select (tuning, capo). */
export function PillSelect({ label, value, onChange, children }: {
  label: string; value: string | number; onChange: (v: string) => void; children: ReactNode;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, flex: 1 }}>
      <span className="su-label">{label}</span>
      <span style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <select aria-label={label} value={value} onChange={e => onChange(e.target.value)} style={SELECT_PILL}>{children}</select>
        <span aria-hidden style={CARET}>▾</span>
      </span>
    </label>
  );
}
