import { playMidi, playScale } from '../../utils/audioPlayback';

// ── Learn a scale: the data behind the Key → Feel → Scale funnel ───────────
// Plain words first: every scale is a mood, every degree has a job.

type L = { en: string; he: string };

// Keys in circle-of-fifths order (pitch class: C = 0).
export const FIFTHS: { name: string; pc: number }[] = [
  { name: 'C', pc: 0 }, { name: 'G', pc: 7 }, { name: 'D', pc: 2 }, { name: 'A', pc: 9 },
  { name: 'E', pc: 4 }, { name: 'B', pc: 11 }, { name: 'F♯', pc: 6 }, { name: 'D♭', pc: 1 },
  { name: 'A♭', pc: 8 }, { name: 'E♭', pc: 3 }, { name: 'B♭', pc: 10 }, { name: 'F', pc: 5 },
];
export const keyName = (pc: number) => FIFTHS.find(k => k.pc === ((pc % 12) + 12) % 12)?.name ?? 'A';

export type FeelId = 'pmin' | 'pmaj' | 'minor' | 'major' | 'dorian';

export const FEELS: { id: FeelId; name: L; mood: L; iv: number[] }[] = [
  { id: 'pmin',   name: { en: 'Minor Pentatonic', he: 'פנטטוני מינורי' }, mood: { en: 'Bluesy and forgiving.',      he: 'בלוזי וסלחני.' },        iv: [0, 3, 5, 7, 10] },
  { id: 'pmaj',   name: { en: 'Major Pentatonic', he: 'פנטטוני מז׳ורי' }, mood: { en: 'Bright, open and sweet.',    he: 'בהיר, פתוח ומתוק.' },     iv: [0, 2, 4, 7, 9] },
  { id: 'minor',  name: { en: 'Natural Minor',    he: 'מינור טבעי' },      mood: { en: 'Moody and cinematic.',       he: 'קודר וקולנועי.' },        iv: [0, 2, 3, 5, 7, 8, 10] },
  { id: 'major',  name: { en: 'Major',            he: 'מז׳ור' },           mood: { en: 'Happy and resolved.',        he: 'שמח ושלם.' },             iv: [0, 2, 4, 5, 7, 9, 11] },
  { id: 'dorian', name: { en: 'Dorian',           he: 'דורי' },            mood: { en: 'Minor, with a hopeful lift.', he: 'מינורי, עם ניצוץ של תקווה.' }, iv: [0, 2, 3, 5, 7, 9, 10] },
];
export const feelById = (id: FeelId) => FEELS.find(f => f.id === id) ?? FEELS[0];

// What each degree does, in a sentence.
export const DEGREES: Record<number, { label: string; title: L; role: L }> = {
  0:  { label: '1',  title: { en: 'Root', he: 'טוניקה' },               role: { en: 'Home. Every phrase wants to land here.', he: 'הבית. כל משפט רוצה לנחות כאן.' } },
  1:  { label: '♭2', title: { en: 'Minor second', he: 'סקונדה קטנה' },  role: { en: 'Dark and tense, with a Spanish edge.', he: 'כהה ומתוח, עם נגיעה ספרדית.' } },
  2:  { label: '2',  title: { en: 'Second', he: 'סקונדה' },             role: { en: 'A smooth passing step, open and airy.', he: 'צעד מעבר חלק, פתוח ואוורירי.' } },
  3:  { label: '♭3', title: { en: 'Minor third', he: 'טרצה קטנה' },     role: { en: 'The sad, bluesy color.', he: 'הצבע העצוב והבלוזי.' } },
  4:  { label: '3',  title: { en: 'Major third', he: 'טרצה גדולה' },    role: { en: 'Bright and happy. It makes major sound major.', he: 'בהיר ושמח. זה מה שעושה מז׳ור למז׳ור.' } },
  5:  { label: '4',  title: { en: 'Fourth', he: 'קוורטה' },             role: { en: 'A gentle pull. It wants to move.', he: 'משיכה עדינה. הוא רוצה לזוז.' } },
  6:  { label: '♭5', title: { en: 'Blue note', he: 'התו הכחול' },       role: { en: 'Pure tension. Pass through it, don’t stay.', he: 'מתח טהור. עוברים דרכו, לא נשארים.' } },
  7:  { label: '5',  title: { en: 'Fifth', he: 'קווינטה' },             role: { en: 'Strong and stable, power-chord solid.', he: 'חזק ויציב, כמו פאוור-קורד.' } },
  8:  { label: '♭6', title: { en: 'Minor sixth', he: 'סקסטה קטנה' },    role: { en: 'Moody and cinematic.', he: 'קודר וקולנועי.' } },
  9:  { label: '6',  title: { en: 'Sixth', he: 'סקסטה' },               role: { en: 'Sweet, a little nostalgic.', he: 'מתוק, קצת נוסטלגי.' } },
  10: { label: '♭7', title: { en: 'Minor seventh', he: 'ספטימה קטנה' }, role: { en: 'Laid-back and bluesy.', he: 'רגוע ובלוזי.' } },
  11: { label: '7',  title: { en: 'Major seventh', he: 'ספטימה גדולה' }, role: { en: 'Dreamy. It leans up toward home.', he: 'חלומי. נשען למעלה, אל הבית.' } },
};

// ── One position at a time (standard tuning, low E → high E) ───────────────
const OPEN_PC   = [4, 9, 2, 7, 11, 4];
const OPEN_MIDI = [40, 45, 50, 55, 59, 64];

export interface BoxNote { string: number; fret: number; iv: number; midi: number }
export interface Box { lo: number; hi: number; notes: BoxNote[] }

/** Start on degree `pos` on the low E string and climb the scale, the same
 *  number of notes on every string (2 for pentatonics, 3 otherwise). */
export function scaleBox(rootPc: number, iv: number[], pos: number): Box {
  const perString = iv.length <= 5 ? 2 : 3;
  const rootFret = (rootPc - OPEN_PC[0] + 12) % 12;
  let degree = pos % iv.length;
  let start = rootFret + iv[degree];
  if (start > 14) start -= 12;
  let midi = OPEN_MIDI[0] + start;
  const notes: BoxNote[] = [];
  for (let s = 0; s < 6; s++) {
    for (let k = 0; k < perString; k++) {
      notes.push({ string: s, fret: midi - OPEN_MIDI[s], iv: iv[degree], midi });
      const next = (degree + 1) % iv.length;
      midi += ((iv[next] - iv[degree]) + 12) % 12 || 12;
      degree = next;
    }
  }
  const frets = notes.map(n => n.fret);
  return { lo: Math.min(...frets), hi: Math.max(...frets), notes };
}

// ── Sound ──────────────────────────────────────────────────────────────────
const tonicMidi = (pc: number) => 57 + ((pc - 9 + 12) % 12);   // around A3
export const hearKey   = (pc: number) => playMidi(tonicMidi(pc), 1.1);
export const hearNote  = (midi: number) => playMidi(midi, 0.9);
export const hearScale = (pc: number, iv: number[]) => playScale([...iv, 12].map(i => tonicMidi(pc) + i));
export const hearBox   = (box: Box) => playScale(box.notes.map(n => n.midi));

// ── Where you left off ─────────────────────────────────────────────────────
export interface ScaleSession { key: number; feel: FeelId; pos: number }
const STORE = 'scaleup_learn_scale';
export function loadSession(): ScaleSession | null {
  try { return JSON.parse(localStorage.getItem(STORE) || 'null'); } catch { return null; }
}
export function saveSession(s: ScaleSession) {
  try { localStorage.setItem(STORE, JSON.stringify(s)); } catch { /* storage unavailable */ }
}
