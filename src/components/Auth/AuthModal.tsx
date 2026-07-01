import React, { useState } from 'react';
import { T } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { sendPasswordReset } from '../../services/auth';

interface Props { onClose: () => void }

type Mode = 'signin' | 'signup';

const LABEL: React.CSSProperties = {
  display: 'block', fontSize: 10, color: T.textMuted, marginBottom: 5,
  textTransform: 'uppercase', letterSpacing: '-0.02em', fontWeight: 400,
};

const INPUT: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 0,
  border: `1px solid ${T.border}`, background: T.bgInput, color: T.text,
  fontSize: 14, fontFamily: 'inherit', outline: 'none',
  borderLeft: '3px solid var(--gc-bar-color)',
};

export const AuthModal: React.FC<Props> = ({ onClose }) => {
  const { configured, signIn, signUp, signInGoogle, signInApple } = useAuth();
  const [mode, setMode]         = useState<Mode>('signin');
  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState('');
  const [notice, setNotice]     = useState('');

  const validate = (): string | null => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter a valid email address.';
    if (password.length < 8) return 'Password must be at least 8 characters.';
    if (mode === 'signup' && name.trim().length < 2) return 'Enter your name.';
    return null;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setNotice('');
    const v = validate();
    if (v) { setError(v); return; }
    setBusy(true);
    try {
      if (mode === 'signin') {
        await signIn(email, password);
        onClose();
      } else {
        await signUp(email, password, name.trim());
        setNotice('Account created. Check your inbox to confirm, then sign in.');
        setMode('signin');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const social = async (provider: 'google' | 'apple') => {
    setError(''); setBusy(true);
    try {
      if (provider === 'google') await signInGoogle();
      else await signInApple();
      // OAuth redirects the page; nothing else to do here.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Social sign-in failed.');
      setBusy(false);
    }
  };

  const forgot = async () => {
    setError(''); setNotice('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Enter your email above first, then tap reset.');
      return;
    }
    try {
      await sendPasswordReset(email);
      setNotice('Password reset link sent to your email.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send reset email.');
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(0,0,0,0.62)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 380, background: T.bgCard,
          border: `1px solid ${T.border}`, borderLeft: '4px solid var(--gc-bar-color)',
          padding: '22px 22px 24px', boxSizing: 'border-box',
          maxHeight: '92vh', overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <span style={{ fontSize: 17, fontWeight: 800, color: T.text, letterSpacing: '-0.5px' }}>
            <span style={{ color: T.secondary }}>Scale</span><span style={{ color: T.brandAccent }}>Up</span>
          </span>
          <button onClick={onClose} aria-label="Close" style={{
            width: 28, height: 28, borderRadius: 0, border: `1px solid ${T.border}`,
            background: T.bgInput, color: T.textMuted, fontSize: 15, cursor: 'pointer',
          }}>✕</button>
        </div>

        {/* Mode switch */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 18 }}>
          {(['signin', 'signup'] as Mode[]).map(m => {
            const active = mode === m;
            return (
              <button key={m} onClick={() => { setMode(m); setError(''); setNotice(''); }}
                style={{
                  flex: 1, padding: '9px 0', borderRadius: 0, cursor: 'pointer',
                  background: active ? T.primary : T.bgInput,
                  color: active ? T.white : T.textMuted,
                  fontSize: 12, fontWeight: active ? 500 : 400, fontFamily: 'inherit',
                  textTransform: 'uppercase', letterSpacing: '-0.02em',
                  borderLeft: '3px solid var(--gc-bar-color)',
                }}>
                {m === 'signin' ? 'Sign In' : 'Sign Up'}
              </button>
            );
          })}
        </div>

        {!configured && (
          <p style={{
            margin: '0 0 16px', padding: '9px 11px', fontSize: 11.5, lineHeight: 1.5,
            background: T.secondaryBg, color: T.secondary, border: `1px solid ${T.secondaryFaint}`,
          }}>
            Sign-in is not configured yet. Add your Supabase keys to <code>.env</code> to
            enable accounts.
          </p>
        )}

        {/* Social */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          <button disabled={!configured || busy} onClick={() => social('google')} style={{
            width: '100%', padding: '11px 0', borderRadius: 0, cursor: configured ? 'pointer' : 'not-allowed',
            border: `1px solid ${T.border}`, background: T.bgInput, color: T.text,
            fontSize: 13, fontFamily: 'inherit', opacity: configured ? 1 : 0.5,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
            borderLeft: '3px solid var(--gc-bar-color)',
          }}>
            <span style={{ fontWeight: 700, color: '#4285F4' }}>G</span> Continue with Google
          </button>
          <button disabled={!configured || busy} onClick={() => social('apple')} style={{
            width: '100%', padding: '11px 0', borderRadius: 0, cursor: configured ? 'pointer' : 'not-allowed',
            border: `1px solid ${T.border}`, background: T.bgInput, color: T.text,
            fontSize: 13, fontFamily: 'inherit', opacity: configured ? 1 : 0.5,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
            borderLeft: '3px solid var(--gc-bar-color)',
          }}>
            <span style={{ fontSize: 15 }}></span> Continue with Apple
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 16px' }}>
          <div style={{ flex: 1, height: 1, background: T.border }} />
          <span style={{ fontSize: 10, color: T.textDim, textTransform: 'uppercase', letterSpacing: '-0.02em' }}>or</span>
          <div style={{ flex: 1, height: 1, background: T.border }} />
        </div>

        {/* Email form */}
        <form onSubmit={submit}>
          {mode === 'signup' && (
            <div style={{ marginBottom: 12 }}>
              <label style={LABEL}>Name</label>
              <input style={INPUT} value={name} onChange={e => setName(e.target.value)}
                placeholder="Jimi Hendrix" autoComplete="name" />
            </div>
          )}
          <div style={{ marginBottom: 12 }}>
            <label style={LABEL}>Email</label>
            <input style={INPUT} type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" autoComplete="email" />
          </div>
          <div style={{ marginBottom: 6 }}>
            <label style={LABEL}>Password</label>
            <input style={INPUT} type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} />
          </div>

          {mode === 'signin' && (
            <button type="button" onClick={forgot} style={{
              background: 'none', border: 'none', color: T.secondary, fontSize: 11,
              cursor: 'pointer', padding: '2px 0', marginBottom: 10, fontFamily: 'inherit',
            }}>Forgot password?</button>
          )}

          {error && <p style={{ margin: '6px 0 0', color: T.primary, fontSize: 12 }}>{error}</p>}
          {notice && <p style={{ margin: '6px 0 0', color: T.secondary, fontSize: 12 }}>{notice}</p>}

          <button type="submit" disabled={!configured || busy} style={{
            width: '100%', marginTop: 14, padding: '12px 0', borderRadius: 0,
            cursor: (!configured || busy) ? 'not-allowed' : 'pointer',
            background: (!configured || busy) ? T.border : T.primary,
            color: T.white, fontSize: 14, fontFamily: 'inherit', fontWeight: 400,
            textTransform: 'uppercase', letterSpacing: '-0.02em',
            borderLeft: '4px solid var(--gc-bar-color)',
          }}>
            {busy ? 'Please wait…' : mode === 'signin' ? 'Sign In' : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  );
};
