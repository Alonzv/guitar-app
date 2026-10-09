import { useEffect, useState } from 'react';
import { onNotes, type NoteEvent } from '../utils/audioPlayback';

// ── What is sounding right now ───────────────────────────────────────────────
// Follows the note bus in utils/audioPlayback and keeps the notes that are
// ringing at this moment, so a fretboard can light each dot as it plays.

export interface Sounding {
  /** A pitch is sounding (any source). */
  midi: (m: number) => boolean;
  /** A fretted note is sounding — optionally only as part of a given shape. */
  pos: (string: number, fret: number, shape?: string) => boolean;
  /** Any note of this shape is sounding. */
  shape: (key: string) => boolean;
}

export function useSounding(): Sounding {
  const [active, setActive] = useState<NoteEvent[]>([]);

  useEffect(() => {
    const timers = new Set<number>();
    const later = (fn: () => void, ms: number) => {
      const id = window.setTimeout(() => { timers.delete(id); fn(); }, ms);
      timers.add(id);
    };
    const off = onNotes(events => {
      for (const e of events) {
        later(() => {
          setActive(a => [...a, e]);
          later(() => setActive(a => a.filter(x => x !== e)), e.durMs);
        }, e.delayMs);
      }
    });
    return () => { off(); timers.forEach(clearTimeout); };
  }, []);

  return {
    midi: m => active.some(e => e.midi === m),
    pos: (s, f, shape) => active.some(e => e.pos?.string === s && e.pos.fret === f && (!shape || e.shape === shape)),
    shape: key => active.some(e => e.shape === key),
  };
}
