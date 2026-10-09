# ScaleUp — ספר האפליקציה

> מסמך טכני-פונקציונלי מקיף של כלל הכלים, הפיצ'רים והאלגוריתמים

---

## תוכן עניינים

1. [סקירה כללית](#סקירה-כללית)
2. [ארכיטקטורה](#ארכיטקטורה)
3. [השיר — פרויקט הלחנה אחד](#השיר--פרויקט-הלחנה-אחד)
4. [ניווט: מפת הכלים ולוח הפקודות](#ניווט-מפת-הכלים-ולוח-הפקודות)
5. [תנועה, סאונד ומשוב](#תנועה-סאונד-ומשוב)
6. [מערכת הצבעים והעיצוב](#מערכת-הצבעים-והעיצוב)
7. [טיפוסי הנתונים הבסיסיים](#טיפוסי-הנתונים-הבסיסיים)
8. [כלי עזר ואלגוריתמים](#כלי-עזר-ואלגוריתמים)
9. [הפאנלים והכלים](#הפאנלים-והכלים)
10. [תרגול](#תרגול)
11. [רכיבי Fretboard](#רכיבי-fretboard)
12. [אינטגרציות חיצוניות](#אינטגרציות-חיצוניות)
13. [פורמטי יצוא](#פורמטי-יצוא)

---

## סקירה כללית

ScaleUp היא אפליקציית ווב (PWA) ללימוד תיאוריה מוזיקלית וגיטרה, בנויה עם **React + TypeScript** ו-**Vite**. האפליקציה מיועדת לגיטריסטים בכל הרמות ומשלבת:

- כלי תיאוריה אינטראקטיביים (אקורדים, סולמות, אינטרוולים)
- מנועי ניתוח הרמוני מבוססי אלגוריתמים
- ניתוח AI מבוסס Claude API
- כלי אודיו בזמן אמת (כוונון, מטרונום, תמלול)
- מגוון פורמטי יצוא (PDF, MIDI, AlphaTex)
- **שיר אחד** שכל הכלים עובדים עליו יחד — אקורדים בקטעים, מלודיה, סולם, טמפו וכיוון משותפים
- תרגול עם רצף, יעד יומי ותשובה בנגינה על הגיטרה

האפליקציה תומכת בעברית ואנגלית.

---

## ארכיטקטורה

```
src/
├── App.tsx                  # Root — שני ה-shells (דסקטופ / מובייל), ניווט בין פאנלים
├── song/                    # השיר: מודל, state + undo/redo, שמירה במכשיר ובענן
├── motion/                  # שכבת התנועה: לחיצה, בחירה, החלקה, "מעוף" למגש, playhead
├── practice/                # רצף, יעד יומי, משוב לתשובות, האזנה לגיטרה (מיקרופון)
├── data/tools.ts            # קטלוג הכלים — מקור לוח הפקודות ומפת הכלים
├── theme.ts                 # Design tokens — T.primary, card(), btn()
├── index.css                # טוקני צבע, טוקני תנועה (200/280/400ms) והנפשות
├── utils/
│   ├── musicTheory.ts       # CHROMATIC, TUNINGS, המרות note↔fret
│   ├── harmonicAnalysis.ts  # זיהוי סולם אחד לכל האפליקציה + ספרות רומיות
│   ├── audioPlayback.ts     # Web Audio + "אוטובוס" התווים שמנגנים (playhead)
│   ├── previewSound.ts      # צלילי בחירה (ההשתקה בכותרת שולטת בהם)
│   ├── pitch.ts             # זיהוי גובה YIN — טיונר ותשובות בנגינה
│   └── …                    # chordVoicings, voiceLeading, reharmonize, audioToTab, export
└── components/
    ├── Song/                # SongDock (המגש מעל כל כלי), SongMap (מפת השיר)
    ├── CommandPalette.tsx   # ⌘K
    ├── ToolsMap.tsx         # מפת הכלים
    ├── Practice/            # StreakBoard, PlayToAnswer
    ├── Fretboard/           # Display / Interactive / Mini + Dot (נקודה מונפשת)
    ├── ChordPicker, ChordBuilder, Chords   # CHORDS
    ├── ScalePanel, Triads                  # SCALES
    ├── Intervals, EarTraining              # INTERVALS
    ├── Voicings                            # VOICINGS
    └── Tools                               # TOOLS
```

### ניהול מצב (State Management)

אין Redux או Zustand. המצב המשותף היחיד הוא **השיר** (`song/SongContext.ts`): App מחזיק אותו דרך `useSongState()` ומעביר אותו בקונטקסט; כל כלי קורא ממנו עם `useSong()` / `useOptionalSong()`. מחסנית undo/redo אחת (עד 50 צעדים) מכסה את כל השיר. מצב מקומי של כל כלי נשאר `useState`.

---

## השיר — פרויקט הלחנה אחד

כל הכלים עובדים על שיר אחד (`song/song.ts`):

| שדה | תוכן |
|-----|------|
| `title` | שם השיר |
| `keyOverride` | סולם שנבחר; `null` = מזוהה מהאקורדים (`harmonicAnalysis.detectKey`) |
| `bpm`, `meter` | טמפו ומשקל — משותפים למטרונום, לנגינת המגש, ל-Jam ול-Tab Builder |
| `tuningName`, `capo` | כיוון וקאפו — משותפים ל-By Name, By Ear, Tuner ונגינה |
| `sections[]` | קטעים (Verse, Chorus…), לכל אחד אקורדים (`ChordInProgression[]`) וגרסאות חלופיות |
| `melody`, `melodyFrom` | המלודיה (TabContent) ואיזה כלי כתב אותה אחרון |

**המגש (`SongDock`)** — מעל כל כלי: ▶ מנגן את הקטע (תיבה לאקורד בטמפו השיר), ⟳ לופ, שם, טאבים לקטעים ו-+, בחירת גרסה, סולם (Auto או ידני), BPM ומשקל. לחיצה על אקורד מנגנת ובוחרת אותו.

**מה כל כלי לוקח ונותן:**

| כלי | לוקח | נותן |
|-----|------|------|
| By Name / By Ear / Wheel / Extensions / Target | סולם, כיוון | אקורדים לקטע ("עפים" למגש) |
| Scale Explorer, Wheel, Extensions, Harmonize | הסולם | — (נפתחים עליו ועוקבים אחריו) |
| Triads, Intervals → In a Chord | האקורד שנבחר במגש | — |
| VL Studio | אקורדי הקטע | עריכות לאקורדי הקטע |
| Reharm | אקורדי הקטע | "Use in song" / "Keep as variant" |
| Harmonize | המלודיה | עריכות למלודיה |
| Tab Builder / Audio→Tab | המלודיה | "Use this tab" / "Use as the song's melody" |
| Metronome | טמפו, משקל | טמפו ומשקל (כולל Tap ו-Speed trainer) |
| Tuner | הכיוון | — |
| Practice | אקורדי השיר וסולמו | — (רמת "My song") |

**מפת השיר (`SongMap`)** — כל הקטעים, ניגון השיר כולו עם קליק, עריכת קטעים וגרסאות, מצב המלודיה, יצוא MIDI/PDF, ו-"השירים שלי".

**שמירה** — השיר נשמר במכשיר בכל שינוי (`scaleup_song`, וספרייה ב-`scaleup_songs`). למשתמש מחובר הוא נשמר גם בטבלת `songs` ב-Supabase (`supabase/schema.sql`), 2.5 שניות אחרי שהעריכה נעצרת; העותק החדש מנצח.

---

## ניווט: מפת הכלים ולוח הפקודות

- **מפת הכלים** (`ToolsMap`) — הלוגו פותח אותה, והיא נפתחת לבד בביקור ראשון: 5 פאנלים × כלים, לכל כלי משפט אחד על מה שהוא נותן.
- **לוח הפקודות** (`CommandPalette`) — ⌘K / Ctrl+K / "/" או כפתור החיפוש בכותרת. מחפש לפי כוונה בעברית ובאנגלית ("איזה אקורד זה", "לכוון") מתוך `data/tools.ts`, ומריץ פעולות (מצב כהה, השתקה, שפה, שיר חדש, מפת השיר).
- כל המעברים עוברים דרך `services/navigate.ts`.

---

## תנועה, סאונד ומשוב

**זמנים** — שלושה בלבד: `--gc-dur-fast` 200ms, `--gc-dur-base` 280ms, `--gc-dur-slow` 400ms. חריגים: playhead (מתוזמן לפי הצליל) וסיבוב גלגל החמישיות.

**לחיצה** (`motion/index.ts`) — הכפתור שוקע 6px והפס השמאלי מתעבה מ-3px ל-12px; הלחיצה נמשכת לפחות 200ms, וקופצת חזרה בקפיץ. ריחוף רק בעכבר. `.gc-no-bar` לכפתורי טקסט חשופים, `.gc-no-press` לביטול.

**בחירה** — כפתור עם `data-active` מקבל "שפיכה" של הצבע מהפס כשהוא נבחר ו"איסוף" לתוכו כשהוא מבוטל. טאבים וניווט: מחוון אחד מחליק (`motion/useSlider.ts`).

**אישור** — `RollLabel` מגלגל טקסט ("✓ Added"); `flyToDock` מעיף את האקורד מהכפתור אל המגש; כפתור שהופך לזמין פועם; טעות — רעידה.

**סאונד** — כל בחירה מושמעת (`utils/previewSound.ts`): שורש → תו, אקורד → האצבוע הראשון, סולם → ריצה, אינטרוול → שני התווים. כפתור הרמקול בכותרת משתיק רק את צלילי הבחירה.

**Playhead** — כל תו שמושמע מוכרז ב-`audioPlayback.onNotes`; `useSounding()` מאפשר לכל צוואר להדליק את הנקודה שנשמעת (`Fretboard/Dot.tsx`), ולנקודות להחליק למקומן החדש כשהאצבוע/השורש/המודוס משתנה.

כשמופעל "הפחת תנועה" במערכת ההפעלה — ההנפשות כבויות.

---

## מערכת הצבעים והעיצוב

### פלטה

מונוכרום — שחור, לבן ואפור — עם הכחול של הלוגו כצבע הדגשה. אין צבעים שרירותיים בקוד: `scripts/check-palette.mjs` מפיל את ה-build על צבע שאינו בפלטה.

| טוקן | Light | Dark | שימוש |
|------|-------|------|-------|
| `--gc-bg-deep` | `#FFFFFF` | `#111110` | רקע הדף |
| `--gc-bg-card` | `#FFFFFF` | `#1A1918` | כרטיסים |
| `--gc-bg-input` | `#F0F0F0` | `#242220` | שדות וכפתורים לא פעילים |
| `--gc-border` | `#D0D0D0` | `#383530` | גבולות |
| `--gc-primary` | `#1A1818` | `#6B655C` | כפתורים ומצב פעיל |
| `--gc-brand-accent` | `#110CF0` | `#4F7BFF` | ה-"Up" בלוגו בלבד |
| `--gc-success` | `#2B54D4` | `#5E86FF` | נכון, playhead, טבעות "תו מטרה" |
| `--gc-bar-color` | `#000` | `rgba(255,255,255,.2)` | הפס בצד שמאל של כרטיסים וכפתורים |

### שפה ויזואלית

פינות חדות, בלי צללים, פס שחור בצד שמאל של כל כרטיס וכפתור. הפס הוא גם מה שזז — ראו [תנועה, סאונד ומשוב](#תנועה-סאונד-ומשוב).

### גופנים

- **Azeret Mono** — Variable font (wght 100–900), Latin, WOFF2, TrueType hinting
- **Miriam Libre** — עברית, WOFF2, unicode-range מוגדר לגליפים עבריים בלבד
- `letter-spacing: 0.07em` גלובלי, `text-rendering: geometricPrecision`

---

## טיפוסי הנתונים הבסיסיים

```typescript
// פיץ' קלאס — "C", "F#", "Bb"
type Note = string;

// כיוון גיטרה
type Tuning = {
  name: string;           // "Standard", "Drop D" וכו'
  strings: string[];      // שמות הנימים מנמוך לגבוה
  frequencies: number[];  // תדרים בהרץ
  midiValues: number[];   // ערכי MIDI
};

// מיקום על הפרטבורד
type FretPosition = { string: 0|1|2|3|4|5; fret: number };

// אקורד
type Chord = { name: string; notes: Note[]; aliases: string[] };

// אקורד בתוך פרוגרסיה
type ChordInProgression = {
  id: string;
  chord: Chord;
  fretPositions: FretPosition[];
};

// תוצאת זיהוי סולם
type ScaleMatch = {
  scale: string;   // "C Major", "A Minor Pentatonic"
  root: string;
  fit: number;     // 0–100 אחוז כיסוי
  positions: FretPosition[];
};
```

---

## כלי עזר ואלגוריתמים

### musicTheory.ts

**בסיס התיאוריה המוזיקלית של האפליקציה.**

```typescript
CHROMATIC = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']

TUNINGS = {
  'Standard': { strings: ['E','A','D','G','B','E'], ... },
  'Drop D': ...,
  'Open E': ...,
  // + 8 כיוונים נוספים (DADGAD, half-down, D-standard, Drop C...)
}
```

**פונקציות מרכזיות:**
- `fretToNote(string, fret, capo)` → Note — המרת מיקום על הגיטרה לצליל
- `fretPositionsToNotes(positions, tuning, capo)` → Note[] — מערך מיקומים לנוטות
- `notesToPitchClasses(notes)` → Note[] — נורמליזציה וכפילויות

---

### chordIdentifier.ts

**אלגוריתם זיהוי אקורד בן 3 שלבים:**

**שלב 1 — Tonal.js rotations**
מנסה כל נוטה כבס (טיפול באינברסיות). `['E','C','G']` → `'CM/E'` (first inversion).

**שלב 2 — Enharmonic substitutions**
בודק עד 64 קומבינציות של חילופי חד/בֶּמוֹל (C# ↔ Db וכו').

**שלב 3 — Score-based fallback**
אם Tonal.js לא מזהה, סריקת כל טיפוסי האקורד עם ניקוד:
- כיסוי (כמה נוטות מהקלט מכוסות)
- בונוס לנוטת הבס
- עדיפות לאקורדים פשוטים (M, m, 7, maj7 > sus/add > altered)
- עונש מורכבות

---

### chordVoicings.ts

**גנרטור ווקאינגים נגינים — span של 4 פרטות.**

**חוקי נגינה:**
- מינימום 4 נוטות
- span מקסימלי של 3 פרטות (1 barre + 3 אצבעות)
- Shell voicing: חייב root + 3rd + 7th לאקורדים מ-4 נוטות
- מקסימום 3 אצבעות מעל ה-barre
- בדיקת ריאצ'יות: נוטות מעל barre לא יכולות להיות רחוקות מ-3 סמיטונות על פני 3 נימים+

מחזיר עד 6 ווקאינגים, ממוינים לפי: פרט נמוך → מספר נימים מלא.

---

### scaleUtils.ts

**`detectScales(progression)`**
מנתח פרוגרסיה אקורדים, מחזיר 3 סולמות הכי מתאימים:
- משווה שורשי האקורדים מול כל 12 × 2 (major/minor) מפתחות
- ניקוד: כיסוי% × 1000 + נוכחות טוניקה + עדיפות סוג סולם
- Tie-breakers: האקורד הראשון הוא טוניקה, האקורד הראשון תואם את אופן המפתח

**סדר עדיפויות סוגי סולם:**
Major > Minor > Dorian/Mixolydian > Phrygian/Lydian > Pentatonics > Harmonic/Melodic Minor

**`getScalePositions(root, scale, position)`**
מחזיר את כל מיקומי הסולם על ה-fretboard לפי עמדת CAGED:
- Position 0: פרטות 0–3
- Position 1: 2–5
- Position 2: 4–8
- Position 3: 6–10
- Position 4: 9–12

---

### voicingPaths.ts

**Beam-search למסלולי ווקאינג עם מודעות ז'אנר.**

**אילוצי ז'אנר (hard filters):**

| ז'אנר | נימים פתוחים | נוטות | פרטה מקס | מאפיין |
|-------|-------------|-------|----------|--------|
| Americana | חובה | 3–6 | 12 | drone וינטאג' |
| Swamp | מותר | 3–4 | 7 | נמוך וכבד |
| Neo-Soul | ללא | 4–6 | 12 | extended harmonies |
| Blues | מותר | 3–6 | 12 | dominant 7ths |
| Rock | אסור | 4–6 | 12 | חסכוני ועוצמתי |
| Country | חובה | 3–5 | 5 | פוזיציה פתוחה |

**פונקציית עלות:**
- Voice-leading cost (נים שנשמר = 0, נים חדש = 6×)
- Genre aesthetic cost (בונוסים/עונשים ספציפיים לז'אנר)
- Playability cost

**אלגוריתם:**
1. יצירת candidates לכל אקורד (full / triads)
2. Beam search (width 80) על כל הפרוגרסיה
3. מיון לפי עלות כוללת
4. deduplication לפי פונקציה (open/low/mid/high)
5. יצירת תיאורים נרטיביים + smoothness score (0–5)
6. החזרת 5 מסלולים מובילים

---

### progressionHelper.ts

**זיהוי טונאליות והצעות אקורדים.**

**זיהוי מפתח:** `detectKey()` כאן מחזיר טקסט ("A minor") ומאציל ל-`harmonicAnalysis.detectKey` — מזהה אחד לכל האפליקציה:
- כל 24 הסולמות; אקורד שכל תוויו בסולם +2, שורש בסולם +0.5
- האקורד הראשון כטוניקה +0.8 (ועוד +0.3 אם האיכות שלו מתאימה למודוס), האחרון +0.4
- רצף של אקורדי 7 דומיננטיים (בלוז) — האקורד הראשון קובע את הסולם

**מנוע הצעות:**
- **דיאטוני:** מחפש את המספר הרומי של האקורד האחרון → מציע המשך לפי כללי הרמוניה
- **ז'אנר:** GENRE_PATTERNS — 20+ פרוגרסיות ידועות (12-Bar Blues, ii-V-I, I-IV-V וכו')
- **Fallback:** אם האקורד מחוץ למפתח → מציע אקורדים ראשיים לפי פונקציה (IV, V, vi, I)

**קלט Roman Numerals:**
פרסור "I IV V vi" → בניית אקורדים במפתח שזוהה. תומך בaccidentals (bVII, #IV).

---

### audioToTab.ts

**pipeline תמלול אודיו → טאב גיטרה.**

```
קובץ אודיו
    ↓
[1] Basic Pitch ML model
    (22050 Hz mono, ניתוח per-frame)
    ↓
[2] Cleanup Passes
    • מיזוג re-triggers (< 80ms = extend)
    • הסרת harmonics פנטומיים (+12/+24 semitones)
    • אילוץ אוקטבה (פרט > 12 → drop octave)
    • סינון glitch (< 60ms → מחיקה)
    ↓
[3] Claude AI Refinement (אופציונלי)
    • תיקון שגיאות אוקטבה גבוהות (> E5/MIDI 76)
    • זיהוי outliers מלודיים (> 14 semitones, confidence < 0.55)
    • תיקון ghost notes
    ↓
[4] Fingering Optimization
    • Beam-search לקווי מלודיה יחידים
    • Cost function: מרחק פרט + מרחק נים + penalty שינוי פוזיציה
    ↓
TabData (grid: column × string × fret)
```

**פונקציית עלות fingering:**
- מרחק פרט מהפוזיציה הנוכחית
- עדיפות נימים סמוכים
- penalty שינוי יד (> 4 פרטות)
- משיכה לנימים גבוהים (0.3 weight)
- penalty לאזורי שגיאת אוקטבה (6×)

---

### audioPlayback.ts

**סינתזה Web Audio — Singleton AudioContext.**

- iOS unlock: `navigator.audioSession.type = 'playback'`
- **playChord()** — arpeggio מנים נמוך לגבוה, sawtooth + lowpass filter, envelope דינמי
- **playScale()** — sine wave סדרתי, envelope עדין
- **onNotes / emitNotes** — כל תו שמושמע מוכרז (גובה, מיקום, הצורה שהוא שייך לה, מתי ולכמה זמן) — זה מה שמניע את ה-playhead על הצוואר, במגש ובאריחים

---

## הפאנלים והכלים

| פאנל | כלים |
|------|------|
| **CHORDS** | By Name · By Ear · Target · Extensions · Practice |
| **SCALES** | Explorer · Triads · Wheel · Practice |
| **INTERVALS** | Explore · Measure · In a Chord · Practice |
| **VOICINGS** | VL Studio · Harmonize · Reharm |
| **TOOLS** | Tuner · Metronome · Tab Builder · Audio→Tab |

לכל כלי כפתור "?" עם הסבר (`content/helpContent.ts`; `scripts/check-help.mjs` מוודא שלאף טאב לא חסר הסבר).

### CHORDS

- **By Name** (`ChordPicker/ChordPickerTab.tsx`) — שורש + טריאדה + אקסטנשן → 6 אצבועים נגינים (`findChordVoicings`). נפתח על האקורד האחרון (C בפעם הראשונה), כל בחירה מושמעת, "Surprise me" מגריל אקורד.
- **By Ear** (`ChordBuilder/ChordBuilderTab.tsx`) — מניחים תווים על הצוואר (כל תו מושמע) ומקבלים זיהוי בזמן אמת (`chordIdentifier.ts`, 3 שלבים), היפוכים ו-variations. בחירת variation מחליקה את הנקודות למקומן.
- **Target** (`Chords/TargetNoteTab.tsx`) — כל האצבועים שמכילים תו מסוים על מיתר מסוים. נפתח על G במיתר e; תוצאה → "+ Add to song".
- **Extensions** (`Chords/DiatonicExtensions.tsx`) — 7 הדרגות של הסולם עם 7/9/11/13. לחיצה על אקורד מנגנת אותו "נבנה" מהשורש למעלה ונועצת את הצורות שלו; לחיצה על צורה מוסיפה אותה לשיר.
- **ProgressionPanel** — אקורדי הקטע: סידור, transpose (מחשב אצבועים חדשים לשמות החדשים), undo/redo, שיתוף, PDF, שמירה לספרייה. האריח שנשמע "מתרומם".

### SCALES

- **Explorer** (`ScalePanel/ScaleExplorer.tsx`) — כל סולם/מודוס על הצוואר, 5 פוזיציות, Tab. נקודות מזוהות לפי דרגה — שורש חדש מחליק את כל הדפוס, מודוס חדש מזיז רק את התווים שמשתנים. **JAM**: לופ I–IV–V–I מטריאדות הסולם עצמו בטמפו השיר, תווי האקורד הנוכחי מסומנים בטבעת.
- **Triads** (`Triads/TriadsGenerator.tsx`) — כל צורות הטריאדה לפי סט מיתרים, היפוך ואזור. **WALK THE NECK** מנגן את כל הצורות מהנמוכה לגבוהה.
- **Wheel** (`ScalePanel/ChordWheel.tsx`) — מעגל החמישיות, אקורדי הסולם לפי פונקציה, ופרוגרסיות נפוצות: ▶ מנגן ומשרטט את המסלול על הגלגל.

### INTERVALS

- **Explore** — שורש + אינטרוול על הצוואר (נפתח על M3), כולל רמזי שירים לחיצים שמנגנים את פתיחת השיר.
- **Measure** — נוגעים בשני תווים ומקבלים את המרחק האמיתי (כולל דצימות).
- **In a Chord** — כל האינטרוולים בתוך אקורד; נפתח על האקורד שנבחר במגש.

### VOICINGS

- **VL Studio** (`Voicings/VoiceLeadingStudio.tsx`) — ארבעה קולות (SATB) על אקורדי הקטע, ספרות רומיות, אזהרות קווינטות/אוקטבות מקבילות וקפיצות. מתחת לטבלה — **קווי קול** (קו לכל קול; שטוח = תו משותף, אלכסון = צעד, מקווקו = קפיצה) ו-playhead בנגינה.
- **Harmonize** (`Voicings/MelodyHarmonizerTab.tsx`) — מלודיה בטאב → הרמוניה (AI). המלודיה היא מלודיית השיר. כפתור Example טוען מלודיה לדוגמה.
- **Reharm** (`Voicings/ReharmonizeTab.tsx`) — ריהרמוניזציה לפי ז'אנר ומתח (AI). האקורדים שהשתנו מסומנים; **Before / After** בלופ אחד שמחליף צד באמצע; "Use in song" / "Keep as variant".

### TOOLS

- **Tuner** (`Tools/Tuner.tsx`) — מיתר שמכוון ±5¢ במשך 0.7 שנ' "ננעל" (✓), המיתר הבא מסומן, 6 מיתרים → חותמת TUNED, ומד של 4 עמודות הלוגו. לחיצה על מיתר משמיעה צליל ייחוס.
- **Metronome** (`Tools/Metronome.tsx`) — טמפו ומשקל של השיר, Tap tempo, subdivisions, פס שמתרוקן בכל פעמה, **Speed trainer** (+4 BPM כל 4 תיבות עד יעד).
- **Tab Builder** (`Tools/TabBuilder.tsx`) — עורך טאב עם טכניקות, ניתוח, PDF, שמירה; ▶ PLAY עם playhead; ריף לדוגמה; שליחה למלודיית השיר וטעינה ממנה.
- **Audio→Tab** (`Tools/AudioToTab.tsx`) — הקלטה/העלאה → תמלול (ראו `audioToTab.ts` למעלה) → טאב, PDF, MIDI; "Use as the song's melody".

#### Tuner — YIN

**קובץ:** `Tools/Tuner.tsx`

כוונן כרומטי בזמן אמת.

**אלגוריתם: YIN (2002, de Cheveigné & Kawahara)**

```
1. Difference function:
   d(τ) = Σ (x(t) - x(t+τ))²

2. Cumulative Mean Normalized Difference (CMNDF):
   d'(τ) = d(τ) / [(1/τ) × Σ d(j)]

3. Threshold detection: d'(τ) < 0.12

4. Parabolic interpolation:
   sub-sample accuracy בין ה-frames
```

**פרמטרים:**
- טווח גיטרה: 55–400 Hz (A1–G4)
- threshold: 0.12
- accuracy: ~1 cent

**תצוגה:**
- שם הנוטה + תדר בhz
- offset בcents (אדום = flat, ירוק = sharp)
- confidence bar
- "Play louder" אם האות חלש

**בחירות:**
- נים יעד (כל 6 נימים בcapo נוכחי)
- כיוון גיטרה (11 presets)

---

---

## תרגול

שלושה תרגולים — אקורדים (CHORDS), סולמות (SCALES), אינטרוולים (INTERVALS) — עם רכיבים משותפים:

- **StreakBoard** (`components/Practice/StreakBoard.tsx`) — רצף שמתגלגל ספרה-ספרה, שיא שמהבהב בשיא חדש, 4 עמודות הלוגו שמתמלאות לקראת אבן הדרך, חותמת "Streak ×5" בכל חמישית, ויעד יומי משותף (20 שאלות, `practice/daily.ts`) עם רצף ימים.
- **משוב** (`practice/feedback.ts`) — תשובה נכונה: צליל עולה + ספירה ליעד; שגויה: זמזום, רטט, רעידה של אזור התשובה. הטעות הראשונה בשאלה נסלחת (`practice/streak.ts`).
- **ענו בנגינה** (`practice/useMicNotes.ts`, `PlayToAnswer`) — המיקרופון מקשיב (YIN, `utils/pitch.ts`), ותו שמוחזק יציב עונה: באיות — ממלא את הקופסה הבאה; באינטרוולים — נגינת התו השני עונה (תווים אחרים מתעלמים).
- **My song** — רמה שמתרגלת את אקורדי השיר ואת סולם השיר.

---

## רכיבי Fretboard

- **InteractiveFretboard** — 6 × 12 לחיץ (By Ear); תו שמונח מושמע ומחליק במיתר כשטוענים אצבוע אחר.
- **DisplayFretboard** — תצוגה (Scale Explorer); נקודות לחיצות, מזוהות לפי `id` כדי להחליק, `target` מוסיף טבעת (Jam).
- **MiniFretboard** — אריחי אצבועים; נדלק רק כשהצורה שלו היא זו שמושמעת.
- **Dot** — הנקודה המשותפת: מיקום (מחליק), כניסה (pop), והדלקה עם טבעת בזמן שהתו נשמע.

---

## אינטגרציות חיצוניות

### Claude API

4 נקודות שימוש:

| פונקציה | קובץ | מודל | תפקיד |
|---------|------|------|--------|
| `reharmonize()` | `reharmonize.ts` | Haiku | שינוי הרמוניה |
| `analyzeProgression()` | `musicalAnalysis.ts` | Haiku | ניתוח אופי מוזיקלי |
| `suggestTabProgressions()` | `analyzeTab.ts` | Sonnet | הצעות פרוגרסיה לטאב |
| `refineNotesWithAI()` | `audioToTab.ts` | Sonnet | תיקון תמלול אודיו |

**הגדרה:** `VITE_ANTHROPIC_API_KEY` ב-.env

### Basic Pitch (ML)

מודל ML open-source לזיהוי pitch:
- **קלט:** mono audio, 22050 Hz
- **פלט:** notes עם confidence + duration
- **פרמטרים per-instrument:** acoustic/electric/bass/ukulele — thresholds שונים

### MT3 Server (אופציונלי)

FastAPI server חיצוני לתמלול:
- URL מוגדר על ידי המשתמש
- מעניק דיוק גבוה יותר לאודיו מורכב

### Tonal.js

ספריית תיאוריה מוזיקלית:
- זיהוי אקורדים (rotations, inversions)
- validation של שמות אקורדים
- chord names חוקיים לAPI

---

## פורמטי יצוא

### PDF (`pdfExport.ts`)

**Progression PDFs:**
- שמות אקורדים
- נוטות
- diagram פרטבורד (SVG)

**Tab PDFs:**
- שורות של 20 עמודות
- labels לנימים (e, B, G, D, A, E)
- סימוני bars
- ניואנסים (טכניקות)

### MIDI (`midiExport.ts`)

**Chord progressions:**
- 2 beats לאקורד ב-BPM מוגדר
- standard MIDI format

**Transcribed notes:**
- Variable-length quantity encoding
- On/Off events per-note עם timing מדויק
- קובץ .mid להורדה

### AlphaTex

- פורמט notation לנגן alphaTab
- יצוא מ-AudioToTab ו-TabBuilder

---

*מסמך זה נוצר אוטומטית מניתוח קוד המקור של ScaleUp.*
*גרסה: אוקטובר 2026*
