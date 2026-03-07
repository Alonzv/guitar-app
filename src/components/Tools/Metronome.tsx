import React, { useState, useRef, useEffect, useCallback } from 'react';
import { T, card } from '../../theme';

const TIME_SIGS = [
  { label: '2/4',   beats: 2  },
  { label: '3/4',   beats: 3  },
  { label: '4/4',   beats: 4  },
  { label: '5/4',   beats: 5  },
  { label: '6/8',   beats: 6  },
  { label: '7/8',   beats: 7  },
  { label: '8/8',   beats: 8  },
  { label: '9/8',   beats: 9  },
  { label: '12/8',  beats: 12 },
  { label: '16/16', beats: 16 },
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
  const [bpm, setBpm]         = useState(100);
  const [bpmInput, setBpmInput] = useState('100');
  const [timeSig, setTimeSig] = useState(TIME_SIGS[2]); // default 4/4
  const [playing, setPlaying] = useState(false);
  const [beat, setBeat]       = useState(-1);

  const ctxRef          = useRef<AudioContext | null>(null);
  const nextBeatTimeRef = useRef(0);
  const beatNumRef      = useRef(0);
  const intervalRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const bpmRef          = useRef(bpm);
  const beatsRef        = useRef(timeSig.beats);
  bpmRef.current   = bpm;
  beatsRef.current = timeSig.beats;

  // Reset beat counter when time signature changes while playing
  useEffect(() => {
    beatNumRef.current = 0;
  }, [timeSig]);

  const schedule = useCallback(() => {
    if (!ctxRef.current) return;
    const ctx = ctxRef.current;
    while (nextBeatTimeRef.current < ctx.currentTime + 0.1) {
      const b = beatNumRef.current;
      beep(ctx, nextBeatTimeRef.current, b === 0);
      const delay = Math.max(0, (nextBeatTimeRef.current - ctx.currentTime) * 1000);
      setTimeout(() => setBeat(b), delay);
      nextBeatTimeRef.current += 60 / bpmRef.current;
      beatNumRef.current = (beatNumRef.current + 1) % beatsRef.current;
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
  const dotSize = timeSig.beats <= 7 ? 44 : timeSig.beats <= 9 ? 34 : 26;
  const dotGap  = timeSig.beats <= 7 ? 12 : 8;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Beat dots */}
      <div style={card({ padding: '20px 12px' })}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: dotGap }}>
          {Array.from({ length: timeSig.beats }).map((_, i) => (
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
              /* hide browser spinner arrows */
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

        {/* Time signature */}
        <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Time Signature
        </p>
        <select
          value={timeSig.label}
          onChange={e => setTimeSig(TIME_SIGS.find(ts => ts.label === e.target.value)!)}
          style={{
            width: '100%', marginBottom: 20, padding: '10px 12px', borderRadius: 10,
            border: `1px solid ${T.border}`, background: T.bgInput,
            color: T.text, fontSize: 14, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
          }}
        >
          {TIME_SIGS.map(ts => (
            <option key={ts.label} value={ts.label}>{ts.label}</option>
          ))}
        </select>

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
