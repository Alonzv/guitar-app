import React, { useEffect, useState } from 'react';
import { T } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { savedProgressions } from '../../services/workspace';
import type { SavedProgression } from '../../services/types';
import type { ChordInProgression } from '../../types/music';
import { ItemMenu } from './ItemMenu';
import { EmptyState, RenameDialog, Tile, Tag } from './shared';
import { matches, formatDate, TILE_GRID, TILE_GRID_DESKTOP } from './library';

interface Props {
  /** Loads a saved progression back into the Chord Builder. */
  onOpenInBuilder: (chords: ChordInProgression[]) => void;
  desktop?: boolean;
  /** The Library's search text. */
  query?: string;
  /** Reports how many items this section holds (the filter pill's count). */
  onCount?: (n: number) => void;
}

export const SavedProgressions: React.FC<Props> = ({ onOpenInBuilder, desktop, query, onCount }) => {
  const { user } = useAuth();
  const [items, setItems]       = useState<SavedProgression[]>([]);
  const [loading, setLoading]   = useState(true);
  const [renaming, setRenaming] = useState<SavedProgression | null>(null);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    savedProgressions.list(user.id)
      .then(setItems)
      .catch(e => console.warn('load saved_progressions', e))
      .finally(() => setLoading(false));
  }, [user]);

  // Report the count to the Library's filter pills.
  useEffect(() => { if (!loading) onCount?.(items.length); }, [items, loading, onCount]);

  if (loading) return <p style={{ color: T.textDim, fontSize: 12, textAlign: 'center', padding: 20 }}>Loading…</p>;
  if (items.length === 0) return (
    <EmptyState title="No saved progressions yet"
      hint="Build a progression at Chord Builder (L1) and save it to reuse it any time." />
  );

  const remove = async (it: SavedProgression) => {
    if (!confirm(`Delete "${it.name}"?`)) return;
    await savedProgressions.remove(it.id);
    setItems(prev => prev.filter(x => x.id !== it.id));
  };

  const duplicate = async (it: SavedProgression) => {
    if (!user) return;
    const copy = await savedProgressions.duplicate(user.id, it);
    setItems(prev => [copy, ...prev]);
  };

  const doRename = async (name: string) => {
    if (!renaming) return;
    await savedProgressions.rename(renaming.id, name);
    setItems(prev => prev.map(x => x.id === renaming.id ? { ...x, name } : x));
    setRenaming(null);
  };

  const shown = items.filter(it => matches(`${it.name} ${it.detected_key ?? ''} ${it.chords.map(c => c.chord.name).join(' ')}`, query));
  if (!shown.length) return <EmptyState title="Nothing matches" hint="Try another word, or clear the search." />;

  return (
    <div style={desktop ? TILE_GRID_DESKTOP : TILE_GRID}>
      {shown.map(it => (
        <Tile key={it.id} line="L1" type="Progression" name={it.name} date={formatDate(it.updated_at)}
          action={{ label: 'Open in Builder', onClick: () => onOpenInBuilder(it.chords) }}
          menu={<ItemMenu items={[
            { label: 'Open in Builder', onClick: () => onOpenInBuilder(it.chords) },
            { label: 'Rename',      onClick: () => setRenaming(it) },
            { label: 'Duplicate',   onClick: () => duplicate(it) },
            { label: 'Export PDF',  onClick: async () => { const { exportProgressionPDF } = await import('../../utils/pdfExport'); await exportProgressionPDF(it.name, it.chords); } },
            { label: 'Export MIDI', onClick: async () => { const { exportMidi } = await import('../../utils/midiExport'); exportMidi(it.chords.map(c => c.chord.name), it.name); } },
            { label: 'Delete',      onClick: () => remove(it), danger: true },
          ]} />}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {it.detected_key && <Tag>{it.detected_key}</Tag>}
            <Tag>{it.chords.length} chord{it.chords.length !== 1 ? 's' : ''}</Tag>
          </div>
          {it.chords.length > 0 && (
            <div dir="ltr" style={{ fontSize: 12, fontFamily: 'var(--gc-mono)', fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {it.chords.map(c => c.chord.name).join(' · ')}
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
