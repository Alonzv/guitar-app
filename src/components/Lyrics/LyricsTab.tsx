import { useState, useRef } from 'react';
import type { ChordInProgression, ChordPlacement } from '../../types/music';
import { formatChordName } from '../../utils/chordIdentifier';
import { T, card } from '../../theme';

interface Props {
  progression: ChordInProgression[];
}

const CHORD_ACCENTS = [T.primary, T.secondary, '#8b6914', '#7a3a6a', '#2a6a8a', '#4a7a3a'];

function tokenizeLyrics(text: string): { lines: string[][] } {
  const lines = text.split('\n');
  return { lines: lines.map(line => line.split(/\s+/).filter(Boolean)) };
}

function getGlobalIndex(lines: string[][], lineIdx: number, wordIdx: number): number {
  let idx = 0;
  for (let l = 0; l < lineIdx; l++) idx += lines[l].length;
  return idx + wordIdx;
}

export function LyricsTab({ progression }: Props) {
  const [lyricsText, setLyricsText] = useState('');
  const [lyricsChords, setLyricsChords] = useState<ChordPlacement[]>([]);
  const [selectedChip, setSelectedChip] = useState<string | null>(null);
  const [isRtl, setIsRtl] = useState(true); // default RTL for Hebrew
  const dragData = useRef<{ type: 'new'; chordName: string } | { type: 'move'; placementId: string } | null>(null);

  const { lines } = tokenizeLyrics(lyricsText);
  const totalWords = lines.reduce((sum, l) => sum + l.length, 0);

  const placeChord = (wordIndex: number, chordName: string) => {
    setLyricsChords(prev => {
      const filtered = prev.filter(c => c.wordIndex !== wordIndex);
      return [...filtered, { id: `lc-${Date.now()}-${wordIndex}`, chordName, wordIndex }];
    });
  };

  const moveChord = (placementId: string, newWordIndex: number) => {
    setLyricsChords(prev => {
      const existing = prev.find(c => c.id === placementId);
      if (!existing) return prev;
      const filtered = prev.filter(c => c.id !== placementId && c.wordIndex !== newWordIndex);
      return [...filtered, { ...existing, wordIndex: newWordIndex }];
    });
  };

  const removeChord = (placementId: string) => {
    setLyricsChords(prev => prev.filter(c => c.id !== placementId));
  };

  const handleWordClick = (wordIndex: number) => {
    if (selectedChip) {
      placeChord(wordIndex, selectedChip);
      setSelectedChip(null);
    }
  };

  const handleWordDrop = (e: React.DragEvent, wordIndex: number) => {
    e.preventDefault();
    const data = dragData.current;
    if (!data) return;
    if (data.type === 'new') {
      placeChord(wordIndex, data.chordName);
    } else {
      moveChord(data.placementId, wordIndex);
    }
    dragData.current = null;
  };

  const handleChipDragStart = (e: React.DragEvent, chordName: string) => {
    dragData.current = { type: 'new', chordName };
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handlePlacedChordDragStart = (e: React.DragEvent, placementId: string) => {
    e.stopPropagation();
    dragData.current = { type: 'move', placementId };
    e.dataTransfer.effectAllowed = 'move';
  };

  const chordAtWord = (wordIndex: number) =>
    lyricsChords.find(c => c.wordIndex === wordIndex);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── RTL / LTR toggle ── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={() => setIsRtl(v => !v)}
          style={{
            padding: '5px 14px', borderRadius: 20,
            border: `1px solid ${T.border}`, cursor: 'pointer',
            fontSize: 12, fontWeight: 500,
            background: isRtl ? T.primaryBg : T.bgInput,
            color: isRtl ? T.primary : T.textMuted,
          }}
        >
          {isRtl ? 'כיוון: ימין ← שמאל' : 'Direction: Left → Right'}
        </button>
      </div>

      {/* ── Chord strip ── */}
      <div style={card()}>
        <p style={{ margin: '0 0 10px', fontSize: 11, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {progression.length > 0 ? 'גרור אקורד או לחץ עליו, ואז לחץ על מילה למטה' : 'הוסף אקורדים לפרוגרסיה תחילה'}
        </p>
        {progression.length > 0 ? (
          <div className="gc-chip-strip">
            {progression.map((item, i) => {
              const accent = CHORD_ACCENTS[i % CHORD_ACCENTS.length];
              const name = formatChordName(item.chord.name);
              const isSelected = selectedChip === name;
              return (
                <div
                  key={item.id}
                  draggable
                  onDragStart={e => { setSelectedChip(null); handleChipDragStart(e, name); }}
                  onClick={() => setSelectedChip(prev => prev === name ? null : name)}
                  style={{
                    flexShrink: 0,
                    padding: '8px 14px',
                    borderRadius: 10,
                    background: isSelected ? accent + '33' : T.bgInput,
                    border: `2px solid ${isSelected ? accent : T.border}`,
                    color: accent,
                    fontSize: 16,
                    fontWeight: 800,
                    cursor: 'grab',
                    userSelect: 'none',
                    transition: 'border-color 0.15s, background 0.15s',
                    direction: 'ltr', // chord names are always LTR
                  }}
                >
                  {name}
                </div>
              );
            })}
          </div>
        ) : (
          <p style={{ color: T.textDim, fontSize: 13, margin: 0, direction: isRtl ? 'rtl' : 'ltr', textAlign: isRtl ? 'right' : 'left' }}>
            עבור לטאב Chord Builder או Chord Picker כדי להוסיף אקורדים.
          </p>
        )}
        {selectedChip && (
          <p style={{ marginTop: 8, marginBottom: 0, fontSize: 12, color: T.primary, direction: isRtl ? 'rtl' : 'ltr', textAlign: isRtl ? 'right' : 'left' }}>
            <strong style={{ direction: 'ltr', display: 'inline-block' }}>{selectedChip}</strong> — לחץ על מילה למטה כדי למקם
          </p>
        )}
      </div>

      {/* ── Lyrics textarea ── */}
      <div style={card()}>
        <p style={{ margin: '0 0 10px', fontSize: 11, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          מילים
        </p>
        <textarea
          value={lyricsText}
          dir={isRtl ? 'rtl' : 'ltr'}
          onChange={e => {
            setLyricsText(e.target.value);
            const newLines = e.target.value.split('\n').map(l => l.split(/\s+/).filter(Boolean));
            const newTotal = newLines.reduce((s, l) => s + l.length, 0);
            setLyricsChords(prev => prev.filter(c => c.wordIndex < newTotal));
          }}
          placeholder={isRtl ? 'כתוב את המילים כאן…' : 'Type your lyrics here…'}
          rows={5}
          style={{
            width: '100%',
            background: T.bgInput,
            border: `1px solid ${T.border}`,
            borderRadius: 8,
            color: T.text,
            fontSize: 14,
            lineHeight: 1.6,
            padding: '10px 12px',
            resize: 'vertical',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            boxSizing: 'border-box',
            direction: isRtl ? 'rtl' : 'ltr',
            textAlign: isRtl ? 'right' : 'left',
          }}
        />
      </div>

      {/* ── Lead sheet ── */}
      {totalWords > 0 && (
        <div style={card()}>
          <p style={{ margin: '0 0 14px', fontSize: 11, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {lyricsChords.length > 0 ? 'לחץ על אקורד מעל מילה כדי למחוק · גרור להזזה' : 'שחרר אקורד מעל מילה'}
          </p>
          <div style={{
            lineHeight: 2.8,
            fontFamily: 'system-ui, -apple-system, sans-serif',
            direction: isRtl ? 'rtl' : 'ltr',
            textAlign: isRtl ? 'right' : 'left',
          }}>
            {lines.map((lineWords, lineIdx) => {
              if (lineWords.length === 0) {
                return <br key={`line-${lineIdx}-empty`} />;
              }
              return (
                <span key={`line-${lineIdx}`} style={{ display: 'block', marginBottom: 4 }}>
                  {lineWords.map((word, wordIdx) => {
                    const globalIdx = getGlobalIndex(lines, lineIdx, wordIdx);
                    const placement = chordAtWord(globalIdx);
                    const isDropTarget = selectedChip !== null;

                    return (
                      <span
                        key={`${lineIdx}-${wordIdx}`}
                        style={{
                          position: 'relative',
                          display: 'inline-block',
                          // In RTL mode, margin goes on the left side (before the word in visual order)
                          marginLeft: isRtl ? 8 : 0,
                          marginRight: isRtl ? 0 : 8,
                          paddingTop: 22,
                          cursor: isDropTarget ? 'pointer' : 'default',
                          borderBottom: isDropTarget ? `1px dashed ${T.border}` : 'none',
                        }}
                        onDragOver={e => e.preventDefault()}
                        onDrop={e => handleWordDrop(e, globalIdx)}
                        onClick={() => handleWordClick(globalIdx)}
                      >
                        {/* Chord label — always LTR regardless of text direction */}
                        {placement && (
                          <span
                            draggable
                            onDragStart={e => handlePlacedChordDragStart(e, placement.id)}
                            onClick={e => { e.stopPropagation(); removeChord(placement.id); }}
                            style={{
                              position: 'absolute',
                              top: 0,
                              // In RTL, align chord label to the right edge of the word span
                              right: isRtl ? 0 : 'auto',
                              left: isRtl ? 'auto' : 0,
                              fontSize: 12,
                              fontWeight: 800,
                              color: T.primary,
                              cursor: 'pointer',
                              whiteSpace: 'nowrap',
                              userSelect: 'none',
                              lineHeight: 1,
                              direction: 'ltr', // chord names are always LTR
                            }}
                            title="לחץ להסרה · גרור להזזה"
                          >
                            {placement.chordName}
                          </span>
                        )}
                        <span style={{ color: T.text, fontSize: 15 }}>{word}</span>
                      </span>
                    );
                  })}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
