import React, { useEffect, useState } from 'react';
import { T } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { savedHarmonizations } from '../../services/workspace';
import type { SavedHarmonization, HarmonizationResult } from '../../services/types';
import { requestOpenHarmonization } from '../../services/handoff';
import { ItemMenu } from './ItemMenu';
import { EmptyState, RenameDialog, Tile, Tag } from './shared';
import { matches, formatDate, TILE_GRID, TILE_GRID_DESKTOP } from './library';

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

const STYLE_LABEL: Record<string, string> = {
  melodic: 'Melodic', '3rds': '3rds', chordmelody: 'Chord-Melody',
};

export const Harmonizations: React.FC<{ desktop?: boolean; query?: string; onCount?: (n: number) => void }> = ({ desktop, query, onCount }) => {
  const { user } = useAuth();
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

  if (loading) return <p style={{ color: T.textDim, fontSize: 12, textAlign: 'center', padding: 20 }}>Loading…</p>;
  if (items.length === 0) return (
    <EmptyState title="No harmonizations yet"
      hint="Harmonize a melody at Harmonize (L1) and save it to your library to see it here." />
  );

  const open = (it: SavedHarmonization) => {
    requestOpenHarmonization({
      melody: it.melody, result: it.result,
      scale: it.scale, styles: it.styles ?? [], bpm: it.bpm,
    });
  };

  const remove = async (it: SavedHarmonization) => {
    if (!confirm(`Delete "${it.name}"?`)) return;
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

  const shown = items.filter(it => matches(`${it.name} ${it.scale ?? ''} ${(it.styles ?? []).join(' ')}`, query));
  if (!shown.length) return <EmptyState title="Nothing matches" hint="Try another word, or clear the search." />;

  return (
    <div style={desktop ? TILE_GRID_DESKTOP : TILE_GRID}>
      {shown.map(it => (
        <Tile key={it.id} line="L1" type="Harmonization" name={it.name} date={formatDate(it.updated_at)}
          action={{ label: 'Open in Harmonizer', onClick: () => open(it) }}
          menu={<ItemMenu items={[
            { label: 'Open in Harmonizer', onClick: () => open(it) },
            { label: 'Rename',             onClick: () => setRenaming(it) },
            { label: 'Duplicate',          onClick: () => duplicate(it) },
            { label: 'Export PDF',         onClick: () => exportPdf(it) },
            { label: 'Export MIDI',        onClick: async () => { const { grid } = resultToTab(it); const { exportTabMidi } = await import('../../utils/midiExport'); exportTabMidi(grid, it.name); } },
            { label: 'Delete',             onClick: () => remove(it), danger: true },
          ]} />}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {it.scale && <Tag>{it.scale}</Tag>}
            {(it.styles ?? []).map(s => <Tag key={s}>{STYLE_LABEL[s] ?? s}</Tag>)}
            {it.bpm ? <Tag>{it.bpm} BPM</Tag> : null}
            {chordCount(it.result) > 0 && <Tag>{chordCount(it.result)} chords</Tag>}
          </div>
        </Tile>
      ))}

      {renaming && (
        <RenameDialog initial={renaming.name} onSave={doRename} onCancel={() => setRenaming(null)} />
      )}
    </div>
  );
};

