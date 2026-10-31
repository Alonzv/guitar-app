import { useState, useEffect, useCallback } from 'react';
import type { ChordInProgression, Tuning } from '../../types/music';
import type { VoicingMode, StringGroup } from '../../utils/voicingPaths';
import { TUNINGS } from '../../utils/musicTheory';
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

// ════════════════════════════════════════════════════════════════════════════
export function VoicingsTab({ globalProgression, onChordsChange, tuning = TUNINGS[0], activeSub, desktop }: Props) {
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {subTab === 'harmonizer' && (
        <MelodyHarmonizerTab tuning={tuning} desktop={desktop} />
      )}

      {subTab === 'reharmonize' && (
        <ReharmonizeTab
          chords={chords}
          onChordsChange={setChords}
          mode={mode}
          setMode={setMode}
          stringGroup={stringGroup}
          setStringGroup={setStringGroup}
          tuning={tuning}
          desktop={desktop}
          restored={reharmSeed}
          onRestoredConsumed={() => setReharmSeed(null)}
        />
      )}
    </div>
  );
}
