import { useRef, type CSSProperties, type ReactNode } from 'react';
import { T } from '../../theme';
import type { Tech } from './tabEditing';

// ── The fret keypad ──────────────────────────────────────────────────────────
// An ink panel of square keys: 1–0, h, p, /, ~, ⌫ (5 × 3). Tap a tab cell,
// then a fret: the note goes in and the cursor moves on. Two-digit frets:
// hold 1 or 2 (or tap "1_") and the next digit completes it. Above the keys:
// where the cursor is, string up/down, bend, bar line.

interface Props {
  /** "B · 12" — the string and column under the cursor; null = nothing selected. */
  where: string | null;
  /** An armed tens digit ('1' or '2'), shown as "1_". */
  prefix: string | null;
  /** Technique on the cell the keys would mark. */
  tech?: Tech;
  barOn: boolean;
  onDigit: (d: string) => void;
  onPrefix: (d: string | null) => void;
  onTech: (t: Tech) => void;
  onBackspace: () => void;
  onString: (dir: -1 | 1) => void;
  onBar: () => void;
  /** Mobile: close the keypad (deselect). */
  onDone?: () => void;
  he: boolean;
}

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

// A pressed key flashes cobalt for 160ms; the colour transition fades it back.
function flash(el: HTMLElement) {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const prev = el.style.backgroundColor, prevInk = el.style.color;
  el.style.backgroundColor = 'var(--gc-primary)';
  el.style.color = 'var(--su-on-primary)';
  window.setTimeout(() => { el.style.backgroundColor = prev; el.style.color = prevInk; }, 160);
}

export function TabKeypad({ where, prefix, tech, barOn, onDigit, onPrefix, onTech, onBackspace, onString, onBar, onDone, he }: Props) {
  const fg = T.white, bg = T.secondary;
  const off = where == null;
  const hold = useRef<{ t: ReturnType<typeof setTimeout> | null; fired: boolean }>({ t: null, fired: false });

  const keyCss = (on = false): CSSProperties => ({
    minHeight: 52, minWidth: 0, borderRadius: 0, cursor: off ? 'default' : 'pointer', padding: 0,
    border: `1.5px solid ${fg}`, background: on ? fg : 'transparent', color: on ? bg : fg,
    fontFamily: 'var(--su-display)', fontStretch: 'var(--su-display-semi)', fontWeight: 800, fontSize: 22,
    display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: off ? 0.45 : 1,
    touchAction: 'manipulation', userSelect: 'none', WebkitUserSelect: 'none',
  });
  const small: CSSProperties = {
    height: 40, minWidth: 40, padding: '0 12px', borderRadius: 'var(--su-pill)', cursor: 'pointer',
    border: `1.5px solid ${fg}`, background: 'transparent', color: fg, fontSize: 12, fontWeight: 700,
    fontFamily: 'var(--gc-font)', letterSpacing: '0.08em', flexShrink: 0, textTransform: 'none',
  };

  // Long-press 1 or 2 arms it as the tens digit of a two-digit fret.
  const down = (d: string) => {
    hold.current.fired = false;
    if (d !== '1' && d !== '2') return;
    hold.current.t = setTimeout(() => { hold.current.fired = true; onPrefix(d); navigator.vibrate?.(15); }, 420);
  };
  const up = () => { if (hold.current.t) { clearTimeout(hold.current.t); hold.current.t = null; } };
  const tap = (d: string) => {
    if (off) return;
    if (hold.current.fired) { hold.current.fired = false; return; }
    onDigit(d);
  };

  const k = (id: string, content: ReactNode, onClick: () => void, on = false, label?: string) => (
    <button key={id} type="button" aria-label={label} aria-pressed={on || undefined} disabled={off}
      className="gc-no-bar gc-notation" onClick={e => { flash(e.currentTarget); onClick(); }} style={keyCss(on)}>{content}</button>
  );

  return (
    <div role="group" aria-label={he ? 'מקלדת שריגים' : 'Fret keypad'} dir="ltr" style={{
      background: bg, color: fg, padding: 12, display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 40 }}>
        <span style={{ flex: 1, minWidth: 0, fontFamily: 'var(--gc-mono)', fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {where == null ? (he ? 'בחרו תא בטאב' : 'Tap a cell') : prefix ? `${where} · ${prefix}_` : where}
        </span>
        <button type="button" onClick={() => onString(-1)} disabled={off} aria-label={he ? 'מיתר למעלה' : 'String up'} className="gc-no-bar" style={{ ...small, padding: 0, opacity: off ? 0.45 : 1 }}>▲</button>
        <button type="button" onClick={() => onString(1)} disabled={off} aria-label={he ? 'מיתר למטה' : 'String down'} className="gc-no-bar" style={{ ...small, padding: 0, opacity: off ? 0.45 : 1 }}>▼</button>
        <button type="button" onClick={() => onTech('b')} disabled={off} aria-pressed={tech === 'b'} aria-label={he ? 'בנד' : 'Bend'} title="Bend [B]" className="gc-no-bar"
          style={{ ...small, padding: 0, background: tech === 'b' ? fg : 'transparent', color: tech === 'b' ? bg : fg, opacity: off ? 0.45 : 1 }}>b</button>
        <button type="button" onClick={onBar} disabled={off} aria-pressed={barOn} aria-label={he ? 'קו תיבה' : 'Bar line'} title="Bar [|]" className="gc-no-bar"
          style={{ ...small, padding: 0, background: barOn ? fg : 'transparent', color: barOn ? bg : fg, opacity: off ? 0.45 : 1 }}>|</button>
        {onDone && (
          <button type="button" onClick={onDone} className="gc-no-bar" style={{ ...small, background: fg, color: bg, border: 'none' }}>{he ? 'סיום' : 'Done'}</button>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 6 }}>
        {DIGITS.map(d => (
          <button key={d} type="button" disabled={off} aria-pressed={prefix === d || undefined}
            aria-label={d === '1' || d === '2' ? (he ? `${d} (החזיקו ל-${d}_)` : `${d} (hold for ${d}_)`) : d}
            className="gc-no-bar gc-notation" style={keyCss(prefix === d)}
            onPointerDown={() => down(d)} onPointerUp={up} onPointerLeave={up} onPointerCancel={up}
            onContextMenu={e => e.preventDefault()}
            onClick={e => { flash(e.currentTarget); tap(d); }}>{d}</button>
        ))}
        {k('h', 'h', () => onTech('h'), tech === 'h', he ? 'האמר-און' : 'Hammer-on')}
        {k('p', 'p', () => onTech('p'), tech === 'p', he ? 'פול-אוף' : 'Pull-off')}
        {k('/', '/', () => onTech('/'), tech === '/', he ? 'סלייד' : 'Slide')}
        {k('~', '~', () => onTech('~'), tech === '~', he ? 'ויברטו' : 'Vibrato')}
        {k('bk', '⌫', onBackspace, false, he ? 'מחיקה' : 'Delete')}
      </div>
    </div>
  );
}
