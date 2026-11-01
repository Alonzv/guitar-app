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
import { Fold, Chips, icon } from '../ChordBuilder/Stage';
import { Sheet } from '../Workspace/Sheet';
import { formatChordName } from '../../utils/chordIdentifier';
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

const INTERVAL_HE: Record<string, string> = {
  '1': 'השורש', 'b3': 'הטרצה הקטנה', '3': 'הטרצה', 'b5': 'הקווינטה המוקטנת', '5': 'הקווינטה',
  'b7': 'הספטימה הקטנה', '7': 'הספטימה', 'b9': '♭9', '9': '9', '#9': '♯9',
  '11': '11', '#11': '♯11', 'b13': '♭13', '13': '13',
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
  interval: string;
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
            interval,
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
    ? (he ? `מיתר ${stringName(targetPos.string)} · ${targetPos.fret === 0 ? 'פתוח' : `סריג ${targetPos.fret}`}`
          : `String ${stringName(targetPos.string)} · ${targetPos.fret === 0 ? 'Open' : `Fret ${targetPos.fret}`}`)
    : '';
  const roleOf = (iv: string) => he ? INTERVAL_HE[iv] : INTERVAL_DISPLAY[iv];
  const small = (text: string) => <span style={{ fontSize: 13, fontWeight: 600, color: T.textMuted }}>{text}</span>;

  // ── The note: big, then the neck to pick it on ──────────────────────────
  const stage = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center' }}>
      {targetPos ? (
        <h2 className="gc-notation" dir="ltr" style={{ margin: 0, fontFamily: 'var(--su-display)', fontSize: desktop ? 96 : 76, lineHeight: 1.05, fontWeight: 700, letterSpacing: '-0.045em' }}>
          {targetNoteName}
        </h2>
      ) : (
        <h2 style={{ margin: 0, fontSize: desktop ? 34 : 28, fontWeight: 700, color: T.textMuted }}>{he ? 'בחרו תו' : 'Pick a note'}</h2>
      )}
      <span className="su-sub" style={{ fontSize: 15 }}>
        {targetPos ? posLabel : (he ? 'הקישו על הצוואר' : 'Tap the neck')}
      </span>
    </div>
  );

  const neck = (
    <div style={{ borderRadius: 26, background: T.bgCard, padding: '16px 14px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <InputFretboard
        selected={targetPos}
        tuning={tuning.notes}
        label={he
          ? `צוואר לבחירת תו מטרה${targetPos ? `: ${targetNoteName}, ${posLabel}` : ''}. חיצים מזיזים`
          : `Target note neck${targetPos ? `: ${targetNoteName}, ${posLabel}` : ''}. Arrow keys move`}
        onSelect={pos => {
          setTargetPos(pos.string === -1 ? null : pos);
          if (pos.string !== -1) previewFret(pos, tuning.openFreqs, capo);
        }}
      />
      {small(he ? 'בחרו את התו שאתם רוצים לשמוע באקורד, ונמצא את כל האקורדים שמכילים אותו בדיוק במקום הזה.' : 'Pick the note you want to hear in the chord, and you get every chord that has it right there.')}
    </div>
  );

  // ── Settings: one fold ───────────────────────────────────────────────────
  const multi = (label: string, items: readonly string[]) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: T.textMuted }}>{label}</span>
      <div dir="ltr" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {items.map(iv => {
          const on = selectedIntervals.has(iv);
          return (
            <button key={iv} aria-pressed={on} onClick={() => toggleInterval(iv)} className="gc-no-bar gc-notation"
              title={roleOf(iv)}
              style={{ height: 40, minWidth: 48, padding: '0 14px', borderRadius: 20, fontSize: 15, fontWeight: 600,
                background: on ? T.text : 'rgba(255,255,255,0.08)', color: on ? '#000' : T.text }}>
              {iv.replace('b', '♭').replace('#', '♯')}
            </button>
          );
        })}
      </div>
    </div>
  );
  const COMPLEXITY_LABEL = { triads: he ? 'פשוטים' : 'Simple', '7ths': he ? 'עם 7' : 'With 7ths', '9ths': he ? 'עם 9' : 'With 9ths', full: he ? 'הכול' : 'Everything' };
  const LOCK_LABEL = { anywhere: he ? 'בכל מקום' : 'Anywhere', top: he ? 'הכי גבוה' : 'On top', bass: he ? 'הכי נמוך' : 'In the bass' };
  const roles = [...selectedIntervals].map(iv => iv.replace('b', '♭').replace('#', '♯')).join(' ');
  const settings = (
    <Fold title={he ? 'מה לחפש' : 'What to look for'} open={controlsOpen} onToggle={() => setControlsOpen(o => !o)}
      summary={<>{he ? 'תפקיד' : 'Role'} <bdi dir="ltr">{roles}</bdi> · {COMPLEXITY_LABEL[complexity]} · {LOCK_LABEL[positionLock]}</>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {small(he ? 'התפקיד של התו באקורד: 1 הוא השורש, 3 הטרצה, 5 הקווינטה. אפשר לבחור כמה.' : 'The note\'s job in the chord: 1 is the root, 3 the third, 5 the fifth. Pick as many as you like.')}
        {multi(he ? 'תפקיד בסיסי' : 'Basic role', CORE_INTERVALS)}
        {multi(he ? 'תפקיד צבעוני' : 'Colour role', TENSION_INTERVALS)}
        <Chips label={he ? 'סוגי אקורדים' : 'Chord types'} value={complexity} onChange={setComplexity}
          items={(['triads', '7ths', '9ths', 'full'] as const).map(id => ({ id, label: COMPLEXITY_LABEL[id] }))} />
        <Chips label={he ? 'איפה התו באקורד' : 'Where the note sits'} value={positionLock} onChange={setPositionLock}
          items={(['anywhere', 'top', 'bass'] as const).map(id => ({ id, label: LOCK_LABEL[id] }))} />
      </div>
    </Fold>
  );

  const resultsPanel = targetPos && (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {small(results.length > 0
        ? (he ? `${results.length} אקורדים עם ${targetNoteName} · הקישו כדי לשמוע ולהגדיל` : `${results.length} chord${results.length !== 1 ? 's' : ''} with ${targetNoteName} · tap to hear it up close`)
        : (he ? 'לא נמצאו אקורדים. נסו לבחור עוד תפקידים או סוגי אקורדים.' : 'No chords found. Try more roles or chord types.'))}
      {results.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: desktop ? 'repeat(4, minmax(0, 1fr))' : 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
          {results.map((item, idx) => (
            <button key={idx} type="button"
              onClick={() => { setExpandedIdx(idx); previewVoicing(item.voicing, tuning.openFreqs, capo); }}
              aria-label={`${item.chordName}: ${targetNoteName} = ${roleOf(item.interval)}`}
              className="gc-no-bar su-row"
              style={{ cursor: 'pointer', textAlign: 'start', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0,
                background: 'rgba(255,255,255,0.06)', color: T.text, padding: '12px 12px 10px', borderRadius: 20 }}>
              <span className="gc-notation" dir="ltr" style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.02em', alignSelf: 'flex-start' }}>{formatChordName(item.chordName)}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: T.textMuted }}><bdi dir="ltr">{targetNoteName}</bdi> · {roleOf(item.interval)}</span>
              <span dir="ltr" style={{ display: 'block', width: '100%', marginTop: 4 }}>
                <XORow voicing={item.voicing} />
                <MiniFretboard voicing={item.voicing} dotColors={dotColors(item)} tuning={tuning.notes} />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  // ── One chord, up close ──────────────────────────────────────────────────
  const arrow = (d: number, disabled: boolean, label: string) => (
    <button onClick={() => setExpandedIdx(i => {
        const n = Math.min(Math.max((i ?? 0) + d, 0), results.length - 1);
        if (n !== i && results[n]) previewVoicing(results[n].voicing, tuning.openFreqs, capo);
        return n;
      })} disabled={disabled} aria-label={label} className="gc-no-bar"
      style={{ width: 50, height: 50, flex: 'none', borderRadius: 25, background: 'rgba(255,255,255,0.10)', color: T.text, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.3 : 1 }}>
      {icon(<path d={d < 0 ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6'} />, 20)}
    </button>
  );
  const sheet = expandedResult !== null && expandedIdx !== null && (
    <Sheet onClose={() => setExpandedIdx(null)} maxWidth={440}
      kicker={<><bdi dir="ltr">{targetNoteName}</bdi> · {roleOf(expandedResult.interval)} · {expandedIdx + 1}/{results.length}</>}
      title={<span className="gc-notation" dir="ltr">{formatChordName(expandedResult.chordName)}</span>}>
      <div dir="ltr" style={{ borderRadius: 22, background: 'rgba(255,255,255,0.06)', padding: '14px 18px 10px' }}>
        <XORow voicing={expandedResult.voicing} />
        <MiniFretboard voicing={expandedResult.voicing} dotColors={dotColors(expandedResult, true)} tuning={tuning.notes} showStringLabels showFretNumbers />
      </div>

      <div dir="ltr" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {arrow(-1, expandedIdx === 0, he ? 'האקורד הקודם' : 'Previous chord')}
        <div style={{ flex: 1, display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }} dir={he ? 'rtl' : 'ltr'}>
          <button onClick={() => { unlockAudio(); playChord(expandedResult!.voicing, tuning.openFreqs, capo); }} className="gc-no-bar"
            style={{ height: 50, padding: '0 20px', borderRadius: 25, background: T.text, color: '#000', fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden><path d="M7 4.5v15l13-7.5z" fill="currentColor" /></svg>
            {he ? 'נגן' : 'Play'}
          </button>
          {onAddToProgression && (
            <button onClick={() => {
                onAddToProgression({
                  id: `chord-${Date.now()}`,
                  chord: { name: expandedResult!.chordName, notes: [], aliases: [] },
                  fretPositions: [...expandedResult!.voicing],
                });
                flashAdded();
              }} className="gc-no-bar"
              style={{ height: 50, padding: '0 18px', borderRadius: 25, background: 'rgba(255,255,255,0.10)', color: T.text, fontSize: 16, fontWeight: 600 }}>
              <RollLabel>{added ? (he ? '✓ נוסף' : '✓ Added') : (he ? '+ לשיר' : '+ To song')}</RollLabel>
            </button>
          )}
        </div>
        {arrow(1, expandedIdx === results.length - 1, he ? 'האקורד הבא' : 'Next chord')}
      </div>

      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <SaveToLibraryButton
          style={{ height: 40, padding: '0 14px', borderRadius: 20, fontSize: 15, fontWeight: 500, color: T.tintLabel, background: 'transparent', border: 'none' }}
          label={he ? 'שמירה לספרייה' : 'Save to Library'}
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
      </div>

      {fitScales.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {small(he ? 'סולמות שהאקורד הזה יושב בהם' : 'Scales this chord lives in')}
          <div dir="ltr" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {fitScales.map((sc, i) => {
              const on = scaleIdx === i;
              return (
                <button key={sc.name} aria-pressed={on} onClick={() => setScaleIdx(prev => prev === i ? null : i)} className="gc-no-bar"
                  style={{ height: 36, padding: '0 14px', borderRadius: 18, fontSize: 14, fontWeight: 600,
                    background: on ? T.text : 'rgba(255,255,255,0.08)', color: on ? '#000' : T.text }}>{sc.name}</button>
              );
            })}
          </div>
          {scaleIdx !== null && fitScales[scaleIdx] && targetNoteName && (
            <div className="su-in" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }} dir="ltr">
                {targetNoteName} is the {degreeInScale(targetNoteName, fitScales[scaleIdx].root)} of {fitScales[scaleIdx].name}
              </span>
              <ScaleStrip
                positions={getScalePositions(fitScales[scaleIdx].root, fitScales[scaleIdx].type, tuning.notes)}
                tuning={tuning.notes}
                targetChroma={TonalNote.chroma(targetNoteName) ?? -1}
                rootChroma={TonalNote.chroma(fitScales[scaleIdx].root) ?? -1}
              />
              <div style={{ display: 'flex', gap: 14, alignItems: 'center', fontSize: 12, fontWeight: 600, color: T.textMuted }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span aria-hidden style={{ width: 10, height: 10, borderRadius: '50%', background: T.secondary, outline: `1.5px solid ${T.text}`, outlineOffset: 2 }} />{he ? 'התו שלכם' : 'your note'}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span aria-hidden style={{ width: 10, height: 10, borderRadius: '50%', background: T.secondary }} />{he ? 'שורש' : 'root'}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span aria-hidden style={{ width: 10, height: 10, borderRadius: '50%', background: T.coral }} />{he ? 'סולם' : 'scale'}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );

  return (
    <div className="su-in" style={{ display: 'flex', flexDirection: 'column', gap: desktop ? 24 : 20, maxWidth: desktop ? 900 : undefined, margin: '0 auto', width: '100%' }}>
      {stage}
      {neck}
      {settings}
      {resultsPanel}
      {sheet}
    </div>
  );
};
