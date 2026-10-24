import { supabase } from './supabase';

// ── Sign-in from the Mac app ─────────────────────────────────────────────────
// Google and Apple refuse to sign in inside an embedded window, so the Mac app
// (desktop/) opens their pages in the system browser. Supabase returns the
// browser to /desktop-auth.html, which hands the session back to the app via
// scaleup://auth#access_token=…; the app passes it here.

declare global {
  interface Window {
    __SCALEUP_DESKTOP__?: boolean;
    __scaleupDesktopAuth?: (p: { hash: string; query: string }) => Promise<void>;
  }
}

export const isDesktopApp = () => typeof window !== 'undefined' && window.__SCALEUP_DESKTOP__ === true;

/** Where Supabase sends the browser after Google/Apple sign-in. */
export const oauthRedirect = () =>
  isDesktopApp() ? `${window.location.origin}/desktop-auth.html` : window.location.origin;

export function installDesktopAuth() {
  if (!isDesktopApp() || !supabase) return;
  const client = supabase;
  window.__scaleupDesktopAuth = async ({ hash, query }) => {
    const params = new URLSearchParams(hash || query);
    const error = params.get('error_description') ?? params.get('error');
    if (error) { window.alert(`Sign-in failed: ${error}`); return; }
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    const code = new URLSearchParams(query).get('code');
    try {
      if (access_token && refresh_token) await client.auth.setSession({ access_token, refresh_token });
      else if (code) await client.auth.exchangeCodeForSession(code);
    } catch (e) {
      window.alert(`Sign-in failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
}
