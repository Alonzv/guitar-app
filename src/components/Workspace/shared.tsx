import React, { useState, type ReactNode } from 'react';
import { T } from '../../theme';
import { useLang } from '../../contexts/LanguageContext';
import { Sheet } from './Sheet';

// ── Library parts ────────────────────────────────────────────────────────────
// Same language as the redesigned tools: rounded cards, one white action,
// soft glass chips, plain sentence-case words.

const whiteBtn: React.CSSProperties = {
  height: 50, padding: '0 26px', borderRadius: 25, background: T.text, color: '#000',
  fontSize: 17, fontWeight: 600, border: 'none', cursor: 'pointer',
};
const softBtn: React.CSSProperties = {
  height: 50, padding: '0 22px', borderRadius: 25, background: 'rgba(255,255,255,0.08)', color: T.text,
  fontSize: 17, fontWeight: 600, border: 'none', cursor: 'pointer',
};

/** Nothing here yet: a quiet card with a line on where to make one. */
export const EmptyState: React.FC<{ title: string; hint: string }> = ({ title, hint }) => (
  <div style={{ background: T.bgCard, borderRadius: 26, padding: '32px 22px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
    <p style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>{title}</p>
    <p className="su-sub" style={{ margin: 0, fontSize: 15, lineHeight: 1.5, maxWidth: 420 }}>{hint}</p>
  </div>
);

/** "Loading…", centred and quiet. */
export const Loading: React.FC = () => {
  const { lang } = useLang();
  return <p className="su-sub" style={{ textAlign: 'center', padding: 30, margin: 0, fontSize: 15 }}>{lang === 'he' ? 'טוען…' : 'Loading…'}</p>;
};

export const SignInPrompt: React.FC<{ onSignIn: () => void }> = ({ onSignIn }) => {
  const { lang } = useLang();
  const he = lang === 'he';
  return (
    <div className="su-in" style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', textAlign: 'center', padding: '40px 0 12px' }}>
      <span aria-hidden className="lg" style={{ width: 84, height: 84, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19.5V5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-1.5Z" /><path d="M4 19.5A2 2 0 0 1 6 18h12" /><path d="M9 7h6" />
        </svg>
      </span>
      <h2 style={{ margin: 0, fontFamily: 'var(--su-display)', fontSize: 34, fontWeight: 700, letterSpacing: '-0.03em' }}>{he ? 'הספרייה שלכם' : 'Your library'}</h2>
      <p className="su-sub" style={{ margin: 0, fontSize: 15, lineHeight: 1.55, maxWidth: 400 }}>
        {he
          ? 'התחברו כדי לשמור טאבים, מהלכי אקורדים ותמלולי אודיו, ולהמשיך מאותה נקודה בכל מכשיר.'
          : 'Sign in to save your tabs, chord progressions and audio transcriptions, and pick up where you left off on any device.'}
      </p>
      <button onClick={onSignIn} className="gc-no-bar" style={{ ...whiteBtn, marginTop: 8 }}>{he ? 'כניסה' : 'Sign in'}</button>
    </div>
  );
};

/** Rename, in a glass sheet. */
export const RenameDialog: React.FC<{
  initial: string;
  onSave: (name: string) => void;
  onCancel: () => void;
}> = ({ initial, onSave, onCancel }) => {
  const [value, setValue] = useState(initial);
  const { lang } = useLang();
  const he = lang === 'he';
  return (
    <Sheet onClose={onCancel} title={he ? 'שינוי שם' : 'Rename'} maxWidth={400} zIndex={9100}>
      <input
        autoFocus value={value} onChange={e => setValue(e.target.value)} dir="auto"
        aria-label={he ? 'שם' : 'Name'}
        onKeyDown={e => { if (e.key === 'Enter' && value.trim()) onSave(value.trim()); }}
        style={{
          width: '100%', boxSizing: 'border-box', height: 50, padding: '0 16px', borderRadius: 16,
          border: 'none', background: 'rgba(255,255,255,0.08)', color: T.text,
          fontSize: 17, fontFamily: 'inherit', outline: 'none',
        }}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button disabled={!value.trim()} onClick={() => onSave(value.trim())} className="gc-no-bar" style={{ ...whiteBtn, flex: 1, opacity: value.trim() ? 1 : 0.35 }}>{he ? 'שמירה' : 'Save'}</button>
        <button onClick={onCancel} className="gc-no-bar" style={{ ...softBtn, flex: 1 }}>{he ? 'ביטול' : 'Cancel'}</button>
      </div>
    </Sheet>
  );
};

/** Small play/pause circle for a saved recording. */
export const MiniAudioPlayer: React.FC<{ url: string }> = ({ url }) => {
  const ref = React.useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const { lang } = useLang();
  const he = lang === 'he';

  const toggle = () => {
    const el = ref.current;
    if (!el) return;
    if (playing) { el.pause(); }
    else { el.play().catch(() => setPlaying(false)); }
  };

  return (
    <>
      <audio
        ref={ref} src={url} preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
      <button onClick={toggle} aria-label={playing ? (he ? 'עצירה' : 'Pause') : (he ? 'השמעה' : 'Play')} aria-pressed={playing} className="gc-no-bar" style={{
        width: 44, height: 44, borderRadius: '50%', cursor: 'pointer', border: 'none', padding: 0, flexShrink: 0,
        background: playing ? T.text : 'rgba(255,255,255,0.1)', color: playing ? '#000' : T.text,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {playing
          ? <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden><path d="M6 4h4v16H6zM14 4h4v16h-4z" fill="currentColor" /></svg>
          : <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden><path d="M7 4.5v15l13-7.5z" fill="currentColor" /></svg>}
      </button>
    </>
  );
};

/** A small soft tag (key, tempo, style…). */
export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="gc-notation" style={{
      fontSize: 12, fontWeight: 600, color: T.text, background: 'rgba(255,255,255,0.08)', borderRadius: 12,
      padding: '4px 10px', whiteSpace: 'nowrap',
    }}><bdi dir="auto">{children}</bdi></span>
  );
}

/** A library card: the kind and the menu on top, the name, details, the
 *  date, and one soft action at the foot. */
export function Tile({ type, name, menu, children, date, action, lead }: {
  type: string; name: string; menu: ReactNode; children?: ReactNode; date: string;
  action?: { label: string; onClick: () => void };
  /** Something before the name (the audio player). */
  lead?: ReactNode;
}) {
  const { rtl } = useLang();
  return (
    <article style={{
      background: T.bgCard, borderRadius: 24, padding: 16, minHeight: 180, minWidth: 0, boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, minWidth: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: T.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{type}</span>
        {menu}
      </div>
      {lead}
      <h3 dir="auto" style={{
        margin: 0, fontSize: 19, lineHeight: 1.2, fontWeight: 700, letterSpacing: '-0.02em', overflowWrap: 'anywhere', textAlign: rtl ? 'right' : 'left',
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>{name}</h3>
      {children}
      <span className="su-sub" style={{ marginTop: 'auto', fontSize: 13 }}>{date}</span>
      {action && (
        <button onClick={action.onClick} className="gc-no-bar" style={{
          width: '100%', height: 40, borderRadius: 20, border: 'none', cursor: 'pointer',
          background: 'rgba(255,255,255,0.08)', color: T.text, fontSize: 15, fontWeight: 600,
        }}>{action.label}</button>
      )}
    </article>
  );
}

/** A line of chord names, left to right. */
export function ChordLine({ chords, strong = true }: { chords: string[]; strong?: boolean }) {
  const { rtl } = useLang();
  return (
    <div className="gc-notation" dir="ltr" style={{
      fontSize: 14, fontWeight: strong ? 600 : 500, color: strong ? T.text : T.textMuted, lineHeight: 1.45,
      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: rtl ? 'right' : 'left',
    }}>
      {chords.join('  ·  ')}
    </div>
  );
}
