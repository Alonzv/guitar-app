import React, { useEffect, useMemo, useState } from 'react';
import { T, card } from '../../theme';
import type { FretPosition, Tuning } from '../../types/music';
import { MiniFretboard } from '../Fretboard/MiniFretboard';
import { playChord, unlockAudio } from '../../utils/audioPlayback';
import {
  alternativeVoicings, type AltVoicing,
  type VoicingMode, type StringGroup,
} from '../../utils/voicingPaths';
import { reharmonizeChord } from '../../utils/reharmonize';

type Tab = 'positions' | 'reharm';

interface ReharmOption {
  chord: string;
  voicing: FretPosition[];
  label: string;
}

interface Props {
  chordName: string;
  prevChord: string | null;
  nextChord: string | null;
  mode: VoicingMode;
  stringGroup: StringGroup;
  tuning: Tuning;
  color: string;
  /** Replace the edited chord: keeps name for Positions, changes it for Reharm. */
  onReplace: (chordName: string, voicing: FretPosition[]) => void;
  onClose: () => void;
}

const LABEL: React.CSSProperties = {
  margin: 0, fontSize: 10, color: T.textMuted,
  textTransform: 'uppercase', letterSpacing: '-0.02em', fontWeight: 400,
};

// Small circular play button reused on every option card.
function PlayDot({ voicing, tuning, color }: { voicing: FretPosition[]; tuning: Tuning; color: string }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); unlockAudio(); playChord(voicing, tuning.openFreqs); }}
      title="Preview"
      style={{
        position: 'absolute', top: 4, right: 4, zIndex: 2,
        width: 22, height: 22, borderRadius: 0, cursor: 'pointer',
        border: `1px solid ${color}55`, background: T.bgCard, color,
        fontSize: 10, lineHeight: 1, padding: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >▶</button>
  );
}

export function ChordMicroEdit({
  chordName, prevChord, nextChord, mode, stringGroup, tuning, color,
  onReplace, onClose,
}: Props) {
  const [tab, setTab] = useState<Tab>('positions');

  // ── Positions — computed synchronously, instant render ──────────────────
  const positions: AltVoicing[] = useMemo(
    () => alternativeVoicings(chordName, mode, stringGroup, tuning.notes, 6),
    [chordName, mode, stringGroup, tuning.notes],
  );

  // ── Re-Harmonize — lazy, fetched once when the tab is first opened ──────
  const [reharm, setReharm] = useState<ReharmOption[] | null>(null);
  const [reharmLoading, setReharmLoading] = useState(false);
  const [reharmError, setReharmError] = useState<string | null>(null);

  useEffect(() => {
    if (tab !== 'reharm' || reharm || reharmLoading) return;
    setReharmLoading(true); setReharmError(null);
    reharmonizeChord({ target: chordName, prev: prevChord, next: nextChord, structure: mode })
      .then(names => {
        if (!names) { setReharmError('לא ניתן להציע אקורדים כרגע. נסה שוב.'); return; }
        // For each suggested chord, find a playable voicing in the same
        // mode/string-group so it drops straight into the path.
        const opts: ReharmOption[] = [];
        for (const chord of names) {
          const alt = alternativeVoicings(chord, mode, stringGroup, tuning.notes, 1)[0];
          if (alt) opts.push({ chord, voicing: alt.voicing, label: alt.label });
        }
        if (opts.length === 0) { setReharmError('האקורדים שהוצעו לא ניתנים לנגינה במסלול הזה.'); return; }
        setReharm(opts);
      })
      .catch(() => setReharmError('שגיאת רשת — נסה שוב.'))
      .finally(() => setReharmLoading(false));
  }, [tab, reharm, reharmLoading, chordName, prevChord, nextChord, mode, stringGroup, tuning.notes]);

  const contextLine = [prevChord, chordName, nextChord].filter(Boolean).join('  →  ');

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(0,0,0,0.62)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 16,
        animation: 'gcMicroFade 0.15s ease',
      }}
    >
      <style>{`
        @keyframes gcMicroFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes gcMicroPop {
          0%   { transform: scale(0.88); opacity: 0; }
          55%  { transform: scale(1.03); opacity: 1; }
          100% { transform: scale(1);    opacity: 1; }
        }
      `}</style>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 420, background: T.bgCard,
          border: `1px solid ${T.border}`, borderLeft: '4px solid var(--gc-bar-color)',
          padding: '18px 18px 20px', boxSizing: 'border-box',
          maxHeight: '90vh', overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: 14,
          transformOrigin: 'center',
          animation: 'gcMicroPop 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <p style={LABEL}>Edit chord</p>
            <div style={{ fontSize: 20, fontWeight: 800, color, lineHeight: 1.1 }}>{chordName}</div>
            <div style={{ fontSize: 11, color: T.textDim, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {contextLine}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{
            width: 28, height: 28, flexShrink: 0, borderRadius: 0, border: `1px solid ${T.border}`,
            background: T.bgInput, color: T.textMuted, fontSize: 15, cursor: 'pointer',
          }}>✕</button>
        </div>

        {/* Toggle */}
        <div style={{ display: 'flex', border: `1px solid ${T.border}` }}>
          {([['positions', 'Positions'], ['reharm', 'Re-Harmonize']] as [Tab, string][]).map(([id, lbl], i) => {
            const active = tab === id;
            return (
              <button key={id} onClick={() => setTab(id)} style={{
                flex: 1, padding: '9px 0', border: 'none', cursor: 'pointer',
                borderLeft: i > 0 ? `1px solid ${T.border}` : 'none',
                background: active ? T.secondary : T.bgInput,
                color: active ? '#fff' : T.textMuted,
                fontSize: 12, fontWeight: active ? 600 : 400,
                textTransform: 'uppercase', letterSpacing: '-0.02em',
              }}>{lbl}</button>
            );
          })}
        </div>

        <p style={{ margin: 0, fontSize: 10, color: T.textDim, fontStyle: 'italic' }}>
          {tab === 'positions'
            ? 'Same chord, different neck positions — tap a card to swap.'
            : 'Context-aware substitutes that flow from the previous into the next chord.'}
        </p>

        {/* Grid of option cards */}
        {tab === 'positions' ? (
          positions.length === 0 ? (
            <Empty text="No alternate positions found for this chord in the current mode / string group." />
          ) : (
            <CardGrid>
              {positions.map((alt, i) => (
                <OptionCard
                  key={i}
                  title={chordName}
                  subtitle={alt.label}
                  voicing={alt.voicing}
                  tuning={tuning} color={color}
                  onClick={() => onReplace(chordName, alt.voicing)}
                />
              ))}
            </CardGrid>
          )
        ) : reharmLoading ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: T.textDim, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <span style={{
              display: 'inline-block', width: 14, height: 14, border: `2px solid ${T.border}`,
              borderTopColor: color, borderRadius: 0, animation: 'spin 0.7s linear infinite',
            }} />
            Finding substitutes…
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : reharmError ? (
          <Empty text={reharmError} />
        ) : reharm && reharm.length > 0 ? (
          <CardGrid>
            {reharm.map((opt, i) => (
              <OptionCard
                key={i}
                title={opt.chord}
                subtitle={opt.label}
                voicing={opt.voicing}
                tuning={tuning} color={color}
                highlightTitle
                onClick={() => onReplace(opt.chord, opt.voicing)}
              />
            ))}
          </CardGrid>
        ) : null}
      </div>
    </div>
  );
}

// ── Small building blocks ──────────────────────────────────────────────────
const CardGrid: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>{children}</div>
);

const Empty: React.FC<{ text: string }> = ({ text }) => (
  <div style={{ ...card({ padding: '20px 14px' }), textAlign: 'center' }}>
    <p style={{ margin: 0, fontSize: 12, color: T.textMuted, lineHeight: 1.5 }}>{text}</p>
  </div>
);

function OptionCard({
  title, subtitle, voicing, tuning, color, onClick, highlightTitle,
}: {
  title: string; subtitle: string; voicing: FretPosition[];
  tuning: Tuning; color: string; onClick: () => void; highlightTitle?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        position: 'relative', display: 'flex', flexDirection: 'column', gap: 4,
        padding: '8px 6px 6px', cursor: 'pointer', textAlign: 'center',
        background: T.bgInput, border: `1px solid ${T.border}`,
        borderLeft: `3px solid ${color}`,
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = color + '88';
        (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 2px 12px ${color}33`;
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = T.border;
        (e.currentTarget as HTMLButtonElement).style.boxShadow = '';
      }}
    >
      <PlayDot voicing={voicing} tuning={tuning} color={color} />
      <span style={{ fontSize: 13, fontWeight: 800, color: highlightTitle ? color : T.text }}>{title}</span>
      <div style={{ background: T.bgCard, border: `1px solid ${color}22`, padding: '3px 3px 1px' }}>
        <MiniFretboard voicing={voicing} dotColor={color} tuning={tuning.notes} />
      </div>
      <span style={{ fontSize: 9, color: T.textDim, textTransform: 'uppercase', letterSpacing: '-0.02em' }}>{subtitle}</span>
    </button>
  );
}
