import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import type { ChordInProgression, ChordPlacement } from '../types/music';
import { formatChordName } from './chordIdentifier';

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
  const cards = progression.map((item, i) => `
    <div style="
      display:inline-block;width:100px;vertical-align:top;
      background:#354a51;border-radius:8px;padding:10px 12px;
      margin:4px;text-align:center;
    ">
      <div style="font-size:11px;color:rgba(249,236,195,0.5);margin-bottom:3px;">${i + 1}</div>
      <div style="font-size:18px;font-weight:800;color:#F9ECC3;">${escapeHtml(formatChordName(item.chord.name))}</div>
      <div style="font-size:9px;color:rgba(249,236,195,0.55);margin-top:3px;">${escapeHtml(item.chord.notes.join(' · '))}</div>
    </div>`).join('');

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
