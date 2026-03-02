import { jsPDF } from 'jspdf';
import type { ChordInProgression, ChordPlacement } from '../types/music';
import { formatChordName } from './chordIdentifier';

// ── Lyrics / Lead Sheet PDF ────────────────────────────────
export function exportLyricsPDF(
  title: string,
  lyricsText: string,
  lyricsChords: ChordPlacement[],
) {
  const pdf  = new jsPDF({ unit: 'mm', format: 'a4' });
  const pw   = pdf.internal.pageSize.getWidth();
  const ph   = pdf.internal.pageSize.getHeight();
  const MARGIN = 18;
  const usableW = pw - MARGIN * 2;

  // Title
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(18);
  pdf.setTextColor(30, 30, 30);
  pdf.text(title || 'שיר', MARGIN, MARGIN + 4);

  // Divider
  pdf.setDrawColor(180, 100, 30);
  pdf.setLineWidth(0.6);
  pdf.line(MARGIN, MARGIN + 8, pw - MARGIN, MARGIN + 8);

  let y = MARGIN + 16;
  const lineH = 10; // mm per lyric line (chord row + word row)

  const lines = lyricsText.split('\n');
  let globalIdx = 0;

  // Build a lookup: wordIndex → chordName
  const chordMap = new Map<number, string>();
  lyricsChords.forEach(c => chordMap.set(c.wordIndex, c.chordName));

  for (const line of lines) {
    if (y + lineH * 2 > ph - MARGIN) {
      pdf.addPage();
      y = MARGIN;
    }

    const words = line.split(/\s+/).filter(Boolean);
    if (words.length === 0) { y += lineH * 0.5; globalIdx; continue; }

    // Measure words and build line chunks
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'normal');

    // Chord row
    let cx = MARGIN;
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(196, 73, 0); // burnt orange

    const wordWidths: number[] = [];
    for (const w of words) {
      // word width in mm — approximate via char count
      const ww = Math.max(pdf.getTextWidth(w) + 4, 10);
      wordWidths.push(ww);
    }

    // Check if all fits; if not wrap (simplified: just let it overflow for now)
    let needWrap = false;
    let totalW = 0;
    for (const ww of wordWidths) totalW += ww;
    if (totalW > usableW) needWrap = true;

    if (needWrap) {
      // Wrap: render words one by one resetting x when needed
      cx = MARGIN;
      let lineStartGlobal = globalIdx;
      for (let i = 0; i < words.length; i++) {
        const wIdx = lineStartGlobal + i;
        const chord = chordMap.get(wIdx);
        if (chord) {
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(8);
          pdf.setTextColor(196, 73, 0);
          pdf.text(chord, cx, y);
        }
        if (cx + wordWidths[i] > pw - MARGIN) {
          // new sub-line
          cx = MARGIN;
          y += lineH;
          if (y + lineH > ph - MARGIN) { pdf.addPage(); y = MARGIN; }
        }
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(11);
        pdf.setTextColor(30, 30, 30);
        pdf.text(words[i], cx, y + 5);
        cx += wordWidths[i];
      }
      y += lineH;
      globalIdx += words.length;
      continue;
    }

    // Single row — chord line then word line
    cx = MARGIN;
    for (let i = 0; i < words.length; i++) {
      const chord = chordMap.get(globalIdx + i);
      if (chord) {
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(8);
        pdf.setTextColor(196, 73, 0);
        pdf.text(chord, cx, y);
      }
      cx += wordWidths[i];
    }

    // Word line
    cx = MARGIN;
    for (let i = 0; i < words.length; i++) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(11);
      pdf.setTextColor(30, 30, 30);
      pdf.text(words[i], cx, y + 5);
      cx += wordWidths[i];
    }

    globalIdx += words.length;
    y += lineH;
  }

  pdf.save(`${title || 'song'}.pdf`);
}

// ── Chord Progression PDF ──────────────────────────────────
export function exportProgressionPDF(
  name: string,
  progression: ChordInProgression[],
) {
  const pdf    = new jsPDF({ unit: 'mm', format: 'a4' });
  const MARGIN = 18;

  // Title
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(18);
  pdf.setTextColor(30, 30, 30);
  pdf.text(name || 'Chord Progression', MARGIN, MARGIN + 4);

  pdf.setDrawColor(180, 100, 30);
  pdf.setLineWidth(0.6);
  pdf.line(MARGIN, MARGIN + 8, pdf.internal.pageSize.getWidth() - MARGIN, MARGIN + 8);

  let y = MARGIN + 18;
  const BOX_W = 36;
  const BOX_H = 22;
  const COLS  = 4;
  const GAP_X = 8;
  const GAP_Y = 8;

  progression.forEach((item, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const bx  = MARGIN + col * (BOX_W + GAP_X);
    const by  = y + row * (BOX_H + GAP_Y);

    // Box background
    pdf.setFillColor(53, 74, 81);
    pdf.roundedRect(bx, by, BOX_W, BOX_H, 3, 3, 'F');

    // Chord name
    const cName = formatChordName(item.chord.name);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.setTextColor(249, 236, 195);
    const tw = pdf.getTextWidth(cName);
    pdf.text(cName, bx + (BOX_W - tw) / 2, by + 10);

    // Notes
    const notes = item.chord.notes.join(' · ');
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(180, 165, 130);
    const nw = pdf.getTextWidth(notes);
    pdf.text(notes, bx + (BOX_W - nw) / 2, by + 17);
  });

  pdf.save(`${name || 'progression'}.pdf`);
}
