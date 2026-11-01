import { useEffect, useRef, useState } from 'react';
import { T } from '../../theme';
import { getDaily, subscribeDaily, DAILY_GOAL } from '../../practice/daily';
import { replayClass } from '../../motion';

// ── Streak board ─────────────────────────────────────────────────────────────
// The score strip every Practice tab shows: the run (a counter that rolls up
// digit by digit, and drops with a shake when the run breaks), the best run
// (flashes on a new record), a meter of the four logo bars filling toward the
// next milestone, a stamp at every fifth answer in a row, and today's goal
// shared by all the practice tabs.

const MILESTONE = 5;

interface Props {
  streak: number; best: number; lang: 'en' | 'he';
  /** Drop the bottom margin when the parent already spaces its children. */
  flush?: boolean;
}

export function StreakBoard({ streak, best, lang, flush }: Props) {
  const he = lang === 'he';
  const [daily, setDaily] = useState(getDaily);
  useEffect(() => subscribeDaily(setDaily), []);

  // Milestone stamps come from the values changing — a fifth answer in a row,
  // or the answer that meets today's goal.
  const [stamp, setStamp] = useState<{ text: string; n: number } | null>(null);
  const [seen, setSeen] = useState({ streak, daily: daily.count });
  if (streak !== seen.streak || daily.count !== seen.daily) {
    let next = stamp;
    if (streak > seen.streak && streak % MILESTONE === 0) next = { text: `${he ? 'רצף' : 'Streak'} ×${streak}`, n: (stamp?.n ?? 0) + 1 };
    if (daily.count === DAILY_GOAL && seen.daily === DAILY_GOAL - 1) next = { text: he ? 'יעד יומי ✓' : 'Daily goal ✓', n: (stamp?.n ?? 0) + 1 };
    setSeen({ streak, daily: daily.count });
    if (next !== stamp) setStamp(next);
  }

  // A broken run shakes the Streak card; a new record flashes the Best card.
  const prev = useRef(streak);
  const prevBest = useRef(best);
  const streakCard = useRef<HTMLDivElement>(null);
  const bestCard = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (streak < prev.current && prev.current > 0 && streakCard.current) replayClass(streakCard.current, 'gc-shake', 200);
    prev.current = streak;
  }, [streak]);
  useEffect(() => {
    if (best > prevBest.current && prevBest.current > 0 && bestCard.current) replayClass(bestCard.current, 'gc-record', 400);
    prevBest.current = best;
  }, [best]);

  useEffect(() => {
    if (!stamp) return;
    const t = window.setTimeout(() => setStamp(null), 1700);
    return () => window.clearTimeout(t);
  }, [stamp]);

  const toNext = streak % MILESTONE;          // 0..4 bars lit toward the next stamp
  const lit = streak > 0 && toNext === 0 ? 4 : Math.round((toNext / MILESTONE) * 4);
  const goalPct = Math.min(100, (daily.count / DAILY_GOAL) * 100);

  const LBL: React.CSSProperties = { margin: 0, fontSize: 13, fontWeight: 600, color: T.textMuted };

  return (
    <div style={{ position: 'relative', marginBottom: flush ? 0 : 16, background: T.bgCard, borderRadius: 26, padding: '14px 18px 16px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div ref={streakCard} style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, borderRadius: 16 }}>
          <div>
            <p style={LBL}>{he ? 'רצף' : 'Streak'}</p>
            <RollingNumber value={streak} />
          </div>
          {/* The logo's four bars, filling toward the next milestone */}
          <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden style={{ marginBottom: 8 }}>
            {[0, 1, 2, 3].map(i => (
              <rect key={i} x={i * 6} y={22 - (7 + i * 5)} width="4" height={7 + i * 5} rx="2"
                fill={i < lit ? T.text : 'rgba(255,255,255,0.14)'}
                style={{ transition: 'fill var(--gc-dur-base) var(--gc-ease-out)', transitionDelay: `${i * 40}ms` }} />
            ))}
          </svg>
        </div>
        <div ref={bestCard} style={{ borderRadius: 16, paddingInlineStart: 16, boxShadow: he ? 'inset -1px 0 0 rgba(255,255,255,0.08)' : 'inset 1px 0 0 rgba(255,255,255,0.08)' }}>
          <p style={LBL}>{he ? 'שיא' : 'Best'}</p>
          <RollingNumber value={best} />
        </div>
      </div>

      {/* Today's goal — every practice tab counts toward it */}
      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ ...LBL, flexShrink: 0 }}>{he ? 'היום' : 'Today'}</span>
        <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.1)', position: 'relative', overflow: 'hidden' }}>
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 3, background: T.text, transformOrigin: he ? 'right center' : 'left center',
            transform: `scaleX(${goalPct / 100})`, transition: 'transform var(--gc-dur-slow) var(--gc-ease-snap)',
          }} />
        </div>
        <span style={{ fontSize: 13, fontWeight: 600, color: T.textMuted, flexShrink: 0 }}>
          <bdi dir="ltr">{daily.count}/{DAILY_GOAL}</bdi>{daily.days > 0 && <> · {he ? `${daily.days} ימים` : `${daily.days}d`}</>}
        </span>
      </div>

      {stamp && (
        <div key={stamp.n} className="gc-stamp lg" aria-live="polite" style={{
          position: 'absolute', left: '50%', top: 18, zIndex: 2, pointerEvents: 'none',
          padding: '10px 20px', borderRadius: 24, color: T.text,
          fontSize: 22, fontWeight: 700, whiteSpace: 'nowrap',
        }}>{stamp.text}</div>
      )}
    </div>
  );
}

// ── Rolling number ───────────────────────────────────────────────────────────
// Each digit is a column 0–9 that rolls to its new value; going up rolls up,
// going down (a reset) rolls back down.

function RollingNumber({ value }: { value: number }) {
  const digits = String(value).split('');
  return (
    <span dir="ltr" aria-label={String(value)} style={{
      display: 'inline-flex', fontFamily: 'var(--su-display)', fontWeight: 700, letterSpacing: '-0.03em',
      fontSize: 44, color: T.text, lineHeight: '1.1em', height: '1.1em', overflow: 'hidden',
    }}>
      {digits.map((d, i) => (
        <span key={digits.length - i} aria-hidden style={{
          display: 'flex', flexDirection: 'column',
          transform: `translateY(${-Number(d) * 1.1}em)`,
          transition: 'transform var(--gc-dur-slow) var(--gc-ease-snap)',
        }}>
          {'0123456789'.split('').map(n => <span key={n} style={{ height: '1.1em' }}>{n}</span>)}
        </span>
      ))}
    </span>
  );
}
