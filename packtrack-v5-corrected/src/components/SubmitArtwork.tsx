/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Plant, Priority, User } from '../types';
import { emitToast } from './Toast';
import PdfCanvasViewer from './PdfCanvasViewer';

async function fileToBase64(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const bytes = new Uint8Array(e.target?.result as ArrayBuffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
      resolve(btoa(binary));
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

async function archiveToDrive(file: File, metadata: any): Promise<{ fileId: string; link: string }> {
  const fileBase64 = await fileToBase64(file);
  const res = await fetch('/api/drive/archive', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileBase64, filename: file.name, meta: metadata })
  });
  if (!res.ok) throw new Error('Drive archive failed');
  return res.json();
}

interface SubmitArtworkProps {
  user: User;
  onSubmitSuccess: () => void;
}

export interface PageFormItem {
  pageNumber: number;
  plant: Plant | '';
  purpose: string;
  product: string;
  dosageForm: string;
  packSize: string;
  genericName: string;
  strength: string;
  darNumber: string;
  materialCode: string;
  barcodeNumber: string;
  mainCountry: string;
  marketCountries: string;
  composition: string;
  storage: string;
  artworkDate: string;
  priority: Priority;
  components: string[];
  comments: string;
  extractedText?: string;
  filename?: string;
  fileObj?: File;
  fileUrl?: string;
}

const PRODUCTS = [
  'Atenolol 50mg Tablet',
  'Amoxicillin 500mg Capsule',
  'Metformin 500mg Tablet',
  'Omeprazole 20mg Capsule',
  'Ciprofloxacin 500mg Tablet',
  'Paracetamol 500mg Tablet',
  'Lisinopril 10mg Tablet',
  'Amlodipine 5mg Tablet',
  'Timolol 0.5% Eye Drops',
  'Latanoprost 0.005% Eye Drops',
  'Ceftriaxone 1g Injection',
  'Diclofenac 75mg Injection',
  'Salbutamol Inhaler 100mcg',
  'Hydrocortisone 1% Cream',
  'Cetirizine 10mg Syrup',
  'Ibuprofen 100mg/5ml Suspension'
];

const DOSAGE_FORMS = [
  'Tablet', 'Capsule', 'Ophthalmic', 'Injection', 'Syrup',
  'Suspension', 'Cream/Ointment', 'Inhaler', 'Suppository', 'Sachet'
];

const COMPONENTS = [
  'Inner Carton', 'Insert', 'Blister Foil', 'Label', 'Tube',
  'Sachet', 'Vial', 'Ampoule'
];

const createDefaultPageForm = (pageNumber: number, filename?: string, fileObj?: File, fileUrl?: string): PageFormItem => ({
  pageNumber,
  plant: '',
  purpose: '',
  product: '',
  dosageForm: '',
  packSize: '',
  genericName: '',
  strength: '',
  darNumber: '',
  materialCode: '',
  barcodeNumber: '',
  mainCountry: '',
  marketCountries: '',
  composition: '',
  storage: '',
  artworkDate: new Date().toISOString().split('T')[0],
  priority: 'Normal',
  components: ['Inner Carton'],
  comments: '',
  extractedText: '',
  filename: filename || '',
  fileObj,
  fileUrl
});

export default function SubmitArtwork({ user, onSubmitSuccess }: SubmitArtworkProps) {
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [pageForms, setPageForms] = useState<PageFormItem[]>([createDefaultPageForm(1)]);
  const [activePageIndex, setActivePageIndex] = useState<number>(0);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [dragActive, setDragActive] = useState<boolean>(false);

  // Pop-up Preview Modal state for uploaded PDF pages
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState<boolean>(false);
  const [previewModalTab, setPreviewModalTab] = useState<'pdf' | 'text'>('pdf');

  useEffect(() => {
    const loadConfig = async () => {
      try {
        await fetch('/api/config');
      } catch (e) {
        console.error('Failed to load department config', e);
      }
    };
    loadConfig();
  }, []);

  const analyzeFile = async (file: File, objectUrl?: string) => {
    setIsAnalyzing(true);
    try {
      const base64 = await fileToBase64(file);
      const res = await fetch('/api/analyze-artwork', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileBase64: base64,
          filename: file.name,
          fileType: file.type
        })
      });

      if (res.ok) {
        const data = await res.json();
        const extractedPages: any[] = data.pages || [];
        const isSinglePage = extractedPages.length <= 1;
        
        const newForms: PageFormItem[] = [];
        if (extractedPages.length > 0) {
          extractedPages.forEach((pg: any, idx: number) => {
            let pgPlant: Plant | '' = pg.plant || '';
            const txt = (pg.text || '').toLowerCase();
            if (!pgPlant) {
              if (txt.includes('shampur')) pgPlant = 'Shampur';
              else if (txt.includes('gachha')) pgPlant = 'Gachha';
              else if (data.plant) pgPlant = data.plant;
            }

            const mainCty = pg.country || pg.mainCountry || (isSinglePage ? (data.country || data.mainCountry) : '') || '';
            const mktCty = pg.marketCountries || (isSinglePage ? data.marketCountries : '') || '';

            newForms.push({
              pageNumber: idx + 1,
              plant: pgPlant,
              purpose: pg.purpose || (isSinglePage ? data.purpose : '') || '',
              product: pg.product || (isSinglePage ? data.product : '') || '',
              dosageForm: pg.dosageForm || (isSinglePage ? data.dosageForm : '') || '',
              packSize: pg.packSize || (isSinglePage ? data.packSize : '') || '',
              genericName: pg.genericName || (isSinglePage ? data.genericName : '') || '',
              strength: pg.strength || (isSinglePage ? data.strength : '') || '',
              darNumber: pg.darNumber || '',
              materialCode: pg.materialCode || '',
              barcodeNumber: pg.barcodeNumber || '',
              mainCountry: mainCty,
              marketCountries: mktCty,
              composition: pg.composition || (isSinglePage ? data.composition : '') || '',
              storage: pg.storage || (isSinglePage ? data.storage : '') || '',
              artworkDate: pg.date || (isSinglePage ? (data.date || data.artworkDate) : '') || new Date().toISOString().split('T')[0],
              priority: 'Normal',
              components: pg.components && pg.components.length > 0 ? pg.components : (idx === 0 ? ['Inner Carton'] : ['Insert']),
              comments: '',
              extractedText: pg.text || '',
              filename: file.name,
              fileObj: file,
              fileUrl: objectUrl
            });
          });
        } else {
          let detectedPlant: Plant | '' = data.plant || '';
          const textLower = (data.pagesText ? data.pagesText.join(' ') : '').toLowerCase();
          if (!detectedPlant) {
            if (textLower.includes('shampur')) detectedPlant = 'Shampur';
            else if (textLower.includes('gachha')) detectedPlant = 'Gachha';
          }

          newForms.push({
            pageNumber: 1,
            plant: detectedPlant,
            purpose: data.purpose || '',
            product: data.product || '',
            dosageForm: data.dosageForm || '',
            packSize: data.packSize || '',
            genericName: data.genericName || '',
            strength: data.strength || '',
            darNumber: data.darNumber || '',
            materialCode: data.materialCode || '',
            barcodeNumber: data.barcodeNumber || '',
            mainCountry: data.country || data.mainCountry || '',
            marketCountries: data.marketCountries || '',
            composition: data.composition || '',
            storage: data.storage || '',
            artworkDate: data.date || data.artworkDate || new Date().toISOString().split('T')[0],
            priority: 'Normal',
            components: ['Inner Carton'],
            comments: '',
            extractedText: data.pagesText ? data.pagesText.join('\n') : '',
            filename: file.name,
            fileObj: file,
            fileUrl: objectUrl
          });
        }

        setPageForms(prev => {
          // If only 1 initial blank form exists, replace it, otherwise append new page forms
          const isInitialBlank = prev.length === 1 && !prev[0].product && !prev[0].mainCountry && !prev[0].plant;
          const baseList = isInitialBlank ? [] : prev;
          const startIdx = baseList.length;

          const renumbered = newForms.map((f, i) => ({
            ...f,
            pageNumber: startIdx + i + 1
          }));

          return [...baseList, ...renumbered];
        });

        emitToast(`Extracted artwork data for ${file.name}. ${newForms.length} page form(s) generated.`, 'success');
      } else {
        throw new Error('Analysis failed');
      }
    } catch (e) {
      console.error(e);
      emitToast(`Uploaded ${file.name}. Manual entry active for page form.`, 'info');
      setPageForms(prev => {
        const isInitialBlank = prev.length === 1 && !prev[0].product && !prev[0].mainCountry && !prev[0].plant;
        if (isInitialBlank) {
          return [{ ...prev[0], filename: file.name, fileObj: file, fileUrl: objectUrl }];
        }
        return [...prev, createDefaultPageForm(prev.length + 1, file.name, file, objectUrl)];
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const processIncomingFiles = (fileList: FileList | File[]) => {
    const filesArray = Array.from(fileList);
    const pdfFiles = filesArray.filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));

    if (pdfFiles.length === 0) {
      emitToast('Please upload PDF artwork files only.', 'error');
      return;
    }

    setUploadedFiles(prev => [...prev, ...pdfFiles]);
    pdfFiles.forEach(file => {
      const objectUrl = URL.createObjectURL(file);
      analyzeFile(file, objectUrl);
    });
  };

  const removeUploadedFile = (indexToRemove: number) => {
    setUploadedFiles(prev => prev.filter((_, idx) => idx !== indexToRemove));
    emitToast('Artwork file removed from list.', 'info');
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processIncomingFiles(e.dataTransfer.files);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processIncomingFiles(e.target.files);
    }
  };

  const updateActivePageField = (field: keyof PageFormItem, value: any) => {
    setPageForms(prev => {
      const copy = [...prev];
      if (copy[activePageIndex]) {
        copy[activePageIndex] = { ...copy[activePageIndex], [field]: value };
      }
      return copy;
    });
  };

  const toggleComponentInActivePage = (comp: string) => {
    setPageForms(prev => {
      const copy = [...prev];
      const cur = copy[activePageIndex];
      if (cur) {
        const exists = cur.components.includes(comp);
        const updatedComps = exists
          ? cur.components.filter(c => c !== comp)
          : [...cur.components, comp];
        copy[activePageIndex] = { ...cur, components: updatedComps };
      }
      return copy;
    });
  };

  const addNewPageForm = () => {
    setPageForms(prev => [
      ...prev,
      createDefaultPageForm(prev.length + 1)
    ]);
    setActivePageIndex(pageForms.length);
    emitToast(`Page ${pageForms.length + 1} form added.`, 'info');
  };

  const deleteCurrentPageForm = () => {
    if (pageForms.length <= 1) {
      emitToast('At least one page form is required.', 'info');
      return;
    }
    setPageForms(prev => {
      const filtered = prev.filter((_, idx) => idx !== activePageIndex);
      return filtered.map((item, idx) => ({ ...item, pageNumber: idx + 1 }));
    });
    setActivePageIndex(prev => Math.max(0, prev - 1));
    emitToast('Page form removed.', 'info');
  };

  const clearAllForms = () => {
    setUploadedFiles([]);
    setPageForms([createDefaultPageForm(1)]);
    setActivePageIndex(0);
    emitToast('Form cleared.', 'info');
  };

  const submitAllPageForms = async () => {
    // Validate compulsory fields for EVERY page form
    for (let i = 0; i < pageForms.length; i++) {
      const f = pageForms[i];
      if (!f.plant) {
        setActivePageIndex(i);
        emitToast(`Page ${i + 1}: Plant selection is compulsory.`, 'error');
        return;
      }
      if (!f.product || !f.product.trim()) {
        setActivePageIndex(i);
        emitToast(`Page ${i + 1}: Product name is compulsory.`, 'error');
        return;
      }
      if (!f.dosageForm) {
        setActivePageIndex(i);
        emitToast(`Page ${i + 1}: Dosage Form selection is compulsory.`, 'error');
        return;
      }
      if (!f.mainCountry || !f.mainCountry.trim()) {
        setActivePageIndex(i);
        emitToast(`Page ${i + 1}: Main Country is compulsory.`, 'error');
        return;
      }
      if (!f.components || f.components.length === 0) {
        setActivePageIndex(i);
        emitToast(`Page ${i + 1}: Select at least 1 Component.`, 'error');
        return;
      }
    }

    const archivedFilesMap = new Map<string, { fileId: string; link: string }>();

    if (uploadedFiles.length > 0) {
      try {
        emitToast(`Archiving ${uploadedFiles.length} artwork PDF file(s)...`, 'info');
        for (const file of uploadedFiles) {
          try {
            const archived = await archiveToDrive(file, {
              filename: file.name,
              product: pageForms[0]?.product,
              plant: pageForms[0]?.plant,
              country: pageForms[0]?.mainCountry
            });
            archivedFilesMap.set(file.name, { fileId: archived.fileId, link: archived.link });
          } catch (err) {
            console.error(`Failed to archive ${file.name}:`, err);
          }
        }
        if (archivedFilesMap.size > 0) {
          emitToast('Artwork PDF(s) archived successfully.', 'success');
        }
      } catch (e) {
        console.error(e);
        emitToast('Archived locally in application storage.', 'info');
      }
    }

    // Generate individual submission payload per page
    const submissionPayloads = pageForms.map((pg) => {
      const matchedArchive = pg.filename ? archivedFilesMap.get(pg.filename) : undefined;
      const fallbackArchive = archivedFilesMap.values().next().value;
      const pgDriveFileId = matchedArchive?.fileId || fallbackArchive?.fileId;
      const pgDriveLink = matchedArchive?.link || fallbackArchive?.link;

      const defaultFilename = pg.filename || (uploadedFiles[0]
        ? `${uploadedFiles[0].name.replace('.pdf', '')}_Page_${pg.pageNumber}.pdf`
        : `${pg.product.replace(/\s+/g, '_')}_Page_${pg.pageNumber}.pdf`);

      return {
        product: pg.product.trim(),
        dosageForm: pg.dosageForm,
        country: pg.mainCountry.trim(),
        marketCountries: pg.marketCountries.trim(),
        plant: pg.plant as Plant,
        purpose: pg.purpose.trim() || 'Standard',
        priority: pg.priority,
        components: pg.components,
        comments: pg.comments.trim(),
        packSize: pg.packSize.trim(),
        genericName: pg.genericName.trim(),
        strength: pg.strength.trim(),
        darNumber: pg.darNumber.trim(),
        materialCode: pg.materialCode.trim(),
        barcodeNumber: pg.barcodeNumber.trim(),
        composition: pg.composition.trim(),
        storage: pg.storage.trim(),
        date: pg.artworkDate,
        submittedBy: user.name,
        filename: defaultFilename,
        driveFileId: pgDriveFileId,
        driveLink: pgDriveLink,
        pages: [{
          pageNumber: pg.pageNumber,
          product: pg.product.trim(),
          country: pg.mainCountry.trim(),
          purpose: pg.purpose.trim(),
          date: pg.artworkDate,
          plant: pg.plant,
          text: pg.extractedText || ''
        }],
        pagesText: [pg.extractedText || '']
      };
    });

    try {
      const res = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submissionPayloads)
      });

      if (res.ok) {
        emitToast(`Filed ${submissionPayloads.length} submission(s) (one per PDF page) successfully.`, 'success');
        clearAllForms();
        onSubmitSuccess();
      } else {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Submission failed');
      }
    } catch (e: any) {
      emitToast(e.message || 'Failed to submit artwork package to database.', 'error');
    }
  };

  const activeForm = pageForms[activePageIndex] || createDefaultPageForm(1);

  return (
    <div className="bg-surface border border-border p-7 rounded font-sans max-w-4xl mx-auto animate-fade-in relative shadow-lg">
      
      {/* Loading Overlay */}
      {isAnalyzing && (
        <div className="absolute inset-0 bg-surface/90 backdrop-blur-sm z-50 flex flex-col justify-center items-center rounded">
          <div className="w-12 h-12 border-4 border-t-accent border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin mb-4" />
          <div className="font-display text-lg text-text-main tracking-wider animate-pulse">GEMINI DEEP ARTWORK ANALYSIS</div>
          <div className="font-mono text-[10px] text-accent mt-1.5 uppercase tracking-widest">
            Extracting page metadata & generating per-page forms...
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-center border-b border-border pb-5 mb-6">
        <div>
          <div className="font-display text-2xl text-text-main tracking-wide uppercase">SUBMIT ARTWORK PACKAGE</div>
          <div className="font-mono text-[10px] text-text-muted mt-1 uppercase tracking-wider">
            File artwork presentation packages - Page-by-page submissions
          </div>
        </div>
        <div className="text-right">
          <span className="bg-brand-green/15 border border-brand-green/20 text-brand-green font-mono text-[9px] font-bold px-3 py-1 rounded tracking-wider uppercase">
            AUTOMATIC DRIVE ARCHIVE
          </span>
        </div>
      </div>

      {/* PDF Upload Space */}
      <div className="mb-6 bg-surface-hover/30 border border-border/80 rounded-lg p-5">
        <div className="flex justify-between items-center mb-2">
          <label className="text-[11px] font-mono text-accent uppercase tracking-wider font-bold">
            PDF Upload Space (Single / Multi-page / Multiple PDFs)
          </label>
          {uploadedFiles.length > 0 && (
            <span className="font-mono text-[10px] text-brand-green font-semibold">
              {uploadedFiles.length} file(s) attached
            </span>
          )}
        </div>

        <div
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={() => document.getElementById('artwork-file-input-space')?.click()}
          className={`border-2 border-dashed rounded p-6 text-center cursor-pointer transition-all duration-200 ${
            uploadedFiles.length > 0
              ? 'border-brand-green/80 bg-brand-green/5'
              : dragActive
              ? 'border-accent bg-accent/5'
              : 'border-border bg-surface-hover hover:border-accent'
          }`}
        >
          <input
            type="file"
            id="artwork-file-input-space"
            accept=".pdf"
            multiple
            onChange={handleFileChange}
            className="hidden"
          />
          <div className="font-mono text-sm font-bold text-text-main uppercase">
            Click or drag & drop PDF file(s) here
          </div>
          <div className="text-[10px] font-mono text-text-muted mt-1">
            Supports single, multi-page, or multiple PDFs. Continuous uploads supported without losing existing data.
          </div>
        </div>

        {/* Uploaded File List */}
        {uploadedFiles.length > 0 && (
          <div className="mt-4 flex flex-col gap-2">
            <div className="text-[10px] font-mono text-text-muted uppercase tracking-wider">
              Attached PDF Artwork Files:
            </div>
            <div className="flex flex-wrap gap-2">
              {uploadedFiles.map((file, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-surface border border-border px-3 py-1.5 rounded text-xs font-mono">
                  <span className="text-brand-green font-semibold">[PDF] {file.name}</span>
                  <span className="text-text-dim text-[10px]">({(file.size / (1024 * 1024)).toFixed(2)} MB)</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeUploadedFile(idx);
                    }}
                    className="text-text-muted hover:text-red-400 font-bold ml-1 cursor-pointer"
                    title="Remove file"
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => document.getElementById('artwork-file-input-space')?.click()}
                className="px-3 py-1.5 rounded border border-accent/60 bg-accent/10 text-accent font-mono text-xs hover:bg-accent/20 cursor-pointer font-semibold"
              >
                + Upload More PDFs
              </button>
            </div>
          </div>
        )}
      </div>

      {/* PAGE FORM NAVIGATION BAR */}
      <div className="bg-surface-hover/50 border border-border rounded-lg p-4 mb-6">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold text-accent uppercase tracking-wider">
              Page Form Navigation
            </span>
            <span className="font-mono text-xs bg-accent/15 border border-accent/30 text-accent font-bold px-2.5 py-0.5 rounded">
              Page {activePageIndex + 1} of {pageForms.length}
            </span>
          </div>

          {/* Page Pills Navigation */}
          <div className="flex items-center gap-1.5 overflow-x-auto py-1 max-w-full">
            <button
              type="button"
              disabled={activePageIndex === 0}
              onClick={() => setActivePageIndex(prev => Math.max(0, prev - 1))}
              className="px-3 py-1 rounded bg-surface border border-border text-xs font-mono font-bold text-accent hover:border-accent disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
            >
              Previous Page
            </button>

            {pageForms.map((p, idx) => {
              const isActive = activePageIndex === idx;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setActivePageIndex(idx)}
                  className={`px-3 py-1 text-xs font-mono rounded font-bold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-accent text-black shadow'
                      : 'bg-surface border border-border text-text-muted hover:text-text-main hover:border-accent'
                  }`}
                >
                  Page {idx + 1}
                </button>
              );
            })}

            <button
              type="button"
              disabled={activePageIndex >= pageForms.length - 1}
              onClick={() => setActivePageIndex(prev => Math.min(pageForms.length - 1, prev + 1))}
              className="px-3 py-1 rounded bg-surface border border-border text-xs font-mono font-bold text-accent hover:border-accent disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
            >
              Next Page
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={addNewPageForm}
              className="px-3 py-1.5 rounded bg-accent/10 border border-accent/50 text-accent text-xs font-mono font-bold hover:bg-accent/20 transition-colors cursor-pointer"
            >
              + Add Page Form
            </button>
            {pageForms.length > 1 && (
              <button
                type="button"
                onClick={deleteCurrentPageForm}
                className="px-3 py-1.5 rounded bg-red-500/10 border border-red-500/40 text-red-400 text-xs font-mono hover:bg-red-500/20 transition-colors cursor-pointer"
              >
                Remove Page Form
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ACTIVE PAGE FORM CONTENT */}
      <div className="bg-surface-hover/20 border border-border rounded-lg p-6 space-y-5">
        <div className="border-b border-border/70 pb-3 flex flex-wrap justify-between items-center gap-3">
          <div>
            <div className="font-mono text-xs font-bold text-text-main uppercase tracking-wider flex items-center gap-2">
              <span>Page {activeForm.pageNumber} Artwork Details</span>
              {activeForm.filename && (
                <span className="text-[10px] text-accent font-normal bg-accent/10 border border-accent/30 px-2 py-0.5 rounded font-mono">
                  📄 {activeForm.filename}
                </span>
              )}
            </div>
            <div className="font-mono text-[10px] text-text-muted mt-0.5">
              Compulsory fields marked with *
            </div>
          </div>

          {/* Embedded Preview Button for this Page */}
          <button
            type="button"
            onClick={() => {
              setPreviewModalTab('pdf');
              setIsPreviewModalOpen(true);
            }}
            className="px-3.5 py-1.5 rounded bg-accent text-black font-mono text-xs font-bold hover:bg-accent-hover transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
          >
            <span>🔍</span>
            <span>Preview Page {activeForm.pageNumber} Artwork</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Plant * */}
          <div>
            <label className="block text-[10px] font-mono text-text-muted uppercase tracking-wider mb-1.5">
              Plant *
            </label>
            <select
              value={activeForm.plant}
              onChange={e => updateActivePageField('plant', e.target.value as Plant)}
              className="w-full bg-surface border border-border text-text-main p-3 rounded text-sm focus:border-accent outline-none font-semibold"
            >
              <option value="">Select Plant *</option>
              <option value="Shampur">Shampur</option>
              <option value="Gachha">Gachha</option>
            </select>
          </div>

          {/* Purpose */}
          <div>
            <label className="block text-[10px] font-mono text-text-muted uppercase tracking-wider mb-1.5">
              Purpose
            </label>
            <input
              type="text"
              value={activeForm.purpose}
              onChange={e => updateActivePageField('purpose', e.target.value)}
              placeholder="e.g. Commercial, Regulatory, Launch..."
              className="w-full bg-surface border border-border text-text-main p-3 rounded text-sm focus:border-accent outline-none"
            />
          </div>

          {/* Product * */}
          <div>
            <label className="block text-[10px] font-mono text-text-muted uppercase tracking-wider mb-1.5">
              Product *
            </label>
            <input
              type="text"
              value={activeForm.product}
              onChange={e => updateActivePageField('product', e.target.value)}
              list="product-suggestions"
              placeholder="e.g. Paracetamol 500mg Tablet *"
              className="w-full bg-surface border border-border text-text-main p-3 rounded text-sm focus:border-accent outline-none font-semibold"
            />
            <datalist id="product-suggestions">
              {PRODUCTS.map(p => <option key={p} value={p} />)}
            </datalist>
          </div>

          {/* Dosage Form * */}
          <div>
            <label className="block text-[10px] font-mono text-text-muted uppercase tracking-wider mb-1.5">
              Dosage Form *
            </label>
            <select
              value={activeForm.dosageForm}
              onChange={e => updateActivePageField('dosageForm', e.target.value)}
              className="w-full bg-surface border border-border text-text-main p-3 rounded text-sm focus:border-accent outline-none font-semibold"
            >
              <option value="">Select Dosage Form *</option>
              {DOSAGE_FORMS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          {/* Pack Size */}
          <div>
            <label className="block text-[10px] font-mono text-text-muted uppercase tracking-wider mb-1.5">
              Pack Size
            </label>
            <input
              type="text"
              value={activeForm.packSize}
              onChange={e => updateActivePageField('packSize', e.target.value)}
              placeholder="e.g. 10x10 blister, 100ml bottle"
              className="w-full bg-surface border border-border text-text-main p-3 rounded text-sm focus:border-accent outline-none"
            />
          </div>

          {/* Generic Name */}
          <div>
            <label className="block text-[10px] font-mono text-text-muted uppercase tracking-wider mb-1.5">
              Generic Name (INN)
            </label>
            <input
              type="text"
              value={activeForm.genericName}
              onChange={e => updateActivePageField('genericName', e.target.value)}
              placeholder="e.g. Paracetamol"
              className="w-full bg-surface border border-border text-text-main p-3 rounded text-sm focus:border-accent outline-none"
            />
          </div>

          {/* Strength */}
          <div>
            <label className="block text-[10px] font-mono text-text-muted uppercase tracking-wider mb-1.5">
              Strength
            </label>
            <input
              type="text"
              value={activeForm.strength}
              onChange={e => updateActivePageField('strength', e.target.value)}
              placeholder="e.g. 500 mg, 0.05% w/v"
              className="w-full bg-surface border border-border text-text-main p-3 rounded text-sm focus:border-accent outline-none"
            />
          </div>

          {/* D.A.R. Registration No. */}
          <div>
            <label className="block text-[10px] font-mono text-text-muted uppercase tracking-wider mb-1.5">
              D.A.R. Registration No.
            </label>
            <input
              type="text"
              value={activeForm.darNumber}
              onChange={e => updateActivePageField('darNumber', e.target.value)}
              placeholder="e.g. 143-525-021"
              className="w-full bg-surface border border-border text-text-main p-3 rounded text-sm focus:border-accent outline-none font-mono"
            />
          </div>

          {/* Material / Artwork Code */}
          <div>
            <label className="block text-[10px] font-mono text-text-muted uppercase tracking-wider mb-1.5">
              Material / Artwork Code
            </label>
            <input
              type="text"
              value={activeForm.materialCode}
              onChange={e => updateActivePageField('materialCode', e.target.value)}
              placeholder="e.g. 20005038/01"
              className="w-full bg-surface border border-border text-text-main p-3 rounded text-sm focus:border-accent outline-none font-mono"
            />
          </div>

          {/* Barcode No. */}
          <div>
            <label className="block text-[10px] font-mono text-text-muted uppercase tracking-wider mb-1.5">
              Barcode No.
            </label>
            <input
              type="text"
              value={activeForm.barcodeNumber}
              onChange={e => updateActivePageField('barcodeNumber', e.target.value)}
              placeholder="e.g. 890123456789"
              className="w-full bg-surface border border-border text-text-main p-3 rounded text-sm focus:border-accent outline-none font-mono"
            />
          </div>

          {/* Main Country * */}
          <div>
            <label className="block text-[10px] font-mono text-text-muted uppercase tracking-wider mb-1.5">
              Main Country * (First country mentioned serially)
            </label>
            <input
              type="text"
              value={activeForm.mainCountry}
              onChange={e => updateActivePageField('mainCountry', e.target.value)}
              placeholder="e.g. Sri Lanka, Kenya, Vietnam *"
              className="w-full bg-surface border border-border text-text-main p-3 rounded text-sm focus:border-accent outline-none font-bold"
            />
          </div>

          {/* Market Countries */}
          <div>
            <label className="block text-[10px] font-mono text-text-muted uppercase tracking-wider mb-1.5">
              Market Countries (Subsequent countries after the first country)
            </label>
            <input
              type="text"
              value={activeForm.marketCountries}
              onChange={e => updateActivePageField('marketCountries', e.target.value)}
              placeholder="e.g. Myanmar, Tanzania, Laos"
              className="w-full bg-surface border border-border text-text-main p-3 rounded text-sm focus:border-accent outline-none font-medium"
            />
          </div>

          {/* Composition */}
          <div className="md:col-span-2">
            <label className="block text-[10px] font-mono text-text-muted uppercase tracking-wider mb-1.5">
              Composition
            </label>
            <textarea
              value={activeForm.composition}
              onChange={e => updateActivePageField('composition', e.target.value)}
              rows={2}
              placeholder="e.g. Each film coated tablet contains..."
              className="w-full bg-surface border border-border text-text-main p-3 rounded text-sm focus:border-accent outline-none resize-y"
            />
          </div>

          {/* Storage */}
          <div className="md:col-span-2">
            <label className="block text-[10px] font-mono text-text-muted uppercase tracking-wider mb-1.5">
              Storage / Handling
            </label>
            <textarea
              value={activeForm.storage}
              onChange={e => updateActivePageField('storage', e.target.value)}
              rows={2}
              placeholder="e.g. Store below 30 degree C; Protect from light & moisture..."
              className="w-full bg-surface border border-border text-text-main p-3 rounded text-sm focus:border-accent outline-none resize-y"
            />
          </div>

          {/* Artwork Date */}
          <div>
            <label className="block text-[10px] font-mono text-text-muted uppercase tracking-wider mb-1.5">
              Artwork Date (Date available inside artwork itself)
            </label>
            <input
              type="date"
              value={activeForm.artworkDate}
              onChange={e => updateActivePageField('artworkDate', e.target.value)}
              className="w-full bg-surface border border-border text-text-main p-3 rounded text-sm focus:border-accent outline-none font-mono"
            />
          </div>

          {/* Priority */}
          <div>
            <label className="block text-[10px] font-mono text-text-muted uppercase tracking-wider mb-1.5">
              Priority
            </label>
            <select
              value={activeForm.priority}
              onChange={e => updateActivePageField('priority', e.target.value as Priority)}
              className="w-full bg-surface border border-border text-text-main p-3 rounded text-sm focus:border-accent outline-none font-semibold"
            >
              <option value="Normal">Normal (2 days)</option>
              <option value="Medium">Medium (1 day)</option>
              <option value="Urgent">Urgent (0.5 days)</option>
            </select>
          </div>

          {/* Required Components * */}
          <div className="md:col-span-2">
            <label className="block text-[10px] font-mono text-text-muted uppercase tracking-wider mb-2">
              Components * (At least 1 required)
            </label>
            <div className="flex flex-wrap gap-2">
              {COMPONENTS.map(c => {
                const selected = activeForm.components.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => toggleComponentInActivePage(c)}
                    className={`px-4 py-2 border rounded text-xs font-mono transition-all duration-150 cursor-pointer ${
                      selected
                        ? 'border-accent bg-accent/15 text-accent font-bold shadow-sm'
                        : 'border-border bg-surface text-text-muted hover:border-text-dim'
                    }`}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Comments / Instructions */}
          <div className="md:col-span-2">
            <label className="block text-[10px] font-mono text-text-muted uppercase tracking-wider mb-1.5">
              Comments / Instructions (Set by IB-CO manually)
            </label>
            <textarea
              value={activeForm.comments}
              onChange={e => updateActivePageField('comments', e.target.value)}
              placeholder="Add manual instructions or context for reviewers..."
              className="w-full bg-surface border border-border text-text-main p-3 rounded text-sm focus:border-accent outline-none min-h-[80px] resize-y"
            />
          </div>
        </div>
      </div>

      {/* Navigation & Action Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mt-8 border-t border-border pt-5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={activePageIndex === 0}
            onClick={() => setActivePageIndex(prev => Math.max(0, prev - 1))}
            className="bg-surface border border-border text-text-main hover:border-accent px-4 py-2.5 rounded font-mono text-xs transition-all disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed font-semibold"
          >
            Previous Page
          </button>
          <button
            type="button"
            disabled={activePageIndex >= pageForms.length - 1}
            onClick={() => setActivePageIndex(prev => Math.min(pageForms.length - 1, prev + 1))}
            className="bg-surface border border-border text-text-main hover:border-accent px-4 py-2.5 rounded font-mono text-xs transition-all disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed font-semibold"
          >
            Next Page
          </button>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={clearAllForms}
            className="bg-transparent border border-border hover:border-accent text-text-muted hover:text-accent px-5 py-2.5 rounded font-mono text-xs transition-all cursor-pointer"
          >
            Clear Form
          </button>
          <button
            type="button"
            onClick={submitAllPageForms}
            className="bg-accent hover:bg-accent-hover text-black px-6 py-2.5 rounded font-mono text-xs font-bold transition-all cursor-pointer shadow-lg uppercase tracking-wider"
          >
            Submit All Pages ({pageForms.length} Submission{pageForms.length > 1 ? 's' : ''})
          </button>
        </div>
      </div>

      {/* PAGE ARTWORK PREVIEW POPUP MODAL */}
      {isPreviewModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-surface border border-border rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="bg-surface-hover/80 border-b border-border p-4 flex justify-between items-center">
              <div>
                <div className="font-display text-lg text-text-main tracking-wider uppercase flex items-center gap-2">
                  <span>PAGE {activeForm.pageNumber} ARTWORK PREVIEW</span>
                  {activeForm.filename && (
                    <span className="text-xs text-accent font-mono border border-accent/40 bg-accent/10 px-2 py-0.5 rounded">
                      {activeForm.filename}
                    </span>
                  )}
                </div>
                <div className="font-mono text-[11px] text-text-muted mt-0.5">
                  Product: <strong className="text-text-main">{activeForm.product || 'Not specified'}</strong> | Plant: <strong className="text-accent">{activeForm.plant || 'Unassigned'}</strong> | Country: <strong className="text-text-main">{activeForm.mainCountry || 'N/A'}</strong>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsPreviewModalOpen(false)}
                className="p-1.5 rounded bg-surface border border-border text-text-muted hover:text-text-main hover:border-accent text-xs font-mono cursor-pointer font-bold px-3"
              >
                ✕ Close
              </button>
            </div>

            {/* View Mode Tabs */}
            <div className="bg-surface border-b border-border px-4 py-2 flex justify-between items-center text-xs font-mono">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPreviewModalTab('pdf')}
                  className={`px-3 py-1 rounded font-bold transition-all cursor-pointer ${
                    previewModalTab === 'pdf'
                      ? 'bg-accent text-black shadow'
                      : 'bg-surface-hover text-text-muted hover:text-text-main'
                  }`}
                >
                  📄 PDF Page Document View
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewModalTab('text')}
                  className={`px-3 py-1 rounded font-bold transition-all cursor-pointer ${
                    previewModalTab === 'text'
                      ? 'bg-accent text-black shadow'
                      : 'bg-surface-hover text-text-muted hover:text-text-main'
                  }`}
                >
                  📝 Extracted Page Text
                </button>
              </div>

              <span className="text-accent font-bold text-xs">
                Protected Specimen Viewer
              </span>
            </div>

            {/* Modal Body Content */}
            <div className="p-4 flex-1 overflow-auto bg-surface-hover/20 min-h-[450px]">
              {previewModalTab === 'pdf' ? (
                <PdfCanvasViewer
                  fileUrl={activeForm.fileUrl}
                  fileObj={activeForm.fileObj}
                  filename={activeForm.filename || `Page_${activeForm.pageNumber}_Artwork.pdf`}
                  extractedText={activeForm.extractedText}
                  maxHeight="540px"
                />
              ) : (
                <div className="bg-surface border border-border rounded p-4 h-[540px] overflow-auto font-mono text-xs text-text-main whitespace-pre-wrap leading-relaxed select-text">
                  {activeForm.extractedText ? (
                    activeForm.extractedText
                  ) : (
                    <span className="text-text-muted italic">No extracted text recorded for page {activeForm.pageNumber}.</span>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="bg-surface border-t border-border p-3 flex justify-between items-center font-mono text-xs">
              <span className="text-text-muted text-[11px]">
                Target Components: <strong className="text-accent">{activeForm.components.join(', ') || 'None selected'}</strong>
              </span>
              <button
                type="button"
                onClick={() => setIsPreviewModalOpen(false)}
                className="px-5 py-1.5 rounded bg-accent text-black font-bold hover:bg-accent-hover cursor-pointer"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
