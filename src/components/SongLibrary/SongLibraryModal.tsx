import { useState } from 'react';
import type { Song } from '../../types/music';
import { formatChordName } from '../../utils/chordIdentifier';
import { T } from '../../theme';

interface Props {
  songs: Song[];
  onClose: () => void;
  onLoad: (song: Song) => void;
  onDelete: (id: string) => void;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export function SongLibraryModal({ songs, onClose, onLoad, onDelete }: Props) {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  return (
    // Backdrop
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 3000,
        background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end',
      }}
    >
      {/* Panel */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 700, margin: '0 auto',
          background: T.bgCard, borderRadius: '16px 16px 0 0',
          padding: '20px 16px 32px', maxHeight: '75vh', display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={{ fontSize: 17, fontWeight: 800, color: T.text }}>📚 Saved Songs</span>
          <button
            onClick={onClose}
            style={{
              width: 30, height: 30, borderRadius: '50%', border: `1px solid ${T.border}`,
              background: T.bgInput, color: T.textMuted, fontSize: 16,
              cursor: 'pointer', lineHeight: '28px', padding: 0,
            }}
          >×</button>
        </div>

        {/* Song list */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {songs.length === 0 ? (
            <p style={{ textAlign: 'center', color: T.textDim, fontSize: 14, marginTop: 32, direction: 'rtl' }}>
              אין שירים שמורים עדיין.<br />בנה פרוגרסיה ולחץ 💾 <bdi>Save Song</bdi>.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {songs.map(song => (
                <div
                  key={song.id}
                  style={{
                    padding: '12px 14px', borderRadius: 12,
                    background: T.bgInput, border: `1px solid ${T.border}`,
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}
                >
                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 2 }}>
                      {song.name}
                    </div>
                    <div style={{ fontSize: 11, color: T.textMuted, direction: 'ltr' }}>
                      {song.progression.map(c => formatChordName(c.chord.name)).join(' – ')} · {formatDate(song.createdAt)}
                    </div>
                  </div>

                  {/* Actions */}
                  {confirmDelete === song.id ? (
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button
                        onClick={() => { onDelete(song.id); setConfirmDelete(null); }}
                        style={{
                          padding: '5px 10px', borderRadius: 8, border: 'none',
                          background: T.coral, color: T.white, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                        }}
                      >מחק</button>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        style={{
                          padding: '5px 10px', borderRadius: 8, border: `1px solid ${T.border}`,
                          background: T.bgCard, color: T.textMuted, fontSize: 12, cursor: 'pointer',
                        }}
                      >ביטול</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button
                        onClick={() => { onLoad(song); onClose(); }}
                        style={{
                          padding: '6px 14px', borderRadius: 8, border: 'none',
                          background: T.secondary, color: T.white, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                        }}
                      >טען</button>
                      <button
                        onClick={() => setConfirmDelete(song.id)}
                        style={{
                          width: 30, height: 30, borderRadius: 8, border: `1px solid ${T.border}`,
                          background: T.bgCard, color: T.textMuted, fontSize: 14, cursor: 'pointer', padding: 0,
                        }}
                      >🗑</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
