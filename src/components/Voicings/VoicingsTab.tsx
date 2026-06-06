import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Chord as TonalChord } from '@tonaljs/tonal';
import type { ChordInProgression, Tuning } from '../../types/music';
import { MiniFretboard } from '../Fretboard/MiniFretboard';
import { playChord, unlockAudio } from '../../utils/audioPlayback';
import {
  findVoicingPaths,
  type VoicingGenre,
  type VoicingMode,
  type StringGroup,
  type VoicingPath,
} from '../../utils/voicingPaths';
import { TUNINGS } from '../../utils/musicTheory';
import { T, card } from '../../theme';

interface Props {
  globalProgression?: ChordInProgression[];
  tuning?: Tuning;
}

const GENRES: { id: VoicingGenre; label: string }[] = [
  { id: 'any',       label: 'Any'         },
  { id: 'americana', label: 'Americana'   },
  { id: 'swamp',     label: 'Swamp Rock'  },
  { id: 'neo-soul',  label: 'Neo-Soul'    },
  { id: 'blues',     label: 'Blues'       },
  { id: 'rock',      label: 'Rock'        },
  { id: 'country',   label: 'Country'     },
];

const LABEL_STYLE: React.CSSProperties = {
  margin: 0,
  fontSize: 11,
  fontWeight: 700,
  color: T.textMuted,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};

const PATH_COLOR: Record<string, string> = {
  'Open Drones':   '#8b6914',
  'Open Position': '#629677',
  'Lower Neck':    '#2a6a8a',
  'Mid Neck':      '#7a3a6a',
  'Upper Neck':    '#C44900',
  'High Neck':     '#9a3a3a',
};

export function VoicingsTab({ globalProgression, tuning = TUNINGS[0] }: Props) {
  const [inputValue,   setInputValue]   = useState('');
  const [chords,       setChords]       = useState<string[]>([]);
  const [genre,        setGenre]        = useState<VoicingGenre>('any');
  const [mode,         setMode]         = useState<VoicingMode>('full');
  const [stringGroup,  setStringGroup]  = useState<StringGroup>('all');
  const [playingId,    setPlayingId]    = useState<string | null>(null);
  const playTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const parsed     = TonalChord.get(inputValue.trim());
  const inputValid = inputValue.trim().length > 0 && !parsed.empty;

  const paths = useMemo(() => {
    if (!chords.length) return [];
    return findVoicingPaths(chords, { genre, mode, stringGroup, tuning: tuning.notes });
  }, [chords, genre, mode, stringGroup, tuning]);

  useEffect(() => {
    playTimers.current.forEach(clearTimeout);
    playTimers.current = [];
    setPlayingId(null);
  }, [paths]);

  useEffect(() => () => { playTimers.current.forEach(clearTimeout); }, []);

  const addChord = () => {
    if (!inputValid || chords.length >= 8) return;
    setChords(prev => [...prev, inputValue.trim()]);
    setInputValue('');
  };

  const importProgression = () => {
    if (!globalProgression?.length) return;
    setChords(globalProgression.slice(0, 8).map(c => c.chord.name));
  };

  const playPath = (path: VoicingPath) => {
    playTimers.current.forEach(clearTimeout);
    playTimers.current = [];

    if (playingId === path.id) { setPlayingId(null); return; }

    setPlayingId(path.id);
    unlockAudio();

    path.voicings.forEach((voicing, i) => {
      const t = setTimeout(() => {
        playChord(voicing, tuning.openFreqs);
        if (i === path.voicings.length - 1) {
          const done = setTimeout(() => setPlayingId(null), 1400);
          playTimers.current.push(done);
        }
      }, i * 1300);
      playTimers.current.push(t);
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Chord input ──────────────────────────────────────────── */}
      <div style={{ ...card(), display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={LABEL_STYLE}>Chord Progression</p>

        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addChord()}
            placeholder="Am, F#m7, Cmaj7… (Enter to add)"
            style={{
              flex: 1, padding: '9px 12px', borderRadius: 8,
              border: `1px solid ${inputValid ? T.secondary : T.border}`,
              background: T.bgInput, color: T.text, fontSize: 14,
              outline: 'none', boxSizing: 'border-box',
              transition: 'border-color 0.15s',
            }}
          />
          <button
            onClick={addChord}
            disabled={!inputValid || chords.length >= 8}
            style={{
              padding: '9px 18px', borderRadius: 8, border: 'none',
              background: inputValid && chords.length < 8 ? T.secondary : T.border,
              color: T.white, fontWeight: 700, fontSize: 14,
              cursor: inputValid && chords.length < 8 ? 'pointer' : 'not-allowed',
              flexShrink: 0, transition: 'background 0.15s',
            }}
          >
            + Add
          </button>
        </div>

        {inputValid && (
          <div style={{ fontSize: 11, color: T.secondary, fontWeight: 600 }}>
            ✓ {parsed.name} · {parsed.notes.join(' · ')}
          </div>
        )}

        {chords.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            {chords.map((c, i) => (
              <span key={i} style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '4px 10px', borderRadius: 20,
                background: T.bgDeep, border: `1px solid ${T.border}`,
                fontSize: 13, fontWeight: 700, color: T.text,
              }}>
                {c}
                <button
                  onClick={() => setChords(prev => prev.filter((_, j) => j !== i))}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: T.textMuted, fontSize: 15, lineHeight: 1 }}
                >×</button>
              </span>
            ))}
            <button
              onClick={() => setChords([])}
              style={{
                padding: '4px 10px', borderRadius: 20,
                background: 'none', border: `1px solid ${T.border}`,
                fontSize: 11, color: T.textMuted, cursor: 'pointer', fontWeight: 600,
              }}
            >Clear all</button>
          </div>
        )}

        {globalProgression && globalProgression.length > 0 && (
          <button
            onClick={importProgression}
            style={{
              alignSelf: 'flex-start', padding: '6px 14px', borderRadius: 8,
              border: `1px solid ${T.border}`, background: T.bgInput,
              color: T.textMuted, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >
            ↓ Import my progression ({globalProgression.length})
          </button>
        )}
      </div>

      {/* ── Genre chips ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p style={LABEL_STYLE}>Vibe</p>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
          {GENRES.map(g => (
            <button
              key={g.id}
              onClick={() => setGenre(g.id)}
              style={{
                flexShrink: 0, padding: '7px 15px', borderRadius: 20,
                border: genre === g.id ? 'none' : `1px solid ${T.border}`,
                background: genre === g.id ? T.primary : T.bgInput,
                color: genre === g.id ? T.white : T.textMuted,
                fontSize: 12, fontWeight: genre === g.id ? 700 : 400,
                cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
              }}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Mode + String group ───────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ ...card({ padding: '10px 14px' }), display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 160 }}>
          <span style={{ ...LABEL_STYLE, whiteSpace: 'nowrap' }}>Mode</span>
          <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: `1px solid ${T.border}`, flex: 1 }}>
            {(['full', 'triads'] as VoicingMode[]).map(m => (
              <button key={m} onClick={() => setMode(m)} style={{
                flex: 1, padding: '6px 0', border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 700,
                background: mode === m ? T.secondary : T.bgInput,
                color: mode === m ? T.white : T.textMuted,
                transition: 'background 0.15s',
              }}>
                {m === 'full' ? 'Full' : 'Triads'}
              </button>
            ))}
          </div>
        </div>

        <div style={{ ...card({ padding: '10px 14px' }), display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 200 }}>
          <span style={{ ...LABEL_STYLE, whiteSpace: 'nowrap' }}>Strings</span>
          <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: `1px solid ${T.border}`, flex: 1 }}>
            {(['all', 'bass', 'treble'] as StringGroup[]).map(sg => (
              <button key={sg} onClick={() => setStringGroup(sg)} style={{
                flex: 1, padding: '6px 0', border: 'none', cursor: 'pointer',
                fontSize: 11, fontWeight: 700,
                background: stringGroup === sg ? T.secondary : T.bgInput,
                color: stringGroup === sg ? T.white : T.textMuted,
                transition: 'background 0.15s', textTransform: 'capitalize',
              }}>
                {sg === 'all' ? 'All' : sg.charAt(0).toUpperCase() + sg.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Empty state ───────────────────────────────────────────── */}
      {chords.length === 0 && (
        <div style={{ ...card(), textAlign: 'center', padding: '40px 16px' }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🎸</div>
          <p style={{ margin: 0, fontSize: 14, color: T.textMuted, lineHeight: 1.5 }}>
            Add chords above to generate<br />intelligent voicing paths
          </p>
        </div>
      )}

      {/* ── No paths found ────────────────────────────────────────── */}
      {chords.length > 0 && paths.length === 0 && (
        <div style={{ ...card(), textAlign: 'center', padding: '28px 16px' }}>
          <p style={{ margin: 0, fontSize: 14, color: T.textMuted }}>
            No playable paths found. Try <b>Full</b> mode or <b>All</b> strings.
          </p>
        </div>
      )}

      {/* ── Paths ─────────────────────────────────────────────────── */}
      {paths.map((path, pi) => {
        const color     = PATH_COLOR[path.label] ?? T.primary;
        const isPlaying = playingId === path.id;

        return (
          <div key={path.id} style={{ ...card(), display: 'flex', flexDirection: 'column', gap: 10 }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                width: 22, height: 22, borderRadius: '50%',
                background: color, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 800, flexShrink: 0,
              }}>
                {pi + 1}
              </span>
              <span style={{ fontWeight: 700, fontSize: 13, color: T.text, flex: 1 }}>
                {path.label}
              </span>
              <button
                onClick={() => playPath(path)}
                style={{
                  padding: '5px 14px', borderRadius: 8, border: 'none',
                  background: isPlaying ? color : T.bgDeep,
                  color: isPlaying ? '#fff' : T.textMuted,
                  fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {isPlaying ? '■ Stop' : '▶ Play'}
              </button>
            </div>

            {/* Chord diagram row */}
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
              {path.voicings.map((voicing, ci) => {
                const nonOpen = voicing.filter(p => p.fret > 0);
                const lowestFret = nonOpen.length ? Math.min(...nonOpen.map(p => p.fret)) : 0;
                const hasOpen = voicing.some(p => p.fret === 0);

                return (
                  <div key={ci} style={{
                    flexShrink: 0, width: 120,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                  }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: isPlaying ? color : T.text }}>
                      {chords[ci]}
                    </span>
                    <div style={{
                      width: '100%', background: T.bgDeep,
                      borderRadius: 8, border: `1px solid ${isPlaying ? color : T.border}`,
                      padding: 4, boxSizing: 'border-box',
                      transition: 'border-color 0.2s',
                    }}>
                      <MiniFretboard voicing={voicing} dotColor={color} tuning={tuning.notes} />
                    </div>
                    <span style={{ fontSize: 9, color: T.textMuted }}>
                      {hasOpen ? 'open' : `${lowestFret}fr`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
