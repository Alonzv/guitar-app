import React, { useState, useRef, useEffect, useCallback } from 'react';
import { T } from '../../theme';
import { useLang } from '../../contexts/LanguageContext';
import { useIsDesktop } from '../../hooks/useIsDesktop';
import { StopActions } from '../Transit/StopActions';
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

  // A word for the speed, so the number means something.
  const feel = bpm < 70 ? (he ? 'איטי' : 'Slow') : bpm < 105 ? (he ? 'בינוני' : 'Medium') : bpm < 140 ? (he ? 'קצבי' : 'Upbeat') : (he ? 'מהיר' : 'Fast');
  const label = (text: string) => <span style={{ fontSize: 13, fontWeight: 600, color: T.textMuted }}>{text}</span>;
  const chip = (on: boolean): React.CSSProperties => ({
    height: 40, padding: '0 16px', borderRadius: 20, fontSize: 15, fontWeight: 600,
    background: on ? T.text : 'rgba(255,255,255,0.08)', color: on ? '#000' : T.text,
  });

  return (
    <div className="su-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28, width: '100%', maxWidth: 560, margin: '0 auto' }}>
      {/* Time signature, in the glass toolbar */}
      <StopActions>
        <label className="lg" style={{ height: 44, borderRadius: 22, display: 'flex', alignItems: 'center', gap: 6, padding: '0 14px 0 16px', fontSize: 14, fontWeight: 600, position: 'relative' }}>
          <span dir="ltr">{timeSig.label}</span>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m6 9 6 6 6-6" /></svg>
          <select aria-label={he ? 'משקל' : 'Time signature'} value={timeSig.label}
            onChange={e => setTimeSig(TIME_SIGS.find(t => t.label === e.target.value)!)}
            style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%' }}>
            {TIME_SIGS.map(t => <option key={t.label} value={t.label}>{t.label}</option>)}
          </select>
        </label>
      </StopActions>

      {/* The tempo, readable from across the room — type a number, or step it */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, marginTop: desktop ? 8 : 0 }}>
        <input
          type="number" min={40} max={240}
          value={bpmInput}
          onChange={e => setBpmInput(e.target.value)}
          onBlur={e => applyBpm(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && applyBpm(bpmInput)}
          aria-label={he ? 'טמפו (BPM)' : 'Tempo (BPM)'}
          className="gc-notation"
          style={{
            display: 'block', width: '100%', textAlign: 'center', border: 'none',
            fontFamily: 'var(--su-display)', fontWeight: 700, letterSpacing: '-0.05em',
            fontSize: desktop ? 200 : 150, lineHeight: 1, height: desktop ? 200 : 152,
            color: T.text, background: 'transparent', outline: 'none', padding: 0, boxSizing: 'border-box',
            MozAppearance: 'textfield',
          } as React.CSSProperties}
        />
        <span style={{ fontSize: 17, color: T.textMuted }}>BPM · {feel}</span>
      </div>

      {/* Beat dots — beat 1 is the purple one */}
      <div dir="ltr" aria-hidden style={{ display: 'flex', justifyContent: 'center', gap: 14, flexWrap: 'wrap' }}>
        {Array.from({ length: timeSig.beats }).map((_, i) => {
          const on = beatDotActive(i);
          const size = desktop ? 30 : 24;
          return (
            <div key={i} style={{
              width: size, height: size, borderRadius: size / 2,
              background: on ? (i === 0 ? T.primary : T.text) : i === 0 ? T.primaryBg : 'rgba(255,255,255,0.12)',
              boxShadow: i === 0 && !on ? `inset 0 0 0 1.5px ${T.primary}` : undefined,
              transition: reduceMotion ? undefined : 'background 50ms, transform 80ms',
              transform: on && !reduceMotion ? 'scale(1.3)' : 'none',
            }} />
          );
        })}
      </div>
      {/* A flash per click — full on the downbeat, half on the others —
          draining over one beat, so subdivisions are seen as well as heard. */}
      {!reduceMotion && (
        <div style={{ width: '100%', maxWidth: 320, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)', overflow: 'hidden', marginTop: -14 }}>
          {playing && pulse > 0 && (
            <div key={pulse} className="gc-beat-drain" style={{
              height: '100%', borderRadius: 2, background: T.text,
              width: beat === 0 ? '100%' : '55%', margin: '0 auto',
              animationDuration: `${60 / (bpm * subdivision.clicksPerBeat)}s`,
            }} />
          )}
        </div>
      )}

      {/* Slower · Start · Faster */}
      <div dir="ltr" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <button onClick={() => adjustBpm(-1)} aria-label={he ? 'איטי יותר' : 'Slower'} className="lg lg-circle gc-no-bar" style={{ width: 52, height: 52, borderRadius: 26, fontSize: 24, color: T.text }}>−</button>
        <button onClick={handleStartStop} className="gc-no-bar"
          style={{ height: 56, minWidth: 168, padding: '0 28px', borderRadius: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, fontSize: 18, fontWeight: 600,
            background: playing ? 'rgba(255,255,255,0.10)' : T.text, color: playing ? T.text : '#000' }}>
          {playing
            ? <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden><rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor" /></svg>
            : <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden><path d="M7 4.5v15l13-7.5z" fill="currentColor" /></svg>}
          {playing ? (he ? 'עצירה' : 'Stop') : (he ? 'התחלה' : 'Start')}
        </button>
        <button onClick={() => adjustBpm(1)} aria-label={he ? 'מהיר יותר' : 'Faster'} className="lg lg-circle gc-no-bar" style={{ width: 52, height: 52, borderRadius: 26, fontSize: 24, color: T.text }}>+</button>
      </div>

      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {label(he ? 'כמה קליקים בכל פעמה' : 'Clicks per beat')}
          <div role="radiogroup" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {SUBDIVISIONS.map(sd => {
              const on = sd.clicksPerBeat === subdivision.clicksPerBeat;
              return <button key={sd.clicksPerBeat} role="radio" aria-checked={on} onClick={() => setSubdivision(sd)} className="gc-no-bar" style={chip(on)}>{he ? sd.he : sd.label}</button>;
            })}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={handleTap} className="gc-no-bar" style={{ ...chip(false), height: 50, borderRadius: 25, padding: '0 22px', fontSize: 16 }}>
            {he ? 'הקישו בקצב כדי לקבוע טמפו' : 'Tap along to set the tempo'}
          </button>
        </div>

        {/* Speed trainer: +4 BPM every 4 bars until the target */}
        <div style={{ borderRadius: 24, background: T.bgCard, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 16, fontWeight: 600 }}>{he ? 'מאמן מהירות' : 'Speed trainer'}</span>
              <span style={{ fontSize: 13, color: T.textMuted }}>
                {trainer
                  ? (he ? `מאיץ ב-${TRAIN_STEP} BPM כל ${TRAIN_EVERY} תיבות, עד ${trainer.target}` : `Speeds up ${TRAIN_STEP} BPM every ${TRAIN_EVERY} bars, up to ${trainer.target}`)
                  : (he ? 'מאיץ אתכם בהדרגה בזמן שאתם מנגנים' : 'Speeds you up little by little as you play')}
              </span>
            </span>
            <button role="switch" aria-checked={!!trainer} aria-label={he ? 'מאמן מהירות' : 'Speed trainer'}
              onClick={() => setTrainer(t => (t ? null : { target: Math.min(240, bpm + 40) }))} className="gc-no-bar"
              style={{ width: 51, height: 31, borderRadius: 16, padding: 2, background: trainer ? T.primary : 'rgba(255,255,255,0.16)', display: 'flex', justifyContent: trainer ? 'flex-end' : 'flex-start', transition: 'background 200ms ease', flex: 'none' }}>
              <span style={{ width: 27, height: 27, borderRadius: 14, background: '#fff', boxShadow: '0 2px 6px rgba(0,0,0,0.3)' }} />
            </button>
          </div>
          {trainer && (
            <div dir="ltr" style={{ display: 'flex', alignItems: 'center', gap: 10, alignSelf: he ? 'flex-end' : 'flex-start' }}>
              <button onClick={() => setTrainer(t => t && { target: Math.max(bpm, t.target - 10) })} aria-label={he ? 'הורדת היעד' : 'Lower target'} className="gc-no-bar" style={{ ...chip(false), width: 40, padding: 0 }}>−</button>
              <span style={{ fontSize: 15, fontWeight: 600, minWidth: 90, textAlign: 'center' }}>{he ? `יעד ${trainer.target}` : `Target ${trainer.target}`}</span>
              <button onClick={() => setTrainer(t => t && { target: Math.min(240, t.target + 10) })} aria-label={he ? 'העלאת היעד' : 'Raise target'} className="gc-no-bar" style={{ ...chip(false), width: 40, padding: 0 }}>+</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
