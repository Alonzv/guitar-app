import React, { useState, useRef, useEffect, useCallback } from 'react';
import { T, card } from '../../theme';

// ── Inline SVG note icons (currentColor) ──────────────────────────────────
const NoteIcons = {
  whole: (
    <svg viewBox="0 0 22 14" width="22" height="14" style={{ display: 'block' }}>
      <ellipse cx="11" cy="7" rx="9" ry="5.5" stroke="currentColor" strokeWidth="2" fill="none"/>
    </svg>
  ),
  half: (
    <svg viewBox="0 0 16 28" width="14" height="26" style={{ display: 'block' }}>
      <ellipse cx="7.5" cy="21" rx="6.5" ry="4.5" stroke="currentColor" strokeWidth="1.7"
        fill="none" transform="rotate(-18,7.5,21)"/>
      <line x1="13.5" y1="18.5" x2="13.5" y2="2" stroke="currentColor" strokeWidth="1.7"/>
    </svg>
  ),
  quarter: (
    <svg viewBox="0 0 16 28" width="14" height="26" style={{ display: 'block' }}>
      <ellipse cx="7.5" cy="21" rx="6.5" ry="4.5" fill="currentColor" transform="rotate(-18,7.5,21)"/>
      <line x1="13.5" y1="18.5" x2="13.5" y2="2" stroke="currentColor" strokeWidth="1.7"/>
    </svg>
  ),
  triplet: (
    <svg viewBox="0 0 50 30" width="50" height="30" style={{ display: 'block' }}>
      <ellipse cx="6.5" cy="23" rx="5.5" ry="4" fill="currentColor" transform="rotate(-18,6.5,23)"/>
      <line x1="11.5" y1="20" x2="11.5" y2="8" stroke="currentColor" strokeWidth="1.5"/>
      <ellipse cx="25" cy="23" rx="5.5" ry="4" fill="currentColor" transform="rotate(-18,25,23)"/>
      <line x1="30" y1="20" x2="30" y2="8" stroke="currentColor" strokeWidth="1.5"/>
      <ellipse cx="43" cy="23" rx="5.5" ry="4" fill="currentColor" transform="rotate(-18,43,23)"/>
      <line x1="48" y1="20" x2="48" y2="8" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="11.5" y1="8" x2="48" y2="8" stroke="currentColor" strokeWidth="2.2"/>
      <text x="30" y="5.5" textAnchor="middle" fontSize="8" fill="currentColor" fontWeight="800">3</text>
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
  { label: 'Quarter', beats: 4,  clicksPerBeat: 1,    icon: NoteIcons.quarter   },
  { label: 'Eighth',  beats: 8,  clicksPerBeat: 2,    icon: NoteIcons.eighth    },
  { label: '16th',    beats: 16, clicksPerBeat: 4,    icon: NoteIcons.sixteenth },
];

function beep(ctx: AudioContext, time: number, accent: boolean): void {
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = accent ? 1100 : 880;
  gain.gain.setValueAtTime(accent ? 0.35 : 0.22, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.06);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(time);
  osc.stop(time + 0.08);
}

export const Metronome: React.FC = () => {
  const [bpm, setBpm]                   = useState(100);
  const [bpmInput, setBpmInput]         = useState('100');
  const [subdivision, setSubdivision]   = useState(SUBDIVISIONS[2]); // Quarter default
  const [playing, setPlaying]           = useState(false);
  const [beat, setBeat]                 = useState(-1);

  const ctxRef          = useRef<AudioContext | null>(null);
  const nextBeatTimeRef = useRef(0);
  const beatNumRef      = useRef(0);
  const intervalRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const bpmRef           = useRef(bpm);
  const beatsRef         = useRef(subdivision.beats);
  const clicksPerBeatRef = useRef(subdivision.clicksPerBeat);
  bpmRef.current          = bpm;
  beatsRef.current        = subdivision.beats;
  clicksPerBeatRef.current = subdivision.clicksPerBeat;

  // Reset beat counter when subdivision changes
  useEffect(() => {
    beatNumRef.current = 0;
  }, [subdivision]);

  const schedule = useCallback(() => {
    if (!ctxRef.current) return;
    const ctx = ctxRef.current;
    while (nextBeatTimeRef.current < ctx.currentTime + 0.1) {
      const b = beatNumRef.current;
      beep(ctx, nextBeatTimeRef.current, b === 0);
      const delay = Math.max(0, (nextBeatTimeRef.current - ctx.currentTime) * 1000);
      setTimeout(() => setBeat(b), delay);
      nextBeatTimeRef.current += 60 / (bpmRef.current * clicksPerBeatRef.current);
      beatNumRef.current = (beatNumRef.current + 1) % beatsRef.current;
    }
  }, []);

  // handleStartStop MUST be the direct onClick handler so AudioContext
  // is created inside a user gesture — required for iOS (incl. silent mode).
  const handleStartStop = useCallback(() => {
    if (playing) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
      setBeat(-1);
      setPlaying(false);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Ctx: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new Ctx();
      // Play a silent 1-sample buffer — unlocks iOS audio session so
      // Web Audio works even when the hardware silent switch is on.
      const silent = ctx.createBuffer(1, 1, ctx.sampleRate);
      const silentSrc = ctx.createBufferSource();
      silentSrc.buffer = silent;
      silentSrc.connect(ctx.destination);
      silentSrc.start(0);
      ctx.resume().catch(() => {});
      ctxRef.current = ctx;
      nextBeatTimeRef.current = ctx.currentTime + 0.05;
      beatNumRef.current = 0;
      setPlaying(true);
    }
  }, [playing]);

  // Manage the scheduling interval in response to playing state.
  useEffect(() => {
    if (!playing) return;
    intervalRef.current = setInterval(schedule, 25);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [playing, schedule]);

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

  // Dot sizing — shrink for many beats so they fit
  const dotSize = subdivision.beats <= 7 ? 44 : subdivision.beats <= 9 ? 34 : 26;
  const dotGap  = subdivision.beats <= 7 ? 12 : 8;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Beat dots */}
      <div style={card({ padding: '20px 12px' })}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: dotGap }}>
          {Array.from({ length: subdivision.beats }).map((_, i) => (
            <div key={i} style={{
              width: dotSize, height: dotSize, borderRadius: '50%', flexShrink: 0,
              background: playing && beat === i ? (i === 0 ? T.primary : T.secondary) : T.bgInput,
              border: `2px solid ${i === 0 ? T.primary : T.border}`,
              transition: 'background 0.05s, transform 0.05s',
              transform: playing && beat === i ? 'scale(1.2)' : 'scale(1)',
            }} />
          ))}
        </div>
      </div>

      {/* BPM control */}
      <div style={card()}>
        {/* Large BPM display + manual input */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 6 }}>
          <button onClick={() => adjustBpm(-1)} style={{
            width: 44, height: 44, borderRadius: '50%', border: `1px solid ${T.border}`,
            background: T.bgInput, color: T.text, fontSize: 24, fontWeight: 700, cursor: 'pointer', lineHeight: 1, flexShrink: 0,
          }}>−</button>
          <input
            type="number" min={40} max={240}
            value={bpmInput}
            onChange={e => setBpmInput(e.target.value)}
            onBlur={e => applyBpm(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && applyBpm(bpmInput)}
            style={{
              width: 110, textAlign: 'center', fontSize: 52, fontWeight: 800,
              color: T.text, background: 'transparent', border: 'none', outline: 'none',
              fontFamily: 'inherit', padding: 0, boxSizing: 'border-box',
              MozAppearance: 'textfield',
            } as React.CSSProperties}
          />
          <button onClick={() => adjustBpm(1)} style={{
            width: 44, height: 44, borderRadius: '50%', border: `1px solid ${T.border}`,
            background: T.bgInput, color: T.text, fontSize: 24, fontWeight: 700, cursor: 'pointer', lineHeight: 1, flexShrink: 0,
          }}>+</button>
        </div>
        <div style={{ textAlign: 'center', fontSize: 12, color: T.textMuted, marginBottom: 16 }}>BPM</div>

        <input
          type="range" min={40} max={240} value={bpm}
          onChange={e => { const v = Number(e.target.value); setBpm(v); setBpmInput(String(v)); }}
          style={{ width: '100%', marginBottom: 20, accentColor: T.primary, cursor: 'pointer' }}
        />

        {/* Subdivision buttons */}
        <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Subdivision
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 20 }}>
          {SUBDIVISIONS.map(sub => {
            const active = subdivision.beats === sub.beats;
            return (
              <button
                key={sub.label}
                onClick={() => setSubdivision(sub)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: 6, padding: '10px 4px', borderRadius: 10,
                  border: `1.5px solid ${active ? T.primary : T.border}`,
                  background: active ? T.primaryBg : T.bgInput,
                  color: active ? T.primary : T.textMuted,
                  cursor: 'pointer', fontSize: 11, fontWeight: active ? 700 : 500,
                  transition: 'all 0.15s',
                }}
              >
                {sub.icon}
                <span>{sub.label}</span>
              </button>
            );
          })}
        </div>

        <button
          onClick={handleStartStop}
          style={{
            width: '100%', padding: '14px 0', borderRadius: 12, border: 'none',
            background: playing ? T.coral : T.primary,
            color: T.white, fontWeight: 800, fontSize: 16, cursor: 'pointer',
            transition: 'background 0.2s',
          }}
        >
          {playing ? '■  Stop' : '▶  Start'}
        </button>
      </div>
    </div>
  );
};
