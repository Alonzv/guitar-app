import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Note as TonalNote, Chord as TonalChord } from '@tonaljs/tonal';
import type { FretPosition, Tuning } from '../../types/music';
import { MiniFretboard } from '../Fretboard/MiniFretboard';
import { fretToNote, STRING_COUNT } from '../../utils/musicTheory';
import { scalesContainingNotes, getScalePositions, type ScaleFit } from '../../utils/scaleUtils';
import { playChord, unlockAudio } from '../../utils/audioPlayback';
import { SaveToLibraryButton } from '../Workspace/SaveToLibraryButton';
import { T, card } from '../../theme';

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

interface Props { tuning: Tuning; capo: number; desktop?: boolean; }

// ── isPlayable (not exported from chordVoicings) ──────────────────────────
function isPlayable(voicing: FretPosition[]): boolean {
  if (voicing.length < 4) return false;

  // Count skipped inner strings — muting an inner string is hard in practice
  const strings = [...voicing.map(p => p.string)].sort((a, b) => a - b);
  let innerGaps = 0;
  for (let i = 1; i < strings.length; i++) innerGaps += strings[i] - strings[i - 1] - 1;
  if (innerGaps > 1) return false;

  const nonOpen = voicing.filter(p => p.fret > 0);
  if (nonOpen.length === 0) return true;
  const frets = nonOpen.map(p => p.fret);
  const minF = Math.min(...frets);
  const maxF = Math.max(...frets);
  if (maxF - minF > 3) return false;
  const aboveMin = nonOpen.filter(p => p.fret > minF);
  const byFret = new Map<number, number[]>();
  for (const p of aboveMin) {
    if (!byFret.has(p.fret)) byFret.set(p.fret, []);
    byFret.get(p.fret)!.push(p.string);
  }
  let extraFingers = 0;
  for (const strings of byFret.values()) {
    const sorted = [...strings].sort((a, b) => a - b);
    let j = 0;
    while (j < sorted.length) {
      let end = j;
      while (end + 1 < sorted.length && sorted[end + 1] === sorted[end] + 1) end++;
      extraFingers++;
      j = end + 1;
    }
  }
  if (extraFingers > 3) return false;
  if (aboveMin.length >= 2) {
    const minStr = Math.min(...aboveMin.map(p => p.string));
    const maxStr = Math.max(...aboveMin.map(p => p.string));
    const multiFret = new Set(aboveMin.map(p => p.fret)).size > 1;
    if (maxStr - minStr > 3 && multiFret) return false;
  }
  return true;
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
          color: muted ? T.textDim : label === 'O' ? T.primary : T.textMuted,
        }}>
          {label}
        </span>
      ))}
    </div>
  );
}

// ── Scrollable input fretboard ────────────────────────────────────────────
// Same proportions as InteractiveFretboard so it looks identical in size.
// minWidth: 540 ensures frets are always tap-friendly and triggers scroll on narrow screens.
const FB_SVG_W   = 680;
const FB_SVG_H   = 186;                          // extra height for air around fret numbers
const FB_NUT_X   = 30;
const FB_BOARD_R = FB_SVG_W - 12;                // right edge of the fretboard (12px margin)
const FB_FRET_SP = (FB_BOARD_R - FB_NUT_X) / 12; // ≈ 53.2 px per fret
const FB_TOP_Y   = 12;
const FB_STR_SP  = 27;
const FB_BOARD_B = FB_TOP_Y + 5 * FB_STR_SP;     // bottom string y (147)
const FB_DOT_R   = 11;

const fretCX = (f: number) =>
  f === 0 ? FB_NUT_X / 2 : FB_NUT_X + (f - 0.5) * FB_FRET_SP;
const strY   = (s: number) => FB_TOP_Y + (STRING_COUNT - 1 - s) * FB_STR_SP;

const InputFretboard: React.FC<{
  selected: TargetPos | null;
  tuning: string[];
  onSelect: (pos: TargetPos) => void;
}> = ({ selected, tuning, onSelect }) => {
  const handleClick = (s: number, f: number) => {
    // Second tap on same position → deselect
    if (selected?.string === s && selected?.fret === f) {
      onSelect({ string: -1, fret: -1 }); // sentinel handled in parent
    } else {
      onSelect({ string: s, fret: f });
    }
  };

  return (
    <div style={{
      overflowX: 'auto',
      WebkitOverflowScrolling: 'touch' as React.CSSProperties['WebkitOverflowScrolling'],
      borderRadius: 0,
      background: 'var(--gc-fretboard-bg)',
      scrollbarWidth: 'none' as React.CSSProperties['scrollbarWidth'],
    }}>
      <svg
        viewBox={`0 0 ${FB_SVG_W} ${FB_SVG_H}`}
        style={{ width: '100%', minWidth: 540, maxHeight: 210, display: 'block' }}
      >
        {/* Background */}
        <rect x={0} y={0} width={FB_SVG_W} height={FB_SVG_H} fill="var(--gc-fretboard-bg)" />

        {/* Open-string zone */}
        <rect x={0} y={FB_TOP_Y} width={FB_NUT_X} height={5 * FB_STR_SP} fill="rgba(0,0,0,0.15)" />

        {/* Nut */}
        <rect x={FB_NUT_X - 3} y={FB_TOP_Y} width={3.5} height={5 * FB_STR_SP}
          fill="var(--gc-fretboard-nut)" rx={1} />

        {/* Fret lines */}
        {Array.from({ length: 13 }).map((_, i) => (
          <line key={i}
            x1={FB_NUT_X + i * FB_FRET_SP} y1={FB_TOP_Y}
            x2={FB_NUT_X + i * FB_FRET_SP} y2={FB_BOARD_B}
            stroke="var(--gc-fretboard-fret)" strokeWidth={1.2}
          />
        ))}

        {/* Strings */}
        {Array.from({ length: STRING_COUNT }).map((_, s) => (
          <line key={s}
            x1={0} y1={strY(s)} x2={FB_BOARD_R} y2={strY(s)}
            stroke="var(--gc-fretboard-str)" strokeWidth={0.9 + s * 0.22}
          />
        ))}

        {/* Position dots */}
        {[3, 5, 7, 9].map(f => (
          <circle key={f}
            cx={FB_NUT_X + (f - 0.5) * FB_FRET_SP}
            cy={FB_TOP_Y + 2.5 * FB_STR_SP}
            r={4} fill="var(--gc-fretboard-pos)"
          />
        ))}
        <circle cx={FB_NUT_X + 11.5 * FB_FRET_SP} cy={FB_TOP_Y + 1.5 * FB_STR_SP} r={3.5} fill="var(--gc-fretboard-pos)" />
        <circle cx={FB_NUT_X + 11.5 * FB_FRET_SP} cy={FB_TOP_Y + 3.5 * FB_STR_SP} r={3.5} fill="var(--gc-fretboard-pos)" />

        {/* Fret number labels */}
        {[1,2,3,4,5,6,7,8,9,10,11,12].map(f => (
          <text key={f}
            x={FB_NUT_X + (f - 0.5) * FB_FRET_SP}
            y={FB_BOARD_B + 22}
            textAnchor="middle" fontSize={10} fill="var(--gc-fretboard-str)"
          >{f}</text>
        ))}

        {/* Ghost hover rings */}
        {Array.from({ length: STRING_COUNT }).map((_, s) =>
          Array.from({ length: 13 }).map((_, f) => {
            const isSelected = selected?.string === s && selected?.fret === f;
            const cx = fretCX(f);
            const cy = strY(s);
            const hitX = f === 0 ? 0 : FB_NUT_X + (f - 1) * FB_FRET_SP;
            const hitW = f === 0 ? FB_NUT_X : FB_FRET_SP;
            return (
              <g key={`${s}-${f}`} onClick={() => handleClick(s, f)} style={{ cursor: 'pointer' }}>
                <rect x={hitX} y={cy - FB_STR_SP / 2} width={hitW} height={FB_STR_SP} fill="transparent" />
                {!isSelected && (
                  <circle cx={cx} cy={cy} r={FB_DOT_R - 5}
                    fill="transparent" stroke={T.border} strokeWidth={1} opacity={0.25} />
                )}
                {isSelected && (
                  <>
                    <circle cx={cx} cy={cy} r={FB_DOT_R} fill={T.coral} opacity={0.92}
                      style={{ filter: 'drop-shadow(0 0 5px var(--gc-coral))' }} />
                    <text x={cx} y={cy + 4} textAnchor="middle" fontSize={9}
                      fill="#fff" fontWeight="700">
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
    <div style={{
      overflowX: 'auto', borderRadius: 0, background: 'var(--gc-fretboard-bg)', marginTop: 8,
      scrollbarWidth: 'none' as React.CSSProperties['scrollbarWidth'],
    }}>
      <svg viewBox={`0 0 ${SS_W} ${SS_H}`}
        style={{ width: '100%', minWidth: 460, maxHeight: 130, display: 'block' }}>
        <rect x={0} y={0} width={SS_W} height={SS_H} fill="var(--gc-fretboard-bg)" />
        <rect x={0} y={SS_TOP} width={SS_NUT} height={5 * SS_SSP} fill="rgba(0,0,0,0.15)" />
        <rect x={SS_NUT - 2.5} y={SS_TOP} width={3} height={5 * SS_SSP} fill="var(--gc-fretboard-nut)" rx={1} />

        {Array.from({ length: 13 }).map((_, i) => (
          <line key={i} x1={SS_NUT + i * SS_FSP} y1={SS_TOP} x2={SS_NUT + i * SS_FSP} y2={SS_B}
            stroke="var(--gc-fretboard-fret)" strokeWidth={1} />
        ))}
        {Array.from({ length: STRING_COUNT }).map((_, s) => (
          <line key={s} x1={0} y1={ssY(s)} x2={SS_R} y2={ssY(s)}
            stroke="var(--gc-fretboard-str)" strokeWidth={0.8 + s * 0.18} />
        ))}
        {[3,5,7,9,12].map(f => (
          <text key={f} x={SS_NUT + (f - 0.5) * SS_FSP} y={SS_H - 3}
            textAnchor="middle" fontSize={8} fill="var(--gc-fretboard-str)">{f}</text>
        ))}

        {positions.map((p, i) => {
          const note = fretToNote(p.string, p.fret, tuning);
          const ch = TonalNote.chroma(note);
          const isTarget = ch === targetChroma;
          const isRoot = ch === rootChroma;
          const fill = isTarget ? T.coral : isRoot ? T.primary : T.secondary;
          return (
            <g key={i}>
              <circle cx={ssCX(p.fret)} cy={ssY(p.string)} r={isTarget ? 7.5 : 6.5}
                fill={fill} opacity={isTarget ? 0.95 : 0.78}
                stroke={isTarget ? T.bgDeep : 'none'} strokeWidth={isTarget ? 1 : 0} />
              <text x={ssCX(p.fret)} y={ssY(p.string) + 2.5} textAnchor="middle"
                fontSize={5.5} fill="#fff" fontWeight="700">{note}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

// ── Pill button ───────────────────────────────────────────────────────────
const Pill: React.FC<{
  label: string; active: boolean; onClick: () => void; color?: string;
}> = ({ label, active, onClick, color }) => (
  <button onClick={onClick} style={{
    padding: '4px 10px', borderRadius: 0,
    border: active ? 'none' : `1px solid ${T.border}`,
    cursor: 'pointer', fontSize: 11, fontWeight: active ? 500 : 400,
    background: active ? (color ?? T.secondary) : T.bgInput,
    color: active ? T.white : T.textMuted,
    transition: 'all 0.12s', flexShrink: 0,
    borderLeft: '3px solid var(--gc-bar-color)',
  }}>
    {label}
  </button>
);

// ── Main component ────────────────────────────────────────────────────────
export const TargetNoteTab: React.FC<Props> = ({ tuning, capo, desktop }) => {
  const [targetPos, setTargetPos]             = useState<TargetPos | null>(null);
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

  const dotColors = useCallback((item: ResultItem) =>
    item.voicing.map((_, i) => i === item.targetVoicingIdx ? T.primary : T.secondary),
  []);

  const controlsLeft = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Input fretboard */}
      <div style={{ ...card(), padding: '12px 14px' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, marginBottom: 8 }}>
          Select target note
        </div>
        <InputFretboard
          selected={targetPos}
          tuning={tuning.notes}
          onSelect={pos => setTargetPos(pos.string === -1 ? null : pos)}
        />
        <div style={{
          marginTop: 8, fontSize: 12, minHeight: 22,
          color: targetPos ? T.text : T.textDim,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          {targetPos ? (
            <>
              <span style={{
                background: T.coralFaint2, color: T.coral,
                borderRadius: 0, padding: '2px 8px', fontWeight: 400, fontSize: 13,
              }}>
                {targetNoteName}
              </span>
              <span style={{ color: T.textMuted }}>
                String {STRING_LABELS[targetPos.string]} · {targetPos.fret === 0 ? 'Open' : `Fret ${targetPos.fret}`}
              </span>
            </>
          ) : (
            <span>Tap the fretboard to select a target note</span>
          )}
        </div>
      </div>

      {/* Controls accordion */}
      <div style={{ ...card(), padding: 0, overflow: 'hidden' }}>
        <button
          onClick={() => setControlsOpen(o => !o)}
          style={{
            width: '100%', padding: '10px 14px',
            background: T.secondary, border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 400, color: '#fff' }}>
            ⚙ Search Settings
          </span>
          <span style={{
            fontSize: 11, color: '#fff',
            transform: controlsOpen ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.18s', display: 'inline-block',
          }}>▼</span>
        </button>

        {controlsOpen && (
          <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: T.textDim, marginBottom: 5 }}>Interval role</div>
              <div style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 10, color: T.textDim, marginBottom: 4 }}>Core</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {CORE_INTERVALS.map(iv => (
                    <Pill key={iv} label={iv} active={selectedIntervals.has(iv)}
                      onClick={() => toggleInterval(iv)} color={T.secondary} />
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: T.textDim, marginBottom: 4 }}>Tensions</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {TENSION_INTERVALS.map(iv => (
                    <Pill key={iv} label={iv} active={selectedIntervals.has(iv)}
                      onClick={() => toggleInterval(iv)} color={T.primary} />
                  ))}
                </div>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: T.textDim, marginBottom: 5 }}>Position Lock</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['anywhere', 'top', 'bass'] as const).map(pl => (
                  <Pill key={pl}
                    label={pl === 'anywhere' ? 'Anywhere' : pl === 'top' ? 'Top Voice' : 'Bass Note'}
                    active={positionLock === pl}
                    onClick={() => setPositionLock(pl)}
                  />
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: T.textDim, marginBottom: 5 }}>Complexity</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['triads', '7ths', '9ths', 'full'] as const).map(c => (
                  <Pill key={c}
                    label={c === 'triads' ? 'Triads' : c === '7ths' ? '7ths' : c === '9ths' ? '9ths' : 'Full'}
                    active={complexity === c}
                    onClick={() => setComplexity(c)}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const resultsPanel = (
    <div>
      {!targetPos ? (
        <div style={{ ...card({ padding: '28px 16px' }), textAlign: 'center', opacity: 0.5 }}>
          <p style={{ margin: '0 0 6px', fontSize: 9, color: '#9C958C', fontFamily: 'var(--gc-mono)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>Results</p>
          <p style={{ margin: 0, fontSize: 12, color: T.textDim, fontFamily: 'var(--gc-mono)' }}>← Select a note on the fretboard</p>
        </div>
      ) : (
        <>
          <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 8, fontWeight: 600 }}>
            {results.length > 0
              ? `${results.length} chord${results.length !== 1 ? 's' : ''} found`
              : 'No chords found — try different settings'}
          </div>
          {results.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {results.map((item, idx) => {
                const RESULT_COLORS = ['#110CF0', '#1A1818', '#4A453E', '#6B655C', '#8A8378', '#9C958C'];
                const bg = RESULT_COLORS[idx % RESULT_COLORS.length];
                return (
                  <button
                    key={idx}
                    onClick={() => setExpandedIdx(idx)}
                    style={{
                      cursor: 'pointer', border: 'none',
                      textAlign: 'left', display: 'block', width: '100%',
                      background: 'none', padding: 0, borderRadius: 0,
                    }}
                  >
                    <div style={{ background: bg, padding: '6px 10px 4px' }}>
                      <div style={{ fontWeight: 800, fontSize: 14, color: '#fff', lineHeight: 1.1 }}>
                        {item.chordName}
                      </div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)', marginTop: 1 }}>
                        {targetNoteName} = {item.intervalLabel}
                      </div>
                    </div>
                    <div style={{ background: T.bgInput, padding: '6px 10px 8px', border: `1px solid ${T.border}`, borderTop: 'none' }}>
                      <XORow voicing={item.voicing} />
                      <MiniFretboard
                        voicing={item.voicing}
                        dotColors={dotColors(item)}
                        tuning={tuning.notes}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );

  return (
    <div style={desktop
      ? { display: 'grid', gridTemplateColumns: '580px 1fr', gap: 32, alignItems: 'start' }
      : { display: 'flex', flexDirection: 'column', gap: 12 }
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
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 200, padding: 16,
          }}
        >
          <div style={{
            ...card(), width: '100%', maxWidth: 380,
            maxHeight: '88vh', overflowY: 'auto',
            padding: '20px 20px 16px',
            display: 'flex', flexDirection: 'column', gap: 12,
            position: 'relative',
          }}>
            {/* Close */}
            <button onClick={() => setExpandedIdx(null)} style={{
              position: 'absolute', top: 12, right: 12,
              background: T.bgInput, border: 'none', borderRadius: 0,
              cursor: 'pointer', color: T.textMuted, fontSize: 16, lineHeight: 1,
              padding: '3px 7px', borderLeft: '3px solid var(--gc-bar-color)',
            }}>✕</button>

            {/* Chord name */}
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: T.text }}>
                {expandedResult.chordName}
              </div>
              <div style={{ fontSize: 12, color: T.coral, marginTop: 2 }}>
                {targetNoteName} = {expandedResult.intervalLabel}
              </div>
            </div>

            {/* Large diagram */}
            <div style={{ padding: '0 16px' }}>
              <XORow voicing={expandedResult.voicing} />
              <MiniFretboard
                voicing={expandedResult.voicing}
                dotColors={dotColors(expandedResult)}
                tuning={tuning.notes}
                showStringLabels
                showFretNumbers
              />
            </div>

            {/* Play */}
            <button
              onClick={() => { unlockAudio(); playChord(expandedResult!.voicing, tuning.openFreqs, capo); }}
              style={{
                padding: '11px 0', borderRadius: 0, border: 'none',
                cursor: 'pointer', fontWeight: 400, fontSize: 14,
                background: T.secondary, color: T.white,
                borderLeft: '4px solid var(--gc-bar-color)',
              }}
            >PLAY</button>

            <SaveToLibraryButton
              style={{ width: '100%', justifyContent: 'center' }}
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
              <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 400, color: T.textMuted, marginBottom: 6 }}>
                  Fits in
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {fitScales.map((sc, i) => (
                    <Pill
                      key={sc.name}
                      label={sc.name}
                      active={scaleIdx === i}
                      onClick={() => setScaleIdx(prev => prev === i ? null : i)}
                    />
                  ))}
                </div>

                {scaleIdx !== null && fitScales[scaleIdx] && targetNoteName && (
                  <>
                    <div style={{ fontSize: 11, color: T.coral, marginTop: 8 }}>
                      {targetNoteName} is the {degreeInScale(targetNoteName, fitScales[scaleIdx].root)} of {fitScales[scaleIdx].name}
                    </div>
                    <ScaleStrip
                      positions={getScalePositions(fitScales[scaleIdx].root, fitScales[scaleIdx].type, tuning.notes)}
                      tuning={tuning.notes}
                      targetChroma={TonalNote.chroma(targetNoteName) ?? -1}
                      rootChroma={TonalNote.chroma(fitScales[scaleIdx].root) ?? -1}
                    />
                    <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 9, color: T.textDim }}>
                      <span><span style={{ color: T.coral, fontWeight: 400 }}>●</span> target</span>
                      <span><span style={{ color: T.primary, fontWeight: 400 }}>●</span> root</span>
                      <span><span style={{ color: T.secondary, fontWeight: 400 }}>●</span> scale</span>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Carousel */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={() => setExpandedIdx(i => Math.max((i ?? 0) - 1, 0))}
                disabled={expandedIdx === 0}
                style={{
                  flex: 1, padding: '8px 0', borderRadius: 0,
                  border: `1px solid ${T.border}`,
                  cursor: expandedIdx === 0 ? 'not-allowed' : 'pointer',
                  background: T.bgInput,
                  color: expandedIdx === 0 ? T.textDim : T.textMuted,
                  fontWeight: 400, fontSize: 16, borderLeft: '3px solid var(--gc-bar-color)',
                }}
              >‹</button>
              <span style={{ fontSize: 11, color: T.textDim, minWidth: 48, textAlign: 'center' }}>
                {expandedIdx + 1} / {results.length}
              </span>
              <button
                onClick={() => setExpandedIdx(i => Math.min((i ?? 0) + 1, results.length - 1))}
                disabled={expandedIdx === results.length - 1}
                style={{
                  flex: 1, padding: '8px 0', borderRadius: 0,
                  border: `1px solid ${T.border}`,
                  cursor: expandedIdx === results.length - 1 ? 'not-allowed' : 'pointer',
                  background: T.bgInput,
                  color: expandedIdx === results.length - 1 ? T.textDim : T.textMuted,
                  fontWeight: 400, fontSize: 16, borderLeft: '3px solid var(--gc-bar-color)',
                }}
              >›</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
