import { useMemo, useState } from 'react';
import { Scale } from '@tonaljs/tonal';
import { T, card } from '../../theme';

// ── Diatonic chord extensions ────────────────────────────────────────────────
// A reference sheet: what each degree of a major scale becomes when you stack
// the 7th, 9th, 11th and 13th on it. Grouped by chord family (major / dominant
// / minor / diminished) because that's what makes the logic click, and spelled
// with real chord names in the chosen key so you don't have to translate Roman
// numerals in your head. Where an extension is normally avoided we say so
// instead of printing a chord nobody plays.

const KEYS = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F'];
const STEPS = ['7', '9', '11', '13'] as const;
type Step = typeof STEPS[number];

// suffix per degree per extension; null = normally not used (we explain why).
type Row = Record<Step, string | null>;
interface Degree { deg: number; roman: string; row: Row }
interface Family {
  id: string;
  degrees: Degree[];
  note?: { en: string; he: string };          // footnote for the whole family
  marks?: Partial<Record<Step, number[]>>;    // degrees whose cell carries the ⓘ mark
}

const FAMILIES: Family[] = [
  {
    id: 'major',
    degrees: [
      { deg: 1, roman: 'I',  row: { '7': 'maj7', '9': 'maj9', '11': 'maj11',   '13': 'maj13' } },
      { deg: 4, roman: 'IV', row: { '7': 'maj7', '9': 'maj9', '11': 'maj7#11', '13': 'maj13' } },
    ],
    marks: { '11': [4] },
    note: {
      en: 'On IV the 11th is raised (#11) — a natural 11 would clash with the chord’s 3rd.',
      he: 'בדרגה 4 ההרחבה היא #11 — אחת־עשרה טבעית מתנגשת עם השלישית של האקורד.',
    },
  },
  {
    id: 'dominant',
    degrees: [
      { deg: 5, roman: 'V', row: { '7': '7', '9': '9', '11': '11', '13': '13' } },
    ],
    note: {
      en: 'The tension chord of the key — it wants to resolve back to I.',
      he: 'אקורד המתח של הסולם — הוא "מבקש" להיפתר חזרה לדרגה 1.',
    },
  },
  {
    id: 'minor',
    degrees: [
      { deg: 2, roman: 'ii',  row: { '7': 'm7', '9': 'm9', '11': 'm11', '13': 'm13' } },
      { deg: 3, roman: 'iii', row: { '7': 'm7', '9': null, '11': 'm11', '13': null } },
      { deg: 6, roman: 'vi',  row: { '7': 'm7', '9': 'm9', '11': 'm11', '13': null } },
    ],
    note: {
      en: 'A dash means the extension clashes there, so players usually stop at the previous one.',
      he: 'מקף מציין שההרחבה יוצרת דיסוננס בדרגה הזו, ולכן לרוב עוצרים בהרחבה הקודמת.',
    },
  },
  {
    id: 'dim',
    degrees: [
      { deg: 7, roman: 'vii', row: { '7': 'm7b5', '9': null, '11': null, '13': null } },
    ],
    note: {
      en: 'Half-diminished. In plain diatonic playing you normally stop at the 7th.',
      he: 'חצי־מוקטן. בנגינה דיאטונית רגילה עוצרים בדרך כלל בהרחבת ה-7.',
    },
  },
];

const COPY = {
  en: {
    title: 'Diatonic Extensions',
    intro: 'Stack a 7th, 9th, 11th or 13th on each degree of a major scale and this is what you get.',
    key: 'Key',
    ext: 'Ext',
    families: {
      major:    { name: 'Major family', degs: 'degrees 1 · 4',     feel: 'Open, dreamy and settled.' },
      dominant: { name: 'Dominant',     degs: 'degree 5',          feel: 'The tension chord — it pulls home.' },
      minor:    { name: 'Minor family', degs: 'degrees 2 · 3 · 6', feel: 'Soft, moodier, more sophisticated than a plain minor.' },
      dim:      { name: 'Diminished',   degs: 'degree 7',          feel: 'Very high tension, leads back to degree 1.' },
    } as Record<string, { name: string; degs: string; feel: string }>,
    stops: 'usually stop here',
  },
  he: {
    title: 'הרחבות אקורדים בסולם',
    intro: 'מה מקבלים כשמוסיפים 7, 9, 11 או 13 לכל דרגה בסולם מז׳ור.',
    key: 'סולם',
    ext: 'הרחבה',
    families: {
      major:    { name: 'משפחת המז׳ור', degs: 'דרגות 1 · 4',     feel: 'צבע פתוח, חולמני ויציב.' },
      dominant: { name: 'הדומיננטה',    degs: 'דרגה 5',          feel: 'אקורד המתח — מושך חזרה הביתה.' },
      minor:    { name: 'משפחת המינור', degs: 'דרגות 2 · 3 · 6', feel: 'סאונד רך, עגום ומתוחכם יותר ממינור בסיסי.' },
      dim:      { name: 'המשפחה המוקטנת', degs: 'דרגה 7',        feel: 'מתח גבוה מאוד, מוביל חזרה לדרגה 1.' },
    } as Record<string, { name: string; degs: string; feel: string }>,
    stops: 'כאן לרוב עוצרים',
  },
};

const LBL: React.CSSProperties = {
  margin: 0, fontSize: 10, color: '#9C958C', fontFamily: 'var(--gc-mono)',
  letterSpacing: '0.14em', textTransform: 'uppercase',
};

export function DiatonicExtensions({ desktop }: { desktop?: boolean } = {}) {
  const [lang, setLang] = useState<'en' | 'he'>('en');
  const [key, setKey] = useState('C');
  const rtl = lang === 'he';
  const t = COPY[lang];

  // Scale degrees, properly spelled for the chosen key (F# major → E#, not F).
  const roots = useMemo(() => Scale.get(`${key} major`).notes, [key]);

  const sel: React.CSSProperties = {
    appearance: 'none', WebkitAppearance: 'none', background: T.bgInput,
    border: `1px solid ${T.border}`, borderRadius: 0, color: T.text,
    fontSize: 14, fontWeight: 700, padding: '7px 12px', cursor: 'pointer', outline: 'none',
  };
  const CW = desktop ? 116 : 96;   // per-degree column width
  const LW = 44;                   // extension label column

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} style={{ fontFamily: 'var(--gc-font)', maxWidth: desktop ? 860 : undefined, margin: desktop ? '0 auto' : undefined }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: T.text }}>{t.title}</h2>
        <div style={{ display: 'flex', border: `1px solid ${T.border}` }}>
          {(['en', 'he'] as const).map((l, i) => (
            <button key={l} onClick={() => setLang(l)} style={{
              padding: '6px 14px', borderRadius: 0, cursor: 'pointer', fontSize: 12,
              fontWeight: lang === l ? 600 : 400, borderLeft: i > 0 ? `1px solid ${T.border}` : 'none',
              background: lang === l ? T.secondary : 'transparent', color: lang === l ? '#fff' : T.textDim,
            }}>{l === 'en' ? 'EN' : 'HE'}</button>
          ))}
        </div>
      </div>
      <p style={{ margin: '0 0 16px', fontSize: 13, lineHeight: 1.6, color: T.textMuted }}>{t.intro}</p>

      {/* Key selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
        <span style={LBL}>{t.key}</span>
        <select dir="ltr" value={key} onChange={e => setKey(e.target.value)} style={sel}>
          {KEYS.map(k => <option key={k} value={k}>{k} major</option>)}
        </select>
      </div>

      {/* Family blocks */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {FAMILIES.map(fam => {
          const meta = t.families[fam.id];
          return (
            <div key={fam.id} style={card({ padding: desktop ? '14px 16px' : '12px 12px' })}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: T.text }}>{meta.name}</h3>
                <span style={{ ...LBL, fontSize: 10 }}>{meta.degs}</span>
              </div>
              <p style={{ margin: '0 0 12px', fontSize: 12.5, color: T.textMuted }}>{meta.feel}</p>

              <div style={{ overflowX: 'auto' }}>
                <div dir="ltr" style={{ display: 'inline-flex', flexDirection: 'column', minWidth: '100%' }}>
                  {/* Header: degree + real chord root */}
                  <div style={{ display: 'flex', borderBottom: `1px solid ${T.border}` }}>
                    <div style={{ width: LW, flexShrink: 0 }} />
                    {fam.degrees.map(d => (
                      <div key={d.deg} style={{ width: CW, flexShrink: 0, padding: '0 0 6px', textAlign: 'center' }}>
                        <div style={{ fontFamily: 'var(--gc-mono)', fontSize: 11, fontWeight: 700, color: T.textMuted }}>{d.roman}</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{roots[d.deg - 1]}</div>
                      </div>
                    ))}
                  </div>
                  {/* One row per extension */}
                  {STEPS.map(step => (
                    <div key={step} style={{ display: 'flex', alignItems: 'stretch', borderBottom: `1px solid ${T.border}` }}>
                      <div style={{
                        width: LW, flexShrink: 0, display: 'flex', alignItems: 'center',
                        fontFamily: 'var(--gc-mono)', fontSize: 12, fontWeight: 700, color: T.textDim,
                      }}>{step}</div>
                      {fam.degrees.map(d => {
                        const suffix = d.row[step];
                        const marked = fam.marks?.[step]?.includes(d.deg);
                        return (
                          <div key={d.deg} style={{
                            width: CW, flexShrink: 0, padding: '9px 2px', textAlign: 'center',
                            fontSize: 14, fontWeight: 700,
                            color: suffix ? T.text : T.textDim,
                          }}>
                            {suffix
                              ? <>{roots[d.deg - 1]}{suffix}{marked && <span style={{ color: T.textMuted, fontWeight: 400 }}> ⓘ</span>}</>
                              : <span title={t.stops} style={{ fontWeight: 400 }}>—</span>}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>

              {fam.note && (
                <p style={{ margin: '10px 0 0', fontSize: 12, lineHeight: 1.55, color: T.textDim }}>
                  {fam.note[lang]}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
