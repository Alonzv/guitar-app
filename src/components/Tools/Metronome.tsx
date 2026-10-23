import React, { useState, useRef, useEffect, useCallback } from 'react';
import { T } from '../../theme';
import { useLang } from '../../contexts/LanguageContext';
import { useIsDesktop } from '../../hooks/useIsDesktop';
import { Pill, PillRow, Cta, Rule } from '../Transit/parts';
import { NightStage, NightToggle } from './NightStage';
import { useNight } from './useNight';
import { unlockAudio, getSharedContext, getOutputNode, releaseNowPlaying } from '../../utils/audioPlayback';
import { useOptionalSong } from '../../song/SongContext';
import type { Meter } from '../../song/song';

const SUBDIVISIONS = [
  { label: 'Quarter', he: 'רבעים',  clicksPerBeat: 1 },
  { label: 'Eighth',  he: 'שמיניות', clicksPerBeat: 2 },
  { label: '16th',    he: 'שש-עשריות', clicksPerBeat: 4 },
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

const TRAIN_STEP = 4;    // BPM added…
const TRAIN_EVERY = 4;   // …every this many bars

export const Metronome: React.FC = () => {
  const { lang } = useLang();
  const he = lang === 'he';
  const desktop = useIsDesktop();
  const [night, toggleNight] = useNight('scaleup_metronome_night');
  const [reduceMotion] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  // Tempo and metre are the song's: they open on it, and a change here (±,
  // typing, tap tempo, 4/4…) is the song's new tempo for every tool.
  const song = useOptionalSong();
  const songBpm = song?.song.bpm ?? 100;
  const songMeter = song?.song.meter ?? '4/4';
  const [bpm, setBpmState]              = useState(songBpm);
  const [bpmInput, setBpmInput]         = useState(String(songBpm));
  const [subdivision, setSubdivision]   = useState(SUBDIVISIONS[0]);
  const [timeSig, setTimeSigState]      = useState(TIME_SIGS.find(t => t.label === songMeter) ?? TIME_SIGS[0]);
  const setBpm = (v: number) => { setBpmState(v); song?.update({ bpm: v }); };
  useEffect(() => { setBpmRef.current = setBpm; });
  const setTimeSig = (ts: typeof TIME_SIGS[number]) => { setTimeSigState(ts); song?.update({ meter: ts.label as Meter }); };
  const [seen, setSeen] = useState({ bpm: songBpm, meter: songMeter });
  if (seen.bpm !== songBpm || seen.meter !== songMeter) {
    setSeen({ bpm: songBpm, meter: songMeter });
    setBpmState(songBpm); setBpmInput(String(songBpm));
    setTimeSigState(TIME_SIGS.find(t => t.label === songMeter) ?? TIME_SIGS[0]);
  }
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
  // A pulse per click (drives the beat flash) and the speed trainer.
  const [pulse, setPulse] = useState(0);
  const [trainer, setTrainer] = useState<{ target: number } | null>(null);
  const trainerRef = useRef(trainer);
  useEffect(() => { trainerRef.current = trainer; }, [trainer]);
  const barRef = useRef(0);
  const setBpmRef = useRef<(v: number) => void>(() => {});

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
      const b = q.shift()!.beatNum;
      setBeat(b);
      setPulse(p => p + 1);
      // Speed trainer: every TRAIN_EVERY bars, nudge the tempo up until the target.
      if (b === 0) {
        barRef.current += 1;
        const tr = trainerRef.current;
        if (tr && barRef.current > 1 && (barRef.current - 1) % TRAIN_EVERY === 0 && bpmRef.current < tr.target) {
          const next = Math.min(tr.target, bpmRef.current + TRAIN_STEP);
          bpmRef.current = next;
          setBpmRef.current(next);
          setBpmInput(String(next));
        }
      }
    }
    visualRafRef.current = requestAnimationFrame(visualTick);
  }, []);

  const handleStartStop = useCallback(() => {
    if (playing) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setBeat(-1);
      setPlaying(false);
      releaseNowPlaying();
    } else {
      // Respond to the tap immediately (UI), then arm the scheduler once
      // the AudioContext is confirmed running. Set nextBeatTime to Infinity
      // so schedule() is a no-op until we arm it in the then().
      nextBeatTimeRef.current = Infinity;
      beatNumRef.current = 0;
      barRef.current = 0;
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

  // A beat square i lights up when the current tick is the i-th main beat
  const beatDotActive = (i: number) =>
    playing && beat === i * subdivision.clicksPerBeat;

  return (
    <NightStage on={night}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span className="su-label">{he ? 'מטרונום' : 'Metronome'} · {timeSig.label}</span>
        <NightToggle on={night} onToggle={toggleNight} />
      </div>

      {/* Giant tempo — type a number, or step it */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        <input
          type="number" min={40} max={240}
          value={bpmInput}
          onChange={e => setBpmInput(e.target.value)}
          onBlur={e => applyBpm(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && applyBpm(bpmInput)}
          aria-label={he ? 'טמפו (BPM)' : 'Tempo (BPM)'}
          className="su-poster"
          style={{
            display: 'block', width: '100%', textAlign: 'center', border: 'none',
            fontSize: desktop ? 300 : 'min(46vw, 210px)', height: '0.86em', lineHeight: 0.8,
            color: T.text, background: 'transparent', outline: 'none', padding: 0, boxSizing: 'border-box',
            MozAppearance: 'textfield',
          } as React.CSSProperties}
        />
        <div dir="ltr" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Pill onClick={() => adjustBpm(-1)} label={he ? 'איטי יותר' : 'Slower'} style={{ padding: 0, fontSize: 20 }}>‹</Pill>
          <span className="su-label" style={{ minWidth: 40, textAlign: 'center' }}>BPM</span>
          <Pill onClick={() => adjustBpm(1)} label={he ? 'מהיר יותר' : 'Faster'} style={{ padding: 0, fontSize: 20 }}>›</Pill>
        </div>
      </div>

      {/* Beat squares — beat 1 is the cobalt one */}
      <div dir="ltr" aria-hidden style={{ display: 'grid', gridTemplateColumns: `repeat(${timeSig.beats}, minmax(0, 1fr))`, gap: 6 }}>
        {Array.from({ length: timeSig.beats }).map((_, i) => {
          const on = beatDotActive(i);
          return (
            <div key={i} style={{
              height: desktop ? 72 : 56,
              background: on ? (i === 0 ? T.primary : T.secondary) : T.bgInput,
              outline: i === 0 && !on ? `2px solid ${T.text}` : undefined, outlineOffset: -2,
              transition: reduceMotion ? undefined : 'background 50ms, transform 50ms',
              transform: on && !reduceMotion ? 'scale(1.06)' : 'none',
            }} />
          );
        })}
      </div>
      {/* A flash per click — full on the downbeat, half on the others —
          draining over one beat, so subdivisions are seen as well as heard. */}
      {!reduceMotion && (
        <div style={{ height: 4, background: T.bgInput, overflow: 'hidden', marginTop: -10 }}>
          {playing && pulse > 0 && (
            <div key={pulse} className="gc-beat-drain" style={{
              height: '100%', background: T.text,
              width: beat === 0 ? '100%' : '55%', margin: '0 auto',
              animationDuration: `${60 / (bpm * subdivision.clicksPerBeat)}s`,
            }} />
          )}
        </div>
      )}

      {playing
        ? <Pill onClick={handleStartStop} style={{ width: '100%', height: 56 }}>{he ? 'עצירה' : 'Stop'}</Pill>
        : <Cta onClick={handleStartStop} style={{ width: '100%', height: 56 }}>{he ? 'התחלה' : 'Start'}</Cta>}

      <Rule label={he ? 'משקל' : 'Time'}>
        <PillRow items={TIME_SIGS.map(t => ({ id: t.label, label: t.label }))} value={timeSig.label}
          onChange={id => setTimeSig(TIME_SIGS.find(t => t.label === id)!)} label={he ? 'משקל' : 'Time signature'} />
      </Rule>

      <Rule label={he ? 'חלוקה' : 'Subdivision'}>
        <PillRow items={SUBDIVISIONS.map(sd => ({ id: String(sd.clicksPerBeat), label: he ? sd.he : sd.label }))}
          value={String(subdivision.clicksPerBeat)}
          onChange={id => setSubdivision(SUBDIVISIONS.find(sd => String(sd.clicksPerBeat) === id)!)} label={he ? 'חלוקה' : 'Subdivision'} />
      </Rule>

      <Rule label={he ? 'טמפו' : 'Tempo'}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Pill onClick={handleTap}>{he ? 'טאפ' : 'Tap'}</Pill>
          {/* Speed trainer — +4 BPM every 4 bars until the target */}
          <Pill active={!!trainer} onClick={() => setTrainer(t => (t ? null : { target: Math.min(240, bpm + 40) }))}>
            {trainer ? `${he ? 'מאמן מהירות' : 'Speed trainer'} → ${trainer.target}` : (he ? 'מאמן מהירות' : 'Speed trainer')}
          </Pill>
          {trainer && (
            <span dir="ltr" style={{ display: 'inline-flex', gap: 6 }}>
              <Pill onClick={() => setTrainer(t => t && { target: Math.max(bpm, t.target - 10) })} label={he ? 'הורדת היעד' : 'Lower target'} style={{ padding: 0 }}>−</Pill>
              <Pill onClick={() => setTrainer(t => t && { target: Math.min(240, t.target + 10) })} label={he ? 'העלאת היעד' : 'Raise target'} style={{ padding: 0 }}>+</Pill>
            </span>
          )}
        </div>
        {trainer && (
          <p style={{ margin: '8px 0 0', fontSize: 11, color: T.textMuted, fontFamily: 'var(--gc-mono)' }}>
            {he ? `+${TRAIN_STEP} BPM כל ${TRAIN_EVERY} תיבות עד ${trainer.target}` : `+${TRAIN_STEP} BPM every ${TRAIN_EVERY} bars until ${trainer.target}`}
          </p>
        )}
      </Rule>
    </NightStage>
  );
};
