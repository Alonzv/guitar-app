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
}

export interface PathOptions {
  genre: VoicingGenre;
  mode: VoicingMode;
  stringGroup: StringGroup;
  tuning?: string[];
  pathCount?: number;
}

const STRING_GROUPS: Record<StringGroup, number[]> = {
  all:    [0, 1, 2, 3, 4, 5],
  bass:   [0, 1, 2],
  treble: [3, 4, 5],
};

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
  if (nonOpen.length > 1) {
    const frets = nonOpen.map(p => p.fret);
    if (Math.max(...frets) - Math.min(...frets) > 4) return false;
  }
  return true;
}

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

function genreCost(voicing: FretPosition[], chordName: string, genre: VoicingGenre): number {
  const openCount  = voicing.filter(p => p.fret === 0).length;
  const avg        = avgNonOpenFret(voicing);
  const lowStr     = voicing.filter(p => p.string <= 2).length;
  const highStr    = voicing.filter(p => p.string >= 3).length;

  switch (genre) {
    case 'americana':
      return -(openCount * 3 + (openCount > 0 && avg > 3 ? 4 : 0));
    case 'swamp':
      return -(lowStr * 3 + (voicing.length <= 4 ? 2 : -2));
    case 'neo-soul':
      return -(voicing.length * 1.5 + highStr * 2);
    case 'blues':
      return -((chordName.includes('7') && !chordName.includes('maj7')) ? 5 : 0) - (openCount === 0 ? 2 : 0);
    case 'rock':
      return -(openCount === 0 ? 4 : 0) - Math.min(voicing.length, 5) * 0.5;
    case 'country':
      return -(openCount * 2 + (avg <= 3 ? 5 : 0));
    default:
      return 0;
  }
}

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
  const seen = new Set<string>();

  for (let startFret = 0; startFret <= 12; startFret++) {
    const windowMax = Math.min(startFret + 4, 12);
    const voicing: FretPosition[] = [];

    for (const s of allowedStrings) {
      for (let f = startFret; f <= windowMax; f++) {
        const note = fretToNote(s, f, tuning);
        if (noteInChord(note, chordNotes)) {
          voicing.push({ string: s, fret: f });
          break;
        }
      }
    }

    const covers = required.every(rn =>
      voicing.some(p => samePitch(fretToNote(p.string, p.fret, tuning), rn))
    );

    if (voicing.length >= minStrings && covers && isPlayable(voicing)) {
      const hash = voicing.map(p => `${p.string}:${p.fret}`).join(',');
      if (!seen.has(hash)) {
        seen.add(hash);
        voicings.push([...voicing]);
      }
    }
  }

  return voicings;
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
          const note = fretToNote(s, f, tuning);
          if (triadNotes.some(n => samePitch(n, note))) {
            voicing.push({ string: s, fret: f });
            placed = true;
            break;
          }
        }
        if (!placed) { valid = false; break; }
      }

      if (valid && voicing.length === 3 && isPlayable(voicing)) {
        const hash = voicing.map(p => `${p.string}:${p.fret}`).join(',');
        if (!seen.has(hash)) {
          seen.add(hash);
          voicings.push([...voicing]);
        }
      }
    }
  }

  return voicings;
}

function pathLabel(avg: number, openCount: number): string {
  if (openCount >= 2) return 'Open Drones';
  if (avg <= 1.5)     return 'Open Position';
  if (avg <= 4)       return 'Lower Neck';
  if (avg <= 7)       return 'Mid Neck';
  if (avg <= 9.5)     return 'Upper Neck';
  return 'High Neck';
}

export function findVoicingPaths(
  chordNames: string[],
  options: PathOptions,
): VoicingPath[] {
  if (!chordNames.length) return [];

  const tuning     = options.tuning ?? TUNINGS[0].notes;
  const allowed    = STRING_GROUPS[options.stringGroup];
  const pathCount  = options.pathCount ?? 5;
  const generate   = options.mode === 'triads' ? generateTriadCandidates : generateFullCandidates;

  const candidatesPerChord = chordNames.map(name => generate(name, allowed, tuning));
  if (candidatesPerChord.some(c => !c.length)) return [];

  const BEAM = 80;
  type Beam = { vi: number; cost: number; trail: number[] };

  let beams: Beam[] = candidatesPerChord[0].map((v, vi) => ({
    vi,
    cost: genreCost(v, chordNames[0], options.genre),
    trail: [vi],
  }));

  for (let ci = 1; ci < chordNames.length; ci++) {
    const next: Beam[] = [];
    for (const b of beams) {
      const prev = candidatesPerChord[ci - 1][b.vi];
      for (let vi = 0; vi < candidatesPerChord[ci].length; vi++) {
        const curr = candidatesPerChord[ci][vi];
        next.push({
          vi,
          cost: b.cost + transitionCost(prev, curr) + genreCost(curr, chordNames[ci], options.genre),
          trail: [...b.trail, vi],
        });
      }
    }
    next.sort((a, b) => a.cost - b.cost);
    beams = next.slice(0, BEAM);
  }

  beams.sort((a, b) => a.cost - b.cost);

  const full = beams.map(b => {
    const voicings = b.trail.map((vi, ci) => candidatesPerChord[ci][vi]);
    const pathAvg  = voicings.reduce((s, v) => s + avgNonOpenFret(v), 0) / voicings.length;
    const openCount = voicings.reduce((s, v) => s + v.filter(p => p.fret === 0).length, 0);
    return { voicings, cost: b.cost, pathAvg, openCount };
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

  for (const p of full) {
    if (result.length >= pathCount) break;
    const z = zoneOf(p.pathAvg, p.openCount);
    if (!usedZones.has(z)) {
      usedZones.add(z);
      result.push({ id: `path-${result.length}`, voicings: p.voicings, label: pathLabel(p.pathAvg, p.openCount), avgFret: p.pathAvg });
    }
  }

  for (const p of full) {
    if (result.length >= pathCount) break;
    const dup = result.some(r =>
      r.voicings.every((v, ci) =>
        v.length === p.voicings[ci].length &&
        v.every((pos, pi) => pos.fret === p.voicings[ci][pi]?.fret && pos.string === p.voicings[ci][pi]?.string)
      )
    );
    if (!dup) {
      result.push({ id: `path-${result.length}`, voicings: p.voicings, label: pathLabel(p.pathAvg, p.openCount), avgFret: p.pathAvg });
    }
  }

  return result;
}
