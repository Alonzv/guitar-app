import React, { useEffect, useState } from 'react';
import { T, card } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { audioTabs } from '../../services/workspace';
import type { AudioTab } from '../../services/types';
import { ItemMenu } from './ItemMenu';
import { EmptyState, RenameDialog, MiniAudioPlayer, formatDate } from './shared';

const AUDIO_ACCENT = '#6B655C';

export const AudioArchive: React.FC<{ desktop?: boolean }> = ({ desktop }) => {
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

  if (loading) return <p style={{ color: T.textDim, fontSize: 12, textAlign: 'center', padding: 20 }}>Loading…</p>;
  if (items.length === 0) return (
    <EmptyState icon="" title="No audio transcriptions yet"
      hint="Upload a clip in Tools → Audio→Tab and it will be archived here for quick playback." />
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

  const exportPdf = async (it: AudioTab) => {
    const grid = (it.tab_content ?? '')
      .split('\n')
      .map(line => line.split('').map(ch => ({ fret: ch.trim() })));
    const { exportTabPDF } = await import('../../utils/pdfExport');
    await exportTabPDF(it.name, 'Audio transcription', grid, [], ['e','B','G','D','A','E'], 0);
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
          gap: 12,
          borderLeft: `4px solid ${AUDIO_ACCENT}`,
        }}>
          {desktop ? (
            <>
              <div style={{ fontSize: 9, color: '#9C958C', fontFamily: 'var(--gc-mono)', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 2 }}>Audio</div>
              <div style={{ fontSize: 14, color: T.text, fontWeight: 500, lineHeight: 1.25, width: '100%' }}>{it.name}</div>
              <div style={{ fontSize: 11, color: T.textDim, marginTop: 2 }}>
                {formatDate(it.updated_at)}{it.duration_seconds ? ` · ${Math.round(it.duration_seconds)}s` : ''}
              </div>
              {it.original_audio_url && <MiniAudioPlayer url={it.original_audio_url} />}
              <div style={{ display: 'flex', gap: 6, marginTop: 'auto', width: '100%' }}>
                <ItemMenu items={[
                  { label: 'Rename',    icon: '✎', onClick: () => setRenaming(it) },
                  { label: 'Duplicate', icon: '⧉', onClick: () => duplicate(it) },
                  { label: 'Export PDF',icon: '⤓', onClick: () => exportPdf(it) },
                  { label: 'Delete',    icon: '', onClick: () => remove(it), danger: true },
                ]} />
              </div>
            </>
          ) : (
            <>
              {it.original_audio_url
                ? <MiniAudioPlayer url={it.original_audio_url} />
                : <span style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.textDim, flexShrink: 0 }}></span>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, color: T.text, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name}</div>
                <div style={{ fontSize: 11, color: T.textDim, marginTop: 2 }}>
                  {formatDate(it.updated_at)}{it.duration_seconds ? ` · ${Math.round(it.duration_seconds)}s` : ''}
                </div>
              </div>
              <ItemMenu items={[
                { label: 'Rename',    icon: '✎', onClick: () => setRenaming(it) },
                { label: 'Duplicate', icon: '⧉', onClick: () => duplicate(it) },
                { label: 'Export PDF',icon: '⤓', onClick: () => exportPdf(it) },
                { label: 'Delete',    icon: '', onClick: () => remove(it), danger: true },
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
