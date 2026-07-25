import { useEffect, useMemo, useState } from 'react';
import { Scale } from '@tonaljs/tonal';
import { findChordVoicings } from '../../utils/chordVoicings';
import { MiniFretboard } from '../Fretboard/MiniFretboard';
import { T, card } from '../../theme';

// ── Diatonic Extensions ──────────────────────────────────────────────────────
// Pick a key and see its seven degrees side by side. Each degree says plainly
// whether it is a major, minor, dominant or diminished chord, and lists the
// extensions it can take. A natural-minor key is the same set of chords as its
// relative major, just started from the sixth degree — so both modes are driven
// by one pattern, which keeps the two views consistent by construction.

type Family = 'major' | 'minor' | 'dominant' | 'dim';
const STEPS = ['7', '9', '11', '13'] as const;
type Step = typeof STEPS[number];

interface Shape {
  family: Family;
  triad: string;                          // suffix for the plain triad
  ext: Record<Step, string | null>;       // suffix per extension; null = normally avoided
}

// Degrees I..vii of a major key.
const MAJOR_PATTERN: Shape[] = [
  { family: 'major',    triad: '',    ext: { '7': 'maj7',  '9': 'maj9', '11': 'maj11',   '13': 'maj13' } },
  { family: 'minor',    triad: 'm',   ext: { '7': 'm7',    '9': 'm9',   '11': 'm11',     '13': 'm13'   } },
  { family: 'minor',    triad: 'm',   ext: { '7': 'm7',    '9': null,   '11': 'm11',     '13': null    } },
  { family: 'major',    triad: '',    ext: { '7': 'maj7',  '9': 'maj9', '11': 'maj7#11', '13': 'maj13' } },
  { family: 'dominant', triad: '',    ext: { '7': '7',     '9': '9',    '11': '11',      '13': '13'    } },
  { family: 'minor',    triad: 'm',   ext: { '7': 'm7',    '9': 'm9',   '11': 'm11',     '13': null    } },
  { family: 'dim',      triad: 'dim', ext: { '7': 'm7b5',  '9': null,   '11': null,      '13': null    } },
];

// Natural minor = the same chords starting from the relative major's 6th degree.
const MINOR_PATTERN: Shape[] = [5, 6, 0, 1, 2, 3, 4].map(i => MAJOR_PATTERN[i]);

const ROMAN_MAJOR = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
const ROMAN_MINOR = ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII'];

const KEYS_MAJOR = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F'];
const KEYS_MINOR = ['A', 'E', 'B', 'F#', 'C#', 'G#', 'D', 'G', 'C', 'F', 'Bb', 'Eb'];

const COPY = {
  en: {
    title: 'Diatonic Extensions',
    intro: 'Pick a key to see its seven chords and how far each one can be extended.',
    key: 'Key', mode: 'Mode', major: 'Major', minor: 'Minor',
    families: { major: 'Major', minor: 'Minor', dominant: 'Dominant', dim: 'Diminished' } as Record<Family, string>,
    familiesShort: { major: 'Maj', minor: 'Min', dominant: 'Dom', dim: 'Dim' } as Record<Family, string>,
    feel: {
      major: 'Open and settled',
      minor: 'Soft and moodier',
      dominant: 'Tense — pulls home',
      dim: 'Very tense — leads to 1',
    } as Record<Family, string>,
    legendTitle: 'How to read it',
    legend: [
      'Each column is one degree of the key.',
      'The big name is the plain chord — an “m” means minor.',
      'Below it: the extensions that degree can take.',
      'A dash means that extension clashes there, so players stop at the one above.',
    ],
    sharp11: 'The 11th is raised (#11) so it does not clash with the chord’s 3rd.',
    shapes: 'shapes on the neck',
    noShapes: 'No comfortable shape found.',
  },
  he: {
    title: 'הרחבות אקורדים בסולם',
    intro: 'בוחרים סולם ורואים את שבעת האקורדים שלו ועד כמה כל אחד יכול להתרחב.',
    key: 'סולם', mode: 'סוג', major: 'מז׳ור', minor: 'מינור',
    families: { major: 'מז׳ור', minor: 'מינור', dominant: 'דומיננטה', dim: 'מוקטן' } as Record<Family, string>,
    familiesShort: { major: 'מז׳', minor: 'מינ', dominant: 'דומ', dim: 'מוק' } as Record<Family, string>,
    feel: {
      major: 'פתוח ויציב',
      minor: 'רך ועגום יותר',
      dominant: 'מתוח — מושך הביתה',
      dim: 'מתוח מאוד — מוביל ל-1',
    } as Record<Family, string>,
    legendTitle: 'איך לקרוא',
    legend: [
      'כל עמודה היא דרגה אחת בסולם.',
      'השם הגדול הוא האקורד הבסיסי — האות m מציינת מינור.',
      'מתחתיו: ההרחבות שהדרגה יכולה לקבל.',
      'מקף מציין הרחבה שיוצרת דיסוננס — שם עוצרים בהרחבה שמעליה.',
    ],
    sharp11: 'האחת־עשרה מוגבהת (#11) כדי שלא תתנגש עם השלישית של האקורד.',
    shapes: 'אחיזות על הצוואר',
    noShapes: 'לא נמצאה אחיזה נוחה.',
  },
};

const LBL: React.CSSProperties = {
  margin: 0, fontSize: 10, color: '#9C958C', fontFamily: 'var(--gc-mono)',
  letterSpacing: '0.14em', textTransform: 'uppercase',
};

export function DiatonicExtensions({ desktop }: { desktop?: boolean } = {}) {
  const [lang, setLang] = useState<'en' | 'he'>('en');
  const [mode, setMode] = useState<'major' | 'minor'>('major');
  const [key, setKey] = useState('C');
  const rtl = lang === 'he';
  const t = COPY[lang];

  const keys = mode === 'major' ? KEYS_MAJOR : KEYS_MINOR;
  const pattern = mode === 'major' ? MAJOR_PATTERN : MINOR_PATTERN;
  const romans = mode === 'major' ? ROMAN_MAJOR : ROMAN_MINOR;

  // Scale degrees spelled for the chosen key (F# major → E#, not F).
  const roots = useMemo(
    () => Scale.get(`${key} ${mode === 'major' ? 'major' : 'minor'}`).notes,
    [key, mode],
  );

  // ── Chord-shape popover ────────────────────────────────────────────────────
  // Hovering (or tapping, for touch) a chord name floats its shapes on the neck.
  const [peek, setPeek] = useState<{ name: string; x: number; y: number } | null>(null);
  const shapeCount = desktop ? 3 : 2;
  const shapes = useMemo(
    () => (peek ? findChordVoicings(peek.name, shapeCount) : []),
    [peek, shapeCount],
  );
  useEffect(() => {
    if (!peek) return;
    const close = () => setPeek(null);
    window.addEventListener('scroll', close, true);
    return () => window.removeEventListener('scroll', close, true);
  }, [peek]);

  const peekAt = (name: string, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setPeek({ name, x: r.left + r.width / 2, y: r.bottom });
  };
  const peekProps = (name: string) => ({
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => peekAt(name, e.currentTarget),
    onMouseLeave: () => setPeek(null),
    // Touch has no hover — tapping toggles the same popover.
    onClick: (e: React.MouseEvent<HTMLElement>) => {
      if (peek?.name === name) { setPeek(null); return; }
      peekAt(name, e.currentTarget);
    },
    style: { cursor: 'pointer' } as React.CSSProperties,
  });

  const switchMode = (m: 'major' | 'minor') => {
    setMode(m);
    // Keep a valid key for the new mode; C major ↔ A minor as the default pair.
    setKey(k => ((m === 'major' ? KEYS_MAJOR : KEYS_MINOR).includes(k) ? k : (m === 'major' ? 'C' : 'A')));
  };

  const sel: React.CSSProperties = {
    appearance: 'none', WebkitAppearance: 'none', background: T.bgInput,
    border: `1px solid ${T.border}`, borderRadius: 0, color: T.text, width: '100%',
    fontSize: 15, fontWeight: 700, padding: '9px 12px', cursor: 'pointer', outline: 'none',
  };
  const modeBtn = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '8px 4px', borderRadius: 0, cursor: 'pointer', fontSize: 12,
    fontWeight: active ? 700 : 400, border: 'none',
    borderLeft: '3px solid var(--gc-bar-color)',
    background: active ? T.secondary : T.bgInput, color: active ? '#fff' : T.textMuted,
  });


  const legend = (
    <div style={card({ padding: '11px 13px' })}>
      <p style={{ ...LBL, marginBottom: 8 }}>{t.legendTitle}</p>
      <ul style={{ margin: 0, paddingInlineStart: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {t.legend.map((line, i) => (
          <li key={i} style={{ fontSize: 12, lineHeight: 1.5, color: T.textMuted }}>{line}</li>
        ))}
      </ul>
    </div>
  );

  const pickers = (
    <div style={{ display: 'flex', gap: 10, flexDirection: desktop ? 'column' : 'row', alignItems: desktop ? 'stretch' : 'flex-end' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ ...LBL, marginBottom: 6 }}>{t.mode}</p>
        <div style={{ display: 'flex', border: `1px solid ${T.border}` }}>
          <button onClick={() => switchMode('major')} style={modeBtn(mode === 'major')}>{t.major}</button>
          <button onClick={() => switchMode('minor')} style={modeBtn(mode === 'minor')}>{t.minor}</button>
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ ...LBL, marginBottom: 6 }}>{t.key}</p>
        <select dir="ltr" value={key} onChange={e => setKey(e.target.value)} style={sel}>
          {keys.map(k => <option key={k} value={k}>{k} {mode === 'major' ? 'major' : 'minor'}</option>)}
        </select>
      </div>
    </div>
  );

  const controls = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {pickers}
      {legend}
    </div>
  );

  // Seven equal columns that shrink to whatever width is available — the whole
  // key is meant to be readable at a glance, so nothing ever scrolls. Type sizes
  // scale with the viewport so the narrowest phone still fits all seven.
  const fs = (min: number, vw: number, max: number) => `clamp(${min}px, ${vw}vw, ${max}px)`;
  const grid = (
    <div dir="ltr" style={{
      display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
      gap: desktop ? 6 : 3, minWidth: 0, alignItems: 'stretch',
    }}>
      {pattern.map((shape, i) => {
        const root = roots[i] ?? '';
        const raised11 = shape.ext['11'] === 'maj7#11';
        return (
          <div key={i} style={{
            ...card({ padding: desktop ? '9px 6px' : '6px 3px' }),
            minWidth: 0, display: 'flex', flexDirection: 'column', gap: desktop ? 5 : 3,
            overflowWrap: 'anywhere',
          }}>
            {/* Degree + plain chord */}
            <div style={{ textAlign: 'center', minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--gc-mono)', fontSize: fs(8, 1.1, 11), fontWeight: 700, color: T.textDim }}>{romans[i]}</div>
              <div {...peekProps(`${root}${shape.triad}`)} style={{
                fontSize: fs(12, 2.1, 19), fontWeight: 700, lineHeight: 1.15, cursor: 'pointer',
                color: peek?.name === `${root}${shape.triad}` ? T.success : T.text,
              }}>{root}{shape.triad}</div>
              <div style={{ ...LBL, fontSize: fs(7, 0.9, 9), marginTop: 2, letterSpacing: '0.06em' }}>
                {(desktop ? t.families : t.familiesShort)[shape.family]}
              </div>
              {desktop && (
                <div style={{ fontSize: 10.5, color: T.textDim, marginTop: 3, minHeight: 26, lineHeight: 1.25 }}>{t.feel[shape.family]}</div>
              )}
            </div>

            {/* Extensions */}
            <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: desktop ? 5 : 3, display: 'flex', flexDirection: 'column', gap: desktop ? 3 : 2 }}>
              {STEPS.map(step => {
                const suffix = shape.ext[step];
                return (
                  <div key={step} style={{ display: 'flex', alignItems: 'baseline', gap: 3, minWidth: 0 }}>
                    {/* On mobile the suffix already names the step (maj9, m11…), so the
                        number is only spelled out on the rows that have no chord. */}
                    {(desktop || !suffix) && (
                      <span style={{ fontFamily: 'var(--gc-mono)', fontSize: fs(7, 0.9, 10), fontWeight: 700, color: T.textDim, flexShrink: 0 }}>{step}</span>
                    )}
                    {suffix ? (
                      // The root is already the column title, so narrow screens list
                      // just the suffix — that keeps names from wrapping mid-word.
                      <span {...peekProps(`${root}${suffix}`)} style={{
                        fontSize: fs(8.5, 1.5, 12.5), fontWeight: 700, cursor: 'pointer', minWidth: 0,
                        color: peek?.name === `${root}${suffix}` ? T.success : T.text,
                      }}>{desktop ? `${root}${suffix}` : suffix}</span>
                    ) : (
                      <span style={{ fontSize: fs(8.5, 1.5, 12.5), color: T.textDim }}>—</span>
                    )}
                  </div>
                );
              })}
            </div>

            {raised11 && desktop && (
              <p style={{ margin: 0, fontSize: 10, lineHeight: 1.4, color: T.textDim }}>{t.sharp11}</p>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} style={{ fontFamily: 'var(--gc-font)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
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

      {desktop ? (
        <div style={{ display: 'grid', gridTemplateColumns: '210px minmax(0, 1fr)', gap: 24, alignItems: 'start' }}>
          {controls}
          {grid}
        </div>
      ) : (
        // Mobile: pickers, then the chart itself, then the legend — so the seven
        // degrees are on screen straight away rather than pushed below the fold.
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          {pickers}
          {grid}
          {legend}
        </div>
      )}

      {peek && <ShapePopover name={peek.name} x={peek.x} y={peek.y} shapes={shapes} title={t.shapes} empty={t.noShapes} />}
    </div>
  );
}

// Floating chord-shape panel. Sized so each diagram is properly readable —
// wide enough to see the dots, not blown up out of proportion — and clamped so
// it never runs off the edge of the viewport.
function ShapePopover({ name, x, y, shapes, title, empty }: {
  name: string; x: number; y: number; shapes: { string: number; fret: number }[][]; title: string; empty: string;
}) {
  const DIAGRAM = 168;                       // per-shape width — clear, not miniature
  const cols = Math.max(shapes.length, 1);
  const PAD = 14;
  const width = Math.min(cols * DIAGRAM + (cols - 1) * 10 + PAD * 2, window.innerWidth - 16);
  const left = Math.max(8, Math.min(x - width / 2, window.innerWidth - width - 8));
  const estH = 190;
  const flipUp = y + estH > window.innerHeight;
  const top = flipUp ? Math.max(8, y - estH - 28) : y + 8;

  return (
    <div dir="ltr" style={{
      position: 'fixed', left, top, width, zIndex: 1000,
      background: T.bgCard, border: `1px solid ${T.border}`,
      borderLeft: '4px solid var(--gc-bar-color)', padding: PAD,
      boxShadow: 'var(--gc-offset)', pointerEvents: 'none',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: T.text }}>{name}</span>
        <span style={{ fontSize: 10, color: '#9C958C', fontFamily: 'var(--gc-mono)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>{title}</span>
      </div>
      {shapes.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12, color: T.textMuted }}>{empty}</p>
      ) : (
        <div style={{ display: 'flex', gap: 10 }}>
          {shapes.map((v, i) => (
            <div key={i} style={{ width: DIAGRAM, flexShrink: 0 }}>
              <MiniFretboard voicing={v} showStringLabels showFretNumbers />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
