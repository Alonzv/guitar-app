import { T } from '../../theme';

// ── Interval names, in both languages ────────────────────────────────────────
// Explore, Measure and In a Chord all name the same thirteen distances. The
// Hebrew uses the names Israeli teachers use (טרצה, קווינטה…) with a plain
// one-line feel, so a beginner gets both the word and what it sounds like.

export type Cons = 'Perfect' | 'Consonant' | 'Mild' | 'Dissonant';

export interface IntervalName {
  semitones: number;
  abbrev: string;
  en: string;
  he: string;
  cons: Cons;
  feelEn: string;
  feelHe: string;
}

export const INTERVAL_NAMES: IntervalName[] = [
  { semitones: 0,  abbrev: 'P1', en: 'Unison',      he: 'אוניסון',      cons: 'Perfect',   feelEn: 'The very same note',                    feelHe: 'אותו תו בדיוק' },
  { semitones: 1,  abbrev: 'm2', en: 'Minor 2nd',   he: 'סקונדה קטנה',  cons: 'Dissonant', feelEn: 'Rubbing and tense',                     feelHe: 'צמוד וצורם, מלא מתח' },
  { semitones: 2,  abbrev: 'M2', en: 'Major 2nd',   he: 'סקונדה גדולה', cons: 'Mild',      feelEn: 'One step up the scale',                 feelHe: 'צעד אחד בסולם' },
  { semitones: 3,  abbrev: 'm3', en: 'Minor 3rd',   he: 'טרצה קטנה',    cons: 'Consonant', feelEn: 'The heart of a minor chord: sad',       feelHe: 'הלב של אקורד מינור: עצוב' },
  { semitones: 4,  abbrev: 'M3', en: 'Major 3rd',   he: 'טרצה גדולה',   cons: 'Consonant', feelEn: 'The heart of a major chord: happy',     feelHe: 'הלב של אקורד מז׳ור: שמח' },
  { semitones: 5,  abbrev: 'P4', en: 'Perfect 4th', he: 'קוורטה',       cons: 'Perfect',   feelEn: 'Open and stable, the sound of sus4',    feelHe: 'פתוח ויציב, הצליל של sus4' },
  { semitones: 6,  abbrev: 'TT', en: 'Tritone',     he: 'טריטון',       cons: 'Dissonant', feelEn: 'The most restless: wants to resolve',   feelHe: 'הכי מתוח שיש, רוצה להיפתר' },
  { semitones: 7,  abbrev: 'P5', en: 'Perfect 5th', he: 'קווינטה',      cons: 'Perfect',   feelEn: 'The most stable: the power chord',      feelHe: 'הכי יציב, זה אקורד הפאוור' },
  { semitones: 8,  abbrev: 'm6', en: 'Minor 6th',   he: 'סקסטה קטנה',   cons: 'Consonant', feelEn: 'A dark colour, common in minor keys',   feelHe: 'צבע כהה, נפוץ בסולם מינורי' },
  { semitones: 9,  abbrev: 'M6', en: 'Major 6th',   he: 'סקסטה גדולה',  cons: 'Consonant', feelEn: 'Warm and sweet',                        feelHe: 'חם ומתוק' },
  { semitones: 10, abbrev: 'm7', en: 'Minor 7th',   he: 'ספטימה קטנה',  cons: 'Mild',      feelEn: 'The bluesy sound of a 7 chord',         feelHe: 'הצליל הבלוזי של אקורד 7' },
  { semitones: 11, abbrev: 'M7', en: 'Major 7th',   he: 'ספטימה גדולה', cons: 'Mild',      feelEn: 'Pulls hard up to the root',             feelHe: 'מושך חזק למעלה אל השורש' },
  { semitones: 12, abbrev: 'P8', en: 'Octave',      he: 'אוקטבה',       cons: 'Perfect',   feelEn: 'The same note, higher',                 feelHe: 'אותו תו, גבוה יותר' },
];

export const CONS_LABEL: Record<Cons, { en: string; he: string }> = {
  Perfect:   { en: 'Stable',          he: 'יציב' },
  Consonant: { en: 'Pleasant',        he: 'נעים' },
  Mild:      { en: 'A little tense',  he: 'קצת מתוח' },
  Dissonant: { en: 'Tense',           he: 'מתוח' },
};

/** Hebrew name of any distance, compound ones as "<simple> + octave". */
export function heName(semis: number): string {
  const d = Math.abs(semis);
  const oct = Math.floor(d / 12), rem = d % 12;
  if (rem === 0) return oct === 0 ? 'אוניסון' : oct === 1 ? 'אוקטבה' : `${oct} אוקטבות`;
  const base = INTERVAL_NAMES[rem].he;
  return oct === 0 ? base : oct === 1 ? `${base} + אוקטבה` : `${base} + ${oct} אוקטבות`;
}

export const semisLabel = (n: number, he: boolean) =>
  he ? (n === 1 ? 'חצי טון אחד' : `${n} חצאי טונים`) : `${n} semitone${n === 1 ? '' : 's'}`;

export const fretsLabel = (n: number, he: boolean) =>
  he ? (n === 1 ? 'סריג אחד' : `${n} סריגים`) : `${n} fret${n === 1 ? '' : 's'}`;

/** Two or three small choices in one glass capsule (Together / One by one). */
export function Segment<V extends string>({ label, items, value, onChange }: {
  label: string; items: { id: V; label: string }[]; value: V; onChange: (v: V) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label}
      style={{ display: 'inline-flex', padding: 4, gap: 2, borderRadius: 22, background: 'rgba(255,255,255,0.08)' }}>
      {items.map(it => {
        const on = it.id === value;
        return (
          <button key={it.id} role="radio" aria-checked={on} onClick={() => onChange(it.id)} className="gc-no-bar"
            style={{ height: 36, padding: '0 14px', borderRadius: 18, fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap',
              background: on ? T.text : 'transparent', color: on ? '#000' : T.text }}>
            <bdi dir="auto">{it.label}</bdi>
          </button>
        );
      })}
    </div>
  );
}

/** The big centred answer: the short name, the full name, one quiet line. */
export function IntervalStage({ kicker, abbrev, name, line, desktop }: {
  kicker: React.ReactNode; abbrev: string; name: string; line: React.ReactNode; desktop?: boolean;
}) {
  const size = desktop ? 104 : 84;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, textAlign: 'center', minWidth: 0 }}>
      <span style={{ fontSize: 15, fontWeight: 600, color: T.textMuted }}>{kicker}</span>
      <h2 className="gc-notation" dir="ltr" style={{ margin: 0, fontFamily: 'var(--su-display)', fontSize: size, lineHeight: `${size + 4}px`, fontWeight: 700, letterSpacing: '-0.045em' }}>
        {abbrev}
      </h2>
      <span style={{ fontSize: desktop ? 26 : 22, fontWeight: 700, letterSpacing: '-0.02em' }}>{name}</span>
      <span className="su-sub" style={{ fontSize: 15, marginTop: 2 }}>{line}</span>
    </div>
  );
}

/** Neck legend: a coloured dot and its word. */
export const legendDot = (fill: string, label: React.ReactNode) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: T.textMuted }}>
    <span aria-hidden style={{ width: 11, height: 11, borderRadius: '50%', background: fill, display: 'inline-block' }} />{label}
  </span>
);
