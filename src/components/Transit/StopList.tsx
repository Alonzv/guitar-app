import { T } from '../../theme';
import { useLang } from '../../contexts/LanguageContext';
import { LINES, STOPS, type Stop } from '../../data/tools';

// ── Stop list ────────────────────────────────────────────────────────────────
// Every tool, grouped by what it is for (the four lines). Mobile: inset
// grouped lists with a line of explanation and a chevron. Desktop: the quiet,
// dense sidebar list. Replaces the drawn network map.

interface Props {
  stops?: Stop[];
  current?: string;
  onGo: (stopId: string) => void;
  dense?: boolean;
}

function Chevron({ rtl }: { rtl: boolean }) {
  return (
    <svg width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="rgba(235,235,245,0.3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden
      style={{ flex: 'none', transform: rtl ? 'scaleX(-1)' : undefined }}>
      <path d="m1 1 6 6-6 6" />
    </svg>
  );
}

export function StopList({ stops = STOPS, current, onGo, dense }: Props) {
  const { lang, rtl } = useLang();
  const he = lang === 'he';
  const groups = LINES.map(l => ({ line: l, stops: stops.filter(s => s.line === l.id) })).filter(g => g.stops.length);

  if (!groups.length) {
    return <p className="su-sub" style={{ padding: '24px 4px' }}>{he ? 'לא מצאנו כלי כזה.' : 'No tool by that name.'}</p>;
  }

  if (dense) {
    return (
      <nav aria-label={he ? 'כלים' : 'Tools'} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {groups.map(({ line, stops: ls }) => (
          <div key={line.id} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: T.textDim, padding: '0 12px 6px' }}>{line.name[lang]}</span>
            {ls.map(s => {
              const on = s.id === current;
              return (
                <button key={s.id} onClick={() => onGo(s.id)} aria-current={on ? 'page' : undefined}
                  className={`gc-no-bar gc-notation${on ? ' lg-on' : ''}`} data-press="soft"
                  style={{
                    height: 34, borderRadius: 10, padding: '0 12px', display: 'flex', alignItems: 'center',
                    fontSize: 14, fontWeight: on ? 600 : 500, textAlign: 'start',
                    color: on ? T.text : 'rgba(235,235,245,0.78)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                  {s.name[lang]}
                </button>
              );
            })}
          </div>
        ))}
      </nav>
    );
  }

  return (
    <nav aria-label={he ? 'כל הכלים' : 'All tools'} style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {groups.map(({ line, stops: ls }) => (
        <section key={line.id} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h3 style={{ margin: '0 18px', fontSize: 15, fontWeight: 600, color: T.textMuted }}>{line.name[lang]}</h3>
          <div className="su-group">
            {ls.map(s => (
              <button key={s.id} onClick={() => onGo(s.id)} className="su-row gc-no-bar gc-notation" data-press="soft"
                aria-current={s.id === current ? 'page' : undefined}>
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, padding: '12px 0' }}>
                  <span style={{ fontSize: 17, fontWeight: 500 }}>{s.name[lang]}</span>
                  <span style={{ fontSize: 14, color: T.textMuted }}>{s.meta[lang]}</span>
                </span>
                <Chevron rtl={rtl} />
              </button>
            ))}
          </div>
        </section>
      ))}
    </nav>
  );
}
