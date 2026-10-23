import React, { useEffect, useState } from 'react';
import { T } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { audioTabs } from '../../services/workspace';
import type { AudioTab } from '../../services/types';
import { ItemMenu } from './ItemMenu';
import { EmptyState, RenameDialog, MiniAudioPlayer, Tile } from './shared';
import { matches, formatDate, TILE_GRID, TILE_GRID_DESKTOP } from './library';

export const AudioArchive: React.FC<{ desktop?: boolean; query?: string; onCount?: (n: number) => void }> = ({ desktop, query, onCount }) => {
  const { user } = useAuth();
  const [items, setItems]     = useState<AudioTab[]>([]);
  const [loading, setLoading] = useState(true);
  const [renaming, setRenaming] = useState<AudioTab | null>(null);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    audioTabs.list(user.id)
      .then(setItems)
      .catch(e => console.warn('load audio_tabs', e))
      .finally(() => setLoading(false));
  }, [user]);

  // Report the count to the Library's filter pills.
  useEffect(() => { if (!loading) onCount?.(items.length); }, [items, loading, onCount]);

  if (loading) return <p style={{ color: T.textDim, fontSize: 12, textAlign: 'center', padding: 20 }}>Loading…</p>;
  if (items.length === 0) return (
    <EmptyState title="No audio transcriptions yet"
      hint="Record or upload a clip at Audio → Tab (L3) and it will be archived here for quick playback." />
  );

  const remove = async (it: AudioTab) => {
    if (!confirm(`Delete "${it.name}"?`)) return;
    await audioTabs.remove(it.id);
    setItems(prev => prev.filter(x => x.id !== it.id));
  };

  const duplicate = async (it: AudioTab) => {
    if (!user) return;
    const copy = await audioTabs.duplicate(user.id, it);
    setItems(prev => [copy, ...prev]);
  };

  const doRename = async (name: string) => {
    if (!renaming) return;
    await audioTabs.rename(renaming.id, name);
    setItems(prev => prev.map(x => x.id === renaming.id ? { ...x, name } : x));
    setRenaming(null);
  };

  const parseGrid = (it: AudioTab) => (it.tab_content ?? '')
    .split('\n')
    .map(line => line.split('').map(ch => ({ fret: ch.trim() })));

  const exportPdf = async (it: AudioTab) => {
    const { exportTabPDF } = await import('../../utils/pdfExport');
    await exportTabPDF(it.name, 'Audio transcription', parseGrid(it), [], ['e','B','G','D','A','E'], 0);
  };

  const exportMidiFile = async (it: AudioTab) => {
    const { exportTabMidi } = await import('../../utils/midiExport');
    exportTabMidi(parseGrid(it), it.name);
  };

  const shown = items.filter(it => matches(it.name, query));
  if (!shown.length) return <EmptyState title="Nothing matches" hint="Try another word, or clear the search." />;

  const menu = (it: AudioTab) => (
    <ItemMenu items={[
      { label: 'Rename',      onClick: () => setRenaming(it) },
      { label: 'Duplicate',   onClick: () => duplicate(it) },
      { label: 'Export PDF',  onClick: () => exportPdf(it) },
      { label: 'Export MIDI', onClick: () => exportMidiFile(it) },
      { label: 'Delete',      onClick: () => remove(it), danger: true },
    ]} />
  );

  return (
    <div style={desktop ? TILE_GRID_DESKTOP : TILE_GRID}>
      {shown.map(it => (
        <Tile key={it.id} line="L3" type="Audio" name={it.name} menu={menu(it)}
          date={`${formatDate(it.updated_at)}${it.duration_seconds ? ` · ${Math.round(it.duration_seconds)}s` : ''}`}
          lead={it.original_audio_url ? <MiniAudioPlayer url={it.original_audio_url} /> : undefined} />
      ))}

      {renaming && (
        <RenameDialog initial={renaming.name} onSave={doRename} onCancel={() => setRenaming(null)} />
      )}
    </div>
  );
};
