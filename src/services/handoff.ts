import type { TabContent } from './types';

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
