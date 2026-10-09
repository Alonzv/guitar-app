import { playError, unlockAudio, getSharedContext, getOutputNode } from '../utils/audioPlayback';
import { shake } from '../motion';
import { recordSolved } from './daily';

// ── Answer feedback ──────────────────────────────────────────────────────────
// What every Practice tab does on an answer, in one place: a right answer
// rings a short rising chime and counts toward today's goal; a wrong one
// buzzes, shakes the answer area and buzzes the phone.

export function answeredRight(): void {
  recordSolved();
  chime();
}

export function answeredWrong(area?: Element | null): void {
  playError();
  navigator.vibrate?.(30);
  shake(area);
}

/** Two quick rising notes — a perfect fifth, bright and short. */
export function chime(): void {
  unlockAudio().then(() => {
    const ctx = getSharedContext();
    const t0 = ctx.currentTime + 0.02;
    [76, 83].forEach((midi, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
      const t = t0 + i * 0.09;
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.12, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.connect(gain); gain.connect(getOutputNode());
      osc.start(t); osc.stop(t + 0.4);
    });
  });
}
