// Per-tab help text shown by the "?" popover. Keyed by `${panel}:${sub}`.
// Each topic has an English and a Hebrew version; the popover toggles between
// them. Keep each body a few short, concrete sentences about what the tab does.

export interface HelpEntry {
  en: { title: string; body: string };
  he: { title: string; body: string };
}

export const HELP: Record<string, HelpEntry> = {
  // ── CHORDS ────────────────────────────────────────────────────────────────
  'chords:finder': {
    en: {
      title: 'By Name',
      body: 'Pick a chord by its root and quality (major, minor, 7th…). The app shows playable voicings on the fretboard across the neck — tap one to hear it. Add chords to your progression, then save it to your Library or send it to Voicings.',
    },
    he: {
      title: 'לפי שם',
      body: 'בוחרים אקורד לפי שורש וסוג (מז׳ור, מינור, ספתה…). האפליקציה מציגה על הגריפ אצבועים נגישים לאורך הצוואר — הקש על אחד כדי לשמוע. אפשר להוסיף אקורדים לפרוגרסיה, לשמור אותה באזור האישי או לשלוח ל-Voicings.',
    },
  },
  'chords:builder': {
    en: {
      title: 'By Ear',
      body: 'Place notes anywhere on the fretboard and the app identifies the chord you built in real time — with its inversions and alternate names. Great for figuring out a shape you found by ear.',
    },
    he: {
      title: 'לפי אוזן',
      body: 'מניחים תווים על הגריפ והאפליקציה מזהה בזמן אמת איזה אקורד בניתם — כולל היפוכים ושמות חלופיים. מצוין כדי להבין צורה שמצאתם באוזן.',
    },
  },
  'chords:analyzer': {
    en: {
      title: 'Analyze',
      body: 'Feed in a chord progression and get its detected key, the Roman-numeral function of each chord, and an AI reading of what makes it tick. Use it to understand why a progression works.',
    },
    he: {
      title: 'ניתוח',
      body: 'מזינים פרוגרסיית אקורדים ומקבלים את הטוניקה שזוהתה, את התפקיד (ספרות רומיות) של כל אקורד, וניתוח AI שמסביר מה גורם לה לעבוד. שימושי כדי להבין למה פרוגרסיה מצלצלת טוב.',
    },
  },
  'chords:target': {
    en: {
      title: 'Target Note',
      body: 'Choose a note you want to hit and the app finds chords and voicings that contain it, showing where that note sits in each shape. Handy for writing a line that lands on a specific melody note.',
    },
    he: {
      title: 'תו מטרה',
      body: 'בוחרים תו שרוצים שיישמע, והאפליקציה מוצאת אקורדים ואצבועים שמכילים אותו — ומראה איפה התו יושב בכל צורה. שימושי לכתיבת קו שנוחת על תו מלודי מסוים.',
    },
  },

  // ── SCALES ────────────────────────────────────────────────────────────────
  'scales:explorer': {
    en: {
      title: 'Scale Explorer',
      body: 'Pick a root and a scale or mode and see every note laid out on the fretboard, colour-coded by degree. Play it back to hear the sound, and use it as a map for soloing in a key.',
    },
    he: {
      title: 'מגלה הסולמות',
      body: 'בוחרים שורש וסולם/מוד ורואים את כל התווים על הגריפ, צבועים לפי דרגה. אפשר לנגן כדי לשמוע את הצליל, ולהשתמש בזה כמפה לאלתור בסולם.',
    },
  },
  'scales:triads': {
    en: {
      title: 'Triads',
      body: 'Generate the three-note triad shapes (root, 3rd, 5th) for any chord across each string set, inversion and neck position. Filter by strings / inversion / position — you can pick several at once — to drill the whole neck.',
    },
    he: {
      title: 'טריאדות',
      body: 'מייצרים את צורות הטריאדה (שורש, שלישה, חמישה) לכל אקורד — בכל קבוצת מיתרים, היפוך ומיקום בצוואר. אפשר לסנן לפי מיתרים / היפוך / מיקום (וגם לבחור כמה יחד) כדי לתרגל את כל הצוואר.',
    },
  },
  'scales:intervals': {
    en: {
      title: 'Intervals',
      body: 'A reference and calculator for the distances between notes — from a minor 2nd up to the octave. See each interval\'s sound, quality and where it lives on the neck to train your ear and theory.',
    },
    he: {
      title: 'אינטרוולים',
      body: 'מדריך ומחשבון למרחקים בין תווים — מסקונדה קטנה ועד אוקטבה. רואים לכל אינטרוול את הצליל, האופי והמיקום על הצוואר — לאימון אוזן ותאוריה.',
    },
  },
  'scales:wheel': {
    en: {
      title: 'Chord Wheel',
      body: 'The circle of fifths as an interactive wheel: see related keys, their diatonic chords and how they connect. Tap chords to build a progression that stays in key.',
    },
    he: {
      title: 'גלגל האקורדים',
      body: 'מעגל הקווינטות כגלגל אינטראקטיבי: רואים טוניקות קרובות, האקורדים הדיאטוניים שלהן והקשרים ביניהם. הקשה על אקורדים בונה פרוגרסיה שנשארת בטוניקה.',
    },
  },

  // ── VOICINGS ────────────────────────────────────────────────────────────────
  'voicings:paths': {
    en: {
      title: 'Voicing Paths',
      body: 'Give it a chord progression and it finds smooth ways to play it — sequences of voicings with minimal hand movement (good voice-leading), grouped by neck zone. Import your progression, audition each path, long-press a chord to swap it, and save the result to your Library.',
    },
    he: {
      title: 'מסלולי אצבוע',
      body: 'נותנים פרוגרסיה והכלי מוצא דרכים חלקות לנגן אותה — רצפי אצבועים עם תנועת יד מינימלית (הולכת קולות טובה), מקובצים לפי אזור בצוואר. אפשר לייבא פרוגרסיה, להאזין לכל מסלול, ללחוץ ארוך על אקורד כדי להחליף אותו, ולשמור לאזור האישי.',
    },
  },
  'voicings:voiceleading': {
    en: {
      title: 'Voice Leading Studio',
      body: 'Build a progression on the horizontal timeline (＋ adds a chord), then press Calculate to arrange it into four smooth voices — shown as a grid of note names (no staff to read). Each row is a voice, each column a chord; read a row left-to-right to follow that voice. The bass takes the root, common tones are held (marked =), and the upper voices step to the nearest note (▲ up / ▼ down). Below the grid a ⚠ list flags what works against smooth voice leading — parallel 5ths or octaves (two voices moving the same way while a fifth or octave apart) and any large leap in an upper voice. Click a row to highlight (cobalt) and follow one voice. The key is auto-detected and each chord shows its Roman numeral (I, ii, V7…), with a ⚠ when it sits outside the key; use the Key selector to override it. Play walks the voiced chords.',
    },
    he: {
      title: 'סטודיו הולכת קולות',
      body: 'בונים מהלך על ציר הזמן האופקי (＋ מוסיף אקורד) ולוחצים "חשב" — והמהלך מסודר לארבעה קולות חלקים, כרשת של שמות תווים (בלי חמשה לקרוא). כל שורה היא קול, כל עמודה אקורד; קוראים שורה משמאל לימין כדי לעקוב אחרי הקול. הבס לוקח את השורש, צלילים משותפים מוחזקים (מסומן =), והקולות העליונים זזים לתו הקרוב ביותר (▲ למעלה / ▼ למטה). מתחת לרשת רשימת ⚠ מסמנת מה שנוגד הולכת קולות חלקה — קוינטות או אוקטבות מקבילות (שני קולות שזזים באותו כיוון במרחק קוינטה/אוקטבה) וכל קפיצה גדולה בקול עליון. לחיצה על שורה מדגישה (בקובלט) ומאפשרת לעקוב אחרי קול אחד. הסולם מזוהה אוטומטית וכל אקורד מציג את הדרגה הרומית שלו (I, ii, V7…), עם ⚠ כשהוא מחוץ לסולם; אפשר לבחור סולם ידנית. "נגן" מנגן את האקורדים המסודרים.',
    },
  },
  'voicings:harmonizer': {
    en: {
      title: 'Melody Harmonizer',
      body: 'Enter a melody and the AI harmonises it into a playable arrangement — melody on top with supporting harmony beneath, in the style you choose. Save the result or export it.',
    },
    he: {
      title: 'הרמוניית מלודיה',
      body: 'מזינים מלודיה וה-AI מלביש עליה הרמוניה נגישה — המלודיה למעלה עם הרמוניה תומכת מתחת, בסגנון שתבחרו. אפשר לשמור את התוצאה או לייצא אותה.',
    },
  },
  'voicings:reharmonize': {
    en: {
      title: 'Reharmonize',
      body: 'Take an existing progression and let the AI suggest richer or more surprising chords — substitutions, extensions and passing chords — with an explanation of the technique. Dial the tension and genre to taste.',
    },
    he: {
      title: 'רה-הרמוניזציה',
      body: 'לוקחים פרוגרסיה קיימת וה-AI מציע אקורדים עשירים או מפתיעים יותר — תחליפים, הרחבות ואקורדי מעבר — עם הסבר על הטכניקה. מכווננים את המתח והז׳אנר לפי הטעם.',
    },
  },

  // ── PRACTICE ────────────────────────────────────────────────────────────────
  'practice:tuner': {
    en: {
      title: 'Tuner',
      body: 'A chromatic tuner that listens through your mic and shows how sharp or flat each string is in real time. Pick a tuning and tune each string until it reads in the centre.',
    },
    he: {
      title: 'טיונר',
      body: 'טיונר כרומטי שמאזין דרך המיקרופון ומראה בזמן אמת כמה כל מיתר גבוה או נמוך. בוחרים כיוון ומכווננים כל מיתר עד שהוא במרכז.',
    },
  },
  'practice:metronome': {
    en: {
      title: 'Metronome',
      body: 'Keep time while you practise. Set the tempo and time signature and play along to a steady click, with an accented downbeat on each bar.',
    },
    he: {
      title: 'מטרונום',
      body: 'שומר על קצב בזמן תרגול. קובעים טמפו ומשקל, ומנגנים לפי קליק יציב עם הדגשה על הפעמה הראשונה בכל תיבה.',
    },
  },

  'practice:eartraining': {
    en: {
      title: 'Interval Ear Training',
      body: 'Train your ear to recognise intervals on the neck. Learn mode explains each interval with a description, an aural anchor (a familiar tune) and a shape on a windowed fretboard. Practice mode plays an interval from a pinned root — melodic or harmonic — and you tap the second note anywhere it sounds right; any position at the correct pitch counts. Build a streak, and mixed practice quietly focuses on the intervals you miss most.',
    },
    he: {
      title: 'אימון שמיעה — אינטרוולים',
      body: 'מאמנים את האוזן לזהות אינטרוולים על הצוואר. במצב לימוד כל אינטרוול מוסבר עם תיאור, עוגן שמיעתי (מנגינה מוכרת) וצורה על מקטע צוואר. במצב תרגול המערכת משמיעה אינטרוול מתו בסיס נעוץ — מלודי או הרמוני — ואתם מקליקים על התו השני בכל מקום שנכון; כל מיקום בגובה הצליל הנכון מתקבל. אוספים רצף, ובמצב מעורב האלגוריתם מתמקד באינטרוולים שבהם אתם טועים יותר.',
    },
  },

  'practice:scaletrainer': {
    en: {
      title: 'Scale Speller & Trainer',
      body: 'Learn scale formulas and spell scales note by note. Learn mode explains each scale — formula, character, an aural anchor — and shows it on one string and in a box position. Practice mode asks you to spell a scale (e.g. Eb Major) with strict enharmonic spelling: D# is not Eb! Complete the spelling and the notes drop onto the neck, where you can play the scale ascending or descending. Build a streak, and practice quietly focuses on the scales you misspell most.',
    },
    he: {
      title: 'איות ותרגול סולמות',
      body: 'לומדים את נוסחאות הסולמות ומאייתים סולמות תו אחר תו. במצב לימוד כל סולם מוסבר — נוסחה, אופי ועוגן שמיעתי — ומוצג על מיתר אחד ובפוזיציה על הצוואר. במצב תרגול מאייתים סולם (למשל Eb מז\'ור) עם דיוק אנהרמוני קפדני: ‎D#‎ הוא לא ‎Eb‎! בסיום האיות התווים נופלים אל הצוואר, ואפשר לנגן את הסולם בעלייה או בירידה. אוספים רצף, והאלגוריתם מתמקד בסולמות שבהם אתם טועים יותר.',
    },
  },

  // ── STUDIO ────────────────────────────────────────────────────────────────
  'studio:tabbuilder': {
    en: {
      title: 'Tab Builder',
      body: 'Write guitar tablature by placing fret numbers on a six-string grid, add bars and techniques, then play it back, export a PDF/MIDI or save it to your Library.',
    },
    he: {
      title: 'בונה הטאבים',
      body: 'כותבים טבלטורה לגיטרה ע״י הצבת מספרי שריגים על גריד של שישה מיתרים, מוסיפים תיבות וטכניקות, ואז מנגנים, מייצאים PDF/MIDI או שומרים לאזור האישי.',
    },
  },
  'studio:audiotab': {
    en: {
      title: 'Audio to Tab',
      body: 'Upload or record a guitar part and the app transcribes it into tab automatically, using pitch detection plus an AI clean-up pass. Edit the result, then export or save it.',
    },
    he: {
      title: 'אודיו לטאב',
      body: 'מעלים או מקליטים קטע גיטרה והאפליקציה מתמללת אותו לטאב אוטומטית — זיהוי גובה צליל בתוספת ליטוש AI. אפשר לערוך את התוצאה, לייצא או לשמור.',
    },
  },
};
