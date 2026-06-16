import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Note as TonalNote, Chord as TonalChord } from '@tonaljs/tonal';
import type { FretPosition, Tuning } from '../../types/music';
import { MiniFretboard } from '../Fretboard/MiniFretboard';
import { fretToNote, STRING_COUNT } from '../../utils/musicTheory';
import { playChord, unlockAudio } from '../../utils/audioPlayback';
import { T, card } from '../../theme';

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

interface Props { tuning: Tuning; capo: number; }

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

          const aliases = chordInfo.aliases;
          const displayName = rootName + (aliases[0] ?? suffix);

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
          fontSize: 9, fontWeight: 700, width: 12, textAlign: 'center',
          color: muted ? T.textDim : label === 'O' ? T.primary : T.textMuted,
        }}>
          {label}
        </span>
      ))}
    </div>
  );
}

// ── Scrollable input fretboard ────────────────────────────────────────────
// Same proportions as InteractiveFretboard (680×168) so it looks identical in size.
// minWidth: 540 ensures frets are always tap-friendly and triggers scroll on narrow screens.
const FB_SVG_W  = 680;
const FB_SVG_H  = 168;
const FB_NUT_X  = 28;
const FB_FRET_SP = (FB_SVG_W - FB_NUT_X - 8) / 12;  // ≈ 53.7 px per fret
const FB_STR_SP  = (FB_SVG_H - 32) / (STRING_COUNT - 1); // ≈ 27.2 px
const FB_TOP_Y   = 8;
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
      borderRadius: 8,
      background: T.bgInput,
      scrollbarWidth: 'none' as React.CSSProperties['scrollbarWidth'],
    }}>
      <svg
        viewBox={`0 0 ${FB_SVG_W} ${FB_SVG_H}`}
        style={{ width: '100%', minWidth: 540, maxHeight: 190, display: 'block' }}
      >
        {/* Open-string zone */}
        <rect x={0} y={0} width={FB_NUT_X} height={FB_SVG_H} fill={T.bgDeep} opacity={0.2} />

        {/* Nut */}
        <rect x={FB_NUT_X - 3} y={FB_TOP_Y} width={3.5} height={5 * FB_STR_SP}
          fill={T.text} opacity={0.65} rx={1} />

        {/* Fret lines */}
        {Array.from({ length: 13 }).map((_, i) => (
          <line key={i}
            x1={FB_NUT_X + i * FB_FRET_SP} y1={FB_TOP_Y}
            x2={FB_NUT_X + i * FB_FRET_SP} y2={FB_TOP_Y + 5 * FB_STR_SP}
            stroke={T.border} strokeWidth={1.2}
          />
        ))}

        {/* Strings */}
        {Array.from({ length: STRING_COUNT }).map((_, s) => (
          <line key={s}
            x1={0} y1={strY(s)} x2={FB_SVG_W} y2={strY(s)}
            stroke={T.secondary} strokeWidth={0.9 + s * 0.22} opacity={0.5}
          />
        ))}

        {/* Position dots */}
        {[3, 5, 7, 9].map(f => (
          <circle key={f}
            cx={FB_NUT_X + (f - 0.5) * FB_FRET_SP}
            cy={FB_TOP_Y + 2.5 * FB_STR_SP}
            r={4} fill={T.border} opacity={0.45}
          />
        ))}
        <circle cx={FB_NUT_X + 11.35 * FB_FRET_SP} cy={FB_TOP_Y + 1.5 * FB_STR_SP} r={3.5} fill={T.border} opacity={0.45} />
        <circle cx={FB_NUT_X + 11.35 * FB_FRET_SP} cy={FB_TOP_Y + 3.5 * FB_STR_SP} r={3.5} fill={T.border} opacity={0.45} />

        {/* Fret number labels */}
        {[1,2,3,4,5,6,7,8,9,10,11,12].map(f => (
          <text key={f}
            x={FB_NUT_X + (f - 0.5) * FB_FRET_SP}
            y={FB_SVG_H - 3}
            textAnchor="middle" fontSize={9} fill={T.textDim}
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

// ── Pill button ───────────────────────────────────────────────────────────
const Pill: React.FC<{
  label: string; active: boolean; onClick: () => void; color?: string;
}> = ({ label, active, onClick, color }) => (
  <button onClick={onClick} style={{
    padding: '4px 10px', borderRadius: 16,
    border: active ? 'none' : `1px solid ${T.border}`,
    cursor: 'pointer', fontSize: 11, fontWeight: active ? 700 : 400,
    background: active ? (color ?? T.secondary) : T.bgInput,
    color: active ? T.white : T.textMuted,
    transition: 'all 0.12s', flexShrink: 0,
  }}>
    {label}
  </button>
);

// ── Main component ────────────────────────────────────────────────────────
export const TargetNoteTab: React.FC<Props> = ({ tuning, capo }) => {
  const [targetPos, setTargetPos]             = useState<TargetPos | null>(null);
  const [selectedIntervals, setSelectedIntervals] = useState<Set<string>>(new Set(['1']));
  const [positionLock, setPositionLock]       = useState<'top' | 'bass' | 'anywhere'>('anywhere');
  const [complexity, setComplexity]           = useState<'triads' | '7ths' | '9ths' | 'full'>('triads');
  const [controlsOpen, setControlsOpen]       = useState(false);
  const [results, setResults]                 = useState<ResultItem[]>([]);
  const [expandedIdx, setExpandedIdx]         = useState<number | null>(null);

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

  const dotColors = useCallback((item: ResultItem) =>
    item.voicing.map((_, i) => i === item.targetVoicingIdx ? T.coral : T.secondary),
  []);

  return (
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
                borderRadius: 6, padding: '2px 8px', fontWeight: 700, fontSize: 13,
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
            background: 'transparent', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 700, color: T.textMuted }}>
            ⚙ Search Settings
          </span>
          <span style={{
            fontSize: 11, color: T.textDim,
            transform: controlsOpen ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.18s', display: 'inline-block',
          }}>▼</span>
        </button>

        {controlsOpen && (
          <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Interval role */}
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

            {/* Position Lock */}
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

            {/* Complexity */}
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

      {/* Results */}
      {targetPos && (
        <div>
          <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 8, fontWeight: 600 }}>
            {results.length > 0
              ? `${results.length} chord${results.length !== 1 ? 's' : ''} found`
              : 'No chords found — try different settings'}
          </div>

          {results.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {results.map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => setExpandedIdx(idx)}
                  style={{
                    ...card(), padding: '10px 10px 8px',
                    cursor: 'pointer', border: `1px solid ${T.border}`,
                    textAlign: 'left', display: 'block', width: '100%',
                  }}
                >
                  <XORow voicing={item.voicing} />
                  <MiniFretboard
                    voicing={item.voicing}
                    dotColors={dotColors(item)}
                    tuning={tuning.notes}
                  />
                  <div style={{ marginTop: 5, fontWeight: 700, fontSize: 13, color: T.text }}>
                    {item.chordName}
                  </div>
                  <div style={{ fontSize: 10, color: T.coral, marginTop: 1 }}>
                    {targetNoteName} = {item.intervalLabel}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

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
            padding: '20px 20px 16px',
            display: 'flex', flexDirection: 'column', gap: 12,
            position: 'relative',
          }}>
            {/* Close */}
            <button onClick={() => setExpandedIdx(null)} style={{
              position: 'absolute', top: 12, right: 12,
              background: T.bgInput, border: 'none', borderRadius: 6,
              cursor: 'pointer', color: T.textMuted, fontSize: 16, lineHeight: 1,
              padding: '3px 7px',
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
                padding: '11px 0', borderRadius: 10, border: 'none',
                cursor: 'pointer', fontWeight: 700, fontSize: 14,
                background: T.secondary, color: T.white,
              }}
            >▶ Play</button>

            {/* Carousel */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={() => setExpandedIdx(i => Math.max((i ?? 0) - 1, 0))}
                disabled={expandedIdx === 0}
                style={{
                  flex: 1, padding: '8px 0', borderRadius: 8,
                  border: `1px solid ${T.border}`,
                  cursor: expandedIdx === 0 ? 'not-allowed' : 'pointer',
                  background: T.bgInput,
                  color: expandedIdx === 0 ? T.textDim : T.textMuted,
                  fontWeight: 700, fontSize: 16,
                }}
              >‹</button>
              <span style={{ fontSize: 11, color: T.textDim, minWidth: 48, textAlign: 'center' }}>
                {expandedIdx + 1} / {results.length}
              </span>
              <button
                onClick={() => setExpandedIdx(i => Math.min((i ?? 0) + 1, results.length - 1))}
                disabled={expandedIdx === results.length - 1}
                style={{
                  flex: 1, padding: '8px 0', borderRadius: 8,
                  border: `1px solid ${T.border}`,
                  cursor: expandedIdx === results.length - 1 ? 'not-allowed' : 'pointer',
                  background: T.bgInput,
                  color: expandedIdx === results.length - 1 ? T.textDim : T.textMuted,
                  fontWeight: 700, fontSize: 16,
                }}
              >›</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
