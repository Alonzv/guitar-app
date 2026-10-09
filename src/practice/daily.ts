// ── Daily goal ───────────────────────────────────────────────────────────────
// One count for the whole app: every question solved in any Practice tab
// (chords, scales, intervals) adds to today's total. Meeting the goal on
// consecutive days builds a day streak. Local to the device.

export const DAILY_GOAL = 20;
const KEY = 'scaleup_daily_practice';

interface Daily { date: string; count: number; days: number; lastMet: string | null }

// Local calendar days (en-CA formats as YYYY-MM-DD), not UTC ones.
const day = (d: Date) => d.toLocaleDateString('en-CA');
const today = () => day(new Date());
const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return day(d); };

function read(): Daily {
  let d: Daily = { date: today(), count: 0, days: 0, lastMet: null };
  try { d = { ...d, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { /* private mode */ }
  if (d.date !== today()) d = { ...d, date: today(), count: 0 };
  // A missed day breaks the day streak.
  if (d.lastMet && d.lastMet !== today() && d.lastMet !== yesterday()) d = { ...d, days: 0 };
  return d;
}

const listeners = new Set<(d: Daily) => void>();

export function getDaily(): Daily { return read(); }

export function subscribeDaily(fn: (d: Daily) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Count one solved question. Returns true when this one met today's goal. */
export function recordSolved(): boolean {
  const d = read();
  const count = d.count + 1;
  const metNow = count === DAILY_GOAL;
  const next: Daily = metNow ? { ...d, count, days: d.days + 1, lastMet: today() } : { ...d, count };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode */ }
  listeners.forEach(fn => fn(next));
  return metNow;
}
