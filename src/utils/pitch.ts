// ── Pitch detection ──────────────────────────────────────────────────────────
// Shared by the Tuner and by practice answers played on the guitar. maxFreq
// is 400 Hz for tuning open strings; melody notes go higher.

export interface PitchResult { freq: number; confidence: number }

/**
 * YIN pitch detection algorithm.
 * de Cheveigné & Kawahara (2002) — the gold standard for monophonic pitch.
 * Fixes the normalisation bug in the old autocorrelation approach that caused
 * it to systematically prefer higher-frequency (wrong) readings.
 */
export function detectPitch(buf: Float32Array, sampleRate: number, maxFreq = 400): PitchResult {
  const W = 1024; // analysis window — ~2 periods of low-E at 82 Hz

  // RMS silence gate
  let rms = 0;
  for (let i = 0; i < W; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / W);
  if (rms < 0.01) return { freq: -1, confidence: 0 };

  // Guitar range: 55 Hz (A1, below drop-D) → 400 Hz (above high-E)
  const tauMin = Math.floor(sampleRate / maxFreq);
  const tauMax = Math.min(
    Math.ceil(sampleRate / 55),
    buf.length - W - 1,
  );
  if (tauMin >= tauMax) return { freq: -1, confidence: 0 };

  // Step 1 — squared difference function d(tau)
  const d = new Float32Array(tauMax + 1);
  for (let tau = 1; tau <= tauMax; tau++) {
    for (let j = 0; j < W; j++) {
      const delta = buf[j] - buf[j + tau];
      d[tau] += delta * delta;
    }
  }

  // Step 2 — cumulative mean normalised difference (CMNDF)
  const cmndf = new Float32Array(tauMax + 1);
  cmndf[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    runningSum += d[tau];
    cmndf[tau] = runningSum > 0 ? (d[tau] * tau) / runningSum : 1;
  }

  // Step 3 — first local minimum below threshold
  const THRESHOLD = 0.12;
  let bestTau = -1;
  let tau = tauMin;

  while (tau < tauMax - 1) {
    if (cmndf[tau] < THRESHOLD) {
      while (tau + 1 < tauMax && cmndf[tau + 1] < cmndf[tau]) tau++;
      bestTau = tau;
      break;
    }
    tau++;
  }

  if (bestTau < 0) {
    let minVal = 1;
    for (let t = tauMin; t < tauMax; t++) {
      if (cmndf[t] < minVal) { minVal = cmndf[t]; bestTau = t; }
    }
    return { freq: -1, confidence: Math.max(0, 1 - minVal) };
  }

  // Step 4 — parabolic interpolation
  let refinedTau = bestTau;
  if (bestTau > tauMin && bestTau < tauMax - 1) {
    const s0 = cmndf[bestTau - 1];
    const s1 = cmndf[bestTau];
    const s2 = cmndf[bestTau + 1];
    const denom = 2 * (s0 - 2 * s1 + s2);
    if (Math.abs(denom) > 1e-10) {
      const frac = (s0 - s2) / denom;
      refinedTau = bestTau + Math.max(-0.5, Math.min(0.5, frac));
    }
  }

  return {
    freq: sampleRate / refinedTau,
    confidence: 1 - cmndf[bestTau],
  };
}

