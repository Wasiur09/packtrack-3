/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Server-side annotation baking. Flattens the review annotation ledger onto the
 * artwork PDF so the archived "annotated copy" is a single, self-contained PDF
 * (annotations are permanently drawn into the page content, not an overlay).
 *
 * Coordinates mirror the on-screen renderer (PdfCanvasViewer): annotations are
 * stored normalized (0..1) with a top-left origin; pdf-lib uses a bottom-left
 * origin in points, so y is flipped as (1 - ny) * pageHeight.
 */
import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage } from 'pdf-lib';

type Ann = Record<string, any>;

// Map symbols that the standard (WinAnsi) fonts cannot encode to safe equivalents.
const SYMBOL_MAP: Record<string, string> = {
  '′': "'", '″': '"', '√': 'sqrt', '∑': 'S', '∆': 'D', 'Ω': 'Ohm', 'π': 'pi',
  '≈': '~', '≠': '!=', '≤': '<=', '≥': '>=', '→': '->', '←': '<-', '↑': '^', '↓': 'v',
  '⇌': '<=>', '✓': 'v', '✗': 'x', '∅': 'O/', '∞': 'inf', '≡': '=', 'α': 'a', 'β': 'b',
  'γ': 'g', 'λ': 'L', '∴': '.:', '∵': ':.', '⭳': 'v',
};
function mapSymbols(s: string): string {
  let out = '';
  for (const ch of s) out += SYMBOL_MAP[ch] ?? ch;
  return out;
}
// Draw text that can never throw on an unencodable glyph.
function drawTextSafe(page: PDFPage, font: PDFFont, text: string, opts: any) {
  const mapped = mapSymbols(text ?? '');
  try {
    page.drawText(mapped, { font, ...opts });
  } catch {
    try { page.drawText(mapped.replace(/[^\x20-\x7E]/g, '?'), { font, ...opts }); } catch { /* skip */ }
  }
}

// Resolve normalized geometry (prefer n* fields; fall back to legacy 800x540 mock coords).
function norm(a: Ann) {
  const g: any = {};
  if (a.nx != null) { g.nx = a.nx; g.ny = a.ny; }
  else if (a.x != null) { g.nx = a.x / 800; g.ny = a.y / 540; }
  if (a.nw != null) { g.nw = a.nw; g.nh = a.nh; }
  else if (a.w != null) { g.nw = a.w / 800; g.nh = a.h / 540; }
  if (a.ncx != null) { g.ncx = a.ncx; g.ncy = a.ncy; g.nrx = a.nrx; g.nry = a.nry; }
  else if (a.cx != null) { g.ncx = a.cx / 800; g.ncy = a.cy / 540; g.nrx = a.rx / 800; g.nry = a.ry / 540; }
  if (a.nx1 != null) { g.nx1 = a.nx1; g.ny1 = a.ny1; g.nx2 = a.nx2; g.ny2 = a.ny2; }
  else if (a.x1 != null) { g.nx1 = a.x1 / 800; g.ny1 = a.y1 / 540; g.nx2 = a.x2 / 800; g.ny2 = a.y2 / 540; }
  return g;
}

export interface BakeResult { base64: string; baked: boolean; count: number; note?: string; }

// Generate a valid, pdf-lib-loadable artwork PDF (used as the raw fallback when a
// seed submission has no stored bytes), so downstream baking always succeeds.
export async function makeArtworkPdf(title: string, subtitle = ''): Promise<string> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const helvB = await pdf.embedFont(StandardFonts.HelveticaBold);
  const clean = (s: string) => mapSymbols(String(s || '')).replace(/[^\x20-\x7E]/g, ' ');
  page.drawText(clean(title || 'Pharmaceutical Packaging Artwork'), { x: 50, y: 720, size: 20, font: helvB, color: rgb(0.1, 0.12, 0.16) });
  page.drawText(clean(subtitle || 'Aristopharma Limited - International Business Division'), { x: 50, y: 690, size: 12, font: helv, color: rgb(0.3, 0.33, 0.38) });
  page.drawText('Official Packaging Artwork Specimen - PackTrack', { x: 50, y: 665, size: 10, font: helv, color: rgb(0.45, 0.48, 0.52) });
  page.drawRectangle({ x: 44, y: 60, width: 524, height: 590, borderColor: rgb(0.8, 0.82, 0.85), borderWidth: 1 });
  return Buffer.from(await pdf.save()).toString('base64');
}

export async function bakeAnnotations(base64: string, annotations: Ann[] = []): Promise<BakeResult> {
  const list = Array.isArray(annotations) ? annotations : [];
  let pdf: PDFDocument;
  try {
    pdf = await PDFDocument.load(Buffer.from(base64, 'base64'), { ignoreEncryption: true });
  } catch (e: any) {
    // Source PDF could not be parsed — produce a standalone annotated sheet so the
    // annotated copy is still a valid PDF rather than failing the whole archive.
    pdf = await PDFDocument.create();
    pdf.addPage([595.28, 841.89]);
  }

  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const helvB = await pdf.embedFont(StandardFonts.HelveticaBold);
  const helvO = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const pages = pdf.getPages();
  if (pages.length === 0) pdf.addPage([595.28, 841.89]);

  const amber = rgb(0.96, 0.62, 0.043);
  const blue = rgb(0.23, 0.51, 0.965);
  const green = rgb(0.18, 0.80, 0.44);
  const dark = rgb(0.043, 0.07, 0.125);

  let count = 0;
  for (const a of list) {
    const idx = Math.max(0, Math.min(pages.length - 1, (a.page || 1) - 1));
    const page = pages[idx];
    const { width: W, height: H } = page.getSize();
    const g = norm(a);
    const col = a.type === 'signature' ? green : a.type === 'measure' ? blue : amber;

    if (a.type === 'highlight' && g.nx != null) {
      page.drawRectangle({
        x: g.nx * W, y: H - (g.ny + g.nh) * H, width: g.nw * W, height: g.nh * H,
        color: amber, opacity: 0.18, borderColor: amber, borderWidth: 1.5,
      });
      count++;
    } else if (a.type === 'circle' && g.ncx != null) {
      page.drawEllipse({
        x: g.ncx * W, y: H - g.ncy * H, xScale: Math.max(1, g.nrx * W), yScale: Math.max(1, g.nry * H),
        borderColor: col, borderWidth: 2,
      });
      count++;
    } else if (a.type === 'measure' && g.nx1 != null) {
      const x1 = g.nx1 * W, y1 = H - g.ny1 * H, x2 = g.nx2 * W, y2 = H - g.ny2 * H;
      page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 1.5, color: blue });
      page.drawCircle({ x: x1, y: y1, size: 3, color: blue });
      page.drawCircle({ x: x2, y: y2, size: 3, color: blue });
      const label = a.text || (a.lengthMm != null ? `${a.lengthMm} mm` : '');
      if (label) {
        const fs = 8, tw = helvB.widthOfTextAtSize(mapSymbols(label), fs);
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
        page.drawRectangle({ x: mx - tw / 2 - 3, y: my - fs / 2 - 2, width: tw + 6, height: fs + 4, color: dark, opacity: 0.85, borderColor: blue, borderWidth: 0.5 });
        drawTextSafe(page, helvB, label, { x: mx - tw / 2, y: my - fs / 2 + 1, size: fs, color: rgb(0.7, 0.85, 1) });
      }
      count++;
    } else if (a.type === 'comment' && g.nx != null) {
      const x = g.nx * W, y = H - g.ny * H;
      page.drawCircle({ x, y, size: 8, color: amber });
      drawTextSafe(page, helvB, 'i', { x: x - 1.5, y: y - 3.5, size: 10, color: dark });
      const txt = (a.text || '').toString();
      if (txt) {
        const shown = txt.length > 64 ? txt.slice(0, 61) + '...' : txt;
        const fs = 8, tw = Math.min(helv.widthOfTextAtSize(mapSymbols(shown), fs), W - x - 22);
        page.drawRectangle({ x: x + 12, y: y - fs / 2 - 2, width: tw + 6, height: fs + 4, color: dark, opacity: 0.8 });
        drawTextSafe(page, helv, shown, { x: x + 15, y: y - fs / 2 + 1, size: fs, color: rgb(0.9, 0.9, 0.9), maxWidth: W - x - 20 });
      }
      count++;
    } else if (a.type === 'symbol' && g.nx != null) {
      const x = g.nx * W, y = H - g.ny * H;
      const sym = (a.symbol || a.text || '').toString();
      page.drawCircle({ x, y, size: 11, borderColor: amber, borderWidth: 1.25, color: amber, opacity: 0.10 });
      const fs = 13, tw = helvB.widthOfTextAtSize(mapSymbols(sym), fs);
      drawTextSafe(page, helvB, sym, { x: x - tw / 2, y: y - fs / 2 + 1, size: fs, color: amber });
      count++;
    } else if (a.type === 'signature' && g.nx != null) {
      const w = 214, h = 76;
      const x = Math.min(g.nx * W, Math.max(0, W - w));
      let y = (H - g.ny * H) - h;
      if (y < 0) y = 0;
      page.drawRectangle({ x, y, width: w, height: h, color: green, opacity: 0.08, borderColor: green, borderWidth: 1 });
      drawTextSafe(page, helvB, 'e-Sign', { x: x + w - 40, y: y + h - 14, size: 8, color: green });
      drawTextSafe(page, helvO, (a.signedName || a.text || 'Signed'), { x: x + 8, y: y + h - 36, size: 20, color: rgb(0.5, 0.9, 0.6) });
      page.drawLine({ start: { x: x + 8, y: y + h - 42 }, end: { x: x + w - 8, y: y + h - 42 }, thickness: 0.75, color: green, opacity: 0.5 });
      drawTextSafe(page, helv, `Digitally signed - ${a.signedRole || a.role || ''}`, { x: x + 8, y: y + h - 54, size: 7.5, color: rgb(0.53, 0.57, 0.64) });
      if (a.signedDate) drawTextSafe(page, helv, String(a.signedDate), { x: x + 8, y: y + h - 65, size: 7.5, color: rgb(0.42, 0.46, 0.53) });
      count++;
    }
  }

  // Discreet provenance footer on every page.
  const stamp = `PackTrack - annotated copy - flattened ${new Date().toISOString().slice(0, 10)} - ${count} marker(s)`;
  for (const page of pages) {
    const { width } = page.getSize();
    drawTextSafe(page, helv, stamp, { x: 24, y: 12, size: 6.5, color: rgb(0.5, 0.55, 0.62), maxWidth: width - 48 });
  }

  const out = await pdf.save();
  return { base64: Buffer.from(out).toString('base64'), baked: true, count };
}
