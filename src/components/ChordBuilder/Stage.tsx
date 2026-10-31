import { useRef, type ReactNode } from 'react';
import { Note } from '@tonaljs/tonal';
import { T } from '../../theme';
import { useLang } from '../../contexts/LanguageContext';
import type { ChordInProgression, FretPosition } from '../../types/music';
import { formatChordName } from '../../utils/chordIdentifier';
import { fretToNote } from '../../utils/musicTheory';
import { blurIn, strumWave, useOnChange } from '../../utils/motion';
import { MiniFretboard } from '../Fretboard/MiniFretboard';
import { buildChromaColorMap } from './chordColors';
import { degreeLabels, shapeMeta, splitName } from './chordFormula';

// ── The Chord Builder's stage ────────────────────────────────────────────────
// Same language as Progression and Tuner: the chord centred and large, one
// white action and one glass one, plain chips to choose with, and the
// tuning in the glass toolbar.

export const icon = (d: ReactNode, size = 19) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>
);

/** The chord's name, centred: root solid, quality muted, a quiet line under it. */
export function ChordStage({ name, empty, line, desktop }: { name: string | null; empty: string; line?: ReactNode; desktop?: boolean }) {
  const [root, suffix] = name ? splitName(formatChordName(name)) : ['', ''];
  const ref = useRef<HTMLDivElement>(null);
  useOnChange(name, () => blurIn(ref.current, 14));
  const size = desktop ? 96 : 76;
  return (
    <div ref={ref} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center', minWidth: 0 }}>
      {name ? (
        <h2 className="gc-notation" dir="ltr" style={{ margin: 0, fontFamily: 'var(--su-display)', fontSize: size, lineHeight: `${size + 6}px`, fontWeight: 700, letterSpacing: '-0.045em', maxWidth: '100%', overflowWrap: 'anywhere' }}>
          {root}<span style={{ color: T.textMuted }}>{suffix}</span>
        </h2>
      ) : (
        <h2 style={{ margin: 0, fontSize: desktop ? 34 : 28, lineHeight: 1.2, fontWeight: 700, letterSpacing: '-0.02em', color: T.textMuted }}>{empty}</h2>
      )}
      {line && <span className="su-sub" style={{ fontSize: 15 }}>{line}</span>}
    </div>
  );
}

/** The shape drawn large; it carries [data-strum-board] so Play ripples it. */
export function BigShape({ voicing, name, tuning, children }: { voicing: FretPosition[]; name: string | null; tuning?: string[]; children?: ReactNode }) {
  const colors = shapeColors(voicing, name, tuning);
  return (
    <div data-strum-board dir="ltr" style={{ width: '100%', maxWidth: 380, alignSelf: 'center' }}>
      {children ?? (
        <MiniFretboard voicing={voicing} tuning={tuning} dotColors={colors}
          dotLabels={name ? degreeLabels(voicing, name, tuning) : undefined} showStringLabels showFretNumbers hideFretLabel />
      )}
    </div>
  );
}

function shapeColors(voicing: FretPosition[], name: string | null, tuning?: string[]) {
  if (!name) return undefined;
  const map = buildChromaColorMap(name);
  return voicing.map(p => {
    const c = Note.chroma(fretToNote(p.string, p.fret, tuning));
    return c != null ? (map.get(c) ?? T.secondary) : T.secondary;
  });
}

/** White pill: the one main action. Plays, and rings the shape's dots. */
export function PlayButton({ onPlay, disabled, label }: { onPlay: () => void; disabled?: boolean; label: string }) {
  const press = () => { onPlay(); strumWave(document.querySelector('[data-strum-board]'), '.gc-dot-face'); };
  return (
    <button onClick={press} disabled={disabled} className="gc-no-bar"
      style={{ height: 50, padding: '0 26px 0 22px', borderRadius: 25, background: T.text, color: '#000', display: 'flex', alignItems: 'center', gap: 8, fontSize: 17, fontWeight: 600, opacity: disabled ? 0.35 : 1 }}>
      <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden><path d="M7 4.5v15l13-7.5z" fill="currentColor" /></svg>
      {label}
    </button>
  );
}

/** Glass pill: the secondary action. */
export function SoftButton({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled} className="gc-no-bar"
      style={{ height: 50, padding: '0 22px', borderRadius: 25, background: 'rgba(255,255,255,0.08)', color: T.text, display: 'flex', alignItems: 'center', gap: 7, fontSize: 17, fontWeight: 600, opacity: disabled ? 0.35 : 1 }}>
      {children}
    </button>
  );
}

/** A quiet tinted text button (Clear, Save, More shapes). */
export function TextBtn({ onClick, disabled, pressed, children }: { onClick: () => void; disabled?: boolean; pressed?: boolean; children: ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-pressed={pressed} className="gc-no-bar"
      style={{ height: 40, padding: '0 14px', borderRadius: 20, fontSize: 15, fontWeight: 500, color: T.tintLabel, opacity: disabled ? 0.35 : 1 }}>
      {children}
    </button>
  );
}

/** A labelled group of round chips; the chosen one is white. */
export function Chips<V extends string>({ label, items, value, onChange, cols }: {
  label: string; items: { id: V; label: ReactNode }[]; value: V | null; onChange: (v: V) => void; cols?: number;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: T.textMuted }}>{label}</span>
      <div role="radiogroup" aria-label={label} dir="ltr"
        style={cols ? { display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 6 } : { display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {items.map(it => {
          const on = it.id === value;
          return (
            <button key={it.id} role="radio" aria-checked={on} onClick={() => onChange(it.id)} className="gc-no-bar gc-notation"
              style={{
                height: 40, minWidth: 0, padding: cols ? 0 : '0 16px', borderRadius: 20, fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em',
                background: on ? T.text : 'rgba(255,255,255,0.08)', color: on ? '#000' : T.text,
              }}>
              {it.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** A row of small shapes; tapping one draws it large. */
export function ShapeStrip({ voicings, selected, onSelect, chordName, tuning }: {
  voicings: FretPosition[][]; selected: number; onSelect: (v: FretPosition[], i: number) => void; chordName: string; tuning?: string[];
}) {
  const { lang } = useLang();
  const he = lang === 'he';
  const map = buildChromaColorMap(chordName);
  return (
    <div role="radiogroup" aria-label={he ? 'צורות' : 'Shapes'} dir="ltr" className="gc-no-scrollbar"
      style={{ display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none', padding: 2, margin: -2 }}>
      {voicings.map((v, i) => {
        const on = i === selected;
        const colors = v.map(p => {
          const c = Note.chroma(fretToNote(p.string, p.fret, tuning));
          return c != null ? (map.get(c) ?? T.secondary) : T.secondary;
        });
        return (
          <button key={i} role="radio" aria-checked={on} onClick={() => onSelect(v, i)} className="gc-no-bar"
            aria-label={`${he ? 'צורה' : 'Shape'} ${i + 1}: ${shapeMeta(v, tuning).shape}`}
            style={{
              flex: '0 0 104px', borderRadius: 18, padding: '8px 6px 6px', background: 'rgba(255,255,255,0.06)',
              boxShadow: on ? `inset 0 0 0 2px ${T.text}` : undefined, display: 'flex', flexDirection: 'column', gap: 2, color: T.text,
            }}>
            <MiniFretboard voicing={v} tuning={tuning} dotColors={colors} />
            <span className="gc-notation" style={{ fontSize: 11, fontWeight: 600, color: on ? T.text : T.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {shapeMeta(v, tuning).shape}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** A glass pill in the toolbar with a native select laid over it. */
export function GlassSelect({ label, text, value, onChange, children }: {
  label: string; text: ReactNode; value: string | number; onChange: (v: string) => void; children: ReactNode;
}) {
  return (
    <label className="lg" style={{ height: 44, borderRadius: 22, display: 'flex', alignItems: 'center', gap: 6, padding: '0 14px 0 16px', fontSize: 14, fontWeight: 600, position: 'relative', whiteSpace: 'nowrap' }}>
      <span>{text}</span>
      {icon(<path d="m6 9 6 6 6-6" />, 13)}
      <select aria-label={label} value={value} onChange={e => onChange(e.target.value)}
        style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%' }}>
        {children}
      </select>
    </label>
  );
}

/** The song so far, one line, opening the Progression screen. */
export function SongStrip({ progression, onOpen }: { progression: ChordInProgression[]; onOpen: () => void }) {
  const { lang } = useLang();
  const he = lang === 'he';
  if (!progression.length) return null;
  return (
    <button onClick={onOpen} className="gc-no-bar su-row"
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderRadius: 22, background: T.bgCard, color: T.text, textAlign: 'start', width: '100%' }}>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: T.textMuted }}>
          {he ? `בשיר שלכם · ${progression.length} אקורדים` : `In your song · ${progression.length} chord${progression.length === 1 ? '' : 's'}`}
        </span>
        <span className="gc-notation" dir="ltr" style={{ fontSize: 17, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: he ? 'right' : 'left' }}>
          {progression.map(c => formatChordName(c.chord.name)).join('  ·  ')}
        </span>
      </span>
      <span style={{ color: T.tintLabel, fontSize: 15, fontWeight: 500, flex: 'none' }}>{he ? 'פתיחה' : 'Open'}</span>
    </button>
  );
}

/** A glass panel that folds open: a summary row on top, the choices inside. */
export function Fold({ title, summary, open, onToggle, children }: {
  title: string; summary: ReactNode; open: boolean; onToggle: () => void; children: ReactNode;
}) {
  return (
    <div className="lg su-fold" data-open={open || undefined} style={{ borderRadius: 26, minWidth: 0 }}>
      <button onClick={onToggle} aria-expanded={open} className="gc-no-bar"
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', color: T.text, textAlign: 'start', borderRadius: 26 }}>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: T.textMuted }}>{title}</span>
          <span className="gc-notation" style={{ fontSize: 17, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{summary}</span>
        </span>
        <span className="su-fold-chev" style={{ flex: 'none', color: T.textMuted, display: 'flex' }}>{icon(<path d="m6 9 6 6 6-6" />, 18)}</span>
      </button>
      <div className="su-fold-body">
        <div style={{ overflow: 'hidden', minHeight: 0 }}>
          <div style={{ padding: '2px 18px 18px' }}>{children}</div>
        </div>
      </div>
    </div>
  );
}
