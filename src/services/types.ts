import type { ChordInProgression } from '../types/music';

export interface Profile {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  last_seen_at: string;
}

export interface AudioTab {
  id: string;
  user_id: string;
  name: string;
  original_audio_url: string | null;
  tab_content: string | null;
  duration_seconds: number | null;
  created_at: string;
  updated_at: string;
}

/** Mirrors the Tab Builder's TabState shape stored in `content`. */
export interface TabContent {
  title: string;
  subtitle: string;
  grid: { fret: string; tech?: string }[][];
  bars: number[];
}

export interface SavedTab {
  id: string;
  user_id: string;
  name: string;
  content: TabContent;
  tempo: number | null;
  music_key: string | null;
  created_at: string;
  updated_at: string;
}

export interface SavedProgression {
  id: string;
  user_id: string;
  name: string;
  chords: ChordInProgression[];
  detected_key: string | null;
  created_at: string;
  updated_at: string;
}
