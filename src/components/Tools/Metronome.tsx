import React, { useState, useRef, useEffect, useCallback } from 'react';
import { T } from '../../theme';
import { unlockAudio, getSharedContext, getOutputNode } from '../../utils/audioPlayback';

// ── Inline SVG note icons ──────────────────────────────────────────────────
const NoteIcons = {
  quarter: (
    <svg viewBox="0 0 16 28" width="14" height="26" style={{ display: 'block' }}>
      <ellipse cx="7.5" cy="21" rx="6.5" ry="4.5" fill="currentColor" transform="rotate(-18,7.5,21)"/>
      <line x1="13.5" y1="18.5" x2="13.5" y2="2" stroke="currentColor" strokeWidth="1.7"/>
    </svg>
  ),
  eighth: (
    <svg viewBox="0 0 20 28" width="16" height="26" style={{ display: 'block' }}>
      <ellipse cx="7.5" cy="21" rx="6.5" ry="4.5" fill="currentColor" transform="rotate(-18,7.5,21)"/>
      <line x1="13.5" y1="18.5" x2="13.5" y2="2" stroke="currentColor" strokeWidth="1.7"/>
      <path d="M13.5,2 C18,5 19,12 15,17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
    </svg>
  ),
  sixteenth: (
    <svg viewBox="0 0 20 28" width="16" height="26" style={{ display: 'block' }}>
      <ellipse cx="7.5" cy="21" rx="6.5" ry="4.5" fill="currentColor" transform="rotate(-18,7.5,21)"/>
      <line x1="13.5" y1="18.5" x2="13.5" y2="2" stroke="currentColor" strokeWidth="1.7"/>
      <path d="M13.5,2 C18,5 19,12 15,17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
      <path d="M13.5,8 C18,11 19,18 15,22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
    </svg>
  ),
};

const SUBDIVISIONS = [
  { label: 'Quarter', clicksPerBeat: 1, icon: NoteIcons.quarter   },
  { label: 'Eighth',  clicksPerBeat: 2, icon: NoteIcons.eighth    },
  { label: '16th',    clicksPerBeat: 4, icon: NoteIcons.sixteenth },
];

const TIME_SIGS = [
  { label: '4/4', beats: 4 },
  { label: '3/4', beats: 3 },
  { label: '6/8', beats: 6 },
];

function beep(ctx: AudioContext, time: number, accent: boolean): void {
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = accent ? 1100 : 880;
  gain.gain.setValueAtTime(accent ? 0.35 : 0.22, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.06);
  osc.connect(gain);
  gain.connect(getOutputNode());
  osc.start(time);
  osc.stop(time + 0.08);
}

const SECTION: React.CSSProperties = {
  fontFamily: 'var(--gc-mono)', fontSize: 11, letterSpacing: '0.14em',
  textTransform: 'uppercase', color: '#9C958C', margin: '0 0 14px',
};

export const Metronome: React.FC = () => {
  const [bpm, setBpm]                   = useState(100);
  const [bpmInput, setBpmInput]         = useState('100');
  const [subdivision, setSubdivision]   = useState(SUBDIVISIONS[0]);
  const [timeSig, setTimeSig]           = useState(TIME_SIGS[0]);
  const [playing, setPlaying]           = useState(false);
  const [beat, setBeat]                 = useState(-1);

  const nextBeatTimeRef  = useRef(0);
  const beatNumRef       = useRef(0);
  const intervalRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const visualRafRef     = useRef<number | null>(null);
  const noteQueueRef     = useRef<{ beatNum: number; time: number }[]>([]);
  const bpmRef           = useRef(bpm);
  const totalBeatsRef    = useRef(timeSig.beats * subdivision.clicksPerBeat);
  const clicksPerBeatRef = useRef(subdivision.clicksPerBeat);
  const tapTimesRef      = useRef<number[]>([]);

  bpmRef.current          = bpm;
  totalBeatsRef.current   = timeSig.beats * subdivision.clicksPerBeat;
  clicksPerBeatRef.current = subdivision.clicksPerBeat;

  useEffect(() => { beatNumRef.current = 0; }, [subdivision, timeSig]);

  const schedule = useCallback(() => {
    const ctx = getSharedContext();
    while (nextBeatTimeRef.current < ctx.currentTime + 0.1) {
      const b = beatNumRef.current;
      beep(ctx, nextBeatTimeRef.current, b === 0);
      noteQueueRef.current.push({ beatNum: b, time: nextBeatTimeRef.current });
      nextBeatTimeRef.current += 60 / (bpmRef.current * clicksPerBeatRef.current);
      beatNumRef.current = (beatNumRef.current + 1) % totalBeatsRef.current;
    }
  }, []);

  const visualTick = useCallback(() => {
    const ctx = getSharedContext();
    const now = ctx.currentTime;
    const q = noteQueueRef.current;
    while (q.length > 0 && q[0].time <= now + 0.01) {
      setBeat(q.shift()!.beatNum);
    }
    visualRafRef.current = requestAnimationFrame(visualTick);
  }, []);

  const handleStartStop = useCallback(() => {
    if (playing) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setBeat(-1);
      setPlaying(false);
    } else {
      // Respond to the tap immediately (UI), then arm the scheduler once
      // the AudioContext is confirmed running. Set nextBeatTime to Infinity
      // so schedule() is a no-op until we arm it in the then().
      nextBeatTimeRef.current = Infinity;
      beatNumRef.current = 0;
      setPlaying(true);
      unlockAudio().then(() => {
        const ctx = getSharedContext();
        nextBeatTimeRef.current = ctx.currentTime + 0.15;
      });
    }
  }, [playing]);

  useEffect(() => {
    if (!playing) return;
    intervalRef.current = setInterval(schedule, 25);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [playing, schedule]);

  useEffect(() => {
    if (!playing) {
      if (visualRafRef.current) cancelAnimationFrame(visualRafRef.current);
      return;
    }
    noteQueueRef.current = [];
    visualRafRef.current = requestAnimationFrame(visualTick);
    return () => { if (visualRafRef.current) cancelAnimationFrame(visualRafRef.current); };
  }, [playing, visualTick]);

  const handleTap = useCallback(() => {
    const now = performance.now();
    const recent = tapTimesRef.current.filter(t => now - t < 5000);
    recent.push(now);
    tapTimesRef.current = recent;
    if (recent.length >= 2) {
      const intervals = recent.slice(1).map((t, i) => t - recent[i]);
      const avgMs = intervals.reduce((a, b) => a + b) / intervals.length;
      const newBpm = Math.round(60000 / avgMs);
      const clamped = Math.min(240, Math.max(40, newBpm));
      setBpm(clamped);
      setBpmInput(String(clamped));
    }
  }, []);

  const applyBpm = (val: string) => {
    const n = parseInt(val, 10);
    if (!isNaN(n)) {
      const clamped = Math.min(240, Math.max(40, n));
      setBpm(clamped);
      setBpmInput(String(clamped));
    }
  };

  const adjustBpm = (delta: number) => {
    const next = Math.min(240, Math.max(40, bpm + delta));
    setBpm(next);
    setBpmInput(String(next));
  };

  // A beat dot i lights up when the current tick is the i-th main beat
  const beatDotActive = (i: number) =>
    playing && beat === i * subdivision.clicksPerBeat;

  const dotSize = timeSig.beats <= 4 ? 32 : 26;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Section label */}
      <p style={SECTION}>Metronome</p>

      {/* BPM + control row — open, no card */}
      <div style={{ textAlign: 'center', padding: '8px 0' }}>

        {/* Giant BPM */}
        <input
          type="number" min={40} max={240}
          value={bpmInput}
          onChange={e => setBpmInput(e.target.value)}
          onBlur={e => applyBpm(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && applyBpm(bpmInput)}
          style={{
            display: 'block', margin: '0 auto 4px',
            width: 200, textAlign: 'center',
            fontSize: 84, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 0.9,
            color: T.text, background: 'transparent', outline: 'none',
            fontFamily: 'inherit', padding: 0, boxSizing: 'border-box',
            MozAppearance: 'textfield',
          } as React.CSSProperties}
        />
        <div style={{
          fontFamily: 'var(--gc-mono)', fontSize: 11, letterSpacing: '0.14em',
          textTransform: 'uppercase', color: '#9C958C', marginBottom: 20,
        }}>BPM</div>

        {/* Control row: − · beat dots · + */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <button onClick={() => adjustBpm(-1)} style={{
            width: 44, height: 44, flexShrink: 0,
            border: `1px solid ${T.border}`, background: 'transparent',
            color: T.text, fontSize: 22, fontWeight: 400, cursor: 'pointer',
          }}>−</button>

          {/* Beat dots */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flex: 1, justifyContent: 'center' }}>
            {Array.from({ length: timeSig.beats }).map((_, i) => (
              <div key={i} style={{
                width: dotSize, height: dotSize, flexShrink: 0,
                background: beatDotActive(i)
                  ? (i === 0 ? T.primary : T.secondary)
                  : T.bgInput,
                border: `2px solid ${i === 0 ? T.primary : T.border}`,
                transition: 'background 0.05s, transform 0.05s',
                transform: beatDotActive(i) ? 'scale(1.2)' : 'scale(1)',
              }} />
            ))}
          </div>

          <button onClick={() => adjustBpm(1)} style={{
            width: 44, height: 44, flexShrink: 0,
            border: `1px solid ${T.border}`, background: 'transparent',
            color: T.text, fontSize: 22, fontWeight: 400, cursor: 'pointer',
          }}>+</button>
        </div>
      </div>

      {/* START / STOP */}
      <button
        onClick={handleStartStop}
        style={{
          width: '100%', padding: '18px 0',
          background: playing ? T.coral : T.primary,
          color: '#fff', fontWeight: 800, fontSize: 18, cursor: 'pointer',
          border: 'none', borderLeft: '4px solid var(--gc-bar-color)',
          transition: 'background 0.2s', letterSpacing: '0.06em',
        }}
      >
        {playing ? 'STOP' : '► START'}
      </button>

      {/* Time signature chips — below START */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {TIME_SIGS.map(ts => {
          const active = timeSig.label === ts.label;
          return (
            <button key={ts.label} onClick={() => setTimeSig(ts)} style={{
              padding: '10px 4px', border: `1.5px solid ${active ? T.primary : T.border}`,
              background: active ? T.primary : T.bgInput,
              color: active ? '#fff' : T.textMuted,
              fontFamily: 'var(--gc-mono)', fontSize: 14, fontWeight: active ? 700 : 400,
              cursor: 'pointer', letterSpacing: '0.04em',
              transition: 'all 0.15s',
            }}>
              {ts.label}
            </button>
          );
        })}
      </div>

      {/* Tap + Subdivision */}
      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <button
          onClick={handleTap}
          style={{
            width: '100%', padding: '10px 0',
            border: `1px solid ${T.border}`, background: T.bgInput,
            color: T.textMuted, fontWeight: 400, fontSize: 13, cursor: 'pointer',
            transition: 'background 0.1s', borderLeft: '3px solid var(--gc-bar-color)',
          }}
        >
          Tap Tempo
        </button>

        <div>
          <p style={{ ...SECTION, marginBottom: 8 }}>Subdivision</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {SUBDIVISIONS.map(sub => {
              const active = subdivision.clicksPerBeat === sub.clicksPerBeat;
              return (
                <button
                  key={sub.label}
                  onClick={() => setSubdivision(sub)}
                  style={{
                    padding: '10px 4px',
                    border: `1.5px solid ${active ? T.primary : T.border}`,
                    background: active ? T.primaryBg : T.bgInput,
                    color: active ? T.primary : T.textMuted,
                    cursor: 'pointer', fontSize: 12, fontWeight: active ? 700 : 400,
                    fontFamily: 'var(--gc-mono)', letterSpacing: '0.04em',
                    transition: 'all 0.15s',
                  }}
                >
                  {sub.label.toUpperCase()}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
