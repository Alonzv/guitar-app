import { useRef, type ReactNode } from 'react';
import { blurIn, ripple, strumWave, useOnChange } from '../../utils/motion';
import { Cta } from '../Transit/parts';
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
  // A new root or quality: the name rises 18px and unblurs.
  const nameRef = useRef<HTMLDivElement>(null);
  useOnChange(name, () => blurIn(nameRef.current, 18));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
      <div ref={nameRef}><PosterTitle head={root} tail={suffix || undefined} max={max ?? 200} min={44} as="h2" keepCase
        style={name ? undefined : { color: T.textMuted }} /></div>
      {aside && <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minHeight: 20 }}>{aside}</div>}
    </div>
  );
}

/** The chord's shape, large, with what it is made of — beside it when `side`. */
export function ChordDiagram({ voicing, name, tuning, capo = 0, side }: {
  voicing: FretPosition[]; name: string | null; tuning?: string[]; capo?: number; side?: boolean;
}) {
  const { lang } = useLang();
  const he = lang === 'he';
  const meta = shapeMeta(voicing, tuning, capo);
  return (
    <div style={side
      ? { display: 'grid', gridTemplateColumns: 'minmax(0, 380px) minmax(0, 1fr)', gap: 32, alignItems: 'center', minWidth: 0 }
      : { display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      <div data-strum-board style={{ maxWidth: side ? 380 : 460, width: '100%' }}>
        <MiniFretboard voicing={voicing} tuning={tuning} dotColors={rootColors(voicing, name, tuning)}
          dotLabels={degreeLabels(voicing, name, tuning)} showStringLabels showFretNumbers hideFretLabel />
      </div>
      <Meta cols={side ? 1 : 3} items={[
        { label: he ? 'צורה' : 'Shape', value: <span dir="ltr">{meta.shape}</span> },
        { label: he ? 'שריגים' : 'Frets', value: <span dir="ltr">{meta.frets}</span> },
        { label: he ? 'תווים' : 'Notes', value: <span dir="ltr">{meta.notes}</span> },
      ]} />
    </div>
  );
}

/** The round cobalt STRUM. A ring ripples out behind it and the notes on
 *  the chord's diagram ([data-strum-board]) ring low to high, 35ms a string,
 *  as the audio strums them. */
export function StrumButton({ onStrum, disabled, label, children }: {
  onStrum: () => void; disabled?: boolean; label: string; children: ReactNode;
}) {
  const ringRef = useRef<HTMLSpanElement>(null);
  const press = () => {
    onStrum();
    ripple(ringRef.current);
    strumWave(document.querySelector('[data-strum-board]'), '.gc-dot-face');
  };
  return (
    <span style={{ position: 'relative', display: 'inline-flex', flex: 'none' }}>
      <span ref={ringRef} aria-hidden style={{
        position: 'absolute', inset: 0, borderRadius: '50%', border: `2px solid ${T.primary}`, opacity: 0, pointerEvents: 'none',
      }} />
      <Cta round={92} onClick={press} disabled={disabled} label={label}>{children}</Cta>
    </span>
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
