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

  // The dock is the ink bar under every stop: paper text on ink, pills
  // outlined in paper. Cobalt marks only the chord that is sounding.
  const fg = T.text, bar = T.bgCard;
  const ghost: React.CSSProperties = {
    height: 32, minWidth: 32, padding: '0 10px', border: `1.5px solid ${fg}`, borderRadius: 'var(--su-pill)', background: 'transparent',
    color: fg, cursor: 'pointer', fontSize: 11, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  };
  const lbl: React.CSSProperties = { fontSize: 9, color: fg, opacity: 0.7, fontFamily: 'var(--gc-mono)', letterSpacing: '0.14em', textTransform: 'uppercase' };
  const sel: React.CSSProperties = {
    appearance: 'none', WebkitAppearance: 'none', height: 32, padding: '0 12px', border: `1.5px solid ${fg}`, borderRadius: 'var(--su-pill)',
    background: 'transparent', color: fg, fontFamily: 'inherit', fontSize: 11, fontWeight: 700, cursor: 'pointer',
  };
  const opt: React.CSSProperties = { background: bar, color: fg };

  const open = useDockOpen();

  // The section's chords — the flight target for added chords, so they stay on
  // the slim line even when the dock is folded.
  const chordStrip = progression.length === 0 ? (
    open ? <span style={{ fontSize: 11.5, color: fg, opacity: 0.7 }}>{he ? 'עדיין אין אקורדים — הוסיפו מכל כלי' : 'No chords yet — add them from any tool'}</span> : null
  ) : progression.map(item => {
    const now = sounding.shape(shapeKey(item.fretPositions));
    const picked = song.selectedChord?.id === item.id;
    return (
      // Tapping a chord plays it and makes it the chord that one-chord
      // tools (Triads, Intervals in a Chord) open on.
      <button key={item.id} data-gc-dock-item
        onClick={() => { playChord(item.fretPositions, tuning.openFreqs, capo); song.selectChord(picked ? null : item.id); }}
        title={he ? 'נגן ובחר' : 'Play and select'}
        aria-pressed={picked}
        className="gc-notation gc-no-bar"
        style={{
          flexShrink: 0, height: 32, padding: '0 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer', borderRadius: 'var(--su-pill)',
          border: `1.5px solid ${now ? T.primary : fg}`,
          background: now ? T.primary : picked ? fg : 'transparent', color: now ? 'var(--su-on-primary)' : picked ? bar : fg,
        }}>
        {formatChordName(item.chord.name)}
      </button>
    );
  });

  const summary = [title.trim() || (he ? 'שיר' : 'Song'), song.key ? keyName(song.key, lang) : null, `${bpm}`]
    .filter(Boolean).join(' · ');

  return (
    <div data-gc-dock dir={rtl ? 'rtl' : 'ltr'} style={{
      background: 'transparent', color: fg, padding: compact ? '8px 14px calc(8px + env(safe-area-inset-bottom))' : '10px 32px',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* The song's controls — fold open above the line (0fr → 1fr rows). */}
      <div style={{
        display: 'grid', gridTemplateRows: open ? '1fr' : '0fr',
        transition: 'grid-template-rows var(--gc-dur-slow) var(--gc-ease-out)',
      }}>
        <div style={{ overflow: 'hidden', minHeight: 0 }} inert={!open}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: compact ? 'wrap' : 'nowrap', minWidth: 0 }}>
              <button onClick={() => toggle('loop')} data-active={playing === 'loop'} aria-label="Loop section"
                title={he ? 'לופ' : 'Loop'}
                style={{ ...ghost, background: playing === 'loop' ? fg : 'transparent', color: playing === 'loop' ? bar : fg }}>⟳</button>
              <input
                value={title}
                onChange={e => song.update({ title: e.target.value })}
                placeholder={he ? 'שיר ללא שם' : 'Untitled song'}
                aria-label={he ? 'שם השיר' : 'Song title'}
                dir="auto"
                style={{
                  flex: compact ? '1 1 120px' : '0 1 220px', minWidth: 0, height: 32, padding: '0 4px', border: 'none',
                  background: 'transparent', color: fg, fontFamily: 'var(--su-display)', fontStretch: 'var(--su-display-semi)',
                  fontSize: 18, fontWeight: 800, textTransform: 'uppercase', borderBottom: `1.5px solid ${fg}`,
                }}
              />
              {onOpenMap && (
                <button onClick={onOpenMap} style={ghost} title={he ? 'מפת השיר' : 'Song map'}>
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
                  <option style={opt} value="auto">{he ? 'אוטומטי' : 'Auto'}{song.keyIsAuto && song.key ? ` · ${keyLabel}` : ''}</option>
                  {ALL_KEYS.map(k => <option style={opt} key={`${k.tonicPc}:${k.mode}`} value={`${k.tonicPc}:${k.mode}`}>{keyName(k, lang)}</option>)}
                </select>
                <span style={lbl}>BPM</span>
                <div dir="ltr" style={{ display: 'inline-flex', alignItems: 'center' }}>
                  <button onClick={() => song.update({ bpm: Math.max(40, bpm - 2) })} aria-label="Slower" style={{ ...ghost, padding: 0 }}>−</button>
                  <span style={{ minWidth: 34, textAlign: 'center', fontSize: 12, fontWeight: 700, fontFamily: 'var(--gc-mono)' }}>{bpm}</span>
                  <button onClick={() => song.update({ bpm: Math.min(240, bpm + 2) })} aria-label="Faster" style={{ ...ghost, padding: 0 }}>+</button>
                </div>
                <select dir="ltr" value={meter} aria-label="Meter" style={sel} onChange={e => song.update({ meter: e.target.value as Meter })}>
                  {METERS.map(m => <option style={opt} key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>

            {/* Sections — one tab each; + starts the next one (Verse → Chorus…) */}
            <div dir="ltr" style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, overflowX: 'auto', scrollbarWidth: 'none' }}>
              <div style={{ display: 'flex', flexShrink: 0, gap: 6 }}>
                {song.song.sections.map(sec => {
                  const on = sec.id === song.section.id;
                  return (
                    <button key={sec.id} onClick={() => song.selectSection(sec.id)} data-active={on} className="gc-no-bar"
                      style={{
                        height: 32, padding: '0 12px', fontSize: 9.5, letterSpacing: '0.12em', cursor: 'pointer', fontFamily: 'var(--gc-mono)',
                        borderRadius: 'var(--su-pill)', border: `1.5px solid ${fg}`,
                        background: on ? fg : 'transparent', color: on ? bar : fg,
                      }}>{sec.name}</button>
                  );
                })}
                <button onClick={() => {
                  const used = new Set(song.song.sections.map(s => s.name));
                  song.addSection(SECTION_NAMES.find(n => n !== 'Intro' && !used.has(n)) ?? `Section ${song.song.sections.length + 1}`);
                }} aria-label={he ? 'קטע חדש' : 'New section'} title={he ? 'קטע חדש' : 'New section'}
                  style={{ ...ghost, fontSize: 14 }}>+</button>
              </div>
              {!!song.section.variants?.length && (
                <select value="" onChange={e => e.target.value && song.useVariant(e.target.value)} aria-label="Variants"
                  style={{ ...sel, flexShrink: 0 }}>
                  <option style={opt} value="">{he ? 'גרסאות' : 'Variants'} ({song.section.variants.length})</option>
                  {song.section.variants.map(v => <option style={opt} key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              )}
                          </div>
          </div>
        </div>
      </div>
      {/* The slim line — always there: play, what the song is, its chords, and
          the fold. Folded, this is all the dock takes. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <button onClick={() => toggle('once')} data-active={playing === 'once'} aria-label={playing === 'once' ? 'Stop' : 'Play section'}
          title={he ? 'נגן את הקטע' : 'Play the section'}
          style={{ ...ghost, width: 40, height: 40, borderRadius: '50%', padding: 0, border: 'none', background: fg, color: bar, fontSize: 13 }}>
          {playing === 'once' ? '■' : '▶'}
        </button>
        <button onClick={() => setDockOpen(!open)} aria-expanded={open} className="gc-no-bar gc-notation"
          title={open ? (he ? 'קפל את השיר' : 'Fold the song') : (he ? 'פתח את השיר' : 'Open the song')}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 1, minWidth: 0, height: 44, padding: '0 4px',
            background: 'transparent', border: 'none', cursor: 'pointer', color: fg, fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase',
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

    </div>
  );
}
