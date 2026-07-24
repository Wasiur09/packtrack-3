import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { Annotation } from '../types';
import {
  MousePointer2, Hand, MessageSquarePlus, Highlighter, Circle as CircleIcon,
  Ruler, PenLine, Eraser, Crosshair as CrosshairIcon, Trash2, Maximize2
} from 'lucide-react';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

export type AnnotTool =
  | 'select' | 'hand' | 'comment' | 'highlight' | 'circle' | 'measure' | 'signature' | 'eraser' | 'symbol';

// Regulatory marking glyphs offered by the symbol tool ("/ , * ^ etc. for all symbols").
export const SYMBOL_GLYPHS = [
  '/', '*', '^', '~', '×', '÷', '±', '°', '′', '″', '√', '∑', '∆', 'µ', 'Ω', 'π',
  '≈', '≠', '≤', '≥', '→', '←', '↑', '↓', '⇌', '®', '™', '©', '§', '¶', '•', '…',
  '✓', '✗', '‰', '∅', '∞', '≡', 'α', 'β', 'γ', 'λ', '∴', '∵',
];

const MM_PER_PT = 25.4 / 72;

interface PdfCanvasViewerProps {
  fileUrl?: string;
  fileObj?: File;
  filename?: string;
  extractedText?: string;
  className?: string;
  maxHeight?: string;
  // Annotation layer (optional — when editable, drawing tools are active)
  annotations?: Annotation[];
  annotTool?: AnnotTool;
  editable?: boolean;
  currentUser?: { name: string; role: string };
  measureUnit?: 'mm' | 'cm' | 'in' | 'pt';
  calibrationMmPerPt?: number;
  onAddAnnotation?: (a: Annotation) => void;
  onEraseAnnotation?: (id: string) => void;
  onCalibrate?: (mmPerPt: number) => void;
}

export default function PdfCanvasViewer({
  fileUrl,
  fileObj,
  filename,
  extractedText,
  className = '',
  maxHeight = '620px',
  annotations = [],
  annotTool = 'select',
  editable = false,
  currentUser,
  measureUnit = 'mm',
  calibrationMmPerPt,
  onAddAnnotation,
  onEraseAnnotation,
  onCalibrate,
}: PdfCanvasViewerProps) {
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [isLoading, setIsLoading] = useState(true);
  const [renderError, setRenderError] = useState(false);
  const [viewMode, setViewMode] = useState<'canvas' | 'text'>('canvas');
  const [pdfDoc, setPdfDoc] = useState<any>(null);

  // Rendered page geometry
  const [pageWpx, setPageWpx] = useState(0);
  const [pageHpx, setPageHpx] = useState(0);
  const pagePt = useRef<{ w: number; h: number }>({ w: 0, h: 0 });

  // Interaction state
  const [drag, setDrag] = useState<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const [measureStart, setMeasureStart] = useState<{ nx: number; ny: number } | null>(null);
  const [mouse, setMouse] = useState<{ nx: number; ny: number } | null>(null);
  const [pendingComment, setPendingComment] = useState<{ nx: number; ny: number } | null>(null);
  const [commentText, setCommentText] = useState('');
  const [calibMode, setCalibMode] = useState(false);
  const [pendingCalib, setPendingCalib] = useState<{ lenPt: number } | null>(null);
  const [calibInput, setCalibInput] = useState('');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<SVGSVGElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const renderTaskRef = useRef<any>(null);
  const panRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  // Symbol-marking tool: currently selected glyph to stamp.
  const [symbolGlyph, setSymbolGlyph] = useState<string>('/');
  const [customGlyph, setCustomGlyph] = useState('');

  // Illustrator-style ruler guides (normalized 0..1 positions on the current page).
  const [showRulers, setShowRulers] = useState(true);
  const [guidesH, setGuidesH] = useState<number[]>([]); // horizontal guides (ny)
  const [guidesV, setGuidesV] = useState<number[]>([]); // vertical guides (nx)
  const [guideDrag, setGuideDrag] = useState<{ orient: 'h' | 'v'; index: number | null } | null>(null);
  const [guidePreview, setGuidePreview] = useState<number | null>(null);
  const pageBoxRef = useRef<HTMLDivElement | null>(null);

  // Cursor-anchored zoom: fraction of content under the pointer, reapplied post-render.
  const zoomAnchorRef = useRef<{ fx: number; fy: number; ox: number; oy: number } | null>(null);

  const RULER = showRulers ? 22 : 0;

  const mmPerPt = calibrationMmPerPt && calibrationMmPerPt > 0 ? calibrationMmPerPt : MM_PER_PT;

  // ---- Load PDF ----
  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    setRenderError(false);
    (async () => {
      try {
        let data: ArrayBuffer | Uint8Array | null = null;
        if (fileObj) {
          data = await fileObj.arrayBuffer();
        } else if (fileUrl) {
          if (fileUrl.startsWith('data:')) {
            const b64 = fileUrl.split(',')[1];
            const bin = atob(b64);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            data = bytes.buffer;
          } else {
            const res = await fetch(fileUrl);
            if (!res.ok) throw new Error(`fetch ${res.status}`);
            data = await res.arrayBuffer();
          }
        }
        if (!data) throw new Error('no source');
        const doc = await pdfjsLib.getDocument({ data }).promise;
        if (!mounted) return;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setCurrentPage(1);
        setIsLoading(false);
      } catch (err) {
        console.warn('PDF render fallback:', err);
        if (mounted) { setRenderError(true); setIsLoading(false); }
      }
    })();
    return () => { mounted = false; };
  }, [fileUrl, fileObj]);

  // ---- Render page ----
  useEffect(() => {
    if (!pdfDoc || renderError || viewMode !== 'canvas' || !canvasRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const page = await pdfDoc.getPage(currentPage);
        if (cancelled) return;
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        if (renderTaskRef.current) renderTaskRef.current.cancel();
        const task = page.render({ canvasContext: ctx, viewport });
        renderTaskRef.current = task;
        await task.promise;
        if (cancelled) return;
        setPageWpx(viewport.width);
        setPageHpx(viewport.height);
        pagePt.current = { w: viewport.width / scale, h: viewport.height / scale };
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') console.warn('page render:', err);
      }
    })();
    return () => { cancelled = true; if (renderTaskRef.current) renderTaskRef.current.cancel(); };
  }, [pdfDoc, currentPage, scale, renderError, viewMode]);

  // ---- Re-anchor scroll after a cursor-zoom (runs once the new canvas size lands) ----
  useEffect(() => {
    const a = zoomAnchorRef.current;
    const cont = scrollRef.current;
    if (!a || !cont) return;
    cont.scrollLeft = a.fx * cont.scrollWidth - a.ox;
    cont.scrollTop = a.fy * cont.scrollHeight - a.oy;
    zoomAnchorRef.current = null;
  }, [pageWpx, pageHpx]);

  // ---- Guide creation / repositioning via window-level drag ----
  useEffect(() => {
    if (!guideDrag) return;
    const move = (e: MouseEvent) => {
      const box = pageBoxRef.current;
      if (!box) return;
      const r = box.getBoundingClientRect();
      if (guideDrag.orient === 'h') {
        const ny = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
        setGuidePreview(ny);
        if (guideDrag.index != null) setGuidesH(g => g.map((v, i) => (i === guideDrag.index ? ny : v)));
      } else {
        const nx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
        setGuidePreview(nx);
        if (guideDrag.index != null) setGuidesV(g => g.map((v, i) => (i === guideDrag.index ? nx : v)));
      }
    };
    const up = (e: MouseEvent) => {
      const box = pageBoxRef.current;
      if (box && guideDrag.index == null) {
        const r = box.getBoundingClientRect();
        const inside = e.clientX >= r.left - 4 && e.clientX <= r.right + 4 && e.clientY >= r.top - 4 && e.clientY <= r.bottom + 4;
        if (inside) {
          if (guideDrag.orient === 'h') setGuidesH(g => [...g, Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))]);
          else setGuidesV(g => [...g, Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))]);
        }
      }
      setGuideDrag(null);
      setGuidePreview(null);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [guideDrag]);

  // ---- Coordinate helpers ----
  const toNorm = useCallback((e: React.MouseEvent) => {
    const el = overlayRef.current;
    if (!el) return { nx: 0, ny: 0 };
    const r = el.getBoundingClientRect();
    return {
      nx: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      ny: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  }, []);

  const segLenPt = (nx1: number, ny1: number, nx2: number, ny2: number) =>
    Math.hypot((nx2 - nx1) * pagePt.current.w, (ny2 - ny1) * pagePt.current.h);

  const fmtLen = (lenPt: number) => {
    const mm = lenPt * mmPerPt;
    if (measureUnit === 'cm') return `${(mm / 10).toFixed(2)} cm`;
    if (measureUnit === 'in') return `${(mm / 25.4).toFixed(2)} in`;
    if (measureUnit === 'pt') return `${lenPt.toFixed(1)} pt`;
    return `${mm.toFixed(1)} mm`;
  };

  const uid = () => `ann-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const meta = () => ({ by: currentUser?.name || 'Reviewer', role: currentUser?.role || '', ts: Date.now(), page: currentPage });

  const pageAnnots = annotations.filter(a => (a.page || 1) === currentPage);

  // Normalize legacy (800x540) coordinates for display back-compat
  const nrm = (a: Annotation) => {
    const g: any = {};
    if (a.nx != null) { g.nx = a.nx; g.ny = a.ny; } else if (a.x != null) { g.nx = a.x / 800; g.ny = a.y! / 540; }
    if (a.nw != null) { g.nw = a.nw; g.nh = a.nh; } else if (a.w != null) { g.nw = a.w / 800; g.nh = a.h! / 540; }
    if (a.ncx != null) { g.ncx = a.ncx; g.ncy = a.ncy; g.nrx = a.nrx; g.nry = a.nry; }
    else if (a.cx != null) { g.ncx = a.cx / 800; g.ncy = a.cy! / 540; g.nrx = a.rx! / 800; g.nry = a.ry! / 540; }
    if (a.nx1 != null) { g.nx1 = a.nx1; g.ny1 = a.ny1; g.nx2 = a.nx2; g.ny2 = a.ny2; }
    else if (a.x1 != null) { g.nx1 = a.x1 / 800; g.ny1 = a.y1! / 540; g.nx2 = a.x2! / 800; g.ny2 = a.y2! / 540; }
    return g;
  };

  // ---- Eraser hit-test (normalized) ----
  const hit = (nx: number, ny: number, a: Annotation): boolean => {
    const g = nrm(a);
    const px = pageWpx || 1, py = pageHpx || 1;
    const near = (gx?: number, gy?: number, rpx = 14) =>
      gx != null && gy != null && Math.hypot((nx - gx) * px, (ny - gy) * py) <= rpx;
    if (a.type === 'comment' || a.type === 'signature') return near(g.nx, g.ny, 16);
    if (a.type === 'highlight') return g.nx != null && nx >= g.nx && nx <= g.nx + g.nw && ny >= g.ny && ny <= g.ny + g.nh;
    if (a.type === 'circle') {
      if (g.ncx == null || !g.nrx || !g.nry) return false;
      const dx = (nx - g.ncx) / g.nrx, dy = (ny - g.ncy) / g.nry;
      return dx * dx + dy * dy <= 1.25;
    }
    if (a.type === 'measure') {
      if (g.nx1 == null) return false;
      const ax = (nx - g.nx1) * px, ay = (ny - g.ny1) * py;
      const cx = (g.nx2 - g.nx1) * px, cy = (g.ny2 - g.ny1) * py;
      const len = cx * cx + cy * cy;
      const t = len ? Math.max(0, Math.min(1, (ax * cx + ay * cy) / len)) : 0;
      return Math.hypot(nx * px - (g.nx1 * px + t * cx), ny * py - (g.ny1 * py + t * cy)) <= 8;
    }
    return false;
  };

  const eraseAt = (nx: number, ny: number) => {
    for (let i = annotations.length - 1; i >= 0; i--) {
      // A digital signature is legally binding once applied — it can never be erased.
      if (annotations[i].type === 'signature') continue;
      if ((annotations[i].page || 1) === currentPage && hit(nx, ny, annotations[i])) {
        onEraseAnnotation?.(annotations[i].id);
        return;
      }
    }
  };

  // Snap a normalized point to the nearest ruler guide within ~8px (accurate measurement).
  const snapToGuides = (nx: number, ny: number) => {
    const SNAP = 8;
    let sx = nx, sy = ny;
    for (const gx of guidesV) if (Math.abs(nx - gx) * (pageWpx || 1) < SNAP) sx = gx;
    for (const gy of guidesH) if (Math.abs(ny - gy) * (pageHpx || 1) < SNAP) sy = gy;
    return { nx: sx, ny: sy };
  };

  const interactive = editable && annotTool !== 'select' && annotTool !== 'hand';

  // ---- Pointer events on overlay ----
  const onDown = (e: React.MouseEvent) => {
    if (!interactive) return;
    const { nx, ny } = toNorm(e);
    if (annotTool === 'highlight' || annotTool === 'circle') {
      setDrag({ x: nx, y: ny, cx: nx, cy: ny });
    }
  };
  const onMove = (e: React.MouseEvent) => {
    if (!interactive) return;
    const p = toNorm(e);
    setMouse(p);
    if (drag) setDrag(d => (d ? { ...d, cx: p.nx, cy: p.ny } : null));
  };
  const onUp = (e: React.MouseEvent) => {
    if (!interactive || !drag) return;
    const { nx, ny } = toNorm(e);
    const x1 = Math.min(drag.x, nx), y1 = Math.min(drag.y, ny);
    const w = Math.abs(nx - drag.x), h = Math.abs(ny - drag.y);
    if (w * (pageWpx || 800) > 6 && h * (pageHpx || 540) > 6) {
      if (annotTool === 'highlight') {
        onAddAnnotation?.({ id: uid(), type: 'highlight', ...meta(), nx: x1, ny: y1, nw: w, nh: h } as Annotation);
      } else {
        onAddAnnotation?.({ id: uid(), type: 'circle', ...meta(), ncx: x1 + w / 2, ncy: y1 + h / 2, nrx: w / 2, nry: h / 2 } as Annotation);
      }
    }
    setDrag(null);
  };
  const onClick = (e: React.MouseEvent) => {
    if (!interactive || drag) return;
    let { nx, ny } = toNorm(e);
    if (annotTool === 'eraser') return eraseAt(nx, ny);
    if (annotTool === 'comment') { setPendingComment({ nx, ny }); setCommentText(''); return; }
    if (annotTool === 'signature') {
      const now = new Date();
      onAddAnnotation?.({
        id: uid(), type: 'signature', ...meta(), nx, ny,
        text: currentUser?.name,
        signedName: currentUser?.name,
        signedRole: currentUser?.role,
        signedDate: now.toLocaleString(),
      } as Annotation);
      return;
    }
    if (annotTool === 'symbol') {
      const glyph = (customGlyph.trim() || symbolGlyph || '/').slice(0, 3);
      onAddAnnotation?.({ id: uid(), type: 'symbol', ...meta(), nx, ny, symbol: glyph, text: glyph } as Annotation);
      return;
    }
    if (annotTool === 'measure') {
      if (!measureStart) { const sp = snapToGuides(nx, ny); setMeasureStart({ nx: sp.nx, ny: sp.ny }); return; }
      // snap the endpoint to nearby guides, then axis-snap to the start point
      const sp = snapToGuides(nx, ny); nx = sp.nx; ny = sp.ny;
      if (Math.abs(nx - measureStart.nx) * (pageWpx || 1) < 8) nx = measureStart.nx;
      if (Math.abs(ny - measureStart.ny) * (pageHpx || 1) < 8) ny = measureStart.ny;
      const lenPt = segLenPt(measureStart.nx, measureStart.ny, nx, ny);
      if (calibMode) {
        setPendingCalib({ lenPt });
        setCalibInput('');
      } else {
        onAddAnnotation?.({
          id: uid(), type: 'measure', ...meta(),
          nx1: measureStart.nx, ny1: measureStart.ny, nx2: nx, ny2: ny,
          text: fmtLen(lenPt), lengthMm: +(lenPt * mmPerPt).toFixed(2),
        } as Annotation);
      }
      setMeasureStart(null);
    }
  };

  // ---- Hand pan (on scroll container) ----
  const panDown = (e: React.MouseEvent) => {
    if (annotTool !== 'hand' || !scrollRef.current) return;
    panRef.current = { x: e.clientX, y: e.clientY, left: scrollRef.current.scrollLeft, top: scrollRef.current.scrollTop };
    setIsPanning(true);
  };
  const panMove = (e: React.MouseEvent) => {
    if (!panRef.current || !scrollRef.current) return;
    scrollRef.current.scrollLeft = panRef.current.left - (e.clientX - panRef.current.x);
    scrollRef.current.scrollTop = panRef.current.top - (e.clientY - panRef.current.y);
  };
  const panEnd = () => { panRef.current = null; setIsPanning(false); };

  const submitComment = () => {
    if (pendingComment && commentText.trim()) {
      onAddAnnotation?.({ id: uid(), type: 'comment', ...meta(), nx: pendingComment.nx, ny: pendingComment.ny, text: commentText.trim() } as Annotation);
    }
    setPendingComment(null);
    setCommentText('');
  };

  const submitCalib = () => {
    const mm = parseFloat(calibInput);
    if (pendingCalib && mm > 0 && pendingCalib.lenPt > 0) {
      onCalibrate?.(+(mm / pendingCalib.lenPt).toFixed(5));
    }
    setPendingCalib(null);
    setCalibInput('');
    setCalibMode(false);
  };

  // ---- Zoom (cursor-anchored ctrl/⌘+wheel, fit-to-width, presets) ----
  const onWheel = (e: React.WheelEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return; // plain scroll is left to the browser
    e.preventDefault();
    const cont = scrollRef.current;
    if (!cont) return;
    const r = cont.getBoundingClientRect();
    const ox = e.clientX - r.left;
    const oy = e.clientY - r.top;
    const dir = e.deltaY < 0 ? 1 : -1;
    const next = Math.min(4, Math.max(0.4, +(scale + dir * 0.15).toFixed(2)));
    if (next === scale) return;
    zoomAnchorRef.current = {
      fx: (cont.scrollLeft + ox) / Math.max(1, cont.scrollWidth),
      fy: (cont.scrollTop + oy) / Math.max(1, cont.scrollHeight),
      ox, oy,
    };
    setScale(next);
  };

  const fitWidth = () => {
    const cont = scrollRef.current;
    if (!cont || !pagePt.current.w) return;
    const avail = cont.clientWidth - 32 - RULER;
    setScale(Math.max(0.4, Math.min(4, +(avail / pagePt.current.w).toFixed(2))));
  };

  // ---- Ruler tick generation in the active measurement unit ----
  const rulerTicks = (orient: 'h' | 'v') => {
    const lenPx = orient === 'h' ? pageWpx : pageHpx;
    if (!lenPx || !pagePt.current.w) return [] as { px: number; label: string }[];
    const toUnit = (px: number) => {
      const lenPt = px / scale, mm = lenPt * mmPerPt;
      return measureUnit === 'cm' ? mm / 10 : measureUnit === 'in' ? mm / 25.4 : measureUnit === 'pt' ? lenPt : mm;
    };
    const fromUnit = (val: number) => {
      if (measureUnit === 'pt') return val * scale;
      const mm = measureUnit === 'cm' ? val * 10 : measureUnit === 'in' ? val * 25.4 : val;
      return (mm / mmPerPt) * scale;
    };
    const cands = [1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200, 500, 1000];
    let step = cands[cands.length - 1];
    for (const c of cands) { if (fromUnit(c) >= 55) { step = c; break; } }
    const maxVal = toUnit(lenPx);
    const ticks: { px: number; label: string }[] = [];
    for (let v = 0; v <= maxVal + 1e-6; v += step) {
      const px = fromUnit(v);
      if (px > lenPx + 0.5) break;
      ticks.push({ px, label: Number.isInteger(v) ? String(v) : v.toFixed(1) });
    }
    return ticks;
  };

  const removeGuideH = (i: number) => setGuidesH(g => g.filter((_, idx) => idx !== i));
  const removeGuideV = (i: number) => setGuidesV(g => g.filter((_, idx) => idx !== i));
  const clearGuides = () => { setGuidesH([]); setGuidesV([]); };

  const overlayCursor = annotTool === 'eraser' ? 'cell' : annotTool === 'measure' ? 'crosshair'
    : (annotTool === 'comment' || annotTool === 'signature' || annotTool === 'symbol') ? 'copy'
    : (annotTool === 'highlight' || annotTool === 'circle') ? 'crosshair' : 'default';

  return (
    <div className={`bg-surface border border-border rounded overflow-hidden flex flex-col ${className}`} onContextMenu={e => e.preventDefault()}>
      {/* Controls Bar */}
      <div className="bg-surface-hover/80 border-b border-border px-3 py-2 flex flex-wrap justify-between items-center gap-2 text-xs font-mono select-none">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-accent font-bold tracking-wide">ARTWORK</span>
          {filename && <span className="text-text-main font-semibold max-w-[220px] truncate" title={filename}>{filename}</span>}
          {calibrationMmPerPt ? (
            <span className="text-[9px] bg-brand-green/15 text-brand-green border border-brand-green/30 px-1.5 py-0.5 rounded">CALIBRATED</span>
          ) : (
            <span className="text-[9px] bg-surface text-text-dim border border-border px-1.5 py-0.5 rounded" title="Measurements assume the PDF is at 1:1 scale">PDF SCALE</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-surface border border-border rounded overflow-hidden">
            <button type="button" onClick={() => setViewMode('canvas')} className={`px-2.5 py-1 text-[11px] font-bold transition-colors ${viewMode === 'canvas' ? 'bg-accent text-black' : 'text-text-muted hover:text-text-main'}`}>Artwork</button>
            <button type="button" onClick={() => setViewMode('text')} className={`px-2.5 py-1 text-[11px] font-bold transition-colors ${viewMode === 'text' ? 'bg-accent text-black' : 'text-text-muted hover:text-text-main'}`}>Text</button>
          </div>
          {!renderError && numPages > 0 && viewMode === 'canvas' && (
            <div className="flex items-center gap-1.5 bg-surface border border-border px-2 py-0.5 rounded">
              <button type="button" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))} className="px-1.5 text-text-muted hover:text-text-main disabled:opacity-30 font-bold">◀</button>
              <span className="text-[11px] font-bold text-text-main">{currentPage} / {numPages}</span>
              <button type="button" disabled={currentPage >= numPages} onClick={() => setCurrentPage(p => Math.min(numPages, p + 1))} className="px-1.5 text-text-muted hover:text-text-main disabled:opacity-30 font-bold">▶</button>
            </div>
          )}
          {!renderError && viewMode === 'canvas' && (
            <>
              <div className="flex items-center gap-1 bg-surface border border-border px-1.5 py-0.5 rounded">
                <button type="button" onClick={() => setScale(s => Math.max(0.4, +(s - 0.15).toFixed(2)))} className="px-1.5 text-text-muted hover:text-text-main font-bold" title="Zoom out">−</button>
                <span className="text-[10px] text-text-dim w-9 text-center tabular-nums">{Math.round(scale * 100)}%</span>
                <button type="button" onClick={() => setScale(s => Math.min(4, +(s + 0.15).toFixed(2)))} className="px-1.5 text-text-muted hover:text-text-main font-bold" title="Zoom in">+</button>
                <span className="w-px h-3.5 bg-border mx-0.5" />
                <button type="button" onClick={fitWidth} className="px-1.5 text-text-muted hover:text-accent flex items-center gap-0.5" title="Fit to width"><Maximize2 size={11} strokeWidth={2} /></button>
                <button type="button" onClick={() => setScale(1)} className="px-1 text-[9px] text-text-muted hover:text-accent font-bold" title="Actual size (100%)">1:1</button>
              </div>
              <button
                type="button"
                onClick={() => setShowRulers(r => !r)}
                title="Toggle measurement rulers & guides"
                className={`flex items-center gap-1 px-2 py-1 rounded border text-[10px] transition-all ${showRulers ? 'border-accent/60 bg-accent/10 text-accent' : 'border-border text-text-muted hover:text-text-main'}`}
              >
                <Ruler size={11} strokeWidth={1.75} /> Rulers
              </button>
              {(guidesH.length > 0 || guidesV.length > 0) && (
                <button type="button" onClick={clearGuides} title="Clear all guides" className="flex items-center gap-1 px-2 py-1 rounded border border-border text-text-muted hover:text-brand-red hover:border-brand-red/40 text-[10px] transition-all">
                  <Trash2 size={11} strokeWidth={1.75} /> {guidesH.length + guidesV.length}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Symbol palette (visible while the symbol tool is active) */}
      {editable && annotTool === 'symbol' && viewMode === 'canvas' && (
        <div className="bg-surface-hover/70 border-b border-border px-3 py-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-mono text-[9px] text-accent uppercase tracking-wider mr-1">Symbol</span>
            {SYMBOL_GLYPHS.map(g => (
              <button
                key={g}
                type="button"
                onClick={() => { setSymbolGlyph(g); setCustomGlyph(''); }}
                className={`w-7 h-7 flex items-center justify-center rounded border text-sm transition-all ${customGlyph.trim() === '' && symbolGlyph === g ? 'border-accent bg-accent/15 text-accent' : 'border-border text-text-muted hover:border-text-dim'}`}
              >
                {g}
              </button>
            ))}
            <span className="w-px h-4 bg-border mx-1" />
            <input
              value={customGlyph}
              onChange={e => setCustomGlyph(e.target.value.slice(0, 3))}
              placeholder="custom"
              className="w-20 bg-surface border border-border rounded px-2 py-1 text-xs text-text-main outline-none focus:border-accent font-mono"
            />
            <span className="font-mono text-[9px] text-text-dim ml-1">click the artwork to stamp</span>
          </div>
        </div>
      )}

      {/* View area */}
      <div ref={scrollRef} onMouseDown={panDown} onMouseMove={panMove} onMouseUp={panEnd} onMouseLeave={panEnd} onWheel={onWheel}
        className="p-4 overflow-auto bg-surface-hover/20 flex justify-center items-start min-h-[350px] relative"
        style={{ maxHeight, cursor: annotTool === 'hand' ? (isPanning ? 'grabbing' : 'grab') : undefined }}>
        {viewMode === 'text' ? (
          <div className="w-full bg-surface border border-border rounded p-4 font-mono text-xs text-text-main whitespace-pre-wrap leading-relaxed select-text">
            {extractedText || 'No extracted text metadata available for this artwork.'}
          </div>
        ) : isLoading ? (
          <div className="flex flex-col items-center justify-center p-12 h-[300px]">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mb-3" />
            <span className="font-mono text-xs text-text-muted uppercase tracking-wider">Rendering artwork…</span>
          </div>
        ) : renderError || !pdfDoc ? (
          <div className="w-full bg-surface border border-border rounded p-6 flex flex-col items-center">
            <div className="w-full max-w-lg border border-accent/40 rounded p-5 bg-surface-hover/30 text-left font-mono text-xs space-y-3">
              <div className="flex justify-between items-center border-b border-border pb-2">
                <span className="text-accent font-bold uppercase tracking-wider">Artwork specimen</span>
                <span className="text-[10px] text-text-muted bg-surface px-2 py-0.5 border border-border rounded">{filename || 'SPECIMEN.PDF'}</span>
              </div>
              <p className="text-text-main mt-1 text-xs leading-relaxed whitespace-pre-wrap italic bg-surface p-3 rounded border border-border">
                {extractedText || 'Packaging artwork document recorded in the Aristopharma IB system.'}
              </p>
            </div>
          </div>
        ) : (
          /* PDF canvas + annotation overlay + Illustrator-style rulers/guides */
          <div className="relative" style={{ width: pageWpx ? pageWpx + RULER : undefined, height: pageHpx ? pageHpx + RULER : undefined }}>
            {RULER > 0 && pageWpx > 0 && (
              <>
                <div className="absolute top-0 left-0 bg-surface border-r border-b border-border z-10" style={{ width: RULER, height: RULER }} />
                <div
                  className="absolute top-0 bg-surface border-b border-border z-10 overflow-hidden cursor-ns-resize"
                  style={{ left: RULER, width: pageWpx, height: RULER }}
                  onMouseDown={() => setGuideDrag({ orient: 'h', index: null })}
                  title="Drag down onto the artwork to drop a horizontal guide"
                >
                  <svg width={pageWpx} height={RULER}>
                    {rulerTicks('h').map((t, i) => (
                      <g key={i}>
                        <line x1={t.px} y1={RULER - 6} x2={t.px} y2={RULER} stroke="#4a5568" strokeWidth={1} />
                        <text x={t.px + 2} y={9} fontFamily="monospace" fontSize={7.5} fill="#8892a4">{t.label}</text>
                      </g>
                    ))}
                  </svg>
                </div>
                <div
                  className="absolute left-0 bg-surface border-r border-border z-10 overflow-hidden cursor-ew-resize"
                  style={{ top: RULER, width: RULER, height: pageHpx }}
                  onMouseDown={() => setGuideDrag({ orient: 'v', index: null })}
                  title="Drag right onto the artwork to drop a vertical guide"
                >
                  <svg width={RULER} height={pageHpx}>
                    {rulerTicks('v').map((t, i) => (
                      <g key={i}>
                        <line x1={RULER - 6} y1={t.px} x2={RULER} y2={t.px} stroke="#4a5568" strokeWidth={1} />
                        <text x={2} y={t.px + 8} fontFamily="monospace" fontSize={7.5} fill="#8892a4">{t.label}</text>
                      </g>
                    ))}
                  </svg>
                </div>
              </>
            )}
          <div ref={pageBoxRef} className="absolute shadow-lg" style={{ left: RULER, top: RULER, width: pageWpx || undefined, height: pageHpx || undefined }}>
            <canvas ref={canvasRef} className="block bg-white" />
            <svg
              ref={overlayRef}
              className="absolute top-0 left-0"
              width={pageWpx || 0}
              height={pageHpx || 0}
              viewBox={`0 0 ${pageWpx || 1} ${pageHpx || 1}`}
              style={{ pointerEvents: interactive ? 'auto' : 'none', cursor: overlayCursor }}
              onMouseDown={onDown}
              onMouseMove={onMove}
              onMouseUp={onUp}
              onClick={onClick}
            >
              {pageAnnots.map(a => {
                const g = nrm(a);
                const W = pageWpx, H = pageHpx;
                const isHead = a.role === 'IB-CO' || a.role === 'IB-SH' || /head/i.test(a.role);
                const color = a.type === 'signature' ? '#22c55e' : isHead ? '#f59e0b' : '#3b82f6';
                if (a.type === 'highlight' && g.nx != null)
                  return <rect key={a.id} x={g.nx * W} y={g.ny * H} width={g.nw * W} height={g.nh * H} fill="rgba(245,158,11,0.18)" stroke={color} strokeWidth={1.5} />;
                if (a.type === 'circle' && g.ncx != null)
                  return <ellipse key={a.id} cx={g.ncx * W} cy={g.ncy * H} rx={g.nrx * W} ry={g.nry * H} fill="none" stroke={color} strokeWidth={2} />;
                if (a.type === 'measure' && g.nx1 != null) {
                  const x1 = g.nx1 * W, y1 = g.ny1 * H, x2 = g.nx2 * W, y2 = g.ny2 * H;
                  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
                  const label = a.text || fmtLen(segLenPt(g.nx1, g.ny1, g.nx2, g.ny2));
                  return (
                    <g key={a.id}>
                      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#3b82f6" strokeWidth={1.5} />
                      <circle cx={x1} cy={y1} r={3} fill="#3b82f6" /><circle cx={x2} cy={y2} r={3} fill="#3b82f6" />
                      <g transform={`translate(${mx},${my})`}>
                        <rect x={-label.length * 3.4 - 5} y={-9} width={label.length * 6.8 + 10} height={16} rx={3} fill="#0b1220" stroke="#3b82f6" strokeWidth={0.75} />
                        <text x={0} y={2} textAnchor="middle" fontFamily="monospace" fontSize={10} fill="#93c5fd">{label}</text>
                      </g>
                    </g>
                  );
                }
                if (a.type === 'comment' && g.nx != null) {
                  return (
                    <g key={a.id} transform={`translate(${g.nx * W},${g.ny * H})`}>
                      <circle r={8} fill={color} />
                      <text x={0} y={3} textAnchor="middle" fontFamily="monospace" fontSize={10} fill="#0b1220" fontWeight="700">i</text>
                      <title>{`${a.by} (${a.role}): ${a.text || ''}`}</title>
                    </g>
                  );
                }
                if (a.type === 'symbol' && g.nx != null) {
                  return (
                    <g key={a.id} transform={`translate(${g.nx * W},${g.ny * H})`}>
                      <circle r={11} fill="rgba(245,158,11,0.10)" stroke={color} strokeWidth={1.25} />
                      <text x={0} y={4.5} textAnchor="middle" fontFamily="monospace" fontSize={13} fontWeight="700" fill={color}>{a.symbol || a.text}</text>
                      <title>{`${a.by} (${a.role}) marked: ${a.symbol || a.text}`}</title>
                    </g>
                  );
                }
                if (a.type === 'signature' && g.nx != null) {
                  const w = 214, h = 76;
                  const x = Math.min(g.nx * W, Math.max(0, W - w));
                  const y = Math.min(g.ny * H, Math.max(0, H - h));
                  return (
                    <foreignObject key={a.id} x={x} y={y} width={w} height={h} style={{ overflow: 'visible' }}>
                      <div style={{
                        boxSizing: 'border-box', width: `${w}px`, background: 'linear-gradient(135deg, rgba(46,204,113,0.10), rgba(19,22,27,0.92))',
                        border: '1px solid #2ecc71', borderRadius: '6px', padding: '6px 10px', fontFamily: 'DM Mono, monospace',
                        boxShadow: '0 2px 10px rgba(0,0,0,0.35)', position: 'relative',
                      }}>
                        <div style={{ position: 'absolute', top: '5px', right: '7px', fontSize: '9px', color: '#2ecc71', fontWeight: 700 }}>✓ e-Sign</div>
                        <div style={{ fontFamily: 'Dancing Script, cursive', fontSize: '26px', lineHeight: 1, color: '#eafff2', fontWeight: 700, paddingRight: '38px' }}>
                          {a.signedName || a.text || 'Signed'}
                        </div>
                        <div style={{ height: '1px', background: 'rgba(46,204,113,0.5)', margin: '3px 0 4px' }} />
                        <div style={{ fontSize: '8.5px', color: '#8892a4', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          Digitally signed · {a.signedRole || a.role}
                        </div>
                        <div style={{ fontSize: '8.5px', color: '#6b7688', marginTop: '1px' }}>{a.signedDate || ''}</div>
                      </div>
                    </foreignObject>
                  );
                }
                return null;
              })}

              {/* Live previews */}
              {interactive && drag && annotTool === 'highlight' && (
                <rect x={Math.min(drag.x, drag.cx) * pageWpx} y={Math.min(drag.y, drag.cy) * pageHpx}
                  width={Math.abs(drag.cx - drag.x) * pageWpx} height={Math.abs(drag.cy - drag.y) * pageHpx}
                  fill="rgba(245,158,11,0.12)" stroke="#f59e0b" strokeWidth={1} strokeDasharray="4 2" />
              )}
              {interactive && drag && annotTool === 'circle' && (
                <ellipse cx={(drag.x + drag.cx) / 2 * pageWpx} cy={(drag.y + drag.cy) / 2 * pageHpx}
                  rx={Math.abs(drag.cx - drag.x) / 2 * pageWpx} ry={Math.abs(drag.cy - drag.y) / 2 * pageHpx}
                  fill="none" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4 2" />
              )}
              {interactive && annotTool === 'measure' && measureStart && mouse && (
                <g>
                  <line x1={measureStart.nx * pageWpx} y1={measureStart.ny * pageHpx} x2={mouse.nx * pageWpx} y2={mouse.ny * pageHpx} stroke="#3b82f6" strokeWidth={1.25} strokeDasharray="5 3" />
                  <circle cx={measureStart.nx * pageWpx} cy={measureStart.ny * pageHpx} r={3.5} fill="#3b82f6" />
                  <g transform={`translate(${mouse.nx * pageWpx},${mouse.ny * pageHpx - 12})`}>
                    {(() => { const l = fmtLen(segLenPt(measureStart.nx, measureStart.ny, mouse.nx, mouse.ny)); return (
                      <><rect x={-l.length * 3.4 - 5} y={-9} width={l.length * 6.8 + 10} height={16} rx={3} fill="#0b1220" stroke="#3b82f6" strokeWidth={0.75} />
                        <text x={0} y={2} textAnchor="middle" fontFamily="monospace" fontSize={10} fill="#93c5fd">{l}</text></>
                    ); })()}
                  </g>
                </g>
              )}
            </svg>

            {/* Guide layer (Illustrator-style alignment guides) */}
            <svg className="absolute top-0 left-0" width={pageWpx || 0} height={pageHpx || 0} style={{ pointerEvents: 'none', overflow: 'visible' }}>
              {guidesH.map((gy, i) => (
                <g key={`gh-${i}`}>
                  <line x1={0} y1={gy * pageHpx} x2={pageWpx} y2={gy * pageHpx} stroke="#22d3ee" strokeWidth={0.8} strokeDasharray="5 3" />
                  <line x1={0} y1={gy * pageHpx} x2={pageWpx} y2={gy * pageHpx} stroke="transparent" strokeWidth={7} style={{ pointerEvents: 'stroke', cursor: 'ns-resize' }} onMouseDown={() => setGuideDrag({ orient: 'h', index: i })} />
                  <g transform={`translate(${(pageWpx || 0) - 13},${gy * pageHpx})`} style={{ pointerEvents: 'auto', cursor: 'pointer' }} onClick={() => removeGuideH(i)}>
                    <circle r={6} fill="#0b1220" stroke="#22d3ee" strokeWidth={0.75} />
                    <text x={0} y={2.6} textAnchor="middle" fontSize={8} fill="#22d3ee" fontFamily="monospace">×</text>
                  </g>
                </g>
              ))}
              {guidesV.map((gx, i) => (
                <g key={`gv-${i}`}>
                  <line x1={gx * pageWpx} y1={0} x2={gx * pageWpx} y2={pageHpx} stroke="#22d3ee" strokeWidth={0.8} strokeDasharray="5 3" />
                  <line x1={gx * pageWpx} y1={0} x2={gx * pageWpx} y2={pageHpx} stroke="transparent" strokeWidth={7} style={{ pointerEvents: 'stroke', cursor: 'ew-resize' }} onMouseDown={() => setGuideDrag({ orient: 'v', index: i })} />
                  <g transform={`translate(${gx * pageWpx},13)`} style={{ pointerEvents: 'auto', cursor: 'pointer' }} onClick={() => removeGuideV(i)}>
                    <circle r={6} fill="#0b1220" stroke="#22d3ee" strokeWidth={0.75} />
                    <text x={0} y={2.6} textAnchor="middle" fontSize={8} fill="#22d3ee" fontFamily="monospace">×</text>
                  </g>
                </g>
              ))}
              {guideDrag && guideDrag.index == null && guidePreview != null && (
                guideDrag.orient === 'h'
                  ? <line x1={0} y1={guidePreview * (pageHpx || 0)} x2={pageWpx} y2={guidePreview * (pageHpx || 0)} stroke="#22d3ee" strokeWidth={1} strokeDasharray="3 2" />
                  : <line x1={guidePreview * (pageWpx || 0)} y1={0} x2={guidePreview * (pageWpx || 0)} y2={pageHpx} stroke="#22d3ee" strokeWidth={1} strokeDasharray="3 2" />
              )}
            </svg>

            {/* Floating comment input */}
            {pendingComment && (
              <div className="absolute z-20 bg-surface border border-accent rounded shadow-xl p-2 w-56"
                style={{ left: Math.min(pendingComment.nx * pageWpx, Math.max(0, pageWpx - 232)), top: pendingComment.ny * pageHpx + 6 }}>
                <textarea autoFocus value={commentText} onChange={e => setCommentText(e.target.value)}
                  placeholder="Review comment…" rows={3}
                  className="w-full bg-surface-hover border border-border rounded p-2 text-xs text-text-main outline-none focus:border-accent resize-none" />
                <div className="flex justify-end gap-2 mt-1.5">
                  <button onClick={() => setPendingComment(null)} className="text-[10px] font-mono text-text-dim hover:text-text-main px-2 py-1">Cancel</button>
                  <button onClick={submitComment} className="text-[10px] font-mono bg-accent text-black font-bold px-2.5 py-1 rounded">Add</button>
                </div>
              </div>
            )}

            {/* Floating calibration input */}
            {pendingCalib && (
              <div className="absolute z-20 left-1/2 -translate-x-1/2 top-4 bg-surface border border-accent rounded shadow-xl p-3 w-64">
                <div className="text-[10px] font-mono text-accent uppercase tracking-wider mb-1.5">Calibrate scale</div>
                <div className="text-[11px] text-text-muted mb-2">Enter the real length of the line you drew (mm):</div>
                <div className="flex gap-2">
                  <input autoFocus type="number" value={calibInput} onChange={e => setCalibInput(e.target.value)} placeholder="e.g. 113"
                    className="flex-1 bg-surface-hover border border-border rounded px-2 py-1 text-xs text-text-main outline-none focus:border-accent" />
                  <button onClick={submitCalib} className="text-[10px] font-mono bg-accent text-black font-bold px-2.5 py-1 rounded">Set</button>
                </div>
              </div>
            )}
          </div>
          </div>
        )}
      </div>

      {/* Calibration control (only when editable with measure tool) */}
      {editable && viewMode === 'canvas' && annotTool === 'measure' && (
        <div className="bg-surface-hover/60 border-t border-border px-3 py-1.5 flex items-center gap-2 text-[10px] font-mono">
          <CrosshairIcon size={12} className="text-accent" />
          <button onClick={() => { setCalibMode(m => !m); setMeasureStart(null); }}
            className={`px-2 py-0.5 rounded border ${calibMode ? 'border-accent bg-accent/15 text-accent' : 'border-border text-text-muted hover:text-text-main'}`}>
            {calibMode ? 'Calibrating: draw a line of known length' : 'Calibrate scale'}
          </button>
          <span className="text-text-dim">
            {calibrationMmPerPt ? `1 pt = ${calibrationMmPerPt.toFixed(4)} mm` : 'Using PDF native scale (1:1 assumed)'}
          </span>
        </div>
      )}

      <div className="bg-surface border-t border-border px-3 py-1.5 flex justify-between items-center text-[10px] font-mono text-text-muted">
        <span>Protected viewer · downloads disabled</span>
        {numPages > 0 && <span>Page {currentPage} of {numPages}</span>}
      </div>
    </div>
  );
}
