import { useMemo, useState } from 'react';
import { Scale, Note } from '@tonaljs/tonal';
import { findChordVoicings } from '../../utils/chordVoicings';
import { MiniFretboard } from '../Fretboard/MiniFretboard';
import { T } from '../../theme';
import { Fold, GlassSelect, PlayButton } from '../ChordBuilder/Stage';
import { StopActions } from '../Transit/StopActions';
import { Sheet } from '../Workspace/Sheet';
import { formatChordName } from '../../utils/chordIdentifier';
import { useLang } from '../../contexts/LanguageContext';
import { previewRun, previewChordName, chordMidis } from '../../utils/previewSound';
import { useOptionalSong } from '../../song/SongContext';
import type { ChordInProgression } from '../../types/music';
import { keyName } from '../../utils/harmonicAnalysis';

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
    heading: 'How far each chord can stretch',
    intro: 'The seven chords of the key, and the notes each one can add on top.',
    key: 'Key', mode: 'Mode', major: 'Major', minor: 'Minor',
    families: { major: 'Major', minor: 'Minor', dominant: 'Dominant', dim: 'Diminished' } as Record<Family, string>,
    familiesShort: { major: 'Maj', minor: 'Min', dominant: 'Dom', dim: 'Dim' } as Record<Family, string>,
    feel: {
      major: 'Open and settled',
      minor: 'Soft and moodier',
      dominant: 'Tense, pulls home',
      dim: 'Very tense, leads to 1',
    } as Record<Family, string>,
    legendTitle: 'How to read it',
    legend: [
      'Each row is one degree of the key.',
      'The big name is the plain chord; an “m” means minor.',
      'Beside it: the extensions that degree can take. Tap one to hear it and see shapes.',
      'A crossed-out number means that extension clashes there, so players stop at the one before it.',
    ],
    sharp11: 'The 11th is raised (#11) so it does not clash with the chord’s 3rd.',
    shapes: 'Shapes on the neck',
    noShapes: 'No comfortable shape found.',
    play: 'Play', addHint: 'Tap a shape to add it to your song',
  },
  he: {
    title: 'הרחבות אקורדים בסולם',
    heading: 'עד כמה כל אקורד יכול להתרחב',
    intro: 'שבעת האקורדים של הסולם, והתווים שכל אחד יכול להוסיף מעליו.',
    key: 'סולם', mode: 'סוג', major: 'מז׳ור', minor: 'מינור',
    families: { major: 'מז׳ור', minor: 'מינור', dominant: 'דומיננטה', dim: 'מוקטן' } as Record<Family, string>,
    familiesShort: { major: 'מז׳', minor: 'מינ', dominant: 'דומ', dim: 'מוק' } as Record<Family, string>,
    feel: {
      major: 'פתוח ויציב',
      minor: 'רך ועגום יותר',
      dominant: 'מתוח, מושך הביתה',
      dim: 'מתוח מאוד, מוביל ל-1',
    } as Record<Family, string>,
    legendTitle: 'איך לקרוא',
    legend: [
      'כל שורה היא דרגה אחת בסולם.',
      'השם הגדול הוא האקורד הבסיסי. האות m אומרת מינור.',
      'לידו: ההרחבות שהדרגה יכולה לקבל. הקישו כדי לשמוע ולראות אחיזות.',
      'מספר מחוק אומר שההרחבה הזו נשמעת צורמת שם, אז עוצרים בהרחבה שלפניה.',
    ],
    sharp11: 'האחת־עשרה מוגבהת (#11) כדי שלא תתנגש עם השלישית של האקורד.',
    shapes: 'אחיזות על הצוואר',
    noShapes: 'לא נמצאה אחיזה נוחה.',
    play: 'נגן', addHint: 'הקישו על אחיזה כדי להוסיף אותה לשיר',
  },
};

export function DiatonicExtensions({ desktop, onAddToProgression }: {
  desktop?: boolean;
  /** Adds a chord (in the shape tapped in its popover) to the song. */
  onAddToProgression?: (item: ChordInProgression) => void;
} = {}) {
  const { lang, rtl } = useLang();
  const [mode, setMode] = useState<'major' | 'minor'>('major');
  const [key, setKey] = useState('C');
  const t = COPY[lang];

  const pattern = mode === 'major' ? MAJOR_PATTERN : MINOR_PATTERN;
  const romans = mode === 'major' ? ROMAN_MAJOR : ROMAN_MINOR;

  // Scale degrees spelled for the chosen key (F# major → E#, not F).
  const roots = useMemo(
    () => Scale.get(`${key} ${mode === 'major' ? 'major' : 'minor'}`).notes,
    [key, mode],
  );

  // A tapped chord opens a sheet with its shapes; a shape adds it to the song.
  const [sheet, setSheet] = useState<{ name: string; family: Family } | null>(null);
  const shapes = useMemo(() => (sheet ? findChordVoicings(sheet.name, 3) : []), [sheet]);
  // Built up from the root, note by note, so each added 7th, 9th, 11th or 13th
  // is heard landing on top of the stack.
  const hearTower = (name: string) => {
    const tower = chordMidis(name, 3);
    if (tower.length) previewRun(tower); else previewChordName(name);
  };
  const openChord = (name: string, family: Family) => { hearTower(name); setSheet({ name, family }); };
  const [legendOpen, setLegendOpen] = useState(false);

  // Opens on the song's key, and follows it when the song's key changes.
  const songKey = useOptionalSong()?.key ?? null;
  const songKeyId = songKey ? `${songKey.tonicPc}:${songKey.mode}` : '';
  const [seenKey, setSeenKey] = useState('');
  if (songKeyId !== seenKey) {
    setSeenKey(songKeyId);
    if (songKey) {
      const root = keyName(songKey, 'en').split(' ')[0];
      const list = songKey.mode === 'major' ? KEYS_MAJOR : KEYS_MINOR;
      const pc = Note.chroma(root);
      setMode(songKey.mode);
      setKey(list.find(k => Note.chroma(k) === pc) ?? (songKey.mode === 'major' ? 'C' : 'A'));
    }
  }

  const toolbar = (
    <StopActions>
      <GlassSelect label={t.key} value={`${mode}:${key}`}
        text={<><bdi dir="ltr">{key}</bdi> {mode === 'major' ? t.major : t.minor}</>}
        onChange={v => { const [m, k] = v.split(':') as ['major' | 'minor', string]; setMode(m); setKey(k); }}>
        <optgroup label={t.major}>{KEYS_MAJOR.map(k => <option key={k} value={`major:${k}`}>{k} {t.major}</option>)}</optgroup>
        <optgroup label={t.minor}>{KEYS_MINOR.map(k => <option key={k} value={`minor:${k}`}>{k} {t.minor}</option>)}</optgroup>
      </GlassSelect>
    </StopActions>
  );

  const intro = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center' }}>
      <h2 style={{ margin: 0, fontFamily: 'var(--su-display)', fontSize: desktop ? 34 : 28, lineHeight: 1.15, fontWeight: 700, letterSpacing: '-0.02em' }}>{t.heading}</h2>
      <span className="su-sub" style={{ fontSize: 15, maxWidth: 460 }}>{t.intro}</span>
    </div>
  );

  // One row per degree: the plain chord, then the extensions it can take.
  const rows = (
    <div style={{ borderRadius: 26, background: T.bgCard, padding: 6, display: 'flex', flexDirection: 'column' }}>
      {pattern.map((shape, i) => {
        const root = roots[i] ?? '';
        const plain = `${root}${shape.triad}`;
        return (
          <div key={i} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: desktop ? 16 : 10, padding: desktop ? '12px 14px' : '12px 10px',
            borderTop: i ? `1px solid ${T.hairline}` : undefined }}>
            <button onClick={() => openChord(plain, shape.family)} className="gc-no-bar"
              style={{ flex: '1 1 200px', minWidth: 0, display: 'flex', alignItems: 'center', gap: 12, color: T.text, textAlign: 'start', padding: 0 }}>
              <span className="gc-notation" dir="ltr" style={{ width: 40, flex: 'none', fontSize: 14, fontWeight: 600, fontStyle: 'italic', color: T.textMuted, textAlign: 'center' }}>{romans[i]}</span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                <span className="gc-notation" dir="ltr" style={{ fontFamily: 'var(--su-display)', fontSize: 26, lineHeight: 1.1, fontWeight: 700, letterSpacing: '-0.02em', textAlign: rtl ? 'right' : 'left' }}>
                  {formatChordName(plain)}
                </span>
                <span style={{ fontSize: 13, color: T.textMuted }}>{t.families[shape.family]} · {t.feel[shape.family]}</span>
              </span>
            </button>
            <div style={{ flex: '1 1 300px', display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }}>
              {STEPS.map(step => {
                const suffix = shape.ext[step];
                const name = suffix ? `${root}${suffix}` : null;
                return name ? (
                  <button key={step} onClick={() => openChord(name, shape.family)} className="gc-no-bar gc-notation"
                    aria-label={formatChordName(name)}
                    style={{ height: 44, minWidth: 0, padding: '0 4px', borderRadius: 22, background: 'rgba(255,255,255,0.08)', color: T.text, fontSize: 14, fontWeight: 600,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {formatChordName(name)}
                  </button>
                ) : (
                  <span key={step} aria-label={`${step}: ${rtl ? 'לא נהוג' : 'usually avoided'}`}
                    style={{ height: 44, borderRadius: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 13, color: T.textMuted, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)' }}>
                    <span style={{ fontWeight: 600, textDecoration: 'line-through', opacity: 0.7 }}>{step}</span>
                  </span>
                );
              })}
            </div>
            {shape.ext['11'] === 'maj7#11' && (
              <p style={{ flexBasis: '100%', margin: 0, paddingInlineStart: 52, fontSize: 13, lineHeight: 1.45, color: T.textMuted }}>{t.sharp11}</p>
            )}
          </div>
        );
      })}
    </div>
  );

  const legend = (
    <Fold title={t.legendTitle} open={legendOpen} onToggle={() => setLegendOpen(o => !o)} summary={t.legend[0]}>
      <ul style={{ margin: 0, paddingInlineStart: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {t.legend.map((line, i) => <li key={i} style={{ fontSize: 15, lineHeight: 1.5 }}>{line}</li>)}
      </ul>
    </Fold>
  );

  const chordSheet = sheet && (
    <Sheet onClose={() => setSheet(null)} maxWidth={desktop ? 620 : 460}
      kicker={`${t.families[sheet.family]} · ${t.shapes}`}
      title={<span className="gc-notation" dir="ltr">{formatChordName(sheet.name)}</span>}>
      {shapes.length === 0 ? (
        <p style={{ margin: 0, fontSize: 15, color: T.textMuted, textAlign: 'center' }}>{t.noShapes}</p>
      ) : (
        <div dir="ltr" style={{ display: 'grid', gridTemplateColumns: `repeat(${desktop ? 3 : 2}, minmax(0, 1fr))`, gap: 10 }}>
          {shapes.map((v, i) => (
            <button key={i} className="gc-no-bar" disabled={!onAddToProgression}
              onClick={() => {
                if (!onAddToProgression) return;
                onAddToProgression({ id: `chord-${Date.now()}`, chord: { name: sheet.name, notes: [], aliases: [] }, fretPositions: v });
                setSheet(null);
              }}
              style={{ borderRadius: 20, background: 'rgba(255,255,255,0.06)', padding: '10px 8px 6px', color: T.text, cursor: onAddToProgression ? 'pointer' : 'default' }}>
              <MiniFretboard voicing={v} showStringLabels showFretNumbers />
            </button>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        <PlayButton onPlay={() => hearTower(sheet.name)} label={t.play} />
        {onAddToProgression && shapes.length > 0 && <span style={{ fontSize: 13, color: T.textMuted }}>{t.addHint}</span>}
      </div>
    </Sheet>
  );

  return (
    <div className="su-in" dir={rtl ? 'rtl' : 'ltr'} style={{ display: 'flex', flexDirection: 'column', gap: desktop ? 24 : 22, maxWidth: desktop ? 900 : undefined, margin: '0 auto', width: '100%' }}>
      {toolbar}
      {intro}
      {rows}
      {legend}
      {chordSheet}
    </div>
  );
}
