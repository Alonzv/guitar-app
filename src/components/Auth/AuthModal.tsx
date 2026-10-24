import React, { useState } from 'react';
import { T } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { sendPasswordReset } from '../../services/auth';
import { useLang } from '../../contexts/LanguageContext';
import { Sheet } from '../Workspace/Sheet';
import { Pill, PillRow, Cta } from '../Transit/parts';
import { ctaStyle } from '../Transit/styles';

// Sign-in providers enabled in the Supabase project. Email always works.
const SOCIAL: ('google' | 'apple')[] = [];

interface Props { onClose: () => void }

type Mode = 'signin' | 'signup';

const LABEL: React.CSSProperties = {
  display: 'block', fontSize: 10, color: T.textMuted, marginBottom: 6, fontFamily: 'var(--gc-mono)',
  textTransform: 'uppercase', letterSpacing: '0.14em', fontWeight: 400,
};

// Raised field: card paper in a 2px ink frame.
const INPUT: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', height: 48, padding: '0 14px', borderRadius: 0,
  border: `var(--su-rule) solid ${T.text}`, background: T.bgCard, color: T.text,
  fontSize: 15, fontFamily: 'inherit', outline: 'none',
};

export const AuthModal: React.FC<Props> = ({ onClose }) => {
  const { configured, signIn, signUp, signInGoogle, signInApple } = useAuth();
  const { lang } = useLang();
  const he = lang === 'he';
  const [mode, setMode]         = useState<Mode>('signin');
  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState('');
  const [notice, setNotice]     = useState('');
  // Set after a successful signup — swaps the whole form for a clear
  // "check your inbox" confirmation panel instead of a one-line notice.
  const [signupDone, setSignupDone] = useState<string | null>(null);

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
        setSignupDone(email);
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

  const off = !configured || busy;
  return (
    <Sheet onClose={onClose} maxWidth={400}
      kicker={<span>Scale<span style={{ color: T.primary }}>Up</span></span>}
      title={signupDone ? (he ? 'בדקו את המייל' : 'Check your inbox') : mode === 'signin' ? (he ? 'כניסה' : 'Sign in') : (he ? 'הרשמה' : 'Sign up')}>
      {signupDone ? (
        /* Post-signup confirmation — a clear state, not a buried notice */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: T.textMuted }}>
            {he ? 'שלחנו קישור אישור אל' : 'We sent a confirmation link to'}
          </p>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: T.text, wordBreak: 'break-all', fontFamily: 'var(--gc-mono)' }}>
            {signupDone}
          </p>
          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: T.textMuted }}>
            {he
              ? 'לחצו על הקישור במייל כדי להפעיל את החשבון, ואז חזרו להתחבר. לא מוצאים? בדקו בספאם.'
              : <>Click the link in that email to activate your account, then come back and sign in. Can&apos;t find it? Check your spam folder.</>}
          </p>
          <Cta onClick={() => { setSignupDone(null); setMode('signin'); setError(''); setNotice(''); }} style={{ width: '100%' }}>
            {he ? 'הבנתי — כניסה' : 'Got it — sign in'}
          </Cta>
        </div>
      ) : (
      <>
        {/* Mode switch */}
        <PillRow<Mode>
          label={he ? 'מצב' : 'Mode'}
          value={mode}
          onChange={m => { setMode(m); setError(''); setNotice(''); }}
          items={[
            { id: 'signin', label: he ? 'כניסה' : 'Sign in' },
            { id: 'signup', label: he ? 'הרשמה' : 'Sign up' },
          ]}
        />

        {!configured && (
          <p style={{
            margin: 0, padding: '10px 0', fontSize: 11.5, lineHeight: 1.5,
            color: T.text, borderTop: `1px solid ${T.hairline}`, borderBottom: `1px solid ${T.hairline}`,
          }}>
            Sign-in is not configured yet. Add your Supabase keys to <code>.env</code> to
            enable accounts.
          </p>
        )}

        {/* Social — only providers switched on in Supabase (Authentication →
            Providers). Neither is set up yet; add 'google' / 'apple' here once
            they are, and their buttons and the "or" divider come back. */}
        {SOCIAL.length > 0 && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {SOCIAL.includes('google') && (
                <Pill disabled={off} onClick={() => social('google')} style={{ width: '100%' }}>
                  {he ? 'המשך עם Google' : 'Continue with Google'}
                </Pill>
              )}
              {SOCIAL.includes('apple') && (
                <Pill disabled={off} onClick={() => social('apple')} style={{ width: '100%' }}>
                  {he ? 'המשך עם Apple' : 'Continue with Apple'}
                </Pill>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, height: 1, background: T.hairline }} />
              <span className="su-label">{he ? 'או' : 'or'}</span>
              <div style={{ flex: 1, height: 1, background: T.hairline }} />
            </div>
          </>
        )}

        {/* Email form */}
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {mode === 'signup' && (
            <div>
              <label htmlFor="su-auth-name" style={LABEL}>{he ? 'שם' : 'Name'}</label>
              <input id="su-auth-name" style={INPUT} value={name} onChange={e => setName(e.target.value)}
                placeholder="Jimi Hendrix" autoComplete="name" dir="auto" />
            </div>
          )}
          <div>
            <label htmlFor="su-auth-email" style={LABEL}>{he ? 'אימייל' : 'Email'}</label>
            <input id="su-auth-email" style={INPUT} type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" autoComplete="email" dir="ltr" />
          </div>
          <div>
            <label htmlFor="su-auth-pass" style={LABEL}>{he ? 'סיסמה' : 'Password'}</label>
            <input id="su-auth-pass" style={INPUT} type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} dir="ltr" />
          </div>

          {mode === 'signin' && (
            <button type="button" onClick={forgot} className="gc-no-bar" style={{
              alignSelf: 'flex-start', minHeight: 36, background: 'none', border: 'none', color: T.text, fontSize: 11,
              cursor: 'pointer', padding: 0, fontFamily: 'inherit', textDecoration: 'underline', letterSpacing: '0.06em',
            }}>{he ? 'שכחתם סיסמה?' : 'Forgot password?'}</button>
          )}

          {error && <p role="alert" style={{ margin: 0, color: T.text, fontSize: 12, fontWeight: 700 }}>{error}</p>}
          {notice && <p role="status" style={{ margin: 0, color: T.textMuted, fontSize: 12 }}>{notice}</p>}

          <button type="submit" disabled={off} className="gc-no-bar" style={{ ...ctaStyle(off), width: '100%', marginTop: 4 }}>
            {busy ? (he ? 'רק רגע…' : 'Please wait…') : mode === 'signin' ? (he ? 'כניסה' : 'Sign in') : (he ? 'יצירת חשבון' : 'Create account')}
          </button>
        </form>
      </>
      )}
    </Sheet>
  );
};
