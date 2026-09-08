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
  'chords:extensions': {
    en: {
      title: 'Diatonic Extensions',
      body: 'A reference sheet for what each degree of a major scale becomes once you stack a 7th, 9th, 11th or 13th on it. Pick a key and the chords are spelled out for real (Cmaj9, Dm11…) instead of Roman numerals. The degrees are grouped by family — major (I, IV), dominant (V), minor (ii, iii, vi) and diminished (vii) — because that is what makes the pattern click. A dash marks an extension that clashes on that degree, where players normally stop at the one before.',
    },
    he: {
      title: 'הרחבות אקורדים בסולם',
      body: 'דף עזר: מה כל דרגה בסולם מז׳ור הופכת להיות כשמוסיפים לה 7, 9, 11 או 13. בוחרים סולם והאקורדים מופיעים בשמם המלא (Cmaj9, Dm11…) במקום ספרות רומיות. הדרגות מקובצות לפי משפחה — מז׳ור (1, 4), דומיננטה (5), מינור (2, 3, 6) ומוקטן (7) — כי ככה ההיגיון מתחוור. מקף מציין הרחבה שיוצרת דיסוננס באותה דרגה, שם לרוב עוצרים בהרחבה הקודמת.',
    },
  },
  'intervals:explore': {
    en: {
      title: 'Explore',
      body: 'An interval is simply the distance between two notes. Pick a starting note and an interval and this shows you what it looks like on the neck and what it sounds like, along with its name, its size in semitones and whether it sits consonant or tense. Start here when you meet an interval you do not know yet.',
    },
    he: {
      title: 'חקירה',
      body: 'אינטרוול הוא פשוט המרחק בין שני תווים. בוחרים תו התחלה ואינטרוול, והכלי מראה איך הוא נראה על הצוואר ואיך הוא נשמע — יחד עם השם שלו, המרחק בחצאי־טונים והאופי שלו (עיצורי או מתוח). מכאן מתחילים כשפוגשים אינטרוול שעדיין לא מכירים.',
    },
  },
  'intervals:identify': {
    en: {
      title: 'Identify',
      body: 'The reverse of Explore: you are shown two notes and you name the interval between them. Use it to check that what you learned actually stuck — recognising an interval is a different skill from being told what it is.',
    },
    he: {
      title: 'זיהוי',
      body: 'ההפך מ"חקירה": מוצגים לכם שני תווים ואתם אומרים איזה אינטרוול ביניהם. משמש כדי לבדוק שמה שלמדתם באמת נקלט — לזהות אינטרוול זו מיומנות אחרת מלקבל את התשובה מראש.',
    },
  },
  'intervals:inchord': {
    en: {
      title: 'In a Chord',
      body: 'Pick a chord and see every interval inside it, one row each — the interval, the chord-tone pairs that form it, and its size. An interval formed by more than one pair stays a single row, so the list stays short even for a 9th chord. Open a row to see that interval on the neck: every playable placement is marked, one highlighted at a time so the diagram never turns into a tangle. This is where you find out why a chord sounds the way it does.',
    },
    he: {
      title: 'בתוך אקורד',
      body: 'בוחרים אקורד ורואים את כל האינטרוולים שבתוכו, שורה לכל אחד — האינטרוול, זוגות התווים שיוצרים אותו, והמרחק שלו. אינטרוול שנוצר מיותר מזוג אחד נשאר שורה אחת, כך שהרשימה נשארת קצרה גם באקורד תשיעי. פתיחת שורה מראה את האינטרוול על הצוואר: כל המיקומים הנגישים מסומנים, ואחד מודגש בכל פעם כדי שהתרשים לא יהפוך לסבך. כאן מבינים למה אקורד נשמע כמו שהוא נשמע.',
    },
  },
  'intervals:practice': {
    en: {
      title: 'Practice',
      body: 'Ear training: two notes are played and you name the interval, with no diagram to read off. Choose whether they sound together or one after the other, pick a difficulty, and build a streak — it only grows on a first-try answer, so the number reflects what you actually hear rather than what you got on the retry.',
    },
    he: {
      title: 'תרגול',
      body: 'אימון שמיעה: מושמעים שני תווים ואתם מזהים את האינטרוול, בלי תרשים להיעזר בו. אפשר לבחור אם הם נשמעים יחד או בזה אחר זה, לבחור רמת קושי ולבנות רצף — הרצף גדל רק על תשובה נכונה מניסיון ראשון, כך שהמספר משקף מה באמת שמעתם ולא מה שתיקנתם בניסיון השני.',
    },
  },
  'chords:practice': {
    en: {
      title: 'Practice',
      body: 'Two drills for chords. Theory asks you to spell a chord from its formula, note by note, from a bank of notes. Ear Training plays a chord and asks you to pick it — the whole chord, root and quality, out of four options. Difficulty widens the pool of chord types; the streak grows only on a first-try answer, and a first mistake is forgiven before it resets.',
    },
    he: {
      title: 'תרגול',
      body: 'שני תרגילים לאקורדים. ב"תאוריה" מאייתים אקורד מהנוסחה שלו, תו אחר תו, מתוך בנק תווים. ב"שמיעה" מושמע אקורד ובוחרים אותו — את האקורד המלא, שורש וסוג, מתוך ארבע אפשרויות. רמת הקושי מרחיבה את מגוון סוגי האקורדים; הרצף גדל רק על תשובה נכונה מניסיון ראשון, וטעות ראשונה נסלחת לפני שהוא מתאפס.',
    },
  },
  'scales:practice': {
    en: {
      title: 'Practice',
      body: 'Two drills for scales. Theory asks you to spell a scale from its formula, note by note, with the interval pattern shown as a reminder. Ear Training plays a scale and asks you to pick it — root and type together, out of four options. Difficulty adds the pentatonics; the streak grows only on a first-try answer.',
    },
    he: {
      title: 'תרגול',
      body: 'שני תרגילים לסולמות. ב"תאוריה" מאייתים סולם מהנוסחה שלו, תו אחר תו, עם תבנית המרווחים כתזכורת. ב"שמיעה" מושמע סולם ובוחרים אותו — שורש וסוג יחד, מתוך ארבע אפשרויות. רמת הקושי מוסיפה את הפנטטוניים; הרצף גדל רק על תשובה נכונה מניסיון ראשון.',
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
  'voicings:target': {
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
  'voicings:voiceleading': {
    en: {
      title: 'Voice Leading Studio',
      body: 'Build a progression on the horizontal timeline (＋ adds a chord), then press Calculate to arrange it into four smooth voices — shown as a grid of note names (no staff to read). Each row is a voice, each column a chord; read a row left-to-right to follow that voice. The bass takes the root, common tones are held (marked =), and the upper voices step to the nearest note (▲ up / ▼ down). Below the grid a ⚠ list flags what works against smooth voice leading — parallel 5ths or octaves (two voices moving the same way while a fifth or octave apart) and any large leap in an upper voice. Click a row to highlight (cobalt) and follow one voice, or use the Highlight-degree chips (Root/3/5/7…) to light up a single degree across every chord at once. The key is auto-detected and each chord shows its Roman numeral (I, ii, V7…), with a ⚠ when it sits outside the key; use the Key selector to override it. Play walks the voiced chords.',
    },
    he: {
      title: 'סטודיו הולכת קולות',
      body: 'בונים מהלך על ציר הזמן האופקי (＋ מוסיף אקורד) ולוחצים "חשב" — והמהלך מסודר לארבעה קולות חלקים, כרשת של שמות תווים (בלי חמשה לקרוא). כל שורה היא קול, כל עמודה אקורד; קוראים שורה משמאל לימין כדי לעקוב אחרי הקול. הבס לוקח את השורש, צלילים משותפים מוחזקים (מסומן =), והקולות העליונים זזים לתו הקרוב ביותר (▲ למעלה / ▼ למטה). מתחת לרשת רשימת ⚠ מסמנת מה שנוגד הולכת קולות חלקה — קוינטות או אוקטבות מקבילות (שני קולות שזזים באותו כיוון במרחק קוינטה/אוקטבה) וכל קפיצה גדולה בקול עליון. לחיצה על שורה מדגישה (בקובלט) ומאפשרת לעקוב אחרי קול אחד, או השתמשו בשבבי "הדגש דרגה" (שורש/3/5/7…) כדי להאיר דרגה אחת בכל האקורדים בבת אחת. הסולם מזוהה אוטומטית וכל אקורד מציג את הדרגה הרומית שלו (I, ii, V7…), עם ⚠ כשהוא מחוץ לסולם; אפשר לבחור סולם ידנית. "נגן" מנגן את האקורדים המסודרים.',
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

  // ── TOOLS ─────────────────────────────────────────────────────────────────
  'tools:tuner': {
    en: {
      title: 'Tuner',
      body: 'A chromatic tuner that listens through your mic and shows how sharp or flat each string is in real time. Pick a tuning and tune each string until it reads in the centre.',
    },
    he: {
      title: 'טיונר',
      body: 'טיונר כרומטי שמאזין דרך המיקרופון ומראה בזמן אמת כמה כל מיתר גבוה או נמוך. בוחרים כיוון ומכווננים כל מיתר עד שהוא במרכז.',
    },
  },
  'tools:metronome': {
    en: {
      title: 'Metronome',
      body: 'Keep time while you practise. Set the tempo and time signature and play along to a steady click, with an accented downbeat on each bar.',
    },
    he: {
      title: 'מטרונום',
      body: 'שומר על קצב בזמן תרגול. קובעים טמפו ומשקל, ומנגנים לפי קליק יציב עם הדגשה על הפעמה הראשונה בכל תיבה.',
    },
  },
  'tools:tabbuilder': {
    en: {
      title: 'Tab Builder',
      body: 'Write guitar tablature by placing fret numbers on a six-string grid, add bars and techniques, then play it back, export a PDF/MIDI or save it to your Library.',
    },
    he: {
      title: 'בונה הטאבים',
      body: 'כותבים טבלטורה לגיטרה ע״י הצבת מספרי שריגים על גריד של שישה מיתרים, מוסיפים תיבות וטכניקות, ואז מנגנים, מייצאים PDF/MIDI או שומרים לאזור האישי.',
    },
  },
  'tools:audiotab': {
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
