/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import { Submission, User } from '../types';
import PdfCanvasViewer from './PdfCanvasViewer';
import WorkflowStepper from './WorkflowStepper';
import { emitToast } from './Toast';

interface DetailModalProps {
  user: User;
  submissionId: string;
  onClose: () => void;
}

const DEPT_LABELS: Record<string, string> = {
  'IB-CO': 'IB Corporate Office', 'IB-SH': 'IB Shampur', 'QC-SH': 'QC Shampur',
  'IRA-SH': 'IRA Shampur', 'QCom-SH': 'QCom Shampur', 'PROD-SH': 'Production SH',
  'RnD-SH': 'R&D Shampur', 'IRA-GA': 'IRA Gachha', 'RnD-GA': 'R&D Gachha',
  'QC-GA': 'QC Gachha', 'QM-GA': 'QM Gachha', 'QCom-GA': 'QCom Gachha',
  'APPROVED': 'Approved'
};

export default function DetailModal({ user, submissionId, onClose }: DetailModalProps) {
  const [s, setSub] = useState<Submission | null>(null);
  const [uploadingBC, setUploadingBC] = useState(false);

  const loadSub = useCallback(async () => {
    try {
      const res = await fetch(`/api/submissions/${submissionId}`);
      if (res.ok) setSub(await res.json());
    } catch (e) {
      console.error(e);
    }
  }, [submissionId]);

  useEffect(() => { loadSub(); }, [loadSub]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleAttachBuyerConfirmation = async (file: File | undefined) => {
    if (!file) return;
    if (!/image\/(jpe?g|png)/i.test(file.type)) {
      emitToast('Please attach a JPG/PNG screenshot of the buyer confirmation e-mail.', 'error');
      return;
    }
    setUploadingBC(true);
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(new Error('read failed'));
        r.readAsDataURL(file);
      });
      const res = await fetch(`/api/submissions/${submissionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'attach_buyer_confirmation', filename: file.name, dataUrl, user })
      });
      if (res.ok) {
        setSub(await res.json());
        emitToast('Buyer confirmation attached and recorded in the audit trail.', 'success');
      } else {
        const err = await res.json();
        emitToast(err.error || 'Failed to attach buyer confirmation', 'error');
      }
    } catch {
      emitToast('Failed to attach buyer confirmation', 'error');
    } finally {
      setUploadingBC(false);
    }
  };

  if (!s) return null;

  const isCommercial = /commercial/i.test(s.purpose || '') || /commercial/i.test(s.flowKey || '');

  // Every field captured on the submission form, surfaced with the archived record.
  const metaFields: Array<[string, string | undefined]> = [
    ['Generic Name', s.genericName],
    ['Strength', s.strength],
    ['Composition', s.composition],
    ['DAR / Reg. No.', s.darNumber],
    ['Material Code', s.materialCode],
    ['Barcode No.', s.barcodeNumber],
    ['Pack Size', s.packSize],
    ['Storage Condition', s.storage],
    ['Market Countries', s.marketCountries],
    ['Manufacturer', s.manufacturer],
    ['Components', (s.components || []).join(', ')],
    ['Artwork Date', s.date],
    ['Submitted By', s.submittedBy ? `${s.submittedBy}${s.submitterRole ? ' · ' + s.submitterRole : ''}` : undefined],
    ['Submitted On', s.submittedAt ? new Date(s.submittedAt).toLocaleString() : undefined],
  ];

  return (
    <div
      className="fixed inset-0 bg-black/80 z-50 overflow-y-auto p-4 md:p-8 backdrop-blur-sm flex justify-center items-start font-sans"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border rounded shadow-2xl w-full max-w-xl my-4 md:my-8 flex flex-col relative"
        role="dialog"
        aria-modal="true"
        aria-label={`Submission detail ${s.id}`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-border flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="tid text-xs">{s.id}</span>
            <div className="font-display text-lg text-text-main tracking-wider">SUBMISSION DETAIL</div>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-text-muted hover:text-text-main text-lg font-bold leading-none">
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex flex-col gap-4 text-xs text-text-muted">
          <div className="grid grid-cols-2 gap-3 pb-3 border-b border-border/20">
            <div>
              <span className="text-text-dim block uppercase font-mono text-[9px]">Product Spec</span>
              <strong className="text-text-main font-semibold text-sm mt-0.5 block">{s.product}</strong>
            </div>
            <div>
              <span className="text-text-dim block uppercase font-mono text-[9px]">Filing Country</span>
              <strong className="text-text-main font-semibold text-sm mt-0.5 block">{s.country}</strong>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 border-b border-border/20 pb-3">
            <div>
              <span className="text-text-dim block uppercase font-mono text-[9px]">Dosage Form</span>
              <span className="text-text-main font-semibold mt-0.5 block">{s.dosageForm}</span>
            </div>
            <div>
              <span className="text-text-dim block uppercase font-mono text-[9px]">Plant Site</span>
              <span className="px-2 py-0.5 bg-surface-hover border border-border rounded mt-0.5 inline-block font-mono">
                {s.plant}
              </span>
            </div>
            <div className="mt-2">
              <span className="text-text-dim block uppercase font-mono text-[9px]">Purpose Route</span>
              <span className="text-text-main font-semibold mt-0.5 block">{s.purpose} ({s.flowKey})</span>
            </div>
            <div className="mt-2">
              <span className="text-text-dim block uppercase font-mono text-[9px]">Priority Spec</span>
              <span className="text-text-main font-semibold mt-0.5 block">{s.priority}</span>
            </div>
          </div>

          {(s.correctionRaised || s.status === 'Correction') && (
            <div className="rounded border border-brand-red/40 bg-brand-red/10 text-[#f87060] px-3 py-2 text-[11px] flex items-start gap-2">
              <span className="font-mono text-sm leading-none mt-0.5">⚠</span>
              <div>
                <strong className="uppercase tracking-wide">Correction status.</strong> A correction was raised during review and carried forward with this artwork through the workflow; it was not archived as an approved copy.
                {s.correctionNote && <> Latest note: <em>"{s.correctionNote}"</em></>}
              </div>
            </div>
          )}

          {/* Full regulatory / submission metadata captured at intake — archived with the record */}
          <div className="border border-border/50 rounded bg-surface-hover/20 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-accent block uppercase font-mono text-[9px] font-bold tracking-wider">Regulatory &amp; Submission Metadata</span>
              <span className="font-mono text-[8px] text-text-dim uppercase">as submitted</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-3 gap-y-2.5">
              {metaFields.map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <span className="text-text-dim block uppercase font-mono text-[9px]">{label}</span>
                  <span className={`mt-0.5 block break-words ${value ? 'text-text-main font-medium' : 'text-text-dim'}`}>
                    {value && value.trim() ? value : '—'}
                  </span>
                </div>
              ))}
            </div>
            {s.comments && s.comments.trim() && (
              <div className="mt-3 pt-3 border-t border-border/30">
                <span className="text-text-dim block uppercase font-mono text-[9px] mb-1">Submitter Comments / Instructions</span>
                <p className="text-text-main text-[11px] leading-relaxed whitespace-pre-wrap italic bg-surface border border-border/40 rounded p-2">{s.comments}</p>
              </div>
            )}
          </div>

          {/* Uploaded PDF Attachment Section (raw artwork + live annotation overlay) */}
          <div className="border border-border/60 rounded bg-surface overflow-hidden p-1">
            <PdfCanvasViewer
              fileUrl={`/api/drive/file/${s.rawFileId || s.driveFileId || s.id}`}
              filename={s.filename || `${s.id}_Artwork.pdf`}
              extractedText={s.extractedText}
              annotations={s.annotations || []}
              measureUnit="mm"
              calibrationMmPerPt={s.calibrationMmPerPt}
              maxHeight="380px"
            />
          </div>

          {/* Role-gated downloads — the review viewer stays protected, but the raw
              artwork and the flattened annotated copy download separately (IB-CO/IB-SH/QC-SH) */}
          {['IB-CO', 'IB-SH', 'QC-SH'].includes(user.role) && (
            <div className="flex flex-wrap items-center gap-2 -mt-1">
              <span className="text-text-dim font-mono text-[9px] uppercase tracking-wider mr-1">Downloads</span>
              <a
                href={`/api/drive/file/${s.rawFileId || s.driveFileId || s.id}?download=1`}
                download
                className="inline-flex items-center gap-1.5 bg-surface-hover border border-border hover:border-accent text-text-muted hover:text-accent px-3 py-1.5 rounded font-mono text-[10px] tracking-wide transition-all"
              >
                ⭳ Raw PDF (plain)
              </a>
              {(s.annotatedFileId || s.approvedFileId) ? (
                <a
                  href={`/api/drive/file/${s.annotatedFileId || s.approvedFileId}?download=1`}
                  download
                  className="inline-flex items-center gap-1.5 bg-surface-hover border border-border hover:border-brand-green/50 text-text-muted hover:text-brand-green px-3 py-1.5 rounded font-mono text-[10px] tracking-wide transition-all"
                >
                  ⭳ Annotated PDF (flattened)
                </a>
              ) : (
                <span className="font-mono text-[9px] text-text-dim">annotated copy is generated at final archiving</span>
              )}
            </div>
          )}

          {/* Buyer confirmation attachments (Commercial) — visualized here + in audit */}
          {(isCommercial || (s.buyerConfirmations && s.buyerConfirmations.length > 0)) && (
            <div className="border border-border/50 rounded bg-surface-hover/20 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-accent block uppercase font-mono text-[9px] font-bold tracking-wider">Buyer Confirmation Attachments</span>
                <span className="font-mono text-[8px] text-text-dim uppercase">commercial · jpg</span>
              </div>
              {s.buyerConfirmations && s.buyerConfirmations.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {s.buyerConfirmations.map(bc => (
                    <a
                      key={bc.id}
                      href={bc.dataUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="block border border-border/60 rounded overflow-hidden bg-surface hover:border-accent transition-all"
                    >
                      {bc.dataUrl
                        ? <img src={bc.dataUrl} alt={bc.filename} className="w-full h-24 object-cover" />
                        : <div className="h-24 flex items-center justify-center text-text-dim text-[10px]">no preview</div>}
                      <div className="p-1.5">
                        <div className="font-mono text-[9px] text-text-main truncate" title={bc.filename}>{bc.filename}</div>
                        <div className="font-mono text-[8px] text-text-dim">{bc.by} · {new Date(bc.ts).toLocaleDateString()}</div>
                        {bc.note && <div className="text-[9px] text-text-muted italic mt-0.5">"{bc.note}"</div>}
                      </div>
                    </a>
                  ))}
                </div>
              ) : (
                <div className="font-mono text-[10px] text-text-dim">No buyer confirmations attached yet.</div>
              )}
              {user.role === 'IB-CO' && isCommercial && (
                <label className={`mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded font-mono text-[10px] tracking-wide cursor-pointer transition-all border ${uploadingBC ? 'border-border text-text-dim' : 'border-accent/60 text-accent hover:bg-accent/10'}`}>
                  {uploadingBC ? 'Uploading…' : '＋ Attach buyer confirmation (jpg)'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png"
                    className="hidden"
                    disabled={uploadingBC}
                    onChange={e => handleAttachBuyerConfirmation(e.target.files?.[0])}
                  />
                </label>
              )}
            </div>
          )}

          {/* Stepper progress */}
          <div>
            <span className="text-text-dim block uppercase font-mono text-[9px] mb-3">Workflow Steps Trace</span>
            <WorkflowStepper workflow={s.workflow} stageIndex={s.stageIndex} size="sm" />
          </div>

          {/* History stamps */}
          <div>
            <span className="text-text-dim block uppercase font-mono text-[9px] mb-2">Immutable Decisions Stamps</span>
            <div className="flex flex-col gap-2 bg-surface-hover/30 p-3 border border-border/40 rounded max-h-[160px] overflow-y-auto">
              {s.history.map((h, i) => (
                <div key={i} className="flex gap-3 items-start border-b border-border/15 pb-2 last:border-0 last:pb-0 text-[11px]">
                  <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                    h.action === 'Submitted' ? 'bg-accent' : h.action === 'Approved' ? 'bg-brand-green' : 'bg-brand-red'
                  }`} />
                  <div>
                    <div>
                      <strong>{h.by} ({h.dept})</strong> — <span className="text-text-main font-medium">{h.action}</span>
                    </div>
                    {h.comment && <div className="italic text-text-dim mt-0.5">"{h.comment}"</div>}
                    <div className="font-mono text-[9px] text-text-dim mt-1">{new Date(h.ts).toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Discussion comments summaries */}
          <div>
            <span className="text-text-dim block uppercase font-mono text-[9px] mb-2">Discussion Messages</span>
            <div className="flex flex-col gap-1.5 max-h-[100px] overflow-y-auto">
              {s.chat && s.chat.length > 0 ? (
                s.chat.map((m, idx) => (
                  <div key={idx} className="text-[11px] border-b border-border/10 pb-1 last:border-0">
                    <span className="font-semibold text-text-main">{m.by} ({m.role}): </span>
                    <span>{m.text}</span>
                  </div>
                ))
              ) : (
                <div className="font-mono text-[10px] text-text-dim">No comments posted yet.</div>
              )}
            </div>
          </div>
        </div>

        {/* Close Button */}
        <div className="p-4 border-t border-border flex justify-end flex-shrink-0">
          <button
            onClick={onClose}
            className="bg-surface-hover hover:border-accent border border-border text-text-muted hover:text-accent px-4 py-2 rounded font-mono text-xs tracking-wider"
          >
            Close Details
          </button>
        </div>
      </div>
    </div>
  );
}
