import React, { useEffect, useState } from 'react';
import { useLang } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { audioTabs } from '../../services/workspace';
import type { AudioTab } from '../../services/types';
import { ItemMenu } from './ItemMenu';
import { EmptyState, Loading, RenameDialog, MiniAudioPlayer, Tile } from './shared';
import { matches, formatDate, libWords, TILE_GRID, TILE_GRID_DESKTOP } from './library';

export const AudioArchive: React.FC<{ desktop?: boolean; query?: string; onCount?: (n: number) => void }> = ({ desktop, query, onCount }) => {
  const { user } = useAuth();
  const { lang } = useLang();
  const he = lang === 'he';
  const w = libWords(he);
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

  if (loading) return <Loading />;
  if (items.length === 0) return (
    <EmptyState title={he ? 'עוד אין תמלולי אודיו' : 'No audio transcriptions yet'}
      hint={he ? 'הקליטו או העלו קטע באודיו לטאב ושמרו אותו, והוא יחכה כאן להשמעה.' : 'Record or upload a clip in Audio to Tab and save it; it will wait here for playback.'} />
  );

  const remove = async (it: AudioTab) => {
    if (!confirm(w.confirmDelete(it.name))) return;
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
    await exportTabPDF(it.name, he ? 'תמלול אודיו' : 'Audio transcription', parseGrid(it), [], ['e','B','G','D','A','E'], 0);
  };

  const exportMidiFile = async (it: AudioTab) => {
    const { exportTabMidi } = await import('../../utils/midiExport');
    exportTabMidi(parseGrid(it), it.name);
  };

  const shown = items.filter(it => matches(it.name, query));
  if (!shown.length) return <EmptyState title={w.noMatchTitle} hint={w.noMatchHint} />;

  const menu = (it: AudioTab) => (
    <ItemMenu items={[
      { label: w.rename,      onClick: () => setRenaming(it) },
      { label: w.duplicate,   onClick: () => duplicate(it) },
      { label: w.pdf,  onClick: () => exportPdf(it) },
      { label: w.midi, onClick: () => exportMidiFile(it) },
      { label: w.del,      onClick: () => remove(it), danger: true },
    ]} />
  );

  return (
    <div style={desktop ? TILE_GRID_DESKTOP : TILE_GRID}>
      {shown.map(it => (
        <Tile key={it.id} type={he ? 'אודיו' : 'Audio'} name={it.name} menu={menu(it)}
          date={`${formatDate(it.updated_at, he)}${it.duration_seconds ? ` · ${Math.round(it.duration_seconds)}${he ? ' שניות' : 's'}` : ''}`}
          lead={it.original_audio_url ? <MiniAudioPlayer url={it.original_audio_url} /> : undefined} />
      ))}

      {renaming && (
        <RenameDialog initial={renaming.name} onSave={doRename} onCancel={() => setRenaming(null)} />
      )}
    </div>
  );
};
