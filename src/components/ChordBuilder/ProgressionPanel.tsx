import { useState, useRef, useMemo } from 'react';
import type { ChordInProgression, Tuning } from '../../types/music';
import { formatChordName } from '../../utils/chordIdentifier';
import { detectKey } from '../../utils/progressionHelper';
import { playChord, shapeKey } from '../../utils/audioPlayback';
import { useSounding } from '../../motion/useSounding';
import { SaveToLibraryButton } from '../Workspace/SaveToLibraryButton';
import { T } from '../../theme';
import { useLang } from '../../contexts/LanguageContext';
import { Rule } from '../Transit/parts';
import { pillStyle } from '../Transit/styles';

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

// Toolbar buttons are outlined pills; Save (a shared component) is forced to match.
const toolBtn = (opts?: { active?: boolean; disabled?: boolean }): React.CSSProperties => ({
  ...pillStyle(!!opts?.active, 'sm'), opacity: opts?.disabled ? 0.35 : 1,
  cursor: opts?.disabled ? 'not-allowed' : 'pointer',
});
const SAVE_BTN_STYLE: React.CSSProperties = { ...pillStyle(false, 'sm') };

// A small round control inside a chord tile (reorder, remove).
const tileBtn = (on: boolean, disabled?: boolean): React.CSSProperties => ({
  width: 36, height: 36, borderRadius: '50%', border: `1.5px solid ${on ? T.onPrimary : T.text}`, padding: 0,
  background: 'transparent', color: on ? T.onPrimary : T.text, fontSize: 14, lineHeight: 1,
  cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.3 : 1,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
});

export function ProgressionPanel({
  progression, onRemoveFromProgression, onClearProgression,
  onReorderProgression,
  canUndo, canRedo, onUndo, onRedo,
  tuning, capo,
}: Props) {
  // A tile lifts while its chord is the one sounding (Play, or played anywhere).
  const sounding = useSounding();
  const { lang } = useLang();
  const he = lang === 'he';
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

  const label = he
    ? `המהלך · ${progression.length} אקורדים`
    : `Your progression · ${progression.length} chord${progression.length > 1 ? 's' : ''}`;

  return (
    <Rule label={label} right={detectedKey ? (
      <span className="su-label" style={{ color: T.text }}>{he ? 'סולם' : 'Key'} · {detectedKey}</span>
    ) : undefined}>
      {/* ── Name ── */}
      <input
        value={progressionName}
        onChange={e => setProgressionName(e.target.value)}
        placeholder={he ? 'שם…' : 'Name…'}
        aria-label={he ? 'שם המהלך' : 'Progression name'}
        dir="auto"
        style={{
          width: '100%', maxWidth: 320, minHeight: 44, padding: '0 14px', borderRadius: 0,
          border: `2px solid ${T.text}`, background: T.bgCard, outline: 'none',
          color: T.text, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 10,
        }}
      />

      {/* ── Actions ── */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        <button onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)" className="gc-no-bar" style={toolBtn({ disabled: !canUndo })}>{he ? 'בטל' : 'Undo'}</button>
        <button onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)" className="gc-no-bar" style={toolBtn({ disabled: !canRedo })}>{he ? 'שחזר' : 'Redo'}</button>
        <button onClick={handleExportPDF} disabled={exporting} title="Export as PDF" className="gc-no-bar" style={toolBtn({ disabled: exporting })}>
          {exporting ? '…' : 'PDF'}
        </button>
        <button onClick={handleShare} title="Copy a shareable link" className="gc-no-bar" aria-pressed={shared} style={toolBtn({ active: shared })}>
          {shared ? (he ? '✓ הועתק' : '✓ Link') : (he ? 'שיתוף' : 'Share')}
        </button>
        <SaveToLibraryButton
          size="sm"
          label={he ? 'שמירה' : 'Save'}
          style={SAVE_BTN_STYLE}
          getPayload={() => progression.length === 0 ? null : ({
            kind: 'progression',
            name: progressionName.trim() || `Progression ${new Date().toLocaleDateString()}`,
            chords: progression,
            detected_key: detectedKey || null,
          })}
        />
        {canPlayAll && (
          <button onClick={handlePlayAll} title="Play the whole progression" className="gc-no-bar" aria-pressed={playingAll} style={toolBtn({ active: playingAll })}>
            {playingAll ? (he ? 'עצור' : 'Stop') : (he ? 'נגן' : 'Play')}
          </button>
        )}
        <button onClick={handleClear} title="Remove every chord" className="gc-no-bar" style={toolBtn()}>{he ? 'ניקוי' : 'Clear'}</button>
      </div>

      {/* ── Chord tiles — square; the one sounding is cobalt. Wrap, never clip. ── */}
      <div dir="ltr" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {progression.map((item, i) => {
          const now = sounding.shape(shapeKey(item.fretPositions));
          const fg = now ? T.onPrimary : T.text;
          const first = i === 0, last = i === progression.length - 1;
          return (
            <div key={item.id} style={{
              width: 128, flexShrink: 0, padding: '8px 8px 8px', borderRadius: 0,
              background: now ? T.primary : T.bgInput, color: fg,
              display: 'flex', flexDirection: 'column', gap: 6,
              transition: 'background-color var(--gc-dur-base) var(--gc-ease-out)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 10, letterSpacing: '0.14em', fontFamily: 'var(--gc-mono)', color: now ? fg : T.textMuted, paddingInlineStart: 2 }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <button onClick={() => onRemoveFromProgression(item.id)} className="gc-no-bar"
                  aria-label={he ? `הסר ${formatChordName(item.chord.name)}` : `Remove ${formatChordName(item.chord.name)}`}
                  style={tileBtn(now)}>×</button>
              </div>
              {/* The name plays the chord (when it has a shape). */}
              <button
                onClick={item.fretPositions.length > 0 ? () => playChord(item.fretPositions, tuning.openFreqs, capo) : undefined}
                disabled={item.fretPositions.length === 0}
                className="gc-no-bar gc-notation"
                aria-label={he ? `נגן ${formatChordName(item.chord.name)}` : `Play ${formatChordName(item.chord.name)}`}
                style={{
                  minHeight: 44, padding: '0 2px', background: 'transparent', border: 'none', color: fg,
                  cursor: item.fretPositions.length ? 'pointer' : 'default', textAlign: 'start',
                  fontFamily: 'var(--su-display)', fontStretch: 'var(--su-display-semi)', fontWeight: 800,
                  fontSize: 26, lineHeight: 1, letterSpacing: 'normal', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                {formatChordName(item.chord.name)}
              </button>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => onReorderProgression(item.id, -1)} disabled={first} className="gc-no-bar"
                  aria-label={he ? 'הזז שמאלה' : 'Move left'} style={tileBtn(now, first)}>‹</button>
                <button onClick={() => onReorderProgression(item.id, 1)} disabled={last} className="gc-no-bar"
                  aria-label={he ? 'הזז ימינה' : 'Move right'} style={tileBtn(now, last)}>›</button>
              </div>
            </div>
          );
        })}
      </div>
    </Rule>
  );
}
