import React, { useEffect, useState } from 'react';
import { T, card } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { savedVoicings } from '../../services/workspace';
import type { SavedVoicing } from '../../services/types';
import { requestOpenVoicings } from '../../services/handoff';
import { ItemMenu } from './ItemMenu';
import { EmptyState, RenameDialog, formatDate } from './shared';

export const VoicingPathsSection: React.FC<{ desktop?: boolean }> = ({ desktop }) => {
  const { user } = useAuth();
  const [items, setItems]       = useState<SavedVoicing[]>([]);
  const [loading, setLoading]   = useState(true);
  const [renaming, setRenaming] = useState<SavedVoicing | null>(null);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    savedVoicings.list(user.id)
      .then(setItems)
      .catch(e => console.warn('load saved_voicings', e))
      .finally(() => setLoading(false));
  }, [user]);

  if (loading) return <p style={{ color: T.textDim, fontSize: 12, textAlign: 'center', padding: 20 }}>Loading…</p>;
  if (items.length === 0) return (
    <EmptyState icon="⌁" title="No voicing paths yet"
      hint="Build a progression in Voicings → Paths, pick a path you like, and save it to your library." />
  );

  const open = (it: SavedVoicing) => {
    requestOpenVoicings({
      sub: 'paths',
      chords: it.chords,
      settings: it.settings,
      pathLabel: it.path?.label,
    });
  };

  const remove = async (it: SavedVoicing) => {
    if (!confirm(`Delete "${it.name}"?`)) return;
    await savedVoicings.remove(it.id);
    setItems(prev => prev.filter(x => x.id !== it.id));
  };

  const duplicate = async (it: SavedVoicing) => {
    if (!user) return;
    const copy = await savedVoicings.duplicate(user.id, it);
    setItems(prev => [copy, ...prev]);
  };

  const doRename = async (name: string) => {
    if (!renaming) return;
    await savedVoicings.rename(renaming.id, name);
    setItems(prev => prev.map(x => x.id === renaming.id ? { ...x, name } : x));
    setRenaming(null);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: desktop ? 'repeat(3, 1fr)' : 'repeat(auto-fill, minmax(150px, 1fr))', gap: desktop ? 14 : 8 }}>
      {items.map(it => (
        <div key={it.id} style={{ ...card({ padding: '12px 12px 10px' }), display: 'flex', flexDirection: 'column', gap: 8, borderLeft: `4px solid ${T.secondary}` }}>
          {desktop && <div style={{ fontSize: 9, color: '#9C958C', fontFamily: 'var(--gc-mono)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>Voicing Path</div>}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 4 }}>
            <div style={{ fontSize: 14, color: T.text, fontWeight: 500, lineHeight: 1.25, overflow: 'hidden' }}>
              {it.name}
            </div>
            <ItemMenu items={[
              { label: 'Open in Paths', icon: '↗', onClick: () => open(it) },
              { label: 'Rename',        icon: '✎', onClick: () => setRenaming(it) },
              { label: 'Duplicate',     icon: '⧉', onClick: () => duplicate(it) },
              { label: 'Export MIDI',   icon: '⤓', onClick: async () => { const { exportMidi } = await import('../../utils/midiExport'); exportMidi(it.chords, it.name); } },
              { label: 'Delete',        icon: '', onClick: () => remove(it), danger: true },
            ]} />
          </div>

          {/* Chord chips */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {it.chords.map((c, i) => (
              <span key={i} style={{
                fontSize: 11, color: T.text, background: T.bgDeep, border: `1px solid ${T.border}`,
                padding: '2px 8px',
              }}>{c}</span>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {it.path?.label && <Tag>{it.path.label}</Tag>}
            {it.settings?.genre && it.settings.genre !== 'any' && <Tag>{it.settings.genre}</Tag>}
            {it.settings?.mode && <Tag>{it.settings.mode}</Tag>}
          </div>

          <div style={{ fontSize: 11, color: T.textDim, marginTop: 'auto' }}>{formatDate(it.updated_at)}</div>

          <button onClick={() => open(it)} style={{
            width: '100%', padding: '8px 0', borderRadius: 0, cursor: 'pointer',
            background: T.primary, color: T.white, border: 'none',
            fontSize: 11.5, fontFamily: 'inherit', fontWeight: 400,
            textTransform: 'uppercase', letterSpacing: '-0.02em',
            borderLeft: '3px solid var(--gc-bar-color)',
          }}>Open in Paths</button>
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
