import React, { useState, useRef, useEffect, useCallback } from 'react';
import { T, card } from '../../theme';

const BEATS = 4;

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
  const [bpm, setBpm]       = useState(100);
  const [playing, setPlaying] = useState(false);
  const [beat, setBeat]     = useState(-1);

  const ctxRef          = useRef<AudioContext | null>(null);
  const nextBeatTimeRef = useRef(0);
  const beatNumRef      = useRef(0);
  const intervalRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const bpmRef          = useRef(bpm);
  bpmRef.current = bpm;

  const schedule = useCallback(() => {
    if (!ctxRef.current) return;
    const ctx = ctxRef.current;
    while (nextBeatTimeRef.current < ctx.currentTime + 0.1) {
      const b = beatNumRef.current;
      beep(ctx, nextBeatTimeRef.current, b === 0);
      const delay = Math.max(0, (nextBeatTimeRef.current - ctx.currentTime) * 1000);
      setTimeout(() => setBeat(b), delay);
      nextBeatTimeRef.current += 60 / bpmRef.current;
      beatNumRef.current = (beatNumRef.current + 1) % BEATS;
    }
  }, []);

  useEffect(() => {
    if (playing) {
      const ctx = new AudioContext();
      ctxRef.current = ctx;
      nextBeatTimeRef.current = ctx.currentTime + 0.05;
      beatNumRef.current = 0;
      intervalRef.current = setInterval(schedule, 25);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
      ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
      setBeat(-1);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [playing, schedule]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Beat dots */}
      <div style={card({ display: 'flex', justifyContent: 'center', gap: 14, padding: '24px 16px' })}>
        {Array.from({ length: BEATS }).map((_, i) => (
          <div key={i} style={{
            width: 48, height: 48, borderRadius: '50%',
            background: playing && beat === i ? (i === 0 ? T.primary : T.secondary) : T.bgInput,
            border: `2.5px solid ${i === 0 ? T.primary : T.border}`,
            transition: 'background 0.05s, transform 0.05s',
            transform: playing && beat === i ? 'scale(1.18)' : 'scale(1)',
          }} />
        ))}
      </div>

      {/* BPM + controls */}
      <div style={card()}>
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 58, fontWeight: 800, color: T.text, lineHeight: 1 }}>{bpm}</span>
          <span style={{ fontSize: 15, color: T.textMuted, marginLeft: 8 }}>BPM</span>
        </div>
        <input
          type="range" min={40} max={220} value={bpm}
          onChange={e => setBpm(Number(e.target.value))}
          style={{ width: '100%', marginBottom: 16, accentColor: T.primary, cursor: 'pointer' }}
        />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 20 }}>
          {[60, 80, 100, 120, 140, 160].map(b => (
            <button key={b} onClick={() => setBpm(b)} style={{
              padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
              border: `1px solid ${bpm === b ? T.primary : T.border}`,
              background: bpm === b ? T.primaryBg : T.bgInput,
              color: bpm === b ? T.primary : T.textMuted,
              cursor: 'pointer',
            }}>{b}</button>
          ))}
        </div>
        <button
          onClick={() => setPlaying(p => !p)}
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
