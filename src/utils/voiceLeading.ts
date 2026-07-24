import { Chord as TonalChord, Note, Interval } from '@tonaljs/tonal';

// ── Four-part voice leading ──────────────────────────────────────────────────
// Arrange a chord progression into four smooth voices (SATB-style), the way a
// guitarist would want to see it — note names, no staff. The bass always takes
// the root; the three upper voices hold common tones and otherwise move to the
// nearest chord tone. Triads double the root. A big jump in an upper voice is
// flagged (it works against smooth voice leading).

const LEAP = 4;   // an upper-voice move larger than this many semitones (a 4th+) counts as a leap

export interface VoiceCell { midi: number; note: string; deg: string; motion: number; leap: boolean }
export interface VoicedProgression { chords: string[]; voices: VoiceCell[][] }   // voices[0] = soprano (top)

function degLabel(iv: string): string {
  const it = Interval.get(iv);
  const num = it.num ?? 0;
  const alt = it.alt ?? 0;
  const acc = alt > 0 ? '#'.repeat(alt) : alt < 0 ? 'b'.repeat(-alt) : '';
  return `${acc}${num}`;
}

interface ChordData { rootPc: number; pcNote: Map<number, string>; pcDeg: Map<number, string>; notePcs: number[] }

function chordData(name: string): ChordData | null {
  const info = TonalChord.get(name);
  if (!info.tonic || !info.notes.length) return null;
  const rootPc = Note.chroma(info.tonic);
  if (rootPc == null) return null;
  const pcNote = new Map<number, string>();
  const pcDeg = new Map<number, string>();
  const notePcs: number[] = [];
  info.notes.forEach((n, i) => {
    const pc = Note.chroma(n);
    if (pc == null) return;
    if (!pcNote.has(pc)) { pcNote.set(pc, n); pcDeg.set(pc, degLabel(info.intervals[i] ?? '')); }
    notePcs.push(pc);
  });
  return { rootPc, pcNote, pcDeg, notePcs };
}

// The three upper voices' pitch-classes (non-bass), padded to 3 by doubling.
function upperPcs(d: ChordData): number[] {
  const order: Record<number, number> = { 3: 0, 7: 1, 6: 2, 5: 3, 9: 4, 4: 5, 2: 6, 11: 7, 13: 8 };
  const prio = (pc: number) => {
    const num = parseInt((d.pcDeg.get(pc) ?? '').replace(/[^0-9]/g, ''), 10) || 0;
    return order[num] ?? 9;
  };
  const nonRoot = [...new Set(d.notePcs.filter(pc => pc !== d.rootPc))].sort((a, b) => prio(a) - prio(b));
  const up = nonRoot.slice(0, 3);
  while (up.length < 3) up.push(d.rootPc);   // double the root (or fill) for triads
  return up;
}

const nearest = (pc: number, ref: number): number => {
  let best = pc, bd = Infinity;
  for (let m = pc - 24; m <= pc + 96; m += 12) { const dd = Math.abs(m - ref); if (dd < bd) { bd = dd; best = m; } }
  return best;
};
const nearestAbove = (pc: number, min: number): number => {
  let m = pc;
  while (m < min) m += 12;
  return m;
};

const cell = (d: ChordData, midi: number, motion: number, isUpper: boolean): VoiceCell => {
  const pc = ((midi % 12) + 12) % 12;
  return {
    midi,
    note: d.pcNote.get(pc) ?? Note.fromMidi(midi),
    deg: d.pcDeg.get(pc) ?? '',
    motion,
    leap: isUpper && Math.abs(motion) > LEAP,
  };
};

export function voiceLead(chordNames: string[]): VoicedProgression {
  const datas = chordNames.map(chordData);
  // Four voices, bottom-up: index 0 = bass, 1..3 = upper. We flip for output.
  const bass: VoiceCell[] = [];
  const up: [VoiceCell[], VoiceCell[], VoiceCell[]] = [[], [], []];
  let prevBass = 45;
  let prevUp: [number, number, number] = [0, 0, 0];

  datas.forEach((d, k) => {
    if (!d) {   // unparseable chord — repeat previous pitches as a fallback
      const dummy: ChordData = { rootPc: 0, pcNote: new Map(), pcDeg: new Map(), notePcs: [] };
      bass.push(cell(dummy, prevBass, 0, false));
      up.forEach((v, i) => v.push(cell(dummy, prevUp[i], 0, true)));
      return;
    }
    const bMidi = k === 0 ? nearest(d.rootPc, 45) : nearest(d.rootPc, prevBass);
    bass.push(cell(d, bMidi, k === 0 ? 0 : bMidi - prevBass, false));

    const targets = upperPcs(d);
    let newUp: [number, number, number];
    if (k === 0) {
      // close position: stack the upper voices ascending just above the bass
      const asc = [...targets].sort((a, b) => nearestAbove(a, bMidi + 1) - nearestAbove(b, bMidi + 1));
      let cursor = bMidi;
      const stack = asc.map(pc => { const m = nearestAbove(pc, cursor + 1); cursor = m; return m; });
      newUp = [stack[0], stack[1], stack[2]];
    } else {
      // assign the 3 target pcs to the 3 upper voices, minimising total motion
      const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
      let best = perms[0], bestCost = Infinity, bestMidis: number[] = [];
      for (const perm of perms) {
        const midis = perm.map((ti, vi) => nearest(targets[ti], prevUp[vi]));
        const cost = midis.reduce((s, m, vi) => s + Math.abs(m - prevUp[vi]), 0);
        if (cost < bestCost) { bestCost = cost; best = perm; bestMidis = midis; }
      }
      void best;
      newUp = [bestMidis[0], bestMidis[1], bestMidis[2]];
    }
    up.forEach((v, i) => v.push(cell(d, newUp[i], k === 0 ? 0 : newUp[i] - prevUp[i], true)));
    prevBass = bMidi;
    prevUp = newUp;
  });

  // Output ordered soprano(top) → bass(bottom): sort the three upper voices by
  // their first-chord pitch (descending), then the bass.
  const order = [0, 1, 2].sort((a, b) => (up[b][0]?.midi ?? 0) - (up[a][0]?.midi ?? 0));
  const voices = [...order.map(i => up[i]), bass];
  return { chords: chordNames, voices };
}
