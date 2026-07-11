import { supabase } from './supabase';

// ── Scale Speller & Trainer — per-user prefs, best streak & weak-spot stats ──
// Persisted to the `scale_trainer` table (one row per user, see schema.sql).
// The component keeps a localStorage mirror for instant load and offline /
// signed-out use; the DB is the source of truth once signed in.

export type ScaleLang = 'he' | 'en';

export interface ScaleTrainerPrefs {
  lang: ScaleLang;
}

export interface ScaleTypeStat { correct: number; wrong: number }
export type ScaleStats = Record<string, ScaleTypeStat>;

export interface ScaleTrainerData {
  prefs: ScaleTrainerPrefs;
  bestStreak: number;
  stats: ScaleStats;
}

export const DEFAULT_PREFS: ScaleTrainerPrefs = { lang: 'en' };

export function defaultData(): ScaleTrainerData {
  return { prefs: { ...DEFAULT_PREFS }, bestStreak: 0, stats: {} };
}

// ── localStorage mirror ─────────────────────────────────────────────────────
const LS_KEY = 'scaleup_scale_trainer';

export function loadLocal(): ScaleTrainerData {
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

export function saveLocal(data: ScaleTrainerData): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch { /* quota / private mode */ }
}

// ── Supabase (source of truth once signed in) ───────────────────────────────
export async function loadRemote(userId: string): Promise<ScaleTrainerData | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('scale_trainer')
    .select('prefs, best_streak, stats')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    prefs: { ...DEFAULT_PREFS, ...((data.prefs as Partial<ScaleTrainerPrefs>) ?? {}) },
    bestStreak: (data.best_streak as number) ?? 0,
    stats: (data.stats as ScaleStats) ?? {},
  };
}

export async function saveRemote(userId: string, data: ScaleTrainerData): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from('scale_trainer')
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
export function mergeRemote(local: ScaleTrainerData, remote: ScaleTrainerData): ScaleTrainerData {
  return {
    prefs: remote.prefs,
    bestStreak: Math.max(local.bestStreak, remote.bestStreak),
    stats: remote.stats && Object.keys(remote.stats).length ? remote.stats : local.stats,
  };
}
