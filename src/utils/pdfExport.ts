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
    composer ? `<div style="font-size:11px;color:#555;">מלחין: ${escapeHtml(composer)}</div>` : '',
    writer   ? `<div style="font-size:11px;color:#555;">כותב: ${escapeHtml(writer)}</div>` : '',
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
        ${escapeHtml(title || 'שיר')}
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

function renderToPDF(html: string, filename: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const container = document.createElement('div');
    Object.assign(container.style, {
      position: 'fixed',
      left: '100vw',
      top: '0',
      zIndex: '-1',
      pointerEvents: 'none',
    });
    container.innerHTML = html;
    document.body.appendChild(container);

    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const pageW = pdf.internal.pageSize.getWidth();

    pdf.html(container, {
      callback(doc) {
        doc.save(filename);
        document.body.removeChild(container);
        resolve();
      },
      width: pageW - 20,   // mm content width
      windowWidth: 680,    // HTML element px width (matches the div above)
      margin: [10, 10, 10, 10],
      autoPaging: 'text',
      html2canvas: { scale: 2, useCORS: true },
    });

    // Safety timeout — if html2canvas hangs, clean up
    setTimeout(() => {
      if (document.body.contains(container)) {
        document.body.removeChild(container);
        reject(new Error('PDF rendering timed out'));
      }
    }, 30000);
  });
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
  await renderToPDF(html, filename);
}

export async function exportProgressionPDF(
  name: string,
  progression: ChordInProgression[],
): Promise<void> {
  const html = buildProgressionHTML(name, progression);
  const filename = `${(name || 'progression').replace(/[^a-zA-Z0-9\u0590-\u05FF ]/g, '_')}.pdf`;
  await renderToPDF(html, filename);
}
