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
    en: { name: 'Minor 2nd', desc: '1 Fret apart. Sounds tense and close.', anchor: 'Jaws Theme' },
    he: { name: 'סקונדה קטנה', desc: 'מרחק של סריג אחד. סאונד מתוח וצפוף.', anchor: 'מנגינת מלתעות' },
  },
  M2: {
    en: { name: 'Major 2nd', desc: '2 Frets apart. A whole step.', anchor: 'Happy Birthday' },
    he: { name: 'סקונדה גדולה', desc: 'מרחק של שני סריגים. טון שלם.', anchor: 'יום הולדת שמח (2 התווים הראשונים)' },
  },
  m3: {
    en: { name: 'Minor 3rd', desc: '3 Frets. The sad/dark building block.', anchor: 'Seven Nation Army (Riff)' },
    he: { name: 'טרצה קטנה', desc: '3 סריגים. הבסיס לסאונד עצוב/מינורי.', anchor: 'הריף של Seven Nation Army' },
  },
  M3: {
    en: { name: 'Major 3rd', desc: '4 Frets. Bright and happy.', anchor: 'Oh When the Saints' },
    he: { name: 'טרצה גדולה', desc: '4 סריגים. הבסיס לסאונד שמח/מז\'ורי.', anchor: 'הפתיחה של בובה זהבה' },
  },
  P4: {
    en: { name: 'Perfect 4th', desc: 'Same fret, exactly one string down (except G to B).', anchor: 'Amazing Grace / Here Comes the Bride' },
    he: { name: 'קוורטה זכה', desc: 'אותו סריג, בדיוק מיתר אחד למטה (למעט מיתר B).', anchor: 'התקווה / חתול רחוב' },
  },
  TT: {
    en: { name: 'Tritone', desc: 'Exactly halfway through the octave. Highly dissonant.', anchor: 'The Simpsons Theme' },
    he: { name: 'טריטון', desc: 'בדיוק חצי קופה מהאוקטבה. סאונד לא יציב ומתוח.', anchor: 'הפתיחה של משפחת סימפסון' },
  },
  P5: {
    en: { name: 'Perfect 5th', desc: 'Power chord shape. 1 string down, 2 frets up.', anchor: 'Star Wars Theme' },
    he: { name: 'קווינטה זכה', desc: 'צורה של פאוור-אקורד. מיתר למטה, שני סריגים קדימה.', anchor: 'שיר הנושא של מלחמת הכוכבים' },
  },
  m6: {
    en: { name: 'Minor 6th', desc: '8 Frets. Sounds melancholic, reaching upwards.', anchor: 'The Entertainer (3rd note)' },
    he: { name: 'סקסטה קטנה', desc: '8 סריגים. נשמע נוגה, נמתח כלפי מעלה.', anchor: 'נעימת הנושא של Love Story' },
  },
  M6: {
    en: { name: 'Major 6th', desc: '9 Frets. Open and pleasant.', anchor: 'NBC Chimes / My Way' },
    he: { name: 'סקסטה גדולה', desc: '9 סריגים. נשמע פתוח ונעים.', anchor: 'הצליל של NBC / My Way' },
  },
  m7: {
    en: { name: 'Minor 7th', desc: '10 Frets. The bluesy, unresolved sound.', anchor: 'Star Trek Original Theme' },
    he: { name: 'ספטימה קטנה', desc: '10 סריגים. מרווח בלוזי, דורש פתרון.', anchor: 'נעימת הפתיחה של מסע בין כוכבים' },
  },
  M7: {
    en: { name: 'Major 7th', desc: '11 Frets. High tension, just below the octave.', anchor: 'Take On Me (Chorus)' },
    he: { name: 'ספטימה גדולה', desc: '11 סריגים. מתח גבוה מאוד, חצי טון מתחת לאוקטבה.', anchor: 'הפזמון של Take On Me' },
  },
  P8: {
    en: { name: 'Octave', desc: 'Same exact note, higher pitch.', anchor: 'Somewhere Over the Rainbow' },
    he: { name: 'אוקטבה', desc: 'בדיוק אותו צליל, קומה אחת למעלה.', anchor: 'אי שם מעבר לקשת' },
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
    weakSpots: 'נקודות תורפה',
    signInHint: 'התחבר כדי לשמור את השיא שלך ולהתאים אישית את התרגול.',
    interval: 'אינטרוול',
    accuracy: 'דיוק',
  },
};
