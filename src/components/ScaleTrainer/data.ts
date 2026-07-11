// ── Scale Speller & Trainer — static content & constants ────────────────────
// The theoretical explanations, formulas and aural anchors are HARD-CODED here
// per the product spec: no theory content is generated at runtime. Learn Mode
// renders straight from `SCALE_DATA`.

export type Lang = 'he' | 'en';
export type ScaleId = 'major' | 'natural_minor' | 'major_pentatonic' | 'minor_pentatonic';

export interface ScaleCopy { name: string; formula: string; desc: string; anchor: string }
export interface ScaleEntry { en: ScaleCopy; he: ScaleCopy }

export const SCALE_DATA: Record<ScaleId, ScaleEntry> = {
  major: {
    en: {
      name: 'Major Scale',
      formula: 'W-W-H-W-W-W-H',
      desc: 'The foundational scale of Western music. Sounds happy, bright, and resolved.',
      anchor: 'Do-Re-Mi / Joy to the World',
    },
    he: {
      name: 'סולם מז\'ור',
      formula: 'טון - טון - חצי טון - טון - טון - טון - חצי טון',
      desc: 'הסולם הבסיסי במוזיקה המערבית. נשמע שמח, בהיר, פתוח ויציב.',
      anchor: 'דו-רה-מי / הפתיחה של יונתן הקטן',
    },
  },
  natural_minor: {
    en: {
      name: 'Natural Minor',
      formula: 'W-H-W-W-H-W-W',
      desc: 'The relative minor to the major scale. Sounds sad, emotional, and dark.',
      anchor: 'Losing My Religion',
    },
    he: {
      name: 'מינור טבעי (איאולי)',
      formula: 'טון - חצי טון - טון - טון - חצי טון - טון - טון',
      desc: 'המינור היחסי לסולם המז\'ור. הבסיס לרוב השירים העצובים, נשמע רגשי ואפל יותר.',
      anchor: 'Losing My Religion / קליפורניקיישן',
    },
  },
  major_pentatonic: {
    en: {
      name: 'Major Pentatonic',
      formula: 'W-W-m3-W-m3',
      desc: 'A 5-note scale without the half-steps. Sweet, open, and commonly used in country and classic rock.',
      anchor: 'My Girl (Temptations) / Wish You Were Here',
    },
    he: {
      name: 'פנטטוני מז\'ורי',
      formula: 'טון - טון - טון וחצי - טון - טון וחצי',
      desc: 'סולם של 5 תווים שבו הוסרו חצאי הטונים. נשמע מתוק ופתוח, נפוץ מאוד בקאנטרי, פופ ורוק קלאסי.',
      anchor: 'My Girl / הפתיחה של Wish You Were Here',
    },
  },
  minor_pentatonic: {
    en: {
      name: 'Minor Pentatonic',
      formula: 'm3-W-W-m3-W',
      desc: 'The ultimate rock and blues scale. 5 notes that create a tough, edgy sound.',
      anchor: 'Sunshine of Your Love / Stairway to Heaven (Solo)',
    },
    he: {
      name: 'פנטטוני מינורי',
      formula: 'טון וחצי - טון - טון - טון וחצי - טון',
      desc: 'הסולם האולטימטיבי לרוק ובלוז. 5 תווים שמייצרים סאונד קשוח, מלוכלך ובלוזי.',
      anchor: 'Sunshine of Your Love / הסולו של Stairway to Heaven',
    },
  },
};

// Pentatonics intentionally omitted from the trainer for now (kept in the data
// / type so they can be re-enabled by adding them back here).
export const SCALE_ORDER: ScaleId[] = ['major', 'natural_minor'];

// ── UI strings (component-level HE / EN) ────────────────────────────────────
export interface UIStrings {
  title: string;
  learn: string;
  practice: string;
  pickScale: string;
  pickRoot: string;
  formulaLabel: string;
  anchorLabel: string;
  notesLabel: string;
  onOneString: string;
  boxPosition: string;
  playAsc: string;
  playDesc: string;
  playScale: string;
  positionLabel: string;
  spellPrompt: string;
  noteBank: string;
  streak: string;
  bestStreak: string;
  start: string;
  startPrompt: string;
  next: string;
  correctSpelling: string;
  enharmonicHint: string;
  wrongHint: string;
  completeTitle: string;
  completeFlawless: string;
  weakSpots: string;
  accuracy: string;
  signInHint: string;
  rootLabel: string;
  scaleNoteLabel: string;
}

export const UI: Record<Lang, UIStrings> = {
  en: {
    title: 'Scale Speller & Trainer',
    learn: 'Learn',
    practice: 'Practice',
    pickScale: 'Pick a scale to study',
    pickRoot: 'Root note',
    formulaLabel: 'Formula',
    anchorLabel: 'Sounds like',
    notesLabel: 'Notes',
    onOneString: 'On one string',
    boxPosition: 'Box position',
    playAsc: 'Play Ascending',
    playDesc: 'Play Descending',
    playScale: 'Play Scale',
    positionLabel: 'Position',
    spellPrompt: 'Spell the scale — fill the boxes in order',
    noteBank: 'Note bank',
    streak: 'Streak',
    bestStreak: 'Best',
    start: 'Start',
    startPrompt: 'Spell scales note by note. Every note name must use the correct letter — D# and Eb are NOT the same answer!',
    next: 'Next scale',
    correctSpelling: 'Correct!',
    enharmonicHint: 'Right sound, wrong spelling — in this scale that note uses a different letter.',
    wrongHint: 'Not in this scale — check the formula.',
    completeTitle: 'Scale complete — here it is on the neck',
    completeFlawless: 'Flawless!',
    weakSpots: 'Weak spots',
    accuracy: 'Accuracy',
    signInHint: 'Sign in to save your best streak and personalise practice.',
    rootLabel: 'Root',
    scaleNoteLabel: 'Scale note',
  },
  he: {
    title: 'איות ותרגול סולמות',
    learn: 'לימוד',
    practice: 'תרגול',
    pickScale: 'בחר סולם ללימוד',
    pickRoot: 'תו הבסיס',
    formulaLabel: 'נוסחה',
    anchorLabel: 'נשמע כמו',
    notesLabel: 'תווים',
    onOneString: 'על מיתר אחד',
    boxPosition: 'פוזיציה (Box)',
    playAsc: 'נגן עולה',
    playDesc: 'נגן יורד',
    playScale: 'נגן סולם',
    positionLabel: 'פוזיציה',
    spellPrompt: 'איית את הסולם — מלא את המשבצות לפי הסדר',
    noteBank: 'מקלדת תווים',
    streak: 'רצף',
    bestStreak: 'שיא',
    start: 'התחל',
    startPrompt: 'מאייתים סולמות תו אחר תו. כל תו חייב להיכתב באות הנכונה — #D ו-Eb הם לא אותה תשובה!',
    next: 'סולם הבא',
    correctSpelling: 'נכון!',
    enharmonicHint: 'הצליל נכון אבל האיות שגוי — בסולם הזה התו נקרא באות אחרת.',
    wrongHint: 'התו לא בסולם — בדוק את הנוסחה.',
    completeTitle: 'הסולם הושלם — הנה הוא על הצוואר',
    completeFlawless: 'ללא טעויות!',
    weakSpots: 'נקודות תורפה',
    accuracy: 'דיוק',
    signInHint: 'התחבר כדי לשמור את השיא שלך ולהתאים אישית את התרגול.',
    rootLabel: 'בסיס',
    scaleNoteLabel: 'תו בסולם',
  },
};
