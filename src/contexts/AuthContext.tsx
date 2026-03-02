import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';

interface AuthContextValue {
  user:           User | null;
  loading:        boolean;
  signInGoogle:   () => Promise<void>;
  logout:         () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,    setUser]    = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  const signInGoogle = async () => {
    await signInWithPopup(auth, googleProvider);
  };

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signInGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
