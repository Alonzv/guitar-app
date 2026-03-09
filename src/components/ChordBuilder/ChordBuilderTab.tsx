import { useState, useRef, useMemo } from 'react';
import type { ChordInProgression, FretPosition, Genre, ProgressionSuggestion, Tuning } from '../../types/music';
import { InteractiveFretboard } from '../Fretboard/InteractiveFretboard';
import { MiniFretboard } from '../Fretboard/MiniFretboard';
import { ChordName } from './ChordName';
import { VoicingVariations } from './VoicingVariations';
import { identifyChord, formatChordName } from '../../utils/chordIdentifier';
import { suggestNextChords, suggestCustomChords, detectKey } from '../../utils/progressionHelper';
import { findChordVoicings } from '../../utils/chordVoicings';
import { exportProgressionPDF } from '../../utils/pdfExport';
import { playChord } from '../../utils/audioPlayback';
import { T, card, btn } from '../../theme';
import { TUNINGS } from '../../utils/musicTheory';

interface Props {
  progression: ChordInProgression[];
  onAddToProgression: (item: ChordInProgression) => void;
  onRemoveFromProgression: (id: string) => void;
  onClearProgression: () => void;
  onReorderProgression: (id: string, dir: -1 | 1) => void;
  onTransposeProgression: (semitones: number) => void;
  onSaveSong: (name: string) => void;
  tuning: Tuning;
  onTuningChange: (tuning: Tuning) => void;
  capo: number;
  onCapoChange: (capo: number) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
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

const SELECT_STYLE: React.CSSProperties = {
  appearance: 'none',
  WebkitAppearance: 'none',
  background: T.bgInput,
  border: `1px solid ${T.border}`,
  borderRadius: 8,
  color: T.text,
  fontFamily: 'inherit',
  fontSize: 12,
  fontWeight: 600,
  padding: '5px 26px 5px 10px',
  cursor: 'pointer',
  outline: 'none',
};

export function ChordBuilderTab({
  progression, onAddToProgression, onRemoveFromProgression, onClearProgression,
  onReorderProgression, onTransposeProgression, onSaveSong,
  tuning, onTuningChange, capo, onCapoChange,
  canUndo, canRedo, onUndo, onRedo,
}: Props) {
  const [activeDots, setActiveDots] = useState<FretPosition[]>([]);
  const [genre, setGenre] = useState<Genre>('any');
  const [customNumerals, setCustomNumerals] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showVariations, setShowVariations] = useState(false);
  const [selectedVariationIndex, setSelectedVariationIndex] = useState<number | undefined>(undefined);
  const [hoverPreview, setHoverPreview] = useState<HoverPreview | null>(null);
  const [progressionName, setProgressionName] = useState('');
  const [exporting, setExporting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [playingAll, setPlayingAll]   = useState(false);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [songName, setSongName]         = useState('');
  const [shared, setShared]             = useState(false);
  const playAllTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const handleToggle = (pos: FretPosition) => {
    setActiveDots(prev => {
      const exists = prev.findIndex(d => d.string === pos.string && d.fret === pos.fret);
      if (exists !== -1) return prev.filter((_, i) => i !== exists);
      return [...prev.filter(d => d.string !== pos.string), pos];
    });
    setShowVariations(false);
    setSelectedVariationIndex(undefined);
  };

  const handleAdd = () => {
    const chords = identifyChord(activeDots, tuning.notes, capo);
    if (chords.length === 0) return;
    onAddToProgression({ id: `chord-${Date.now()}`, chord: chords[0], fretPositions: [...activeDots] });
    setActiveDots([]);
  };

  const handleAddSuggestion = (s: ProgressionSuggestion) => {
    onAddToProgression({ id: `chord-${Date.now()}`, chord: s.chord, fretPositions: [] });
    setShowSuggestions(false);
    setHoverPreview(null);
  };

  const handleClear = () => {
    onClearProgression();
    setProgressionName('');
    setShowSaveForm(false);
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

  const handleConfirmSave = () => {
    if (progression.length === 0) return;
    onSaveSong(songName);
    setSongName('');
    setShowSaveForm(false);
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

  const chords = useMemo(() => identifyChord(activeDots, tuning.notes, capo), [activeDots, tuning, capo]);
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
  const voicings = showVariations && chords.length > 0
    ? findChordVoicings(chords[0].name, 8, tuning.notes)
    : [];

  const previewVoicings = hoverPreview
    ? findChordVoicings(hoverPreview.suggestion.chord.name, 1, tuning.notes)
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── Fretboard ── */}
      <div style={card()}>
        <p style={LABEL_STYLE}>Click a fret to place a note · click again to remove</p>

        {/* Tuning + Capo selectors */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
          {/* Tuning */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, color: T.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>Tuning</span>
            <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
              <select
                value={tuning.name}
                onChange={e => {
                  const t = TUNINGS.find(t => t.name === e.target.value);
                  if (t) onTuningChange(t);
                }}
                style={SELECT_STYLE}
              >
                {TUNINGS.map(t => <option key={t.name} value={t.name}>{t.label}</option>)}
              </select>
              <span style={{ position: 'absolute', right: 8, pointerEvents: 'none', fontSize: 9, color: T.textMuted }}>▾</span>
            </div>
          </div>
          {/* Capo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, color: T.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>Capo</span>
            <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
              <select
                value={capo}
                onChange={e => onCapoChange(Number(e.target.value))}
                style={SELECT_STYLE}
              >
                {[0,1,2,3,4,5,6,7].map(n => (
                  <option key={n} value={n}>{n === 0 ? 'None' : `Fret ${n}`}</option>
                ))}
              </select>
              <span style={{ position: 'absolute', right: 8, pointerEvents: 'none', fontSize: 9, color: T.textMuted }}>▾</span>
            </div>
          </div>
        </div>

        <InteractiveFretboard activeDots={activeDots} onToggle={handleToggle} tuning={tuning.notes} capo={capo} />
      </div>

      {/* ── Chord name ── */}
      <div style={card({ minHeight: 100, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 })}>
        <ChordName positions={activeDots} tuning={tuning.notes} capo={capo} />
        {chords.length > 0 && (
          <button
            onClick={() => { setShowVariations(v => !v); setSelectedVariationIndex(undefined); }}
            style={{
              padding: '6px 16px', borderRadius: 20, border: `1px solid ${T.border}`,
              cursor: 'pointer', fontSize: 12, fontWeight: 500,
              background: showVariations ? T.primaryBg : T.bgInput,
              color: showVariations ? T.primary : T.textMuted,
              transition: 'filter 0.15s',
            }}
          >
            {showVariations ? 'Hide variations' : 'Show more variations'}
          </button>
        )}
      </div>

      {/* ── Voicing variations ── */}
      {showVariations && (
        <VoicingVariations
          voicings={voicings}
          selectedIndex={selectedVariationIndex}
          onSelect={(voicing, index) => {
            setActiveDots(voicing);
            setSelectedVariationIndex(index);
          }}
        />
      )}

      {/* ── Actions ── */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => setActiveDots([])} style={{ ...btn.secondary(), flex: 1 }}>
          Clear
        </button>
        <button onClick={handleAdd} disabled={chords.length === 0} style={{ ...btn.primary(chords.length === 0), flex: 2 }}>
          + Add to Progression
        </button>
      </div>

      {/* ── Progression section ── */}
      {progression.length > 0 && (
        <div style={card()}>
          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <p style={{ ...LABEL_STYLE, margin: 0 }}>
                Your Progression · {progression.length} chord{progression.length > 1 ? 's' : ''}
              </p>
              {detectedKey && (
                <span style={{
                  padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700,
                  background: T.secondaryBg, color: T.secondary, border: `1px solid ${T.secondary}44`,
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
                  padding: '4px 8px', borderRadius: 16, border: `1px solid ${T.border}`,
                  background: T.bgInput, color: canUndo ? T.textMuted : T.textDim,
                  fontSize: 11, cursor: canUndo ? 'pointer' : 'not-allowed', fontWeight: 600,
                }}
              >↩</button>
              <button
                onClick={onRedo}
                disabled={!canRedo}
                title="Redo (Ctrl+Shift+Z)"
                style={{
                  padding: '4px 8px', borderRadius: 16, border: `1px solid ${T.border}`,
                  background: T.bgInput, color: canRedo ? T.textMuted : T.textDim,
                  fontSize: 11, cursor: canRedo ? 'pointer' : 'not-allowed', fontWeight: 600,
                }}
              >↪</button>
              <button
                onClick={handleClear}
                style={{
                  padding: '4px 10px', borderRadius: 16, border: `1px solid ${T.border}`,
                  background: T.bgInput, color: T.textMuted, fontSize: 11, cursor: 'pointer', fontWeight: 600,
                  transition: 'filter 0.15s',
                }}
              >
                Clear
              </button>
              <button
                onClick={handleCopy}
                style={{
                  padding: '4px 10px', borderRadius: 16, border: `1px solid ${T.border}`,
                  background: copied ? T.secondaryBg : T.bgInput,
                  color: copied ? T.secondary : T.textMuted, fontSize: 11,
                  cursor: 'pointer', fontWeight: 600, transition: 'filter 0.15s',
                }}
              >
                {copied ? '✓ Copied' : '📋 Copy'}
              </button>
              <button
                onClick={handleExportPDF}
                disabled={exporting}
                style={{
                  padding: '4px 10px', borderRadius: 16, border: `1px solid ${T.border}`,
                  background: T.bgInput, color: T.textMuted, fontSize: 11,
                  cursor: exporting ? 'not-allowed' : 'pointer', fontWeight: 600,
                  transition: 'filter 0.15s',
                }}
              >
                {exporting ? '…' : '📄 PDF'}
              </button>
            </div>
          </div>

          {/* Save & Share row */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button
              onClick={handleShare}
              style={{
                flex: 1, padding: '7px 0', borderRadius: 10, border: `1px solid ${T.border}`,
                background: shared ? T.secondaryBg : T.bgInput,
                color: shared ? T.secondary : T.textMuted, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {shared ? '✓ Copied!' : '🔗 Share Link'}
            </button>
            <button
              onClick={() => setShowSaveForm(v => !v)}
              style={{
                flex: 1, padding: '7px 0', borderRadius: 10, border: `1px solid ${T.border}`,
                background: showSaveForm ? T.primaryBg : T.bgInput,
                color: showSaveForm ? T.primary : T.textMuted, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              💾 Save Song
            </button>
          </div>

          {/* Inline save form */}
          {showSaveForm && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <input
                value={songName}
                onChange={e => setSongName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleConfirmSave()}
                placeholder="Song name…"
                autoFocus
                style={{
                  flex: 1, padding: '7px 10px', borderRadius: 8,
                  border: `1px solid ${T.border}`, background: T.bgInput,
                  color: T.text, fontSize: 13, fontFamily: 'inherit',
                }}
              />
              <button
                onClick={handleConfirmSave}
                style={{
                  padding: '7px 16px', borderRadius: 8, border: 'none',
                  background: T.primary, color: T.white, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                }}
              >Save</button>
            </div>
          )}

          {/* Progression name input */}
          <input
            value={progressionName}
            onChange={e => setProgressionName(e.target.value)}
            placeholder="Progression name (optional)…"
            style={{
              width: '100%', marginBottom: 12, padding: '7px 10px', borderRadius: 8,
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
                width: 34, height: 34, borderRadius: 8, border: `1px solid ${T.border}`,
                background: T.bgInput, color: T.text, fontSize: 16, fontWeight: 700,
                cursor: 'pointer', lineHeight: 1,
              }}
            >−</button>
            <span style={{ fontSize: 11, color: T.textMuted }}>semitone</span>
            <button
              onClick={() => onTransposeProgression(1)}
              style={{
                width: 34, height: 34, borderRadius: 8, border: `1px solid ${T.border}`,
                background: T.bgInput, color: T.text, fontSize: 16, fontWeight: 700,
                cursor: 'pointer', lineHeight: 1,
              }}
            >+</button>
          </div>

          {/* Chord cards */}
          <div className="gc-chip-strip" style={{ paddingTop: 10 }}>
            {progression.map((item, i) => {
              const accent = CHORD_ACCENTS[i % CHORD_ACCENTS.length];
              return (
                <div key={item.id} style={{
                  position: 'relative', minWidth: 72, flexShrink: 0,
                  padding: '10px 14px', borderRadius: 12,
                  background: T.bgInput, border: `1px solid ${T.border}`,
                  borderLeftWidth: 3, borderLeftColor: accent,
                  textAlign: 'center',
                }}>
                  <span style={{ display: 'block', fontSize: 10, color: accent, marginBottom: 2, fontWeight: 600 }}>{i + 1}</span>
                  <span style={{ display: 'block', fontSize: 20, fontWeight: 800, color: T.text }}>{formatChordName(item.chord.name)}</span>
                  {/* Reorder buttons */}
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginTop: 6 }}>
                    <button
                      onClick={() => onReorderProgression(item.id, -1)}
                      disabled={i === 0}
                      style={{
                        width: 24, height: 22, borderRadius: 5, border: `1px solid ${T.border}`,
                        background: T.bgCard, color: i === 0 ? T.textDim : T.textMuted,
                        fontSize: 12, cursor: i === 0 ? 'default' : 'pointer', padding: 0, lineHeight: 1,
                      }}
                    >←</button>
                    <button
                      onClick={() => onReorderProgression(item.id, 1)}
                      disabled={i === progression.length - 1}
                      style={{
                        width: 24, height: 22, borderRadius: 5, border: `1px solid ${T.border}`,
                        background: T.bgCard, color: i === progression.length - 1 ? T.textDim : T.textMuted,
                        fontSize: 12, cursor: i === progression.length - 1 ? 'default' : 'pointer', padding: 0, lineHeight: 1,
                      }}
                    >→</button>
                  </div>
                  {item.fretPositions.length > 0 && (
                    <button
                      onClick={() => playChord(item.fretPositions, tuning.openFreqs, capo)}
                      style={{
                        display: 'block', width: '100%', marginTop: 6, padding: '7px 0',
                        borderRadius: 8, border: 'none', background: T.primaryBg,
                        color: T.primary, fontSize: 16, fontWeight: 700, cursor: 'pointer',
                        minHeight: 36,
                      }}
                    >▶</button>
                  )}
                  <button
                    onClick={() => onRemoveFromProgression(item.id)}
                    style={{
                      position: 'absolute', top: -7, right: -7, width: 20, height: 20,
                      borderRadius: '50%', background: T.border, border: 'none',
                      color: T.textMuted, fontSize: 13, cursor: 'pointer', lineHeight: '20px', padding: 0,
                    }}
                  >×</button>
                </div>
              );
            })}
          </div>

          {/* Play All button */}
          {progression.filter(c => c.fretPositions.length > 0).length >= 2 && (
            <button
              onClick={handlePlayAll}
              style={{
                width: '100%', marginTop: 12, padding: '10px 0', borderRadius: 10,
                border: `1px solid ${playingAll ? T.coral : T.secondary}`,
                background: playingAll ? T.coral + '22' : T.secondaryBg,
                color: playingAll ? T.coral : T.secondary,
                fontWeight: 700, fontSize: 14, cursor: 'pointer', transition: 'all 0.15s',
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
                      padding: '5px 13px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12,
                      fontWeight: genre === g.id ? 700 : 400,
                      background: genre === g.id ? T.primary : T.bgInput,
                      color: genre === g.id ? T.text : T.textMuted,
                      transition: 'filter 0.15s',
                    }}>
                    {g.label}
                  </button>
                ))}
              </div>

              {/* Custom Roman numeral input */}
              {genre === 'custom' && (
                <div style={{ marginBottom: 10 }}>
                  <input
                    value={customNumerals}
                    onChange={e => setCustomNumerals(e.target.value)}
                    placeholder="e.g. I IV V vi IIm V7…"
                    style={{
                      width: '100%', padding: '7px 10px', borderRadius: 8,
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
                  width: '100%', padding: '11px 0', borderRadius: 10, border: `1px solid ${T.secondary}`,
                  cursor: 'pointer', fontSize: 14, fontWeight: 700,
                  background: showSuggestions ? T.secondaryBg : T.bgInput,
                  color: T.secondary, transition: 'filter 0.15s',
                }}>
                {showSuggestions ? 'Hide Suggestions' : '✨ Suggest Next Chord'}
              </button>
            </div>
          )}
        </div>
      )}

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
                    padding: 12, borderRadius: 10,
                    background: T.bgInput, border: `1px solid ${T.border}`,
                    cursor: 'pointer', color: T.text, textAlign: 'left',
                    transition: 'filter 0.15s',
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
        <div
          style={{
            position: 'fixed',
            top: Math.max(8, hoverPreview.top - 168),
            left: Math.min(hoverPreview.left, (typeof window !== 'undefined' ? window.innerWidth : 700) - 220),
            zIndex: 1000,
            width: 210,
            background: T.bgCard,
            border: `1px solid ${T.border}`,
            borderRadius: 12,
            padding: '10px 10px 6px',
            boxShadow: '0 8px 28px rgba(0,0,0,0.55)',
            pointerEvents: 'none',
          }}
        >
          <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 800, color: T.text, textAlign: 'center' }}>
            {formatChordName(hoverPreview.suggestion.chord.name)}
          </p>
          <MiniFretboard voicing={previewVoicings[0]} tuning={tuning.notes} />
        </div>
      )}
    </div>
  );
}
