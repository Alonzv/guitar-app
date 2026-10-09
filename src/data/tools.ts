// ── Tool catalog ─────────────────────────────────────────────────────────────
// Every tool in the app once, by what it does for you. The command palette
// searches it and the tools map lays it out; both navigate through
// services/navigate. `ask` lists the questions a player would type to find
// the tool — in either language — so "which chord is this" lands on By Ear
// even though those words appear nowhere on its tab.

export interface ToolEntry {
  id: string;            // `${panel}:${sub}` — the help topic too
  tab: number;           // index into PANEL_TITLES
  sub: string;
  name: { en: string; he: string };
  does: { en: string; he: string };
  ask: string[];
}

export const PANEL_NAMES: { en: string; he: string }[] = [
  { en: 'Chords',    he: 'אקורדים' },
  { en: 'Scales',    he: 'סולמות' },
  { en: 'Intervals', he: 'אינטרוולים' },
  { en: 'Voicings',  he: 'ווקאינגים' },
  { en: 'Tools',     he: 'כלים' },
];

export const TOOLS: ToolEntry[] = [
  // ── CHORDS ────────────────────────────────────────────────────────────────
  { id: 'chords:finder', tab: 0, sub: 'finder',
    name: { en: 'By Name', he: 'לפי שם' },
    does: { en: 'Pick a chord and see every way to play it', he: 'בוחרים אקורד ורואים את כל הדרכים לנגן אותו' },
    ask: ['chord', 'how to play', 'shape', 'voicing', 'fingering', 'אקורד', 'איך מנגנים', 'אצבוע', 'צורה'] },
  { id: 'chords:builder', tab: 0, sub: 'builder',
    name: { en: 'By Ear', he: 'לפי אוזן' },
    does: { en: 'Put notes on the neck and find out which chord it is', he: 'מניחים תווים על הצוואר ומגלים איזה אקורד זה' },
    ask: ['which chord is this', 'identify', 'name this chord', 'what chord', 'איזה אקורד זה', 'זיהוי', 'לזהות', 'מה האקורד'] },
  { id: 'chords:target', tab: 0, sub: 'target',
    name: { en: 'Target Note', he: 'תו מטרה' },
    does: { en: 'Find chords that contain a note you want to hit', he: 'מוצאים אקורדים שמכילים תו שרוצים לפגוע בו' },
    ask: ['melody note', 'chord with note', 'contains', 'top note', 'תו מלודיה', 'אקורד עם תו', 'מכיל'] },
  { id: 'chords:extensions', tab: 0, sub: 'extensions',
    name: { en: 'Extensions', he: 'הרחבות' },
    does: { en: 'What every chord in a key becomes with 7ths, 9ths, 11ths, 13ths', he: 'מה כל אקורד בסולם הופך להיות עם 7, 9, 11, 13' },
    ask: ['7th', '9th', 'maj7', 'diatonic', 'chords in key', 'jazz chords', 'ספטאקורד', 'אקורדים בסולם', 'הרחבה'] },
  { id: 'chords:practice', tab: 0, sub: 'practice',
    name: { en: 'Chord Practice', he: 'תרגול אקורדים' },
    does: { en: 'Spell chords and recognise them by ear', he: 'מאייתים אקורדים ומזהים אותם בשמיעה' },
    ask: ['quiz', 'train', 'exercise', 'ear training', 'חידון', 'תרגול', 'אימון שמיעה'] },

  // ── SCALES ────────────────────────────────────────────────────────────────
  { id: 'scales:explorer', tab: 1, sub: 'explorer',
    name: { en: 'Scale Explorer', he: 'מגלה הסולמות' },
    does: { en: 'See any scale or mode across the whole neck', he: 'רואים כל סולם או מודוס על כל הצוואר' },
    ask: ['scale', 'mode', 'pentatonic', 'dorian', 'solo', 'improvise', 'סולם', 'מודוס', 'פנטטוני', 'סולו', 'אלתור'] },
  { id: 'scales:triads', tab: 1, sub: 'triads',
    name: { en: 'Triads', he: 'טריאדות' },
    does: { en: 'Every triad shape on every string set', he: 'כל צורות הטריאדה על כל קבוצת מיתרים' },
    ask: ['triad', 'inversion', 'three notes', 'string set', 'טריאדה', 'היפוך', 'שלושה תווים'] },
  { id: 'scales:wheel', tab: 1, sub: 'wheel',
    name: { en: 'Chord Wheel', he: 'גלגל האקורדים' },
    does: { en: 'The circle of fifths — every key and its chords', he: 'מעגל החמישיות — כל סולם והאקורדים שלו' },
    ask: ['circle of fifths', 'key', 'chords that go together', 'progression', 'מעגל החמישיות', 'סולם', 'אקורדים שמתאימים יחד', 'מהלך'] },
  { id: 'scales:practice', tab: 1, sub: 'practice',
    name: { en: 'Scale Practice', he: 'תרגול סולמות' },
    does: { en: 'Spell scales and recognise them by ear', he: 'מאייתים סולמות ומזהים אותם בשמיעה' },
    ask: ['quiz', 'train', 'exercise', 'חידון', 'תרגול'] },

  // ── INTERVALS ─────────────────────────────────────────────────────────────
  { id: 'intervals:explore', tab: 2, sub: 'explore',
    name: { en: 'Explore Intervals', he: 'חקירת אינטרוולים' },
    does: { en: 'What any interval looks and sounds like', he: 'איך כל אינטרוול נראה ונשמע' },
    ask: ['interval', 'distance', 'third', 'fifth', 'אינטרוול', 'מרווח', 'טרצה', 'קווינטה'] },
  { id: 'intervals:measure', tab: 2, sub: 'measure',
    name: { en: 'Measure', he: 'מדידה' },
    does: { en: 'Tap two notes and get the distance between them', he: 'נוגעים בשני תווים ומקבלים את המרחק ביניהם' },
    ask: ['distance between', 'how far', 'ruler', 'מרחק', 'כמה רחוק'] },
  { id: 'intervals:inchord', tab: 2, sub: 'inchord',
    name: { en: 'Intervals in a Chord', he: 'אינטרוולים באקורד' },
    does: { en: 'Why a chord sounds the way it does', he: 'למה אקורד נשמע כמו שהוא נשמע' },
    ask: ['inside chord', 'chord tones', 'why does it sound', 'בתוך אקורד', 'למה נשמע'] },
  { id: 'intervals:practice', tab: 2, sub: 'practice',
    name: { en: 'Ear Training', he: 'אימון שמיעה' },
    does: { en: 'Hear two notes, name the interval', he: 'שומעים שני תווים ומזהים את האינטרוול' },
    ask: ['ear', 'listen', 'quiz', 'train', 'אוזן', 'שמיעה', 'חידון'] },

  // ── VOICINGS ──────────────────────────────────────────────────────────────
  { id: 'voicings:voiceleading', tab: 3, sub: 'voiceleading',
    name: { en: 'Voice Leading', he: 'הולכת קולות' },
    does: { en: 'Make chord changes move smoothly, voice by voice', he: 'מעברי אקורדים חלקים, קול אחרי קול' },
    ask: ['smooth', 'transitions', 'voice leading', 'SATB', 'מעברים', 'חלק', 'הולכת קולות'] },
  { id: 'voicings:harmonizer', tab: 3, sub: 'harmonizer',
    name: { en: 'Harmonize a Melody', he: 'הרמוניה למלודיה' },
    does: { en: 'Write a melody, get chords and harmony under it', he: 'כותבים מלודיה ומקבלים אקורדים והרמוניה מתחתיה' },
    ask: ['melody', 'harmony', 'chords for melody', 'chord melody', 'מלודיה', 'הרמוניה', 'אקורדים למנגינה'] },
  { id: 'voicings:reharmonize', tab: 3, sub: 'reharmonize',
    name: { en: 'Reharmonize', he: 'רה-הרמוניזציה' },
    does: { en: 'Turn a plain progression into a richer one', he: 'הופכים מהלך פשוט לעשיר יותר' },
    ask: ['reharm', 'substitute', 'jazzier', 'richer', 'tritone', 'החלפה', 'ג׳אזי', 'עשיר'] },

  // ── TOOLS ─────────────────────────────────────────────────────────────────
  { id: 'tools:tuner', tab: 4, sub: 'tuner',
    name: { en: 'Tuner', he: 'טיונר' },
    does: { en: 'Tune your guitar with the microphone', he: 'מכוונים את הגיטרה דרך המיקרופון' },
    ask: ['tune', 'tuning', 'out of tune', 'לכוון', 'כיוון', 'מזויף'] },
  { id: 'tools:metronome', tab: 4, sub: 'metronome',
    name: { en: 'Metronome', he: 'מטרונום' },
    does: { en: 'Keep time, tap a tempo', he: 'שומרים על קצב, מקישים טמפו' },
    ask: ['tempo', 'bpm', 'click', 'beat', 'time', 'טמפו', 'קצב', 'קליק'] },
  { id: 'tools:tabbuilder', tab: 4, sub: 'tabbuilder',
    name: { en: 'Tab Builder', he: 'בונה הטאבים' },
    does: { en: 'Write tab, hear it, export it', he: 'כותבים טאב, שומעים אותו ומייצאים' },
    ask: ['write tab', 'tablature', 'riff', 'notation', 'pdf', 'לכתוב טאב', 'טאבים', 'ריף'] },
  { id: 'tools:audiotab', tab: 4, sub: 'audiotab',
    name: { en: 'Audio → Tab', he: 'אודיו לטאב' },
    does: { en: 'Record or upload playing and get it as tab', he: 'מקליטים או מעלים נגינה ומקבלים טאב' },
    ask: ['transcribe', 'record', 'audio', 'recording', 'לתמלל', 'הקלטה', 'אודיו'] },
];

/** Tools ranked against a query — every word must appear somewhere. */
export function searchTools(query: string): ToolEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return TOOLS;
  const scored = TOOLS.map(t => {
    const name = `${t.name.en} ${t.name.he}`.toLowerCase();
    const panel = `${PANEL_NAMES[t.tab].en} ${PANEL_NAMES[t.tab].he}`.toLowerCase();
    const rest = `${t.does.en} ${t.does.he} ${t.ask.join(' ')}`.toLowerCase();
    let score = 0;
    for (const w of words) {
      if (name.startsWith(w)) score += 6;
      else if (name.includes(w)) score += 4;
      else if (t.ask.some(a => a.toLowerCase().startsWith(w))) score += 3;
      else if (panel.includes(w)) score += 2;
      else if (rest.includes(w)) score += 1;
      else return { t, score: 0 };
    }
    // A query that reads like one of the tool's own questions wins outright.
    const phrase = words.join(' ');
    if (t.ask.some(a => a.toLowerCase().includes(phrase))) score += 10;
    return { t, score };
  });
  return scored.filter(x => x.score > 0).sort((a, b) => b.score - a.score).map(x => x.t);
}
