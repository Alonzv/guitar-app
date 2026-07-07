import React, { useEffect, useState } from 'react';
import { T, card } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { savedTabs } from '../../services/workspace';
import type { SavedTab, TabContent } from '../../services/types';
import { ItemMenu } from './ItemMenu';
import { EmptyState, RenameDialog, formatDate } from './shared';

interface Props {
  /** Loads a saved tab into the Tab Builder. */
  onOpenInBuilder: (content: TabContent, id: string) => void;
  desktop?: boolean;
}

export const MyTabs: React.FC<Props> = ({ onOpenInBuilder, desktop }) => {
  const { user } = useAuth();
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

  if (loading) return <p style={{ color: T.textDim, fontSize: 12, textAlign: 'center', padding: 20 }}>Loading…</p>;
  if (items.length === 0) return (
    <EmptyState icon="✎" title="No saved tabs yet"
      hint="Write a tab in Tools → Tab Builder and save it to your library to see it here." />
  );

  const remove = async (it: SavedTab) => {
    if (!confirm(`Delete "${it.name}"?`)) return;
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

  return (
    <div style={{ display: 'grid', gridTemplateColumns: desktop ? 'repeat(3, 1fr)' : 'repeat(auto-fill, minmax(150px, 1fr))', gap: desktop ? 14 : 8 }}>
      {items.map(it => (
        <div key={it.id} style={{ ...card({ padding: '12px 12px 10px' }), display: 'flex', flexDirection: 'column', gap: 8, borderLeft: `4px solid ${T.primary}` }}>
          {desktop && <div style={{ fontSize: 9, color: '#9C958C', fontFamily: 'var(--gc-mono)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>Tab</div>}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 4 }}>
            <div style={{ fontSize: 14, color: T.text, fontWeight: 500, lineHeight: 1.25, overflow: 'hidden' }}>
              {it.name}
            </div>
            <ItemMenu items={[
              { label: 'Open in Builder', icon: '↗', onClick: () => onOpenInBuilder(it.content, it.id) },
              { label: 'Rename',          icon: '✎', onClick: () => setRenaming(it) },
              { label: 'Duplicate',       icon: '⧉', onClick: () => duplicate(it) },
              { label: 'Export PDF',      icon: '⤓', onClick: () => exportPdf(it) },
              { label: 'Export MIDI',     icon: '⤓', onClick: async () => { const { exportTabMidi } = await import('../../utils/midiExport'); exportTabMidi(it.content.grid ?? [], it.name); } },
              { label: 'Delete',          icon: '', onClick: () => remove(it), danger: true },
            ]} />
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {it.music_key && <Tag>{it.music_key}</Tag>}
            {it.tempo ? <Tag>{it.tempo} BPM</Tag> : null}
          </div>

          <div style={{ fontSize: 11, color: T.textDim, marginTop: 'auto' }}>{formatDate(it.updated_at)}</div>

          <button onClick={() => onOpenInBuilder(it.content, it.id)} style={{
            width: '100%', padding: '8px 0', borderRadius: 0, cursor: 'pointer',
            background: T.primary, color: T.white, border: 'none',
            fontSize: 11.5, fontFamily: 'inherit', fontWeight: 400,
            textTransform: 'uppercase', letterSpacing: '-0.02em',
            borderLeft: '3px solid var(--gc-bar-color)',
          }}>Open in Builder</button>
        </div>
      ))}

      {renaming && (
        <RenameDialog initial={renaming.name} onSave={doRename} onCancel={() => setRenaming(null)} />
      )}
    </div>
  );
};

const Tag: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span style={{
    fontSize: 10, color: T.textMuted, background: T.bgInput, border: `1px solid ${T.border}`,
    padding: '2px 7px', textTransform: 'uppercase', letterSpacing: '-0.02em',
  }}>{children}</span>
);
