import React, { useState, type ReactNode } from 'react';
import { T } from '../../theme';
import { useLang } from '../../contexts/LanguageContext';
import { LINES, type LineId } from '../../data/tools';
import { Pill, Cta } from '../Transit/parts';
import { Sheet } from './Sheet';

/** Nothing here yet — a small poster and a line on where to make one.
 *  (`icon` is kept for callers but no longer drawn: icons were decoration.) */
export const EmptyState: React.FC<{ icon?: string; title: string; hint: string }> = ({ title, hint }) => (
  <div style={{ borderTop: `var(--su-rule) solid ${T.border}`, padding: '22px 0 8px' }}>
    <p className="su-poster" style={{ margin: 0, fontSize: 40 }}>{title}</p>
    <p style={{ margin: '14px 0 0', fontSize: 12.5, color: T.textMuted, lineHeight: 1.6, maxWidth: 420 }}>{hint}</p>
  </div>
);

export const SignInPrompt: React.FC<{ onSignIn: () => void }> = ({ onSignIn }) => {
  const { lang } = useLang();
  const he = lang === 'he';
  return (
    <div style={{ borderTop: `var(--su-rule) solid ${T.border}`, padding: '22px 0 8px', display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'flex-start' }}>
      <p className="su-poster" style={{ margin: 0, fontSize: 56 }}>{he ? <>הספרייה<br />שלכם</> : <>Your<br />library</>}</p>
      <p style={{ margin: 0, fontSize: 13, color: T.textMuted, lineHeight: 1.6, maxWidth: 420 }}>
        {he
          ? 'התחברו כדי לשמור טאבים, מהלכי אקורדים ותמלולי אודיו — ולהמשיך מאותה נקודה בכל מכשיר.'
          : 'Sign in to save your tabs, chord progressions and audio transcriptions — and pick up right where you left off on any device.'}
      </p>
      <Cta onClick={onSignIn}>{he ? 'כניסה' : 'Sign in'}</Cta>
    </div>
  );
};

/** Inline rename dialog. */
export const RenameDialog: React.FC<{
  initial: string;
  onSave: (name: string) => void;
  onCancel: () => void;
}> = ({ initial, onSave, onCancel }) => {
  const [value, setValue] = useState(initial);
  const { lang } = useLang();
  const he = lang === 'he';
  return (
    <Sheet onClose={onCancel} title={he ? 'שינוי שם' : 'Rename'} maxWidth={380} zIndex={9100}>
      <input
        autoFocus value={value} onChange={e => setValue(e.target.value)} dir="auto"
        aria-label={he ? 'שם' : 'Name'}
        onKeyDown={e => { if (e.key === 'Enter' && value.trim()) onSave(value.trim()); }}
        style={{
          width: '100%', boxSizing: 'border-box', height: 48, padding: '0 14px', borderRadius: 0,
          border: `var(--su-rule) solid ${T.text}`, background: T.bgCard, color: T.text,
          fontSize: 15, fontFamily: 'inherit', outline: 'none',
        }}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <Cta disabled={!value.trim()} onClick={() => onSave(value.trim())} style={{ flex: 1 }}>{he ? 'שמירה' : 'Save'}</Cta>
        <Pill onClick={onCancel} style={{ flex: 1 }}>{he ? 'ביטול' : 'Cancel'}</Pill>
      </div>
    </Sheet>
  );
};

/** Small inline audio player — one round play/pause pill. */
export const MiniAudioPlayer: React.FC<{ url: string }> = ({ url }) => {
  const ref = React.useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

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
      <button onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} aria-pressed={playing} className="gc-no-bar" style={{
        width: 44, height: 44, borderRadius: '50%', cursor: 'pointer',
        border: `1.5px solid ${T.text}`, background: playing ? T.secondary : 'transparent', color: playing ? T.white : T.text,
        fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
        flexShrink: 0,
      }}>{playing ? '❚❚' : '▶'}</button>
    </>
  );
};

/** The item's type as a line badge — [L3] TAB — never a colour bar. */
export function TypeBadge({ line, type }: { line: LineId; type: string }) {
  const l = LINES.find(x => x.id === line)!;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      <span style={{ background: l.color, color: l.onColor, padding: '3px 6px', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', flexShrink: 0 }}>{line}</span>
      <span className="su-label" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{type}</span>
    </span>
  );
}

/** A small mono tag (key, tempo, style…). */
export function Tag({ children }: { children: ReactNode }) {
  return (
    <span style={{
      fontSize: 10, color: T.text, border: `1px solid ${T.text}`, borderRadius: 'var(--su-pill)',
      padding: '2px 8px', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--gc-mono)', whiteSpace: 'nowrap',
    }}>{children}</span>
  );
}

/** A library tile: square corners, the type badge and menu on top, the
 *  name as a 75% Archivo title, details, and one ink action at the foot. */
export function Tile({ line, type, name, menu, children, date, action, lead }: {
  line: LineId; type: string; name: string; menu: ReactNode; children?: ReactNode; date: string;
  action?: { label: string; onClick: () => void };
  /** Something before the name (the audio player). */
  lead?: ReactNode;
}) {
  return (
    <article style={{
      background: T.bgInput, padding: 14, minHeight: 200, minWidth: 0, boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, minWidth: 0 }}>
        <TypeBadge line={line} type={type} />
        {menu}
      </div>
      {lead}
      <h3 className="su-semi" dir="auto" style={{
        margin: 0, fontSize: 21, lineHeight: 1.02, textTransform: 'uppercase', overflowWrap: 'anywhere',
        display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>{name}</h3>
      {children}
      <span className="su-label" style={{ marginTop: 'auto' }}>{date}</span>
      {action && (
        <Pill size="sm" onClick={action.onClick} style={{ width: '100%', background: T.secondary, color: T.white }}>{action.label}</Pill>
      )}
    </article>
  );
}
