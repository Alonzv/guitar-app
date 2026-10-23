import { useState, useEffect, useCallback } from 'react';
import { Chord as TonalChord } from '@tonaljs/tonal';
import type { ChordInProgression, Tuning } from '../../types/music';
import type { VoicingMode, StringGroup } from '../../utils/voicingPaths';
import { TUNINGS } from '../../utils/musicTheory';
import { formatChordName } from '../../utils/chordIdentifier';
import { T } from '../../theme';
import { useLang } from '../../contexts/LanguageContext';
import { Rule, Pill, PillRow, KeyGrid } from '../Transit/parts';
import { Route } from './Route';
import { ReharmonizeTab } from './ReharmonizeTab';
import { MelodyHarmonizerTab } from './MelodyHarmonizerTab';
import { consumePendingVoicings, subscribeVoicingsHandoff, type VoicingsHandoff } from '../../services/handoff';
import { previewNote, previewChordName } from '../../utils/previewSound';

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

// Monochrome: the chord's frame (root, 3rd, altered 5th, 7th) in ink,
// colour tones in grey.
const INTERVAL_COLOR: Record<string, string> = {
  '1P': T.text,
  '3m': T.text, '3M': T.text,
  '5P': T.textMuted, '5A': T.text, '5d': T.text,
  '7m': T.text, '7M': T.text, '7d': T.text,
  '9M': T.textMuted, '9m': T.textMuted, '9A': T.textMuted,
  '11P': T.textMuted, '11A': T.textMuted,
  '13M': T.textMuted, '13m': T.textMuted,
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

// The chord's formula as columns on a 4px top rule: degree, note, name.
function ChordSpelling({ chordName }: { chordName: string }) {
  const info = TonalChord.get(chordName);
  if (info.notes.length < 2) return null;
  return (
    <div dir="ltr" style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(info.notes.length, 3)}, minmax(0, 1fr))`, gap: 8 }}>
      {info.notes.map((note, i) => {
        const iv    = info.intervals[i] ?? '';
        const color = INTERVAL_COLOR[iv] ?? T.textMuted;
        const short = (INTERVAL_SHORT[iv] ?? iv).replace(/^b/, '♭').replace(/^#/, '♯');
        const name  = INTERVAL_NAME[iv]  ?? iv;
        return (
          <div key={i} style={{ borderTop: `4px solid ${color}`, paddingTop: 6, minWidth: 0, color }}>
            <span className="su-poster" style={{ display: 'block', fontSize: 30 }}>{short}</span>
            <span style={{ display: 'block', marginTop: 5, fontSize: 13, fontWeight: 700, fontFamily: 'var(--gc-mono)' }}>{note}</span>
            <span className="su-label" style={{ display: 'block', marginTop: 2, color: T.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
          </div>
        );
      })}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
export function VoicingsTab({ globalProgression, onChordsChange, tuning = TUNINGS[0], activeSub, desktop }: Props) {
  const { lang } = useLang();
  const he = lang === 'he';
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
  // The chord being built is heard at every step; a lone root as a note.
  const hear = (r: string | null, t: string | null, x: string) => {
    if (!r) return;
    if (!t) { previewNote(r); return; }
    previewChordName(r + (SUFFIX_MAP[t]?.[x] ?? SUFFIX_MAP[t]?.[''] ?? ''));
  };
  const chordName = root + (suffix === 'M' ? '' : suffix);
  const validExts = VALID_EXTENSIONS[triad] ?? [''];
  const activeExt = validExts.includes(ext) ? ext : '';

  const addChord = () => {
    if (!root || !triad || chords.length >= 8) return;
    setChords(prev => [...prev, chordName]);
  };

  const reorder = (from: number, to: number) => {
    setChords(prev => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };


  // ── Render ──────────────────────────────────────────────────────────────


  // The progression editor lives with the tool that uses it (the right column),
  // not in a separate card at the bottom of the left one — that split is why an
  // accidental chord looked unfixable. Chips carry a grip and an ×, and the row
  // says so, because drag-to-reorder has no affordance of its own.
  const progressionEditor = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <Route
        label={he ? 'המהלך' : 'Progression'}
        stations={chords.map(c => ({ name: formatChordName(c) }))}
        onRemove={i => setChords(prev => prev.filter((_, j) => j !== i))}
        onReorder={reorder}
      />
      {chords.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span className="su-label">{he ? 'גררו לשינוי הסדר · × להסרה' : 'Drag to reorder · × to remove'}</span>
          <Pill size="sm" onClick={() => setChords([])}>{he ? 'ניקוי' : 'Clear'}</Pill>
        </div>
      )}
    </div>
  );

  const canAdd = !!root && !!triad && chords.length < 8;
  const reharmLeft = (
    <Rule label={he ? 'בניית אקורד' : 'Build a chord'}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <p className="su-label" style={{ margin: '0 0 6px' }}>{he ? 'תו שורש' : 'Root note'}</p>
          <div dir="ltr">
            <KeyGrid label={he ? 'תו שורש' : 'Root note'} items={ROOTS.map(r => ({ id: r, label: r }))} value={root || null}
              onChange={r => { setRoot(r); hear(r, triad, ext); }} />
          </div>
        </div>
        <div>
          <p className="su-label" style={{ margin: '0 0 6px' }}>{he ? 'סוג' : 'Quality'}</p>
          <PillRow wrap label={he ? 'סוג' : 'Quality'} items={TRIADS.map(t => ({ id: t.key, label: t.display }))} value={triad || null}
            onChange={k => { setTriad(k); setExt(''); hear(root, k, ''); }} />
        </div>
        <div>
          <p className="su-label" style={{ margin: '0 0 6px' }}>{he ? 'הרחבה' : 'Extension'}</p>
          <PillRow wrap label={he ? 'הרחבה' : 'Extension'}
            items={EXTENSIONS.filter(e => validExts.includes(e.key)).map(e => ({ id: e.key || 'none', label: e.display }))}
            value={activeExt || 'none'} onChange={k => { const x = k === 'none' ? '' : k; setExt(x); hear(root, triad, x); }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span dir="ltr" className="su-semi gc-notation" style={{ fontSize: 30, flex: 1, minWidth: 0, lineHeight: 1 }}>
            {formatChordName(chordName) || '—'}
          </span>
          <Pill active={canAdd} disabled={!canAdd} onClick={addChord}>+ {he ? 'הוספה' : 'Add'}</Pill>
        </div>
        <ChordSpelling chordName={chordName} />
      </div>
    </Rule>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {subTab === 'harmonizer' && (
        <MelodyHarmonizerTab tuning={tuning} desktop={desktop} />
      )}

      {subTab === 'reharmonize' && (
        desktop ? (
          <div style={{ display: 'grid', gridTemplateColumns: '320px minmax(0, 1fr)', gap: 36, alignItems: 'start' }}>
            {reharmLeft}
            <ReharmonizeTab
              progressionEditor={progressionEditor}
              chords={chords}
              onLoadExample={setChords}
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
              onLoadExample={setChords}
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
