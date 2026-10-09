import type { Song } from './song';
import { supabase } from '../services/supabase';

// ── My songs ─────────────────────────────────────────────────────────────────
// Every song lives on the device; when the player is signed in it is also kept
// in the cloud (table `songs`, see supabase/schema.sql), so it follows them to
// another device. The newer copy wins when the two disagree.

const KEY = 'scaleup_songs';

export function listLocal(): Song[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

function writeLocal(songs: Song[]) {
  try { localStorage.setItem(KEY, JSON.stringify(songs)); } catch { /* full / private */ }
}

export function upsertLocal(song: Song): void {
  const all = listLocal().filter(s => s.id !== song.id);
  writeLocal([song, ...all].slice(0, 100));
}

export function removeLocal(id: string): void {
  writeLocal(listLocal().filter(s => s.id !== id));
}

/** A song is worth keeping once it has a title, a chord or a melody. */
export const hasContent = (s: Song) =>
  !!s.title.trim() || s.sections.some(x => x.progression.length > 0) || !!s.melody;

// ── Cloud ────────────────────────────────────────────────────────────────────

export const cloudReady = () => !!supabase;

export async function listCloud(userId: string): Promise<Song[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('songs').select('data').eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(r => r.data as Song).filter(s => s && Array.isArray(s.sections));
}

export async function saveCloud(userId: string, song: Song): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('songs').upsert({
    user_id: userId, local_id: song.id, name: song.title.trim() || 'Untitled song',
    data: song, updated_at: new Date(song.updatedAt).toISOString(),
  }, { onConflict: 'user_id,local_id' });
  if (error) throw error;
}

export async function removeCloud(userId: string, localId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('songs').delete().eq('user_id', userId).eq('local_id', localId);
  if (error) throw error;
}

/** Local and cloud songs together, newest copy of each, newest first. */
export function mergeSongs(local: Song[], cloud: Song[]): Song[] {
  const byId = new Map<string, Song>();
  for (const s of [...local, ...cloud]) {
    const have = byId.get(s.id);
    if (!have || s.updatedAt > have.updatedAt) byId.set(s.id, s);
  }
  return [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}
