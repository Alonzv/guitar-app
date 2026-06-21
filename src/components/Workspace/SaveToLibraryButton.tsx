import React, { useCallback, useEffect, useRef, useState } from 'react';
import { T } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { AuthModal } from '../Auth/AuthModal';
import { savedProgressions, savedTabs, audioTabs, uploadAudioClip } from '../../services/workspace';
import type { TabContent } from '../../services/types';
import type { ChordInProgression } from '../../types/music';

// A description of what to persist — returned lazily so we always capture the
// latest editor state at click time.
export type SaveDescriptor =
  | { kind: 'progression'; name: string; chords: ChordInProgression[]; detected_key?: string | null }
  | { kind: 'tab';         name: string; content: TabContent; tempo?: number | null; music_key?: string | null }
  | { kind: 'audio';       name: string; tab_content: string; audioBlob?: Blob | null; audioExt?: string; original_audio_url?: string | null; duration_seconds?: number | null };

type Status = 'idle' | 'saving' | 'saved';

interface Props {
  /** Return the payload, or null when there's nothing to save yet. */
  getPayload: () => SaveDescriptor | null;
  /** Visual size. */
  size?: 'sm' | 'md';
  /** Override the resting label. */
  label?: string;
  style?: React.CSSProperties;
}

export const SaveToLibraryButton: React.FC<Props> = ({ getPayload, size = 'md', label = 'Save to Library', style }) => {
  const { user, configured } = useAuth();
  const [status, setStatus]   = useState<Status>('idle');
  const [authOpen, setAuthOpen] = useState(false);
  const pendingRef = useRef(false);

  const persist = useCallback(async (d: SaveDescriptor, uid: string) => {
    if (d.kind === 'progression') {
      await savedProgressions.create(uid, { name: d.name, chords: d.chords, detected_key: d.detected_key ?? null });
    } else if (d.kind === 'tab') {
      await savedTabs.create(uid, { name: d.name, content: d.content, tempo: d.tempo ?? null, music_key: d.music_key ?? null });
    } else {
      let url = d.original_audio_url ?? null;
      if (!url && d.audioBlob) {
        try { url = await uploadAudioClip(uid, d.audioBlob, d.audioExt ?? 'webm'); }
        catch (e) { console.warn('audio upload failed, saving tab only', e); }
      }
      await audioTabs.create(uid, {
        name: d.name, tab_content: d.tab_content,
        original_audio_url: url, duration_seconds: d.duration_seconds ?? null,
      });
    }
  }, []);

  const performSave = useCallback(async (uid: string) => {
    const d = getPayload();
    if (!d) return;
    setStatus('saving');
    try {
      await persist(d, uid);
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 1800);
    } catch (e) {
      console.error('save failed', e);
      setStatus('idle');
      alert('Could not save. Please try again.');
    }
  }, [getPayload, persist]);

  // After a guest signs in through the modal, finish the save they intended.
  useEffect(() => {
    if (user && pendingRef.current) {
      pendingRef.current = false;
      setAuthOpen(false);
      performSave(user.id);
    }
  }, [user, performSave]);

  const onClick = () => {
    if (!configured) { alert('Accounts are not configured in this build.'); return; }
    if (status !== 'idle') return;
    const d = getPayload();
    if (!d) return;
    if (!user) { pendingRef.current = true; setAuthOpen(true); return; }
    performSave(user.id);
  };

  const saved  = status === 'saved';
  const pad    = size === 'sm' ? '6px 12px' : '9px 16px';
  const fs     = size === 'sm' ? 11 : 12.5;

  return (
    <>
      <button onClick={onClick} disabled={status === 'saving'} style={{
        padding: pad, borderRadius: 0, cursor: status === 'saving' ? 'wait' : 'pointer',
        border: 'none', fontFamily: 'inherit', fontSize: fs, fontWeight: 400,
        textTransform: 'uppercase', letterSpacing: '-0.02em',
        background: saved ? T.secondaryBg : T.primary,
        color: saved ? T.secondary : T.white,
        borderLeft: '3px solid var(--gc-bar-color)',
        transition: 'background 0.15s, color 0.15s',
        display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
        ...style,
      }}>
        {saved ? <>✓ Saved</> : status === 'saving' ? 'Saving…' : <>♡ {label}</>}
      </button>
      {authOpen && <AuthModal onClose={() => { pendingRef.current = false; setAuthOpen(false); }} />}
    </>
  );
};
