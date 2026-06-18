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
      background:#1A1918;border-radius:0;padding:10px 12px;
      margin:4px;text-align:center;
    ">
      <div style="font-size:11px;color:rgba(240,234,216,0.5);margin-bottom:3px;">${i + 1}</div>
      <div style="font-size:18px;font-weight:800;color:#F0EAD8;">${escapeHtml(formatChordName(item.chord.name))}</div>
      <div style="font-size:9px;color:rgba(240,234,216,0.55);margin-top:3px;">${escapeHtml(item.chord.notes.join(' · '))}</div>
      ${diagram}
    </div>`;
  }).join('');

  return `
    <div style="
      font-family: Arial, Helvetica, sans-serif;
      padding: 28px 32px;
      width: 680px;
      background: #111110;
      color: #F0EAD8;
      box-sizing: border-box;
    ">
      <h1 style="font-size:20px;font-weight:800;margin:0 0 8px;">${escapeHtml(name || 'Chord Progression')}</h1>
      <div style="height:2px;background:#CC1C1C;margin-bottom:20px;"></div>
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

  for (let i = 0; i <= fretCount; i++) {
    const isNut = i === 0 && displayMin === 0;
    svg += `<line x1="${LEFT + i * fretSp}" y1="${topY}" x2="${LEFT + i * fretSp}" y2="${topY + (STRING_COUNT - 1) * strSp}" stroke="${isNut ? '#1235FC' : 'rgba(255,255,255,0.40)'}" stroke-width="${isNut ? 3 : 1}" opacity="${isNut ? 0.7 : 1}"/>`;
  }
  for (let s = 0; s < STRING_COUNT; s++) {
    svg += `<line x1="${LEFT}" y1="${sy(s)}" x2="${LEFT + fretCount * fretSp}" y2="${sy(s)}" stroke="rgba(255,255,255,0.55)" stroke-width="${0.7 + s * 0.18}" opacity="0.5"/>`;
  }
  if (displayMin > 0) {
    svg += `<text x="${LEFT - 4}" y="${topY + (STRING_COUNT - 1) * strSp / 2 + 4}" text-anchor="end" font-size="7" fill="rgba(255,255,255,0.50)">${displayMin + 1}fr</text>`;
  }
  for (const p of voicing) {
    const cx = fx(p.fret), cy = sy(p.string);
    const note = fretToNote(p.string, p.fret);
    svg += `<circle cx="${cx}" cy="${cy}" r="7" fill="#CC1C1C" stroke="#F7F0DC" stroke-width="1" opacity="0.92"/>`;
    svg += `<text x="${cx}" y="${cy + 3}" text-anchor="middle" font-size="6" fill="#fff" font-weight="700">${note}</text>`;
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
      <div style="background:#FFFFFF;border-radius:8px;padding:12px 14px;margin-bottom:12px;">
        <div style="font-size:14px;font-weight:800;color:#111110;margin-bottom:6px;">${escapeHtml(p.title)}</div>
        <div style="text-align:center;">${chordRow}</div>
        <div style="font-size:11px;color:#3A3A3A;line-height:1.6;margin-top:6px;">${escapeHtml(p.why)}</div>
      </div>`;
  }).join('');

  return `
    <div dir="${dir}" style="text-align:${align};margin-top:34px;padding-top:24px;border-top:2px solid #CC1C1C;">
      <h2 style="font-size:18px;font-weight:800;margin:0 0 14px;color:#111110;">${escapeHtml(a.heading)}</h2>
      <div style="background:#1A1918;border-radius:8px;padding:12px 16px;margin-bottom:18px;color:#F0EAD8;">
        <div style="font-size:11px;opacity:0.7;margin-bottom:2px;">${escapeHtml(a.scaleLabel)}</div>
        <span style="font-size:20px;font-weight:800;">${escapeHtml(a.scaleName)}</span>
        <span style="font-size:12px;opacity:0.85;margin:0 8px;">${escapeHtml(a.matchText)}</span>
      </div>
      ${a.progressions.length > 0 ? `<div style="font-size:13px;font-weight:700;color:#111110;margin-bottom:10px;">${escapeHtml(a.progHeading)}</div>${progCards}` : ''}
    </div>`;
}

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
  const numSys   = Math.ceil(colCount / colsPerLine);
  const barsSet  = new Set(bars);

  let systemsHTML = '';
  for (let sys = 0; sys < numSys; sys++) {
    const start = sys * colsPerLine;
    const end   = Math.min(start + colsPerLine, colCount);
    const isEmpty = strings.every((_, s) =>
      Array.from({ length: end - start }, (_, ci) => grid[s][start + ci])
        .every(c => !c.fret)
    );
    if (isEmpty) continue;

    systemsHTML += '<div style="margin-bottom:22px;">';
    for (let s = 0; s < strings.length; s++) {
      let line = `${strings[s]}|`;
      for (let c = start; c < end; c++) {
        line += tabCellText(grid[s][c]);
        if (barsSet.has(c)) line += '|';
      }
      line += '|';
      systemsHTML += `<div style="font-family:'Courier New',monospace;font-size:14px;line-height:1.85;white-space:pre;">${escapeHtml(line)}</div>`;
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
      <div style="height:2px;background:#CC1C1C;margin-bottom:30px;"></div>
      ${systemsHTML || '<p style="color:#3A3A3A;font-size:13px;">Empty tab</p>'}
      ${analysis ? buildAnalysisHTML(analysis) : ''}
      <div style="margin-top:36px;font-size:10px;color:#D0D0D0;text-align:right;">Created with ScaleUp</div>
    </div>`;

  const filename = `${(title || 'tab').replace(/[^a-zA-Z0-9 ]/g, '_')}.pdf`;
  await renderHTMLToPDF(html, filename);
}

// ── Public API ────────────────────────────────────────────

export async function exportProgressionPDF(
  name: string,
  progression: ChordInProgression[],
): Promise<void> {
  const html = buildProgressionHTML(name, progression);
  const filename = `${(name || 'progression').replace(/[^a-zA-Z0-9֐-׿ ]/g, '_')}.pdf`;
  await renderHTMLToPDF(html, filename);
}
