import React, { useEffect, useState } from 'react';
import { T, card } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { savedProgressions } from '../../services/workspace';
import type { SavedProgression } from '../../services/types';
import type { ChordInProgression } from '../../types/music';
import { ItemMenu } from './ItemMenu';
import { EmptyState, RenameDialog, formatDate } from './shared';

const PROG_ACCENT = '#5C5650';

interface Props {
  /** Loads a saved progression back into the Chord Builder. */
  onOpenInBuilder: (chords: ChordInProgression[]) => void;
  desktop?: boolean;
}

export const SavedProgressions: React.FC<Props> = ({ onOpenInBuilder, desktop }) => {
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
    <div style={desktop
      ? { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }
      : { display: 'flex', flexDirection: 'column', gap: 8 }
    }>
      {items.map(it => (
        <div key={it.id} style={{
          ...card({ padding: '12px 14px' }),
          display: 'flex',
          flexDirection: desktop ? 'column' : 'row',
          alignItems: desktop ? 'flex-start' : 'center',
          gap: desktop ? 6 : 12,
          borderLeft: `4px solid ${PROG_ACCENT}`,
        }}>
          {desktop ? (
            <>
              <div style={{ fontSize: 9, color: '#9C958C', fontFamily: 'var(--gc-mono)', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 2 }}>Progression</div>
              <div style={{ fontSize: 14, color: T.text, fontWeight: 500, lineHeight: 1.25 }}>{it.name}</div>
              <div style={{ fontSize: 11, color: T.textDim }}>
                {it.detected_key ? `Key ${it.detected_key} · ` : ''}
                {it.chords.length} chord{it.chords.length !== 1 ? 's' : ''} · {formatDate(it.updated_at)}
              </div>
              {it.chords.length > 0 && (
                <div style={{ fontSize: 11, color: T.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>
                  {it.chords.map(c => c.chord.name).join(' · ')}
                </div>
              )}
              <button onClick={() => onOpenInBuilder(it.chords)} style={{
                marginTop: 4, width: '100%', padding: '7px 0', borderRadius: 0, cursor: 'pointer',
                background: T.primary, color: T.white, border: 'none',
                fontSize: 11, fontFamily: 'inherit', fontWeight: 400,
                textTransform: 'uppercase', letterSpacing: '-0.02em',
                borderLeft: `3px solid ${PROG_ACCENT}`,
              }}>Open in Builder</button>
              <ItemMenu items={[
                { label: 'Rename',    icon: '✎', onClick: () => setRenaming(it) },
                { label: 'Duplicate', icon: '⧉', onClick: () => duplicate(it) },
                { label: 'Export PDF',icon: '⤓', onClick: async () => { const { exportProgressionPDF } = await import('../../utils/pdfExport'); await exportProgressionPDF(it.name, it.chords); } },
                { label: 'Export MIDI', icon: '⤓', onClick: async () => { const { exportMidi } = await import('../../utils/midiExport'); exportMidi(it.chords.map(c => c.chord.name), it.name); } },
                { label: 'Delete',    icon: '', onClick: () => remove(it), danger: true },
              ]} />
            </>
          ) : (
            <>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, color: T.text, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name}</div>
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
                background: T.primary, color: T.white, border: 'none',
                fontSize: 11, fontFamily: 'inherit', fontWeight: 400,
                textTransform: 'uppercase', letterSpacing: '-0.02em',
                borderLeft: '3px solid var(--gc-bar-color)',
              }}>Open in Builder</button>
              <ItemMenu items={[
                { label: 'Open in Builder', icon: '↗', onClick: () => onOpenInBuilder(it.chords) },
                { label: 'Rename',          icon: '✎', onClick: () => setRenaming(it) },
                { label: 'Duplicate',       icon: '⧉', onClick: () => duplicate(it) },
                { label: 'Export PDF',      icon: '⤓', onClick: async () => { const { exportProgressionPDF } = await import('../../utils/pdfExport'); await exportProgressionPDF(it.name, it.chords); } },
                { label: 'Delete',          icon: '', onClick: () => remove(it), danger: true },
              ]} />
            </>
          )}
        </div>
      ))}

      {renaming && (
        <RenameDialog initial={renaming.name} onSave={doRename} onCancel={() => setRenaming(null)} />
      )}
    </div>
  );
};
