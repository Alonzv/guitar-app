import { useEffect, useRef, useState } from 'react';
import { T, card } from '../../theme';
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

  const LBL: React.CSSProperties = {
    margin: '0 0 4px', fontSize: 10, color: T.textDim,
    fontFamily: 'var(--gc-mono)', letterSpacing: '0.14em', textTransform: 'uppercase',
  };

  return (
    <div style={{ position: 'relative', marginBottom: flush ? 0 : 16 }}>
      <div style={{ display: 'flex', gap: 10 }}>
        <div ref={streakCard} style={{ ...card({ padding: 12 }), flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <div style={{ textAlign: 'center' }}>
            <p style={LBL}>{he ? 'רצף' : 'Streak'}</p>
            <RollingNumber value={streak} />
          </div>
          {/* The logo's four bars, filling toward the next milestone */}
          <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
            {[0, 1, 2, 3].map(i => (
              <rect key={i} x={i * 6} y={22 - (7 + i * 5)} width="4" height={7 + i * 5}
                fill={i < lit ? T.text : T.border}
                style={{ transition: 'fill var(--gc-dur-base) var(--gc-ease-out)', transitionDelay: `${i * 40}ms` }} />
            ))}
          </svg>
        </div>
        <div ref={bestCard} style={{ ...card({ padding: 12 }), flex: 1, textAlign: 'center' }}>
          <p style={LBL}>{he ? 'שיא' : 'Best'}</p>
          <RollingNumber value={best} />
        </div>
      </div>

      {/* Today's goal — every practice tab counts toward it */}
      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ ...LBL, margin: 0, flexShrink: 0 }}>{he ? 'היום' : 'Today'}</span>
        <div style={{ flex: 1, height: 6, background: T.bgInput, border: `1px solid ${T.border}`, position: 'relative', overflow: 'hidden' }}>
          <div style={{
            position: 'absolute', inset: 0, background: T.text, transformOrigin: 'left center',
            transform: `scaleX(${goalPct / 100})`, transition: 'transform var(--gc-dur-slow) var(--gc-ease-snap)',
          }} />
        </div>
        <span dir="ltr" style={{ fontSize: 11, fontFamily: 'var(--gc-mono)', color: T.textMuted, flexShrink: 0 }}>
          {daily.count}/{DAILY_GOAL}{daily.days > 0 && ` · ${daily.days}${he ? ' ימים' : 'd'}`}
        </span>
      </div>

      {stamp && (
        <div key={stamp.n} className="gc-stamp" aria-live="polite" style={{
          position: 'absolute', left: '50%', top: 18, zIndex: 2, pointerEvents: 'none',
          padding: '6px 14px', border: `3px solid ${T.text}`, background: T.bgCard, color: T.text,
          fontFamily: 'var(--gc-mono)', fontWeight: 800, fontSize: 18, letterSpacing: '0.08em',
          textTransform: 'uppercase', whiteSpace: 'nowrap',
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
    <span dir="ltr" aria-label={String(value)} style={{ display: 'inline-flex', fontSize: 26, fontWeight: 700, color: T.text, lineHeight: '1.1em', height: '1.1em', overflow: 'hidden' }}>
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
