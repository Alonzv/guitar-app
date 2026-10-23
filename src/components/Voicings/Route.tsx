import { useRef, type ReactNode } from 'react';
import { T } from '../../theme';
import { useLang } from '../../contexts/LanguageContext';

// ── A progression as a route ─────────────────────────────────────────────────
// The Transit line motif for a chord progression: each chord is a station dot
// on a 4px ink line, its name under it. The chord sounding now is the one
// cobalt station; `filled` stations (a chord the reharm changed…) are ink,
// the rest are open rings. Optional: × to remove a station, drag to reorder,
// a trailing slot (the + pill) at the end of the line.

export interface Station { name: string; sub?: ReactNode; filled?: boolean }

interface Props {
  stations: Station[];
  /** The station sounding now — drawn cobalt. */
  current?: number | null;
  onRemove?: (i: number) => void;
  onReorder?: (from: number, to: number) => void;
  trailing?: ReactNode;
  label?: string;
}

export function Route({ stations, current, onRemove, onReorder, trailing, label }: Props) {
  const { lang } = useLang();
  const he = lang === 'he';
  const drag = useRef<number | null>(null);
  const last = stations.length - 1;
  return (
    <div role="list" aria-label={label} dir="ltr" className="gc-no-scrollbar"
      style={{ display: 'flex', alignItems: 'flex-start', overflowX: 'auto', scrollbarWidth: 'none', minWidth: 0, paddingBottom: 2 }}>
      {stations.map((s, i) => {
        const now = i === current;
        const ring = now ? T.primary : T.text;
        return (
          <div key={i} role="listitem"
            draggable={!!onReorder}
            onDragStart={onReorder ? () => { drag.current = i; } : undefined}
            onDragOver={onReorder ? e => e.preventDefault() : undefined}
            onDrop={onReorder ? () => { const f = drag.current; drag.current = null; if (f != null && f !== i) onReorder(f, i); } : undefined}
            style={{
              flex: 'none', minWidth: 92, display: 'flex', flexDirection: 'column', alignItems: 'center',
              cursor: onReorder ? 'grab' : undefined, userSelect: 'none',
            }}>
            <span aria-hidden style={{ position: 'relative', width: '100%', height: 26, display: 'block' }}>
              <span style={{
                position: 'absolute', top: 11, height: 4, background: T.text,
                left: i === 0 ? '50%' : 0, right: i === last && !trailing ? '50%' : 0,
              }} />
              <span style={{
                position: 'absolute', top: 2, left: 'calc(50% - 11px)', width: 22, height: 22, borderRadius: '50%', boxSizing: 'border-box',
                border: `4px solid ${ring}`, background: now ? T.primary : s.filled ? T.text : T.bgDeep,
                transition: 'background-color var(--gc-dur-fast) var(--gc-ease-out), border-color var(--gc-dur-fast) var(--gc-ease-out)',
              }} />
            </span>
            <span className="su-semi gc-notation" style={{
              marginTop: 8, fontSize: 24, lineHeight: 1, color: now ? T.primary : T.text, whiteSpace: 'nowrap', padding: '0 6px',
            }}>{s.name}</span>
            {s.sub != null && (
              <span style={{ marginTop: 4, fontSize: 10, fontFamily: 'var(--gc-mono)', letterSpacing: '0.08em', color: T.textMuted }}>{s.sub}</span>
            )}
            {onRemove && (
              <button type="button" onClick={() => onRemove(i)} className="gc-no-bar"
                aria-label={he ? `הסרת ${s.name}` : `Remove ${s.name}`}
                style={{ width: 44, height: 44, marginTop: 2, border: 'none', background: 'transparent', cursor: 'pointer', padding: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span aria-hidden style={{
                  width: 26, height: 26, borderRadius: '50%', border: `1.5px solid ${T.hairline}`, color: T.textMuted,
                  fontSize: 14, lineHeight: '23px', textAlign: 'center',
                }}>×</span>
              </button>
            )}
          </div>
        );
      })}
      {trailing && (
        <div style={{ flex: 'none', display: 'flex', alignItems: 'flex-start', marginTop: stations.length ? -9 : 0, paddingInlineStart: stations.length ? 10 : 0 }}>
          {trailing}
        </div>
      )}
    </div>
  );
}
