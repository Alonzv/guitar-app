import { useState } from 'react';
import type { Song, SavedLyrics, SavedHarmony } from '../../types/music';
import { formatChordName } from '../../utils/chordIdentifier';
import { T, card } from '../../theme';

type Section = 'progressions' | 'songs' | 'harmonies';

interface Props {
  songs: Song[];
  savedLyrics: SavedLyrics[];
  savedHarmonies: SavedHarmony[];
  onLoadProgression: (song: Song) => void;
  onDeleteProgression: (id: string) => void;
  onRenameProgression: (id: string, name: string) => void;
  onLoadLyrics: (lyrics: SavedLyrics) => void;
  onDeleteLyrics: (id: string) => void;
  onRenameLyrics: (id: string, name: string) => void;
  onLoadHarmony: (harmony: SavedHarmony) => void;
  onDeleteHarmony: (id: string) => void;
  onRenameHarmony: (id: string, name: string) => void;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

const LABEL_STYLE: React.CSSProperties = {
  margin: 0,
  fontSize: 11,
  fontWeight: 700,
  color: T.textMuted,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};

// ── Inline-rename wrapper ─────────────────────────────────────────────────────
function InlineName({
  name, onRename,
}: { name: string; onRename: (n: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== name) onRename(trimmed);
    else setDraft(name);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(name); setEditing(false); } }}
        style={{
          fontSize: 15, fontWeight: 700, color: T.text,
          background: T.bgInput, border: `1px solid ${T.secondary}`,
          borderRadius: 6, padding: '2px 6px', width: '100%',
          outline: 'none', fontFamily: 'inherit',
        }}
      />
    );
  }
  return (
    <span
      onClick={() => { setDraft(name); setEditing(true); }}
      title="Click to rename"
      style={{
        fontSize: 15, fontWeight: 700, color: T.text,
        cursor: 'text', borderBottom: `1px dashed transparent`,
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={e => (e.currentTarget.style.borderBottomColor = T.border)}
      onMouseLeave={e => (e.currentTarget.style.borderBottomColor = 'transparent')}
    >
      {name}
    </span>
  );
}

// ── Generic item card ─────────────────────────────────────────────────────────
function ItemCard({
  name, preview, meta, loadLabel, onRename, onLoad, onDelete,
}: {
  name: string;
  preview: string;
  meta: string;
  loadLabel?: string;
  onRename: (n: string) => void;
  onLoad: () => void;
  onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div style={{
      ...card(),
      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <InlineName name={name} onRename={onRename} />
        <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', direction: 'ltr' }}>
          {preview}
        </div>
        <div style={{ fontSize: 11, color: T.textDim, marginTop: 2 }}>{meta}</div>
      </div>

      {confirmDelete ? (
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button
            onClick={onDelete}
            style={{ padding: '5px 10px', borderRadius: 8, border: 'none', background: T.coral, color: T.white, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
          >Delete</button>
          <button
            onClick={() => setConfirmDelete(false)}
            style={{ padding: '5px 10px', borderRadius: 8, border: `1px solid ${T.border}`, background: 'transparent', color: T.textMuted, fontSize: 12, cursor: 'pointer' }}
          >Cancel</button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button
            onClick={onLoad}
            style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: T.secondary, color: T.white, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
          >{loadLabel ?? 'Load'}</button>
          <button
            onClick={() => setConfirmDelete(true)}
            style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${T.border}`, background: 'transparent', color: T.textMuted, fontSize: 14, cursor: 'pointer', padding: 0 }}
          >🗑</button>
        </div>
      )}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '40px 20px', color: T.textDim }}>
      <div style={{ fontSize: 36, marginBottom: 10 }}>{icon}</div>
      <p style={{ fontSize: 14, margin: 0, lineHeight: 1.5 }}>{text}</p>
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
      <p style={LABEL_STYLE}>{label}</p>
      {count > 0 && (
        <span style={{
          fontSize: 10, fontWeight: 700, color: T.white,
          background: T.secondary, borderRadius: 10,
          padding: '1px 7px', lineHeight: '16px',
        }}>{count}</span>
      )}
    </div>
  );
}

// ── Main LibraryTab ───────────────────────────────────────────────────────────
export function LibraryTab({
  songs, savedLyrics, savedHarmonies,
  onLoadProgression, onDeleteProgression, onRenameProgression,
  onLoadLyrics, onDeleteLyrics, onRenameLyrics,
  onLoadHarmony, onDeleteHarmony, onRenameHarmony,
}: Props) {
  const [section, setSection] = useState<Section>('progressions');

  const SECTIONS: { id: Section; label: string; count: number }[] = [
    { id: 'progressions', label: '🎵 Progressions', count: songs.length },
    { id: 'songs',        label: '📝 Songs',         count: savedLyrics.length },
    { id: 'harmonies',    label: '🎼 Harmonies',     count: savedHarmonies.length },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Section switcher */}
      <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: `1px solid ${T.border}` }}>
        {SECTIONS.map(s => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            style={{
              flex: 1, padding: '10px 4px', border: 'none', cursor: 'pointer',
              fontWeight: 700, fontSize: 11,
              background: section === s.id ? T.primary : T.bgInput,
              color: section === s.id ? T.white : T.textMuted,
              transition: 'background 0.15s',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            }}
          >
            <span>{s.label}</span>
            {s.count > 0 && (
              <span style={{
                fontSize: 10, background: section === s.id ? 'rgba(255,255,255,0.3)' : T.border,
                color: section === s.id ? T.white : T.textMuted,
                borderRadius: 8, padding: '0 6px', lineHeight: '16px',
              }}>{s.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Progressions ── */}
      {section === 'progressions' && (
        <div>
          <SectionHeader label="Saved Progressions" count={songs.length} />
          {songs.length === 0 ? (
            <EmptyState
              icon="🎵"
              text={"No saved progressions yet.\nGo to Chords → build a progression → press 💾 Save."}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {songs.map(song => (
                <ItemCard
                  key={song.id}
                  name={song.name}
                  preview={song.progression.map(c => formatChordName(c.chord.name)).join(' – ') || '—'}
                  meta={`${song.progression.length} chords · ${formatDate(song.updatedAt ?? song.createdAt)}`}
                  onRename={n => onRenameProgression(song.id, n)}
                  onLoad={() => onLoadProgression(song)}
                  onDelete={() => onDeleteProgression(song.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Songs / Lyrics ── */}
      {section === 'songs' && (
        <div>
          <SectionHeader label="Saved Songs" count={savedLyrics.length} />
          {savedLyrics.length === 0 ? (
            <EmptyState
              icon="📝"
              text={"No saved songs yet.\nGo to Lyrics → write your song → press 💾 Save."}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {savedLyrics.map(item => (
                <ItemCard
                  key={item.id}
                  name={item.name}
                  preview={item.lyricsText.replace(/\n/g, ' ').slice(0, 80) + (item.lyricsText.length > 80 ? '…' : '')}
                  meta={[
                    item.composer && `Composer: ${item.composer}`,
                    item.writer && `Lyrics: ${item.writer}`,
                    formatDate(item.updatedAt),
                  ].filter(Boolean).join(' · ')}
                  onRename={n => onRenameLyrics(item.id, n)}
                  onLoad={() => onLoadLyrics(item)}
                  onDelete={() => onDeleteLyrics(item.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Harmonies ── */}
      {section === 'harmonies' && (
        <div>
          <SectionHeader label="Saved Harmonies" count={savedHarmonies.length} />
          {savedHarmonies.length === 0 ? (
            <EmptyState
              icon="🎼"
              text={"No saved harmonies yet.\nGo to Scales → detect a scale → press 💾 Save."}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {savedHarmonies.map(item => (
                <ItemCard
                  key={item.id}
                  name={item.name}
                  preview={`${item.scale.root} ${item.scale.type}`}
                  meta={[
                    item.key && `Key: ${item.key}`,
                    `Fit: ${item.scale.fitPercent}%`,
                    formatDate(item.createdAt),
                  ].filter(Boolean).join(' · ')}
                  onRename={n => onRenameHarmony(item.id, n)}
                  onLoad={() => onLoadHarmony(item)}
                  onDelete={() => onDeleteHarmony(item.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
