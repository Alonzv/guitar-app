import { useState, useRef, useEffect } from 'react';
import type { ChordInProgression, ChordPlacement, SavedLyrics } from '../../types/music';
import { formatChordName } from '../../utils/chordIdentifier';
import { exportLyricsPDF } from '../../utils/pdfExport';
import { T, card } from '../../theme';

interface Props {
  progression: ChordInProgression[];
  onSaveLyrics?: (data: Omit<SavedLyrics, 'id' | 'createdAt' | 'updatedAt'>) => void;
  lyricsToLoad?: SavedLyrics | null;
  onLyricsLoaded?: () => void;
}

const CHORD_ACCENTS = [T.primary, T.secondary, '#8b6914', '#7a3a6a', '#2a6a8a', '#4a7a3a'];

const LABEL_STYLE = {
  margin: '0 0 10px',
  fontSize: 11,
  fontWeight: 700 as const,
  color: T.textMuted,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.06em',
};

function tokenizeLyrics(text: string): { lines: string[][] } {
  const lines = text.split('\n');
  return { lines: lines.map(line => line.split(/\s+/).filter(Boolean)) };
}

function getGlobalIndex(lines: string[][], lineIdx: number, wordIdx: number): number {
  let idx = 0;
  for (let l = 0; l < lineIdx; l++) idx += lines[l].length;
  return idx + wordIdx;
}

interface ChordPicker {
  wordIndex: number;
  x: number;
  y: number;
}

export function LyricsTab({ progression, onSaveLyrics, lyricsToLoad, onLyricsLoaded }: Props) {
  const [lyricsText, setLyricsText] = useState('');
  const [lyricsChords, setLyricsChords] = useState<ChordPlacement[]>([]);
  const [selectedChip, setSelectedChip] = useState<string | null>(null);
  const [isRtl, setIsRtl] = useState(true);
  const [chordPicker, setChordPicker] = useState<ChordPicker | null>(null);

  // Song info
  const [songTitle,    setSongTitle]    = useState('');
  const [songComposer, setSongComposer] = useState('');
  const [songWriter,   setSongWriter]   = useState('');

  const [exporting, setExporting] = useState(false);

  const dragData = useRef<{ type: 'new'; chordName: string } | { type: 'move'; placementId: string } | null>(null);

  // Load from library
  useEffect(() => {
    if (!lyricsToLoad) return;
    setSongTitle(lyricsToLoad.name);
    setSongComposer(lyricsToLoad.composer);
    setSongWriter(lyricsToLoad.writer);
    setLyricsText(lyricsToLoad.lyricsText);
    setLyricsChords(lyricsToLoad.lyricsChords);
    setIsRtl(lyricsToLoad.isRtl);
    onLyricsLoaded?.();
  }, [lyricsToLoad]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleWordClick = (wordIndex: number, e: React.MouseEvent) => {
    if (selectedChip) {
      placeChord(wordIndex, selectedChip);
      setSelectedChip(null);
      return;
    }
    // Show chord picker popup if progression has chords
    if (progression.length > 0) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setChordPicker({ wordIndex, x: rect.left, y: rect.bottom + 4 });
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

  const handleExportPDF = async () => {
    setExporting(true);
    try {
      await exportLyricsPDF(songTitle, songComposer, songWriter, lyricsText, lyricsChords);
    } finally {
      setExporting(false);
    }
  };

  const inputStyle = (rtl = true): React.CSSProperties => ({
    width: '100%', padding: '8px 10px', borderRadius: 8,
    border: `1px solid ${T.border}`, background: T.bgInput,
    color: T.text, fontSize: 13, fontFamily: 'inherit',
    boxSizing: 'border-box',
    direction: rtl ? 'rtl' : 'ltr',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── RTL toggle ── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={() => setIsRtl(v => !v)}
          style={{
            padding: '5px 14px', borderRadius: 20,
            border: `1px solid ${T.border}`, cursor: 'pointer',
            fontSize: 12, fontWeight: 500,
            background: isRtl ? T.primaryBg : T.bgInput,
            color: isRtl ? T.primary : T.textMuted,
            transition: 'filter 0.15s',
          }}
        >
          {isRtl ? 'Direction: Right → Left' : 'Direction: Left → Right'}
        </button>
      </div>

      {/* ── Song info ── */}
      <div style={card()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <p style={{ ...LABEL_STYLE, margin: 0 }}>Song Details</p>
          <div style={{ display: 'flex', gap: 6 }}>
            {onSaveLyrics && (
              <button
                onClick={() => onSaveLyrics({
                  name: songTitle.trim() || 'Untitled Song',
                  lyricsText, lyricsChords, composer: songComposer, writer: songWriter, isRtl,
                })}
                style={{
                  padding: '4px 12px', borderRadius: 16, border: 'none',
                  background: T.secondary, color: T.white, fontSize: 11,
                  cursor: 'pointer', fontWeight: 700,
                }}
              >💾 Save</button>
            )}
            {lyricsText.trim() && (
              <button
                onClick={handleExportPDF}
                disabled={exporting}
                style={{
                  padding: '4px 12px', borderRadius: 16, border: `1px solid ${T.border}`,
                  background: T.bgInput, color: T.textMuted, fontSize: 11,
                  cursor: exporting ? 'not-allowed' : 'pointer', fontWeight: 600,
                  transition: 'filter 0.15s',
                }}
              >
                {exporting ? '…' : '📄 Export PDF'}
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            value={songTitle}
            onChange={e => setSongTitle(e.target.value)}
            placeholder="Song title…"
            style={inputStyle(isRtl)}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <input
              value={songWriter}
              onChange={e => setSongWriter(e.target.value)}
              placeholder="Lyricist…"
              style={inputStyle(isRtl)}
            />
            <input
              value={songComposer}
              onChange={e => setSongComposer(e.target.value)}
              placeholder="Composer…"
              style={inputStyle(isRtl)}
            />
          </div>
        </div>
      </div>

      {/* ── Chord strip ── */}
      <div style={card()}>
        <p style={LABEL_STYLE}>
          {progression.length > 0 ? 'Click a word to assign a chord · click a chip to select it then click a word' : 'Add chords to the progression first'}
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
                    cursor: 'pointer',
                    userSelect: 'none',
                    transition: 'border-color 0.15s, background 0.15s',
                    direction: 'ltr',
                  }}
                >
                  {name}
                </div>
              );
            })}
          </div>
        ) : (
          <p style={{ color: T.textDim, fontSize: 13, margin: 0, direction: isRtl ? 'rtl' : 'ltr', textAlign: isRtl ? 'right' : 'left' }}>
            Go to the Chords tab to add chords.
          </p>
        )}
        {selectedChip && (
          <p style={{ marginTop: 8, marginBottom: 0, fontSize: 12, color: T.primary, direction: isRtl ? 'rtl' : 'ltr', textAlign: isRtl ? 'right' : 'left' }}>
            <strong style={{ direction: 'ltr', display: 'inline-block' }}>{selectedChip}</strong> — click a word below to place it
          </p>
        )}
      </div>

      {/* ── Lyrics textarea ── */}
      <div style={card()}>
        <p style={LABEL_STYLE}>Lyrics</p>
        <textarea
          value={lyricsText}
          dir={isRtl ? 'rtl' : 'ltr'}
          onChange={e => {
            setLyricsText(e.target.value);
            const newLines = e.target.value.split('\n').map(l => l.split(/\s+/).filter(Boolean));
            const newTotal = newLines.reduce((s, l) => s + l.length, 0);
            setLyricsChords(prev => prev.filter(c => c.wordIndex < newTotal));
          }}
          placeholder="Type your lyrics here…"
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
        <div style={card()} onClick={() => setChordPicker(null)}>
          <p style={LABEL_STYLE}>
            {lyricsChords.length > 0 ? 'Click a word to assign a chord · click a chord above a word to delete it' : 'Click a word to assign a chord'}
          </p>
          <div style={{
            fontFamily: 'system-ui, -apple-system, sans-serif',
            direction: isRtl ? 'rtl' : 'ltr',
            textAlign: isRtl ? 'right' : 'left',
          }}>
            {lines.map((lineWords, lineIdx) => {
              if (lineWords.length === 0) {
                return <div key={`line-${lineIdx}-empty`} style={{ height: 10 }} />;
              }
              return (
                <span key={`line-${lineIdx}`} style={{ display: 'block', marginBottom: 14 }}>
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
                          marginLeft: isRtl ? 8 : 0,
                          marginRight: isRtl ? 0 : 8,
                          paddingTop: 22,
                          cursor: 'pointer',
                          borderBottom: isDropTarget ? `1px dashed ${T.border}` : 'none',
                        }}
                        onDragOver={e => e.preventDefault()}
                        onDrop={e => handleWordDrop(e, globalIdx)}
                        onClick={e => { e.stopPropagation(); handleWordClick(globalIdx, e); }}
                      >
                        {placement && (
                          <span
                            draggable
                            onDragStart={e => handlePlacedChordDragStart(e, placement.id)}
                            onClick={e => { e.stopPropagation(); removeChord(placement.id); }}
                            style={{
                              position: 'absolute',
                              top: 0,
                              right: isRtl ? 0 : 'auto',
                              left: isRtl ? 'auto' : 0,
                              fontSize: 12,
                              fontWeight: 800,
                              color: T.primary,
                              cursor: 'pointer',
                              whiteSpace: 'nowrap',
                              userSelect: 'none',
                              lineHeight: 1,
                              direction: 'ltr',
                            }}
                            title="Click to remove · drag to move"
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

      {/* ── Chord picker popup ── */}
      {chordPicker && progression.length > 0 && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: Math.min(chordPicker.y, window.innerHeight - 160),
            left: Math.min(Math.max(chordPicker.x, 8), window.innerWidth - 220),
            zIndex: 2000,
            background: T.bgCard,
            border: `1px solid ${T.border}`,
            borderRadius: 12,
            padding: 10,
            boxShadow: '0 8px 28px rgba(0,0,0,0.55)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
            maxWidth: 210,
          }}
        >
          {progression.map((item, i) => {
            const accent = CHORD_ACCENTS[i % CHORD_ACCENTS.length];
            const name = formatChordName(item.chord.name);
            return (
              <button
                key={item.id}
                onClick={() => {
                  placeChord(chordPicker.wordIndex, name);
                  setChordPicker(null);
                }}
                style={{
                  padding: '6px 12px', borderRadius: 8,
                  border: `1.5px solid ${accent}`,
                  background: accent + '22', color: accent,
                  fontSize: 14, fontWeight: 800, cursor: 'pointer',
                  direction: 'ltr',
                }}
              >
                {name}
              </button>
            );
          })}
          <button
            onClick={() => setChordPicker(null)}
            style={{
              width: '100%', padding: '4px 0', borderRadius: 6,
              border: `1px solid ${T.border}`, background: T.bgInput,
              color: T.textMuted, fontSize: 11, cursor: 'pointer', marginTop: 2,
            }}
          >Cancel</button>
        </div>
      )}
    </div>
  );
}
