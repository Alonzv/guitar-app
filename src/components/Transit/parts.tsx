import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { T } from '../../theme';
import { useLang } from '../../contexts/LanguageContext';
import { pillStyle, ctaStyle, keyStyle } from './styles';

// ── Transit parts ────────────────────────────────────────────────────────────
// The few pieces every stop is built from: a poster title that fits its
// width, outlined pills, square key grids, 2px section rules, ‹ › steppers
// and the mono meta row. Structure comes from rules, not boxes; buttons are
// pills, keys are square; cobalt marks one thing per view and none of these
// parts use it unless asked (`cta`).

// ── Poster title ─────────────────────────────────────────────────────────────
/** A big Archivo name sized to its width (never cut). `tail` is drawn
 *  outlined when the title is 60px or larger (C<outline>maj7</outline>). */
export function PosterTitle({ head, tail, max = 200, min = 40, as: Tag = 'h2', style, keepCase }: {
  head: ReactNode; tail?: ReactNode; max?: number; min?: number; as?: 'h1' | 'h2' | 'div'; style?: CSSProperties;
  /** Keep the text's case — chord and key names (Cm is not CM). */
  keepCase?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState(max);
  useEffect(() => {
    const b = box.current, t = text.current;
    if (!b || !t) return;
    const fit = () => {
      t.style.fontSize = `${max}px`;
      const w = t.scrollWidth, avail = b.clientWidth;
      const next = w > avail && w > 0 ? Math.max(min, Math.floor(max * avail / w)) : max;
      t.style.fontSize = `${next}px`;
      setSize(next);
    };
    fit();
    document.fonts?.ready.then(fit);
    const ro = new ResizeObserver(fit); ro.observe(b);
    return () => ro.disconnect();
  }, [head, tail, max, min]);
  return (
    <Tag style={{ margin: 0, minWidth: 0, ...style }}>
      <div ref={box} style={{ overflow: 'hidden', whiteSpace: 'nowrap', paddingBottom: '0.04em' }}>
        <span ref={text} className="su-poster" style={{ display: 'inline-block', fontSize: size, textTransform: keepCase ? 'none' : undefined }}>
          {head}{tail != null && <span className={size >= 60 ? 'su-outline' : undefined}>{tail}</span>}
        </span>
      </div>
    </Tag>
  );
}

// ── Section rule ─────────────────────────────────────────────────────────────
/** A 2px ink rule with a mono label and an optional right-hand slot. */
export function Rule({ label, right, children, style, top = true }: {
  label?: ReactNode; right?: ReactNode; children?: ReactNode; style?: CSSProperties; top?: boolean;
}) {
  return (
    <section style={{ borderTop: top ? `var(--su-rule) solid ${T.border}` : undefined, paddingTop: 10, minWidth: 0, ...style }}>
      {(label || right) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, minHeight: 28, marginBottom: 8 }}>
          {label ? <span className="su-label">{label}</span> : <span />}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

// ── Pills ────────────────────────────────────────────────────────────────────
/** An outlined pill; `active` fills it ink (and sets aria-pressed). */
export function Pill({ active, onClick, children, size, label, disabled, style, title }: {
  active?: boolean; onClick?: () => void; children: ReactNode; size?: 'sm' | 'md'; label?: string;
  disabled?: boolean; style?: CSSProperties; title?: string;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={active ?? undefined} aria-label={label} title={title}
      data-active={active || undefined} className="gc-no-bar"
      style={{ ...pillStyle(!!active, size), opacity: disabled ? 0.4 : 1, ...style }}>
      {children}
    </button>
  );
}

/** The one cobalt action in a view (STRUM, PLAY…). */
export function Cta({ onClick, children, disabled, label, style, round }: {
  onClick?: () => void; children: ReactNode; disabled?: boolean; label?: string; style?: CSSProperties;
  /** A round button of this diameter (the 92px STRUM). */
  round?: number;
}) {
  const r: CSSProperties = round ? { width: round, height: round, minWidth: round, padding: 0, borderRadius: '50%' } : {};
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} className="gc-no-bar"
      style={{ ...ctaStyle(disabled), ...r, ...style }}>{children}</button>
  );
}

/** A row of pills that wraps onto the next line — never runs off the edge,
 *  where a half-visible pill reads as a cut button. `scroll` keeps one
 *  sideways-scrolling line instead (long, open-ended lists only). */
export function PillRow<V extends string>({ items, value, onChange, wrap = true, scroll, size = 'sm', label }: {
  items: { id: V; label: ReactNode; title?: string }[]; value: V | null; onChange: (v: V) => void;
  wrap?: boolean; scroll?: boolean; size?: 'sm' | 'md'; label?: string;
}) {
  const oneLine = scroll || !wrap;
  return (
    <div role="group" aria-label={label} className="gc-no-scrollbar" style={{
      display: 'flex', gap: 6, flexWrap: oneLine ? 'nowrap' : 'wrap', overflowX: oneLine ? 'auto' : undefined,
      scrollbarWidth: 'none', minWidth: 0, paddingBottom: 1,
    }}>
      {items.map(it => (
        <Pill key={it.id} active={it.id === value} onClick={() => onChange(it.id)} size={size} title={it.title}>{it.label}</Pill>
      ))}
    </div>
  );
}

// ── Square keys ──────────────────────────────────────────────────────────────
/** A grid of square keys — 12 roots as 6×2, degrees, strings… */
export function KeyGrid<V extends string | number>({ items, value, onChange, cols = 6, label, mark, gap = 4 }: {
  items: { id: V; label: ReactNode; title?: string; disabled?: boolean }[]; value: V | null; onChange: (v: V) => void;
  cols?: number; label?: string;
  /** Draw the selected key cobalt (when it is the view's one marked thing). */
  mark?: boolean; gap?: number;
}) {
  return (
    <div role="group" aria-label={label} dir="ltr" style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap }}>
      {items.map(it => {
        const on = it.id === value;
        return (
          <button key={String(it.id)} type="button" onClick={() => onChange(it.id)} aria-pressed={on} title={it.title}
            disabled={it.disabled} data-active={on || undefined} className="gc-no-bar gc-notation"
            style={{ ...keyStyle(on, on && mark), opacity: it.disabled ? 0.35 : 1, letterSpacing: 'normal' }}>
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

// ── ‹ value › stepper ────────────────────────────────────────────────────────
export function Stepper({ value, onPrev, onNext, label, size = 'md', keepCase }: {
  value: ReactNode; onPrev: () => void; onNext: () => void; label?: string; size?: 'sm' | 'md';
  /** Keep the value's case (a key like "Am"). */
  keepCase?: boolean;
}) {
  const { lang } = useLang();
  const he = lang === 'he';
  return (
    <div role="group" aria-label={label} dir="ltr" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <Pill size={size} onClick={onPrev} label={he ? 'הקודם' : 'Previous'} style={{ padding: 0 }}><span dir="ltr" style={{ unicodeBidi: 'isolate' }}>‹</span></Pill>
      <span className="su-semi" style={{ minWidth: 48, textAlign: 'center', fontSize: size === 'sm' ? 18 : 22, textTransform: keepCase ? 'none' : 'uppercase' }}>{value}</span>
      <Pill size={size} onClick={onNext} label={he ? 'הבא' : 'Next'} style={{ padding: 0 }}><span dir="ltr" style={{ unicodeBidi: 'isolate' }}>›</span></Pill>
    </div>
  );
}

// ── Meta row ─────────────────────────────────────────────────────────────────
/** SHAPE x32010 · FRETS … — mono label over value, in columns. */
export function Meta({ items, cols }: { items: { label: ReactNode; value: ReactNode }[]; cols?: number }) {
  return (
    <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: `repeat(${cols ?? items.length}, minmax(0, 1fr))`, gap: 12 }}>
      {items.map((it, i) => (
        <div key={i} style={{ minWidth: 0 }}>
          <dt className="su-label">{it.label}</dt>
          <dd style={{ margin: '4px 0 0', fontSize: 13, fontWeight: 700, fontFamily: 'var(--gc-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

// ── Formula columns ──────────────────────────────────────────────────────────
/** Chord/scale formula as columns on a 4px top rule: degree over note.
 *  `mark` is the defining tone (the ♭3 of a minor chord…), drawn cobalt. */
export function Formula({ tones, mark, onTone }: {
  tones: { degree: string; note: string; name?: string }[]; mark?: number; onTone?: (i: number) => void;
}) {
  return (
    <div dir="ltr" style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(tones.length, 3)}, minmax(0, 1fr))`, gap: 10 }}>
      {tones.map((t, i) => {
        const on = i === mark;
        const c = on ? T.primary : T.text;
        return (
          <button key={i} type="button" onClick={onTone ? () => onTone(i) : undefined} className="gc-no-bar gc-notation"
            style={{
              borderWidth: '4px 0 0 0', borderStyle: 'solid', borderColor: c, padding: '8px 0 0', background: 'transparent',
              textAlign: 'start', cursor: onTone ? 'pointer' : 'default', color: c, minWidth: 0, letterSpacing: 'normal',
            }}>
            <span className="su-poster" style={{ display: 'block', fontSize: 40, color: c }}>{t.degree}</span>
            <span style={{ display: 'block', marginTop: 6, fontSize: 13, fontWeight: 700, fontFamily: 'var(--gc-mono)', color: on ? c : T.text }}>{t.note}</span>
            {t.name && <span className="su-label" style={{ display: 'block', marginTop: 2, color: on ? c : T.textMuted }}>{t.name}</span>}
          </button>
        );
      })}
    </div>
  );
}
