import React, { useEffect, useState } from 'react';
import { useLang } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { savedTabs } from '../../services/workspace';
import type { SavedTab, TabContent } from '../../services/types';
import { ItemMenu } from './ItemMenu';
import { EmptyState, Loading, RenameDialog, Tile, Tag } from './shared';
import { matches, formatDate, libWords, TILE_GRID, TILE_GRID_DESKTOP } from './library';

interface Props {
  /** Loads a saved tab into the Tab Builder. */
  onOpenInBuilder: (content: TabContent, id: string) => void;
  desktop?: boolean;
  /** The Library's search text. */
  query?: string;
  /** Reports how many items this section holds (the filter pill's count). */
  onCount?: (n: number) => void;
}

export const MyTabs: React.FC<Props> = ({ onOpenInBuilder, desktop, query, onCount }) => {
  const { user } = useAuth();
  const { lang } = useLang();
  const he = lang === 'he';
  const w = libWords(he);
  const [items, setItems]       = useState<SavedTab[]>([]);
  const [loading, setLoading]   = useState(true);
  const [renaming, setRenaming] = useState<SavedTab | null>(null);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    savedTabs.list(user.id)
      .then(setItems)
      .catch(e => console.warn('load saved_tabs', e))
      .finally(() => setLoading(false));
  }, [user]);

  // Report the count to the Library's filter pills.
  useEffect(() => { if (!loading) onCount?.(items.length); }, [items, loading, onCount]);

  if (loading) return <Loading />;
  if (items.length === 0) return (
    <EmptyState title={he ? 'עוד אין טאבים שמורים' : 'No saved tabs yet'}
      hint={he ? 'כתבו טאב בכתיבת טאבים ושמרו אותו לספרייה, והוא יופיע כאן.' : 'Write a tab in Tab Writer and save it to your library to see it here.'} />
  );

  const remove = async (it: SavedTab) => {
    if (!confirm(w.confirmDelete(it.name))) return;
    await savedTabs.remove(it.id);
    setItems(prev => prev.filter(x => x.id !== it.id));
  };

  const duplicate = async (it: SavedTab) => {
    if (!user) return;
    const copy = await savedTabs.duplicate(user.id, it);
    setItems(prev => [copy, ...prev]);
  };

  const doRename = async (name: string) => {
    if (!renaming) return;
    await savedTabs.rename(renaming.id, name);
    setItems(prev => prev.map(x => x.id === renaming.id ? { ...x, name } : x));
    setRenaming(null);
  };

  const exportPdf = async (it: SavedTab) => {
    const c = it.content;
    const { exportTabPDF } = await import('../../utils/pdfExport');
    await exportTabPDF(
      c.title || it.name, c.subtitle || '',
      c.grid ?? [], c.bars ?? [], ['e','B','G','D','A','E'], 0,
    );
  };

  const open = he ? 'פתיחה בכתיבת טאבים' : 'Open in Tab Writer';
  const shown = items.filter(it => matches(`${it.name} ${it.music_key ?? ''}`, query));
  if (!shown.length) return <EmptyState title={w.noMatchTitle} hint={w.noMatchHint} />;

  return (
    <div style={desktop ? TILE_GRID_DESKTOP : TILE_GRID}>
      {shown.map(it => (
        <Tile key={it.id} type={he ? 'טאב' : 'Tab'} name={it.name} date={formatDate(it.updated_at, he)}
          action={{ label: open, onClick: () => onOpenInBuilder(it.content, it.id) }}
          menu={<ItemMenu items={[
            { label: open, onClick: () => onOpenInBuilder(it.content, it.id) },
            { label: w.rename,          onClick: () => setRenaming(it) },
            { label: w.duplicate,       onClick: () => duplicate(it) },
            { label: w.pdf,      onClick: () => exportPdf(it) },
            { label: w.midi,     onClick: async () => { const { exportTabMidi } = await import('../../utils/midiExport'); exportTabMidi(it.content.grid ?? [], it.name); } },
            { label: w.del,          onClick: () => remove(it), danger: true },
          ]} />}>
          {(it.music_key || it.tempo) ? (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {it.music_key && <Tag>{it.music_key}</Tag>}
              {it.tempo ? <Tag>{it.tempo} BPM</Tag> : null}
            </div>
          ) : null}
        </Tile>
      ))}

      {renaming && (
        <RenameDialog initial={renaming.name} onSave={doRename} onCancel={() => setRenaming(null)} />
      )}
    </div>
  );
};

