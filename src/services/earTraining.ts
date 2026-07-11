import { supabase } from './supabase';

// ── Ear Training — per-user preferences, best streak & weak-spot analytics ──
// Persisted to the `ear_training` table (one row per user, see schema.sql).
// The component keeps a localStorage mirror for instant load and offline /
// signed-out use; the DB is the source of truth once signed in.

export type EarLang = 'he' | 'en';
export type EarPlayback = 'melodic' | 'harmonic' | 'mixed';
export type EarDirection = 'asc' | 'desc' | 'mixed';

export interface EarPrefs {
  lang: EarLang;
  playback: EarPlayback;
  direction: EarDirection;
}

export interface EarIntervalStat { correct: number; wrong: number }
export type EarStats = Record<string, EarIntervalStat>;

export interface EarTrainingData {
  prefs: EarPrefs;
  bestStreak: number;
  stats: EarStats;
}

export const DEFAULT_PREFS: EarPrefs = { lang: 'en', playback: 'mixed', direction: 'mixed' };

export function defaultData(): EarTrainingData {
  return { prefs: { ...DEFAULT_PREFS }, bestStreak: 0, stats: {} };
}

// ── localStorage mirror ─────────────────────────────────────────────────────
const LS_KEY = 'scaleup_ear_training';

export function loadLocal(): EarTrainingData {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return defaultData();
    const parsed = JSON.parse(raw);
    return {
      prefs: { ...DEFAULT_PREFS, ...(parsed.prefs ?? {}) },
      bestStreak: parsed.bestStreak ?? 0,
      stats: parsed.stats ?? {},
    };
  } catch {
    return defaultData();
  }
}

export function saveLocal(data: EarTrainingData): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch { /* quota / private mode */ }
}

// ── Supabase (source of truth once signed in) ───────────────────────────────
export async function loadRemote(userId: string): Promise<EarTrainingData | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('ear_training')
    .select('prefs, best_streak, stats')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    prefs: { ...DEFAULT_PREFS, ...((data.prefs as Partial<EarPrefs>) ?? {}) },
    bestStreak: (data.best_streak as number) ?? 0,
    stats: (data.stats as EarStats) ?? {},
  };
}

export async function saveRemote(userId: string, data: EarTrainingData): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from('ear_training')
    .upsert(
      {
        user_id: userId,
        prefs: data.prefs,
        best_streak: data.bestStreak,
        stats: data.stats,
      },
      { onConflict: 'user_id' },
    );
  if (error) throw error;
}

/** Merge a remote row over the local mirror — remote wins for streak/stats. */
export function mergeRemote(local: EarTrainingData, remote: EarTrainingData): EarTrainingData {
  return {
    prefs: remote.prefs,
    bestStreak: Math.max(local.bestStreak, remote.bestStreak),
    stats: remote.stats && Object.keys(remote.stats).length ? remote.stats : local.stats,
  };
}
