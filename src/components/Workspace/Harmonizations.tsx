import React, { useEffect, useState } from 'react';
import { useLang } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { savedHarmonizations } from '../../services/workspace';
import type { SavedHarmonization, HarmonizationResult } from '../../services/types';
import { requestOpenHarmonization } from '../../services/handoff';
import { ItemMenu } from './ItemMenu';
import { EmptyState, Loading, RenameDialog, Tile, Tag } from './shared';
import { matches, formatDate, libWords, TILE_GRID, TILE_GRID_DESKTOP } from './library';

// Compact a saved arrangement's sparse slot columns into a printable
// 6-row grid + bar positions — same collapse the Harmonizer's result view
// does (SLOT_MULT spacing exists only for the AI's benefit).
const STRS = ['e', 'B', 'G', 'D', 'A', 'E'];
const ROW_OF: Record<string, number> = { e: 0, B: 1, G: 2, D: 3, A: 4, E: 5 };
const SLOT_MULT = 4;

function resultToTab(item: SavedHarmonization): { grid: { fret: string; tech?: string }[][]; bars: number[] } {
  const sorted = [...(item.result?.columns ?? [])].sort((a, b) => a.col - b.col);
  const width = Math.max(sorted.length, 1);
  const grid = STRS.map(() => Array.from({ length: width }, () => ({ fret: '' } as { fret: string; tech?: string })));
  sorted.forEach((c, i) => {
    for (const n of c.notes) {
      const row = ROW_OF[n.str];
      if (row === undefined) continue;
      grid[row][i] = n.tech ? { fret: String(n.fret), tech: n.tech } : { fret: String(n.fret) };
    }
  });
  const slots = sorted.map(c => c.col);
  const bars = [...new Set(
    (item.melody?.bars ?? []).map(b => {
      const target = b * SLOT_MULT;
      let idx = -1;
      for (let i = 0; i < slots.length && slots[i] <= target; i++) idx = i;
      return idx;
    }).filter(i => i >= 0),
  )].sort((a, b) => a - b);
  return { grid, bars };
}

function chordCount(result: HarmonizationResult | null | undefined): number {
  return (result?.columns ?? []).filter(c =>
    c.notes.some(n => !n.added) && c.notes.some(n => n.added),
  ).length;
}

const STYLE_LABEL: Record<string, { en: string; he: string }> = {
  melodic: { en: 'Melodic', he: 'מלודי' }, '3rds': { en: '3rds', he: 'טרצות' }, chordmelody: { en: 'Chord-melody', he: 'אקורד-מלודיה' },
};

export const Harmonizations: React.FC<{ desktop?: boolean; query?: string; onCount?: (n: number) => void }> = ({ desktop, query, onCount }) => {
  const { user } = useAuth();
  const { lang } = useLang();
  const he = lang === 'he';
  const w = libWords(he);
  const [items, setItems]       = useState<SavedHarmonization[]>([]);
  const [loading, setLoading]   = useState(true);
  const [renaming, setRenaming] = useState<SavedHarmonization | null>(null);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    savedHarmonizations.list(user.id)
      .then(setItems)
      .catch(e => console.warn('load saved_harmonizations', e))
      .finally(() => setLoading(false));
  }, [user]);

  // Report the count to the Library's filter pills.
  useEffect(() => { if (!loading) onCount?.(items.length); }, [items, loading, onCount]);

  if (loading) return <Loading />;
  if (items.length === 0) return (
    <EmptyState title={he ? 'עוד אין הרמוניות שמורות' : 'No harmonizations yet'}
      hint={he ? 'הוסיפו הרמוניה למלודיה ושמרו אותה לספרייה, והיא תופיע כאן.' : 'Harmonize a melody and save it to your library to see it here.'} />
  );

  const open = (it: SavedHarmonization) => {
    requestOpenHarmonization({
      melody: it.melody, result: it.result,
      scale: it.scale, styles: it.styles ?? [], bpm: it.bpm,
    });
  };

  const remove = async (it: SavedHarmonization) => {
    if (!confirm(w.confirmDelete(it.name))) return;
    await savedHarmonizations.remove(it.id);
    setItems(prev => prev.filter(x => x.id !== it.id));
  };

  const duplicate = async (it: SavedHarmonization) => {
    if (!user) return;
    const copy = await savedHarmonizations.duplicate(user.id, it);
    setItems(prev => [copy, ...prev]);
  };

  const doRename = async (name: string) => {
    if (!renaming) return;
    await savedHarmonizations.rename(renaming.id, name);
    setItems(prev => prev.map(x => x.id === renaming.id ? { ...x, name } : x));
    setRenaming(null);
  };

  const exportPdf = async (it: SavedHarmonization) => {
    const { grid, bars } = resultToTab(it);
    const { exportTabPDF } = await import('../../utils/pdfExport');
    await exportTabPDF(it.name, it.result?.analysis ?? '', grid, bars, STRS, 20);
  };

  const openL = he ? 'פתיחה בהרמוניה למלודיה' : 'Open in Harmonize';
  const shown = items.filter(it => matches(`${it.name} ${it.scale ?? ''} ${(it.styles ?? []).join(' ')}`, query));
  if (!shown.length) return <EmptyState title={w.noMatchTitle} hint={w.noMatchHint} />;

  return (
    <div style={desktop ? TILE_GRID_DESKTOP : TILE_GRID}>
      {shown.map(it => (
        <Tile key={it.id} type={he ? 'הרמוניה' : 'Harmonization'} name={it.name} date={formatDate(it.updated_at, he)}
          action={{ label: openL, onClick: () => open(it) }}
          menu={<ItemMenu items={[
            { label: openL, onClick: () => open(it) },
            { label: w.rename,             onClick: () => setRenaming(it) },
            { label: w.duplicate,          onClick: () => duplicate(it) },
            { label: w.pdf,         onClick: () => exportPdf(it) },
            { label: w.midi,        onClick: async () => { const { grid } = resultToTab(it); const { exportTabMidi } = await import('../../utils/midiExport'); exportTabMidi(grid, it.name); } },
            { label: w.del,             onClick: () => remove(it), danger: true },
          ]} />}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {it.scale && <Tag>{it.scale}</Tag>}
            {(it.styles ?? []).map(s => <Tag key={s}>{STYLE_LABEL[s]?.[lang] ?? s}</Tag>)}
            {it.bpm ? <Tag>{it.bpm} BPM</Tag> : null}
            {chordCount(it.result) > 0 && <Tag>{he ? `${chordCount(it.result)} אקורדים` : `${chordCount(it.result)} chords`}</Tag>}
          </div>
        </Tile>
      ))}

      {renaming && (
        <RenameDialog initial={renaming.name} onSave={doRename} onCancel={() => setRenaming(null)} />
      )}
    </div>
  );
};

