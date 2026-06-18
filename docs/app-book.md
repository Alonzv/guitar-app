# ScaleUp — ספר האפליקציה

> מסמך טכני-פונקציונלי מקיף של כלל הכלים, הפיצ'רים והאלגוריתמים

---

## תוכן עניינים

1. [סקירה כללית](#סקירה-כללית)
2. [ארכיטקטורה](#ארכיטקטורה)
3. [מערכת הצבעים והעיצוב](#מערכת-הצבעים-והעיצוב)
4. [טיפוסי הנתונים הבסיסיים](#טיפוסי-הנתונים-הבסיסיים)
5. [כלי עזר ואלגוריתמים](#כלי-עזר-ואלגוריתמים)
6. [לשונית Theory](#לשונית-theory)
   - [Chords — By Ear](#chords--by-ear)
   - [Chords — By Name](#chords--by-name)
   - [Chords — Analyze](#chords--analyze)
   - [Chords — Target Note](#chords--target-note)
   - [Scales](#scales)
   - [Triads](#triads)
   - [Intervals](#intervals)
   - [Wheel — Circle of Fifths](#wheel--circle-of-fifths)
7. [לשונית Voicings](#לשונית-voicings)
   - [Paths](#paths)
   - [Voice Leading](#voice-leading)
   - [Re-Harmonize](#re-harmonize)
8. [לשונית Tools](#לשונית-tools)
   - [Tuner](#tuner)
   - [Metronome](#metronome)
   - [Audio→Tab](#audiotab)
   - [Tab Builder](#tab-builder)
9. [רכיבי Fretboard](#רכיבי-fretboard)
10. [ניהול Progression](#ניהול-progression)
11. [אינטגרציות חיצוניות](#אינטגרציות-חיצוניות)
12. [פורמטי יצוא](#פורמטי-יצוא)

---

## סקירה כללית

ScaleUp היא אפליקציית ווב (PWA) ללימוד תיאוריה מוזיקלית וגיטרה, בנויה עם **React + TypeScript** ו-**Vite**. האפליקציה מיועדת לגיטריסטים בכל הרמות ומשלבת:

- כלי תיאוריה אינטראקטיביים (אקורדים, סולמות, אינטרוולים)
- מנועי ניתוח הרמוני מבוססי אלגוריתמים
- ניתוח AI מבוסס Claude API
- כלי אודיו בזמן אמת (כוונון, מטרונום, תמלול)
- מגוון פורמטי יצוא (PDF, MIDI, AlphaTex)

האפליקציה תומכת בעברית ואנגלית.

---

## ארכיטקטורה

```
src/
├── App.tsx                  # Root — ניהול tabs, dark mode, progression, undo/redo
├── theme.ts                 # Design tokens — T.primary, T.secondary, card(), btn()
├── types/
│   └── music.ts             # כל טיפוסי הנתונים המשותפים
├── utils/
│   ├── musicTheory.ts       # CHROMATIC, TUNINGS, המרות note↔fret
│   ├── scaleUtils.ts        # זיהוי סולמות, עמדות CAGED
│   ├── chordVoicings.ts     # גנרטור ווקאינגים נגינים
│   ├── chordIdentifier.ts   # זיהוי שם אקורד מנוטות
│   ├── voicingPaths.ts      # beam-search למסלולי ווקאינג
│   ├── progressionHelper.ts # זיהוי טונאליות, הצעות אקורדים
│   ├── reharmonize.ts       # Re-harmonization via Claude API
│   ├── musicalAnalysis.ts   # ניתוח פרוגרסיה via Claude API
│   ├── audioToTab.ts        # תמלול אודיו → טאב
│   ├── analyzeTab.ts        # ניתוח טאב ידני + הצעות
│   ├── audioPlayback.ts     # Web Audio synthesis
│   ├── pdfExport.ts         # יצוא PDF (jsPDF)
│   └── midiExport.ts        # יצוא MIDI
└── components/
    ├── ChordBuilder/        # By Ear
    ├── ChordPicker/         # By Name
    ├── Chords/              # Target Note
    ├── ScalePanel/          # Scales + Circle of Fifths
    ├── Triads/              # Triads Generator
    ├── Intervals/           # Explore + Calculate
    ├── Voicings/            # Paths + Voice Leading + Re-Harmonize
    └── Tools/               # Tuner + Metronome + Audio→Tab + Tab Builder
```

### ניהול מצב (State Management)

אין Redux או Zustand — המצב מנוהל לוקאלית עם `useState` + `useRef`. המצב הגלובלי היחיד שמועבר בין קומפוננטות הוא **הפרוגרסיה** (`ChordInProgression[]`), שמנוהלת ב-`App.tsx` עם מחסנית undo/redo מלאה.

---

## מערכת הצבעים והעיצוב

### פלטת Midnight Magic Show

| טוקן | Light | Dark | שימוש |
|------|-------|------|-------|
| `--gc-bg-deep` | `#F0EBE0` | `#111110` | רקע הדף |
| `--gc-bg-card` | `#E8E2D6` | `#1A1918` | כרטיסים |
| `--gc-bg-input` | `#DDD6C8` | `#242220` | שדות קלט |
| `--gc-border` | `#B8B0A0` | `#383530` | גבולות |
| `--gc-primary` | `#CC1C1C` | `#E02020` | כפתורים ראשיים (אדום) |
| `--gc-secondary` | `#1E3898` | `#2A4CC8` | tabs פעילים (כחול מלכותי) |
| `--gc-coral` | `#C8A020` | `#D4A820` | accent זהוב |
| `--gc-text` | `#1A1810` | `#F0EAD8` | טקסט ראשי |

### אפקטים טקסטורה (Retro/Collage)

- **Film grain** — שכבת SVG `feTurbulence` קבועה על כל הדף (opacity 6%)
- **Halftone dots** — גריד נקודות רדיאלי ברקע הדף (18px pitch)
- **Header accent** — אשכול נקודות צבעוני (primary + coral) בפינה ימנית עליונה, נמוג עם `mask-image`
- **Brand stamp** — מסגרת זהובה עם רוטציה של -0.6° על "ScaleUp"

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

**זיהוי מפתח:**
- משווה שורשי האקורדים מול כל 24 מפתחות (major + minor)
- ניקוד לפי fit דיאטוני
- Tie-breakers: נוכחות טוניקה, האקורד הראשון הוא טוניקה

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

---

## לשונית Theory

### Chords — By Ear

**קובץ:** `ChordBuilder/ChordBuilderTab.tsx`

הכלי הראשי לבניית אקורדים על ידי לחיצה על הפרטבורד.

**תכונות:**
- פרטבורד אינטראקטיבי (6 נימים × 12 פרטות) — לחיצה מוסיפה/מסירה נוטה
- בחירת כיוון (11 presets: Standard, Drop D, Open E/D/G/A/C, DADGAD, half-down, D-standard, Drop C)
- Capo (0–11 פרטות) — כל החישובים מתאימים אוטומטית
- זיהוי אקורד בזמן אמת (3-step algorithm)
- תצוגת שם האקורד + אינברסיה + אפקט הcapo
- פירוט intervals (root, 3rd, 5th, 7th + צבעים)
- variations — 2D grid של mini-fretboards עם 6 ווקאינגים חלופיים
- הוספה לפרוגרסיה + undo/redo

**ChordName.tsx**
- שם ראשי גדול + שמות חלופיים (aliases grid)
- "Capo 2 — sounds like Am" (כשcapo פעיל)
- רשימת נוטות

**ChordStructure.tsx**
- פירוט intervals צבעוני:
  - Root = primary (אדום)
  - 3rd = secondary (כחול)
  - 5th = gold (זהב)
  - 7th = purple

**VoicingVariations.tsx**
- grid של mini-fretboards, לחיצה טוענת ווקאינג לעורך הראשי

---

### Chords — By Name

**קובץ:** `ChordPicker/ChordPickerTab.tsx`

בניית אקורד לפי בחירת root + איכות.

**שלבי בחירה:**
1. **Root** — 12 כפתורים (C עד B)
2. **Triad** — Major, Minor, dim, aug, sus2, sus4
3. **Extension** — 7, maj7, 9, add9, 6, 11, 13 (מסוננים לפי triad)
4. **Voicing** — 6 ווקאינגים נגינים בgrid

**פלט:** אקורד עם ווקאינג נבחר → הוספה לפרוגרסיה.

---

### Chords — Analyze

**קובץ:** `ChordBuilder/ChordAnalyzerTab.tsx`

ניתוח הרמוני של הפרוגרסיה הנוכחית.

**תכונות:**
- זיהוי מפתח (e.g., "C major / A minor")
- תצוגת נוטות הסולם
- כל אקורד בפרוגרסיה מקבל:
  - מספר רומי (I, ii, V7 וכו')
  - צבע לפי פונקציה הרמונית:
    - **Tonic** (I, vi) = primary
    - **Subdominant** (IV, ii) = secondary/green
    - **Dominant** (V, vii°) = coral/orange
    - **Non-diatonic** = muted gray

---

### Chords — Target Note

**קובץ:** `Chords/TargetNoteTab.tsx`

מצא ווקאינגים שמכילים נוטה ספציפית על נים ספציפי.

**קלט:**
- Root + איכות אקורד
- נים יעד (0–5)
- פרטה יעד (0–22)

**פלט:**
- כל הווקאינגים המכילים את הנוטה הנעוצה
- ממוינים לפי פרטה ממוצעת (נמוך = עדיף)
- עוברים את כל חוקי הנגינה (barre, span, reach)

**שימוש:** "רוצה לנגן Cmaj7 עם E בנים 1 פרטה 2" → מציג את כל האפשרויות.

---

### Scales

**קבצים:** `ScalePanel/ScalesTab.tsx`, `ScalePanel/ScaleExplorer.tsx`

סייר סולמות אינטראקטיבי עם visualizer פרטבורד.

**בחירות:**
- **Root** — 12 כפתורים
- **סוג סולם** — מקובץ לקטגוריות:
  - *Essential:* Major, Minor, Major Pent, Minor Pent, Blues
  - *Minor Variants:* Harmonic, Melodic
  - *Modes:* Dorian, Phrygian, Lydian, Mixolydian, Locrian, Phrygian Dominant
  - *Other:* Whole Tone, Diminished, Augmented, Double Harmonic
- **עמדה (CAGED)** — 5 עמדות (פרטות 0–3, 2–5, 4–8, 6–10, 9–12)

**תצוגות:**
- Fretboard — Root מודגש, דרגות צבעוניות
- Tab — ASCII tab עם מיקומי הסולם
- כפתור Play — מנגן את הסולם בסדרה

---

### Triads

**קובץ:** `Triads/TriadsGenerator.tsx`

גנרטור טריאדות עם אינברסיות וsets נימים.

**פרמטרים:**
- **סוג טריאדה** — Major, Minor, Diminished, Augmented
- **Root** — 12 כפתורים
- **אינברסיה** — Root, 1st Inversion, 2nd Inversion
- **Set נימים** — E-A-D, A-D-G, D-G-B, G-B-E (כל קבוצת 3 נימים עוקבים)
- **אזור פרטה** — All, 1–4, 5–8, 9–12
- **מצב תצוגה** — Notes (שמות נוטות) / Intervals (סמלי intervals)

**פלט:** grid של mini-fretboards נגינים עם צביעת degrees.

---

### Intervals

**קבצים:** `Intervals/IntervalsTab.tsx`, `IntervalExplore.tsx`, `IntervalCalculate.tsx`

**Explore:**
- Root + interval (14 אפשרויות: 1, b2, 2, b3, 3, 4, b5, 5, b6, 6, b7, 7, 8+)
- Fretboard מציג את שני הצלילים
- Play — מנגן שתי נוטות בסדרה
- תצוגת שם ה-interval + סמל

**Calculate:**
- קלט: שני מיקומים על הפרטבורד
- פלט: שם ה-interval ביניהם

---

### Wheel — Circle of Fifths

**קובץ:** `Tools/WheelTab.tsx`, `ScalePanel/CircleOfFifths.tsx`

גלגל חמישיות אינטראקטיבי.

- 12 מיקומים (outer = major, inner = relative minor)
- לחיצה על טוניקה — מציג את כל אקורדי המפתח:
  - I, IV, V, vi, ii, iii, vii° (major)
  - i, iv, v, ii° (minor)
- צבעים לפי פונקציה הרמונית (Tonic/Subdominant/Dominant)
- אנימציית rotation חלקה
- כל אקורד ניתן להוסיף לפרוגרסיה

---

## לשונית Voicings

### Paths

**קובץ:** `Voicings/VoicingsTab.tsx`

סייר מסלולי ווקאינג לפרוגרסיות שלמות.

**בניית הפרוגרסיה:**
- Root + Triad + Extension (ממשק זהה לBy Name)
- הוספת אקורדים לרצף

**פרמטרי החיפוש:**
- **Genre** — Any, Americana, Swamp, Neo-Soul, Blues, Rock, Country
- **Mode** — Full chords / Triads only
- **Strings** — All / Bass (נימים 1–3) / Treble (נימים 4–6)

**תצוגת מסלולים:**
5 מסלולים ממוינים לפי עלות, כל אחד כולל:
- Mini-fretboard לכל אקורד בפרוגרסיה
- Label: "Open Drones", "Open Position", "Lower Neck", "Mid Neck", "Upper Neck", "High Neck"
- תיאור נרטיבי (e.g., "Open strings drone while fretted notes ring above")
- Smoothness score (0–5 ⭐)

**Interval isolate:** הדגשת degree ספציפי (root, 3rd, 5th, 7th) בכל ווקאינג.

---

### Voice Leading

ניתוח מוזיקלי של מסלול הווקאינגים הנבחר:

- Claude API מנתח את אופי הפרוגרסיה + הז'אנר
- מחזיר בעברית:
  - אופי הרמוני (e.g., "תנועה סלולרית עם פינות בולטות")
  - טיפים נגינה
  - עצת פוזיציה
  - הMסלול המומלץ מתוך 5 האפשרויות

---

### Re-Harmonize

**קובץ:** `utils/reharmonize.ts`

**כלי AI לשינוי הרמוניה.**

**קלט:**
- פרוגרסיה נוכחית
- ז'אנר
- רמת מתח (1–5):
  - 1 = extensions בסיסיים
  - 3 = tritone substitutions
  - 5 = altered dominants + substitute chords מקצוניים

**תהליך (Claude Haiku API):**
- קלט: אקורדים + ז'אנר + רמת מתח
- פלט: פרוגרסיה re-harmonized + ניתוח תיאורטי + הסבר טכניקות

**פלט למשתמש (בעברית):**
- הפרוגרסיה החדשה
- ניתוח אופי הרמוני
- הסבר הטכניקות שנעשה בהן שימוש (e.g., "Tritone sub: G7 → Db7")
- כפתורי השמעה + השוואה

---

## לשונית Tools

### Tuner

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

### Metronome

**קובץ:** `Tools/Metronome.tsx`

מטרונום דיגיטלי עם subdivisions.

**תכונות:**
- BPM: 40–240 (input + ± buttons)
- **Tap Tempo** — מחשב BPM ממיצוע 4 הלחיצות האחרונות
- Subdivisions: רבעים / שמיניות / שישה-עשריות
- **אקצנט** על beat 1 — תדר 1100 Hz vs 880 Hz
- אינדיקטור beat ויזואלי

**מימוש:**
- `AudioContext` + `OscillatorNode` — accuracy מוזיקלית (ללא drift של setTimeout)
- `lookAheadMs = 25ms` — scheduling מראש למניעת glitches
- Beat counter + accent על multiples של subdivisions

---

### Audio→Tab

**קובץ:** `Tools/AudioToTab.tsx`

תמלול קובץ אודיו → טאב גיטרה.

**שלבי הprocessing:**
1. Upload קובץ (MP3/WAV/FLAC/OGG)
2. בחירת כלי (Acoustic / Electric / Bass / Ukulele)
3. בחירת mix (Solo / Full Mix)
4. שרת MT3 (אופציונלי) — URL של FastAPI server חיצוני
5. **עיבוד** (progress indicators לכל שלב):
   - Basic Pitch ML
   - Cleanup (merge, harmonics, duration filter)
   - AI Refine (Claude Sonnet)
   - Fingering optimization

**תצוגת הטאב:**
- SVG מותאם עם labels לנימים + פרטות
- עמודות עם גווני עומק לפי אורך נוטה
- עריכה: לחיצה על תא → הזנת פרטה

**יצוא:**
- PDF (jsPDF — שורות של 20 עמודות, labels, bar marks)
- MIDI (playback)
- AlphaTex (נוטציית tablature)

---

### Tab Builder

**קובץ:** `Tools/TabBuilder.tsx`

עורך טאב ידני עם ניתוח מוזיקלי.

**ממשק:**
- grid 6 שורות × N עמודות (נימים מגבוה לנמוך)
- תאים עריכים — לחיצה → הזנת פרטה (0–22)
- שורת טכניקות — bend (b), slide (/ \\), hammer-on (h), pull-off (p)

**ניתוח אוטומטי:**
1. **זיהוי סולם** — מנתח את כל הנוטות, מחזיר סולם מתאים אחד עם אחוז כיסוי
2. **הצעות פרוגרסיה (AI)** — Claude Sonnet מייצר 3 פרוגרסיות לסולם + מלודיה:
   - Vibe label (e.g., "Dark & Heavy")
   - תיאור בעברית ואנגלית
   - אקורדים תואמים (validated via Tonal.js)

**Playback:** MIDI synthesis של הנוטות

**יצוא:** PDF, MIDI, AlphaTex

---

## רכיבי Fretboard

### InteractiveFretboard.tsx
- 6 × 12 לחיץ
- Toggle נוטה בלחיצה
- תצוגת dots עם צביעה מותאמת (interval colors)

### MiniFretboard.tsx
- תצוגה compact לvoicing tiles
- צביעה לפי interval
- read-only

### DisplayFretboard.tsx
- Read-only לסולמות / intervals
- Dot labels (שמות נוטות)
- Dot colors ממופות

### VerticalScaleFretboard.tsx
- Layout אנכי לתצוגת Tab

---

## ניהול Progression

**קובץ:** `ChordBuilder/ProgressionPanel.tsx`

**תצוגה:**
- רצף אופקי של mini-chord tiles
- תג זיהוי מפתח
- זמן נגינה כולל

**עריכה:**
- הסרת אקורד בודד
- סידור מחדש (חיצים ↑↓)
- transpose (±1 semitone) — שינוי כל השורשים
- מחיקת הכל
- Undo/Redo (מחסנית עד 50 צעדים)

**שיתוף ויצוא:**
- Copy as text ("Am – C – G – D")
- Share URL — base64 encoding של `{n: name, f: fretPositions}[]` ב-hash
- Play all — arpeggio סדרתי
- Export PDF — diagram + notes לכל אקורד

**הצעות:**
- Genre selector
- הצעות הבאות לפי מפתח שזוהה
- Roman numeral input custom
- Hover preview של ווקאינג מוצע

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
*גרסה: יוני 2026*
