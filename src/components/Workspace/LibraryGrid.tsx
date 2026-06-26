import React, { useEffect, useState, useMemo } from 'react';
import { T, card } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { AuthModal } from '../Auth/AuthModal';
import { SignInPrompt } from './shared';
import { audioTabs, savedTabs, savedProgressions } from '../../services/workspace';
import type { AudioTab, SavedTab, SavedProgression } from '../../services/types';
import type { TabContent } from '../../services/types';
import type { ChordInProgression } from '../../types/music';
import { RenameDialog, formatDate } from './shared';

// ── Per-type accent colours ──────────────────────────────────────────────────
const TYPE_COLOR: Record<string, string> = {
  audio:       '#6B655C',
  tab:         T.primary,
  progression: T.secondary,
};
const TYPE_LABEL: Record<string, string> = {
  audio:       'Audio',
  tab:         'Tab',
  progression: 'Progression',
};

type ItemType = 'audio' | 'tab' | 'progression';
type FilterType = 'all' | ItemType;
type SortOrder = 'newest' | 'oldest';

interface LibItem {
  id:         string;
  type:       ItemType;
  name:       string;
  preview:    string;
  created_at: string;
  raw:        AudioTab | SavedTab | SavedProgression;
}

function previewAudio(item: AudioTab): string {
  const dur = item.duration_seconds ? `${Math.round(item.duration_seconds)}s` : '';
  const lines = (item.tab_content ?? '').split('\n').filter(Boolean).length;
  return [dur && `Duration: ${dur}`, lines && `${lines} lines transcribed`].filter(Boolean).join(' · ') || 'Audio recording';
}

function previewTab(item: SavedTab): string {
  const { grid, bars } = item.content ?? { grid: [], bars: [] };
  const measures = bars.length || 0;
  const frets    = grid.flatMap(row => row).filter(c => c.fret && c.fret !== '—').length;
  return [measures && `${measures} bars`, frets && `${frets} notes`].filter(Boolean).join(' · ') || 'Tab';
}

function previewProg(item: SavedProgression): string {
  const chords = item.chords.map(c => c.chord?.name ?? '?').join(' – ');
  if (item.detected_key) return `${item.detected_key} · ${chords}`;
  return chords || 'Progression';
}

const SECTION: React.CSSProperties = {
  fontFamily: 'var(--gc-mono)', fontSize: 11, letterSpacing: '0.14em',
  textTransform: 'uppercase', color: '#9C958C', margin: 0,
};

interface Props {
  desktop?: boolean;
  onOpenTabInBuilder: (content: TabContent, id: string) => void;
  onOpenProgressionInBuilder: (chords: ChordInProgression[]) => void;
}

export const LibraryGrid: React.FC<Props> = ({ desktop, onOpenTabInBuilder, onOpenProgressionInBuilder }) => {
  const { user, loading: authLoading, configured } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);

  const [audioItems, setAudioItems]   = useState<AudioTab[]>([]);
  const [tabItems,   setTabItems]     = useState<SavedTab[]>([]);
  const [progItems,  setProgItems]    = useState<SavedProgression[]>([]);
  const [loading,    setLoading]      = useState(true);

  const [search,     setSearch]       = useState('');
  const [filter,     setFilter]       = useState<FilterType>('all');
  const [sort,       setSort]         = useState<SortOrder>('newest');
  const [renaming,   setRenaming]     = useState<{ id: string; name: string; type: ItemType } | null>(null);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    Promise.all([
      audioTabs.list(user.id),
      savedTabs.list(user.id),
      savedProgressions.list(user.id),
    ])
      .then(([a, t, p]) => { setAudioItems(a); setTabItems(t); setProgItems(p); })
      .catch(e => console.warn('LibraryGrid fetch', e))
      .finally(() => setLoading(false));
  }, [user]);

  const allItems = useMemo((): LibItem[] => {
    const a: LibItem[] = audioItems.map(x => ({
      id: x.id, type: 'audio', name: x.name,
      preview: previewAudio(x), created_at: x.created_at, raw: x,
    }));
    const t: LibItem[] = tabItems.map(x => ({
      id: x.id, type: 'tab', name: x.name,
      preview: previewTab(x), created_at: x.created_at, raw: x,
    }));
    const p: LibItem[] = progItems.map(x => ({
      id: x.id, type: 'progression', name: x.name,
      preview: previewProg(x), created_at: x.created_at, raw: x,
    }));
    const merged = [...a, ...t, ...p];
    merged.sort((x, y) => {
      const d = new Date(x.created_at).getTime() - new Date(y.created_at).getTime();
      return sort === 'newest' ? -d : d;
    });
    return merged;
  }, [audioItems, tabItems, progItems, sort]);

  const visible = useMemo(() => {
    let items = allItems;
    if (filter !== 'all') items = items.filter(x => x.type === filter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      items = items.filter(x => x.name.toLowerCase().includes(q) || x.preview.toLowerCase().includes(q));
    }
    return items;
  }, [allItems, filter, search]);

  const handleDelete = async (item: LibItem) => {
    if (!confirm(`Delete "${item.name}"?`)) return;
    if (item.type === 'audio')       { await audioTabs.remove(item.id);         setAudioItems(p => p.filter(x => x.id !== item.id)); }
    else if (item.type === 'tab')    { await savedTabs.remove(item.id);          setTabItems(p => p.filter(x => x.id !== item.id)); }
    else                             { await savedProgressions.remove(item.id);  setProgItems(p => p.filter(x => x.id !== item.id)); }
  };

  const handleOpen = (item: LibItem) => {
    if (item.type === 'tab') {
      const raw = item.raw as SavedTab;
      onOpenTabInBuilder(raw.content, raw.id);
    } else if (item.type === 'progression') {
      const raw = item.raw as SavedProgression;
      onOpenProgressionInBuilder(raw.chords);
    }
  };

  const doRename = async (name: string) => {
    if (!renaming) return;
    if (renaming.type === 'audio')       await audioTabs.rename(renaming.id, name);
    else if (renaming.type === 'tab')    await savedTabs.update(renaming.id, { name });
    else                                  await savedProgressions.rename(renaming.id, name);

    const update = (arr: { id: string; name: string }[]) =>
      arr.map(x => x.id === renaming.id ? { ...x, name } : x);
    if (renaming.type === 'audio')       setAudioItems(p => update(p) as AudioTab[]);
    else if (renaming.type === 'tab')    setTabItems(p => update(p) as SavedTab[]);
    else                                  setProgItems(p => update(p) as SavedProgression[]);
    setRenaming(null);
  };

  if (authLoading) return <p style={{ color: T.textDim, fontSize: 12, textAlign: 'center', padding: 30 }}>Loading…</p>;

  if (!configured) {
    return (
      <div style={{ color: T.textMuted, fontSize: 13, lineHeight: 1.6, padding: '24px 4px' }}>
        Accounts aren&apos;t configured. Add your Supabase keys to
        <code style={{ margin: '0 4px', color: T.text }}>.env</code> to enable the library.
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <SignInPrompt onSignIn={() => setAuthOpen(true)} />
        {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
      </>
    );
  }

  if (loading) {
    return <p style={{ color: T.textDim, fontSize: 12, textAlign: 'center', padding: 30 }}>Loading…</p>;
  }

  const cols = desktop ? 3 : 2;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Sticky toolbar */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: 'var(--gc-bg-deep)', paddingBottom: 10,
        borderBottom: `1px solid ${T.border}`,
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        {/* Search */}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="# Search library…"
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '9px 12px', border: `1px solid ${T.border}`,
            borderLeft: '3px solid var(--gc-bar-color)',
            background: T.bgInput, color: T.text, fontSize: 13,
            fontFamily: 'inherit', outline: 'none', borderRadius: 0,
          }}
        />

        {/* Filter + Sort row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Filter chips */}
          <div style={{ display: 'flex', gap: 4 }}>
            {(['all', 'audio', 'tab', 'progression'] as FilterType[]).map(f => {
              const count = f === 'all' ? allItems.length : allItems.filter(x => x.type === f).length;
              return (
                <button key={f} onClick={() => setFilter(f)} style={{
                  padding: '4px 10px', border: `1px solid ${filter === f ? T.secondary : T.border}`,
                  background: filter === f ? T.secondary : T.bgInput,
                  color: filter === f ? '#fff' : T.textMuted,
                  fontSize: 11, fontFamily: 'var(--gc-mono)', letterSpacing: '0.06em',
                  textTransform: 'uppercase', cursor: 'pointer', transition: 'all 0.1s',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  <span>{f === 'all' ? 'All' : TYPE_LABEL[f]}</span>
                  {count > 0 && (
                    <span style={{
                      fontSize: 9, lineHeight: '14px', minWidth: 14, textAlign: 'center',
                      padding: '0 3px', background: filter === f ? 'rgba(255,255,255,0.25)' : T.border,
                      color: filter === f ? '#fff' : T.textDim,
                    }}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Sort */}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 0 }}>
            {(['newest', 'oldest'] as SortOrder[]).map(s => (
              <button key={s} onClick={() => setSort(s)} style={{
                padding: '4px 10px', border: `1px solid ${sort === s ? T.secondary : T.border}`,
                borderRight: s === 'newest' ? 'none' : undefined,
                background: sort === s ? T.secondary : T.bgInput,
                color: sort === s ? '#fff' : T.textMuted,
                fontSize: 11, fontFamily: 'var(--gc-mono)', letterSpacing: '0.06em',
                textTransform: 'uppercase', cursor: 'pointer',
              }}>
                {s === 'newest' ? 'Newest' : 'Oldest'}
              </button>
            ))}
          </div>
        </div>

        {/* Count */}
        <p style={{ ...SECTION, fontSize: 10, color: T.textDim }}>
          {visible.length} item{visible.length !== 1 ? 's' : ''} · {allItems.length} total
        </p>
      </div>

      {/* Empty state */}
      {visible.length === 0 && (
        <div style={{ ...card({ padding: '40px 20px' }), textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 13, color: T.textMuted }}>
            {allItems.length === 0
              ? 'Your library is empty. Save a tab, progression, or audio recording to get started.'
              : 'No items match your search.'}
          </p>
        </div>
      )}

      {/* Card grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: 10,
      }}>
        {visible.map(item => {
          const accent  = TYPE_COLOR[item.type];
          const canOpen = item.type === 'tab' || item.type === 'progression';
          return (
            <div key={item.id} style={{
              ...card({ padding: 0 }),
              borderLeft: `4px solid ${accent}`,
              display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
            }}>
              {/* Card body */}
              <div style={{ padding: '12px 14px', flex: 1 }}>
                {/* Type badge + date */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{
                    fontSize: 9, fontFamily: 'var(--gc-mono)', letterSpacing: '0.1em',
                    textTransform: 'uppercase', color: accent, fontWeight: 700,
                    background: accent + '18', padding: '2px 6px',
                  }}>
                    {TYPE_LABEL[item.type]}
                  </span>
                  <span style={{ fontSize: 10, color: T.textDim, fontFamily: 'var(--gc-mono)' }}>
                    {formatDate(item.created_at)}
                  </span>
                </div>

                {/* Title */}
                <div style={{
                  fontSize: 13, fontWeight: 600, color: T.text,
                  marginBottom: 5, lineHeight: 1.3,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {item.name}
                </div>

                {/* Preview */}
                <div style={{
                  fontSize: 11, color: T.textMuted, lineHeight: 1.5,
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                } as React.CSSProperties}>
                  {item.preview}
                </div>
              </div>

              {/* Action bar */}
              <div style={{
                display: 'flex', gap: 0,
                borderTop: `1px solid ${T.border}`,
              }}>
                {canOpen && (
                  <button onClick={() => handleOpen(item)} style={{
                    flex: 1, padding: '8px 0', fontSize: 11, cursor: 'pointer',
                    border: 'none', borderRight: `1px solid ${T.border}`,
                    background: T.bgInput, color: T.textMuted,
                    fontFamily: 'inherit', letterSpacing: '0.04em',
                    transition: 'background 0.1s',
                  }}>
                    Open
                  </button>
                )}
                <button onClick={() => setRenaming({ id: item.id, name: item.name, type: item.type })} style={{
                  flex: 1, padding: '8px 0', fontSize: 11, cursor: 'pointer',
                  border: 'none', borderRight: `1px solid ${T.border}`,
                  background: T.bgInput, color: T.textMuted,
                  fontFamily: 'inherit', letterSpacing: '0.04em',
                }}>
                  Rename
                </button>
                <button onClick={() => handleDelete(item)} style={{
                  flex: 1, padding: '8px 0', fontSize: 11, cursor: 'pointer',
                  border: 'none', background: T.bgInput, color: T.textMuted,
                  fontFamily: 'inherit', letterSpacing: '0.04em',
                  transition: 'background 0.1s',
                }}>
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {renaming && (
        <RenameDialog
          initial={renaming.name}
          onSave={doRename}
          onCancel={() => setRenaming(null)}
        />
      )}
    </div>
  );
};
