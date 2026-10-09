import { useEffect, useRef, useState } from 'react';
import { T } from '../../theme';
import { useLang } from '../../contexts/LanguageContext';
import { useSong } from '../../song/SongContext';
import { beatsPerBar, type Meter } from '../../song/song';
import { ALL_KEYS, keyName } from '../../utils/harmonicAnalysis';
import { formatChordName } from '../../utils/chordIdentifier';
import { playChord, unlockAudio, shapeKey } from '../../utils/audioPlayback';
import { useSounding } from '../../motion/useSounding';

// ── Song dock ────────────────────────────────────────────────────────────────
// The strip above every tool that says what the app is working on: the song's
// title, the section, its key, tempo and metre, and its chords. Everything
// here is shared — set the key once and Scales, the Wheel, Extensions and the
// Harmonizer all open on it; set the tempo and the metronome and playback
// follow. ▶ plays the section in time; ⟳ loops it. Chords added anywhere fly
// in here ([data-gc-dock]).

const METERS: Meter[] = ['4/4', '3/4', '6/8'];

export function SongDock({ compact, onOpenMap }: { compact?: boolean; onOpenMap?: () => void }) {
  const { lang, rtl } = useLang();
  const he = lang === 'he';
  const song = useSong();
  const { progression, tuning } = song;
  const { bpm, meter, capo, title } = song.song;
  const sounding = useSounding();

  // ── Playback: one bar per chord at the song's tempo ──────────────────────
  const [playing, setPlaying] = useState<'once' | 'loop' | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const stop = () => { timers.current.forEach(clearTimeout); timers.current = []; setPlaying(null); };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const run = (loop: boolean) => {
    const bar = (60 / bpm) * beatsPerBar(meter) * (meter === '6/8' ? 500 : 1000);
    const pass = () => {
      progression.forEach((item, i) => {
        timers.current.push(setTimeout(() => playChord(item.fretPositions, tuning.openFreqs, capo), i * bar));
      });
      timers.current.push(setTimeout(() => (loop ? pass() : setPlaying(null)), progression.length * bar));
    };
    pass();
  };
  const toggle = (mode: 'once' | 'loop') => {
    const was = playing;
    stop();
    if (was === mode || !progression.length) return;
    unlockAudio().then(() => { setPlaying(mode); run(mode === 'loop'); });
  };

  const keyValue = song.keyIsAuto || !song.key ? 'auto' : `${song.key.tonicPc}:${song.key.mode}`;
  const keyLabel = song.key ? keyName(song.key, lang) : '—';

  const ghost: React.CSSProperties = {
    height: 28, minWidth: 28, padding: '0 8px', border: `1px solid ${T.border}`, background: 'transparent',
    color: T.text, cursor: 'pointer', fontSize: 11, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  };
  const lbl: React.CSSProperties = { fontSize: 9, color: T.textDim, fontFamily: 'var(--gc-mono)', letterSpacing: '0.14em', textTransform: 'uppercase' };
  const sel: React.CSSProperties = {
    appearance: 'none', WebkitAppearance: 'none', height: 28, padding: '0 8px', border: `1px solid ${T.border}`,
    background: T.bgInput, color: T.text, fontFamily: 'inherit', fontSize: 11, fontWeight: 600, borderRadius: 0, cursor: 'pointer',
  };

  return (
    <div data-gc-dock dir={rtl ? 'rtl' : 'ltr'} style={{
      borderBottom: `1px solid ${T.border}`, padding: compact ? '8px 0 9px' : '8px 0 10px', marginBottom: 14,
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      {/* Row 1 — the song itself */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: compact ? 'wrap' : 'nowrap', minWidth: 0 }}>
        <button onClick={() => toggle('once')} data-active={playing === 'once'} aria-label={playing === 'once' ? 'Stop' : 'Play section'}
          title={he ? 'נגן את הקטע' : 'Play the section'}
          style={{ ...ghost, background: playing === 'once' ? T.primary : 'transparent', color: playing === 'once' ? T.white : T.text }}>
          {playing === 'once' ? '■' : '▶'}
        </button>
        <button onClick={() => toggle('loop')} data-active={playing === 'loop'} aria-label="Loop section"
          title={he ? 'לופ' : 'Loop'}
          style={{ ...ghost, background: playing === 'loop' ? T.primary : 'transparent', color: playing === 'loop' ? T.white : T.text }}>⟳</button>

        <input
          value={title}
          onChange={e => song.update({ title: e.target.value })}
          placeholder={he ? 'שיר ללא שם' : 'Untitled song'}
          aria-label={he ? 'שם השיר' : 'Song title'}
          dir="auto"
          style={{
            flex: compact ? '1 1 120px' : '0 1 220px', minWidth: 0, height: 28, padding: '0 8px', border: '1px solid transparent',
            background: 'transparent', color: T.text, fontFamily: 'inherit', fontSize: 13, fontWeight: 700, outline: 'none',
            borderBottom: `1px dashed ${T.border}`,
          }}
        />

        {onOpenMap && !compact && (
          <button onClick={onOpenMap} style={{ ...ghost, border: 'none', color: T.textDim, padding: '0 4px' }} title={he ? 'מפת השיר' : 'Song map'}>
            {he ? 'מפה' : 'Map'} ↗
          </button>
        )}

        <div style={{ flex: compact ? '1 1 100%' : 1, display: 'flex', alignItems: 'center', gap: 8, justifyContent: compact ? 'flex-start' : 'flex-end', flexWrap: 'wrap' }}>
          <span style={lbl}>{he ? 'סולם' : 'Key'}</span>
          <select dir="ltr" value={keyValue} aria-label="Key" style={sel}
            onChange={e => {
              const v = e.target.value;
              if (v === 'auto') { song.update({ keyOverride: null }); return; }
              const [pc, mode] = v.split(':');
              song.update({ keyOverride: { tonicPc: Number(pc), mode: mode as 'major' | 'minor' } });
            }}>
            <option value="auto">{he ? 'אוטומטי' : 'Auto'}{song.keyIsAuto && song.key ? ` · ${keyLabel}` : ''}</option>
            {ALL_KEYS.map(k => <option key={`${k.tonicPc}:${k.mode}`} value={`${k.tonicPc}:${k.mode}`}>{keyName(k, lang)}</option>)}
          </select>

          <span style={lbl}>BPM</span>
          <div dir="ltr" style={{ display: 'inline-flex', alignItems: 'center' }}>
            <button onClick={() => song.update({ bpm: Math.max(40, bpm - 2) })} aria-label="Slower" style={{ ...ghost, minWidth: 24, padding: 0 }}>−</button>
            <span style={{ minWidth: 34, textAlign: 'center', fontSize: 12, fontWeight: 700, fontFamily: 'var(--gc-mono)' }}>{bpm}</span>
            <button onClick={() => song.update({ bpm: Math.min(240, bpm + 2) })} aria-label="Faster" style={{ ...ghost, minWidth: 24, padding: 0 }}>+</button>
          </div>
          <select dir="ltr" value={meter} aria-label="Meter" style={sel} onChange={e => song.update({ meter: e.target.value as Meter })}>
            {METERS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>

      {/* Row 2 — the section's chords */}
      <div dir="ltr" style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, overflowX: 'auto', scrollbarWidth: 'none' }}>
        <span style={{ ...lbl, flexShrink: 0, marginRight: 4 }}>{song.section.name}</span>
        {progression.length === 0 ? (
          <span style={{ fontSize: 11.5, color: T.textMuted }}>
            {he ? 'עדיין אין אקורדים — הוסיפו מכל כלי' : 'No chords yet — add them from any tool'}
          </span>
        ) : progression.map(item => {
          const now = sounding.shape(shapeKey(item.fretPositions));
          const picked = song.selectedChord?.id === item.id;
          return (
            // Tapping a chord plays it and makes it the chord that one-chord
            // tools (Triads, Intervals in a Chord) open on.
            <button key={item.id} data-gc-dock-item className="gc-notation"
              onClick={() => { playChord(item.fretPositions, tuning.openFreqs, capo); song.selectChord(picked ? null : item.id); }}
              title={he ? 'נגן ובחר' : 'Play and select'}
              aria-pressed={picked}
              style={{
                flexShrink: 0, height: 26, padding: '0 9px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                borderTop: `1px solid ${now ? T.primary : T.border}`, borderRight: `1px solid ${now ? T.primary : T.border}`,
                borderBottom: `1px solid ${now ? T.primary : T.border}`, borderLeft: '3px solid var(--gc-bar-color)',
                background: now ? T.primary : T.bgInput, color: now ? T.white : T.text,
                boxShadow: picked ? `inset 0 -3px 0 0 ${T.text}` : undefined,
              }}>
              {formatChordName(item.chord.name)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
