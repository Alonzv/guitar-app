import type { CSSProperties } from 'react';

// Library helpers shared by the sections.

/** The search pill's filter: every word appears in the item's text. */
export function matches(text: string, query: string | undefined): boolean {
  const words = (query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const t = text.toLowerCase();
  return words.every(w => t.includes(w));
}

/** The tile grid: two up on a phone, more as the column widens. */
export const TILE_GRID: CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 156px), 1fr))', gap: 10,
};
export const TILE_GRID_DESKTOP: CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12,
};

export function formatDate(iso: string, he = false): string {
  const d = new Date(iso);
  const now = new Date();
  const loc = he ? 'he-IL' : undefined;
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return `${he ? 'היום' : 'Today'}, ${d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' })}`;
  return d.toLocaleDateString(loc, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** The words every section shares: its menu, the delete question, no matches. */
export function libWords(he: boolean) {
  return {
    rename:    he ? 'שינוי שם' : 'Rename',
    duplicate: he ? 'שכפול' : 'Duplicate',
    pdf:       he ? 'ייצוא PDF' : 'Export PDF',
    midi:      he ? 'ייצוא MIDI' : 'Export MIDI',
    del:       he ? 'מחיקה' : 'Delete',
    confirmDelete: (name: string) => he ? `למחוק את "${name}"?` : `Delete "${name}"?`,
    noMatchTitle: he ? 'לא נמצא כלום' : 'Nothing matches',
    noMatchHint:  he ? 'נסו מילה אחרת, או נקו את החיפוש.' : 'Try another word, or clear the search.',
  };
}
