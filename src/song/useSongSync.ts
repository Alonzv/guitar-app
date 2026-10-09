import { useEffect, useState } from 'react';
import type { Song } from './song';
import { upsertLocal, saveCloud, hasContent } from './library';

// ── Keeping the song ─────────────────────────────────────────────────────────
// The working song is copied into "My songs" on the device as it changes and,
// for a signed-in player, into the cloud a moment after they stop editing.

export type SyncState = 'local' | 'saving' | 'cloud' | 'error';

export function useSongSync(song: Song, userId: string | null): SyncState {
  const [state, setState] = useState<SyncState>('local');

  useEffect(() => {
    if (!hasContent(song)) return;
    upsertLocal(song);
    if (!userId) return;
    const t = window.setTimeout(() => {
      setState('saving');
      saveCloud(userId, song).then(() => setState('cloud')).catch(() => setState('error'));
    }, 2500);
    return () => window.clearTimeout(t);
  }, [song, userId]);

  return userId ? state : 'local';
}
