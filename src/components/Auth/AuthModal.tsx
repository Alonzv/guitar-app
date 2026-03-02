import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { T } from '../../theme';

interface Props {
  onClose: () => void;
}

export function AuthModal({ onClose }: Props) {
  const { signInGoogle } = useAuth();
  const [error, setError] = useState('');
  const [busy,  setBusy]  = useState(false);

  const handleGoogle = async () => {
    setBusy(true);
    setError('');
    try {
      await signInGoogle();
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'שגיאה בכניסה';
      // User cancelled popup — don't show error
      if (!msg.includes('popup-closed')) setError('שגיאה בכניסה. נסה שוב.');
    } finally {
      setBusy(false);
    }
  };

  return (
    /* Backdrop */
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      {/* Panel */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: T.bgCard, border: `1px solid ${T.border}`,
          borderRadius: 18, padding: '28px 24px', width: '100%', maxWidth: 340,
          display: 'flex', flexDirection: 'column', gap: 16,
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: T.text }}>כניסה ל-ScaleUp</h2>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: T.textMuted }}>
            שמור שירים ופרוגרסיות בענן
          </p>
        </div>

        {/* Google button */}
        <button
          onClick={handleGoogle}
          disabled={busy}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            padding: '13px 0', borderRadius: 12,
            background: busy ? T.border : '#fff',
            color: '#333', fontWeight: 700, fontSize: 15,
            border: 'none', cursor: busy ? 'not-allowed' : 'pointer',
            transition: 'opacity 0.15s',
            opacity: busy ? 0.7 : 1,
          }}
        >
          {/* Google G icon */}
          <svg width="20" height="20" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.35-8.16 2.35-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          {busy ? 'מתחבר…' : 'כניסה עם Google'}
        </button>

        {error && (
          <p style={{ margin: 0, textAlign: 'center', fontSize: 13, color: '#e05252' }}>{error}</p>
        )}

        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: T.textMuted, fontSize: 13, cursor: 'pointer' }}
        >
          ביטול
        </button>
      </div>
    </div>
  );
}
