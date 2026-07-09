import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Note } from '@tonaljs/tonal';
import { T, btn } from '../../theme';
import type { FretPosition, Tuning } from '../../types/music';
import { MiniFretboard } from '../Fretboard/MiniFretboard';
import { buildChromaColorMap } from '../ChordBuilder/ChordStructure';
import { fretToNote } from '../../utils/musicTheory';
import { playChord, unlockAudio } from '../../utils/audioPlayback';

interface Props {
  voicings: FretPosition[][];
  index: number;
  chordName: string;
  tuning: Tuning;
  onNav: (index: number) => void;
  onAdd: (voicing: FretPosition[]) => void;
  onClose: () => void;
}

function Arrow({ dir, onClick, disabled }: { dir: 'left' | 'right'; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === 'left' ? 'Previous voicing' : 'Next voicing'}
      style={{
        width: 34, height: 44, flexShrink: 0, borderRadius: 0,
        border: `1px solid ${T.border}`, background: T.bgInput,
        color: disabled ? T.textDim : T.text, fontSize: 18, lineHeight: 1,
        cursor: disabled ? 'default' : 'pointer', borderLeft: '3px solid var(--gc-bar-color)',
      }}
    >{dir === 'left' ? '‹' : '›'}</button>
  );
}

/**
 * Enlarged view of one voicing variation. Page between variations with the
 * arrows (or ←/→ keys), audition with Play, and add straight to the
 * progression — all from the same popover.
 */
export function VoicingViewer({ voicings, index, chordName, tuning, onNav, onAdd, onClose }: Props) {
  const total   = voicings.length;
  const voicing = voicings[index] ?? [];
  const chroma  = buildChromaColorMap(chordName);
  const dotColors = voicing.map(p => {
    const c = Note.chroma(fretToNote(p.string, p.fret, tuning.notes));
    return c != null ? (chroma.get(c) ?? T.primary) : T.primary;
  });

  const go = (d: number) => { if (total > 1) onNav((index + d + total) % total); };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft')  { e.preventDefault(); go(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, total]);

  const play = () => { unlockAudio(); playChord(voicing, tuning.openFreqs); };

  // Portal to <body>: the pager track uses a CSS transform, which would
  // otherwise capture position:fixed and push this off-screen.
  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,0.62)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        animation: 'gcVvFade 0.16s ease',
      }}
    >
      <style>{`@keyframes gcVvFade{from{opacity:0}to{opacity:1}}
        @keyframes gcVvPop{0%{opacity:0;transform:translateY(10px) scale(0.96)}100%{opacity:1;transform:none}}`}</style>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 460, background: T.bgCard,
          border: `1px solid ${T.border}`, borderLeft: '4px solid var(--gc-bar-color)',
          padding: 18, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 14,
          animation: 'gcVvPop 0.2s cubic-bezier(0.34, 1.4, 0.5, 1)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: T.text, lineHeight: 1.1 }}>{chordName}</div>
            <div style={{ fontSize: 11, color: T.textDim, marginTop: 3 }}>Voicing {index + 1} / {total}</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{
            width: 28, height: 28, flexShrink: 0, borderRadius: 0, border: `1px solid ${T.border}`,
            background: T.bgInput, color: T.textMuted, fontSize: 15, cursor: 'pointer',
          }}>✕</button>
        </div>

        {/* Enlarged fretboard — full width for maximum size */}
        <div style={{ background: T.bgInput, border: `1px solid ${T.border}`, padding: '18px 16px 12px' }}>
          <MiniFretboard voicing={voicing} dotColors={dotColors} tuning={tuning.notes} />
        </div>

        {/* Controls: page arrows flank Play + Add */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
          <Arrow dir="left" onClick={() => go(-1)} disabled={total < 2} />
          <button
            onClick={play}
            style={{
              flex: '0 0 auto', minWidth: 92, padding: '12px 0', borderRadius: 0, cursor: 'pointer',
              border: `1px solid ${T.border}`, background: T.bgInput, color: T.text,
              fontSize: 14, fontWeight: 400, borderLeft: '3px solid var(--gc-bar-color)',
            }}
          >▶ Play</button>
          <button onClick={() => onAdd(voicing)} style={{ ...btn.primary(false), flex: 1 }}>
            + Add to Progression
          </button>
          <Arrow dir="right" onClick={() => go(1)} disabled={total < 2} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
