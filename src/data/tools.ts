// ── The network: lines and stops ─────────────────────────────────────────────
// ScaleUp is laid out as a transit map. Every tool is a stop; tools that do
// the same kind of work share a line. The map (mobile home, desktop sidebar)
// is drawn from this list, search filters it, and routing is by stop id.
// `ask` holds the questions a player would type to find the stop, in either
// language — "which chord is this" lands on Chord Builder › By ear even though
// those words appear nowhere on it.

export type LineId = 'L1' | 'L2' | 'L3' | 'L4';

export interface Line {
  id: LineId;
  name: { en: string; he: string };
  /** The line's colour token: ink, grey, cobalt. */
  color: string;
  /** Text on the line's colour. */
  onColor: string;
}

export interface Sub { id: string; label: { en: string; he: string }; help: string }

export interface Stop {
  id: string;
  line: LineId;
  name: { en: string; he: string };
  /** A few words under the name on the map. */
  meta: { en: string; he: string };
  ask: string[];
  /** Views inside the stop, shown as pills under its title. */
  subs?: Sub[];
  /** Help topic when the stop has no subs. */
  help?: string;
}

export const LINES: Line[] = [
  { id: 'L1', name: { en: 'Harmony',  he: 'הרמוניה' }, color: 'var(--gc-text)',    onColor: 'var(--gc-white)' },
  { id: 'L2', name: { en: 'Theory',   he: 'תיאוריה' }, color: 'var(--gc-coral)',   onColor: 'var(--gc-bg-deep)' },
  { id: 'L3', name: { en: 'Write',    he: 'כתיבה' },   color: 'var(--gc-primary)', onColor: 'var(--su-on-primary)' },
  { id: 'L4', name: { en: 'Practice', he: 'תרגול' },   color: 'var(--gc-text)',    onColor: 'var(--gc-white)' },
];

export const STOPS: Stop[] = [
  // ── L1 Harmony ────────────────────────────────────────────────────────────
  { id: 'chord-builder', line: 'L1',
    name: { en: 'Chord Builder', he: 'בונה אקורדים' },
    meta: { en: 'by name · by ear', he: 'לפי שם · לפי אוזן' },
    ask: ['chord', 'how to play', 'shape', 'voicing', 'fingering', 'which chord is this', 'identify', 'name this chord',
      'אקורד', 'איך מנגנים', 'אצבוע', 'איזה אקורד זה', 'לזהות'],
    subs: [
      { id: 'name', label: { en: 'By name', he: 'לפי שם' },   help: 'chords:finder' },
      { id: 'ear',  label: { en: 'By ear',  he: 'לפי אוזן' }, help: 'chords:builder' },
    ] },
  { id: 'triads', line: 'L1',
    name: { en: 'Triads', he: 'טריאדות' },
    meta: { en: 'all inversions', he: 'כל ההיפוכים' },
    ask: ['triad', 'inversion', 'string set', 'טריאדה', 'היפוך'], help: 'scales:triads' },
  { id: 'target-note', line: 'L1',
    name: { en: 'Target Note', he: 'תו מטרה' },
    meta: { en: 'chords around a note', he: 'אקורדים סביב תו' },
    ask: ['melody note', 'chord with note', 'top note', 'תו מלודיה', 'אקורד עם תו'], help: 'chords:target' },
  { id: 'voice-leading', line: 'L1',
    name: { en: 'Voice Leading', he: 'הולכת קולות' },
    meta: { en: 'smooth changes', he: 'מעברים חלקים' },
    ask: ['smooth', 'transitions', 'voice leading', 'satb', 'מעברים', 'הולכת קולות'], help: 'voicings:voiceleading' },
  { id: 'harmonize', line: 'L1',
    name: { en: 'Harmonize', he: 'הרמוניה למלודיה' },
    meta: { en: 'chords under a melody', he: 'אקורדים למנגינה' },
    ask: ['melody', 'harmony', 'chords for melody', 'chord melody', 'מלודיה', 'אקורדים למנגינה'], help: 'voicings:harmonizer' },
  { id: 'reharmonize', line: 'L1',
    name: { en: 'Reharmonize', he: 'רה-הרמוניזציה' },
    meta: { en: 'subs · tritones', he: 'החלפות · טריטון' },
    ask: ['reharm', 'substitute', 'jazzier', 'richer', 'tritone', 'החלפה', 'ג׳אזי'], help: 'voicings:reharmonize' },

  // ── L2 Theory ─────────────────────────────────────────────────────────────
  { id: 'scales', line: 'L2',
    name: { en: 'Scales', he: 'סולמות' },
    meta: { en: 'modes · positions', he: 'מודוסים · פוזיציות' },
    ask: ['scale', 'mode', 'pentatonic', 'dorian', 'solo', 'improvise', 'jam', 'סולם', 'מודוס', 'פנטטוני', 'סולו', 'אלתור'],
    help: 'scales:explorer' },
  { id: 'intervals', line: 'L2',
    name: { en: 'Intervals', he: 'אינטרוולים' },
    meta: { en: 'explore · measure', he: 'חקירה · מדידה' },
    ask: ['interval', 'distance', 'third', 'fifth', 'how far', 'אינטרוול', 'מרווח', 'מרחק'],
    subs: [
      { id: 'explore', label: { en: 'Explore',    he: 'חקירה' },     help: 'intervals:explore' },
      { id: 'measure', label: { en: 'Measure',    he: 'מדידה' },     help: 'intervals:measure' },
      { id: 'inchord', label: { en: 'In a chord', he: 'בתוך אקורד' }, help: 'intervals:inchord' },
    ] },
  { id: 'chord-wheel', line: 'L2',
    name: { en: 'Circle of Fifths', he: 'מעגל החמישיות' },
    meta: { en: 'keys · chord wheel', he: 'סולמות · גלגל' },
    ask: ['circle of fifths', 'wheel', 'key', 'chords that go together', 'progression', 'מעגל החמישיות', 'גלגל', 'מהלך'],
    help: 'scales:wheel' },
  { id: 'extensions', line: 'L2',
    name: { en: 'Extensions', he: 'הרחבות' },
    meta: { en: '7 · 9 · 11 · 13', he: '7 · 9 · 11 · 13' },
    ask: ['7th', '9th', 'maj7', 'diatonic', 'chords in key', 'jazz chords', 'ספטאקורד', 'אקורדים בסולם', 'הרחבה'],
    help: 'chords:extensions' },

  // ── L3 Write ──────────────────────────────────────────────────────────────
  { id: 'tab-writer', line: 'L3',
    name: { en: 'Tab Writer', he: 'כתיבת טאבים' },
    meta: { en: 'write · play · export', he: 'כתיבה · נגינה · ייצוא' },
    ask: ['write tab', 'tablature', 'riff', 'notation', 'pdf', 'tab builder', 'לכתוב טאב', 'טאבים', 'ריף'], help: 'tools:tabbuilder' },
  { id: 'audio-tab', line: 'L3',
    name: { en: 'Audio → Tab', he: 'אודיו לטאב' },
    meta: { en: 'record · transcribe', he: 'הקלטה · תמלול' },
    ask: ['transcribe', 'record', 'audio', 'recording', 'לתמלל', 'הקלטה', 'אודיו'], help: 'tools:audiotab' },
  { id: 'library', line: 'L3',
    name: { en: 'Library', he: 'ספרייה' },
    meta: { en: 'your saved work', he: 'מה ששמרתם' },
    ask: ['library', 'saved', 'workspace', 'my tabs', 'my progressions', 'ספרייה', 'שמורים', 'אזור אישי'] },

  // ── L4 Practice ───────────────────────────────────────────────────────────
  { id: 'tuner', line: 'L4',
    name: { en: 'Tuner', he: 'טיונר' },
    meta: { en: 'chromatic', he: 'כרומטי' },
    ask: ['tune', 'tuning', 'out of tune', 'לכוון', 'כיוון', 'מזויף'], help: 'tools:tuner' },
  { id: 'metronome', line: 'L4',
    name: { en: 'Metronome', he: 'מטרונום' },
    meta: { en: 'tap · trainer', he: 'טאפ · מאמן מהירות' },
    ask: ['tempo', 'bpm', 'click', 'beat', 'time', 'טמפו', 'קצב', 'קליק'], help: 'tools:metronome' },
  { id: 'chord-practice', line: 'L4',
    name: { en: 'Chord Practice', he: 'תרגול אקורדים' },
    meta: { en: 'spell · hear', he: 'איות · שמיעה' },
    ask: ['quiz', 'train', 'exercise', 'spell chords', 'חידון', 'תרגול אקורדים'], help: 'chords:practice' },
  { id: 'scale-practice', line: 'L4',
    name: { en: 'Scale Practice', he: 'תרגול סולמות' },
    meta: { en: 'spell · hear', he: 'איות · שמיעה' },
    ask: ['quiz', 'train', 'spell scales', 'חידון', 'תרגול סולמות'], help: 'scales:practice' },
  { id: 'ear-training', line: 'L4',
    name: { en: 'Ear Training', he: 'אימון שמיעה' },
    meta: { en: 'name the interval', he: 'זיהוי אינטרוולים' },
    ask: ['ear', 'listen', 'intervals quiz', 'אוזן', 'שמיעה'], help: 'intervals:practice' },
];

export const DEFAULT_STOP = 'chord-builder';
export const stopById = (id: string): Stop | undefined => STOPS.find(s => s.id === id);
export const lineOf = (stop: Stop): Line => LINES.find(l => l.id === stop.line)!;

/** Stops ranked against a query — every word must appear somewhere. */
export function searchStops(query: string): Stop[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return STOPS;
  const scored = STOPS.map(t => {
    const line = lineOf(t);
    const name = `${t.name.en} ${t.name.he}`.toLowerCase();
    const panel = `${line.name.en} ${line.name.he}`.toLowerCase();
    const subs = (t.subs ?? []).map(s => `${s.label.en} ${s.label.he}`).join(' ').toLowerCase();
    const rest = `${t.meta.en} ${t.meta.he} ${t.ask.join(' ')} ${subs}`.toLowerCase();
    let score = 0;
    for (const w of words) {
      if (name.startsWith(w)) score += 6;
      else if (name.includes(w)) score += 4;
      else if (t.ask.some(a => a.toLowerCase().startsWith(w))) score += 3;
      else if (panel.includes(w)) score += 2;
      else if (rest.includes(w)) score += 1;
      else return { t, score: 0 };
    }
    // A query that reads like one of the stop's own questions wins outright.
    const phrase = words.join(' ');
    if (t.ask.some(a => a.toLowerCase().includes(phrase))) score += 10;
    return { t, score };
  });
  return scored.filter(x => x.score > 0).sort((a, b) => b.score - a.score).map(x => x.t);
}
