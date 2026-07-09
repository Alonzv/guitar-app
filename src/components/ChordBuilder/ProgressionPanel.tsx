import { useState, useRef, useMemo } from 'react';
import type { ChordInProgression, Tuning } from '../../types/music';
import { formatChordName } from '../../utils/chordIdentifier';
import { detectKey } from '../../utils/progressionHelper';
import { playChord } from '../../utils/audioPlayback';
import { IconLink } from '../Icons';
import { SaveToLibraryButton } from '../Workspace/SaveToLibraryButton';
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

const CHORD_ACCENTS = ['#110CF0', '#1A1818', '#4A453E', '#6B655C', '#8A8378', '#9C958C'];

const LABEL_STYLE = {
  margin: 0,
  fontSize: 11,
  fontWeight: 400,
  color: T.textMuted,
  textTransform: 'uppercase' as const,
  letterSpacing: '-0.02em',
};

// Shared compact toolbar-button style — one row, single-word labels.
const toolBtn = (opts?: {
  active?: boolean; disabled?: boolean; danger?: boolean;
}): React.CSSProperties => {
  const { active, disabled, danger } = opts ?? {};
  return {
    padding: '5px 10px', borderRadius: 0,
    border: `1px solid ${danger ? T.coral : T.border}`,
    background: active ? (danger ? T.coralFaint : T.secondaryBg) : (danger ? T.coralFaint : T.bgInput),
    color: disabled ? T.textDim : danger ? T.coral : active ? T.secondary : T.textMuted,
    fontSize: 11, fontWeight: 400, fontFamily: 'inherit',
    textTransform: 'uppercase', letterSpacing: '-0.02em',
    cursor: disabled ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
    display: 'inline-flex', alignItems: 'center', gap: 4,
    borderLeft: '3px solid var(--gc-bar-color)',
    transition: 'background 0.15s, color 0.15s',
  };
};

export function ProgressionPanel({
  progression, onRemoveFromProgression, onClearProgression,
  onReorderProgression,
  canUndo, canRedo, onUndo, onRedo,
  tuning, capo,
}: Props) {
  const [progressionName, setProgressionName] = useState('');
  const [exporting, setExporting] = useState(false);
  const [playingAll, setPlayingAll] = useState(false);
  const [shared, setShared] = useState(false);
  const playAllTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

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

  const detectedKey = useMemo(
    () => progression.length >= 2 ? detectKey(progression.map(c => c.chord)) : '',
    [progression]
  );
  const canPlayAll = progression.filter(c => c.fretPositions.length > 0).length >= 2;

  if (progression.length === 0) return null;

  return (
    <div style={card()}>
      {/* ── Title + detected key + compact name ── */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <p style={LABEL_STYLE}>
          Your Progression · {progression.length} chord{progression.length > 1 ? 's' : ''}
        </p>
        {detectedKey && (
          <span style={{
            padding: '2px 8px', borderRadius: 0, fontSize: 10, fontWeight: 400,
            background: T.secondaryBg, color: T.secondary, border: `1px solid ${T.secondaryFaint}`,
          }}>
            Key: {detectedKey}
          </span>
        )}
        <input
          value={progressionName}
          onChange={e => setProgressionName(e.target.value)}
          placeholder="Name…"
          aria-label="Progression name"
          style={{
            marginLeft: 'auto', width: 132, maxWidth: '100%', padding: '4px 8px', borderRadius: 0,
            border: `1px solid ${T.border}`, background: T.bgInput,
            color: T.text, fontSize: 12, fontFamily: 'inherit',
            boxSizing: 'border-box', borderLeft: '3px solid var(--gc-bar-color)',
          }}
        />
      </div>

      {/* ── Unified action toolbar (one row) ── */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
        <button onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)" style={toolBtn({ disabled: !canUndo })}>Undo</button>
        <button onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)" style={toolBtn({ disabled: !canRedo })}>Redo</button>
        <button onClick={handleExportPDF} disabled={exporting} title="Export as PDF" style={toolBtn({ disabled: exporting })}>
          {exporting ? '…' : 'PDF'}
        </button>
        <button onClick={handleShare} title="Copy a shareable link" style={toolBtn({ active: shared })}>
          {shared ? '✓ Link' : <><IconLink size={12} /> Share</>}
        </button>
        <SaveToLibraryButton
          size="sm"
          label="Save"
          style={{
            padding: '5px 10px', fontSize: 11, borderLeft: '3px solid var(--gc-bar-color)',
          }}
          getPayload={() => progression.length === 0 ? null : ({
            kind: 'progression',
            name: progressionName.trim() || `Progression ${new Date().toLocaleDateString()}`,
            chords: progression,
            detected_key: detectedKey || null,
          })}
        />
        {canPlayAll && (
          <button onClick={handlePlayAll} title="Play the whole progression" style={toolBtn({ active: playingAll })}>
            {playingAll ? 'Stop' : 'Play'}
          </button>
        )}
        <button onClick={handleClear} title="Remove every chord" style={toolBtn({ danger: true })}>Clear</button>
      </div>

      {/* ── Chord cards ── */}
      <div className="gc-chip-strip" style={{ paddingTop: 14 }}>
        {progression.map((item, i) => {
          const accent = CHORD_ACCENTS[i % CHORD_ACCENTS.length];
          return (
            <div key={item.id} style={{
              position: 'relative', minWidth: 80, flexShrink: 0,
              padding: '10px 12px 10px', borderRadius: 0,
              background: accent,
              textAlign: 'center',
            }}>
              <span style={{ display: 'block', fontSize: 10, color: 'rgba(255,255,255,0.55)', marginBottom: 3, fontWeight: 400, letterSpacing: '0.08em' }}>{i + 1}</span>
              <span style={{ display: 'block', fontSize: 20, fontWeight: 800, color: '#fff', lineHeight: 1.1 }}>{formatChordName(item.chord.name)}</span>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginTop: 8 }}>
                <button
                  onClick={() => onReorderProgression(item.id, -1)}
                  disabled={i === 0}
                  style={{
                    width: 24, height: 22, borderRadius: 0, border: 'none',
                    background: 'rgba(0,0,0,0.25)', color: i === 0 ? 'rgba(255,255,255,0.25)' : '#fff',
                    fontSize: 12, cursor: i === 0 ? 'default' : 'pointer', padding: 0, lineHeight: 1,
                  }}
                >←</button>
                <button
                  onClick={() => onReorderProgression(item.id, 1)}
                  disabled={i === progression.length - 1}
                  style={{
                    width: 24, height: 22, borderRadius: 0, border: 'none',
                    background: 'rgba(0,0,0,0.25)', color: i === progression.length - 1 ? 'rgba(255,255,255,0.25)' : '#fff',
                    fontSize: 12, cursor: i === progression.length - 1 ? 'default' : 'pointer', padding: 0, lineHeight: 1,
                  }}
                >→</button>
              </div>
              {item.fretPositions.length > 0 && (
                <button
                  onClick={() => playChord(item.fretPositions, tuning.openFreqs, capo)}
                  style={{
                    display: 'block', width: '100%', marginTop: 6, padding: '7px 0',
                    borderRadius: 0, background: 'rgba(0,0,0,0.22)', border: 'none',
                    color: '#fff', fontSize: 16, fontWeight: 400, cursor: 'pointer',
                    minHeight: 36,
                  }}
                >PLAY</button>
              )}
              <button
                onClick={() => onRemoveFromProgression(item.id)}
                style={{
                  position: 'absolute', top: -7, right: -7, width: 20, height: 20,
                  borderRadius: 0, background: 'rgba(0,0,0,0.55)', border: 'none',
                  color: '#fff', fontSize: 13, cursor: 'pointer', lineHeight: '20px', padding: 0,
                }}
              >×</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
