import React, { useEffect, useState } from 'react';
import { T, card } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { savedProgressions } from '../../services/workspace';
import type { SavedProgression } from '../../services/types';
import type { ChordInProgression } from '../../types/music';
import { ItemMenu } from './ItemMenu';
import { EmptyState, RenameDialog, formatDate } from './shared';

interface Props {
  /** Loads a saved progression back into the Chord Builder. */
  onOpenInBuilder: (chords: ChordInProgression[]) => void;
}

export const SavedProgressions: React.FC<Props> = ({ onOpenInBuilder }) => {
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

  if (loading) return <p style={{ color: T.textDim, fontSize: 12, textAlign: 'center', padding: 20 }}>Loading…</p>;
  if (items.length === 0) return (
    <EmptyState icon="❏" title="No saved progressions yet"
      hint="Build a progression in Theory → Chords and save it to reuse it any time." />
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map(it => (
        <div key={it.id} style={{ ...card({ padding: '12px 14px' }), display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, color: T.text, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {it.name}
            </div>
            <div style={{ fontSize: 11, color: T.textDim, marginTop: 2 }}>
              {it.detected_key ? `Key ${it.detected_key} · ` : ''}
              {it.chords.length} chord{it.chords.length !== 1 ? 's' : ''} · {formatDate(it.updated_at)}
            </div>
            {it.chords.length > 0 && (
              <div style={{ fontSize: 11, color: T.textMuted, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {it.chords.map(c => c.chord.name).join(' · ')}
              </div>
            )}
          </div>

          <button onClick={() => onOpenInBuilder(it.chords)} style={{
            padding: '8px 12px', borderRadius: 0, cursor: 'pointer', flexShrink: 0,
            background: T.secondaryBg, color: T.secondary, border: `1px solid ${T.secondaryFaint}`,
            fontSize: 11, fontFamily: 'inherit', fontWeight: 400,
            textTransform: 'uppercase', letterSpacing: '-0.02em',
            borderLeft: '3px solid var(--gc-bar-color)',
          }}>Open in Builder</button>

          <ItemMenu items={[
            { label: 'Open in Builder', icon: '↗', onClick: () => onOpenInBuilder(it.chords) },
            { label: 'Rename',          icon: '✎', onClick: () => setRenaming(it) },
            { label: 'Duplicate',       icon: '⧉', onClick: () => duplicate(it) },
            { label: 'Export PDF',      icon: '⤓', onClick: async () => { const { exportProgressionPDF } = await import('../../utils/pdfExport'); await exportProgressionPDF(it.name, it.chords); } },
            { label: 'Delete',          icon: '🗑', onClick: () => remove(it), danger: true },
          ]} />
        </div>
      ))}

      {renaming && (
        <RenameDialog initial={renaming.name} onSave={doRename} onCancel={() => setRenaming(null)} />
      )}
    </div>
  );
};
