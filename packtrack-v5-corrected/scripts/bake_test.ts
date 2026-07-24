import { bakeAnnotations } from '../server/bake';
import { PDFDocument, StandardFonts } from 'pdf-lib';

function sampleHandBuilt(title = 'Atenolol 50mg Tablet', subtitle = 'PKG-001 | Shampur | Kenya'): Buffer {
  const cleanTitle = (title || 'Artwork').replace(/[()\\]/g, '');
  const cleanSub = (subtitle || 'Aristo').replace(/[()\\]/g, '');
  const pdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 220 >>
stream
BT
/F1 20 Tf
50 720 Td
(${cleanTitle}) Tj
/F1 12 Tf
0 -30 Td
(${cleanSub}) Tj
ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000244 00000 n 
0000000514 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
591
%%EOF`;
  return Buffer.from(pdfContent, 'utf-8');
}

const isPdf = (b64: string) => Buffer.from(b64, 'base64').slice(0, 4).toString() === '%PDF';

async function main() {
  // ---- TEST 1: pdf-lib generated 2-page source, full annotation coverage ----
  const doc = await PDFDocument.create();
  const f = await doc.embedFont(StandardFonts.Helvetica);
  const p1 = doc.addPage([612, 792]); p1.drawText('Artwork page 1', { x: 50, y: 700, size: 18, font: f });
  const p2 = doc.addPage([612, 792]); p2.drawText('Artwork page 2', { x: 50, y: 700, size: 18, font: f });
  const b64 = Buffer.from(await doc.save()).toString('base64');

  const anns = [
    { type: 'highlight', page: 1, nx: 0.1, ny: 0.1, nw: 0.3, nh: 0.05, by: 'A', role: 'QC-SH' },
    { type: 'circle', page: 1, ncx: 0.5, ncy: 0.4, nrx: 0.1, nry: 0.06, by: 'A', role: 'QC-SH' },
    { type: 'measure', page: 1, nx1: 0.2, ny1: 0.5, nx2: 0.6, ny2: 0.5, lengthMm: 113, text: '113.0 mm', by: 'A', role: 'QC-SH' },
    { type: 'comment', page: 1, nx: 0.3, ny: 0.3, text: 'Check ingredient font size per regulatory requirement', by: 'A', role: 'QC-SH' },
    { type: 'symbol', page: 2, nx: 0.4, ny: 0.4, symbol: '✓', by: 'A', role: 'QC-SH' },
    { type: 'symbol', page: 2, nx: 0.5, ny: 0.4, symbol: '∑', by: 'A', role: 'QC-SH' },
    { type: 'symbol', page: 2, nx: 0.6, ny: 0.4, symbol: '°', by: 'A', role: 'QC-SH' },
    { type: 'symbol', page: 2, nx: 0.7, ny: 0.4, symbol: '→', by: 'A', role: 'QC-SH' },
    { type: 'signature', page: 2, nx: 0.05, ny: 0.85, signedName: 'Wasiur Rahman', signedRole: 'QC-SH', signedDate: new Date().toLocaleString(), by: 'Wasiur', role: 'QC-SH' },
    { type: 'measure', page: 9, nx1: 0.1, ny1: 0.1, nx2: 0.2, ny2: 0.2, text: 'out-of-range page clamps', by: 'A', role: 'QC-SH' },
    // legacy mock coords fallback
    { type: 'comment', page: 1, x: 400, y: 270, text: 'legacy coords', by: 'A', role: 'QC-SH' },
  ];
  const r = await bakeAnnotations(b64, anns as any);
  const reload = await PDFDocument.load(Buffer.from(r.base64, 'base64'));
  console.log(`TEST1  baked=${r.baked} count=${r.count} validPDF=${isPdf(r.base64)} pages=${reload.getPageCount()} (expect 2, count 11)`);
  if (!isPdf(r.base64) || reload.getPageCount() !== 2 || r.count !== 11) throw new Error('TEST1 assertions failed');

  // ---- TEST 2: hand-built sample PDF (as served for seed artworks) ----
  const hb = sampleHandBuilt().toString('base64');
  let directLoad = true;
  try { await PDFDocument.load(Buffer.from(hb, 'base64'), { ignoreEncryption: true }); }
  catch (e: any) { directLoad = false; console.log('  hand-built direct load error:', e.message); }
  const r2 = await bakeAnnotations(hb, [{ type: 'comment', page: 1, nx: 0.3, ny: 0.3, text: 'hi', by: 'A', role: 'X' }] as any);
  const rl2 = await PDFDocument.load(Buffer.from(r2.base64, 'base64'));
  console.log(`TEST2  handBuiltDirectLoad=${directLoad} bakedValidPDF=${isPdf(r2.base64)} pages=${rl2.getPageCount()}`);
  if (!isPdf(r2.base64)) throw new Error('TEST2 produced invalid PDF');

  // ---- TEST 3: empty annotations & garbage input never throw ----
  const r3 = await bakeAnnotations(b64, []);
  const r4 = await bakeAnnotations(Buffer.from('not a pdf').toString('base64'), [{ type: 'comment', page: 1, nx: 0.5, ny: 0.5, text: 'x', by: 'A', role: 'X' }] as any);
  console.log(`TEST3  emptyValid=${isPdf(r3.base64)} garbageValid=${isPdf(r4.base64)} garbageBaked=${r4.baked}`);
  if (!isPdf(r3.base64) || !isPdf(r4.base64)) throw new Error('TEST3 assertions failed');

  console.log('\n✅ ALL BAKE TESTS PASSED');
}
main().catch(e => { console.error('❌ BAKE TEST FAILED:', e); process.exit(1); });
