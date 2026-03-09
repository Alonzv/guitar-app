import type { ChordInProgression, ChordPlacement, FretPosition } from '../types/music';
import { formatChordName } from './chordIdentifier';
import { fretToNote } from './musicTheory';

// ── Helpers ────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildLeadSheetHTML(
  title: string,
  composer: string,
  writer: string,
  lyricsText: string,
  lyricsChords: ChordPlacement[],
): string {
  const chordMap = new Map<number, string>();
  lyricsChords.forEach(c => chordMap.set(c.wordIndex, c.chordName));

  const lines = lyricsText.split('\n');
  let globalIdx = 0;
  let bodyHTML = '';

  for (const line of lines) {
    const words = line.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      bodyHTML += '<div style="height:10px"></div>';
      continue;
    }

    bodyHTML += '<div style="display:flex;flex-wrap:wrap;direction:rtl;gap:2px 10px;margin-bottom:6px;">';
    for (const word of words) {
      const chord = chordMap.get(globalIdx);
      bodyHTML += `
        <div style="display:inline-flex;flex-direction:column;align-items:flex-end;">
          <span style="font-size:10px;font-weight:700;color:#C44900;min-height:14px;direction:ltr;display:block;">
            ${chord ? escapeHtml(chord) : ''}
          </span>
          <span style="font-size:13px;color:#111;">${escapeHtml(word)}</span>
        </div>`;
      globalIdx++;
    }
    bodyHTML += '</div>';
  }

  const metaHTML = [
    composer ? `<div style="font-size:11px;color:#555;">Composer: ${escapeHtml(composer)}</div>` : '',
    writer   ? `<div style="font-size:11px;color:#555;">Lyricist: ${escapeHtml(writer)}</div>` : '',
  ].filter(Boolean).join('');

  return `
    <div style="
      font-family: Arial, Helvetica, sans-serif;
      padding: 28px 32px;
      width: 680px;
      background: #ffffff;
      color: #111;
      direction: rtl;
      box-sizing: border-box;
    ">
      <h1 style="font-size:20px;font-weight:800;margin:0 0 4px;color:#111;">
        ${escapeHtml(title || 'Song')}
      </h1>
      ${metaHTML}
      <div style="height:2px;background:#C44900;margin:12px 0 18px;"></div>
      ${bodyHTML}
    </div>`;
}

function buildProgressionHTML(
  name: string,
  progression: ChordInProgression[],
): string {
  const cards = progression.map((item, i) => {
    const diagram = item.fretPositions.length > 0
      ? fretboardSVGHtml(item.fretPositions)
      : '<div style="height:70px;"></div>';
    return `
    <div style="
      display:inline-block;width:130px;vertical-align:top;
      background:#354a51;border-radius:8px;padding:10px 12px;
      margin:4px;text-align:center;
    ">
      <div style="font-size:11px;color:rgba(249,236,195,0.5);margin-bottom:3px;">${i + 1}</div>
      <div style="font-size:18px;font-weight:800;color:#F9ECC3;">${escapeHtml(formatChordName(item.chord.name))}</div>
      <div style="font-size:9px;color:rgba(249,236,195,0.55);margin-top:3px;">${escapeHtml(item.chord.notes.join(' · '))}</div>
      ${diagram}
    </div>`;
  }).join('');

  return `
    <div style="
      font-family: Arial, Helvetica, sans-serif;
      padding: 28px 32px;
      width: 680px;
      background: #243238;
      color: #F9ECC3;
      box-sizing: border-box;
    ">
      <h1 style="font-size:20px;font-weight:800;margin:0 0 8px;">${escapeHtml(name || 'Chord Progression')}</h1>
      <div style="height:2px;background:#C44900;margin-bottom:20px;"></div>
      <div>${cards}</div>
    </div>`;
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

  // Fret lines
  for (let i = 0; i <= fretCount; i++) {
    const isNut = i === 0 && displayMin === 0;
    svg += `<line x1="${LEFT + i * fretSp}" y1="${topY}" x2="${LEFT + i * fretSp}" y2="${topY + (STRING_COUNT - 1) * strSp}" stroke="${isNut ? '#2E4A5A' : '#CDBF96'}" stroke-width="${isNut ? 3 : 1}" opacity="${isNut ? 0.7 : 1}"/>`;
  }
  // String lines
  for (let s = 0; s < STRING_COUNT; s++) {
    svg += `<line x1="${LEFT}" y1="${sy(s)}" x2="${LEFT + fretCount * fretSp}" y2="${sy(s)}" stroke="#629677" stroke-width="${0.7 + s * 0.18}" opacity="0.5"/>`;
  }
  // Position label
  if (displayMin > 0) {
    svg += `<text x="${LEFT - 4}" y="${topY + (STRING_COUNT - 1) * strSp / 2 + 4}" text-anchor="end" font-size="7" fill="rgba(46,74,90,0.58)">${displayMin + 1}fr</text>`;
  }
  // Dots
  for (const p of voicing) {
    const cx = fx(p.fret), cy = sy(p.string);
    const note = fretToNote(p.string, p.fret);
    svg += `<circle cx="${cx}" cy="${cy}" r="7" fill="#C44900" stroke="#F7F0DC" stroke-width="1" opacity="0.92"/>`;
    svg += `<text x="${cx}" y="${cy + 3}" text-anchor="middle" font-size="6" fill="#fff" font-weight="700">${note}</text>`;
  }

  svg += `</svg>`;
  return svg;
}

// ── Shared renderer ───────────────────────────────────────

const RENDER_WIDTH = 680;   // source HTML width in px
const SCALE = 2;            // retina / hi-DPI multiplier
const A4_W_MM = 210;
const A4_H_MM = 297;

// How many source-px of the element correspond to one A4 page height?
const SRC_PX_PER_PAGE = A4_H_MM * (RENDER_WIDTH / A4_W_MM);   // ≈ 961 px

async function renderHTMLToPDF(html: string, filename: string): Promise<void> {
  // 1. Dark overlay — hides the render div from the user
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

  // 2. Render container — positioned in viewport (z-index below overlay)
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
    // Wait for fonts so Hebrew characters render correctly
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

    // 3. Slice canvas into A4 pages
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const canvasPixelsPerPage = SRC_PX_PER_PAGE * SCALE;
    const totalPages = Math.ceil(canvas.height / canvasPixelsPerPage);

    for (let page = 0; page < totalPages; page++) {
      if (page > 0) pdf.addPage();

      const yStart = page * canvasPixelsPerPage;
      const sliceHeightPx = Math.min(canvasPixelsPerPage, canvas.height - yStart);

      // Draw slice onto a temporary canvas
      const slice = document.createElement('canvas');
      slice.width  = canvas.width;
      slice.height = sliceHeightPx;
      const ctx = slice.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(canvas, 0, yStart, canvas.width, sliceHeightPx, 0, 0, canvas.width, sliceHeightPx);

      const imgData = slice.toDataURL('image/jpeg', 0.93);
      // Image height in mm = (sliceHeight in src-px) × (A4_W_MM / RENDER_WIDTH)
      const imgH_mm = (sliceHeightPx / SCALE) * (A4_W_MM / RENDER_WIDTH);
      pdf.addImage(imgData, 'JPEG', 0, 0, A4_W_MM, imgH_mm);
    }

    pdf.save(filename);
  } finally {
    document.body.removeChild(container);
    document.body.removeChild(overlay);
  }
}

// ── Public API ────────────────────────────────────────────

export async function exportLyricsPDF(
  title: string,
  composer: string,
  writer: string,
  lyricsText: string,
  lyricsChords: ChordPlacement[],
): Promise<void> {
  const html = buildLeadSheetHTML(title, composer, writer, lyricsText, lyricsChords);
  const filename = `${(title || 'song').replace(/[^a-zA-Z0-9\u0590-\u05FF ]/g, '_')}.pdf`;
  await renderHTMLToPDF(html, filename);
}

export async function exportProgressionPDF(
  name: string,
  progression: ChordInProgression[],
): Promise<void> {
  const html = buildProgressionHTML(name, progression);
  const filename = `${(name || 'progression').replace(/[^a-zA-Z0-9\u0590-\u05FF ]/g, '_')}.pdf`;
  await renderHTMLToPDF(html, filename);
}
