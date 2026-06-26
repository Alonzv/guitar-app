import React, { useState } from 'react';
import { T, card } from '../../theme';

export function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return `Today, ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export const SECTION_LABEL: React.CSSProperties = {
  margin: '0 0 10px', fontSize: 11, color: T.textMuted,
  textTransform: 'uppercase', letterSpacing: '-0.02em', fontWeight: 400,
};

export const EmptyState: React.FC<{ icon?: string; title: string; hint: string }> = ({ icon = '▢', title, hint }) => (
  <div style={{ ...card({ padding: '34px 24px' }), textAlign: 'center' }}>
    <div style={{ fontSize: 30, marginBottom: 10, opacity: 0.5 }}>{icon}</div>
    <div style={{ fontSize: 14, color: T.text, fontWeight: 500, marginBottom: 6 }}>{title}</div>
    <div style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.5, maxWidth: 320, margin: '0 auto' }}>{hint}</div>
  </div>
);

export const SignInPrompt: React.FC<{ onSignIn: () => void }> = ({ onSignIn }) => (
  <div style={{ ...card({ padding: '40px 24px' }), textAlign: 'center' }}>
    <div style={{ fontSize: 30, marginBottom: 12, opacity: 0.5 }}>▣</div>
    <div style={{ fontSize: 15, color: T.text, fontWeight: 500, marginBottom: 8 }}>Your creative library</div>
    <div style={{ fontSize: 12.5, color: T.textMuted, lineHeight: 1.55, maxWidth: 320, margin: '0 auto 18px' }}>
      Sign in to save your tabs, chord progressions and audio transcriptions —
      and pick up right where you left off on any device.
    </div>
    <button onClick={onSignIn} style={{
      padding: '11px 26px', borderRadius: 0, cursor: 'pointer',
      background: T.primary, color: T.white, border: 'none',
      fontSize: 13, fontFamily: 'inherit', fontWeight: 400,
      textTransform: 'uppercase', letterSpacing: '-0.02em',
      borderLeft: '4px solid var(--gc-bar-color)',
    }}>Sign In</button>
  </div>
);

/** Inline rename dialog, themed to match the app. */
export const RenameDialog: React.FC<{
  initial: string;
  onSave: (name: string) => void;
  onCancel: () => void;
}> = ({ initial, onSave, onCancel }) => {
  const [value, setValue] = useState(initial);
  return (
    <div onClick={onCancel} style={{
      position: 'fixed', inset: 0, zIndex: 9100, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 340, background: T.bgCard,
        border: `1px solid ${T.border}`, borderLeft: '4px solid var(--gc-bar-color)',
        padding: 20, boxSizing: 'border-box',
      }}>
        <p style={SECTION_LABEL}>Rename</p>
        <input
          autoFocus value={value} onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && value.trim()) onSave(value.trim()); }}
          style={{
            width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 0,
            border: `1px solid ${T.border}`, background: T.bgInput, color: T.text,
            fontSize: 14, fontFamily: 'inherit', outline: 'none', marginBottom: 14,
            borderLeft: '3px solid var(--gc-bar-color)',
          }}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <button disabled={!value.trim()} onClick={() => onSave(value.trim())} style={{
            flex: 1, padding: '10px 0', borderRadius: 0, cursor: value.trim() ? 'pointer' : 'not-allowed',
            background: value.trim() ? T.primary : T.border, color: T.white, border: 'none',
            fontSize: 12.5, fontFamily: 'inherit', textTransform: 'uppercase', letterSpacing: '-0.02em',
            borderLeft: '3px solid var(--gc-bar-color)',
          }}>Save</button>
          <button onClick={onCancel} style={{
            flex: 1, padding: '10px 0', borderRadius: 0, cursor: 'pointer',
            background: T.bgInput, color: T.textMuted, border: `1px solid ${T.border}`,
            fontSize: 12.5, fontFamily: 'inherit', textTransform: 'uppercase', letterSpacing: '-0.02em',
          }}>Cancel</button>
        </div>
      </div>
    </div>
  );
};

/** Small inline audio player — single play/pause button + filename agnostic. */
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
      <button onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} style={{
        width: 32, height: 32, borderRadius: 0, cursor: 'pointer',
        border: `1px solid ${T.secondary}`, background: T.secondaryBg, color: T.secondary,
        fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
        flexShrink: 0,
      }}>{playing ? 'II' : '>'}</button>
    </>
  );
};
