import { T } from '../../theme';
import { useLang } from '../../contexts/LanguageContext';
import { LINES, STOPS, type Stop } from '../../data/tools';

// ── Network map ──────────────────────────────────────────────────────────────
// The four lines drawn as route diagrams: a line badge and name, then each
// stop as a station dot on a 6px line. The stop you are at has a filled dot
// and a highlighted row. Used as the mobile home and as the desktop sidebar.

interface Props {
  /** Stops to show (already filtered by the search); default all. */
  stops?: Stop[];
  current?: string;
  onGo: (stopId: string) => void;
  /** Sidebar density (desktop) vs. the roomier mobile home. */
  dense?: boolean;
}

export function NetworkMap({ stops = STOPS, current, onGo, dense }: Props) {
  const { lang, rtl } = useLang();
  const he = lang === 'he';
  const row = dense ? 28 : 32;
  const lines = LINES.map(l => ({ line: l, stops: stops.filter(s => s.line === l.id) })).filter(x => x.stops.length);

  if (!lines.length) {
    return (
      <p className="su-poster" style={{ margin: 0, padding: '30px 0', fontSize: 40, lineHeight: 0.9 }}>
        {he ? <>אין תחנה<br />בשם הזה</> : <>No stop<br />by that name</>}
      </p>
    );
  }

  return (
    <nav aria-label={he ? 'מפת הכלים' : 'Tool map'} dir={rtl ? 'rtl' : 'ltr'}>
      {lines.map(({ line, stops: ls }) => (
        <div key={line.id} style={{ marginBottom: dense ? 8 : 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: dense ? 10 : 12, height: dense ? 34 : 40 }}>
            <span style={{
              width: dense ? 26 : 30, height: dense ? 26 : 30, flex: 'none', background: line.color, color: line.onColor,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: dense ? 10 : 11, fontWeight: 700,
            }}>{line.id}</span>
            <span style={{
              flex: 1, fontFamily: 'var(--su-display)', fontStretch: '62%', fontWeight: 900,
              fontSize: dense ? 22 : 28, lineHeight: 1, textTransform: 'uppercase',
            }}>{line.name[lang]}</span>
            {!dense && (
              <span style={{ fontSize: 10, letterSpacing: '0.08em', color: T.textMuted }}>
                {ls.length} {he ? 'תחנות' : ls.length === 1 ? 'STOP' : 'STOPS'}
              </span>
            )}
          </div>
          {ls.map(stop => {
            const here = stop.id === current;
            return (
              <button
                key={stop.id}
                onClick={() => onGo(stop.id)}
                aria-current={here ? 'page' : undefined}
                data-press="soft"
                className="gc-no-bar gc-notation su-key"
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: dense ? 10 : 12,
                  height: row, minHeight: row, padding: dense ? '0 8px' : 0, margin: dense ? '0 -8px' : 0,
                  boxSizing: dense ? 'content-box' : 'border-box',
                  border: 'none', background: here ? T.bgInput : 'transparent',
                  textAlign: rtl ? 'right' : 'left', cursor: 'pointer', color: T.text, letterSpacing: 'normal',
                }}
              >
                <span aria-hidden style={{ width: dense ? 26 : 30, height: row, position: 'relative', flex: 'none', display: 'block' }}>
                  <span style={{ position: 'absolute', insetInlineStart: dense ? 10 : 12, top: 0, bottom: 0, width: 6, background: line.color }} />
                  <span style={{
                    position: 'absolute', insetInlineStart: dense ? 5 : 6, top: (row - (dense ? 16 : 18)) / 2,
                    width: dense ? 16 : 18, height: dense ? 16 : 18, borderRadius: '50%', boxSizing: 'border-box',
                    background: here ? line.color : T.bgDeep, border: `4px solid ${line.color}`,
                  }} />
                </span>
                <span style={{
                  flex: 1, minWidth: 0, fontFamily: 'var(--su-display)', fontStretch: '75%', fontWeight: 700,
                  fontSize: dense ? 15 : 18, textTransform: 'uppercase', letterSpacing: '0.01em',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{stop.name[lang]}</span>
                {!dense && (
                  <span style={{ fontSize: 10, color: T.textMuted, letterSpacing: '0.04em', paddingInlineEnd: 4, whiteSpace: 'nowrap' }}>
                    {stop.meta[lang]}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
