import { supabase } from './supabase';
import type { Profile } from './types';

function client() {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
}

// ── Email / password ────────────────────────────────────────────────────────

export async function signUpWithEmail(email: string, password: string, displayName?: string) {
  const { data, error } = await client().auth.signUp({
    email,
    password,
    options: { data: displayName ? { full_name: displayName } : undefined },
  });
  if (error) throw error;
  return data;
}

export async function signInWithEmail(email: string, password: string) {
  const { data, error } = await client().auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

// ── Social login ────────────────────────────────────────────────────────────

async function signInWithOAuth(provider: 'google' | 'apple') {
  const { data, error } = await client().auth.signInWithOAuth({
    provider,
    options: { redirectTo: window.location.origin },
  });
  if (error) throw error;
  return data;
}

export const signInWithGoogle = () => signInWithOAuth('google');
export const signInWithApple  = () => signInWithOAuth('apple');

// ── Session ─────────────────────────────────────────────────────────────────

export async function signOut() {
  const { error } = await client().auth.signOut();
  if (error) throw error;
}

export async function sendPasswordReset(email: string) {
  const { error } = await client().auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
  });
  if (error) throw error;
}

// ── Profile ─────────────────────────────────────────────────────────────────

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await client()
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) {
    if (error.code === 'PGRST116') return null; // no row yet
    throw error;
  }
  return data as Profile;
}

/**
 * Self-heal a missing profile row (users created before the signup trigger
 * existed, or a trigger hiccup). Requires the "Users insert own profile"
 * RLS policy from schema.sql.
 */
export async function ensureProfile(user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> }): Promise<Profile | null> {
  const existing = await getProfile(user.id);
  if (existing) return existing;
  const meta = user.user_metadata ?? {};
  const { error } = await client().from('profiles').insert({
    id: user.id,
    email: user.email ?? null,
    display_name: (meta.full_name as string) ?? (meta.name as string) ?? null,
    avatar_url: (meta.avatar_url as string) ?? null,
  });
  if (error && error.code !== '23505') throw error; // ignore duplicate races
  return getProfile(user.id);
}

export async function updateDisplayName(userId: string, displayName: string) {
  const { error } = await client()
    .from('profiles')
    .update({ display_name: displayName })
    .eq('id', userId);
  if (error) throw error;
}

export async function touchLastSeen(userId: string) {
  // best-effort — never block the UI on this
  await client()
    .from('profiles')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', userId);
}

// ── Account deletion (app-store requirement) ────────────────────────────────
//
// Deletes every row the user owns. The auth.users record itself can only be
// removed with the service-role key, so we sign the user out afterwards and
// rely on an Edge Function / admin job to reap the orphaned auth row. The
// user-visible data is gone immediately, which is what stores require.

export async function deleteAccountData(userId: string) {
  const c = client();
  await Promise.all([
    c.from('audio_tabs').delete().eq('user_id', userId),
    c.from('saved_tabs').delete().eq('user_id', userId),
    c.from('saved_progressions').delete().eq('user_id', userId),
    c.from('saved_harmonizations').delete().eq('user_id', userId),
    c.from('saved_voicings').delete().eq('user_id', userId),
    c.from('saved_reharms').delete().eq('user_id', userId),
  ]);

  // Purge uploaded audio clips too — rows alone would leave the user's
  // recordings orphaned (and publicly reachable) in the storage bucket.
  try {
    const { data: files } = await c.storage.from('audio').list(userId, { limit: 1000 });
    if (files && files.length > 0) {
      await c.storage.from('audio').remove(files.map(f => `${userId}/${f.name}`));
    }
  } catch { /* best-effort — table data is already gone */ }

  await c.from('profiles').delete().eq('id', userId);

  // If a server-side delete function is deployed, call it to remove the auth row.
  try {
    await c.functions.invoke('delete-user', { body: { userId } });
  } catch {
    /* function not deployed — data is already wiped, just sign out */
  }
  await c.auth.signOut();
}
