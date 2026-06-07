import { Chord as TonalChord, Note as TonalNote } from '@tonaljs/tonal';
import type { FretPosition } from '../types/music';
import { fretToNote, TUNINGS } from './musicTheory';

export type VoicingGenre = 'any' | 'americana' | 'swamp' | 'neo-soul' | 'blues' | 'rock' | 'country';
export type VoicingMode = 'full' | 'triads';
export type StringGroup = 'all' | 'bass' | 'treble';

export interface VoicingPath {
  id: string;
  voicings: FretPosition[][];
  label: string;
  avgFret: number;
  description: string;
  smoothness: number; // 0–5
}

export interface PathOptions {
  genre: VoicingGenre;
  mode: VoicingMode;
  stringGroup: StringGroup;
  tuning?: string[];
  pathCount?: number;
}

// ── Genre hard constraints ─────────────────────────────────────────────────

interface GenreConstraints {
  allowOpen: boolean;       // false → filter out voicings that use open strings
  requireOpen: boolean;     // true  → filter out voicings with NO open strings
  minNotes: number;
  maxNotes: number;
  maxFret: number;          // non-open notes must not exceed this fret
  transitionWeight: number; // multiplier on voice-leading cost
}

const GC: Record<VoicingGenre, GenreConstraints> = {
  any:       { allowOpen: true,  requireOpen: false, minNotes: 4, maxNotes: 6, maxFret: 12, transitionWeight: 1.0 },
  americana: { allowOpen: true,  requireOpen: true,  minNotes: 3, maxNotes: 6, maxFret: 12, transitionWeight: 1.0 },
  swamp:     { allowOpen: true,  requireOpen: false, minNotes: 3, maxNotes: 4, maxFret:  7, transitionWeight: 0.7 },
  'neo-soul':{ allowOpen: true,  requireOpen: false, minNotes: 4, maxNotes: 6, maxFret: 12, transitionWeight: 2.5 },
  blues:     { allowOpen: true,  requireOpen: false, minNotes: 3, maxNotes: 6, maxFret: 12, transitionWeight: 1.0 },
  rock:      { allowOpen: false, requireOpen: false, minNotes: 4, maxNotes: 6, maxFret: 12, transitionWeight: 1.0 },
  country:   { allowOpen: true,  requireOpen: true,  minNotes: 3, maxNotes: 5, maxFret:  5, transitionWeight: 0.8 },
};

const STRING_GROUPS: Record<StringGroup, number[]> = {
  all:    [0, 1, 2, 3, 4, 5],
  bass:   [0, 1, 2],
  treble: [3, 4, 5],
};

// ── Low-level helpers ──────────────────────────────────────────────────────

function samePitch(a: string, b: string): boolean {
  const ca = TonalNote.chroma(a);
  const cb = TonalNote.chroma(b);
  return ca != null && cb != null && ca === cb;
}

function noteInChord(note: string, chordNotes: string[]): boolean {
  return chordNotes.some(cn => samePitch(note, cn));
}

function avgNonOpenFret(voicing: FretPosition[]): number {
  const nonOpen = voicing.filter(p => p.fret > 0);
  if (!nonOpen.length) return 0;
  return nonOpen.reduce((s, p) => s + p.fret, 0) / nonOpen.length;
}

function isPlayable(voicing: FretPosition[]): boolean {
  if (voicing.length < 3) return false;
  const nonOpen = voicing.filter(p => p.fret > 0);
  if (nonOpen.length === 0) return true;

  const frets   = nonOpen.map(p => p.fret);
  const minFret = Math.min(...frets);
  const maxFret = Math.max(...frets);

  // Index barre at minFret covers that fret; remaining fingers cover notes above it.
  if (maxFret - minFret > 3) return false;

  // Count fingers needed for notes above the barre fret.
  // Consecutive strings at the same fret share one finger; each gap breaks a barre.
  const aboveMin = nonOpen.filter(p => p.fret > minFret);
  const byFret = new Map<number, number[]>();
  for (const p of aboveMin) {
    if (!byFret.has(p.fret)) byFret.set(p.fret, []);
    byFret.get(p.fret)!.push(p.string);
  }

  let extraFingers = 0;
  for (const strings of byFret.values()) {
    const sorted = [...strings].sort((a, b) => a - b);
    let j = 0;
    while (j < sorted.length) {
      let end = j;
      while (end + 1 < sorted.length && sorted[end + 1] === sorted[end] + 1) end++;
      extraFingers++;
      j = end + 1;
    }
  }
  if (extraFingers > 3) return false;

  // If above-barre notes span more than 3 strings at different frets, unreachable.
  if (aboveMin.length >= 2) {
    const minStr    = Math.min(...aboveMin.map(p => p.string));
    const maxStr    = Math.max(...aboveMin.map(p => p.string));
    const multiFret = new Set(aboveMin.map(p => p.fret)).size > 1;
    if (maxStr - minStr > 3 && multiFret) return false;
  }

  return true;
}

// ── Genre constraint filter ────────────────────────────────────────────────

function applyGenreFilter(voicings: FretPosition[][], gc: GenreConstraints): FretPosition[][] {
  const filtered = voicings.filter(v => {
    const hasOpen = v.some(p => p.fret === 0);
    if (!gc.allowOpen && hasOpen) return false;
    if (gc.requireOpen && !hasOpen) return false;
    if (v.length < gc.minNotes || v.length > gc.maxNotes) return false;
    const nonOpen = v.filter(p => p.fret > 0);
    if (nonOpen.length > 0 && Math.max(...nonOpen.map(p => p.fret)) > gc.maxFret) return false;
    return true;
  });
  // Graceful relaxation: loosen requireOpen first, then everything
  if (filtered.length === 0 && gc.requireOpen) return applyGenreFilter(voicings, { ...gc, requireOpen: false });
  if (filtered.length === 0) return voicings;
  return filtered;
}

// ── Voice-leading cost ─────────────────────────────────────────────────────

function transitionCost(a: FretPosition[], b: FretPosition[]): number {
  const aMap = new Map(a.map(p => [p.string, p.fret]));
  const bMap = new Map(b.map(p => [p.string, p.fret]));
  let movement = 0;
  let shared = 0;
  for (const [s, fa] of aMap) {
    if (bMap.has(s)) {
      shared++;
      movement += Math.abs(fa - bMap.get(s)!);
    }
  }
  const overlap = shared / Math.max(a.length, b.length);
  return movement + (1 - overlap) * 6;
}

// ── Genre-aware voicing scorer ─────────────────────────────────────────────
// Returns a negative value — lower total cost = better path.

function genreCost(voicing: FretPosition[], chordName: string, genre: VoicingGenre): number {
  const openCount  = voicing.filter(p => p.fret === 0).length;
  const avg        = avgNonOpenFret(voicing);
  const lowStr     = voicing.filter(p => p.string <= 2).length;
  const highStr    = voicing.filter(p => p.string >= 3).length;
  const hasDrone   = openCount > 0 && avg > 4; // open drone + fretted note high up
  const isDom7     = chordName.includes('7') && !chordName.includes('maj7');
  const isExtended = chordName.includes('7') || chordName.includes('9') || chordName.includes('11') || chordName.includes('13');

  switch (genre) {
    case 'americana':
      // Best: open strings + fretted notes high up the neck (pedal-steel effect)
      return -(openCount * 4 + (hasDrone ? 8 : 0) + (openCount > 0 ? 3 : 0));

    case 'swamp':
      // Best: low strings, lean chord (3-4 notes), no bright high-string content
      return -(lowStr * 4 + (voicing.length <= 4 ? 4 : -5) + (highStr === 0 ? 4 : -highStr * 3));

    case 'neo-soul':
      // Best: extended chords, more notes, high-register strings, ultra-smooth
      return -(voicing.length * 2 + highStr * 2.5 + (isExtended ? 5 : 0));

    case 'blues':
      // Best: dominant 7th shapes, movable (no open strings for barre positions)
      return -(isDom7 ? 7 : 0) - (openCount === 0 ? 4 : 0) - (avg >= 3 && avg <= 9 ? 2 : 0);

    case 'rock':
      // Best: no open strings, full barre shapes, punchy
      return -(openCount === 0 ? 8 : 0) - Math.min(voicing.length, 6) * 1;

    case 'country':
      // Best: open position, open strings, bright voicings
      return -(openCount * 3 + (avg <= 3 ? 6 : avg <= 5 ? 2 : 0));

    default:
      return 0;
  }
}

// ── Candidate generation ───────────────────────────────────────────────────

function generateFullCandidates(
  chordName: string,
  allowedStrings: number[],
  tuning: string[],
): FretPosition[][] {
  const info = TonalChord.get(chordName);
  const chordNotes = info.notes;
  if (chordNotes.length < 2) return [];

  const minStrings = Math.min(allowedStrings.length, 4);
  const required = chordNotes.length <= 3
    ? chordNotes
    : [chordNotes[0], chordNotes[1], chordNotes[chordNotes.length - 1]];

  const voicings: FretPosition[][] = [];
  const fallback: FretPosition[][] = [];
  const seen = new Set<string>();
  const seenFb = new Set<string>();

  for (let startFret = 0; startFret <= 12; startFret++) {
    const windowMax = Math.min(startFret + 4, 12);
    const voicing: FretPosition[] = [];

    for (const s of allowedStrings) {
      for (let f = startFret; f <= windowMax; f++) {
        if (noteInChord(fretToNote(s, f, tuning), chordNotes)) {
          voicing.push({ string: s, fret: f });
          break;
        }
      }
    }

    const covers = required.every(rn =>
      voicing.some(p => samePitch(fretToNote(p.string, p.fret, tuning), rn))
    );

    if (voicing.length >= minStrings && isPlayable(voicing)) {
      const hash = voicing.map(p => `${p.string}:${p.fret}`).join(',');
      if (covers) {
        if (!seen.has(hash)) { seen.add(hash); voicings.push([...voicing]); }
      } else {
        if (!seenFb.has(hash)) { seenFb.add(hash); fallback.push([...voicing]); }
      }
    }
  }

  return voicings.length > 0 ? voicings : fallback;
}

function generateTriadCandidates(
  chordName: string,
  allowedStrings: number[],
  tuning: string[],
): FretPosition[][] {
  const info = TonalChord.get(chordName);
  const chordNotes = info.notes;
  if (chordNotes.length < 3) return [];

  const triadNotes = [chordNotes[0], chordNotes[1], chordNotes[2]];
  const voicings: FretPosition[][] = [];
  const seen = new Set<string>();

  for (let si = 0; si <= allowedStrings.length - 3; si++) {
    const strings = [allowedStrings[si], allowedStrings[si + 1], allowedStrings[si + 2]];

    for (let startFret = 0; startFret <= 12; startFret++) {
      const voicing: FretPosition[] = [];
      let valid = true;

      for (const s of strings) {
        let placed = false;
        for (let f = startFret; f <= Math.min(startFret + 4, 12); f++) {
          if (triadNotes.some(n => samePitch(n, fretToNote(s, f, tuning)))) {
            voicing.push({ string: s, fret: f });
            placed = true;
            break;
          }
        }
        if (!placed) { valid = false; break; }
      }

      if (valid && voicing.length === 3 && isPlayable(voicing)) {
        const hash = voicing.map(p => `${p.string}:${p.fret}`).join(',');
        if (!seen.has(hash)) { seen.add(hash); voicings.push([...voicing]); }
      }
    }
  }

  return voicings;
}

// ── Path metadata ──────────────────────────────────────────────────────────

function pathLabel(avg: number, openCount: number): string {
  if (openCount >= 2) return 'Open Drones';
  if (avg <= 1.5)     return 'Open Position';
  if (avg <= 4)       return 'Lower Neck';
  if (avg <= 7)       return 'Mid Neck';
  if (avg <= 9.5)     return 'Upper Neck';
  return 'High Neck';
}

function computeCommonTones(voicings: FretPosition[][]): number {
  if (voicings.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < voicings.length; i++) {
    const prevSet = new Set(voicings[i - 1].map(p => `${p.string}:${p.fret}`));
    total += voicings[i].filter(p => prevSet.has(`${p.string}:${p.fret}`)).length;
  }
  return total / (voicings.length - 1);
}

function computeSmoothness(rawCost: number, chordCount: number): number {
  const perChord = rawCost / Math.max(chordCount - 1, 1);
  return Math.max(0, Math.min(5, Math.round(5 - perChord * 0.4)));
}

function generateDescription(
  genre: VoicingGenre,
  avg: number,
  openCount: number,
  commonTones: number,
  chordCount: number,
): string {
  const hasDrone  = openCount >= chordCount;
  const smLabel   = commonTones >= 1.5 ? 'silky smooth' : commonTones >= 0.5 ? 'smooth' : 'wide-leaping';
  const pos       = avg <= 2 ? 'open position' : avg <= 5 ? 'lower neck' : avg <= 8 ? 'mid neck' : 'upper neck';

  switch (genre) {
    case 'americana':
      return hasDrone
        ? 'Open strings drone while fretted notes ring above — wide, cinematic, like a resonator guitar'
        : 'First-position resonance — natural sustain with open-string coloring';
    case 'swamp':
      return 'Lean, dark shapes on the low strings — 3-4 notes, raw texture. Dig in hard';
    case 'neo-soul':
      return `Extended ${chordCount}-chord harmony in ${pos} — ${smLabel} voice leading, every note earns its place`;
    case 'blues':
      return avg <= 3
        ? 'Open-position dominant shapes — the classic I-IV-V feel with built-in grit'
        : `Movable dominant barre shapes at ${Math.round(avg)}fr — slide-ready and authentic`;
    case 'rock':
      return `Full barre shapes, zero open strings — locked-in ${pos} punch, mix-ready`;
    case 'country':
      return hasDrone
        ? 'Open-position brightness — classic Travis-picking territory, crystal clear'
        : `First-position clarity — open-chord country sound`;
    default:
      return `${pos.charAt(0).toUpperCase() + pos.slice(1)} — ${smLabel} transitions with ${Math.round(commonTones * 10) / 10} avg common tones`;
  }
}

// ── Main export ────────────────────────────────────────────────────────────

export function findVoicingPaths(
  chordNames: string[],
  options: PathOptions,
): VoicingPath[] {
  if (!chordNames.length) return [];

  const tuning    = options.tuning ?? TUNINGS[0].notes;
  const allowed   = STRING_GROUPS[options.stringGroup];
  const pathCount = options.pathCount ?? 5;
  const gc        = GC[options.genre];
  const generate  = options.mode === 'triads' ? generateTriadCandidates : generateFullCandidates;

  // For each chord: generate candidates then apply genre filter
  const candidatesPerChord = chordNames.map(name => {
    const raw = generate(name, allowed, tuning);
    return applyGenreFilter(raw, gc);
  });

  if (candidatesPerChord.some(c => !c.length)) return [];

  const BEAM = 80;
  type B = { vi: number; cost: number; trail: number[] };

  let beams: B[] = candidatesPerChord[0].map((v, vi) => ({
    vi, cost: genreCost(v, chordNames[0], options.genre), trail: [vi],
  }));

  for (let ci = 1; ci < chordNames.length; ci++) {
    const next: B[] = [];
    for (const b of beams) {
      const prev = candidatesPerChord[ci - 1][b.vi];
      for (let vi = 0; vi < candidatesPerChord[ci].length; vi++) {
        const curr = candidatesPerChord[ci][vi];
        next.push({
          vi,
          cost: b.cost + transitionCost(prev, curr) * gc.transitionWeight + genreCost(curr, chordNames[ci], options.genre),
          trail: [...b.trail, vi],
        });
      }
    }
    next.sort((a, b) => a.cost - b.cost);
    beams = next.slice(0, BEAM);
  }

  beams.sort((a, b) => a.cost - b.cost);

  const full = beams.map(b => {
    const voicings  = b.trail.map((vi, ci) => candidatesPerChord[ci][vi]);
    const pathAvg   = voicings.reduce((s, v) => s + avgNonOpenFret(v), 0) / voicings.length;
    const openCount = voicings.reduce((s, v) => s + v.filter(p => p.fret === 0).length, 0);
    const ct        = computeCommonTones(voicings);
    const smooth    = computeSmoothness(b.cost, chordNames.length);
    return { voicings, cost: b.cost, pathAvg, openCount, ct, smooth };
  });

  const zoneOf = (avg: number, open: number) => {
    if (open >= 3)  return 'drone';
    if (avg <= 2)   return 'open';
    if (avg <= 5)   return 'low';
    if (avg <= 8)   return 'mid';
    return 'high';
  };

  const result: VoicingPath[] = [];
  const usedZones = new Set<string>();

  const push = (p: typeof full[number]) => {
    const label = pathLabel(p.pathAvg, p.openCount);
    const desc  = generateDescription(options.genre, p.pathAvg, p.openCount, p.ct, chordNames.length);
    result.push({ id: `path-${result.length}`, voicings: p.voicings, label, avgFret: p.pathAvg, description: desc, smoothness: p.smooth });
  };

  for (const p of full) {
    if (result.length >= pathCount) break;
    const z = zoneOf(p.pathAvg, p.openCount);
    if (!usedZones.has(z)) { usedZones.add(z); push(p); }
  }

  const usedLabels = new Set(result.map(r => r.label));

  for (const p of full) {
    if (result.length >= pathCount) break;
    const baseLabel = pathLabel(p.pathAvg, p.openCount);
    if (usedLabels.has(baseLabel)) continue;
    const dup = result.some(r =>
      r.voicings.every((v, ci) =>
        v.length === p.voicings[ci].length &&
        v.every((pos, pi) => pos.fret === p.voicings[ci][pi]?.fret && pos.string === p.voicings[ci][pi]?.string)
      )
    );
    if (!dup) { usedLabels.add(baseLabel); push(p); }
  }

  return result;
}
