import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Note as TonalNote, Chord as TonalChord } from '@tonaljs/tonal';
import type { FretPosition, Tuning } from '../../types/music';
import { MiniFretboard } from '../Fretboard/MiniFretboard';
import { fretToNote, STRING_COUNT } from '../../utils/musicTheory';
import { playChord, unlockAudio } from '../../utils/audioPlayback';
import { T, card } from '../../theme';

// ── Constants ─────────────────────────────────────────────────────────────
const CORE_INTERVALS = ['1', 'b3', '3', 'b5', '5'] as const;
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

// Canonical note name for each chroma, plus enharmonic fallback
const CHROMA_TO_NOTE = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const CHROMA_ENHARMONIC: Record<number, string> = { 1: 'Db', 3: 'D#', 6: 'Gb', 8: 'G#', 10: 'A#' };

const STRING_LABELS = ['E', 'A', 'D', 'G', 'B', 'e'];

const CHORD_SUFFIXES_TRIADS = ['M', 'm', 'dim', 'aug', 'sus2', 'sus4'];
const CHORD_SUFFIXES_7THS   = [...CHORD_SUFFIXES_TRIADS, '7', 'maj7', 'm7', 'm7b5', 'dim7'];
const CHORD_SUFFIXES_9THS   = [...CHORD_SUFFIXES_7THS, '9', 'maj9', 'm9', 'add9', '6', 'm6'];
const CHORD_SUFFIXES_FULL   = [...CHORD_SUFFIXES_9THS, '11', 'm11', '13', 'm13', 'maj13', '69'];

// ── Types ─────────────────────────────────────────────────────────────────
interface TargetPos { string: number; fret: number; }

interface ResultItem {
  chordName: string;
  intervalLabel: string;
  voicing: FretPosition[];
  targetVoicingIdx: number;
}

interface Props { tuning: Tuning; capo: number; }

// ── isPlayable (copy from chordVoicings — not exported) ───────────────────
function isPlayable(voicing: FretPosition[]): boolean {
  if (voicing.length < 3) return false;
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

  // Scan windows of 3 frets that include the pinned fret
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

          // Build display name: use TonalJS aliases for cleaner name
          const aliases = chordInfo.aliases;
          const displayName = rootName + (aliases[0] ?? suffix);

          results.push({
            chordName: displayName,
            intervalLabel: INTERVAL_DISPLAY[interval],
            voicing,
            targetVoicingIdx,
          });
        }
      }
    }
  }

  results.sort((a, b) => avgFret(a.voicing) - avgFret(b.voicing));
  return results;
}

// ── Input Fretboard ───────────────────────────────────────────────────────
const InputFretboard: React.FC<{
  selected: TargetPos | null;
  tuning: string[];
  onSelect: (pos: TargetPos) => void;
}> = ({ selected, tuning, onSelect }) => {
  const W = 320, H = 86;
  const openW = 18;
  const nutX = openW;
  const fretAreaW = W - nutX - 2;
  const FRETS = 12;
  const fretW = fretAreaW / FRETS;
  const strH = (H - 16) / (STRING_COUNT - 1);
  const topY = 4;

  const strY = (s: number) => topY + (STRING_COUNT - 1 - s) * strH;
  const fretCenterX = (f: number) =>
    f === 0 ? nutX / 2 : nutX + (f - 0.5) * fretW;

  const DOT_FRETS = [3, 5, 7, 9];
  const DOUBLE_DOT = 12;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', display: 'block', borderRadius: 8, background: T.bgInput }}
    >
      {/* Open string column background */}
      <rect x={0} y={0} width={nutX} height={H} fill={T.bgDeep} opacity={0.3} rx={4} />

      {/* Nut */}
      <rect x={nutX - 2} y={topY} width={3} height={strH * (STRING_COUNT - 1)} fill={T.text} opacity={0.7} rx={1} />

      {/* Fret lines */}
      {Array.from({ length: FRETS + 1 }).map((_, i) => (
        <line key={i}
          x1={nutX + i * fretW} y1={topY}
          x2={nutX + i * fretW} y2={topY + strH * (STRING_COUNT - 1)}
          stroke={T.border} strokeWidth={1}
        />
      ))}

      {/* Strings */}
      {Array.from({ length: STRING_COUNT }).map((_, s) => (
        <line key={s}
          x1={0} y1={strY(s)}
          x2={W - 2} y2={strY(s)}
          stroke={T.secondary} strokeWidth={2.2 - s * 0.2} opacity={0.4}
        />
      ))}

      {/* Fret markers (bottom dots) */}
      {DOT_FRETS.map(f => (
        <circle key={f}
          cx={nutX + (f - 0.5) * fretW}
          cy={H - 5}
          r={2.5} fill={T.textDim} opacity={0.5}
        />
      ))}
      <circle cx={nutX + (DOUBLE_DOT - 0.65) * fretW} cy={H - 5} r={2.5} fill={T.textDim} opacity={0.5} />
      <circle cx={nutX + (DOUBLE_DOT - 0.35) * fretW} cy={H - 5} r={2.5} fill={T.textDim} opacity={0.5} />

      {/* Clickable hit areas + selected dots */}
      {Array.from({ length: STRING_COUNT }).map((_, s) =>
        Array.from({ length: FRETS + 1 }).map((_, f) => {
          const isSelected = selected?.string === s && selected?.fret === f;
          const cx = fretCenterX(f);
          const cy = strY(s);
          const hitX = f === 0 ? 0 : nutX + (f - 1) * fretW;
          const hitW = f === 0 ? nutX : fretW;
          return (
            <g key={`${s}-${f}`} onClick={() => onSelect({ string: s, fret: f })} style={{ cursor: 'pointer' }}>
              <rect x={hitX} y={cy - strH / 2} width={hitW} height={strH} fill="transparent" />
              {isSelected && (
                <circle cx={cx} cy={cy} r={6.5} fill={T.coral} opacity={0.95}
                  style={{ filter: 'drop-shadow(0 0 4px var(--gc-coral))' }} />
              )}
            </g>
          );
        })
      )}
    </svg>
  );
};

// ── Pill button ───────────────────────────────────────────────────────────
const Pill: React.FC<{
  label: string;
  active: boolean;
  onClick: () => void;
  color?: string;
}> = ({ label, active, onClick, color }) => (
  <button onClick={onClick} style={{
    padding: '4px 10px',
    borderRadius: 16,
    border: active ? 'none' : `1px solid ${T.border}`,
    cursor: 'pointer',
    fontSize: 11,
    fontWeight: active ? 700 : 400,
    background: active ? (color ?? T.secondary) : T.bgInput,
    color: active ? T.white : T.textMuted,
    transition: 'all 0.12s',
    flexShrink: 0,
  }}>
    {label}
  </button>
);

// ── Main component ────────────────────────────────────────────────────────
export const TargetNoteTab: React.FC<Props> = ({ tuning, capo }) => {
  const [targetPos, setTargetPos] = useState<TargetPos | null>(null);
  const [selectedIntervals, setSelectedIntervals] = useState<Set<string>>(new Set(['5']));
  const [positionLock, setPositionLock] = useState<'top' | 'bass' | 'anywhere'>('anywhere');
  const [complexity, setComplexity] = useState<'triads' | '7ths' | '9ths' | 'full'>('7ths');
  const [controlsOpen, setControlsOpen] = useState(false);
  const [results, setResults] = useState<ResultItem[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const targetNoteName = targetPos
    ? fretToNote(targetPos.string, targetPos.fret, tuning.notes)
    : null;

  const toggleInterval = useCallback((iv: string) => {
    setSelectedIntervals(prev => {
      const next = new Set(prev);
      if (next.has(iv)) { if (next.size > 1) next.delete(iv); }
      else next.add(iv);
      return next;
    });
  }, []);

  const handleFindChords = useCallback(() => {
    if (!targetPos) return;
    const r = searchChords(
      targetPos,
      [...selectedIntervals],
      positionLock,
      complexity,
      tuning.notes,
    );
    setResults(r);
    setHasSearched(true);
    setExpandedIdx(null);
  }, [targetPos, selectedIntervals, positionLock, complexity, tuning.notes]);

  // Keyboard navigation for modal
  useEffect(() => {
    if (expandedIdx === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setExpandedIdx(i => Math.min((i ?? 0) + 1, results.length - 1));
      if (e.key === 'ArrowLeft') setExpandedIdx(i => Math.max((i ?? 0) - 1, 0));
      if (e.key === 'Escape') setExpandedIdx(null);
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
          בחר נוטה יעד
        </div>
        <InputFretboard
          selected={targetPos}
          tuning={tuning.notes}
          onSelect={pos => { setTargetPos(pos); setHasSearched(false); }}
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
                מיתר {STRING_LABELS[targetPos.string]} · פרט {targetPos.fret === 0 ? 'פתוח' : targetPos.fret}
              </span>
            </>
          ) : (
            <span>לחץ על הגריף לבחירת נוטה יעד</span>
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
            ⚙ הגדרות חיפוש
          </span>
          <span style={{
            fontSize: 11, color: T.textDim,
            transform: controlsOpen ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.18s',
            display: 'inline-block',
          }}>▼</span>
        </button>

        {controlsOpen && (
          <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Interval chips */}
            <div>
              <div style={{ fontSize: 11, color: T.textDim, marginBottom: 5 }}>תפקיד האינטרוול</div>
              <div style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 10, color: T.textDim, marginBottom: 4 }}>Core</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {CORE_INTERVALS.map(iv => (
                    <Pill key={iv} label={iv} active={selectedIntervals.has(iv)} onClick={() => toggleInterval(iv)} color={T.secondary} />
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: T.textDim, marginBottom: 4 }}>Tensions</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {TENSION_INTERVALS.map(iv => (
                    <Pill key={iv} label={iv} active={selectedIntervals.has(iv)} onClick={() => toggleInterval(iv)} color={T.primary} />
                  ))}
                </div>
              </div>
            </div>

            {/* Position Lock */}
            <div>
              <div style={{ fontSize: 11, color: T.textDim, marginBottom: 5 }}>Position Lock</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['anywhere', 'top', 'bass'] as const).map(pl => (
                  <Pill
                    key={pl}
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
                  <Pill
                    key={c}
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

      {/* Find Chords button */}
      <button
        onClick={handleFindChords}
        disabled={!targetPos}
        style={{
          padding: '13px 0',
          borderRadius: 10,
          border: 'none',
          cursor: targetPos ? 'pointer' : 'not-allowed',
          fontWeight: 700,
          fontSize: 14,
          background: targetPos ? T.secondary : T.border,
          color: targetPos ? T.white : T.textDim,
          transition: 'background 0.15s',
          letterSpacing: 0.3,
        }}
      >
        {targetPos ? `מצא אקורדים עם ${targetNoteName}` : 'בחר נוטה יעד תחילה'}
      </button>

      {/* Results */}
      {hasSearched && (
        <div>
          <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 8, fontWeight: 600 }}>
            {results.length > 0
              ? `נמצאו ${results.length} אקורדים`
              : 'לא נמצאו אקורדים — נסה הגדרות שונות'}
          </div>

          {results.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {results.map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => setExpandedIdx(idx)}
                  style={{
                    ...card(),
                    padding: '10px 10px 8px',
                    cursor: 'pointer',
                    border: `1px solid ${T.border}`,
                    textAlign: 'left',
                    display: 'block',
                    width: '100%',
                  }}
                >
                  <MiniFretboard
                    voicing={item.voicing}
                    dotColors={dotColors(item)}
                    tuning={tuning.notes}
                  />
                  <div style={{
                    marginTop: 6, fontWeight: 700, fontSize: 13, color: T.text,
                  }}>
                    {item.chordName}
                  </div>
                  <div style={{ fontSize: 10, color: T.coral, marginTop: 2 }}>
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
          onClick={(e) => { if (e.target === e.currentTarget) setExpandedIdx(null); }}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 200,
            padding: 16,
          }}
        >
          <div
            ref={modalRef}
            style={{
              ...card(),
              width: '100%', maxWidth: 380,
              padding: '20px 20px 16px',
              display: 'flex', flexDirection: 'column', gap: 12,
              position: 'relative',
            }}
          >
            {/* Close */}
            <button
              onClick={() => setExpandedIdx(null)}
              style={{
                position: 'absolute', top: 12, right: 12,
                background: T.bgInput, border: 'none', borderRadius: 6,
                cursor: 'pointer', color: T.textMuted, fontSize: 16, lineHeight: 1,
                padding: '3px 7px',
              }}
            >✕</button>

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
              <MiniFretboard
                voicing={expandedResult.voicing}
                dotColors={dotColors(expandedResult)}
                tuning={tuning.notes}
                showStringLabels
                showFretNumbers
              />
            </div>

            {/* Play button */}
            <button
              onClick={() => {
                unlockAudio();
                playChord(expandedResult!.voicing, tuning.openFreqs, capo);
              }}
              style={{
                padding: '11px 0',
                borderRadius: 10, border: 'none',
                cursor: 'pointer', fontWeight: 700, fontSize: 14,
                background: T.secondary, color: T.white,
              }}
            >
              ▶ נגן
            </button>

            {/* Carousel controls */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <button
                onClick={() => setExpandedIdx(i => Math.max((i ?? 0) - 1, 0))}
                disabled={expandedIdx === 0}
                style={{
                  flex: 1, padding: '8px 0', borderRadius: 8,
                  border: `1px solid ${T.border}`, cursor: expandedIdx === 0 ? 'not-allowed' : 'pointer',
                  background: T.bgInput, color: expandedIdx === 0 ? T.textDim : T.textMuted,
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
