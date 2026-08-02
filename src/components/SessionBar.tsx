import { useRef } from 'react';
import type { ChordInProgression, Tuning } from '../types/music';
import { formatChordName } from '../utils/chordIdentifier';
import { playChord, unlockAudio } from '../utils/audioPlayback';
import { T } from '../theme';

// ── Session bar ──────────────────────────────────────────────────────────────
// A single quiet line of chrome naming what the whole app is currently working
// on. Deliberately not a panel: no card, no fill, no controls beyond playing
// what you see — just the shared progression, so moving between tools never
// leaves you wondering which one you are looking at. Hidden entirely when there
// is nothing to show, so it never costs space it hasn't earned.

interface Props {
  progression: ChordInProgression[];
  tuning: Tuning;
  capo?: number;
  /** Shown after the chords when the key is known (e.g. "C major"). */
  keyLabel?: string;
}

export function SessionBar({ progression, tuning, capo = 0, keyLabel }: Props) {
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  if (progression.length === 0) return null;

  const play = () => {
    unlockAudio().then(() => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
      progression.forEach((item, i) => {
        timers.current.push(setTimeout(
          () => playChord(item.fretPositions, tuning.openFreqs, capo),
          i * 1100,
        ));
      });
    });
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '7px 0 8px', marginBottom: 14,
      borderBottom: `1px solid ${T.border}`,
    }}>
      <button
        onClick={play}
        title="Play"
        style={{
          flexShrink: 0, width: 22, height: 22, padding: 0, borderRadius: 0,
          border: 'none', background: 'transparent', color: T.textMuted,
          fontSize: 11, lineHeight: 1, cursor: 'pointer',
        }}
      >▶</button>

      {/* Chord names read left-to-right even in an RTL page — notation is LTR. */}
      <div dir="ltr" style={{
        display: 'flex', alignItems: 'baseline', gap: 10, flex: 1, minWidth: 0,
        overflow: 'hidden', whiteSpace: 'nowrap',
      }}>
        {progression.map(item => (
          <span key={item.id} style={{
            fontSize: 12.5, fontWeight: 600, color: T.text, flexShrink: 0,
          }}>{formatChordName(item.chord.name)}</span>
        ))}
      </div>

      {keyLabel && (
        <span dir="ltr" style={{
          flexShrink: 0, fontSize: 9.5, color: '#9C958C', fontFamily: 'var(--gc-mono)',
          letterSpacing: '0.12em', textTransform: 'uppercase',
        }}>{keyLabel}</span>
      )}
    </div>
  );
}
