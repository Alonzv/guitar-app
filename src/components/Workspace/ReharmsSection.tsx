import React, { useEffect, useState } from 'react';
import { T, card } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { savedReharms } from '../../services/workspace';
import type { SavedReharm } from '../../services/types';
import { requestOpenVoicings } from '../../services/handoff';
import { exportMidi } from '../../utils/midiExport';
import { ItemMenu } from './ItemMenu';
import { EmptyState, RenameDialog, formatDate } from './shared';

export const ReharmsSection: React.FC<{ desktop?: boolean }> = ({ desktop }) => {
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

  if (loading) return <p style={{ color: T.textDim, fontSize: 12, textAlign: 'center', padding: 20 }}>Loading…</p>;
  if (items.length === 0) return (
    <EmptyState icon="↻" title="No re-harmonizations yet"
      hint="Re-harmonize a progression in Voicings → Reharm and save the result to see it here." />
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

  return (
    <div style={{ display: 'grid', gridTemplateColumns: desktop ? 'repeat(3, 1fr)' : 'repeat(auto-fill, minmax(150px, 1fr))', gap: desktop ? 14 : 8 }}>
      {items.map(it => (
        <div key={it.id} style={{ ...card({ padding: '12px 12px 10px' }), display: 'flex', flexDirection: 'column', gap: 8, borderLeft: `4px solid ${T.coral}` }}>
          {desktop && <div style={{ fontSize: 9, color: '#9C958C', fontFamily: 'var(--gc-mono)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>Re-Harmonization</div>}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 4 }}>
            <div style={{ fontSize: 14, color: T.text, fontWeight: 500, lineHeight: 1.25, overflow: 'hidden' }}>
              {it.name}
            </div>
            <ItemMenu items={[
              { label: 'Open in Reharm', icon: '↗', onClick: () => open(it) },
              { label: 'Rename',         icon: '✎', onClick: () => setRenaming(it) },
              { label: 'Duplicate',      icon: '⧉', onClick: () => duplicate(it) },
              { label: 'Export MIDI',    icon: '⤓', onClick: () => exportMidi(it.result.chords, it.name) },
              { label: 'Delete',         icon: '', onClick: () => remove(it), danger: true },
            ]} />
          </div>

          {/* Original → Reharmonized chips */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
            {it.original.map((c, i) => (
              <span key={i} style={{
                fontSize: 10.5, color: T.textMuted, background: T.bgDeep, border: `1px solid ${T.border}`,
                padding: '1px 6px',
              }}>{c}</span>
            ))}
          </div>
          <div style={{ fontSize: 11, color: T.textDim, lineHeight: 1 }}>↓</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {(it.result?.chords ?? []).map((c, i) => (
              <span key={i} style={{
                fontSize: 11, color: T.text, background: T.secondaryBg, border: `1px solid ${T.secondaryFaint}`,
                padding: '2px 8px',
              }}>{c}</span>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {it.genre && <Tag>{it.genre}</Tag>}
            {it.tension != null && <Tag>Tension {it.tension}</Tag>}
          </div>

          <div style={{ fontSize: 11, color: T.textDim, marginTop: 'auto' }}>{formatDate(it.updated_at)}</div>

          <button onClick={() => open(it)} style={{
            width: '100%', padding: '8px 0', borderRadius: 0, cursor: 'pointer',
            background: T.secondaryBg, color: T.secondary, border: `1px solid ${T.secondaryFaint}`,
            fontSize: 11.5, fontFamily: 'inherit', fontWeight: 400,
            textTransform: 'uppercase', letterSpacing: '-0.02em',
            borderLeft: '3px solid var(--gc-bar-color)',
          }}>Open in Reharm</button>
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
