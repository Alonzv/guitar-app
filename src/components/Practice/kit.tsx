import { forwardRef, type ReactNode } from 'react';
import { T } from '../../theme';

// ── Practice parts ───────────────────────────────────────────────────────────
// The shared look of the three practice tools, in the same language as the
// rest of the app: one centred question, rounded glass tiles to answer with,
// one white action, and a right answer lit in the success colour.

/** The page column every practice tool sits in. */
export function PracticeColumn({ desktop, rtl, children }: { desktop?: boolean; rtl?: boolean; children: ReactNode }) {
  return (
    <div dir={rtl ? 'rtl' : 'ltr'} className="su-in" style={{
      display: 'flex', flexDirection: 'column', gap: desktop ? 22 : 18, width: '100%',
      maxWidth: desktop ? 720 : undefined, margin: '0 auto', fontFamily: 'var(--gc-font)',
    }}>
      {children}
    </div>
  );
}

/** A plain rounded card. */
export const Card = forwardRef<HTMLDivElement, { title?: ReactNode; aside?: ReactNode; children: ReactNode; pad?: number }>(
  function Card({ title, aside, children, pad }, ref) {
    return (
      <div ref={ref} style={{ background: T.bgCard, borderRadius: 26, padding: pad ?? 16, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
        {(title || aside) && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', minHeight: 32 }}>
            {title && <span style={{ fontSize: 17, fontWeight: 700 }}>{title}</span>}
            {aside}
          </div>
        )}
        {children}
      </div>
    );
  },
);

/** White pill: the one main action. */
export function WhiteButton({ onClick, children, wide, icon }: { onClick: () => void; children: ReactNode; wide?: boolean; icon?: ReactNode }) {
  return (
    <button onClick={onClick} className="gc-no-bar" style={{
      height: 50, padding: '0 26px', borderRadius: 25, background: T.text, color: '#000', border: 'none', cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 17, fontWeight: 600,
      width: wide ? '100%' : undefined, flex: 'none',
    }}>
      {icon}{children}
    </button>
  );
}

export const playGlyph = <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden><path d="M7 4.5v15l13-7.5z" fill="currentColor" /></svg>;

/** Before the first question: a glass glyph, what the drill is, and Start. */
export function StartPanel({ glyph, title, hint, label, onStart, foot }: {
  glyph: ReactNode; title: string; hint: string; label: string; onStart: () => void; foot?: ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 10, padding: '18px 0 6px' }}>
      <span aria-hidden className="lg" style={{ width: 84, height: 84, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 6, color: T.text }}>
        {glyph}
      </span>
      <h2 style={{ margin: 0, fontFamily: 'var(--su-display)', fontSize: 30, fontWeight: 700, letterSpacing: '-0.03em' }}>{title}</h2>
      <p className="su-sub" style={{ margin: 0, fontSize: 16, lineHeight: 1.5, maxWidth: 380 }}>{hint}</p>
      <div style={{ marginTop: 8 }}><WhiteButton onClick={onStart} icon={playGlyph}>{label}</WhiteButton></div>
      {foot && <p className="su-sub" style={{ margin: '6px 0 0', fontSize: 13, maxWidth: 340, lineHeight: 1.5 }}>{foot}</p>}
    </div>
  );
}

/** The question, centred: a quiet line, the big title, a line under it. */
export function Ask({ kicker, title, name, line, desktop, notation }: {
  kicker: ReactNode; title: ReactNode; name?: ReactNode; line?: ReactNode; desktop?: boolean; notation?: boolean;
}) {
  const size = notation ? (desktop ? 84 : 64) : (desktop ? 52 : 40);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 4, minWidth: 0 }}>
      <span style={{ fontSize: 15, fontWeight: 600, color: T.textMuted }}>{kicker}</span>
      <h2 className={notation ? 'gc-notation' : undefined} dir={notation ? 'ltr' : undefined} style={{
        margin: 0, fontFamily: 'var(--su-display)', fontSize: size, lineHeight: `${size + 6}px`, fontWeight: 700,
        letterSpacing: notation ? '-0.045em' : '-0.03em', maxWidth: '100%', overflowWrap: 'anywhere',
      }}>{title}</h2>
      {name && <span style={{ fontSize: desktop ? 26 : 22, fontWeight: 700, letterSpacing: '-0.02em' }}>{name}</span>}
      {line && <span className="su-sub" style={{ fontSize: 15, marginTop: 2 }}>{line}</span>}
    </div>
  );
}

/** The boxes a chord or scale is spelled into, one per note. */
export function SpellBoxes({ notes, filled, labels, done, small }: {
  notes: string[]; filled: number; labels: string[]; done: boolean; small?: boolean;
}) {
  const box = small ? 50 : 60;
  return (
    <div dir="ltr" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
      {notes.map((n, i) => {
        const isFilled = i < filled;
        const isCurrent = !done && i === filled;
        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div className={`gc-notation${isFilled && i > 0 ? ' gc-pop' : ''}`} style={{
              width: box, height: box, borderRadius: small ? 16 : 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: small ? 20 : 24, fontWeight: 700, letterSpacing: '-0.02em',
              background: done ? T.success : isFilled ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.05)',
              color: done ? T.white : T.text,
              boxShadow: isCurrent ? `inset 0 0 0 2px ${T.text}` : undefined,
              transition: 'background var(--gc-dur-base) var(--gc-ease-out)',
            }}>{isFilled ? n : ''}</div>
            <span className="gc-notation" style={{ fontSize: 13, fontWeight: 600, color: isCurrent ? T.text : T.textMuted }}>{labels[i]}</span>
          </div>
        );
      })}
    </div>
  );
}

export type TileState = 'idle' | 'right' | 'wrong' | 'flash';

/** A rounded answer tile. Right lights up, a missed guess fades out. */
export function AnswerTile({ state = 'idle', onClick, disabled, children, height = 48, size = 17 }: {
  state?: TileState; onClick: () => void; disabled?: boolean; children: ReactNode; height?: number; size?: number;
}) {
  const bg = state === 'right' ? T.success : state === 'flash' ? T.errorSoft : state === 'wrong' ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.08)';
  return (
    <button onClick={onClick} disabled={disabled} className="gc-no-bar gc-notation" style={{
      minHeight: height, padding: '6px 8px', borderRadius: height >= 60 ? 20 : 16, border: 'none', cursor: disabled ? 'default' : 'pointer',
      background: bg, color: state === 'right' ? T.white : state === 'wrong' ? T.textMuted : T.text,
      boxShadow: state === 'flash' ? `inset 0 0 0 2px ${T.text}` : undefined,
      textDecoration: state === 'wrong' ? 'line-through' : undefined,
      fontSize: size, fontWeight: 600, letterSpacing: '-0.01em', minWidth: 0,
      transition: 'background var(--gc-dur-base) var(--gc-ease-out)',
    }}>{children}</button>
  );
}

/** The one-line answer feedback under the tiles (kept tall so nothing jumps). */
export function Status({ children, good }: { children?: ReactNode; good?: boolean }) {
  return (
    <div role="status" style={{ minHeight: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
      {children && <span style={{ fontSize: 15, fontWeight: 600, color: good ? T.text : T.textMuted }}>{children}</span>}
    </div>
  );
}
