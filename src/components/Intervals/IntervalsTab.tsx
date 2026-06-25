import { useState } from 'react';
import { IntervalExplore } from './IntervalExplore';
import { IntervalCalculate } from './IntervalCalculate';
import { T, card } from '../../theme';

type Sub = 'explore' | 'calculate';

const SUB_LABELS: Record<Sub, string> = {
  explore:   'Explore',
  calculate: 'Calculate',
};

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

const QUALITY_COLOR: Record<string, string> = {
  Perfect:    T.primary,
  Consonant:  T.secondary,
  Mild:       '#6B655C',
  Dissonant:  '#9C958C',
};

const SECTION: React.CSSProperties = {
  fontFamily: 'var(--gc-mono)', fontSize: 11, letterSpacing: '0.14em',
  textTransform: 'uppercase', color: '#9C958C', margin: '0 0 8px',
};

export function IntervalsTab({ desktop }: { desktop?: boolean } = {}) {
  const [sub, setSub] = useState<Sub>('explore');

  const tabBar = (
    <div style={{ display: 'flex', gap: 0 }}>
      {(['explore', 'calculate'] as Sub[]).map(id => (
        <button key={id} onClick={() => setSub(id)} className="gc-sub-tab" style={{
          flex: 1, padding: '11px 4px', borderRadius: 0,
          cursor: 'pointer', fontSize: 14,
          background: sub === id ? T.secondary : T.bgInput,
          color: sub === id ? '#fff' : T.textMuted,
          borderLeft: '3px solid var(--gc-bar-color)',
          transition: 'background 0.1s',
        }}>
          <span style={{ fontWeight: 400 }}>{SUB_LABELS[id]}</span>
        </button>
      ))}
    </div>
  );

  const mainContent = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {tabBar}
      {sub === 'explore'   && <IntervalExplore />}
      {sub === 'calculate' && <IntervalCalculate />}
    </div>
  );

  if (!desktop) return mainContent;

  const sidePanel = (
    <div style={{ position: 'sticky', top: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={card({ padding: '12px 14px' })}>
        <p style={SECTION}>Interval reference</p>
        {/* Header row */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 70px 80px 90px',
          gap: 0, borderBottom: `1px solid ${T.border}`, paddingBottom: 6, marginBottom: 4,
        }}>
          {['Name', 'Abbr', 'Semitones', 'Quality'].map(h => (
            <span key={h} style={{ fontSize: 9, color: '#9C958C', fontFamily: 'var(--gc-mono)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{h}</span>
          ))}
        </div>
        {INTERVAL_REF.map(iv => (
          <div key={iv.abbrev} style={{
            display: 'grid', gridTemplateColumns: '1fr 70px 80px 90px',
            gap: 0, padding: '4px 0', borderBottom: `1px solid ${T.border}`,
            alignItems: 'center',
          }}>
            <span style={{ fontSize: 11, color: T.text, fontWeight: 400 }}>{iv.name}</span>
            <span style={{ fontSize: 11, color: T.primary, fontFamily: 'var(--gc-mono)', fontWeight: 600 }}>{iv.abbrev}</span>
            <span style={{ fontSize: 11, color: T.textMuted, fontFamily: 'var(--gc-mono)' }}>{iv.semitones}</span>
            <span style={{ fontSize: 10, color: QUALITY_COLOR[iv.quality] ?? T.textDim }}>{iv.quality}</span>
          </div>
        ))}
      </div>

      <div style={card({ padding: '12px 14px' })}>
        <p style={SECTION}>Ear training hints</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            { abbrev: 'P5', hint: 'Star Wars theme' },
            { abbrev: 'P4', hint: 'Here Comes the Bride' },
            { abbrev: 'M3', hint: 'When the Saints Go Marching In' },
            { abbrev: 'm3', hint: 'Smoke on the Water riff' },
            { abbrev: 'M6', hint: 'My Bonnie Lies Over the Ocean' },
            { abbrev: 'TT', hint: 'The Simpsons theme' },
          ].map(({ abbrev, hint }) => (
            <div key={abbrev} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
              <span style={{ fontSize: 10, fontFamily: 'var(--gc-mono)', color: T.primary, fontWeight: 600, flexShrink: 0, minWidth: 28 }}>{abbrev}</span>
              <span style={{ fontSize: 11, color: T.textMuted }}>{hint}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 40, alignItems: 'start' }}>
      {mainContent}
      {sidePanel}
    </div>
  );
}
