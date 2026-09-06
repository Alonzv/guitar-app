import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Chord as TonalChord } from '@tonaljs/tonal';
import type { ChordInProgression, Tuning } from '../../types/music';
import type { VoicingMode, StringGroup } from '../../utils/voicingPaths';
import { TUNINGS } from '../../utils/musicTheory';
import { T, card, alpha } from '../../theme';
import { ReharmonizeTab } from './ReharmonizeTab';
import { MelodyHarmonizerTab } from './MelodyHarmonizerTab';
import { consumePendingVoicings, subscribeVoicingsHandoff, type VoicingsHandoff } from '../../services/handoff';

// ── VOICINGS container ───────────────────────────────────────────────────────
// Hosts the two remaining Voicings tools: Harmonize (self-contained) and
// Reharm (needs a progression + neck filters, built here). The old "Paths" and
// its Voice Leading isolator were removed — Voice Leading Studio supersedes
// them and lives as its own top-level sub-tab.

type VoicingsSub = 'harmonizer' | 'reharmonize';

interface Props {
  globalProgression?: ChordInProgression[];
  /** Report an edit so it flows back into the shared session progression. */
  onChordsChange?: (names: string[]) => void;
  tuning?: Tuning;
  activeSub?: VoicingsSub;
  desktop?: boolean;
}

// ── Chord builder data ─────────────────────────────────────────────────────

const ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const TRIADS: { display: string; key: string }[] = [
  { display: 'Major', key: 'M'    },
  { display: 'Minor', key: 'm'    },
  { display: 'dim',   key: 'dim'  },
  { display: 'aug',   key: 'aug'  },
  { display: 'sus2',  key: 'sus2' },
  { display: 'sus4',  key: 'sus4' },
];

const EXTENSIONS: { display: string; key: string }[] = [
  { display: '—',     key: ''     },
  { display: '+7',    key: '7'    },
  { display: '+maj7', key: 'maj7' },
  { display: '+9',    key: '9'    },
  { display: '+add9', key: 'add9' },
  { display: '+6',    key: '6'    },
  { display: '+11',   key: '11'   },
  { display: '+13',   key: '13'   },
];

const VALID_EXTENSIONS: Record<string, string[]> = {
  M:    ['', '7', 'maj7', '9', 'add9', '6', '11', '13'],
  m:    ['', '7', 'maj7', '9', 'add9', '6', '11', '13'],
  dim:  ['', '7'],
  aug:  ['', '7'],
  sus2: [''],
  sus4: [''],
};

const SUFFIX_MAP: Record<string, Record<string, string>> = {
  M:    { '': 'M', '7': '7', 'maj7': 'maj7', '9': '9', 'add9': 'add9', '6': '6', '11': '11', '13': '13' },
  m:    { '': 'm', '7': 'm7', 'maj7': 'mMaj7', '9': 'm9', 'add9': 'madd9', '6': 'm6', '11': 'm11', '13': 'm13' },
  dim:  { '': 'dim', '7': 'dim7' },
  aug:  { '': 'aug', '7': 'aug7' },
  sus2: { '': 'sus2' },
  sus4: { '': 'sus4' },
};

// ── Interval display (chord spelling chips) ────────────────────────────────

const INTERVAL_COLOR: Record<string, string> = {
  '1P': 'var(--gc-success)',               // Root — blue
  '3m': T.text, '3M': T.text,
  '5P': '#5C5650', '5A': '#5C5650', '5d': '#5C5650',
  '7m': '#8A8378', '7M': '#8A8378', '7d': '#8A8378',
  '9M': '#9C958C', '9m': '#9C958C', '9A': '#9C958C',
  '11P': '#9C958C', '11A': '#9C958C',
  '13M': '#9C958C', '13m': '#9C958C',
};

const INTERVAL_SHORT: Record<string, string> = {
  '1P': '1', '3m': 'b3', '3M': '3', '5P': '5', '5A': '#5', '5d': 'b5',
  '7m': 'b7', '7M': '7', '7d': 'bb7',
  '9M': '9', '9m': 'b9', '9A': '#9',
  '11P': '11', '11A': '#11', '13M': '13', '13m': 'b13',
};

const INTERVAL_NAME: Record<string, string> = {
  '1P': 'Root', '3m': 'Minor 3rd', '3M': 'Major 3rd',
  '5P': 'Perfect 5th', '5A': 'Aug 5th', '5d': 'Dim 5th',
  '7m': 'Minor 7th', '7M': 'Major 7th', '7d': 'Dim 7th',
  '9M': '9th', '9m': 'Flat 9th', '9A': 'Sharp 9th',
  '11P': '11th', '11A': 'Sharp 11th', '13M': '13th', '13m': 'Flat 13th',
};

function ChordSpelling({ chordName }: { chordName: string }) {
  const info = TonalChord.get(chordName);
  if (info.notes.length < 2) return null;
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {info.notes.map((note, i) => {
        const iv    = info.intervals[i] ?? '';
        const color = INTERVAL_COLOR[iv] ?? T.textMuted;
        const short = INTERVAL_SHORT[iv] ?? iv;
        const name  = INTERVAL_NAME[iv]  ?? iv;
        return (
          <div key={i} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: '5px 10px',
            background: alpha(color, 13), borderRight: `3px solid ${color}`,
            minWidth: 34,
          }}>
            <span style={{ fontSize: 15, fontWeight: 800, color, lineHeight: 1.1 }}>{note}</span>
            <span style={{ fontSize: 10, fontWeight: 400, color, lineHeight: 1.3 }}>{short}</span>
            <span style={{ fontSize: 8, color: alpha(color, 73), lineHeight: 1.2, whiteSpace: 'nowrap' }}>{name}</span>
          </div>
        );
      })}
    </div>
  );
}

const LABEL_STYLE: React.CSSProperties = {
  margin: 0,
  fontSize: 10,
  fontWeight: 400,
  color: T.textDim,
  textTransform: 'uppercase',
  letterSpacing: '0.14em',
};

// ════════════════════════════════════════════════════════════════════════════
export function VoicingsTab({ globalProgression, onChordsChange, tuning = TUNINGS[0], activeSub, desktop }: Props) {
  // Chord builder
  const [root,  setRoot]  = useState('');
  const [triad, setTriad] = useState('');
  const [ext,   setExt]   = useState('');

  // Progression — the shared session list, not a private copy. Keeping its own
  // meant the session bar and this panel could show two different progressions
  // at once, with no way to tell which one the tool was actually using.
  const sessionNames = (globalProgression ?? []).map(c => c.chord.name).filter(Boolean);
  const [local, setLocal] = useState<string[]>([]);
  const linked = !!onChordsChange;
  const chords = linked ? sessionNames : local;
  const setChords = (next: string[] | ((prev: string[]) => string[])) => {
    const value = typeof next === 'function' ? (next as (p: string[]) => string[])(chords) : next;
    if (linked) onChordsChange!(value); else setLocal(value);
  };

  // Neck filters — shared with ReharmonizeTab
  const [mode,        setMode]        = useState<VoicingMode>('full');
  const [stringGroup, setStringGroup] = useState<StringGroup>('all');

  // ── Library handoff (Open in Reharm) ──────────────────────────────────────
  // Restores a saved progression + filters and seeds the saved AI result
  // (passed down to ReharmonizeTab so no API call is needed).
  const [reharmSeed, setReharmSeed] = useState<VoicingsHandoff['reharm'] | null>(null);

  const applyVoicingsHandoff = useCallback((h: VoicingsHandoff) => {
    setChords(h.chords);
    if (h.settings?.mode)        setMode(h.settings.mode as VoicingMode);
    if (h.settings?.stringGroup) setStringGroup(h.settings.stringGroup as StringGroup);
    setReharmSeed(h.reharm ?? null);
  }, []);

  useEffect(() => {
    const p = consumePendingVoicings();
    if (p) applyVoicingsHandoff(p);
    return subscribeVoicingsHandoff(() => {
      const q = consumePendingVoicings();
      if (q) applyVoicingsHandoff(q);
    });
  }, [applyVoicingsHandoff]);

  // Sub-tab. Always driven by the shell's Segment — there is no internal bar.
  const subTab: VoicingsSub = activeSub ?? 'reharmonize';

  // Derived chord name
  const suffix    = SUFFIX_MAP[triad]?.[ext] ?? '';
  const chordName = root + (suffix === 'M' ? '' : suffix);
  const validExts = VALID_EXTENSIONS[triad] ?? [''];
  const activeExt = validExts.includes(ext) ? ext : '';

  const addChord = () => {
    if (!root || !triad || chords.length >= 8) return;
    setChords(prev => [...prev, chordName]);
  };

  const dragIndex = useRef<number | null>(null);

  const onDragStart = (i: number) => { dragIndex.current = i; };

  const onDrop = (i: number) => {
    const from = dragIndex.current;
    if (from == null || from === i) return;
    setChords(prev => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(i, 0, item);
      return next;
    });
    dragIndex.current = null;
  };


  // ── Render ──────────────────────────────────────────────────────────────


  // The progression editor lives with the tool that uses it (the right column),
  // not in a separate card at the bottom of the left one — that split is why an
  // accidental chord looked unfixable. Chips carry a grip and an ×, and the row
  // says so, because drag-to-reorder has no affordance of its own.
  const progressionEditor = (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      {chords.map((c, i) => (
        <span
          key={i}
          draggable
          onDragStart={() => onDragStart(i)}
          onDragOver={e => e.preventDefault()}
          onDrop={() => onDrop(i)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '5px 11px', borderRadius: 0,
            background: T.bgDeep, border: `1px solid ${T.border}`,
            fontSize: 13, fontWeight: 400, color: T.text,
            cursor: 'grab', userSelect: 'none',
          }}
        >
          <span aria-hidden="true" style={{ color: T.textDim, fontSize: 11, letterSpacing: '-1px', lineHeight: 1 }}>⠿</span>
          {c}
          <button
            onClick={() => setChords(prev => prev.filter((_, j) => j !== i))}
            title={`Remove ${c}`}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: T.textMuted, fontSize: 15, lineHeight: 1 }}
          >×</button>
        </span>
      ))}
      {chords.length > 0 && (
        <button
          onClick={() => setChords([])}
          style={{ padding: '4px 10px', borderRadius: 0, background: 'none', border: `1px solid ${T.border}`, fontSize: 11, color: T.textMuted, cursor: 'pointer', fontWeight: 400, borderLeft: '3px solid var(--gc-bar-color)' }}
        >Clear</button>
      )}
      <span style={{ width: '100%', fontSize: 10, color: '#9C958C', fontFamily: 'var(--gc-mono)', letterSpacing: '0.06em' }}>
        Drag to reorder · × to remove
      </span>
    </div>
  );

  const reharmLeft = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Chord builder ──────────────────────────────────────────── */}
      <div style={{ ...card(), display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={LABEL_STYLE}>Build Chord</p>

        {/* Root note grid */}
        <div>
          <p style={{ ...LABEL_STYLE, fontSize: 10, marginBottom: 6 }}>Root Note</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4 }}>
            {ROOTS.map(r => (
              <button key={r} onClick={() => setRoot(r)} style={{
                padding: '7px 0', borderRadius: 0,
                background: root === r ? T.primary : T.bgDeep,
                color: root === r ? '#fff' : T.textMuted,
                fontSize: 12, fontWeight: 400, cursor: 'pointer',
                transition: 'background 0.12s', borderLeft: '3px solid var(--gc-bar-color)',
              }}>{r}</button>
            ))}
          </div>
        </div>

        {/* Triad quality */}
        <div>
          <p style={{ ...LABEL_STYLE, fontSize: 10, marginBottom: 6 }}>Quality</p>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {TRIADS.map(t => (
              <button key={t.key} onClick={() => { setTriad(t.key); setExt(''); }} style={{
                padding: '7px 12px', borderRadius: 0,
                background: triad === t.key ? T.secondary : T.bgDeep,
                color: triad === t.key ? '#fff' : T.textMuted,
                fontSize: 12, fontWeight: 400, cursor: 'pointer',
                transition: 'background 0.12s', borderLeft: '3px solid var(--gc-bar-color)',
              }}>{t.display}</button>
            ))}
          </div>
        </div>

        {/* Extension */}
        <div>
          <p style={{ ...LABEL_STYLE, fontSize: 10, marginBottom: 6 }}>Extension</p>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {EXTENSIONS.filter(e => validExts.includes(e.key)).map(e => (
              <button key={e.key} onClick={() => setExt(e.key)} style={{
                padding: '6px 11px', borderRadius: 0,
                background: activeExt === e.key ? T.secondary : T.bgDeep,
                color: activeExt === e.key ? '#fff' : T.textMuted,
                fontSize: 12, fontWeight: 400, cursor: 'pointer',
                transition: 'background 0.12s', borderLeft: '3px solid var(--gc-bar-color)',
              }}>{e.display}</button>
            ))}
          </div>
        </div>

        {/* Add row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: T.text, flex: 1 }}>
            {chordName}
          </span>
          <button
            onClick={addChord}
            disabled={!root || !triad || chords.length >= 8}
            style={{
              padding: '9px 20px', borderRadius: 0,
              background: (root && triad && chords.length < 8) ? T.secondary : T.border,
              color: '#fff', fontWeight: 400, fontSize: 14,
              cursor: (root && triad && chords.length < 8) ? 'pointer' : 'not-allowed',
              transition: 'background 0.15s', borderLeft: '3px solid var(--gc-bar-color)',
            }}
          >
            + Add
          </button>
        </div>

        {/* Chord spelling */}
        <ChordSpelling chordName={chordName} />
      </div>

      {/* ── Mode + String group — single card, two segmented controls ── */}
      <div style={{ ...card({ padding: '10px 14px' }), display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 130 }}>
          <span style={{ ...LABEL_STYLE, whiteSpace: 'nowrap' }}>Mode</span>
          <div style={{ display: 'flex', gap: 0, flex: 1 }}>
            {(['full', 'triads'] as VoicingMode[]).map(m => (
              <button key={m} onClick={() => setMode(m)} style={{
                flex: 1, padding: '7px 4px', borderRadius: 0,
                cursor: 'pointer', fontSize: 12, fontWeight: 400,
                background: mode === m ? T.secondary : T.bgInput,
                color: mode === m ? '#fff' : T.textMuted,
                borderLeft: '3px solid var(--gc-bar-color)',
                transition: 'background 0.1s',
              }}>
                {m === 'full' ? 'Full' : 'Triads'}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 160 }}>
          <span style={{ ...LABEL_STYLE, whiteSpace: 'nowrap' }}>Strings</span>
          <div style={{ display: 'flex', gap: 0, flex: 1 }}>
            {([
              { id: 'all',    label: 'All'  },
              { id: 'bass',   label: 'Low'  },
              { id: 'treble', label: 'High' },
            ] as { id: StringGroup; label: string }[]).map(sg => (
              <button key={sg.id} onClick={() => setStringGroup(sg.id)} style={{
                flex: 1, padding: '7px 4px', borderRadius: 0,
                cursor: 'pointer', fontSize: 12, fontWeight: 400,
                background: stringGroup === sg.id ? T.secondary : T.bgInput,
                color: stringGroup === sg.id ? '#fff' : T.textMuted,
                borderLeft: '3px solid var(--gc-bar-color)',
                transition: 'background 0.1s',
              }}>
                {sg.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {subTab === 'harmonizer' && (
        <MelodyHarmonizerTab tuning={tuning} desktop={desktop} />
      )}

      {subTab === 'reharmonize' && (
        desktop ? (
          <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 36, alignItems: 'start' }}>
            {reharmLeft}
            <ReharmonizeTab
              progressionEditor={progressionEditor}
              chords={chords}
              mode={mode}
              setMode={setMode}
              stringGroup={stringGroup}
              setStringGroup={setStringGroup}
              tuning={tuning}
              desktop={desktop}
              restored={reharmSeed}
              onRestoredConsumed={() => setReharmSeed(null)}
            />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {reharmLeft}
            <ReharmonizeTab
              progressionEditor={progressionEditor}
              chords={chords}
              mode={mode}
              setMode={setMode}
              stringGroup={stringGroup}
              setStringGroup={setStringGroup}
              tuning={tuning}
              desktop={desktop}
              restored={reharmSeed}
              onRestoredConsumed={() => setReharmSeed(null)}
            />
          </div>
        )
      )}
    </div>
  );
}
