import { useEffect, useRef, useState } from 'react';
import { T } from '../../theme';
import { useLang } from '../../contexts/LanguageContext';
import { useSong } from '../../song/SongContext';
import { beatsPerBar, SECTION_NAMES, type Meter } from '../../song/song';
import { ALL_KEYS, keyName } from '../../utils/harmonicAnalysis';
import { formatChordName } from '../../utils/chordIdentifier';
import { playChord, unlockAudio, shapeKey } from '../../utils/audioPlayback';
import { useSounding } from '../../motion/useSounding';
import { useDockOpen, setDockOpen } from '../../song/dockState';

// ── Song dock ────────────────────────────────────────────────────────────────
// The strip above every tool that says what the app is working on: the song's
// title, the section, its key, tempo and metre, and its chords. Everything
// here is shared — set the key once and Scales, the Wheel, Extensions and the
// Harmonizer all open on it; set the tempo and the metronome and playback
// follow. ▶ plays the section in time; ⟳ loops it. Chords added anywhere fly
// in here ([data-gc-dock]). It starts folded to one slim line — song, key,
// tempo, chords — and opens to the full controls (song/dockState).

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

  const open = useDockOpen();

  // The section's chords — the flight target for added chords, so they stay on
  // the slim line even when the dock is folded.
  const chordStrip = progression.length === 0 ? (
    open ? <span style={{ fontSize: 11.5, color: T.textMuted }}>{he ? 'עדיין אין אקורדים — הוסיפו מכל כלי' : 'No chords yet — add them from any tool'}</span> : null
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
          flexShrink: 0, height: 24, padding: '0 8px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
          borderTop: `1px solid ${now ? T.primary : T.border}`, borderRight: `1px solid ${now ? T.primary : T.border}`,
          borderBottom: `1px solid ${now ? T.primary : T.border}`, borderLeft: '3px solid var(--gc-bar-color)',
          background: now ? T.primary : T.bgInput, color: now ? T.white : T.text,
          boxShadow: picked ? `inset 0 -3px 0 0 ${T.text}` : undefined,
        }}>
        {formatChordName(item.chord.name)}
      </button>
    );
  });

  const summary = [title.trim() || (he ? 'שיר' : 'Song'), song.key ? keyName(song.key, lang) : null, `${bpm}`]
    .filter(Boolean).join(' · ');

  return (
    <div data-gc-dock dir={rtl ? 'rtl' : 'ltr'} style={{
      borderBottom: `1px solid ${T.border}`, padding: '6px 0', marginBottom: open ? 14 : 10,
      display: 'flex', flexDirection: 'column',
      transition: 'margin-bottom var(--gc-dur-base) var(--gc-ease-out)',
    }}>
      {/* The slim line — always there: play, what the song is, its chords, and
          the fold. Folded, this is all the dock takes. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <button onClick={() => toggle('once')} data-active={playing === 'once'} aria-label={playing === 'once' ? 'Stop' : 'Play section'}
          title={he ? 'נגן את הקטע' : 'Play the section'}
          style={{ ...ghost, height: 26, minWidth: 26, background: playing === 'once' ? T.primary : 'transparent', color: playing === 'once' ? T.white : T.text }}>
          {playing === 'once' ? '■' : '▶'}
        </button>
        <button onClick={() => setDockOpen(!open)} aria-expanded={open} className="gc-no-bar gc-notation"
          title={open ? (he ? 'קפל את השיר' : 'Fold the song') : (he ? 'פתח את השיר' : 'Open the song')}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 1, minWidth: 0, height: 26, padding: '0 4px',
            background: 'transparent', border: 'none', cursor: 'pointer', color: T.textMuted, fontSize: 11.5, letterSpacing: '0.02em',
          }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{summary}</span>
          <span aria-hidden style={{
            display: 'inline-block', fontSize: 10, transform: `rotate(${open ? 180 : 0}deg)`,
            transition: 'transform var(--gc-dur-base) var(--gc-ease-out)',
          }}>▾</span>
        </button>
        <div dir="ltr" style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1, minWidth: 0, overflowX: 'auto', scrollbarWidth: 'none' }}>
          {chordStrip}
        </div>
      </div>

      {/* The song's controls — fold open beneath the line (0fr → 1fr rows). */}
      <div style={{
        display: 'grid', gridTemplateRows: open ? '1fr' : '0fr',
        transition: 'grid-template-rows var(--gc-dur-slow) var(--gc-ease-out)',
      }}>
        <div style={{ overflow: 'hidden', minHeight: 0 }} inert={!open}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: compact ? 'wrap' : 'nowrap', minWidth: 0 }}>
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
              {onOpenMap && (
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

            {/* Sections — one tab each; + starts the next one (Verse → Chorus…) */}
            <div dir="ltr" style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, overflowX: 'auto', scrollbarWidth: 'none' }}>
              <div style={{ display: 'flex', flexShrink: 0, border: `1px solid ${T.border}` }}>
                {song.song.sections.map((sec, i) => {
                  const on = sec.id === song.section.id;
                  return (
                    <button key={sec.id} onClick={() => song.selectSection(sec.id)} data-active={on} className="gc-no-bar"
                      style={{
                        height: 26, padding: '0 8px', fontSize: 9.5, letterSpacing: '0.1em', cursor: 'pointer', fontFamily: 'var(--gc-mono)',
                        background: on ? T.text : 'transparent', color: on ? T.bgDeep : T.textMuted,
                        borderLeft: i ? `1px solid ${T.border}` : 'none',
                      }}>{sec.name}</button>
                  );
                })}
                <button onClick={() => {
                  const used = new Set(song.song.sections.map(s => s.name));
                  song.addSection(SECTION_NAMES.find(n => n !== 'Intro' && !used.has(n)) ?? `Section ${song.song.sections.length + 1}`);
                }} aria-label={he ? 'קטע חדש' : 'New section'} title={he ? 'קטע חדש' : 'New section'}
                  style={{ height: 26, width: 26, fontSize: 13, cursor: 'pointer', background: 'transparent', color: T.textMuted, borderLeft: `1px solid ${T.border}` }}>+</button>
              </div>
              {!!song.section.variants?.length && (
                <select value="" onChange={e => e.target.value && song.useVariant(e.target.value)} aria-label="Variants"
                  style={{ ...sel, height: 26, flexShrink: 0, fontWeight: 400 }}>
                  <option value="">{he ? 'גרסאות' : 'Variants'} ({song.section.variants.length})</option>
                  {song.section.variants.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              )}
                          </div>
          </div>
        </div>
      </div>
    </div>
  );
}
