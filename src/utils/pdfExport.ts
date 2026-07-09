import type { ChordInProgression, FretPosition } from '../types/music';
import { formatChordName } from './chordIdentifier';
import { fretToNote } from './musicTheory';
import { findChordVoicings } from './chordVoicings';

// Analysis bundled into the tab PDF (strings already resolved to chosen language)
export interface TabPDFAnalysis {
  rtl: boolean;
  heading: string;
  scaleLabel: string;
  scaleName: string;
  matchText: string;
  progHeading: string;
  progressions: { title: string; chords: string[]; why: string }[];
}

// ── Helpers ────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Fretboard SVG for PDF ─────────────────────────────────

function fretboardSVGHtml(voicing: FretPosition[]): string {
  const STRING_COUNT = 6;
  const W = 200, H = 90;
  const hasOpen = voicing.some(p => p.fret === 0);
  const nonZeroFrets = voicing.map(p => p.fret).filter(f => f > 0);
  const minFret = nonZeroFrets.length > 0 ? Math.min(...nonZeroFrets) : 0;
  const maxFret = voicing.length > 0 ? Math.max(...voicing.map(p => p.fret)) : 0;
  const displayMin = hasOpen ? 0 : Math.max(0, minFret - 1);
  const displayMax = Math.max(maxFret, displayMin + 4);
  const fretCount = displayMax - displayMin;
  const LEFT = displayMin === 0 ? 12 : 24;
  const fretSp = (W - LEFT - 8) / fretCount;
  const strSp = (H - 20) / (STRING_COUNT - 1);
  const topY = 8;

  const fx = (f: number) =>
    f === 0 ? LEFT - fretSp * 0.5 : LEFT + (f - displayMin - 0.5) * fretSp;
  const sy = (s: number) => topY + (STRING_COUNT - 1 - s) * strSp;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`;

  // Fretboard background
  svg += `<rect x="${LEFT}" y="${topY - 8}" width="${fretCount * fretSp}" height="${(STRING_COUNT - 1) * strSp + 16}" fill="#FFFFFF"/>`;

  // Fret lines
  for (let i = 0; i <= fretCount; i++) {
    svg += `<line x1="${LEFT + i * fretSp}" y1="${topY}" x2="${LEFT + i * fretSp}" y2="${topY + (STRING_COUNT - 1) * strSp}" stroke="#C9C2B8" stroke-width="1"/>`;
  }

  // String lines — graduating thickness
  for (let s = 0; s < STRING_COUNT; s++) {
    const sw = (1.5 + s * 0.22).toFixed(2);
    svg += `<line x1="${LEFT}" y1="${sy(s)}" x2="${LEFT + fretCount * fretSp}" y2="${sy(s)}" stroke="#C9C2B8" stroke-width="${sw}"/>`;
  }

  // Nut — drawn last to cover overlapping lines
  if (displayMin === 0) {
    svg += `<rect x="${LEFT - 1}" y="${topY - 8}" width="4" height="${(STRING_COUNT - 1) * strSp + 16}" fill="#000000"/>`;
  } else {
    svg += `<text x="${LEFT - 4}" y="${topY + (STRING_COUNT - 1) * strSp / 2 + 4}" text-anchor="end" font-size="7" fill="rgba(0,0,0,0.45)" font-family="'Courier New',monospace">${displayMin + 1}fr</text>`;
  }

  // Dots
  for (const p of voicing) {
    const cx = fx(p.fret), cy = sy(p.string);
    const note = fretToNote(p.string, p.fret);
    svg += `<circle cx="${cx}" cy="${cy}" r="7" fill="#110CF0" stroke="#fff" stroke-width="1.25" opacity="0.92"/>`;
    svg += `<text x="${cx}" y="${cy + 3}" text-anchor="middle" font-size="6" fill="#fff" font-weight="700" font-family="'Courier New',monospace">${note}</text>`;
  }

  svg += `</svg>`;
  return svg;
}

// ── Shared renderer ───────────────────────────────────────

const RENDER_WIDTH = 680;
const SCALE = 2;
const A4_W_MM = 210;
const A4_H_MM = 297;

const SRC_PX_PER_PAGE = A4_H_MM * (RENDER_WIDTH / A4_W_MM);

async function renderHTMLToPDF(html: string, filename: string): Promise<void> {
  const overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    background: 'rgba(0,0,0,0.78)',
    zIndex: '99999',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontSize: '15px',
    fontFamily: 'sans-serif',
  });
  overlay.textContent = 'Creating PDF…';
  document.body.appendChild(overlay);

  const container = document.createElement('div');
  Object.assign(container.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: `${RENDER_WIDTH}px`,
    zIndex: '99998',
    pointerEvents: 'none',
  });
  container.innerHTML = html;
  document.body.appendChild(container);

  try {
    await document.fonts.ready;

    const target = (container.firstElementChild as HTMLElement) ?? container;

    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import('html2canvas'),
      import('jspdf'),
    ]);

    const canvas = await html2canvas(target, {
      scale: SCALE,
      useCORS: true,
      backgroundColor: '#ffffff',
      width: RENDER_WIDTH,
      windowWidth: RENDER_WIDTH,
    });

    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const canvasPixelsPerPage = SRC_PX_PER_PAGE * SCALE;
    const totalPages = Math.ceil(canvas.height / canvasPixelsPerPage);

    for (let page = 0; page < totalPages; page++) {
      if (page > 0) pdf.addPage();

      const yStart = page * canvasPixelsPerPage;
      const sliceHeightPx = Math.min(canvasPixelsPerPage, canvas.height - yStart);

      const slice = document.createElement('canvas');
      slice.width  = canvas.width;
      slice.height = sliceHeightPx;
      const ctx = slice.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(canvas, 0, yStart, canvas.width, sliceHeightPx, 0, 0, canvas.width, sliceHeightPx);

      const imgData = slice.toDataURL('image/jpeg', 0.93);
      const imgH_mm = (sliceHeightPx / SCALE) * (A4_W_MM / RENDER_WIDTH);
      pdf.addImage(imgData, 'JPEG', 0, 0, A4_W_MM, imgH_mm);
    }

    pdf.save(filename);
  } finally {
    document.body.removeChild(container);
    document.body.removeChild(overlay);
  }
}

// ── Tab PDF ───────────────────────────────────────────────

type TabCell = { fret: string; tech?: string };

function tabCellText(cell: TabCell): string {
  if (!cell.fret) return '---';
  const t = cell.tech ?? '';
  return cell.fret.length === 1 ? `-${cell.fret}${t || '-'}` : `${cell.fret}${t || '-'}`;
}

function buildAnalysisHTML(a: TabPDFAnalysis): string {
  const align = a.rtl ? 'right' : 'left';
  const dir = a.rtl ? 'rtl' : 'ltr';

  const progCards = a.progressions.map(p => {
    const chordRow = p.chords.map(name => {
      const v = findChordVoicings(name, 1)[0] ?? [];
      const diagram = v.length > 0 ? fretboardSVGHtml(v) : '';
      return `
        <div style="display:inline-block;width:120px;vertical-align:top;text-align:center;margin:4px;">
          <div style="font-size:15px;font-weight:800;color:#1A1818;font-family:'Courier New',monospace;">${escapeHtml(name)}</div>
          ${diagram}
        </div>`;
    }).join('');

    return `
      <div style="background:#FFFFFF;border-radius:0;padding:12px 14px;margin-bottom:12px;">
        <div style="font-size:14px;font-weight:800;color:#111110;margin-bottom:6px;">${escapeHtml(p.title)}</div>
        <div style="text-align:center;">${chordRow}</div>
        <div style="font-size:11px;color:#3A3A3A;line-height:1.6;margin-top:6px;">${escapeHtml(p.why)}</div>
      </div>`;
  }).join('');

  return `
    <div dir="${dir}" style="text-align:${align};margin-top:34px;padding-top:24px;border-top:2px solid #110CF0;">
      <h2 style="font-size:18px;font-weight:800;margin:0 0 14px;color:#111110;">${escapeHtml(a.heading)}</h2>
      <div style="background:#1A1918;border-radius:0;padding:12px 16px;margin-bottom:18px;color:#F0EAD8;">
        <div style="font-size:11px;opacity:0.7;margin-bottom:2px;">${escapeHtml(a.scaleLabel)}</div>
        <span style="font-size:20px;font-weight:800;">${escapeHtml(a.scaleName)}</span>
        <span style="font-size:12px;opacity:0.85;margin:0 8px;">${escapeHtml(a.matchText)}</span>
      </div>
      ${a.progressions.length > 0 ? `<div style="font-size:13px;font-weight:700;color:#111110;margin-bottom:10px;">${escapeHtml(a.progHeading)}</div>${progCards}` : ''}
    </div>`;
}

// Usable text width inside the rendered page (680px − 52px padding each side)
const TAB_USABLE_W = RENDER_WIDTH - 2 * 52;
// Courier New advance width is 0.6em; use 0.62 as a safety margin
const TAB_CHAR_FACTOR = 0.62;
// Hard ceiling on columns per PDF line. Each column is 3 monospace chars, plus
// ~6 chars of overhead (string label + bar lines), so 20 cols ≈ 66 chars, which
// fits the usable width at the full 14px font. This guarantees a readable,
// never-clipped result even on very wide screens where the live colsPerLine is
// large. On phones/tablets the live value is already below this, so the PDF
// line breaks still match exactly what the user sees on screen.
const TAB_PDF_MAX_COLS = 20;

export async function exportTabPDF(
  title: string,
  subtitle: string,
  grid: TabCell[][],
  bars: number[],
  strings: string[],
  colsPerLine: number,
  analysis?: TabPDFAnalysis,
): Promise<void> {
  const colCount = grid[0]?.length ?? 0;
  // Match the on-screen line breaks when they fit; otherwise reflow so a line
  // never overflows the page width (which would clip notes off the right edge).
  const perLine  = Math.min(colsPerLine > 0 ? colsPerLine : 32, TAB_PDF_MAX_COLS);
  const numSys   = Math.ceil(colCount / perLine);
  const barsSet  = new Set(bars);

  // ── Pass 1: build each system's lines and find the widest line ──
  const systems: string[][] = [];
  let maxLineChars = 0;
  for (let sys = 0; sys < numSys; sys++) {
    const start = sys * perLine;
    const end   = Math.min(start + perLine, colCount);
    const isEmpty = strings.every((_, s) =>
      Array.from({ length: end - start }, (_, ci) => grid[s][start + ci])
        .every(c => !c.fret)
    );
    if (isEmpty) continue;

    const lines: string[] = [];
    for (let s = 0; s < strings.length; s++) {
      let line = `${strings[s]}|`;
      for (let c = start; c < end; c++) {
        line += tabCellText(grid[s][c]);
        if (barsSet.has(c)) line += '|';
      }
      line += '|';
      maxLineChars = Math.max(maxLineChars, line.length);
      lines.push(line);
    }
    systems.push(lines);
  }

  // ── Auto-size the font so the widest line always fits the page width ──
  const fontSize = maxLineChars > 0
    ? Math.max(6, Math.min(14, Math.floor(TAB_USABLE_W / (TAB_CHAR_FACTOR * maxLineChars))))
    : 14;

  // ── Pass 2: render ──
  let systemsHTML = '';
  for (const lines of systems) {
    systemsHTML += '<div style="margin-bottom:22px;">';
    for (const line of lines) {
      systemsHTML += `<div style="font-family:'Courier New',monospace;font-size:${fontSize}px;line-height:1.85;white-space:pre;">${escapeHtml(line)}</div>`;
    }
    systemsHTML += '</div>';
  }

  const html = `
    <div style="
      font-family:Arial,Helvetica,sans-serif;
      padding:44px 52px;
      width:680px;
      background:#fff;
      color:#1A1818;
      box-sizing:border-box;
    ">
      ${title ? `<h1 style="font-size:24px;font-weight:800;margin:0 0 6px;">${escapeHtml(title)}</h1>` : ''}
      ${subtitle ? `<p style="font-size:13px;color:#3A3A3A;margin:0 0 18px;">${escapeHtml(subtitle)}</p>` : ''}
      <div style="height:2px;background:#110CF0;margin-bottom:30px;"></div>
      ${systemsHTML || '<p style="color:#3A3A3A;font-size:13px;">Empty tab</p>'}
      ${analysis ? buildAnalysisHTML(analysis) : ''}
      <div style="margin-top:36px;font-size:10px;color:#D0D0D0;text-align:right;">Created with ScaleUp</div>
    </div>`;

  const filename = `${(title || 'tab').replace(/[^a-zA-Z0-9 ]/g, '_')}.pdf`;
  await renderHTMLToPDF(html, filename);
}

// ── Progression PDF (native jsPDF vector) ─────────────────
// Drawn with vector primitives rather than rasterising the DOM, so text and
// fretboard diagrams stay razor-sharp at any zoom and the file stays small.

type RGB = [number, number, number];
const INK: RGB       = [26, 24, 24];    // #1A1818 — near-black text
const INK_SOFT: RGB  = [122, 116, 108]; // muted captions
const ACCENT: RGB    = [17, 12, 240];   // #110CF0 — brand blue
const GRID: RGB      = [201, 194, 184];  // #C9C2B8 — fret/string lines
const CARD_BG: RGB   = [247, 243, 235];  // soft parchment card fill
const CARD_LINE: RGB = [223, 216, 204];

// Draw a compact fretboard diagram inside the box (x, y, w, h) in mm.
function drawVectorFretboard(
  pdf: import('jspdf').jsPDF,
  voicing: FretPosition[],
  x: number, y: number, w: number, h: number,
): void {
  const STRING_COUNT = 6;
  const hasOpen = voicing.some(p => p.fret === 0);
  const nonZero = voicing.map(p => p.fret).filter(f => f > 0);
  const minFret = nonZero.length > 0 ? Math.min(...nonZero) : 0;
  const maxFret = voicing.length > 0 ? Math.max(...voicing.map(p => p.fret)) : 0;
  const displayMin = hasOpen ? 0 : Math.max(0, minFret - 1);
  const displayMax = Math.max(maxFret, displayMin + 4);
  const fretCount = Math.max(1, displayMax - displayMin);

  const leftPad = displayMin === 0 ? 2.4 : 5;
  const rightPad = 1.6;
  const topPad = 2.2;
  const boardW = w - leftPad - rightPad;
  const boardH = h - 2 * topPad;
  const fretSp = boardW / fretCount;
  const strSp  = boardH / (STRING_COUNT - 1);
  const x0 = x + leftPad;
  const y0 = y + topPad;

  const fx = (f: number) => f === 0 ? x0 - fretSp * 0.5 : x0 + (f - displayMin - 0.5) * fretSp;
  const sy = (s: number) => y0 + (STRING_COUNT - 1 - s) * strSp;

  // Fret lines (vertical)
  pdf.setDrawColor(...GRID);
  pdf.setLineWidth(0.2);
  for (let i = 0; i <= fretCount; i++) {
    const fxi = x0 + i * fretSp;
    pdf.line(fxi, y0, fxi, y0 + (STRING_COUNT - 1) * strSp);
  }
  // String lines (horizontal) — thicker toward the low strings
  for (let s = 0; s < STRING_COUNT; s++) {
    pdf.setLineWidth(0.18 + s * 0.05);
    pdf.line(x0, sy(s), x0 + fretCount * fretSp, sy(s));
  }

  // Nut, or starting-fret label
  if (displayMin === 0) {
    pdf.setFillColor(...INK);
    pdf.rect(x0 - 0.35, y0 - 0.2, 0.9, (STRING_COUNT - 1) * strSp + 0.4, 'F');
  } else {
    pdf.setFontSize(6);
    pdf.setTextColor(...INK_SOFT);
    pdf.text(`${displayMin + 1}fr`, x0 - 1.4, y0 + (STRING_COUNT - 1) * strSp / 2, { align: 'right', baseline: 'middle' });
  }

  // Finger dots
  for (const p of voicing) {
    const cx = fx(p.fret), cy = sy(p.string);
    pdf.setFillColor(...ACCENT);
    pdf.setDrawColor(255, 255, 255);
    pdf.setLineWidth(0.3);
    pdf.circle(cx, cy, 1.55, 'FD');
    pdf.setFontSize(5);
    pdf.setTextColor(255, 255, 255);
    pdf.text(fretToNote(p.string, p.fret), cx, cy + 0.1, { align: 'center', baseline: 'middle' });
  }
}

// ── Public API ────────────────────────────────────────────

export async function exportProgressionPDF(
  name: string,
  progression: ChordInProgression[],
): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

  const PAGE_W = 210, PAGE_H = 297;
  const MARGIN = 15;
  const usableW = PAGE_W - 2 * MARGIN;

  // Card grid geometry
  const COLS = 3;
  const GAP = 6;
  const cardW = (usableW - GAP * (COLS - 1)) / COLS;
  const cardH = 52;
  const boardTop = 15;   // where the diagram starts inside a card
  const boardH = 26;

  const title = name || 'Chord Progression';

  // ── Header ──
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(19);
  pdf.setTextColor(...INK);
  pdf.text(title, MARGIN, MARGIN + 2, { baseline: 'middle' });
  pdf.setDrawColor(...ACCENT);
  pdf.setLineWidth(0.7);
  pdf.line(MARGIN, MARGIN + 8, PAGE_W - MARGIN, MARGIN + 8);

  const gridTop = MARGIN + 15;
  let col = 0;
  let rowTop = gridTop;

  progression.forEach((item, i) => {
    const x = MARGIN + col * (cardW + GAP);
    // New page when a row would overflow the bottom margin
    if (rowTop + cardH > PAGE_H - MARGIN) {
      pdf.addPage();
      rowTop = MARGIN;
    }
    const y = rowTop;

    // Card background
    pdf.setFillColor(...CARD_BG);
    pdf.setDrawColor(...CARD_LINE);
    pdf.setLineWidth(0.2);
    pdf.rect(x, y, cardW, cardH, 'FD');
    // Accent bar down the left edge
    pdf.setFillColor(...ACCENT);
    pdf.rect(x, y, 1.1, cardH, 'F');

    // Index
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(...INK_SOFT);
    pdf.text(String(i + 1), x + cardW / 2, y + 5.5, { align: 'center', baseline: 'middle' });

    // Chord name
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(15);
    pdf.setTextColor(...INK);
    pdf.text(formatChordName(item.chord.name), x + cardW / 2, y + 11, { align: 'center', baseline: 'middle' });

    // Fretboard diagram (or a hint when no voicing was chosen)
    if (item.fretPositions.length > 0) {
      drawVectorFretboard(pdf, item.fretPositions, x + 3, y + boardTop, cardW - 6, boardH);
    } else {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7);
      pdf.setTextColor(...INK_SOFT);
      pdf.text('no voicing', x + cardW / 2, y + boardTop + boardH / 2, { align: 'center', baseline: 'middle' });
    }

    // Note names
    if (item.chord.notes.length > 0) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7);
      pdf.setTextColor(...INK_SOFT);
      pdf.text(item.chord.notes.join(' · '), x + cardW / 2, y + cardH - 4, { align: 'center', baseline: 'middle', maxWidth: cardW - 6 });
    }

    col++;
    if (col >= COLS) { col = 0; rowTop += cardH + GAP; }
  });

  // Footer on the last page
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(...GRID);
  pdf.text('Created with ScaleUp', PAGE_W - MARGIN, PAGE_H - 8, { align: 'right', baseline: 'middle' });

  const filename = `${(name || 'progression').replace(/[^a-zA-Z0-9֐-׿ ]/g, '_')}.pdf`;
  pdf.save(filename);
}
