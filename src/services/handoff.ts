import type { TabContent, HarmonizationMelody, HarmonizationResult, VoicingPathData, ReharmData } from './types';

// ── Tab Builder handoff ─────────────────────────────────────────────────────
// Lets the Workspace "Open in Builder" action push a saved tab into the live
// Tab Builder, even though they live in different parts of the tree. ToolsTab
// listens so it can switch to the Tab Builder sub-tab; TabBuilder consumes the
// payload on mount (or live, if already mounted).

let pendingTab: TabContent | null = null;
type Cb = () => void;
const subs = new Set<Cb>();

export function requestOpenTabInBuilder(content: TabContent) {
  pendingTab = content;
  subs.forEach(s => s());
}

export function hasPendingTab(): boolean {
  return pendingTab !== null;
}

export function consumePendingTab(): TabContent | null {
  const t = pendingTab;
  pendingTab = null;
  return t;
}

export function subscribeHandoff(cb: Cb): () => void {
  subs.add(cb);
  return () => { subs.delete(cb); };
}

// ── Melody Harmonizer handoff ────────────────────────────────────────────────
// Same pattern, separate channel: the Library's "Open in Harmonizer" pushes a
// saved harmonization here; App's subscription navigates to VOICINGS →
// Harmonize, and MelodyHarmonizerTab consumes the payload on mount (or live).

export interface HarmonizationHandoff {
  melody: HarmonizationMelody;
  result: HarmonizationResult;
  scale: string | null;
  styles: string[];
  bpm: number | null;
}

let pendingHarmonization: HarmonizationHandoff | null = null;
const harmSubs = new Set<Cb>();

export function requestOpenHarmonization(h: HarmonizationHandoff) {
  pendingHarmonization = h;
  harmSubs.forEach(s => s());
}

export function consumePendingHarmonization(): HarmonizationHandoff | null {
  const h = pendingHarmonization;
  pendingHarmonization = null;
  return h;
}

export function subscribeHarmonizationHandoff(cb: Cb): () => void {
  harmSubs.add(cb);
  return () => { harmSubs.delete(cb); };
}

// ── VOICINGS handoff (Paths / Reharm) ────────────────────────────────────────
// Library "Open in Paths" / "Open in Reharm" pushes a payload here. App's
// subscription (which receives the payload) navigates to VOICINGS + the right
// sub-tab; VoicingsTab consumes it to restore the progression, filters, the
// selected path, and — for reharms — the saved AI result.

export interface VoicingsHandoff {
  sub: 'paths' | 'reharmonize';
  chords: string[];
  settings?: { genre?: string; mode?: string; stringGroup?: string };
  /** paths: label of the saved path to re-select once paths recompute. */
  pathLabel?: string;
  /** reharm: the saved AI result + its inputs. */
  reharm?: { result: ReharmData; genre?: string | null; tension?: number | null };
}

// Re-exported for consumers' convenience.
export type { VoicingPathData };

let pendingVoicings: VoicingsHandoff | null = null;
const voicingsSubs = new Set<(h: VoicingsHandoff) => void>();

export function requestOpenVoicings(h: VoicingsHandoff) {
  pendingVoicings = h;
  voicingsSubs.forEach(s => s(h));
}

export function consumePendingVoicings(): VoicingsHandoff | null {
  const h = pendingVoicings;
  pendingVoicings = null;
  return h;
}

export function subscribeVoicingsHandoff(cb: (h: VoicingsHandoff) => void): () => void {
  voicingsSubs.add(cb);
  return () => { voicingsSubs.delete(cb); };
}
