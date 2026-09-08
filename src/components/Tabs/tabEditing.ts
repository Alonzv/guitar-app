import { useCallback } from 'react';

// ── Tab editing model ────────────────────────────────────────────────────────
// Tab Builder and the melody harmoniser both edit a six-row fret grid, and both
// did it with their own copy of the same rules — the cell shape, the empty-grid
// builder, the two-digit fret rule, the cell metrics, and a key map that was
// identical apart from one extra binding. A change to how editing feels had to
// be made twice, and drift between them would be invisible.
//
// The rules live here. What each tool still owns is its own layout and its own
// history, because those genuinely differ: the builder has zoom, staff lines,
// titles and PDF export; the harmoniser has anchors and columns tied to
// harmonisation slots.

export type Tech = 'h' | 'p' | '/' | '\\' | 'b' | '~';

export interface TabCell { fret: string; tech?: Tech }

/** Display order, high e first — row 0 is the top line of a tab. */
export const STR_ROWS: string[] = ['e', 'B', 'G', 'D', 'A', 'E'];

/** Cell metrics at 100%. Tab Builder scales these by its zoom. */
export const BASE_CW = 28;
export const BASE_CH = 30;
export const BASE_FS = 13;
export const circleDiameter = (ch: number) => Math.round(ch * 0.72);

export function emptyGrid<C extends TabCell>(cols: number, make: () => C): C[][] {
  return STR_ROWS.map(() => Array.from({ length: cols }, make));
}

/**
 * The two-digit fret rule: a second digit extends a one-digit fret while the
 * pair stays a reachable fret, otherwise it starts the number over. Typing
 * 1 then 2 gives 12; typing 9 then 9 gives 9.
 */
export function nextFret(current: string, digit: string): string {
  return current.length === 1 && parseInt(current + digit, 10) <= 24
    ? current + digit
    : digit;
}

/** The keys both editors answer to. `undefined` means "not an editing key". */
export const TECH_KEYS: Tech[] = ['h', '/', 'b', '~'];

export interface TabEditingOptions {
  /** Selected [string row, column], or null when nothing is selected. */
  sel: [number, number] | null;
  setSel: (s: [number, number] | null) => void;
  numCols: number;
  applyDigit: (digit: string) => void;
  /** Empty the selected cell — each tool clears its own extra fields. */
  clearCell: (s: number, c: number) => void;
  /** Toggle a technique on the selection and advance a column. */
  applyTech: (t: Tech) => void;
  /** Toggle a bar line at the selected column. */
  toggleBar: (c: number) => void;
  undo: () => void;
  onEscape?: () => void;
  /** Tool-specific single-key bindings, e.g. the harmoniser's 'a' for anchor. */
  extraKeys?: Record<string, () => void>;
}

interface EditKeyEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  preventDefault: () => void;
}

/**
 * The shared key map, used by both the desktop window listener and the hidden
 * mobile input that opens the numeric keyboard.
 */
export function useTabEditing(o: TabEditingOptions) {
  const {
    sel, setSel, numCols, applyDigit, clearCell, applyTech,
    toggleBar, undo, onEscape, extraKeys,
  } = o;

  return useCallback((e: EditKeyEvent) => {
    if (!sel) return;
    const [s, c] = sel;

    if (e.key >= '0' && e.key <= '9') {
      e.preventDefault();
      applyDigit(e.key);
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      clearCell(s, c);
    } else if (e.key === 'ArrowRight' || e.key === 'Tab') {
      e.preventDefault();
      if (c + 1 < numCols) setSel([s, c + 1]);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (c > 0) setSel([s, c - 1]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (s < STR_ROWS.length - 1) setSel([s + 1, c]);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (s > 0) setSel([s - 1, c]);
    } else if (e.key === 'Escape') {
      setSel(null);
      onEscape?.();
    } else if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if ((TECH_KEYS as string[]).includes(e.key)) {
      e.preventDefault();
      applyTech(e.key as Tech);
    } else if (e.key === '|') {
      e.preventDefault();
      toggleBar(c);
    } else if (extraKeys?.[e.key.toLowerCase()]) {
      e.preventDefault();
      extraKeys[e.key.toLowerCase()]();
    }
  }, [sel, setSel, numCols, applyDigit, clearCell, applyTech, toggleBar, undo, onEscape, extraKeys]);
}
