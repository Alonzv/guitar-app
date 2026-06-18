import { useMemo } from 'react';
import { Key, Chord as TonalChord, Note as TonalNote } from '@tonaljs/tonal';
import { detectKey } from '../../utils/progressionHelper';
import type { ChordInProgression } from '../../types/music';
import { IconSearch } from '../Icons';
import { T, card } from '../../theme';

interface Props {
  progression: ChordInProgression[];
}

type HarmonicFn = 'T' | 'SD' | 'D' | '?';

const FN_COLORS: Record<HarmonicFn, string> = {
  T:  T.primary,
  SD: '#1A7A4A',
  D:  '#CC1C1C',
  '?': T.textDim,
};

const FN_LABELS: Record<HarmonicFn, string> = {
  T:  'Tonic',
  SD: 'Subdominant',
  D:  'Dominant',
  '?': 'Non-diatonic',
};

interface ChordAnalysis {
  chordName: string;
  romanNumeral: string;
  harmonicFn: HarmonicFn;
  isDiatonic: boolean;
}

function analyzeProgression(progression: ChordInProgression[]): {
  key: string;
  isMajor: boolean;
  scale: readonly string[];
  analyses: ChordAnalysis[];
} {
  if (progression.length === 0) {
    return { key: '', isMajor: true, scale: [], analyses: [] };
  }

  const chords = progression.map(c => c.chord);
  const keyStr  = detectKey(chords);
  const parts   = keyStr.split(' ');
  const keyRoot = parts[0];
  const isMajor = keyStr.includes('major');

  const keyInfo  = isMajor ? Key.majorKey(keyRoot) : Key.minorKey(keyRoot);
  const diatonicChords = isMajor
    ? (keyInfo as ReturnType<typeof Key.majorKey>).chords
    : (keyInfo as ReturnType<typeof Key.minorKey>).natural.chords;
  const grades = isMajor
    ? (keyInfo as ReturnType<typeof Key.majorKey>).grades
    : (keyInfo as ReturnType<typeof Key.minorKey>).natural.grades;
  const harmonicFunctions = isMajor
    ? (keyInfo as ReturnType<typeof Key.majorKey>).chordsHarmonicFunction
    : (keyInfo as ReturnType<typeof Key.minorKey>).natural.chordsHarmonicFunction;
  const scale = isMajor
    ? (keyInfo as ReturnType<typeof Key.majorKey>).scale
    : (keyInfo as ReturnType<typeof Key.minorKey>).natural.scale;

  // Build a lookup: chord tonic chroma → { grade, fn }
  const diatonicMap = new Map<number, { grade: string; fn: HarmonicFn }>();
  diatonicChords.forEach((name, idx) => {
    const tonic = TonalChord.get(name).tonic;
    if (!tonic) return;
    const chroma = TonalNote.chroma(tonic);
    if (chroma == null) return;
    const rawFn = harmonicFunctions[idx] ?? '?';
    const fn: HarmonicFn = (rawFn === 'T' || rawFn === 'SD' || rawFn === 'D') ? rawFn : '?';
    if (!diatonicMap.has(chroma)) {
      diatonicMap.set(chroma, { grade: grades[idx] ?? '?', fn });
    }
  });

  const analyses: ChordAnalysis[] = chords.map(chord => {
    const chordName = chord.name;
    const tonic = TonalChord.get(chordName).tonic ?? chordName[0];
    const chroma = TonalNote.chroma(tonic);
    const entry  = chroma != null ? diatonicMap.get(chroma) : undefined;

    return {
      chordName,
      romanNumeral: entry?.grade ?? '?',
      harmonicFn:   entry?.fn   ?? '?',
      isDiatonic:   !!entry,
    };
  });

  return { key: keyStr, isMajor, scale, analyses };
}

export function ChordAnalyzerTab({ progression }: Props) {
  const analysis = useMemo(() => analyzeProgression(progression), [progression]);

  if (progression.length === 0) {
    return (
      <div style={card({ padding: '32px 16px', textAlign: 'center' })}>
        <div style={{ marginBottom: 10, color: T.textMuted }}><IconSearch size={32} /></div>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 6 }}>No progression to analyze</div>
        <div style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.5 }}>
          Build a chord progression in the By Ear or By Name tab,<br />then come back here to analyze it.
        </div>
      </div>
    );
  }

  const { key, isMajor, scale, analyses } = analysis;
  const [keyRoot, ...modeParts] = key.split(' ');
  const modeLabel = modeParts.join(' ');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Key card */}
      <div style={card({ padding: '14px 16px' })}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 10, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
              Detected Key
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: 32, fontWeight: 900, color: T.primary, lineHeight: 1 }}>{keyRoot}</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: T.textMuted }}>{modeLabel}</span>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
              Scale
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'flex-end', maxWidth: 160 }}>
              {scale.map((note, i) => (
                <span key={i} style={{
                  padding: '2px 6px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                  background: i === 0 ? T.primaryBg : T.bgInput,
                  color: i === 0 ? T.primary : T.textMuted,
                  border: i === 0 ? `1px solid ${T.primary}44` : `1px solid ${T.border}`,
                }}>{note}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Chord function legend */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {(['T', 'SD', 'D', '?'] as HarmonicFn[]).map(fn => (
          <div key={fn} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{
              width: 10, height: 10, borderRadius: '50%',
              background: FN_COLORS[fn], display: 'inline-block', flexShrink: 0,
            }} />
            <span style={{ fontSize: 10, color: T.textMuted }}>{fn} — {FN_LABELS[fn]}</span>
          </div>
        ))}
      </div>

      {/* Chord analyses */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {analyses.map((a, i) => {
          const color = FN_COLORS[a.harmonicFn];
          return (
            <div key={i} style={{
              ...card({ padding: '12px 14px' }),
              display: 'flex', alignItems: 'center', gap: 14,
              borderLeft: `4px solid ${color}`,
            }}>
              {/* Position */}
              <div style={{ fontSize: 11, color: T.textDim, minWidth: 16, textAlign: 'center' }}>
                {i + 1}
              </div>

              {/* Roman numeral */}
              <div style={{
                fontSize: 22, fontWeight: 900, color, minWidth: 44, textAlign: 'center', lineHeight: 1,
              }}>
                {a.romanNumeral}
              </div>

              {/* Chord name */}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: T.text, lineHeight: 1 }}>{a.chordName}</div>
                <div style={{ fontSize: 11, color: T.textMuted, marginTop: 3 }}>
                  {a.isDiatonic ? `Diatonic to ${keyRoot} ${modeLabel}` : `Outside ${keyRoot} ${modeLabel}`}
                </div>
              </div>

              {/* Function badge */}
              <div style={{
                padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700,
                background: `${color}22`, color, border: `1px solid ${color}44`,
                whiteSpace: 'nowrap',
              }}>
                {a.harmonicFn === '?' ? 'Non-diatonic' : FN_LABELS[a.harmonicFn]}
              </div>
            </div>
          );
        })}
      </div>

      {/* Harmonic function summary */}
      <div style={card({ padding: '12px 14px' })}>
        <div style={{ fontSize: 10, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
          Harmonic Summary
        </div>
        <div style={{ display: 'flex', gap: 0, borderRadius: 8, overflow: 'hidden', height: 10 }}>
          {analyses.map((a, i) => (
            <div key={i} style={{
              flex: 1, background: FN_COLORS[a.harmonicFn], opacity: 0.8,
            }} />
          ))}
        </div>
        <div style={{ display: 'flex', marginTop: 6, gap: 0 }}>
          {analyses.map((a, i) => (
            <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: FN_COLORS[a.harmonicFn], fontWeight: 700 }}>
              {a.romanNumeral}
            </div>
          ))}
        </div>
        {!isMajor && (
          <div style={{ marginTop: 8, fontSize: 10, color: T.textMuted, fontStyle: 'italic' }}>
            Minor key analysis uses the natural minor scale.
          </div>
        )}
      </div>
    </div>
  );
}
