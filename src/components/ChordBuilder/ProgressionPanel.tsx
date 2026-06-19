import { useState, useRef, useMemo } from 'react';
import type { ChordInProgression, Genre, ProgressionSuggestion, Tuning } from '../../types/music';
import { MiniFretboard } from '../Fretboard/MiniFretboard';
import { formatChordName } from '../../utils/chordIdentifier';
import { suggestNextChords, suggestCustomChords, detectKey } from '../../utils/progressionHelper';
import { findChordVoicings } from '../../utils/chordVoicings';
import { playChord } from '../../utils/audioPlayback';
import { IconClipboard, IconLink } from '../Icons';
import { T, card } from '../../theme';

interface Props {
  progression: ChordInProgression[];
  onAddToProgression: (item: ChordInProgression) => void;
  onRemoveFromProgression: (id: string) => void;
  onClearProgression: () => void;
  onReorderProgression: (id: string, dir: -1 | 1) => void;
  onTransposeProgression: (semitones: number) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  tuning: Tuning;
  capo: number;
}

interface HoverPreview {
  suggestion: ProgressionSuggestion;
  top: number;
  left: number;
}

const GENRES: { id: Genre; label: string }[] = [
  { id: 'any',    label: 'Any'    },
  { id: 'blues',  label: 'Blues'  },
  { id: 'jazz',   label: 'Jazz'   },
  { id: 'pop',    label: 'Pop'    },
  { id: 'rock',   label: 'Rock'   },
  { id: 'metal',  label: 'Metal'  },
  { id: 'custom', label: 'Custom' },
];

const CHORD_ACCENTS = [T.primary, T.secondary, '#8b6914', '#7a3a6a', '#2a6a8a', '#4a7a3a'];

const LABEL_STYLE = {
  margin: '0 0 10px',
  fontSize: 11,
  fontWeight: 700,
  color: T.textMuted,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.06em',
};

export function ProgressionPanel({
  progression, onAddToProgression, onRemoveFromProgression, onClearProgression,
  onReorderProgression, onTransposeProgression,
  canUndo, canRedo, onUndo, onRedo,
  tuning, capo,
}: Props) {
  const [genre, setGenre] = useState<Genre>('any');
  const [customNumerals, setCustomNumerals] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [hoverPreview, setHoverPreview] = useState<HoverPreview | null>(null);
  const [progressionName, setProgressionName] = useState('');
  const [exporting, setExporting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [playingAll, setPlayingAll] = useState(false);
  const [shared, setShared] = useState(false);
  const playAllTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const handleAddSuggestion = (s: ProgressionSuggestion) => {
    onAddToProgression({ id: `chord-${Date.now()}`, chord: s.chord, fretPositions: [] });
    setShowSuggestions(false);
    setHoverPreview(null);
  };

  const handleClear = () => {
    onClearProgression();
    setProgressionName('');
  };

  const handleShare = () => {
    const payload = progression.map(c => ({ n: c.chord.name, f: c.fretPositions }));
    const encoded = btoa(JSON.stringify(payload));
    const url = `${location.origin}${location.pathname}#s=${encoded}`;
    navigator.clipboard.writeText(url).then(() => {
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    });
  };

  const handleCopy = () => {
    const text = progression.map(c => formatChordName(c.chord.name)).join(' – ');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleExportPDF = async () => {
    setExporting(true);
    try {
      const { exportProgressionPDF } = await import('../../utils/pdfExport');
      await exportProgressionPDF(progressionName || 'Chord Progression', progression);
    } finally {
      setExporting(false);
    }
  };

  const handlePlayAll = () => {
    if (playingAll) {
      playAllTimersRef.current.forEach(clearTimeout);
      playAllTimersRef.current = [];
      setPlayingAll(false);
      return;
    }
    const chordsWithFrets = progression.filter(c => c.fretPositions.length > 0);
    if (chordsWithFrets.length === 0) return;
    setPlayingAll(true);
    chordsWithFrets.forEach((item, i) => {
      const t = setTimeout(() => {
        playChord(item.fretPositions, tuning.openFreqs, capo);
        if (i === chordsWithFrets.length - 1) setPlayingAll(false);
      }, i * 2000);
      playAllTimersRef.current.push(t);
    });
  };

  const suggestions = useMemo(
    () => genre === 'custom'
      ? suggestCustomChords(progression, customNumerals)
      : suggestNextChords(progression, genre),
    [progression, genre, customNumerals]
  );
  const detectedKey = useMemo(
    () => progression.length >= 2 ? detectKey(progression.map(c => c.chord)) : '',
    [progression]
  );
  const previewVoicings = hoverPreview
    ? findChordVoicings(hoverPreview.suggestion.chord.name, 1, tuning.notes)
    : [];

  if (progression.length === 0) return null;

  return (
    <>
      {/* ── Progression card ── */}
      <div style={card()}>
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <p style={{ ...LABEL_STYLE, margin: 0 }}>
              Your Progression · {progression.length} chord{progression.length > 1 ? 's' : ''}
            </p>
            {detectedKey && (
              <span style={{
                padding: '2px 8px', borderRadius: 0, fontSize: 10, fontWeight: 700,
                background: T.secondaryBg, color: T.secondary, border: `1px solid ${T.secondaryFaint}`,
              }}>
                Key: {detectedKey}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              onClick={onUndo}
              disabled={!canUndo}
              title="Undo (Ctrl+Z)"
              style={{
                padding: '4px 8px', borderRadius: 0, border: `1px solid ${T.border}`,
                background: T.bgInput, color: canUndo ? T.textMuted : T.textDim,
                fontSize: 11, cursor: canUndo ? 'pointer' : 'not-allowed', fontWeight: 600,
                borderLeft: '3px solid var(--gc-bar-color)',
              }}
            >↩</button>
            <button
              onClick={onRedo}
              disabled={!canRedo}
              title="Redo (Ctrl+Shift+Z)"
              style={{
                padding: '4px 8px', borderRadius: 0, border: `1px solid ${T.border}`,
                background: T.bgInput, color: canRedo ? T.textMuted : T.textDim,
                fontSize: 11, cursor: canRedo ? 'pointer' : 'not-allowed', fontWeight: 600,
                borderLeft: '3px solid var(--gc-bar-color)',
              }}
            >↪</button>
            <button
              onClick={handleCopy}
              style={{
                padding: '4px 10px', borderRadius: 0, border: `1px solid ${T.border}`,
                background: copied ? T.secondaryBg : T.bgInput,
                color: copied ? T.secondary : T.textMuted, fontSize: 11,
                cursor: 'pointer', fontWeight: 600, transition: 'filter 0.15s',
                borderLeft: '3px solid var(--gc-bar-color)',
              }}
            >
              {copied ? '✓ Copied' : <><IconClipboard size={12} /> Copy</>}
            </button>
            <button
              onClick={handleExportPDF}
              disabled={exporting}
              style={{
                padding: '4px 10px', borderRadius: 0, border: `1px solid ${T.border}`,
                background: T.bgInput, color: T.textMuted, fontSize: 11,
                cursor: exporting ? 'not-allowed' : 'pointer', fontWeight: 600,
                transition: 'filter 0.15s', borderLeft: '3px solid var(--gc-bar-color)',
              }}
            >
              {exporting ? '…' : 'PDF'}
            </button>
          </div>
        </div>

        {/* Share row */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <button
            onClick={handleShare}
            style={{
              flex: 1, padding: '7px 0', borderRadius: 0, border: `1px solid ${T.border}`,
              background: shared ? T.secondaryBg : T.bgInput,
              color: shared ? T.secondary : T.textMuted, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              transition: 'all 0.15s', borderLeft: '3px solid var(--gc-bar-color)',
            }}
          >
            {shared ? '✓ Copied!' : <><IconLink size={12} /> Share Link</>}
          </button>
        </div>

        {/* Progression name input */}
        <input
          value={progressionName}
          onChange={e => setProgressionName(e.target.value)}
          placeholder="Progression name (optional)…"
          style={{
            width: '100%', marginBottom: 12, padding: '7px 10px', borderRadius: 0,
            border: `1px solid ${T.border}`, background: T.bgInput,
            color: T.text, fontSize: 13, fontFamily: 'inherit',
            boxSizing: 'border-box',
          }}
        />

        {/* Transpose controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 11, color: T.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Transpose:
          </span>
          <button
            onClick={() => onTransposeProgression(-1)}
            style={{
              width: 34, height: 34, borderRadius: 0, border: `1px solid ${T.border}`,
              background: T.bgInput, color: T.text, fontSize: 16, fontWeight: 700,
              cursor: 'pointer', lineHeight: 1, borderLeft: '3px solid var(--gc-bar-color)',
            }}
          >−</button>
          <span style={{ fontSize: 11, color: T.textMuted }}>semitone</span>
          <button
            onClick={() => onTransposeProgression(1)}
            style={{
              width: 34, height: 34, borderRadius: 0, border: `1px solid ${T.border}`,
              background: T.bgInput, color: T.text, fontSize: 16, fontWeight: 700,
              cursor: 'pointer', lineHeight: 1, borderLeft: '3px solid var(--gc-bar-color)',
            }}
          >+</button>
        </div>

        {/* Clear All */}
        <button
          onClick={handleClear}
          style={{
            width: '100%', marginBottom: 10, padding: '10px 0', borderRadius: 0,
            border: `1px solid ${T.coral}`,
            background: T.coralFaint,
            color: T.coral, fontWeight: 700, fontSize: 13, cursor: 'pointer',
            transition: 'all 0.15s', borderLeft: '4px solid var(--gc-bar-color)',
          }}
        >
          🗑 Clear All Chords
        </button>

        {/* Chord cards */}
        <div className="gc-chip-strip" style={{ paddingTop: 10 }}>
          {progression.map((item, i) => {
            const accent = CHORD_ACCENTS[i % CHORD_ACCENTS.length];
            return (
              <div key={item.id} style={{
                position: 'relative', minWidth: 72, flexShrink: 0,
                padding: '10px 14px', borderRadius: 0,
                background: T.bgInput, border: `1px solid ${T.border}`,
                borderLeftWidth: 3, borderLeftColor: accent,
                textAlign: 'center',
              }}>
                <span style={{ display: 'block', fontSize: 10, color: accent, marginBottom: 2, fontWeight: 600 }}>{i + 1}</span>
                <span style={{ display: 'block', fontSize: 20, fontWeight: 800, color: T.text }}>{formatChordName(item.chord.name)}</span>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginTop: 6 }}>
                  <button
                    onClick={() => onReorderProgression(item.id, -1)}
                    disabled={i === 0}
                    style={{
                      width: 24, height: 22, borderRadius: 0, border: `1px solid ${T.border}`,
                      background: T.bgCard, color: i === 0 ? T.textDim : T.textMuted,
                      fontSize: 12, cursor: i === 0 ? 'default' : 'pointer', padding: 0, lineHeight: 1,
                      borderLeft: '3px solid var(--gc-bar-color)',
                    }}
                  >←</button>
                  <button
                    onClick={() => onReorderProgression(item.id, 1)}
                    disabled={i === progression.length - 1}
                    style={{
                      width: 24, height: 22, borderRadius: 0, border: `1px solid ${T.border}`,
                      background: T.bgCard, color: i === progression.length - 1 ? T.textDim : T.textMuted,
                      fontSize: 12, cursor: i === progression.length - 1 ? 'default' : 'pointer', padding: 0, lineHeight: 1,
                      borderLeft: '3px solid var(--gc-bar-color)',
                    }}
                  >→</button>
                </div>
                {item.fretPositions.length > 0 && (
                  <button
                    onClick={() => playChord(item.fretPositions, tuning.openFreqs, capo)}
                    style={{
                      display: 'block', width: '100%', marginTop: 6, padding: '7px 0',
                      borderRadius: 0, background: T.primaryBg,
                      color: T.primary, fontSize: 16, fontWeight: 700, cursor: 'pointer',
                      minHeight: 36, borderLeft: '3px solid var(--gc-bar-color)',
                    }}
                  >▶</button>
                )}
                <button
                  onClick={() => onRemoveFromProgression(item.id)}
                  style={{
                    position: 'absolute', top: -7, right: -7, width: 20, height: 20,
                    borderRadius: 0, background: T.border,
                    color: T.textMuted, fontSize: 13, cursor: 'pointer', lineHeight: '20px', padding: 0,
                  }}
                >×</button>
              </div>
            );
          })}
        </div>

        {/* Play All */}
        {progression.filter(c => c.fretPositions.length > 0).length >= 2 && (
          <button
            onClick={handlePlayAll}
            style={{
              width: '100%', marginTop: 12, padding: '10px 0', borderRadius: 0,
              border: `1px solid ${playingAll ? T.coral : T.secondary}`,
              background: playingAll ? T.coralFaint2 : T.secondaryBg,
              color: playingAll ? T.coral : T.secondary,
              fontWeight: 700, fontSize: 14, cursor: 'pointer', transition: 'all 0.15s',
              borderLeft: '4px solid var(--gc-bar-color)',
            }}
          >
            {playingAll ? '■  Stop' : '▶▶  Play All'}
          </button>
        )}

        {/* Suggest section */}
        {progression.length >= 2 && (
          <div style={{ marginTop: 14 }}>
            <p style={{ ...LABEL_STYLE, margin: '0 0 7px' }}>Mood:</p>
            <div className="gc-pills" style={{ marginBottom: 10 }}>
              {GENRES.map(g => (
                <button key={g.id} onClick={() => setGenre(g.id)}
                  className="gc-pill"
                  style={{
                    padding: '5px 13px', borderRadius: 0, cursor: 'pointer', fontSize: 12,
                    fontWeight: genre === g.id ? 700 : 400,
                    background: genre === g.id ? T.primary : T.bgInput,
                    color: genre === g.id ? T.text : T.textMuted,
                    transition: 'filter 0.15s', borderLeft: '3px solid var(--gc-bar-color)',
                  }}>
                  {g.label}
                </button>
              ))}
            </div>

            {genre === 'custom' && (
              <div style={{ marginBottom: 10 }}>
                <input
                  value={customNumerals}
                  onChange={e => setCustomNumerals(e.target.value)}
                  placeholder="e.g. I IV V vi IIm V7…"
                  style={{
                    width: '100%', padding: '7px 10px', borderRadius: 0,
                    border: `1px solid ${T.border}`, background: T.bgInput,
                    color: T.text, fontSize: 13, fontFamily: 'inherit',
                    boxSizing: 'border-box',
                  }}
                />
                <div style={{ fontSize: 10, color: T.textDim, marginTop: 4 }}>
                  Roman numerals · detected key: {detectedKey || '—'}
                </div>
              </div>
            )}

            <button
              onClick={() => setShowSuggestions(v => !v)}
              style={{
                width: '100%', padding: '11px 0', borderRadius: 0, border: `1px solid ${T.secondary}`,
                cursor: 'pointer', fontSize: 14, fontWeight: 700,
                background: showSuggestions ? T.secondaryBg : T.bgInput,
                color: T.secondary, transition: 'filter 0.15s',
                borderLeft: '4px solid var(--gc-bar-color)',
              }}>
              {showSuggestions ? 'Hide Suggestions' : '✨ Suggest Next Chord'}
            </button>
          </div>
        )}
      </div>

      {/* ── Suggestions grid ── */}
      {showSuggestions && (
        <div style={card()}>
          <p style={LABEL_STYLE}>Next Chord Suggestions · hover to preview</p>
          {suggestions.length > 0 ? (
            <div className="gc-suggest-grid">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => handleAddSuggestion(s)}
                  onMouseEnter={e => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setHoverPreview({ suggestion: s, top: rect.top, left: rect.left });
                  }}
                  onMouseLeave={() => setHoverPreview(null)}
                  style={{
                    padding: 12, borderRadius: 0,
                    background: T.bgInput, border: `1px solid ${T.border}`,
                    cursor: 'pointer', color: T.text, textAlign: 'left',
                    transition: 'filter 0.15s', borderLeft: '3px solid var(--gc-bar-color)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 18, fontWeight: 800 }}>{formatChordName(s.chord.name)}</span>
                    <span style={{ fontSize: 11, color: T.secondary, fontFamily: 'monospace' }}>{s.romanNumeral}</span>
                  </div>
                  <div style={{ fontSize: 11, color: T.textMuted, lineHeight: 1.4 }}>{s.reason}</div>
                  {s.genre && (
                    <span style={{ fontSize: 10, color: T.primary, display: 'block', marginTop: 4 }}>{s.genre}</span>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <p style={{ textAlign: 'center', color: T.textDim, fontSize: 13, margin: 0 }}>
              No suggestions — try a different mood
            </p>
          )}
        </div>
      )}

      {/* ── Hover chord preview tooltip ── */}
      {hoverPreview && previewVoicings.length > 0 && (
        <div style={{
          position: 'fixed',
          top: Math.max(8, hoverPreview.top - 168),
          left: Math.min(hoverPreview.left, (typeof window !== 'undefined' ? window.innerWidth : 700) - 220),
          zIndex: 1000,
          width: 210,
          background: T.bgCard,
          border: `1px solid ${T.border}`,
          borderRadius: 0,
          padding: '10px 10px 6px',
          boxShadow: '0 8px 28px rgba(0,0,0,0.55)',
          pointerEvents: 'none',
        }}>
          <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 800, color: T.text, textAlign: 'center' }}>
            {formatChordName(hoverPreview.suggestion.chord.name)}
          </p>
          <MiniFretboard voicing={previewVoicings[0]} tuning={tuning.notes} />
        </div>
      )}
    </>
  );
}
