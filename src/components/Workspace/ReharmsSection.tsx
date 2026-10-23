import React, { useEffect, useState } from 'react';
import { T } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { savedReharms } from '../../services/workspace';
import type { SavedReharm } from '../../services/types';
import { requestOpenVoicings } from '../../services/handoff';
import { exportMidi } from '../../utils/midiExport';
import { ItemMenu } from './ItemMenu';
import { EmptyState, RenameDialog, Tile, Tag } from './shared';
import { matches, formatDate, TILE_GRID, TILE_GRID_DESKTOP } from './library';

export const ReharmsSection: React.FC<{ desktop?: boolean; query?: string; onCount?: (n: number) => void }> = ({ desktop, query, onCount }) => {
  const { user } = useAuth();
  const [items, setItems]       = useState<SavedReharm[]>([]);
  const [loading, setLoading]   = useState(true);
  const [renaming, setRenaming] = useState<SavedReharm | null>(null);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    savedReharms.list(user.id)
      .then(setItems)
      .catch(e => console.warn('load saved_reharms', e))
      .finally(() => setLoading(false));
  }, [user]);

  // Report the count to the Library's filter pills.
  useEffect(() => { if (!loading) onCount?.(items.length); }, [items, loading, onCount]);

  if (loading) return <p style={{ color: T.textDim, fontSize: 12, textAlign: 'center', padding: 20 }}>Loading…</p>;
  if (items.length === 0) return (
    <EmptyState title="No re-harmonizations yet"
      hint="Re-harmonize a progression at Reharmonize (L1) and save the result to see it here." />
  );

  const open = (it: SavedReharm) => {
    requestOpenVoicings({
      sub: 'reharmonize',
      chords: it.original,
      reharm: { result: it.result, genre: it.genre, tension: it.tension },
    });
  };

  const remove = async (it: SavedReharm) => {
    if (!confirm(`Delete "${it.name}"?`)) return;
    await savedReharms.remove(it.id);
    setItems(prev => prev.filter(x => x.id !== it.id));
  };

  const duplicate = async (it: SavedReharm) => {
    if (!user) return;
    const copy = await savedReharms.duplicate(user.id, it);
    setItems(prev => [copy, ...prev]);
  };

  const doRename = async (name: string) => {
    if (!renaming) return;
    await savedReharms.rename(renaming.id, name);
    setItems(prev => prev.map(x => x.id === renaming.id ? { ...x, name } : x));
    setRenaming(null);
  };

  const shown = items.filter(it => matches(`${it.name} ${it.genre ?? ''} ${it.original.join(' ')} ${(it.result?.chords ?? []).join(' ')}`, query));
  if (!shown.length) return <EmptyState title="Nothing matches" hint="Try another word, or clear the search." />;

  const chips = (cs: string[], strong: boolean) => (
    <div dir="ltr" style={{ fontSize: 12, fontFamily: 'var(--gc-mono)', fontWeight: strong ? 700 : 400, color: strong ? T.text : T.textMuted, lineHeight: 1.5, overflowWrap: 'anywhere' }}>
      {cs.join(' · ')}
    </div>
  );

  return (
    <div style={desktop ? TILE_GRID_DESKTOP : TILE_GRID}>
      {shown.map(it => (
        <Tile key={it.id} line="L1" type="Re-harmonization" name={it.name} date={formatDate(it.updated_at)}
          action={{ label: 'Open in Reharm', onClick: () => open(it) }}
          menu={<ItemMenu items={[
            { label: 'Open in Reharm', onClick: () => open(it) },
            { label: 'Rename',         onClick: () => setRenaming(it) },
            { label: 'Duplicate',      onClick: () => duplicate(it) },
            { label: 'Export MIDI',    onClick: () => exportMidi(it.result.chords, it.name) },
            { label: 'Delete',         onClick: () => remove(it), danger: true },
          ]} />}>
          {/* Original → re-harmonized */}
          {chips(it.original, false)}
          <span aria-hidden className="su-label" style={{ lineHeight: 1 }}>↓</span>
          {chips(it.result?.chords ?? [], true)}
          {(it.genre || it.tension != null) && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {it.genre && <Tag>{it.genre}</Tag>}
              {it.tension != null && <Tag>Tension {it.tension}</Tag>}
            </div>
          )}
        </Tile>
      ))}

      {renaming && (
        <RenameDialog initial={renaming.name} onSave={doRename} onCancel={() => setRenaming(null)} />
      )}
    </div>
  );
};

