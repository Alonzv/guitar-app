import { useCallback, useEffect, useRef, useState } from 'react';
import { getSharedContext, unlockAudio, setMicSession, clearMicSession } from '../utils/audioPlayback';
import { detectPitch } from '../utils/pitch';

// ── Notes played on the guitar ───────────────────────────────────────────────
// Listens to the microphone (the Tuner's YIN detector) and reports each note
// the player plays — once, when it has held steady for a few frames — so a
// practice question can be answered by playing instead of tapping.

const STEADY_FRAMES = 4;   // ~130ms of the same note before it counts

export function useMicNotes(onNote: (midi: number) => void) {
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState<number | null>(null);
  const [error, setError] = useState('');
  const cb = useRef(onNote);
  useEffect(() => { cb.current = onNote; }, [onNote]);

  const refs = useRef<{
    stream?: MediaStream; source?: MediaStreamAudioSourceNode; analyser?: AnalyserNode; sink?: GainNode;
    raf?: number; run: number[]; last: number | null; silent: number;
  }>({ run: [], last: null, silent: 0 });

  const tick = useCallback(() => {
    const r = refs.current;
    if (!r.analyser) return;
    const buf = new Float32Array(r.analyser.fftSize);
    r.analyser.getFloatTimeDomainData(buf);
    const { freq } = detectPitch(buf, getSharedContext().sampleRate, 1100);
    if (freq > 0) {
      const midi = Math.round(69 + 12 * Math.log2(freq / 440));
      r.silent = 0;
      r.run = [...r.run.slice(-(STEADY_FRAMES - 1)), midi];
      if (r.run.length === STEADY_FRAMES && r.run.every(m => m === midi) && midi !== r.last) {
        r.last = midi;
        setHeard(midi);
        cb.current(midi);
      }
    } else if (++r.silent > 10) {
      // A short silence lets the same note count again when it is replayed.
      r.run = []; r.last = null;
      setHeard(null);
    }
    r.raf = requestAnimationFrame(tick);
  }, []);

  const stop = useCallback(() => {
    const r = refs.current;
    if (r.raf) cancelAnimationFrame(r.raf);
    try { r.source?.disconnect(); } catch { /* ignore */ }
    try { r.analyser?.disconnect(); } catch { /* ignore */ }
    try { r.sink?.disconnect(); } catch { /* ignore */ }
    r.stream?.getTracks().forEach(t => t.stop());
    refs.current = { run: [], last: null, silent: 0 };
    clearMicSession();
    setListening(false); setHeard(null);
  }, []);

  const start = useCallback(async () => {
    setError('');
    try {
      setMicSession();
      const unlock = unlockAudio();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false,
      });
      await unlock;
      const ctx = getSharedContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0;
      source.connect(analyser);
      // Same as the Tuner: route through a muted gain so iOS actually pulls the mic.
      const sink = ctx.createGain();
      sink.gain.value = 0;
      analyser.connect(sink); sink.connect(ctx.destination);
      refs.current = { stream, source, analyser, sink, run: [], last: null, silent: 0 };
      setListening(true);
      refs.current.raf = requestAnimationFrame(tick);
    } catch (e) {
      const name = e instanceof Error ? e.name : '';
      setError(name === 'NotAllowedError' ? 'Microphone blocked — allow it in the browser to answer by playing.' : 'Could not open the microphone.');
    }
  }, [tick]);

  useEffect(() => stop, [stop]);

  return { listening, heard, error, start, stop, toggle: () => (listening ? stop() : start()) };
}
