import React, { useState } from 'react';
import { T } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { sendPasswordReset } from '../../services/auth';
import { useLang } from '../../contexts/LanguageContext';
import { Sheet } from '../Workspace/Sheet';
import { Segment } from '../Intervals/names';

// Sign-in providers enabled in the Supabase project. Email always works.
const SOCIAL: ('google' | 'apple')[] = [];

interface Props { onClose: () => void }

type Mode = 'signin' | 'signup';

const LABEL: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, color: T.textMuted, marginBottom: 6 };

// A rounded glass field.
const INPUT: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', height: 50, padding: '0 16px', borderRadius: 16,
  border: 'none', background: 'rgba(255,255,255,0.08)', color: T.text,
  fontSize: 17, fontFamily: 'inherit', outline: 'none',
};

const WHITE = (off: boolean): React.CSSProperties => ({
  width: '100%', height: 50, borderRadius: 25, border: 'none', background: T.text, color: '#000',
  fontSize: 17, fontWeight: 600, cursor: off ? 'default' : 'pointer', opacity: off ? 0.35 : 1,
});
const SOFT: React.CSSProperties = {
  width: '100%', height: 50, borderRadius: 25, border: 'none', background: 'rgba(255,255,255,0.08)', color: T.text,
  fontSize: 17, fontWeight: 600, cursor: 'pointer',
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
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return (he ? 'כתובת המייל לא תקינה.' : 'Enter a valid email address.');
    if (password.length < 8) return (he ? 'הסיסמה צריכה להיות באורך 8 תווים לפחות.' : 'Password must be at least 8 characters.');
    if (mode === 'signup' && name.trim().length < 2) return (he ? 'כתבו את השם שלכם.' : 'Enter your name.');
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
      setError(err instanceof Error ? err.message : (he ? 'משהו השתבש.' : 'Something went wrong.'));
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
      setError(err instanceof Error ? err.message : (he ? 'הכניסה לא הצליחה.' : 'Social sign-in failed.'));
      setBusy(false);
    }
  };

  const forgot = async () => {
    setError(''); setNotice('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError((he ? 'כתבו קודם את המייל למעלה, ואז לחצו שוב.' : 'Enter your email above first, then tap reset.'));
      return;
    }
    try {
      await sendPasswordReset(email);
      setNotice((he ? 'שלחנו למייל קישור לאיפוס הסיסמה.' : 'Password reset link sent to your email.'));
    } catch (err) {
      setError(err instanceof Error ? err.message : (he ? 'לא הצלחנו לשלוח את המייל.' : 'Could not send reset email.'));
    }
  };

  const off = !configured || busy;
  return (
    <Sheet onClose={onClose} maxWidth={400}
      kicker={<span dir="ltr" style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em', textTransform: 'none' }}>Scale<span style={{ color: T.primary }}>Up</span></span>}
      title={signupDone ? (he ? 'בדקו את המייל' : 'Check your inbox') : mode === 'signin' ? (he ? 'כניסה' : 'Sign in') : (he ? 'הרשמה' : 'Sign up')}>
      {signupDone ? (
        /* Post-signup confirmation — a clear state, not a buried notice */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, color: T.textMuted }}>
            {he ? 'שלחנו קישור אישור אל' : 'We sent a confirmation link to'}
          </p>
          <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: T.text, wordBreak: 'break-all' }} dir="ltr">
            {signupDone}
          </p>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: T.textMuted }}>
            {he
              ? 'לחצו על הקישור במייל כדי להפעיל את החשבון, ואז חזרו להתחבר. לא מוצאים? בדקו בספאם.'
              : <>Click the link in that email to activate your account, then come back and sign in. Can&apos;t find it? Check your spam folder.</>}
          </p>
          <button onClick={() => { setSignupDone(null); setMode('signin'); setError(''); setNotice(''); }} className="gc-no-bar" style={{ ...WHITE(false), marginTop: 4 }}>
            {he ? 'הבנתי, לכניסה' : 'Got it, sign in'}
          </button>
        </div>
      ) : (
      <>
        {/* Mode switch */}
        <div style={{ display: 'flex' }}>
          <Segment<Mode>
            label={he ? 'מצב' : 'Mode'}
            value={mode}
            onChange={m => { setMode(m); setError(''); setNotice(''); }}
            items={[
              { id: 'signin', label: he ? 'יש לי חשבון' : 'I have an account' },
              { id: 'signup', label: he ? 'חשבון חדש' : 'New account' },
            ]}
          />
        </div>

        {!configured && (
          <p style={{ margin: 0, padding: '12px 14px', borderRadius: 16, background: 'rgba(255,255,255,0.06)', fontSize: 14, lineHeight: 1.5, color: T.textMuted }}>
            {he ? 'הכניסה לחשבונות עדיין לא מוגדרת בגרסה הזאת.' : 'Accounts aren’t set up in this version yet.'}
          </p>
        )}

        {/* Social — only providers switched on in Supabase (Authentication →
            Providers). Neither is set up yet; add 'google' / 'apple' here once
            they are, and their buttons and the "or" divider come back. */}
        {SOCIAL.length > 0 && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {SOCIAL.includes('google') && (
                <button disabled={off} onClick={() => social('google')} className="gc-no-bar" style={SOFT}>
                  {he ? 'המשך עם Google' : 'Continue with Google'}
                </button>
              )}
              {SOCIAL.includes('apple') && (
                <button disabled={off} onClick={() => social('apple')} className="gc-no-bar" style={SOFT}>
                  {he ? 'המשך עם Apple' : 'Continue with Apple'}
                </button>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.1)' }} />
              <span style={{ fontSize: 13, color: T.textMuted }}>{he ? 'או' : 'or'}</span>
              <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.1)' }} />
            </div>
          </>
        )}

        {/* Email form */}
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {mode === 'signup' && (
            <div>
              <label htmlFor="su-auth-name" style={LABEL}>{he ? 'שם' : 'Name'}</label>
              <input id="su-auth-name" style={INPUT} value={name} onChange={e => setName(e.target.value)}
                placeholder={he ? 'השם שלכם' : 'Your name'} autoComplete="name" dir="auto" />
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
              alignSelf: 'flex-start', minHeight: 36, background: 'none', border: 'none', color: T.tintLabel, fontSize: 15, fontWeight: 500,
              cursor: 'pointer', padding: 0, fontFamily: 'inherit',
            }}>{he ? 'שכחתם סיסמה?' : 'Forgot password?'}</button>
          )}

          {error && <p role="alert" style={{ margin: 0, padding: '10px 14px', borderRadius: 14, background: T.errorSoft, color: T.text, fontSize: 14, fontWeight: 600 }}>{error}</p>}
          {notice && <p role="status" style={{ margin: 0, color: T.textMuted, fontSize: 14 }}>{notice}</p>}

          <button type="submit" disabled={off} className="gc-no-bar" style={{ ...WHITE(off), marginTop: 4 }}>
            {busy ? (he ? 'רק רגע…' : 'Please wait…') : mode === 'signin' ? (he ? 'כניסה' : 'Sign in') : (he ? 'יצירת חשבון' : 'Create account')}
          </button>
        </form>
      </>
      )}
    </Sheet>
  );
};
