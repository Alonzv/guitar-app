import { useEffect, useRef, useState } from 'react';
import type { VoicedProgression } from '../../utils/voiceLeading';
import { T } from '../../theme';
import { toDisplayChord } from '../../utils/chordName';

// ── Voice chart ──────────────────────────────────────────────────────────────
// The four voices drawn as lines through their notes, one column per chord,
// across the full width. Each note is a dot with its name in it (the neck's
// own mark): ink, the column sounding now cobalt. Height is pitch, so a flat
// line is a held common tone, a short slope a step and a dashed one a leap.
// Tap a line or a dot to follow that voice; the others fade.

const HEAD = 62;        // chord name + Roman numeral above the columns
const R = 15;           // note dot radius
const MIN_COL = 96;     // narrowest column before the chart scrolls

export interface ChartChord { roman?: string; diatonic?: boolean }

export function VoiceChart({ result, chords, playCol, selVoice, selDeg, degOf, onPickVoice, warn, voiceLabel }: {
  result: VoicedProgression;
  chords: ChartChord[];
  playCol: number | null;
  selVoice: number | null;
  selDeg: number | null;
  degOf: (deg: string) => number;
  onPickVoice: (vi: number) => void;
  warn: string;
  voiceLabel: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = result.chords.length;
  const W = Math.max(boxW, n * MIN_COL);
  const col = W / Math.max(n, 1);
  const all = result.voices.flat().map(c => c.midi);
  const lo = Math.min(...all), hi = Math.max(...all);
  const span = Math.max(hi - lo, 1);
  // ~11px a semitone, so voices a third apart never touch; clamped.
  const body = Math.max(200, Math.min(360, span * 11 + 2 * R + 16));
  const H = HEAD + body;
  const x = (ci: number) => ci * col + col / 2;
  const y = (m: number) => HEAD + R + 8 + (body - 2 * R - 16) * (1 - (m - lo) / span);

  const faded = (vi: number, deg: string) =>
    (selVoice != null && selVoice !== vi) || (selDeg != null && degOf(deg) !== selDeg);

  return (
    <div ref={box} dir="ltr" style={{ overflowX: 'auto', borderTop: `var(--su-rule) solid ${T.border}`, borderBottom: `var(--su-rule) solid ${T.border}` }}>
      {boxW > 0 && (
        <svg width={W} height={H} role="group" aria-label={voiceLabel} style={{ display: 'block' }}>
          {/* Columns: the chord, its Roman numeral, a hairline between them */}
          {result.chords.map((name, ci) => {
            const now = ci === playCol;
            const an = chords[ci];
            return (
              <g key={ci}>
                {now && <rect x={ci * col} y={0} width={col} height={H} fill={T.primary} opacity={0.07} />}
                {ci > 0 && <line x1={ci * col} y1={0} x2={ci * col} y2={H} stroke={T.hairline} strokeWidth={1} />}
                <text x={x(ci)} y={30} textAnchor="middle" fontFamily="var(--su-display)" fontWeight={800} fontSize={24}
                  style={{ fontStretch: '75%' }} fill={now ? T.primary : T.text}>{toDisplayChord(name)}</text>
                {an?.roman && (
                  <text x={x(ci)} y={48} textAnchor="middle" fontFamily="var(--gc-mono)" fontSize={11} fontWeight={700}
                    letterSpacing="0.06em" fill={an.diatonic === false ? T.text : T.textMuted}>
                    {an.roman}{an.diatonic === false ? ` ${warn}` : ''}
                  </text>
                )}
              </g>
            );
          })}
          <line x1={0} y1={HEAD - 4} x2={W} y2={HEAD - 4} stroke={T.border} strokeWidth={2} />

          {/* Voices, lowest first so the soprano draws on top */}
          {[...result.voices.keys()].reverse().map(vi => {
            const voice = result.voices[vi];
            const on = selVoice === vi;
            const dim = selVoice != null && !on;
            return (
              <g key={vi} onClick={() => onPickVoice(vi)} style={{ cursor: 'pointer' }}>
                {voice.slice(1).map((cell, k) => {
                  const ci = k + 1;
                  return (
                    <line key={ci} x1={x(ci - 1)} y1={y(voice[ci - 1].midi)} x2={x(ci)} y2={y(cell.midi)}
                      stroke={T.text} strokeWidth={on ? 4 : 2.2} opacity={dim ? 0.18 : 1}
                      strokeDasharray={cell.leap ? '6 5' : undefined}
                      style={{ transition: 'opacity var(--gc-dur-base) var(--gc-ease-out)' }} />
                  );
                })}
                {/* a wide invisible stroke so the line is easy to tap */}
                <polyline points={voice.map((c, ci) => `${x(ci)},${y(c.midi)}`).join(' ')} fill="none" stroke="transparent" strokeWidth={18} />
                {voice.map((cell, ci) => {
                  const now = ci === playCol;
                  const fade = faded(vi, cell.deg);
                  return (
                    <g key={ci} role="button" tabIndex={0} aria-label={`${voiceLabel} ${vi + 1}: ${cell.note} (${cell.deg})`}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPickVoice(vi); } }}
                      style={{ opacity: fade ? 0.2 : 1, transition: 'opacity var(--gc-dur-base) var(--gc-ease-out)' }}>
                      <title>{`${cell.note} · ${cell.deg}`}</title>
                      <circle cx={x(ci)} cy={y(cell.midi)} r={R} fill={now ? T.primary : T.secondary} stroke={T.bgDeep} strokeWidth={2} />
                      <text x={x(ci)} y={y(cell.midi) + 4} textAnchor="middle" fontFamily="var(--gc-mono)" fontWeight={700}
                        fontSize={cell.note.length > 2 ? 9 : 11} fill={now ? T.onPrimary : T.white}>{cell.note}</text>
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
