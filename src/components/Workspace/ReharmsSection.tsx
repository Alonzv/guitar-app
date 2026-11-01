import React, { useEffect, useState } from 'react';
import { useLang } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { savedReharms } from '../../services/workspace';
import type { SavedReharm } from '../../services/types';
import { requestOpenVoicings } from '../../services/handoff';
import { exportMidi } from '../../utils/midiExport';
import { ItemMenu } from './ItemMenu';
import { EmptyState, Loading, RenameDialog, Tile, Tag, ChordLine } from './shared';
import { formatChordName } from '../../utils/chordIdentifier';
import { matches, formatDate, libWords, TILE_GRID, TILE_GRID_DESKTOP } from './library';

export const ReharmsSection: React.FC<{ desktop?: boolean; query?: string; onCount?: (n: number) => void }> = ({ desktop, query, onCount }) => {
  const { user } = useAuth();
  const { lang } = useLang();
  const he = lang === 'he';
  const w = libWords(he);
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

  if (loading) return <Loading />;
  if (items.length === 0) return (
    <EmptyState title={he ? 'עוד אין רה-הרמוניזציות' : 'No re-harmonizations yet'}
      hint={he ? 'עשו רה-הרמוניזציה למהלך ושמרו את התוצאה, והיא תופיע כאן.' : 'Re-harmonize a progression and save the result to see it here.'} />
  );

  const open = (it: SavedReharm) => {
    requestOpenVoicings({
      sub: 'reharmonize',
      chords: it.original,
      reharm: { result: it.result, genre: it.genre, tension: it.tension },
    });
  };

  const remove = async (it: SavedReharm) => {
    if (!confirm(w.confirmDelete(it.name))) return;
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

  const openL = he ? 'פתיחה ברה-הרמוניזציה' : 'Open in Reharmonize';
  const shown = items.filter(it => matches(`${it.name} ${it.genre ?? ''} ${it.original.join(' ')} ${(it.result?.chords ?? []).join(' ')}`, query));
  if (!shown.length) return <EmptyState title={w.noMatchTitle} hint={w.noMatchHint} />;


  return (
    <div style={desktop ? TILE_GRID_DESKTOP : TILE_GRID}>
      {shown.map(it => (
        <Tile key={it.id} type={he ? 'רה-הרמוניזציה' : 'Re-harmonization'} name={it.name} date={formatDate(it.updated_at, he)}
          action={{ label: openL, onClick: () => open(it) }}
          menu={<ItemMenu items={[
            { label: openL, onClick: () => open(it) },
            { label: w.rename,         onClick: () => setRenaming(it) },
            { label: w.duplicate,      onClick: () => duplicate(it) },
            { label: w.midi,    onClick: () => exportMidi(it.result.chords, it.name) },
            { label: w.del,         onClick: () => remove(it), danger: true },
          ]} />}>
          {/* Original → re-harmonized */}
          <ChordLine chords={it.original.map(formatChordName)} strong={false} />
          <ChordLine chords={(it.result?.chords ?? []).map(formatChordName)} />
          {(it.genre || it.tension != null) && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {it.genre && <Tag>{it.genre}</Tag>}
              {it.tension != null && <Tag>{he ? `מתח ${it.tension}` : `Tension ${it.tension}`}</Tag>}
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

