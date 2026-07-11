// ── Ear Training — static content & constants ───────────────────────────────
// The theoretical explanations and aural anchors are HARD-CODED here per the
// product spec: no theory content is generated at runtime. Learn Mode renders
// straight from `INTERVAL_DATA`.

export type Lang = 'he' | 'en';
export type IntervalId =
  | 'm2' | 'M2' | 'm3' | 'M3' | 'P4' | 'TT'
  | 'P5' | 'm6' | 'M6' | 'm7' | 'M7' | 'P8';

export interface IntervalCopy { name: string; desc: string; anchor: string }
export interface IntervalEntry { en: IntervalCopy; he: IntervalCopy }

export const INTERVAL_DATA: Record<IntervalId, IntervalEntry> = {
  m2: {
    en: { name: 'Minor 2nd', desc: '1 fret apart (a half step). The smallest interval — sounds tense and crowded.', anchor: 'Jaws Theme (opening)' },
    he: { name: 'סקונדה קטנה', desc: 'מרחק של סריג אחד (חצי טון). המרווח הקטן ביותר — נשמע מתוח וצפוף.', anchor: 'הפתיחה של מלתעות' },
  },
  M2: {
    en: { name: 'Major 2nd', desc: '2 frets apart (a whole step). The most common step between neighbouring notes in a melody.', anchor: 'Happy Birthday (first two notes)' },
    he: { name: 'סקונדה גדולה', desc: 'מרחק של שני סריגים (טון שלם). הצעד הנפוץ ביותר בין תווים שכנים במלודיה.', anchor: 'יום הולדת שמח (שני התווים הראשונים)' },
  },
  m3: {
    en: { name: 'Minor 3rd', desc: '3 frets apart. The building block of the minor, sad sound.', anchor: 'Seven Nation Army (riff)' },
    he: { name: 'טרצה קטנה', desc: 'מרחק של שלושה סריגים. אבן הבניין של הצליל המינורי והעצוב.', anchor: 'הריף של Seven Nation Army' },
  },
  M3: {
    en: { name: 'Major 3rd', desc: '4 frets apart. The building block of the major, happy sound.', anchor: 'Oh When the Saints (opening)' },
    he: { name: 'טרצה גדולה', desc: 'מרחק של ארבעה סריגים. אבן הבניין של הצליל המז\'ורי והשמח.', anchor: 'הפתיחה של בובה זהבה' },
  },
  P4: {
    en: { name: 'Perfect 4th', desc: '5 frets apart. Stable and open. On the neck: the same fret on the next (higher) string — except when crossing from G to B.', anchor: 'Amazing Grace / Here Comes the Bride' },
    he: { name: 'קוורטה זכה', desc: 'מרחק של חמישה סריגים. יציב ופתוח. על הצוואר: אותו סריג במיתר הבא (הגבוה יותר) — חוץ מהמעבר ממיתר G למיתר B.', anchor: 'התקווה / חתול רחוב' },
  },
  TT: {
    en: { name: 'Tritone', desc: '6 frets apart — splits the octave exactly in half. The most unstable, dissonant interval.', anchor: 'The Simpsons Theme (opening)' },
    he: { name: 'טריטון', desc: 'מרחק של שישה סריגים — מחלק את האוקטבה בדיוק לשני חצאים. המרווח הכי לא יציב וצורם.', anchor: 'הפתיחה של משפחת סימפסון' },
  },
  P5: {
    en: { name: 'Perfect 5th', desc: '7 frets apart. Strong and powerful — the power-chord interval. On the neck: one string up, two frets toward the body.', anchor: 'Star Wars Theme (opening)' },
    he: { name: 'קווינטה זכה', desc: 'מרחק של שבעה סריגים. חזק ועוצמתי — המרווח של פאוור-אקורד. על הצוואר: מיתר אחד למעלה ושני סריגים קדימה.', anchor: 'הפתיחה של מלחמת הכוכבים' },
  },
  m6: {
    en: { name: 'Minor 6th', desc: '8 frets apart. Bittersweet and longing.', anchor: 'The Entertainer (3rd note) / Love Story theme' },
    he: { name: 'סקסטה קטנה', desc: 'מרחק של שמונה סריגים. נשמע נוגה ומלא געגוע.', anchor: 'נעימת הנושא של Love Story' },
  },
  M6: {
    en: { name: 'Major 6th', desc: '9 frets apart. Open, warm and pleasant.', anchor: 'NBC Chimes / My Way' },
    he: { name: 'סקסטה גדולה', desc: 'מרחק של תשעה סריגים. נשמע פתוח, חם ונעים.', anchor: 'הצליל של NBC / My Way' },
  },
  m7: {
    en: { name: 'Minor 7th', desc: '10 frets apart. Bluesy and unresolved — it wants to fall back down.', anchor: 'Star Trek Original Theme (opening)' },
    he: { name: 'ספטימה קטנה', desc: 'מרחק של עשרה סריגים. בלוזי ולא פתור — מרגיש כאילו הוא רוצה לרדת חזרה.', anchor: 'נעימת הפתיחה של מסע בין כוכבים' },
  },
  M7: {
    en: { name: 'Major 7th', desc: '11 frets apart. Very tense — just one fret below the octave.', anchor: 'Take On Me (chorus jump)' },
    he: { name: 'ספטימה גדולה', desc: 'מרחק של אחד-עשר סריגים. מתוח מאוד — סריג אחד בלבד מתחת לאוקטבה.', anchor: 'הקפיצה בפזמון של Take On Me' },
  },
  P8: {
    en: { name: 'Octave', desc: '12 frets apart. The exact same note, one register higher.', anchor: 'Somewhere Over the Rainbow (Some-where)' },
    he: { name: 'אוקטבה', desc: 'מרחק של שנים-עשר סריגים. בדיוק אותו תו, קומה אחת למעלה.', anchor: 'אי שם מעבר לקשת (שני התווים הראשונים)' },
  },
};

/** Interval ids in ascending order with their semitone distance. */
export const INTERVAL_ORDER: IntervalId[] = ['m2', 'M2', 'm3', 'M3', 'P4', 'TT', 'P5', 'm6', 'M6', 'm7', 'M7', 'P8'];

export const SEMITONES: Record<IntervalId, number> = {
  m2: 1, M2: 2, m3: 3, M3: 4, P4: 5, TT: 6, P5: 7, m6: 8, M6: 9, m7: 10, M7: 11, P8: 12,
};

// ── UI strings (component-level HE / EN) ────────────────────────────────────
export interface UIStrings {
  learn: string;
  practice: string;
  pickInterval: string;
  playInterval: string;
  playRoot: string;
  fretsApart: string;
  anchorLabel: string;
  playbackMode: string;
  melodic: string;
  harmonic: string;
  mixed: string;
  direction: string;
  ascending: string;
  descending: string;
  replay: string;
  streak: string;
  bestStreak: string;
  correct: string;
  wrong: string;
  listenPrompt: string;
  clickPrompt: string;
  next: string;
  startPractice: string;
  rootLabel: string;
  answerLabel: string;
  secondNote: string;
  weakSpots: string;
  signInHint: string;
  interval: string;
  accuracy: string;
}

export const UI: Record<Lang, UIStrings> = {
  en: {
    learn: 'Learn',
    practice: 'Practice',
    pickInterval: 'Pick an interval to study',
    playInterval: 'Play interval',
    playRoot: 'Play root',
    fretsApart: 'frets apart',
    anchorLabel: 'Sounds like',
    playbackMode: 'Playback',
    melodic: 'Melodic',
    harmonic: 'Harmonic',
    mixed: 'Mixed',
    direction: 'Direction',
    ascending: 'Ascending',
    descending: 'Descending',
    replay: 'Replay',
    streak: 'Streak',
    bestStreak: 'Best',
    correct: 'Correct!',
    wrong: 'Not quite',
    listenPrompt: 'Listen to the interval',
    clickPrompt: 'Tap the second note on the neck',
    next: 'Next',
    startPractice: 'Start',
    rootLabel: 'Root',
    answerLabel: 'Answer',
    secondNote: 'Second note',
    weakSpots: 'Weak spots',
    signInHint: 'Sign in to save your best streak and personalise practice.',
    interval: 'Interval',
    accuracy: 'Accuracy',
  },
  he: {
    learn: 'לימוד',
    practice: 'תרגול',
    pickInterval: 'בחר אינטרוול ללימוד',
    playInterval: 'נגן אינטרוול',
    playRoot: 'נגן בסיס',
    fretsApart: 'סריגים',
    anchorLabel: 'נשמע כמו',
    playbackMode: 'אופן השמעה',
    melodic: 'מלודי',
    harmonic: 'הרמוני',
    mixed: 'מעורב',
    direction: 'כיוון',
    ascending: 'עולה',
    descending: 'יורד',
    replay: 'השמע שוב',
    streak: 'רצף',
    bestStreak: 'שיא',
    correct: 'נכון!',
    wrong: 'כמעט',
    listenPrompt: 'הקשב לאינטרוול',
    clickPrompt: 'סמן את התו השני על הצוואר',
    next: 'הבא',
    startPractice: 'התחל',
    rootLabel: 'בסיס',
    answerLabel: 'תשובה',
    secondNote: 'התו השני',
    weakSpots: 'נקודות תורפה',
    signInHint: 'התחבר כדי לשמור את השיא שלך ולהתאים אישית את התרגול.',
    interval: 'אינטרוול',
    accuracy: 'דיוק',
  },
};
