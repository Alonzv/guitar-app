import React, { useState } from 'react';
import { T } from '../theme';

const SLIDES = [
  {
    icon: '🎸',
    title: 'Welcome to ScaleUp',
    body: 'Your complete guitar toolkit — build chords, explore scales, write lyrics, and tune up with the built-in Tuner & Metronome.',
  },
  {
    icon: '🎵',
    title: 'Build Your Progression',
    body: 'Tap the fretboard to place notes and identify any chord. Or use Chord Finder to look up chords by name. Hear each chord play back as you build.',
  },
  {
    icon: '🎼',
    title: 'Scales & Tools',
    body: 'Detect the scales that fit your progression, explore fretboard patterns, write a full lead sheet with lyrics, and use the built-in Tuner & Metronome.',
  },
];

export const Onboarding: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const [slide, setSlide] = useState(0);
  const isLast = slide === SLIDES.length - 1;
  const { icon, title, body } = SLIDES[slide];

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(46,74,90,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }}>
      <div style={{
        background: T.bgCard, borderRadius: 22, maxWidth: 380, width: '100%',
        padding: '36px 28px 28px', border: `1px solid ${T.border}`,
        boxShadow: '0 24px 64px rgba(46,74,90,0.25)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
      }}>
        <div style={{ fontSize: 56, lineHeight: 1 }}>{icon}</div>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: T.text, textAlign: 'center', letterSpacing: '-0.3px' }}>{title}</h2>
        <p style={{ margin: 0, fontSize: 15, color: T.textMuted, textAlign: 'center', lineHeight: 1.6 }}>{body}</p>

        {/* Progress dots */}
        <div style={{ display: 'flex', gap: 6 }}>
          {SLIDES.map((_, i) => (
            <div key={i} onClick={() => setSlide(i)} style={{
              height: 8, borderRadius: 4, cursor: 'pointer', transition: 'all 0.2s',
              width: i === slide ? 22 : 8,
              background: i === slide ? T.primary : T.border,
            }} />
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, width: '100%', marginTop: 4 }}>
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
