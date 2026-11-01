import React, { useEffect, useState } from 'react';
import { useLang } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { savedProgressions } from '../../services/workspace';
import type { SavedProgression } from '../../services/types';
import type { ChordInProgression } from '../../types/music';
import { ItemMenu } from './ItemMenu';
import { EmptyState, Loading, RenameDialog, Tile, Tag, ChordLine } from './shared';
import { formatChordName } from '../../utils/chordIdentifier';
import { matches, formatDate, libWords, TILE_GRID, TILE_GRID_DESKTOP } from './library';

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
  const { lang } = useLang();
  const he = lang === 'he';
  const w = libWords(he);
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

  if (loading) return <Loading />;
  if (items.length === 0) return (
    <EmptyState title={he ? 'עוד אין מהלכים שמורים' : 'No saved progressions yet'}
      hint={he ? 'בנו מהלך אקורדים ושמרו אותו, כדי לחזור אליו מתי שתרצו.' : 'Build a chord progression and save it to come back to it any time.'} />
  );

  const remove = async (it: SavedProgression) => {
    if (!confirm(w.confirmDelete(it.name))) return;
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

  const open = he ? 'פתיחה' : 'Open';
  const shown = items.filter(it => matches(`${it.name} ${it.detected_key ?? ''} ${it.chords.map(c => c.chord.name).join(' ')}`, query));
  if (!shown.length) return <EmptyState title={w.noMatchTitle} hint={w.noMatchHint} />;

  return (
    <div style={desktop ? TILE_GRID_DESKTOP : TILE_GRID}>
      {shown.map(it => (
        <Tile key={it.id} type={he ? 'מהלך' : 'Progression'} name={it.name} date={formatDate(it.updated_at, he)}
          action={{ label: open, onClick: () => onOpenInBuilder(it.chords) }}
          menu={<ItemMenu items={[
            { label: open, onClick: () => onOpenInBuilder(it.chords) },
            { label: w.rename,      onClick: () => setRenaming(it) },
            { label: w.duplicate,   onClick: () => duplicate(it) },
            { label: w.pdf,  onClick: async () => { const { exportProgressionPDF } = await import('../../utils/pdfExport'); await exportProgressionPDF(it.name, it.chords); } },
            { label: w.midi, onClick: async () => { const { exportMidi } = await import('../../utils/midiExport'); exportMidi(it.chords.map(c => c.chord.name), it.name); } },
            { label: w.del,      onClick: () => remove(it), danger: true },
          ]} />}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {it.detected_key && <Tag>{it.detected_key}</Tag>}
            <Tag>{he ? `${it.chords.length} אקורדים` : `${it.chords.length} chord${it.chords.length !== 1 ? 's' : ''}`}</Tag>
          </div>
          {it.chords.length > 0 && (
            <ChordLine chords={it.chords.map(c => formatChordName(c.chord.name))} />
          )}
        </Tile>
      ))}

      {renaming && (
        <RenameDialog initial={renaming.name} onSave={doRename} onCancel={() => setRenaming(null)} />
      )}
    </div>
  );
};
