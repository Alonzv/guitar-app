import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Note as TonalNote, Chord as TonalChord } from '@tonaljs/tonal';
import type { FretPosition, Tuning } from '../../types/music';
import { MiniFretboard } from '../Fretboard/MiniFretboard';
import { fretToNote, STRING_COUNT } from '../../utils/musicTheory';
import { scalesContainingNotes, getScalePositions, type ScaleFit } from '../../utils/scaleUtils';
import { isPlayable } from '../../utils/chordVoicings';
import { playChord, unlockAudio } from '../../utils/audioPlayback';
import { SaveToLibraryButton } from '../Workspace/SaveToLibraryButton';
import { T } from '../../theme';
import { Rule, Pill, PillRow, Cta } from '../Transit/parts';
import { pillStyle } from '../Transit/styles';
import { useLang } from '../../contexts/LanguageContext';
import { previewFret, previewVoicing } from '../../utils/previewSound';
import { useFlash } from '../../motion/useFlash';
import type { ChordInProgression } from '../../types/music';
import { RollLabel } from '../RollLabel';

const SEMITONE_DEGREE: Record<number, string> = {
  0: 'root', 1: '♭2nd', 2: '2nd', 3: '♭3rd', 4: '3rd', 5: '4th',
  6: '♭5th', 7: '5th', 8: '♭6th', 9: '6th', 10: '♭7th', 11: '7th',
};

function degreeInScale(targetNote: string, scaleRoot: string): string {
  const t = TonalNote.chroma(targetNote);
  const r = TonalNote.chroma(scaleRoot);
  if (t === undefined || r === undefined) return '';
  return SEMITONE_DEGREE[((t - r) % 12 + 12) % 12] ?? '';
}

// ── Constants ─────────────────────────────────────────────────────────────
const CORE_INTERVALS    = ['1', 'b3', '3', 'b5', '5'] as const;
const TENSION_INTERVALS = ['b7', '7', '9', 'b9', '#9', '11', '#11', '13', 'b13'] as const;

const INTERVAL_SEMITONES: Record<string, number> = {
  '1': 0, 'b3': 3, '3': 4, 'b5': 6, '5': 7,
  'b7': 10, '7': 11, 'b9': 1, '9': 2, '#9': 3,
  '11': 5, '#11': 6, 'b13': 8, '13': 9,
};

const INTERVAL_DISPLAY: Record<string, string> = {
  '1': 'root', 'b3': '♭3rd', '3': '3rd', 'b5': '♭5th', '5': '5th',
  'b7': '♭7th', '7': '7th', 'b9': '♭9th', '9': '9th', '#9': '♯9th',
  '11': '11th', '#11': '♯11th', 'b13': '♭13th', '13': '13th',
};

const CHROMA_TO_NOTE    = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const CHROMA_ENHARMONIC: Record<number, string> = { 1: 'Db', 3: 'D#', 6: 'Gb', 8: 'G#', 10: 'A#' };

const STRING_LABELS = ['E', 'A', 'D', 'G', 'B', 'e'];

const CHORD_SUFFIXES_TRIADS = ['M', 'm', 'dim', 'aug', 'sus2', 'sus4'];
const CHORD_SUFFIXES_7THS   = [...CHORD_SUFFIXES_TRIADS, '7', 'maj7', 'm7', 'm7b5', 'dim7'];
const CHORD_SUFFIXES_9THS   = [...CHORD_SUFFIXES_7THS, '9', 'maj9', 'm9', 'add9', '6', 'm6'];
const CHORD_SUFFIXES_FULL   = [...CHORD_SUFFIXES_9THS, '11', 'm11', '13', 'm13', 'maj13', '69'];

// Lower = shown first in results
function chordSortPriority(suffix: string): number {
  if (suffix === 'M' || suffix === '')                        return 0;
  if (suffix === 'm')                                         return 1;
  if (suffix === '7')                                         return 2;
  if (suffix === 'maj7')                                      return 3;
  if (suffix === 'm7')                                        return 4;
  if (suffix === 'sus2' || suffix === 'sus4')                 return 5;
  if (suffix === 'dim' || suffix === 'aug')                   return 6;
  if (suffix === '9' || suffix === 'maj9' || suffix === 'm9') return 7;
  if (suffix === 'add9' || suffix === '6' || suffix === 'm6') return 8;
  if (suffix === 'm7b5' || suffix === 'dim7')                 return 9;
  return 10;
}

// ── Types ─────────────────────────────────────────────────────────────────
interface TargetPos { string: number; fret: number; }

interface ResultItem {
  chordName: string;
  intervalLabel: string;
  voicing: FretPosition[];
  targetVoicingIdx: number;
  priority: number;
}

interface Props {
  tuning: Tuning; capo: number; desktop?: boolean;
  /** Adds the chosen voicing to the song. */
  onAddToProgression?: (item: ChordInProgression) => void;
}


function avgFret(voicing: FretPosition[]): number {
  const nonOpen = voicing.filter(p => p.fret > 0);
  if (nonOpen.length === 0) return 0;
  return nonOpen.reduce((s, p) => s + p.fret, 0) / nonOpen.length;
}

// ── Voicing search with pinned position ───────────────────────────────────
function findVoicingsWithPin(
  chordName: string,
  pinnedPos: TargetPos,
  tuning: string[],
): FretPosition[][] {
  const info = TonalChord.get(chordName);
  const chordNotes = info.notes;
  if (chordNotes.length < 2) return [];

  const { string: pStr, fret: pFret } = pinnedPos;
  const pinnedPitchClass = fretToNote(pStr, pFret, tuning);
  if (!chordNotes.some(cn => TonalNote.chroma(cn) === TonalNote.chroma(pinnedPitchClass))) return [];

  const required = chordNotes.length <= 3
    ? chordNotes
    : [chordNotes[0], chordNotes[1], chordNotes[3]].filter(Boolean);

  const results: FretPosition[][] = [];
  const seen = new Set<string>();

  for (let ws = Math.max(0, pFret - 3); ws <= pFret; ws++) {
    const we = ws + 3;
    const voicing: FretPosition[] = [];

    for (let s = 0; s < STRING_COUNT; s++) {
      if (s === pStr) {
        voicing.push({ string: s, fret: pFret });
      } else {
        const scanStart = ws === 0 ? 0 : ws;
        for (let f = scanStart; f <= we; f++) {
          const note = fretToNote(s, f, tuning);
          if (chordNotes.some(cn => TonalNote.chroma(cn) === TonalNote.chroma(note))) {
            voicing.push({ string: s, fret: f });
            break;
          }
        }
      }
    }

    if (!voicing.some(p => p.string === pStr && p.fret === pFret)) continue;
    if (!isPlayable(voicing)) continue;

    const requiredCovered = required.every(rn =>
      voicing.some(p => TonalNote.chroma(fretToNote(p.string, p.fret, tuning)) === TonalNote.chroma(rn))
    );
    if (!requiredCovered) continue;

    const hash = voicing.map(p => `${p.string}:${p.fret}`).join(',');
    if (!seen.has(hash)) {
      seen.add(hash);
      results.push([...voicing]);
    }
  }

  return results;
}

// ── Main search ───────────────────────────────────────────────────────────
function searchChords(
  targetPos: TargetPos,
  intervals: string[],
  positionLock: 'top' | 'bass' | 'anywhere',
  complexity: 'triads' | '7ths' | '9ths' | 'full',
  tuning: string[],
): ResultItem[] {
  const targetPitchClass = fretToNote(targetPos.string, targetPos.fret, tuning);
  const targetChroma = TonalNote.chroma(targetPitchClass);
  if (targetChroma === undefined) return [];

  const suffixes = complexity === 'triads' ? CHORD_SUFFIXES_TRIADS
    : complexity === '7ths'   ? CHORD_SUFFIXES_7THS
    : complexity === '9ths'   ? CHORD_SUFFIXES_9THS
    : CHORD_SUFFIXES_FULL;

  const results: ResultItem[] = [];
  const seen = new Set<string>();

  for (const interval of intervals) {
    const semitones = INTERVAL_SEMITONES[interval];
    const rootChroma = ((targetChroma - semitones) % 12 + 12) % 12;
    const rootNames = [CHROMA_TO_NOTE[rootChroma]];
    if (CHROMA_ENHARMONIC[rootChroma]) rootNames.push(CHROMA_ENHARMONIC[rootChroma]);

    for (const rootName of rootNames) {
      for (const suffix of suffixes) {
        const chordName = rootName + suffix;
        const chordInfo = TonalChord.get(chordName);
        if (chordInfo.empty) continue;
        if (!chordInfo.notes.some(n => TonalNote.chroma(n) === targetChroma)) continue;

        const voicings = findVoicingsWithPin(chordName, targetPos, tuning);

        for (const voicing of voicings) {
          if (positionLock === 'top') {
            if (Math.max(...voicing.map(p => p.string)) !== targetPos.string) continue;
          } else if (positionLock === 'bass') {
            if (Math.min(...voicing.map(p => p.string)) !== targetPos.string) continue;
          }

          const targetVoicingIdx = voicing.findIndex(
            p => p.string === targetPos.string && p.fret === targetPos.fret
          );
          const key = `${chordName}|${voicing.map(p => `${p.string}:${p.fret}`).join(',')}`;
          if (seen.has(key)) continue;
          seen.add(key);

          // Major triad should render as just the root ("C", not "CM")
          let sym = chordInfo.aliases[0] ?? suffix;
          if (sym === 'M') sym = '';
          const displayName = rootName + sym;

          results.push({
            chordName: displayName,
            intervalLabel: INTERVAL_DISPLAY[interval],
            voicing,
            targetVoicingIdx,
            priority: chordSortPriority(suffix),
          });
        }
      }
    }
  }

  // Sort: chord type priority first, then by avg fret position
  results.sort((a, b) => a.priority - b.priority || avgFret(a.voicing) - avgFret(b.voicing));
  return results;
}

// ── X/O indicator row ─────────────────────────────────────────────────────
function XORow({ voicing }: { voicing: FretPosition[] }) {
  // Displayed high e (s=5) → low E (s=0), matching the SVG top-to-bottom order
  const symbols = Array.from({ length: STRING_COUNT }, (_, i) => {
    const s = STRING_COUNT - 1 - i; // s=5 first, s=0 last
    const pos = voicing.find(p => p.string === s);
    if (!pos) return { s, label: 'X', muted: true };
    if (pos.fret === 0) return { s, label: 'O', muted: false };
    return { s, label: '·', muted: false };
  });

  return (
    <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: 2 }}>
      {symbols.map(({ s, label, muted }) => (
        <span key={s} style={{
          fontSize: 9, fontWeight: 400, width: 12, textAlign: 'center',
          color: muted ? T.textMuted : T.text, fontFamily: 'var(--gc-mono)',
        }}>
          {label}
        </span>
      ))}
    </div>
  );
}

// ── Scrollable input fretboard ────────────────────────────────────────────
// The Transit neck drawn for input: every fret is a target you can tap, and
// the chosen note is the view's one cobalt dot. Arrow keys move it (up/down a
// string, left/right a fret) once the neck has focus.
// minWidth: 540 keeps frets tap-friendly and scrolls on narrow screens.
const FB_SVG_W   = 680;
const FB_SVG_H   = 186;                          // extra height for air around fret numbers
const FB_NUT_X   = 30;
const FB_BOARD_R = FB_SVG_W - 12;                // right edge of the fretboard (12px margin)
const FB_FRET_SP = (FB_BOARD_R - FB_NUT_X) / 12; // ≈ 53.2 px per fret
const FB_TOP_Y   = 12;
const FB_STR_SP  = 27;
const FB_BOARD_B = FB_TOP_Y + 5 * FB_STR_SP;     // bottom string y (147)
const FB_DOT_R   = 12;

const fretCX = (f: number) =>
  f === 0 ? FB_NUT_X / 2 : FB_NUT_X + (f - 0.5) * FB_FRET_SP;
const strY   = (s: number) => FB_TOP_Y + (STRING_COUNT - 1 - s) * FB_STR_SP;

const InputFretboard: React.FC<{
  selected: TargetPos | null;
  tuning: string[];
  onSelect: (pos: TargetPos) => void;
  label: string;
}> = ({ selected, tuning, onSelect, label }) => {
  const handleClick = (s: number, f: number) => {
    // Second tap on same position → deselect
    if (selected?.string === s && selected?.fret === f) {
      onSelect({ string: -1, fret: -1 }); // sentinel handled in parent
    } else {
      onSelect({ string: s, fret: f });
    }
  };
  const onKey = (e: React.KeyboardEvent) => {
    const cur = selected ?? { string: 5, fret: 0 };
    const move: Record<string, [number, number]> = {
      ArrowUp: [1, 0], ArrowDown: [-1, 0], ArrowRight: [0, 1], ArrowLeft: [0, -1],
    };
    const m = move[e.key];
    if (!m) return;
    e.preventDefault();
    onSelect({
      string: Math.min(STRING_COUNT - 1, Math.max(0, cur.string + m[0])),
      fret: Math.min(12, Math.max(0, cur.fret + m[1])),
    });
  };

  return (
    <div dir="ltr" style={{
      overflowX: 'auto',
      WebkitOverflowScrolling: 'touch' as React.CSSProperties['WebkitOverflowScrolling'],
      scrollbarWidth: 'none' as React.CSSProperties['scrollbarWidth'],
    }}>
      <svg
        viewBox={`0 0 ${FB_SVG_W} ${FB_SVG_H}`}
        role="group" tabIndex={0} aria-label={label} onKeyDown={onKey}
        style={{ width: '100%', minWidth: 540, maxHeight: 210, display: 'block' }}
      >
        {/* Fret lines */}
        {Array.from({ length: 13 }).map((_, i) => i === 0 ? null : (
          <line key={i}
            x1={FB_NUT_X + i * FB_FRET_SP} y1={FB_TOP_Y}
            x2={FB_NUT_X + i * FB_FRET_SP} y2={FB_BOARD_B}
            stroke="var(--gc-fretboard-fret)" strokeWidth={1.5}
          />
        ))}

        {/* Strings — the low E thickest */}
        {Array.from({ length: STRING_COUNT }).map((_, s) => (
          <line key={s}
            x1={FB_NUT_X - 4} y1={strY(s)} x2={FB_BOARD_R} y2={strY(s)}
            stroke="var(--gc-fretboard-str)" strokeWidth={2.6 - s * 0.32}
          />
        ))}

        {/* Nut */}
        <rect x={FB_NUT_X - 7} y={FB_TOP_Y - 1} width={7} height={5 * FB_STR_SP + 2} fill="var(--gc-fretboard-nut)" />

        {/* Fret numbers */}
        {[1,2,3,4,5,6,7,8,9,10,11,12].map(f => (
          <text key={f}
            x={FB_NUT_X + (f - 0.5) * FB_FRET_SP}
            y={FB_BOARD_B + 24}
            textAnchor="middle" fontSize={10} fontFamily="var(--gc-mono)"
            fill={[3, 5, 7, 9, 12].includes(f) ? T.text : T.textMuted}
          >{f}</text>
        ))}

        {/* Tap targets: a faint ring on every fret, the chosen note cobalt */}
        {Array.from({ length: STRING_COUNT }).map((_, s) =>
          Array.from({ length: 13 }).map((_, f) => {
            const isSelected = selected?.string === s && selected?.fret === f;
            const cx = fretCX(f);
            const cy = strY(s);
            const hitX = f === 0 ? 0 : FB_NUT_X + (f - 1) * FB_FRET_SP;
            const hitW = f === 0 ? FB_NUT_X - 7 : FB_FRET_SP;
            return (
              <g key={`${s}-${f}`} onClick={() => handleClick(s, f)} style={{ cursor: 'pointer' }}>
                <rect x={hitX} y={cy - FB_STR_SP / 2} width={hitW} height={FB_STR_SP} fill="transparent" />
                {!isSelected && (
                  <circle cx={cx} cy={cy} r={FB_DOT_R - 6}
                    fill={T.bgDeep} stroke={T.hairline} strokeWidth={1.5} />
                )}
                {isSelected && (
                  <>
                    <circle cx={cx} cy={cy} r={FB_DOT_R} fill={T.primary} />
                    <text x={cx} y={cy + 4} textAnchor="middle" fontSize={10} fontFamily="var(--gc-mono)"
                      fill={T.onPrimary} fontWeight="700">
                      {fretToNote(s, f, tuning)}
                    </text>
                  </>
                )}
              </g>
            );
          })
        )}
      </svg>
    </div>
  );
};

// ── Compact read-only scale strip ─────────────────────────────────────────
const SS_W   = 560;
const SS_NUT = 24;
const SS_R   = SS_W - 8;
const SS_FSP = (SS_R - SS_NUT) / 12;
const SS_SSP = 18;
const SS_TOP = 8;
const SS_B   = SS_TOP + 5 * SS_SSP;
const SS_H   = SS_B + 16;

const ScaleStrip: React.FC<{
  positions: FretPosition[];
  tuning: string[];
  targetChroma: number;
  rootChroma: number;
}> = ({ positions, tuning, targetChroma, rootChroma }) => {
  const ssCX = (f: number) => f === 0 ? SS_NUT / 2 : SS_NUT + (f - 0.5) * SS_FSP;
  const ssY  = (s: number) => SS_TOP + (STRING_COUNT - 1 - s) * SS_SSP;

  return (
    <div dir="ltr" style={{
      overflowX: 'auto', marginTop: 8,
      scrollbarWidth: 'none' as React.CSSProperties['scrollbarWidth'],
    }}>
      <svg viewBox={`0 0 ${SS_W} ${SS_H}`}
        style={{ width: '100%', minWidth: 460, maxHeight: 130, display: 'block' }}>
        <rect x={SS_NUT - 5} y={SS_TOP - 1} width={5} height={5 * SS_SSP + 2} fill="var(--gc-fretboard-nut)" />

        {Array.from({ length: 13 }).map((_, i) => (
          <line key={i} x1={SS_NUT + i * SS_FSP} y1={SS_TOP} x2={SS_NUT + i * SS_FSP} y2={SS_B}
            stroke="var(--gc-fretboard-fret)" strokeWidth={1} />
        ))}
        {Array.from({ length: STRING_COUNT }).map((_, s) => (
          <line key={s} x1={0} y1={ssY(s)} x2={SS_R} y2={ssY(s)}
            stroke="var(--gc-fretboard-str)" strokeWidth={1.8 - s * 0.22} />
        ))}
        {[3,5,7,9,12].map(f => (
          <text key={f} x={SS_NUT + (f - 0.5) * SS_FSP} y={SS_H - 3}
            textAnchor="middle" fontSize={8} fontFamily="var(--gc-mono)" fill={T.textMuted}>{f}</text>
        ))}

        {positions.map((p, i) => {
          const note = fretToNote(p.string, p.fret, tuning);
          const ch = TonalNote.chroma(note);
          const isTarget = ch === targetChroma;
          const isRoot = ch === rootChroma;
          // Monochrome: the target ink and ringed, the root ink, other scale
          // tones grey (the modal's one cobalt thing is its primary action).
          const fill = isTarget || isRoot ? T.secondary : T.coral;
          return (
            <g key={i}>
              {isTarget && <circle cx={ssCX(p.fret)} cy={ssY(p.string)} r={10} fill="none" stroke={T.text} strokeWidth={1.5} />}
              <circle cx={ssCX(p.fret)} cy={ssY(p.string)} r={isTarget ? 7.5 : 6.5}
                fill={fill} stroke={T.bgDeep} strokeWidth={1} />
              <text x={ssCX(p.fret)} y={ssY(p.string) + 2.5} textAnchor="middle"
                fontSize={5.5} fill={T.white} fontWeight="700">{note}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────
export const TargetNoteTab: React.FC<Props> = ({ tuning, capo, desktop, onAddToProgression }) => {
  const { lang } = useLang();
  const he = lang === 'he';
  const [added, flashAdded] = useFlash();
  // Opens on G on the high e string so there are chords to look at at once.
  const [targetPos, setTargetPos]             = useState<TargetPos | null>({ string: 5, fret: 3 });
  const [selectedIntervals, setSelectedIntervals] = useState<Set<string>>(new Set(['1']));
  const [positionLock, setPositionLock]       = useState<'top' | 'bass' | 'anywhere'>('anywhere');
  const [complexity, setComplexity]           = useState<'triads' | '7ths' | '9ths' | 'full'>('triads');
  const [controlsOpen, setControlsOpen]       = useState(false);
  const [results, setResults]                 = useState<ResultItem[]>([]);
  const [expandedIdx, setExpandedIdx]         = useState<number | null>(null);
  const [scaleIdx, setScaleIdx]               = useState<number | null>(null); // selected "Fits in" scale

  const targetNoteName = targetPos
    ? fretToNote(targetPos.string, targetPos.fret, tuning.notes)
    : null;

  // Auto-search whenever any relevant param changes
  useEffect(() => {
    if (!targetPos) { setResults([]); return; }
    const r = searchChords(
      targetPos,
      [...selectedIntervals],
      positionLock,
      complexity,
      tuning.notes,
    );
    setResults(r);
    setExpandedIdx(null);
  }, [targetPos, selectedIntervals, positionLock, complexity, tuning.notes]);

  const toggleInterval = useCallback((iv: string) => {
    setSelectedIntervals(prev => {
      const next = new Set(prev);
      if (next.has(iv)) { if (next.size > 1) next.delete(iv); }
      else next.add(iv);
      return next;
    });
  }, []);

  // Reset scale selection whenever the expanded chord changes
  useEffect(() => { setScaleIdx(null); }, [expandedIdx]);

  // Keyboard navigation for modal
  useEffect(() => {
    if (expandedIdx === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setExpandedIdx(i => Math.min((i ?? 0) + 1, results.length - 1));
      if (e.key === 'ArrowLeft')  setExpandedIdx(i => Math.max((i ?? 0) - 1, 0));
      if (e.key === 'Escape')     setExpandedIdx(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [expandedIdx, results.length]);

  const expandedResult = expandedIdx !== null ? results[expandedIdx] : null;

  // Scales the expanded chord lives in ("Fits in")
  const fitScales: ScaleFit[] = useMemo(() => {
    if (!expandedResult) return [];
    const notes = TonalChord.get(expandedResult.chordName).notes;
    return scalesContainingNotes(notes, 5);
  }, [expandedResult]);

  // In the results the target note is the cobalt dot; in the open modal its
  // primary action is, so there the target is ink and the rest grey.
  const dotColors = useCallback((item: ResultItem, modal = false) =>
    item.voicing.map((_, i) => i === item.targetVoicingIdx ? (modal ? T.secondary : T.primary) : (modal ? T.coral : T.secondary)),
  []);

  const stringName = (st: number) => STRING_LABELS[st];
  const posLabel = targetPos
    ? (he ? `מיתר ${stringName(targetPos.string)} · ${targetPos.fret === 0 ? 'פתוח' : `שריג ${targetPos.fret}`}`
          : `String ${stringName(targetPos.string)} · ${targetPos.fret === 0 ? 'Open' : `Fret ${targetPos.fret}`}`)
    : '';

  const settingRow = (title: string, children: React.ReactNode) => (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <span className="su-label" style={{ minWidth: 84 }}>{title}</span>
      {children}
    </div>
  );

  const controlsLeft = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* The target note: tap the neck */}
      <Rule label={he ? 'בחרו תו מטרה' : 'Select target note'}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, minHeight: 64, marginBottom: 10 }}>
          {targetPos ? (
            <>
              <span className="su-poster" style={{ fontSize: 64, textTransform: 'none' }}>{targetNoteName}</span>
              <span className="su-label" style={{ color: T.text, paddingBottom: 4, textTransform: 'none' }}>{posLabel}</span>
            </>
          ) : (
            <span className="su-label">{he ? 'הקישו על הצוואר כדי לבחור תו' : 'Tap the fretboard to select a target note'}</span>
          )}
        </div>
        <InputFretboard
          selected={targetPos}
          tuning={tuning.notes}
          label={he
            ? `צוואר לבחירת תו מטרה${targetPos ? ` — ${targetNoteName}, ${posLabel}` : ''}. חיצים מזיזים`
            : `Target note neck${targetPos ? ` — ${targetNoteName}, ${posLabel}` : ''}. Arrow keys move`}
          onSelect={pos => {
            setTargetPos(pos.string === -1 ? null : pos);
            if (pos.string !== -1) previewFret(pos, tuning.openFreqs, capo);
          }}
        />
      </Rule>

      {/* Search settings */}
      <Rule label={he ? 'הגדרות חיפוש' : 'Search settings'}
        right={<Pill size="sm" active={controlsOpen} onClick={() => setControlsOpen(o => !o)}>
          {controlsOpen ? (he ? 'סגירה' : 'Close') : (he ? 'הגדרות' : 'Settings')}
        </Pill>}>
        {controlsOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {settingRow(he ? 'תפקיד — בסיס' : 'Role · core', CORE_INTERVALS.map(iv => (
              <Pill key={iv} size="sm" active={selectedIntervals.has(iv)} onClick={() => toggleInterval(iv)}
                style={{ textTransform: 'none' }}>{iv}</Pill>
            )))}
            {settingRow(he ? 'תפקיד — מתחים' : 'Role · tensions', TENSION_INTERVALS.map(iv => (
              <Pill key={iv} size="sm" active={selectedIntervals.has(iv)} onClick={() => toggleInterval(iv)}
                style={{ textTransform: 'none' }}>{iv}</Pill>
            )))}
            {settingRow(he ? 'נעילת מיקום' : 'Position lock', (
              <PillRow wrap label={he ? 'נעילת מיקום' : 'Position lock'} value={positionLock} onChange={setPositionLock}
                items={[
                  { id: 'anywhere', label: he ? 'בכל מקום' : 'Anywhere' },
                  { id: 'top', label: he ? 'קול עליון' : 'Top voice' },
                  { id: 'bass', label: he ? 'בס' : 'Bass note' },
                ]} />
            ))}
            {settingRow(he ? 'מורכבות' : 'Complexity', (
              <PillRow wrap label={he ? 'מורכבות' : 'Complexity'} value={complexity} onChange={setComplexity}
                items={[
                  { id: 'triads', label: he ? 'טריאדות' : 'Triads' },
                  { id: '7ths', label: '7ths' }, { id: '9ths', label: '9ths' },
                  { id: 'full', label: he ? 'הכול' : 'Full' },
                ]} />
            ))}
          </div>
        )}
      </Rule>
    </div>
  );

  const resultsPanel = (
    <Rule label={!targetPos ? (he ? 'תוצאות' : 'Results')
      : results.length > 0
        ? (he ? `${results.length} אקורדים` : `${results.length} chord${results.length !== 1 ? 's' : ''} found`)
        : (he ? 'לא נמצאו אקורדים — נסו הגדרות אחרות' : 'No chords found — try different settings')}>
      {!targetPos ? (
        <p className="su-label" style={{ margin: 0, padding: '18px 0' }}>
          {he ? 'בחרו תו על הצוואר' : '← Select a note on the fretboard'}
        </p>
      ) : results.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '14px 12px' }}>
          {results.map((item, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => { setExpandedIdx(idx); previewVoicing(item.voicing, tuning.openFreqs, capo); }}
              aria-label={`${item.chordName} — ${targetNoteName} = ${item.intervalLabel}`}
              className="gc-pressable gc-no-bar"
              style={{
                cursor: 'pointer', textAlign: 'start', display: 'flex', flexDirection: 'column', gap: 4, width: '100%', minWidth: 0,
                background: 'transparent', color: T.text, padding: '8px 0 4px', borderRadius: 0,
                borderWidth: 'var(--su-rule) 0 0 0', borderStyle: 'solid', borderColor: T.border,
              }}
            >
              <span className="su-semi" style={{ fontSize: 22, lineHeight: 1, textTransform: 'none' }}>{item.chordName}</span>
              <span className="su-label">{targetNoteName} = {item.intervalLabel}</span>
              <span style={{ display: 'block', width: '100%', marginTop: 4 }}>
                <XORow voicing={item.voicing} />
                <MiniFretboard voicing={item.voicing} dotColors={dotColors(item)} tuning={tuning.notes} />
              </span>
            </button>
          ))}
        </div>
      )}
    </Rule>
  );

  return (
    <div style={desktop
      ? { display: 'grid', gridTemplateColumns: '580px 1fr', gap: 32, alignItems: 'start' }
      : { display: 'flex', flexDirection: 'column', gap: 18 }
    }>
      {controlsLeft}
      {desktop
        ? <div style={{ position: 'sticky', top: 24 }}>{resultsPanel}</div>
        : resultsPanel
      }

      {/* Expanded modal */}
      {expandedResult !== null && expandedIdx !== null && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setExpandedIdx(null); }}
          style={{
            position: 'fixed', inset: 0, background: 'color-mix(in srgb, var(--gc-text) 55%, transparent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 200, padding: 16,
          }}
        >
          <div role="dialog" aria-modal="true" aria-label={expandedResult.chordName} style={{
            background: T.bgDeep, color: T.text, border: `var(--su-rule) solid ${T.border}`,
            width: '100%', maxWidth: 420, boxSizing: 'border-box',
            maxHeight: '88vh', overflowY: 'auto',
            padding: '18px 20px 18px',
            display: 'flex', flexDirection: 'column', gap: 14,
          }}>
            {/* Name + close */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div className="su-poster" style={{ fontSize: 64, textTransform: 'none' }}>{expandedResult.chordName}</div>
                <div className="su-label" style={{ marginTop: 10, color: T.text }}>
                  {targetNoteName} = {expandedResult.intervalLabel}
                </div>
              </div>
              <Pill onClick={() => setExpandedIdx(null)} label={he ? 'סגירה' : 'Close'} style={{ padding: 0, width: 44 }}>×</Pill>
            </div>

            {/* Large diagram */}
            <div style={{ borderTop: `var(--su-rule) solid ${T.border}`, padding: '12px 16px 0' }}>
              <XORow voicing={expandedResult.voicing} />
              <MiniFretboard
                voicing={expandedResult.voicing}
                dotColors={dotColors(expandedResult, true)}
                tuning={tuning.notes}
                showStringLabels
                showFretNumbers
              />
            </div>

            {/* Play · add to the song (the one cobalt action) */}
            <div style={{ display: 'flex', gap: 8 }}>
              <Pill onClick={() => { unlockAudio(); playChord(expandedResult!.voicing, tuning.openFreqs, capo); }}
                style={{ flex: onAddToProgression ? '0 0 auto' : 1, padding: '0 22px' }}>{he ? 'נגן' : 'Play'}</Pill>
              {onAddToProgression && (
                <Cta
                  onClick={() => {
                    onAddToProgression({
                      id: `chord-${Date.now()}`,
                      chord: { name: expandedResult!.chordName, notes: [], aliases: [] },
                      fretPositions: [...expandedResult!.voicing],
                    });
                    flashAdded();
                  }}
                  style={{ flex: 1 }}
                ><RollLabel>{added ? '✓ Added' : '+ Add to song'}</RollLabel></Cta>
              )}
            </div>

            <SaveToLibraryButton
              style={{ ...pillStyle(false), width: '100%', justifyContent: 'center' }}
              label="Save voicing to Library"
              getPayload={() => ({
                kind: 'progression',
                name: expandedResult!.chordName,
                chords: [{
                  id: `chord-${Date.now()}`,
                  chord: { name: expandedResult!.chordName, notes: [], aliases: [] },
                  fretPositions: [...expandedResult!.voicing],
                }],
              })}
            />

            {/* Fits in — scales this chord lives in */}
            {fitScales.length > 0 && (
              <Rule label={he ? 'מתאים לסולמות' : 'Fits in'}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {fitScales.map((sc, i) => (
                    <Pill key={sc.name} size="sm" active={scaleIdx === i}
                      onClick={() => setScaleIdx(prev => prev === i ? null : i)}
                      style={{ textTransform: 'none', letterSpacing: '0.02em' }}>{sc.name}</Pill>
                  ))}
                </div>

                {scaleIdx !== null && fitScales[scaleIdx] && targetNoteName && (
                  <>
                    <div className="su-label" style={{ marginTop: 10, color: T.text }}>
                      {targetNoteName} is the {degreeInScale(targetNoteName, fitScales[scaleIdx].root)} of {fitScales[scaleIdx].name}
                    </div>
                    <ScaleStrip
                      positions={getScalePositions(fitScales[scaleIdx].root, fitScales[scaleIdx].type, tuning.notes)}
                      tuning={tuning.notes}
                      targetChroma={TonalNote.chroma(targetNoteName) ?? -1}
                      rootChroma={TonalNote.chroma(fitScales[scaleIdx].root) ?? -1}
                    />
                    <div className="su-label" style={{ display: 'flex', gap: 14, marginTop: 6, alignItems: 'center' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <span aria-hidden style={{ width: 10, height: 10, borderRadius: '50%', background: T.secondary, outline: `1.5px solid ${T.text}`, outlineOffset: 2 }} />{he ? 'מטרה' : 'target'}
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <span aria-hidden style={{ width: 10, height: 10, borderRadius: '50%', background: T.secondary }} />{he ? 'שורש' : 'root'}
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <span aria-hidden style={{ width: 10, height: 10, borderRadius: '50%', background: T.coral }} />{he ? 'סולם' : 'scale'}
                      </span>
                    </div>
                  </>
                )}
              </Rule>
            )}

            {/* Carousel */}
            <div dir="ltr" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Pill onClick={() => setExpandedIdx(i => Math.max((i ?? 0) - 1, 0))} disabled={expandedIdx === 0}
                label={he ? 'האקורד הקודם' : 'Previous chord'} style={{ flex: 1 }}>‹</Pill>
              <span className="su-label" style={{ minWidth: 56, textAlign: 'center', color: T.text }}>
                {expandedIdx + 1} / {results.length}
              </span>
              <Pill onClick={() => setExpandedIdx(i => Math.min((i ?? 0) + 1, results.length - 1))} disabled={expandedIdx === results.length - 1}
                label={he ? 'האקורד הבא' : 'Next chord'} style={{ flex: 1 }}>›</Pill>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
