import React, { useState } from 'react';
import type { ScaleMatch } from '../../types/music';
import { DisplayFretboard, type DisplayDot } from '../Fretboard/DisplayFretboard';
import { getScalePositions } from '../../utils/scaleUtils';
import { STRING_COUNT } from '../../utils/musicTheory';
import { Scale } from '@tonaljs/tonal';
import { T, card } from '../../theme';

interface Props { scale: ScaleMatch | null }

const FRET_COUNT = 12;
const POS_COLORS = [T.primary, T.secondary, '#c4a000', '#8a4aa0', '#2a7aa0'];

export const ScaleVisualizer: React.FC<Props> = ({ scale }) => {
  const [viewMode, setViewMode] = useState<'fretboard' | 'tab'>('fretboard');
  const [selectedPos, setSelectedPos] = useState<number | null>(null);

  if (!scale) return (
    <div style={{ textAlign: 'center', padding: '48px 16px', color: T.textDim, fontSize: 14, border: `1px dashed ${T.border}`, borderRadius: 14 }}>
      Select a scale from Detect Scales to visualize it here
    </div>
  );

  const allPositions  = getScalePositions(scale.root, scale.type);
  const boxSize       = Math.ceil(FRET_COUNT / 5);
  const positions     = Array.from({ length: 5 }, (_, i) => {
    const min = i * boxSize;
    return allPositions.filter(p => p.fret >= min && p.fret <= min + boxSize + 1);
  });

  const displayPos    = selectedPos !== null ? positions[selectedPos] : allPositions;
  const scaleInfo     = Scale.get(`${scale.root} ${scale.type}`);
  const scaleNotes    = scaleInfo.notes;

  const dots: DisplayDot[] = displayPos.map(p => {
    const posIdx = selectedPos !== null ? selectedPos : Math.min(Math.floor(p.fret / boxSize), 4);
    return { ...p, color: POS_COLORS[posIdx % POS_COLORS.length] };
  });

  const generateTab = () => {
    const stringNames = ['e', 'B', 'G', 'D', 'A', 'E'];
    const lines: string[][] = Array.from({ length: STRING_COUNT }, () => []);
    for (let s = 0; s < STRING_COUNT; s++) {
      lines[s] = (selectedPos !== null ? positions[selectedPos] : allPositions)
        .filter(p => p.string === s)
        .sort((a, b) => a.fret - b.fret)
        .map(p => String(p.fret));
    }
    const maxLen = Math.max(...lines.map(l => l.length));
    return lines
      .map((line, s) => `${stringNames[STRING_COUNT - 1 - s]}|${Array.from({ length: maxLen }, (_, i) => (line[i] ?? '-').padEnd(2, '-')).join('-')}|`)
      .join('\n');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Header */}
      <div style={card({ padding: '12px 16px' })}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 17, fontWeight: 800, color: T.text }}>{scale.name}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: T.primary }}>{scale.fitPercent}% match</span>
        </div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {scaleNotes.map((n, i) => (
            <span key={i} style={{ padding: '2px 9px', borderRadius: 6, fontSize: 12, background: T.bgInput, color: T.text, border: `1px solid ${T.border}` }}>
              {n}
            </span>
          ))}
        </div>
      </div>

      {/* View toggle */}
      <div style={{ display: 'flex', gap: 7 }}>
        {(['fretboard', 'tab'] as const).map(v => (
          <button key={v} onClick={() => setViewMode(v)} style={{
            flex: 1, padding: '9px 0', borderRadius: 10, cursor: 'pointer',
            fontSize: 13, fontWeight: viewMode === v ? 700 : 400, border: 'none',
            background: viewMode === v ? T.primary : T.bgCard,
            color: viewMode === v ? T.text : T.textMuted,
          }}>
            {v === 'fretboard' ? '🎸 Fretboard' : '📋 Tab'}
          </button>
        ))}
      </div>

      {/* Position selector */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'nowrap', overflowX: 'auto', scrollbarWidth: 'none' }}>
        <span style={{ fontSize: 11, color: T.textMuted }}>Position:</span>
        <button onClick={() => setSelectedPos(null)} style={{
          padding: '4px 13px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 11,
          background: selectedPos === null ? T.text : T.bgInput,
          color: selectedPos === null ? T.bgDeep : T.textMuted,
          fontWeight: selectedPos === null ? 700 : 400,
        }}>All</button>
        {positions.map((_, i) => (
          <button key={i} onClick={() => setSelectedPos(selectedPos === i ? null : i)} style={{
            width: 'var(--gc-pos-btn)', height: 'var(--gc-pos-btn)',
            borderRadius: '50%', cursor: 'pointer',
            fontSize: 12, fontWeight: 700, background: POS_COLORS[i], color: '#fff', border: 'none',
            opacity: selectedPos === i ? 1 : 0.7,
            outline: selectedPos === i ? `2px solid ${T.text}` : 'none',
            flexShrink: 0,
          }}>
            {i + 1}
          </button>
        ))}
      </div>

      {viewMode === 'fretboard' ? (
        <div style={card()}>
          <DisplayFretboard dots={dots} compact />
        </div>
      ) : (
        <div style={{ ...card(), background: T.bgDeep, overflowX: 'auto' }}>
          <pre style={{ fontSize: 12, color: T.secondary, fontFamily: 'monospace', lineHeight: 1.7, margin: 0, whiteSpace: 'pre' }}>
            {generateTab()}
          </pre>
        </div>
      )}
    </div>
  );
};
