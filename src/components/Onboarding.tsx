import React, { useState } from 'react';
import { T } from '../theme';
import { InteractiveFretboard } from './Fretboard/InteractiveFretboard';
import { MiniFretboard } from './Fretboard/MiniFretboard';
import { identifyChord, formatChordName } from '../utils/chordIdentifier';
import type { FretPosition } from '../types/music';

// Preset Am voicing for slide 1
const AM_VOICING: FretPosition[] = [
  { string: 1, fret: 2 },
  { string: 2, fret: 2 },
  { string: 3, fret: 2 },
  { string: 4, fret: 0 },
  { string: 5, fret: 0 },
];

export const Onboarding: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const [slide, setSlide] = useState(0);
  const [localDots, setLocalDots] = useState<FretPosition[]>([]);
  const [slide1Added, setSlide1Added] = useState(false);

  const handleToggle = (pos: FretPosition) => {
    setLocalDots(prev => {
      const exists = prev.findIndex(d => d.string === pos.string && d.fret === pos.fret);
      if (exists !== -1) return prev.filter((_, i) => i !== exists);
      return [...prev.filter(d => d.string !== pos.string), pos];
    });
  };

  const detectedChords = localDots.length >= 2 ? identifyChord(localDots) : [];
  const chordLabel = detectedChords.length > 0 ? formatChordName(detectedChords[0].name) : '';

  const slides = [
    {
      title: 'Welcome to ScaleUp',
      content: (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ margin: 0, fontSize: 14, color: T.textMuted, textAlign: 'center', lineHeight: 1.5 }}>
            {localDots.length === 0
              ? 'Tap the fretboard below to place notes'
              : chordLabel
                ? `✓ ${chordLabel} — nice chord!`
                : 'Keep adding notes…'}
          </p>
          <InteractiveFretboard activeDots={localDots} onToggle={handleToggle} />
        </div>
      ),
    },
    {
      title: 'Build Your Progression',
      content: (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <MiniFretboard voicing={AM_VOICING} />
          <p style={{ margin: 0, fontSize: 13, color: T.textMuted, textAlign: 'center', lineHeight: 1.5 }}>
            Every chord you identify can be added to your progression. Build a sequence and hear it play!
          </p>
          <button
            onClick={() => setSlide1Added(true)}
            style={{
              width: '100%', padding: '10px 0', borderRadius: 10, border: 'none',
              background: slide1Added ? T.secondary : T.primary,
              color: T.white, fontWeight: 700, fontSize: 14, cursor: 'pointer',
              transition: 'background 0.3s',
            }}
          >
            {slide1Added ? '✓ Added to Progression!' : '+ Add to Progression'}
          </button>
        </div>
      ),
    },
    {
      title: 'Scales, Lyrics & Tools',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { icon: '🎼', text: 'Scales tab auto-detects scales from your progression' },
            { icon: '📝', text: 'Lyrics tab lets you write lead sheets with chords above words' },
            { icon: '🎤', text: 'Tuner listens to your guitar in real time' },
            { icon: '🥁', text: 'Metronome keeps your practice in time' },
          ].map(({ icon, text }) => (
            <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 22, flexShrink: 0 }}>{icon}</span>
              <span style={{ fontSize: 13, color: T.textMuted, lineHeight: 1.4 }}>{text}</span>
            </div>
          ))}
        </div>
      ),
    },
  ];

  const isLast = slide === slides.length - 1;
  const { title, content } = slides[slide];

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(46,74,90,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }}>
      <div style={{
        background: T.bgCard, borderRadius: 22, maxWidth: 390, width: '100%',
        padding: '28px 24px 24px', border: `1px solid ${T.border}`,
        boxShadow: '0 24px 64px rgba(46,74,90,0.25)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
      }}>
        {slide === 0 && (
          <img src="/favicon.png" alt="ScaleUp" style={{ width: 56, height: 56, borderRadius: 14 }} />
        )}
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: T.text, textAlign: 'center', letterSpacing: '-0.3px' }}>
          {title}
        </h2>

        {content}

        {/* Progress dots */}
        <div style={{ display: 'flex', gap: 6 }}>
          {slides.map((_, i) => (
            <div key={i} onClick={() => setSlide(i)} style={{
              height: 8, borderRadius: 4, cursor: 'pointer', transition: 'all 0.2s',
              width: i === slide ? 22 : 8,
              background: i === slide ? T.primary : T.border,
            }} />
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, width: '100%' }}>
          {!isLast && (
            <button onClick={onDone} style={{
              flex: 1, padding: '12px 0', borderRadius: 10, border: `1px solid ${T.border}`,
              background: T.bgInput, color: T.textMuted, fontWeight: 600, fontSize: 14, cursor: 'pointer',
            }}>Skip</button>
          )}
          <button
            onClick={isLast ? onDone : () => setSlide(s => s + 1)}
            style={{
              flex: 2, padding: '12px 0', borderRadius: 10, border: 'none',
              background: T.primary, color: T.white, fontWeight: 800, fontSize: 15, cursor: 'pointer',
            }}
          >
            {isLast ? 'Get Started' : 'Next →'}
          </button>
        </div>
      </div>
    </div>
  );
};
