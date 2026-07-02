import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../services/supabase';
import {
  ensureProfile, touchLastSeen, signOut as svcSignOut,
  deleteAccountData, signInWithEmail, signUpWithEmail,
  signInWithGoogle, signInWithApple,
} from '../services/auth';
import type { Profile } from '../services/types';

interface AuthState {
  configured: boolean;
  loading: boolean;
  user: User | null;
  profile: Profile | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName?: string) => Promise<void>;
  signInGoogle: () => Promise<void>;
  signInApple: () => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [user, setUser]       = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const lastSeenRef = useRef(0);

  const loadProfile = useCallback(async (u: User | null) => {
    if (!u) { setProfile(null); return; }
    try {
      // ensureProfile self-heals a missing row (pre-trigger users) so the
      // account menu never shows an empty identity for a signed-in user.
      const p = await ensureProfile(u);
      setProfile(p);
      // throttle the last-seen ping to once per 5 min
      const now = Date.now();
      if (now - lastSeenRef.current > 5 * 60 * 1000) {
        lastSeenRef.current = now;
        touchLastSeen(u.id).catch(() => {});
      }
    } catch (e) {
      console.warn('Could not load profile', e);
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }

    // initial session
    supabase.auth.getSession().then(({ data }) => {
      const s = data.session;
      setUser(s?.user ?? null);
      loadProfile(s?.user ?? null).finally(() => setLoading(false));
    });

    // Supabase fires this on sign-in, sign-out, and silent TOKEN_REFRESHED
    // events — that last one is what keeps a working user logged in.
    const { data: sub } = supabase.auth.onAuthStateChange(
      (_event: string, session: Session | null) => {
        setUser(session?.user ?? null);
        loadProfile(session?.user ?? null);
      },
    );

    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    await signInWithEmail(email, password);
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName?: string) => {
    await signUpWithEmail(email, password, displayName);
  }, []);

  const signOut = useCallback(async () => {
    await svcSignOut();
    setUser(null);
    setProfile(null);
  }, []);

  const deleteAccount = useCallback(async () => {
    if (!user) return;
    await deleteAccountData(user.id);
    setUser(null);
    setProfile(null);
  }, [user]);

  const refreshProfile = useCallback(() => loadProfile(user), [user, loadProfile]);

  return (
    <AuthContext.Provider value={{
      configured: isSupabaseConfigured,
      loading, user, profile,
      signIn, signUp,
      signInGoogle: async () => { await signInWithGoogle(); },
      signInApple:  async () => { await signInWithApple(); },
      signOut, deleteAccount, refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
