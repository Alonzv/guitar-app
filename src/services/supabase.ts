import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL ?? '';
const key = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

/** True when both env vars are present and the client is usable. */
export const isSupabaseConfigured = Boolean(url && key);

/**
 * Single shared client. `null` when env vars are missing so the rest of the
 * app can degrade gracefully (auth UI shows a "not configured" notice instead
 * of crashing).
 *
 * autoRefreshToken + persistSession give us the "smart token refresh" the spec
 * asks for: Supabase silently swaps the access token before it expires, so a
 * user mid-session never gets kicked out.
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
