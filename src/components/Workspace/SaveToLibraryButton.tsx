import React, { useCallback, useEffect, useRef, useState } from 'react';
import { pillStyle } from '../Transit/styles';
import { useAuth } from '../../contexts/AuthContext';
import { AuthModal } from '../Auth/AuthModal';
import { savedProgressions, savedTabs, savedHarmonizations, savedReharms, audioTabs, uploadAudioClip } from '../../services/workspace';
import type { TabContent, HarmonizationMelody, HarmonizationResult, ReharmData } from '../../services/types';
import type { ChordInProgression } from '../../types/music';
import { RollLabel } from '../RollLabel';

// A description of what to persist — returned lazily so we always capture the
// latest editor state at click time.
export type SaveDescriptor =
  | { kind: 'progression'; name: string; chords: ChordInProgression[]; detected_key?: string | null }
  | { kind: 'tab';         name: string; content: TabContent; tempo?: number | null; music_key?: string | null }
  | { kind: 'harmonization'; name: string; scale?: string | null; styles?: string[]; bpm?: number | null; melody: HarmonizationMelody; result: HarmonizationResult }
  | { kind: 'reharm';        name: string; original: string[]; result: ReharmData; genre?: string | null; tension?: number | null }
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
    } else if (d.kind === 'harmonization') {
      await savedHarmonizations.create(uid, {
        name: d.name, scale: d.scale ?? null, styles: d.styles ?? [],
        bpm: d.bpm ?? null, melody: d.melody, result: d.result,
      });
    } else if (d.kind === 'reharm') {
      await savedReharms.create(uid, { name: d.name, original: d.original, result: d.result, genre: d.genre ?? null, tension: d.tension ?? null });
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

  // An outline pill; once saved it fills ink with a tick for a moment.
  return (
    <>
      <button onClick={onClick} disabled={status === 'saving'} aria-live="polite" className="gc-no-bar" style={{
        ...pillStyle(saved, size === 'sm' ? 'sm' : 'md'),
        cursor: status === 'saving' ? 'wait' : 'pointer',
        ...style,
      }}>
        <RollLabel>{saved ? '✓ Saved' : status === 'saving' ? 'Saving…' : label}</RollLabel>
      </button>
      {authOpen && <AuthModal onClose={() => { pendingRef.current = false; setAuthOpen(false); }} />}
    </>
  );
};
