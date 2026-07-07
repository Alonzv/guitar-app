import React, { useEffect, useState } from 'react';
import { T, card } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { savedHarmonizations } from '../../services/workspace';
import type { SavedHarmonization, HarmonizationResult } from '../../services/types';
import { requestOpenHarmonization } from '../../services/handoff';
import { ItemMenu } from './ItemMenu';
import { EmptyState, RenameDialog, formatDate } from './shared';

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

export const Harmonizations: React.FC<{ desktop?: boolean }> = ({ desktop }) => {
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

  if (loading) return <p style={{ color: T.textDim, fontSize: 12, textAlign: 'center', padding: 20 }}>Loading…</p>;
  if (items.length === 0) return (
    <EmptyState icon="♬" title="No harmonizations yet"
      hint="Harmonize a melody in Voicings → Harmonize and save it to your library to see it here." />
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

  return (
    <div style={{ display: 'grid', gridTemplateColumns: desktop ? 'repeat(3, 1fr)' : 'repeat(auto-fill, minmax(150px, 1fr))', gap: desktop ? 14 : 8 }}>
      {items.map(it => (
        <div key={it.id} style={{ ...card({ padding: '12px 12px 10px' }), display: 'flex', flexDirection: 'column', gap: 8, borderLeft: `4px solid ${T.brandAccent}` }}>
          {desktop && <div style={{ fontSize: 9, color: '#9C958C', fontFamily: 'var(--gc-mono)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>Harmonization</div>}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 4 }}>
            <div style={{ fontSize: 14, color: T.text, fontWeight: 500, lineHeight: 1.25, overflow: 'hidden' }}>
              {it.name}
            </div>
            <ItemMenu items={[
              { label: 'Open in Harmonizer', icon: '↗', onClick: () => open(it) },
              { label: 'Rename',             icon: '✎', onClick: () => setRenaming(it) },
              { label: 'Duplicate',          icon: '⧉', onClick: () => duplicate(it) },
              { label: 'Export PDF',         icon: '⤓', onClick: () => exportPdf(it) },
              { label: 'Export MIDI',        icon: '⤓', onClick: async () => { const { grid } = resultToTab(it); const { exportTabMidi } = await import('../../utils/midiExport'); exportTabMidi(grid, it.name); } },
              { label: 'Delete',             icon: '', onClick: () => remove(it), danger: true },
            ]} />
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {it.scale && <Tag>{it.scale}</Tag>}
            {(it.styles ?? []).map(s => <Tag key={s}>{STYLE_LABEL[s] ?? s}</Tag>)}
            {it.bpm ? <Tag>{it.bpm} BPM</Tag> : null}
            {chordCount(it.result) > 0 && <Tag>{chordCount(it.result)} chords</Tag>}
          </div>

          <div style={{ fontSize: 11, color: T.textDim, marginTop: 'auto' }}>{formatDate(it.updated_at)}</div>

          <button onClick={() => open(it)} style={{
            width: '100%', padding: '8px 0', borderRadius: 0, cursor: 'pointer',
            background: T.primary, color: T.white, border: 'none',
            fontSize: 11.5, fontFamily: 'inherit', fontWeight: 400,
            textTransform: 'uppercase', letterSpacing: '-0.02em',
            borderLeft: '3px solid var(--gc-bar-color)',
          }}>Open in Harmonizer</button>
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
