import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Note } from '@tonaljs/tonal';
import { T, btn } from '../../theme';
import { useLang } from '../../contexts/LanguageContext';
import { Pill, Cta, PosterTitle } from '../Transit/parts';
import { splitName, degreeLabels, shapeMeta } from '../ChordBuilder/chordFormula';
import type { FretPosition, Tuning } from '../../types/music';
import { MiniFretboard } from '../Fretboard/MiniFretboard';
import { buildChromaColorMap } from '../ChordBuilder/chordColors';
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
    return c != null ? (chroma.get(c) ?? T.secondary) : T.secondary;
  });
  const { lang } = useLang();
  const he = lang === 'he';
  const [root, suffix] = splitName(chordName);

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

  // Portal to <body> so no transformed ancestor captures position:fixed.
  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9000, background: 'color-mix(in srgb, var(--gc-text) 55%, transparent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        animation: 'gcVvFade 0.16s ease',
      }}
    >
      <style>{`@keyframes gcVvFade{from{opacity:0}to{opacity:1}}
        @keyframes gcVvPop{0%{opacity:0;transform:translateY(10px)}100%{opacity:1;transform:none}}`}</style>
      <div
        role="dialog" aria-modal="true" aria-label={chordName}
        dir={he ? 'rtl' : 'ltr'}
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480, background: T.bgDeep, color: T.text,
          border: `var(--su-rule) solid ${T.border}`, padding: 20, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 16,
          maxHeight: '90vh', overflowY: 'auto',
          animation: 'gcVvPop var(--gc-dur-base) var(--gc-ease-out)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <PosterTitle head={root} tail={suffix || undefined} max={88} min={36} />
            <div className="su-label" style={{ marginTop: 10 }}>
              {he ? 'צורה' : 'Voicing'} {index + 1} / {total} · {shapeMeta(voicing, tuning.notes).shape}
            </div>
          </div>
          <Pill onClick={onClose} label={he ? 'סגירה' : 'Close'} style={{ padding: 0, width: 44 }}>✕</Pill>
        </div>

        {/* Enlarged fretboard — full width for maximum size */}
        <div style={{ borderTop: `var(--su-rule) solid ${T.border}`, paddingTop: 16 }}>
          <MiniFretboard voicing={voicing} dotColors={dotColors} tuning={tuning.notes}
            dotLabels={degreeLabels(voicing, chordName, tuning.notes)} showStringLabels showFretNumbers hideFretLabel />
        </div>

        {/* Page ‹ Play › on one row, Add underneath — nothing wraps on a phone. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div dir="ltr" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Pill onClick={() => go(-1)} disabled={total < 2} label={he ? 'הצורה הקודמת' : 'Previous voicing'} style={{ padding: 0, width: 44 }}>‹</Pill>
            <Cta onClick={play} style={{ flex: 1 }}>{he ? '▶ נגן' : '▶ Play'}</Cta>
            <Pill onClick={() => go(1)} disabled={total < 2} label={he ? 'הצורה הבאה' : 'Next voicing'} style={{ padding: 0, width: 44 }}>›</Pill>
          </div>
          <button
            onClick={() => onAdd(voicing)}
            className="gc-no-bar"
            style={{ ...btn.primary(false), width: '100%', whiteSpace: 'nowrap' }}
          >{he ? '+ הוספה למהלך' : '+ Add to progression'}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
