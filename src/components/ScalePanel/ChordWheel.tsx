import React, { useState } from 'react';
import { Key } from '@tonaljs/tonal';
import { T, btn } from '../../theme';
import { useLang } from '../../contexts/LanguageContext';
import { Rule, PillRow, KeyGrid } from '../Transit/parts';
import { pillStyle } from '../Transit/styles';
import { playChord } from '../../utils/audioPlayback';
import type { ChordInProgression } from '../../types/music';
import { findChordVoicings } from '../../utils/chordVoicings';
import { previewVoicing } from '../../utils/previewSound';
import { DiceButton } from '../DiceButton';
import { pickOne } from '../../utils/random';
import { useOptionalSong } from '../../song/SongContext';
import { keyName } from '../../utils/harmonicAnalysis';

// ── Music data ─────────────────────────────────────────────────────────────────
const ALL_ROOTS = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

const COF_ORDER  = ['C','G','D','A','E','B','F#','Db','Ab','Eb','Bb','F'];
const COF_MINOR  = ['Am','Em','Bm','F#m','C#m','G#m','Ebm','Bbm','Fm','Cm','Gm','Dm'];

type Func = 'tonic' | 'subdominant' | 'dominant';
type Mode = 'major' | 'minor';


interface HLInfo { chord: string; roman: string; func: Func }

// Compute outer/inner ring highlights from CoF position + mode.
// Uses Key.majorKey(COF_ORDER[P]) as the relative-major basis for both modes.
function computeHighlights(cofIdx: number, mode: Mode) {
  const outer = new Map<number, HLInfo>();
  const inner = new Map<number, HLInfo>();
  const P = cofIdx;
  const t = Key.majorKey(COF_ORDER[P]).triads;

  if (mode === 'major') {
    outer.set(P,          { chord: t[0], roman: 'I',    func: 'tonic'       });
    outer.set((P+11)%12,  { chord: t[3], roman: 'IV',   func: 'subdominant' });
    outer.set((P+1)%12,   { chord: t[4], roman: 'V',    func: 'dominant'    });
    inner.set(P,          { chord: t[5], roman: 'vi',   func: 'tonic'       });
    inner.set((P+11)%12,  { chord: t[1], roman: 'ii',   func: 'subdominant' });
    inner.set((P+1)%12,   { chord: t[2], roman: 'iii',  func: 'tonic'       });
    inner.set((P+2)%12,   { chord: t[6], roman: 'vii°', func: 'dominant'    });
  } else {
    inner.set(P,          { chord: t[5], roman: 'i',    func: 'tonic'       });
    inner.set((P+11)%12,  { chord: t[1], roman: 'iv',   func: 'subdominant' });
    inner.set((P+1)%12,   { chord: t[2], roman: 'v',    func: 'dominant'    });
    inner.set((P+2)%12,   { chord: t[6], roman: 'ii°',  func: 'subdominant' });
    outer.set(P,          { chord: t[0], roman: 'III',  func: 'tonic'       });
    outer.set((P+11)%12,  { chord: t[3], roman: 'VI',   func: 'subdominant' });
    outer.set((P+1)%12,   { chord: t[4], roman: 'VII',  func: 'dominant'    });
  }
  return { outerMap: outer, innerMap: inner };
}

// The wheel turns the new key to the top; its labels turn back by the same
// amount on the same curve, so they stay upright all the way round.
const WHEEL_TURN = 'transform 0.7s cubic-bezier(0.37, 0, 0.63, 1)';

// ── Geometry ───────────────────────────────────────────────────────────────────
const SIZE   = 380;
const CX     = SIZE / 2;
const CY     = SIZE / 2;
const R_O_O  = 180;
const R_O_I  = 124;
const R_I_O  = 120;
const R_I_I  = 70;
const TOTAL  = 12;
const SLICE  = (2 * Math.PI) / TOTAL;
const GAP    = 0.013;

function polar(a: number, r: number) {
  return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) };
}
function arcPath(startAngle: number, rOuter: number, rInner: number): string {
  const a1 = startAngle + GAP, a2 = startAngle + SLICE - GAP;
  const o1 = polar(a1, rOuter), o2 = polar(a2, rOuter);
  const i1 = polar(a1, rInner), i2 = polar(a2, rInner);
  return `M${o1.x} ${o1.y} A${rOuter} ${rOuter} 0 0 1 ${o2.x} ${o2.y} L${i2.x} ${i2.y} A${rInner} ${rInner} 0 0 0 ${i1.x} ${i1.y}Z`;
}
function midPt(startAngle: number, r: number) {
  const a = startAngle + SLICE / 2;
  return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) };
}

const OPEN_FREQS = [82.41, 110.0, 146.83, 196.0, 246.94, 329.63];


// Conversion maps
const SHARP_TO_COF:   Record<string, string> = { 'C#':'Db', 'D#':'Eb', 'G#':'Ab', 'A#':'Bb' };
const FLAT_TO_SHARP:  Record<string, string> = { 'Db':'C#', 'Eb':'D#', 'Ab':'G#', 'Bb':'A#' };
// D# → Ebm and A# → Bbm because COF_MINOR uses flat spelling for those
const SHARP_TO_MINOR: Record<string, string> = { 'D#': 'Ebm', 'A#': 'Bbm' };

interface Props {
  onAddToProgression?: (item: ChordInProgression) => void;
  desktop?: boolean;
}

export const ChordWheel: React.FC<Props> = ({ onAddToProgression, desktop }) => {
  const { lang } = useLang();
  const he = lang === 'he';
  const [root, setRoot] = useState<string>('C');
  const [mode, setMode] = useState<Mode>('major');

  // Opens on the song's key and follows it when it changes; spelled as the
  // song spells it (Eb minor stays Eb, the wheel reads flat roots fine).
  const songKey = useOptionalSong()?.key ?? null;
  const songKeyId = songKey ? `${songKey.tonicPc}:${songKey.mode}` : '';
  const [seenKey, setSeenKey] = useState('');
  if (songKeyId !== seenKey) {
    setSeenKey(songKeyId);
    if (songKey) { setRoot(keyName(songKey, 'en').split(' ')[0]); setMode(songKey.mode); }
  }

  // CoF position index (0-11)
  const cofRoot  = COF_ORDER.includes(root) ? root : (SHARP_TO_COF[root] ?? root);
  const cofIdx   = mode === 'major'
    ? COF_ORDER.indexOf(cofRoot)
    : COF_MINOR.indexOf(SHARP_TO_MINOR[root] ?? (root + 'm'));

  const { outerMap, innerMap } = computeHighlights(Math.max(0, cofIdx), mode);

  const rotationDeg = cofIdx >= 0 ? -(cofIdx * 30) : 0;

  const getVoicing = (chordName: string) => {
    const stdTuning = ['E2','A2','D3','G3','B3','E4'];
    const voicings  = findChordVoicings(chordName, 4, stdTuning);
    return voicings[0] ?? [];
  };

  // ── The chord you tapped ─────────────────────────────────────────────────
  // A slice plays its chord and becomes the one "Add to song" acts on. The
  // key is chosen below the wheel (major/minor and the twelve keys).
  const [picked, setPicked] = useState<{ chord: string; ring: 'outer' | 'inner'; i: number } | null>(null);
  const [seenPickKey, setSeenPickKey] = useState(`${root}:${mode}`);
  if (seenPickKey !== `${root}:${mode}`) { setSeenPickKey(`${root}:${mode}`); setPicked(null); }

  const handleAddChord = (chordName: string) => {
    if (!onAddToProgression) return;
    onAddToProgression({
      id: `cw-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      chord: { name: chordName, notes: [], aliases: [] },
      fretPositions: getVoicing(chordName),
    });
  };

  const handlePlayChord = (chordName: string) => {
    const fp = getVoicing(chordName);
    if (fp.length) playChord(fp, OPEN_FREQS, 0);
  };
  const pick = (chord: string, ring: 'outer' | 'inner', i: number) => {
    setPicked({ chord, ring, i });
    handlePlayChord(chord);
  };

  const roll = () => {
    const r = pickOne(ALL_ROOTS);
    const m = pickOne<Mode>(['major', 'minor']);
    setRoot(r); setMode(m); hearKey(r, m);
  };

  // Choosing a key sounds its tonic chord.
  const hearKey = (r: string, m: Mode) => {
    const fp = getVoicing(m === 'minor' ? `${r}m` : r);
    if (fp.length) previewVoicing(fp, OPEN_FREQS);
  };

  const startAngle = (i: number) => -Math.PI / 2 - SLICE / 2 + i * SLICE;

  // ── The wheel: an ink line drawing. The key you are in is the one cobalt
  // slice; its other chords are drawn in ink; the rest of the circle is grey.
  const wheelSvg = (
    <svg viewBox={`-10 -10 ${SIZE + 20} ${SIZE + 20}`} role="group" aria-label={he ? 'מעגל החמישיות' : 'Circle of fifths'}
      style={{ display: 'block', width: '100%', maxWidth: SIZE + 20 }}>
      <g style={{
        transform: `rotate(${rotationDeg}deg)`,
        transformOrigin: `${CX}px ${CY}px`,
        transformBox: 'view-box',
        transition: WHEEL_TURN,
        willChange: 'transform',
      } as React.CSSProperties}>
        {Array.from({ length: TOTAL }, (_, i) => {
          const sa        = startAngle(i);
          const outerInfo = outerMap.get(i);
          const innerInfo = innerMap.get(i);
          const oKey      = mode === 'major' && i === cofIdx;
          const iKey      = mode === 'minor' && i === cofIdx;
          const mp_o      = midPt(sa, (R_O_O + R_O_I) / 2);
          const mp_i      = midPt(sa, (R_I_O + R_I_I) / 2);
          const textRot   = -rotationDeg;

          // Root names for click handlers
          const cofNote       = COF_ORDER[i];
          const selectRoot    = ALL_ROOTS.includes(cofNote) ? cofNote : (FLAT_TO_SHARP[cofNote] ?? cofNote);
          const minorName     = COF_MINOR[i];
          const minorRootCof  = minorName.slice(0, -1); // strip 'm'
          const minorSelectRoot = ALL_ROOTS.includes(minorRootCof) ? minorRootCof : (FLAT_TO_SHARP[minorRootCof] ?? minorRootCof);
          // In the key, a slice plays the key's own chord there (the vii° is
          // diminished); outside it, the plain major or minor chord.
          const outerChord = outerInfo?.chord ?? selectRoot;
          const innerChord = innerInfo?.chord ?? `${minorSelectRoot}m`;
          const pickMajor = () => pick(outerChord, 'outer', i);
          const pickMinor = () => pick(innerChord, 'inner', i);
          const oPicked = picked?.ring === 'outer' && picked.i === i;
          const iPicked = picked?.ring === 'inner' && picked.i === i;
          const keyDown = (fn: () => void) => (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } };
          const ink = (info: HLInfo | undefined, key: boolean, on: boolean) => key ? T.onPrimary : on ? T.white : info ? T.text : T.textMuted;

          return (
            <g key={i}>
              {/* Outer arc — tap to set major key */}
              <path
                d={arcPath(sa, R_O_O, R_O_I)} role="button" tabIndex={0} aria-pressed={oPicked}
                aria-label={`${he ? 'נגן' : 'Play'} ${outerChord}`}
                fill={oKey ? T.primary : oPicked ? T.secondary : 'transparent'}
                stroke={oKey ? T.primary : oPicked || outerInfo ? T.text : T.hairline} strokeWidth={outerInfo || oKey || oPicked ? 2 : 1.5}
                style={{ cursor: 'pointer' }}
                onClick={pickMajor} onKeyDown={keyDown(pickMajor)}
              />
              {/* Inner arc — tap to set minor key */}
              <path
                d={arcPath(sa, R_I_O, R_I_I)} role="button" tabIndex={0} aria-pressed={iPicked}
                aria-label={`${he ? 'נגן' : 'Play'} ${innerChord}`}
                fill={iKey ? T.primary : iPicked ? T.secondary : 'transparent'}
                stroke={iKey ? T.primary : iPicked || innerInfo ? T.text : T.hairline} strokeWidth={innerInfo || iKey || iPicked ? 2 : 1.5}
                style={{ cursor: 'pointer' }}
                onClick={pickMinor} onKeyDown={keyDown(pickMinor)}
              />

              {/* Outer text group — counter-rotated to stay upright */}
              <g style={{
                pointerEvents: 'none',
                transform: `rotate(${textRot}deg)`, transformOrigin: `${mp_o.x}px ${mp_o.y}px`, transformBox: 'view-box',
                transition: WHEEL_TURN,
              } as React.CSSProperties}>
                <text
                  x={mp_o.x} y={outerInfo ? mp_o.y - 5 : mp_o.y}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={outerInfo ? 17 : 13} fontWeight={outerInfo ? 800 : 600}
                  fontFamily="var(--su-display)" style={{ fontStretch: '75%' }}
                  fill={ink(outerInfo, oKey, oPicked)}
                >
                  {cofNote}
                </text>
                {outerInfo && (
                  <text
                    x={mp_o.x} y={mp_o.y + 10}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize={9} fontWeight={600} fontFamily="var(--gc-mono)"
                    fill={ink(outerInfo, oKey, oPicked)}
                  >
                    {outerInfo.roman}
                  </text>
                )}
              </g>

              {/* Inner text group — counter-rotated to stay upright */}
              <g style={{
                pointerEvents: 'none',
                transform: `rotate(${textRot}deg)`, transformOrigin: `${mp_i.x}px ${mp_i.y}px`, transformBox: 'view-box',
                transition: WHEEL_TURN,
              } as React.CSSProperties}>
                <text
                  x={mp_i.x} y={innerInfo ? mp_i.y - 5 : mp_i.y}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={innerInfo ? 14 : 11} fontWeight={innerInfo ? 800 : 600}
                  fontFamily="var(--su-display)" style={{ fontStretch: '75%' }}
                  fill={ink(innerInfo, iKey, iPicked)}
                >
                  {minorName}
                </text>
                {innerInfo && (
                  <text
                    x={mp_i.x} y={mp_i.y + 9}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize={8} fontWeight={600} fontFamily="var(--gc-mono)"
                    fill={ink(innerInfo, iKey, iPicked)}
                  >
                    {innerInfo.roman}
                  </text>
                )}
              </g>
            </g>
          );
        })}

      </g>

      {/* The key's marker — fixed at the top, outside the outer ring for major,
          inside the inner ring for minor */}
      {cofIdx >= 0 && (() => {
        const arcR = mode === 'major' ? R_O_O + 7 : R_I_I - 7;
        const sa   = -Math.PI / 2 - SLICE / 2 + GAP;
        const ea   = -Math.PI / 2 + SLICE / 2 - GAP;
        const p1   = polar(sa, arcR);
        const p2   = polar(ea, arcR);
        return (
          <path d={`M${p1.x} ${p1.y} A${arcR} ${arcR} 0 0 1 ${p2.x} ${p2.y}`} fill="none" stroke={T.text} strokeWidth={3} />
        );
      })()}

      {/* Center label */}
      <text x={CX} y={CY + 4} textAnchor="middle" fontSize={44} fontWeight={900}
        fontFamily="var(--su-display)" style={{ fontStretch: '62%', textTransform: 'uppercase' }} fill={T.text}>{root}</text>
      <text x={CX} y={CY + 22} textAnchor="middle" fontSize={9}
        fill={T.textMuted} fontFamily="var(--gc-mono)" letterSpacing="0.14em">
        {mode === 'major' ? 'MAJOR' : 'MINOR'}
      </text>
    </svg>
  );

  // Under the wheel: the chord you tapped and the one action on it.
  const pickedRow = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, minHeight: 56, borderTop: `var(--su-rule) solid ${T.border}`, paddingTop: 12 }}>
      <span className="su-semi gc-notation" dir="ltr" aria-live="polite" style={{ fontSize: 30, flex: 1, minWidth: 0, color: picked ? T.text : T.textMuted }}>
        {picked ? picked.chord : <span className="su-label" style={{ fontSize: 10 }}>{he ? 'הקישו על אקורד בגלגל כדי לשמוע אותו' : 'Tap a chord on the wheel to hear it'}</span>}
      </span>
      {onAddToProgression && (
        <button onClick={() => picked && handleAddChord(picked.chord)} disabled={!picked} className="gc-no-bar"
          style={{ ...btn.primary(!picked), flex: 'none' }}>
          {he ? '+ הוסף לשיר' : '+ Add to song'}
        </button>
      )}
    </div>
  );

  const keyControls = (
    <Rule label={he ? 'סולם' : 'Key'} right={<DiceButton onRoll={roll} style={pillStyle(false, 'sm')} />}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <PillRow label="Key quality"
          items={[{ id: 'major' as Mode, label: he ? 'מז׳ור' : 'Major' }, { id: 'minor' as Mode, label: he ? 'מינור' : 'Minor' }]}
          value={mode} onChange={m => { setMode(m); hearKey(root, m); }} />
        <KeyGrid items={ALL_ROOTS.map(n => ({ id: n, label: n }))} value={root}
          onChange={n => { setRoot(n); hearKey(n, mode); }} label={he ? 'טוניקה' : 'Key'} />
      </div>
    </Rule>
  );

  const wheel = (
    <div dir="ltr" style={{ width: '100%', maxWidth: desktop ? 520 : 360, margin: '0 auto' }}>
      {wheelSvg}
    </div>
  );

  if (desktop) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 520px) minmax(280px, 380px)', gap: 48, alignItems: 'start' }}>
        {wheel}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {pickedRow}
          {keyControls}
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {wheel}
      {pickedRow}
      {keyControls}
    </div>
  );
};
