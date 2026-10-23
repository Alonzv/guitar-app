import { IntervalExplore } from './IntervalExplore';
import { IntervalPlayground } from './IntervalPlayground';
import { IntervalInChord } from './IntervalInChord';
import { EarTrainingTab } from '../EarTraining/EarTrainingTab';
import { T } from '../../theme';
import { Rule } from '../Transit/parts';
import { playMidi } from '../../utils/audioPlayback';

export type IntervalsSub = 'explore' | 'measure' | 'inchord' | 'practice';

const INTERVAL_REF = [
  { abbrev: 'P1',  semitones: 0,  name: 'Unison',        quality: 'Perfect',    feel: 'Same note' },
  { abbrev: 'm2',  semitones: 1,  name: 'Minor 2nd',     quality: 'Dissonant',  feel: 'Max tension' },
  { abbrev: 'M2',  semitones: 2,  name: 'Major 2nd',     quality: 'Mild',       feel: 'Scale step' },
  { abbrev: 'm3',  semitones: 3,  name: 'Minor 3rd',     quality: 'Consonant',  feel: 'Dark / minor' },
  { abbrev: 'M3',  semitones: 4,  name: 'Major 3rd',     quality: 'Consonant',  feel: 'Bright / major' },
  { abbrev: 'P4',  semitones: 5,  name: 'Perfect 4th',   quality: 'Perfect',    feel: 'Sus / stable' },
  { abbrev: 'TT',  semitones: 6,  name: 'Tritone',       quality: 'Dissonant',  feel: 'Devil\'s interval' },
  { abbrev: 'P5',  semitones: 7,  name: 'Perfect 5th',   quality: 'Perfect',    feel: 'Power / stable' },
  { abbrev: 'm6',  semitones: 8,  name: 'Minor 6th',     quality: 'Consonant',  feel: 'Colour' },
  { abbrev: 'M6',  semitones: 9,  name: 'Major 6th',     quality: 'Consonant',  feel: 'Warm / 6th chords' },
  { abbrev: 'm7',  semitones: 10, name: 'Minor 7th',     quality: 'Mild',       feel: 'Blues / dom7' },
  { abbrev: 'M7',  semitones: 11, name: 'Major 7th',     quality: 'Mild',       feel: 'Leading tone' },
  { abbrev: 'P8',  semitones: 12, name: 'Octave',        quality: 'Perfect',    feel: 'Same, doubled' },
];

// Songs whose opening notes make the interval — the first two notes are it.
const HINTS: { abbrev: string; hint: string; motif: number[] }[] = [
  { abbrev: 'P5', hint: 'Star Wars theme',                motif: [60, 67, 65, 64, 62, 72, 67] },
  { abbrev: 'P4', hint: 'Here Comes the Bride',           motif: [60, 65, 65, 65] },
  { abbrev: 'M3', hint: 'When the Saints Go Marching In', motif: [60, 64, 65, 67] },
  { abbrev: 'm3', hint: 'Smoke on the Water riff',        motif: [55, 58, 60, 55, 58, 61, 60] },
  { abbrev: 'M6', hint: 'My Bonnie Lies Over the Ocean',  motif: [60, 69, 67, 65, 67, 65, 62] },
  { abbrev: 'TT', hint: 'The Simpsons theme',             motif: [60, 64, 66, 69] },
];

let motifTimers: ReturnType<typeof setTimeout>[] = [];
function playMotif(midis: number[]) {
  motifTimers.forEach(clearTimeout);
  motifTimers = midis.map((m, i) => setTimeout(() => playMidi(m, i === 0 ? 0.5 : 0.4), i * 330));
}

// Quality in ink only: the stable intervals in ink, the restless ones grey.
const QUALITY_COLOR: Record<string, string> = {
  Perfect:    T.text,
  Consonant:  T.text,
  Mild:       T.textMuted,
  Dissonant:  T.textMuted,
};

// The view is chosen by the shell: Explore / Measure / In a chord are the
// Intervals stop's pills, and 'practice' is its own stop (Ear training, L4).
export function IntervalsTab({ desktop, sub }: { desktop?: boolean; sub: string }) {

  const tool =
    sub === 'explore'  ? <IntervalExplore /> :
    sub === 'measure' ? <IntervalPlayground /> :
    sub === 'inchord'  ? <IntervalInChord desktop={desktop} /> :
    <EarTrainingTab desktop={desktop} />;

  const mainContent = (
    <div>
      {sub === 'practice'
        ? <div style={{ maxWidth: desktop ? 680 : undefined, width: '100%' }}>{tool}</div>
        : tool}
    </div>
  );

  // Mobile, or the full-width sub-tabs (practice / in-a-chord) — no side panel.
  if (!desktop || sub === 'practice' || sub === 'inchord') return mainContent;

  const sidePanel = (
    <div style={{ position: 'sticky', top: 24, display: 'flex', flexDirection: 'column', gap: 22 }}>
      <Rule label="Interval reference">
        <div role="table" aria-label="Interval reference">
          <div role="row" style={{
            display: 'grid', gridTemplateColumns: '1fr 56px 46px 86px',
            borderBottom: `var(--su-rule) solid ${T.border}`, paddingBottom: 6,
          }}>
            {['Name', 'Abbr', 'Semi', 'Quality'].map(h => (
              <span key={h} role="columnheader" className="su-label" style={{ fontSize: 9 }}>{h}</span>
            ))}
          </div>
          {INTERVAL_REF.map(iv => (
            <div key={iv.abbrev} role="row" style={{
              display: 'grid', gridTemplateColumns: '1fr 56px 46px 86px',
              padding: '5px 0', borderBottom: `1px solid ${T.hairline}`, alignItems: 'center',
            }}>
              <span role="cell" className="su-semi" style={{ fontSize: 15, textTransform: 'uppercase' }}>{iv.name}</span>
              <span role="cell" style={{ fontSize: 11, fontFamily: 'var(--gc-mono)', fontWeight: 700 }}>{iv.abbrev}</span>
              <span role="cell" style={{ fontSize: 11, color: T.textMuted, fontFamily: 'var(--gc-mono)' }}>{iv.semitones}</span>
              <span role="cell" style={{ fontSize: 10, fontFamily: 'var(--gc-mono)', letterSpacing: '0.08em', textTransform: 'uppercase',
                color: QUALITY_COLOR[iv.quality] ?? T.textMuted }}>{iv.quality}</span>
            </div>
          ))}
        </div>
      </Rule>

      <Rule label="Ear training hints">
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {/* Tap a song to hear how its opening makes the interval. */}
          {HINTS.map(({ abbrev, hint, motif }) => (
            <button key={abbrev} onClick={() => playMotif(motif)} className="gc-notation gc-no-bar" title="Hear it"
              aria-label={`${abbrev}: ${hint} — hear it`} style={{
              display: 'flex', gap: 10, alignItems: 'center', minHeight: 44, padding: 0, background: 'transparent',
              border: 'none', borderBottom: `1px solid ${T.hairline}`, cursor: 'pointer', textAlign: 'start', letterSpacing: 'normal', color: T.text,
            }}>
              <span style={{ fontSize: 11, fontFamily: 'var(--gc-mono)', fontWeight: 700, flexShrink: 0, minWidth: 30 }}>{abbrev}</span>
              <span style={{ fontSize: 12, color: T.text, flex: 1 }}>{hint}</span>
              <span aria-hidden style={{ width: 32, height: 32, borderRadius: '50%', border: `1.5px solid ${T.text}`, display: 'inline-flex',
                alignItems: 'center', justifyContent: 'center', fontSize: 10, flex: 'none' }}>▶</span>
            </button>
          ))}
        </div>
      </Rule>
    </div>
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 40, alignItems: 'start' }}>
      {mainContent}
      {sidePanel}
    </div>
  );
}
