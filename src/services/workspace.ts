import { supabase } from './supabase';
import type { AudioTab, SavedTab, SavedProgression, TabContent } from './types';
import type { ChordInProgression } from '../types/music';

function client() {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
}

// ── Storage: upload an original audio clip, return its public URL ────────────
export async function uploadAudioClip(userId: string, file: Blob, ext = 'webm'): Promise<string> {
  const c = client();
  const path = `${userId}/${Date.now()}.${ext}`;
  const { error } = await c.storage.from('audio').upload(path, file, {
    contentType: (file as File).type || 'audio/webm',
    upsert: false,
  });
  if (error) throw error;
  return c.storage.from('audio').getPublicUrl(path).data.publicUrl;
}

// ════════════════════════════════════════════════════════════════════════════
//  Audio → Tab archive
// ════════════════════════════════════════════════════════════════════════════

export const audioTabs = {
  async list(userId: string): Promise<AudioTab[]> {
    const { data, error } = await client()
      .from('audio_tabs')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as AudioTab[];
  },

  async create(userId: string, input: Partial<AudioTab>): Promise<AudioTab> {
    const { data, error } = await client()
      .from('audio_tabs')
      .insert({ user_id: userId, ...input })
      .select()
      .single();
    if (error) throw error;
    return data as AudioTab;
  },

  async rename(id: string, name: string) {
    const { error } = await client().from('audio_tabs').update({ name }).eq('id', id);
    if (error) throw error;
  },

  async remove(id: string) {
    const { error } = await client().from('audio_tabs').delete().eq('id', id);
    if (error) throw error;
  },

  async duplicate(userId: string, item: AudioTab): Promise<AudioTab> {
    return this.create(userId, {
      name: `${item.name} (copy)`,
      original_audio_url: item.original_audio_url,
      tab_content: item.tab_content,
      duration_seconds: item.duration_seconds,
    });
  },
};

// ════════════════════════════════════════════════════════════════════════════
//  My Tabs (Tab Builder songs)
// ════════════════════════════════════════════════════════════════════════════

export const savedTabs = {
  async list(userId: string): Promise<SavedTab[]> {
    const { data, error } = await client()
      .from('saved_tabs')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as SavedTab[];
  },

  async create(
    userId: string,
    input: { name: string; content: TabContent; tempo?: number | null; music_key?: string | null },
  ): Promise<SavedTab> {
    const { data, error } = await client()
      .from('saved_tabs')
      .insert({ user_id: userId, ...input })
      .select()
      .single();
    if (error) throw error;
    return data as SavedTab;
  },

  async update(id: string, patch: Partial<Pick<SavedTab, 'name' | 'content' | 'tempo' | 'music_key'>>) {
    const { error } = await client().from('saved_tabs').update(patch).eq('id', id);
    if (error) throw error;
  },

  async rename(id: string, name: string) {
    return this.update(id, { name });
  },

  async remove(id: string) {
    const { error } = await client().from('saved_tabs').delete().eq('id', id);
    if (error) throw error;
  },

  async duplicate(userId: string, item: SavedTab): Promise<SavedTab> {
    return this.create(userId, {
      name: `${item.name} (copy)`,
      content: item.content,
      tempo: item.tempo,
      music_key: item.music_key,
    });
  },
};

// ════════════════════════════════════════════════════════════════════════════
//  Saved progressions
// ════════════════════════════════════════════════════════════════════════════

export const savedProgressions = {
  async list(userId: string): Promise<SavedProgression[]> {
    const { data, error } = await client()
      .from('saved_progressions')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as SavedProgression[];
  },

  async create(
    userId: string,
    input: { name: string; chords: ChordInProgression[]; detected_key?: string | null },
  ): Promise<SavedProgression> {
    const { data, error } = await client()
      .from('saved_progressions')
      .insert({ user_id: userId, ...input })
      .select()
      .single();
    if (error) throw error;
    return data as SavedProgression;
  },

  async rename(id: string, name: string) {
    const { error } = await client().from('saved_progressions').update({ name }).eq('id', id);
    if (error) throw error;
  },

  async remove(id: string) {
    const { error } = await client().from('saved_progressions').delete().eq('id', id);
    if (error) throw error;
  },

  async duplicate(userId: string, item: SavedProgression): Promise<SavedProgression> {
    return this.create(userId, {
      name: `${item.name} (copy)`,
      chords: item.chords,
      detected_key: item.detected_key,
    });
  },
};
