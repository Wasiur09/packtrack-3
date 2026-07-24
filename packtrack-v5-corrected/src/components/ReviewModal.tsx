/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { Submission, User, Annotation, ChatMessage } from '../types';
import { emitToast } from './Toast';
import { PERSONNEL, DEPT_LABELS, PLANT_DEPARTMENTS } from '../shared/constants';
import PdfCanvasViewer from './PdfCanvasViewer';
import WorkflowStepper from './WorkflowStepper';

// Configure pdfjs worker to unpkg worker matching version
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
import {
  MessageSquarePlus, Highlighter, Circle, Ruler, PenLine,
  Hand, Eraser, MousePointer2, Undo2, Plus, X, Save, GitBranch, Sigma
} from 'lucide-react';

interface ReviewModalProps {
  user: User;
  submissionId: string;
  onClose: () => void;
  onUpdateSuccess: () => void;
}

function deptFamily(role: string): string {
  if (!role) return 'IB-CO';
  if (role === 'IB-CO') return 'IB-CO';
  if (role === 'IB-SH') return 'IB-SH';
  if (role.startsWith('QC')) return 'QC';
  if (role.startsWith('IRA')) return 'IRA';
  if (role.startsWith('PROD')) return 'PROD';
  if (role.startsWith('RnD')) return 'RnD';
  if (role.startsWith('QCo')) return 'QCo';
  if (role.startsWith('QCom')) return 'QCom';
  if (role.startsWith('QM')) return 'QM';
  return 'IB-CO';
}

function avatarInitials(name: string): string {
  if (!name) return '?';
  return name.split(/\s+/).map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

function roleColor(role: string): string {
  const fam = deptFamily(role);
  const colors: Record<string, string> = {
    'IB-CO': '#f5a623', 'IB-SH': '#f5c270', 'QC': '#2ecc71', 'IRA': '#3b82f6',
    'PROD': '#e8471d', 'RnD': '#8b5cf6', 'QCo': '#f0c060', 'QCom': '#f0c060', 'QM': '#f0c060'
  };
  return colors[fam] || '#888';
}

function dosageRouteText(form: string): string {
  const map: Record<string, string> = {
    Tablet: 'oral use', Capsule: 'oral use', Ophthalmic: 'topical ocular use',
    Injection: 'parenteral use', Syrup: 'oral use', Suspension: 'oral use',
    'Cream/Ointment': 'topical use', Inhaler: 'oral inhalation', Suppository: 'rectal use',
    Sachet: 'oral use'
  };
  return map[form] || 'as directed';
}

function escapeXml(s: string): string {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function isHeadAnnotation(a: Annotation): boolean {
  if (!a) return false;
  if (a.role && a.role.endsWith('-H')) return true;
  return PERSONNEL.some(p => p.isHead && (p.name === a.by || p.email === a.by));
}

export default function ReviewModal({
  user,
  submissionId,
  onClose,
  onUpdateSuccess
}: ReviewModalProps) {
  const [s, setSub] = useState<Submission | null>(null);
  const [comment, setComment] = useState('');
  const [chatText, setChatText] = useState('');
  const [selectedMemberName, setSelectedMemberName] = useState('');
  const [annotTool, setAnnotTool] = useState<'select' | 'comment' | 'highlight' | 'circle' | 'measure' | 'signature' | 'hand' | 'eraser' | 'symbol'>('select');

  // IB-SH workflow builder state
  const [wfTemplates, setWfTemplates] = useState<any[]>([]);
  const [wfSteps, setWfSteps] = useState<string[]>(['IB-CO', 'IB-SH']);
  const [wfName, setWfName] = useState('');
  const [wfSaveTemplate, setWfSaveTemplate] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [measureUnit, setMeasureUnit] = useState<'mm' | 'cm' | 'in' | 'pt'>('mm');

  useEffect(() => {
    const fetchSub = async () => {
      try {
        const res = await fetch(`/api/submissions/${submissionId}`);
        if (res.ok) {
          const data = await res.json();
          setSub(data);
        }
      } catch (e) {
        console.error('Failed to pull specific submission metadata', e);
      }
    };
    fetchSub();

    // Poll chat details every 2.5s for real-time discussion response
    const interval = setInterval(fetchSub, 2500);
    return () => clearInterval(interval);
  }, [submissionId]);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [s?.chat]);

  useEffect(() => {
    fetch('/api/config').then(r => (r.ok ? r.json() : null)).then(d => { if (d) setWfTemplates(d.workflows || []); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!s) return;
    setWfSteps(s.workflowConfirmed && s.workflow?.length >= 2 ? s.workflow : ['IB-CO', 'IB-SH']);
    setWfName(s.flowKey && !s.flowKey.startsWith('(') ? s.flowKey : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s?.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't hijack Escape while typing in an input/textarea/select.
      const el = e.target as HTMLElement | null;
      const typing = el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
      if (e.key === 'Escape' && !typing) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!s) return null;

  const isIBHO = user.role === 'IB-CO';
  const canAct = s.currentStage === user.role && s.status === 'In Progress';

  // A reviewer must apply their (one-time) digital signature before they may
  // forward/approve the artwork. Correction requests do not require a signature.
  const hasSigned = s.annotations.some(a => a.type === 'signature' && a.by === user.name && a.role === user.role);

  const subDeptStage = s.subDeptStage || 'HEAD_ASSIGN';

  // Security & QC Visibility Controls:
  // "make sure that the annotations of the head of the department are not visible to the team members before forwarding the artwork. The artwork itself should not be visible beforehand."
  const isArtworkVisible = Boolean(user.isHead || user.role === 'IB-CO' || subDeptStage !== 'HEAD_ASSIGN' || s.status === 'Approved' || s.status === 'Correction');

  const visibleAnnotations = (user.isHead || user.role === 'IB-CO' || subDeptStage !== 'HEAD_ASSIGN' || s.status === 'Approved' || s.status === 'Correction')
    ? s.annotations
    : s.annotations.filter(a => !isHeadAnnotation(a));

  const handleReviewDecision = async (action: 'approve' | 'correction') => {
    if (action === 'correction' && !comment.trim()) {
      emitToast('Please add a comment note detailing the required correction', 'error');
      return;
    }
    if (action === 'approve' && !hasSigned) {
      emitToast('Apply your one-time digital signature on the artwork before approving & forwarding.', 'error');
      setAnnotTool('signature');
      return;
    }

    try {
      const res = await fetch(`/api/submissions/${s.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          comment: comment.trim(),
          user
        })
      });

      if (res.ok) {
        emitToast(
          action === 'approve'
            ? 'Artwork verified & approved successfully!'
            : 'Correction recorded — the artwork carries the correction status forward.',
          action === 'approve' ? 'success' : 'info'
        );
        onUpdateSuccess();
        onClose();
      } else {
        const err = await res.json();
        throw new Error(err.error || 'Failed');
      }
    } catch (e: any) {
      emitToast(e.message || 'Failed to publish review decision to server', 'error');
    }
  };

  // Department Head dismisses a member's flagged correction, then proceeds to approve.
  const handleOverride = async () => {
    try {
      const res = await fetch(`/api/submissions/${s.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'override_correction', comment: comment.trim(), user })
      });
      if (res.ok) {
        const updated = await res.json();
        setSub(updated);
        emitToast("Member's correction overridden — you may now sign and approve.", 'success');
      } else {
        const err = await res.json();
        emitToast(err.error || 'Failed to override correction', 'error');
      }
    } catch (e) {
      emitToast('Failed to override correction', 'error');
    }
  };

  // Department Head upholds a member's correction — carries it FORWARD with the artwork.
  const handleUphold = async () => {
    const note = comment.trim() || s.correctionNote || 'Correction upheld by Department Head.';
    try {
      const res = await fetch(`/api/submissions/${s.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'correction', comment: note, user })
      });
      if (res.ok) {
        emitToast('Correction upheld — carried forward with the artwork.', 'info');
        onUpdateSuccess();
        onClose();
      } else {
        const err = await res.json();
        emitToast(err.error || 'Failed to uphold correction', 'error');
      }
    } catch (e) {
      emitToast('Failed to uphold correction', 'error');
    }
  };

  const handleAssignMember = async () => {
    if (!selectedMemberName) {
      emitToast('Please select a department member to assign', 'error');
      return;
    }
    try {
      const res = await fetch(`/api/submissions/${s.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'assign_member',
          assignedMember: selectedMemberName,
          user
        })
      });
      if (res.ok) {
        const updated = await res.json();
        setSub(updated);
        emitToast(`Artwork successfully assigned to ${selectedMemberName} for verification`, 'success');
      } else {
        const err = await res.json();
        emitToast(err.error || 'Failed to assign member', 'error');
      }
    } catch (e) {
      emitToast('Failed to assign member', 'error');
    }
  };

  const handleMemberCheck = async (action: 'member_check' | 'correction') => {
    if (action === 'correction' && !comment.trim()) {
      emitToast('Please add a comment note detailing the required correction', 'error');
      return;
    }
    if (action === 'member_check' && !hasSigned) {
      emitToast('Apply your one-time digital signature on the artwork before forwarding to the Department Head.', 'error');
      setAnnotTool('signature');
      return;
    }
    try {
      const res = await fetch(`/api/submissions/${s.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: action === 'correction' ? 'correction' : 'member_check',
          comment: comment.trim() || 'Checked and verified.',
          user
        })
      });
      if (res.ok) {
        if (action === 'correction') {
          emitToast('Correction flagged — routed to your Department Head for override/uphold.', 'info');
          onUpdateSuccess();
          onClose();
        } else {
          const updated = await res.json();
          setSub(updated);
          setComment('');
          emitToast('Artwork verified and forwarded back to Department Head', 'success');
        }
      } else {
        const err = await res.json();
        emitToast(err.error || 'Failed to complete member check', 'error');
      }
    } catch (e) {
      emitToast('Failed to complete member check', 'error');
    }
  };

  const sendChat = async () => {
    if (!chatText.trim()) return;
    const msg: ChatMessage = {
      by: user.name,
      role: user.role,
      ts: Date.now(),
      text: chatText.trim()
    };

    try {
      const res = await fetch(`/api/submissions/${s.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'chat',
          chatMessage: msg
        })
      });
      if (res.ok) {
        const updated = await res.json();
        setSub(updated);
        setChatText('');
      }
    } catch (e) {
      emitToast('Failed to post discussion message', 'error');
    }
  };

  const handleChatKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChat();
    }
  };

  const saveAnnotations = async (newList: Annotation[]) => {
    try {
      const res = await fetch(`/api/submissions/${s.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'annotations',
          annotations: newList
        })
      });
      if (res.ok) {
        const updated = await res.json();
        setSub(updated);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const addAnnotation = (a: Annotation) => {
    if (a.type === 'signature' && s.annotations.some(x => x.type === 'signature' && x.by === user.name && x.role === user.role)) {
      emitToast('You have already applied your digital signature to this artwork — a signature can be provided only once.', 'error');
      return;
    }
    saveAnnotations([...s.annotations, a]);
  };
  const eraseAnnotationById = (id: string) => {
    saveAnnotations(s.annotations.filter(x => x.id !== id));
    emitToast('Annotation erased', 'info');
  };
  const calibrate = async (mmPerPt: number) => {
    try {
      const res = await fetch(`/api/submissions/${s.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'calibrate', calibrationMmPerPt: mmPerPt, user }),
      });
      if (res.ok) { setSub(await res.json()); emitToast('Measurement scale calibrated', 'success'); }
    } catch (e) { emitToast('Failed to save calibration', 'error'); }
  };

  // ---- IB-SH workflow builder ----
  const wfCanSet = s.currentStage === 'IB-SH' && !s.workflowConfirmed && user.role === 'IB-SH' && s.status === 'In Progress';
  const wfPickable = (PLANT_DEPARTMENTS[s.plant] || []).filter(d => !wfSteps.includes(d));
  const applyTemplate = (t: any) => { setWfSteps(Array.isArray(t.steps) ? t.steps : ['IB-CO', 'IB-SH']); setWfName(t.name || ''); };
  const addWfDept = (d: string) => { if (!wfSteps.includes(d)) setWfSteps([...wfSteps, d]); };
  const removeWfDept = (d: string) => { if (d === 'IB-CO' || d === 'IB-SH') return; setWfSteps(wfSteps.filter(x => x !== d)); };
  const confirmWorkflow = async () => {
    if (wfSteps.length < 3) { emitToast('Add at least one downstream department to the workflow', 'error'); return; }
    try {
      const res = await fetch(`/api/submissions/${s.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_workflow', steps: wfSteps, flowName: wfName.trim() || 'Custom Route', saveAsTemplate: wfSaveTemplate, user })
      });
      if (res.ok) {
        const updated = await res.json();
        setSub(updated);
        emitToast('Workflow set — you can now review and forward this artwork.', 'success');
        onUpdateSuccess();
        if (wfSaveTemplate) {
          fetch('/api/config').then(r => (r.ok ? r.json() : null)).then(d => { if (d) setWfTemplates(d.workflows || []); }).catch(() => {});
        }
      } else {
        const e = await res.json().catch(() => ({}));
        emitToast(e.error || 'Failed to set workflow', 'error');
      }
    } catch (err) {
      console.error(err);
      emitToast('Failed to set workflow', 'error');
    }
  };

  const undoLastAnnotation = () => {
    const list = s.annotations;
    for (let i = list.length - 1; i >= 0; i--) {
      // Signatures are legally binding and cannot be undone/changed.
      if (list[i].by === user.name && list[i].type !== 'signature') {
        const filtered = list.filter((_, idx) => idx !== i);
        saveAnnotations(filtered);
        emitToast('Undid your last annotation marker', 'info');
        return;
      }
    }
    emitToast('No removable annotation found to undo (signatures are permanent)', 'error');
  };


  return (
    <div className="fixed inset-0 bg-black/85 z-50 backdrop-blur-sm font-sans flex flex-col">
      <div className="bg-surface border-t-accent border-t-2 shadow-2xl w-full h-full flex flex-col relative overflow-hidden" role="dialog" aria-modal="true" aria-label={`Review artwork ${s.id}`}>
        {/* Header */}
        <div className="p-5 border-b border-border flex flex-wrap justify-between items-center gap-3 flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="tid text-xs">{s.id}</span>
            <div>
              <div className="font-display text-xl text-text-main tracking-wider">REVIEW ARTWORK PRESENTATION</div>
              {s.filename && (
                <div className="font-mono text-[9px] text-text-dim mt-0.5 flex items-center gap-1.5">
                  FILE: <span className="text-text-muted font-semibold">{s.filename}</span>
                  <span className="text-accent font-bold">
                    (PROTECTED ARTWORK SPECIMEN)
                  </span>
                </div>
              )}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close review" className="text-text-muted hover:text-text-main text-lg font-bold cursor-pointer">
            ✕
          </button>
        </div>

        {/* Core Review Layout (scrollable body under the fixed header) */}
        <div className="flex-1 overflow-y-auto">
        {(s.correctionRaised || s.memberFlaggedCorrection) && (
          <div className={`mx-5 mt-4 rounded border px-4 py-2.5 flex items-start gap-3 text-[11px] ${s.correctionRaised ? 'bg-brand-red/10 border-brand-red/40 text-[#f87060]' : 'bg-accent/10 border-accent/40 text-accent'}`}>
            <span className="font-mono text-sm leading-none mt-0.5">{s.correctionRaised ? '⚠' : '✎'}</span>
            <div>
              {s.correctionRaised ? (
                <>
                  <strong className="uppercase tracking-wide">Correction in effect.</strong> This artwork carries a correction status that travels forward through every remaining department and returns to IB-CO at the end of the chain; downstream approvals do not clear it.
                  {s.correctionNote && <> Latest note: <em>"{s.correctionNote}"</em></>}
                </>
              ) : (
                <>
                  <strong className="uppercase tracking-wide">Member correction flagged.</strong> Awaiting the Department Head's decision to override or uphold.
                  {s.correctionNote && <> Note: <em>"{s.correctionNote}"</em></>}
                </>
              )}
            </div>
          </div>
        )}
        <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* LEFT: Presentation details & interactive drawing panel */}
          <div className="lg:col-span-8 flex flex-col gap-4">
            {/* Basic Spec Table */}
            <div className="bg-surface-hover/30 p-4 border border-border/50 rounded grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-text-muted">
              <div>
                <span className="text-text-dim block uppercase text-[9px] font-mono">Product Name</span>
                <span className="text-text-main font-semibold text-sm mt-0.5 block">{s.product}</span>
              </div>
              <div>
                <span className="text-text-dim block uppercase text-[9px] font-mono">Filing Country</span>
                <span className="text-text-main font-semibold text-sm mt-0.5 block">{s.country}</span>
              </div>
              <div>
                <span className="text-text-dim block uppercase text-[9px] font-mono">Formulation</span>
                <span className="text-text-main font-semibold mt-0.5 block">{s.dosageForm}</span>
              </div>
              <div>
                <span className="text-text-dim block uppercase text-[9px] font-mono">Plant Location</span>
                <span className="px-2 py-0.5 bg-surface-hover border border-border text-text-muted font-mono rounded mt-0.5 inline-block">
                  {s.plant}
                </span>
              </div>
            </div>

            {/* Steps Workflow stepper progression */}
            <div>
              <div className="font-mono text-[9px] text-text-dim uppercase tracking-wider mb-2">WORKFLOW PROGRESS CHAIN</div>
              <WorkflowStepper workflow={s.workflow} stageIndex={s.stageIndex} size="md" />
            </div>

            {/* ARTWORK VECTOR WORKSPACE */}
            <div>
              <div className="flex flex-wrap justify-between items-center mb-2 gap-2">
                <div className="font-mono text-[10px] text-text-muted uppercase tracking-wider">
                  Artwork — annotate directly on the uploaded PDF
                </div>
                
                {isArtworkVisible && !isIBHO && canAct && (
                  <div className="flex items-center gap-2 bg-surface-hover/80 border border-border px-2 py-1 rounded">
                    <span className="font-mono text-[9px] text-text-muted">MEASURE UNIT:</span>
                    <select
                      value={measureUnit}
                      onChange={e => setMeasureUnit(e.target.value as any)}
                      className="bg-surface border border-border rounded text-[10px] px-1.5 py-0.5 text-text-main focus:border-accent outline-none font-mono"
                    >
                      <option value="mm">mm</option>
                      <option value="cm">cm</option>
                      <option value="in">in</option>
                      <option value="pt">pt</option>
                    </select>
                  </div>
                )}
              </div>

              {!isArtworkVisible ? (
                <div className="bg-surface border border-border/80 rounded p-12 text-center my-4 flex flex-col items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-accent/10 border border-accent/30 text-accent flex items-center justify-center mb-3 text-xs font-mono font-bold">
                    [LOCKED]
                  </div>
                  <div className="font-display text-lg text-text-main tracking-wider mb-2 uppercase">
                    ARTWORK &amp; HEAD ANNOTATIONS RESTRICTED
                  </div>
                  <p className="text-xs text-text-muted max-w-md leading-relaxed font-sans">
                    The artwork presentation and Department Head annotations are restricted from team members prior to forwarding. The artwork canvas will become accessible once your Department Head completes initial review and delegates/forwards the artwork for technical verification.
                  </p>
                </div>
              ) : (
                <>

              {/* Artwork Page-Level Caption Header */}
              <div className="bg-surface border border-border p-3 rounded mb-2 flex flex-wrap justify-between items-center text-xs gap-2 font-mono">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-accent font-bold">● ARTWORK PRESENTATION LAYOUT</span>
                  <span className="text-text-dim">|</span>
                  <span className="text-text-main font-semibold">PRODUCT: {s.product}</span>
                  <span className="text-text-dim">|</span>
                  <span className="text-text-main font-semibold">PURPOSE: {s.purpose}</span>
                  <span className="text-text-dim">|</span>
                  <span className="text-text-main font-semibold">COUNTRY: {s.country}</span>
                  <span className="text-text-dim">|</span>
                  <span className="text-text-main font-semibold">DATE: {s.date || '2026-07-21'}</span>
                </div>
                {s.plant && (
                  <span className="bg-accent/15 border border-accent/25 text-accent px-2 py-0.5 rounded font-mono text-[9px] font-bold">
                    PLANT: {s.plant.toUpperCase()}
                  </span>
                )}
              </div>

              {wfCanSet && (
                <div className="bg-surface-hover/60 border border-accent/40 rounded p-4 mb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <GitBranch size={15} className="text-accent" strokeWidth={1.75} />
                    <span className="font-display text-base tracking-wide text-text-main">SET REVIEW WORKFLOW</span>
                  </div>
                  <div className="font-mono text-[9px] text-text-dim uppercase tracking-wider mb-3">
                    Awaiting workflow assignment · define the department route for {s.plant}
                  </div>

                  {wfTemplates.filter((t: any) => t.plant === s.plant).length > 0 && (
                    <div className="mb-3">
                      <div className="text-[9px] font-mono text-text-muted uppercase tracking-wider mb-1.5">Start from a template</div>
                      <div className="flex flex-wrap gap-1.5">
                        {wfTemplates.filter((t: any) => t.plant === s.plant).map((t: any) => (
                          <button key={t.name} onClick={() => applyTemplate(t)}
                            className="px-2.5 py-1 border border-border rounded font-mono text-[10px] text-text-muted hover:border-accent hover:text-accent transition-all">
                            {t.name} · {t.steps.length}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="text-[9px] font-mono text-text-muted uppercase tracking-wider mb-1.5">Route sequence</div>
                  <div className="flex flex-wrap items-center gap-1.5 mb-3">
                    {wfSteps.map((d, i) => {
                      const fixed = d === 'IB-CO' || d === 'IB-SH';
                      return (
                        <React.Fragment key={`${d}-${i}`}>
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded font-mono text-[10px] border ${fixed ? 'border-border bg-surface text-text-dim' : 'border-accent/50 bg-accent/10 text-accent'}`}>
                            {DEPT_LABELS[d] || d}
                            {!fixed && (
                              <button onClick={() => removeWfDept(d)} title="Remove from route" className="hover:text-brand-red">
                                <X size={11} strokeWidth={2} />
                              </button>
                            )}
                          </span>
                          {i < wfSteps.length - 1 && <span className="text-text-dim text-[10px]">→</span>}
                        </React.Fragment>
                      );
                    })}
                  </div>

                  {wfPickable.length > 0 && (
                    <div className="mb-3">
                      <div className="text-[9px] font-mono text-text-muted uppercase tracking-wider mb-1.5">Add department</div>
                      <div className="flex flex-wrap gap-1.5">
                        {wfPickable.map(d => (
                          <button key={d} onClick={() => addWfDept(d)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 border border-dashed border-border rounded font-mono text-[10px] text-text-muted hover:border-accent hover:text-accent transition-all">
                            <Plus size={11} strokeWidth={2} /> {DEPT_LABELS[d] || d}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <input type="text" value={wfName} onChange={e => setWfName(e.target.value)} placeholder="Workflow name (e.g. Kenya Commercial Carton)"
                      className="flex-1 min-w-[200px] bg-surface border border-border text-text-main px-3 py-2 rounded text-xs focus:border-accent outline-none" />
                    <label className="inline-flex items-center gap-1.5 font-mono text-[10px] text-text-muted cursor-pointer select-none">
                      <input type="checkbox" checked={wfSaveTemplate} onChange={e => setWfSaveTemplate(e.target.checked)} className="accent-accent" />
                      Save as reusable template
                    </label>
                    <button onClick={confirmWorkflow}
                      className="inline-flex items-center gap-1.5 bg-accent text-black font-mono text-[11px] font-semibold px-3.5 py-2 rounded hover:opacity-90 transition-opacity">
                      <Save size={13} strokeWidth={2} /> Set Workflow
                    </button>
                  </div>
                </div>
              )}

              <PdfCanvasViewer
                fileUrl={`/api/drive/file/${s.driveFileId || s.id}`}
                filename={s.filename || `${s.id}_Artwork.pdf`}
                extractedText={s.extractedText}
                maxHeight="620px"
                annotations={visibleAnnotations}
                annotTool={annotTool}
                editable={!isIBHO && canAct}
                currentUser={{ name: user.name, role: user.role }}
                measureUnit={measureUnit}
                calibrationMmPerPt={s.calibrationMmPerPt}
                onAddAnnotation={addAnnotation}
                onEraseAnnotation={eraseAnnotationById}
                onCalibrate={calibrate}
              />

              {/* Annotation toolbar */}
              {!isIBHO && canAct && (
                <div className="bg-surface-hover/80 border border-border/80 p-2 rounded mt-2.5 flex flex-wrap gap-1.5 items-center">
                  {([
                    { tool: 'select', label: 'Select', Icon: MousePointer2 },
                    { tool: 'hand', label: 'Hand', Icon: Hand },
                    { tool: 'comment', label: 'Comment', Icon: MessageSquarePlus },
                    { tool: 'highlight', label: 'Highlight', Icon: Highlighter },
                    { tool: 'circle', label: 'Circle', Icon: Circle },
                    { tool: 'measure', label: 'Measure', Icon: Ruler },
                    { tool: 'symbol', label: 'Symbol', Icon: Sigma },
                    { tool: 'signature', label: 'Sign', Icon: PenLine },
                    { tool: 'eraser', label: 'Erase Marker', Icon: Eraser },
                  ] as const).map(({ tool, label, Icon }) => (
                    <button
                      key={tool}
                      onClick={() => setAnnotTool(tool)}
                      title={tool === 'hand' ? 'Pan the artwork (does not modify it)' : tool === 'eraser' ? 'Remove a review marker (signatures & artwork are never affected)' : tool === 'symbol' ? 'Stamp regulatory marking symbols (/ * ^ ° ± × …)' : tool === 'signature' ? 'Apply your one-time digital signature' : label}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 border rounded font-mono text-[10px] transition-all ${
                        annotTool === tool ? 'border-accent bg-accent/15 text-accent font-semibold' : 'border-border text-text-muted hover:border-text-dim'
                      } ${tool === 'signature' && hasSigned ? 'opacity-50' : ''}`}
                    >
                      <Icon size={13} strokeWidth={1.75} />
                      {label}
                    </button>
                  ))}
                  <span
                    className={`inline-flex items-center gap-1.5 px-2 py-1.5 rounded font-mono text-[9px] uppercase tracking-wide border ${
                      hasSigned ? 'border-brand-green/40 bg-brand-green/10 text-brand-green' : 'border-accent/40 bg-accent/10 text-accent'
                    }`}
                    title={hasSigned ? 'Your digital signature is on file for this artwork' : 'Sign before forwarding/approving'}
                  >
                    {hasSigned ? '✓ Signed' : '✎ Signature required'}
                  </span>
                  <button
                    onClick={undoLastAnnotation}
                    title="Undo your last marker"
                    className="ml-auto inline-flex items-center gap-1.5 font-mono text-[9px] uppercase text-text-dim hover:text-brand-red tracking-wide border border-border/50 px-2 py-1.5 rounded"
                  >
                    <Undo2 size={12} strokeWidth={1.75} />
                    Undo My Last
                  </button>
                </div>
              )}

              {/* Extracted Artwork Texts (Multipage layout verification) */}
              {s.pagesText && s.pagesText.length > 0 && (
                <div className="border-t border-border/40 pt-4 mt-2">
                  <div className="font-mono text-[9px] text-text-dim uppercase tracking-wider mb-2">EXTRACTED ARTWORK PAGE TEXTS</div>
                  <div className="flex flex-col gap-2 max-h-[180px] overflow-y-auto scrollbar-thin pr-1">
                    {s.pagesText.map((pText, idx) => (
                      <div key={idx} className="bg-surface-hover/30 border border-border/45 p-2.5 rounded text-xs font-mono">
                        <div className="text-[8px] text-accent uppercase mb-1 font-bold">Page {idx + 1}</div>
                        <div className="text-text-muted whitespace-pre-wrap select-text leading-relaxed">{pText}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

            {/* Comments inputs and approvals replaced by sticky bottom bar */}

            {isIBHO && (
              <div className="bg-brand-blue/5 border border-brand-blue/15 rounded p-3 text-xs text-text-muted">
                <strong>Information:</strong> Signed by IB-CO on dossier intake. You can discuss details with reviewers in the chat, but cannot annotate or approve at the active reviewer stage workspace.
              </div>
            )}
          </div>

          {/* RIGHT: Live chat messaging (4 cols) */}
          <div className="lg:col-span-4 flex flex-col bg-surface-hover/30 border border-border/40 rounded overflow-hidden h-full min-h-[400px]">
            <div className="p-3 bg-surface border-b border-border flex justify-between items-center">
              <div>
                <div className="font-mono text-[9px] text-accent uppercase tracking-widest font-bold">DISCUSSION THREAD</div>
                <div className="text-[8px] text-text-dim mt-0.5 truncate max-w-[200px]" title={s.workflow.join(' → ')}>
                  {s.workflow.join(' → ')}
                </div>
              </div>
              <span className="text-[9px] font-mono bg-brand-green/10 text-brand-green border border-brand-green/20 px-1.5 py-0.5 rounded">
                LIVE
              </span>
            </div>

            {/* Chat message panel scroll area */}
            <div className="flex-1 p-3 overflow-y-auto max-h-[420px] flex flex-col gap-3 scroll-smooth">
              {s.chat && s.chat.length > 0 ? (
                s.chat.map((m, idx) => {
                  const isMine = m.by === user.name && m.role === user.role;
                  return (
                    <div key={idx} className={`flex gap-2.5 max-w-[85%] ${isMine ? 'ml-auto flex-row-reverse' : ''}`}>
                      <span
                        className={`w-7 h-7 rounded-full flex items-center justify-center font-mono font-bold text-[10px] text-center flex-shrink-0`}
                        style={{ backgroundColor: roleColor(m.role), color: '#fff' }}
                        title={`${m.by} (${m.role})`}
                      >
                        {avatarInitials(m.by)}
                      </span>
                      <div>
                        <div className={`p-2.5 rounded text-xs leading-relaxed ${
                          isMine ? 'bg-accent/10 border border-accent/20 text-text-main' : 'bg-surface border border-border text-text-muted'
                        }`}>
                          {m.text}
                        </div>
                        <div className={`font-mono text-[8px] text-text-dim mt-1 ${isMine ? 'text-right' : ''}`}>
                          {m.by} · {m.role}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center text-text-dim font-mono text-[10px] py-16">
                  No discussion logs yet.<br />Message reviewers to coordinate transitions.
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Chat Send */}
            <div className="p-3 border-t border-border bg-surface flex gap-2">
              <textarea
                value={chatText}
                onChange={e => setChatText(e.target.value)}
                onKeyDown={handleChatKeyDown}
                placeholder="Send a review comment to the group..."
                rows={1}
                className="flex-1 bg-surface-hover border border-border text-text-main p-2 rounded text-xs focus:border-accent outline-none resize-none font-sans min-h-[36px]"
              />
              <button
                onClick={sendChat}
                className="bg-accent hover:bg-accent-hover text-black px-4 rounded font-mono text-xs tracking-wider"
              >
                Send
              </button>
            </div>
          </div>
        </div>
        </div>{/* end scrollable review body */}

        {/* Sticky/Fixed Bottom Review Controls Bar */}
        {canAct && (() => {
          const deptMembers = PERSONNEL.filter(p => p.dept === user.role && !p.isHead);
          const stage = s.subDeptStage || 'HEAD_ASSIGN';

          if (user.isHead) {
            if (stage === 'HEAD_ASSIGN') {
              return (
                <div className="sticky bottom-0 bg-surface/95 backdrop-blur border-t border-border p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 z-25 rounded-b shadow-lg animate-fade-in">
                  <div className="flex-1">
                    <span className="font-mono text-[9px] text-accent uppercase font-bold block mb-1">
                      DEPARTMENT HEAD ACTION: ASSIGN MEMBER FOR TECH VERIFICATION
                    </span>
                    <p className="text-xs text-text-muted">
                      Select a designated technical specialist from your department to thoroughly verify this artwork before final release.
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <select
                      value={selectedMemberName}
                      onChange={e => setSelectedMemberName(e.target.value)}
                      className="bg-surface border border-border text-text-main p-2.5 rounded text-xs focus:border-accent outline-none font-medium cursor-pointer"
                    >
                      <option value="">-- Choose Member --</option>
                      {deptMembers.map(m => (
                        <option key={m.name} value={m.name}>{m.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={handleAssignMember}
                      disabled={!selectedMemberName}
                      className="bg-accent hover:bg-accent-hover disabled:opacity-40 text-black px-4 py-2.5 rounded font-mono text-xs font-bold tracking-wide transition-all cursor-pointer"
                    >
                      Delegate &amp; Assign →
                    </button>
                  </div>
                </div>
              );
            }

            if (stage === 'MEMBER_REVIEW') {
              return (
                <div className="sticky bottom-0 bg-surface/95 backdrop-blur border-t border-border p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 z-25 rounded-b shadow-lg animate-fade-in">
                  <div className="flex-1">
                    <span className="font-mono text-[9px] text-accent uppercase font-bold block mb-1">
                      SUB-DEPARTMENT FLOW ACTIVE
                    </span>
                    <p className="text-xs text-text-muted">
                      Artwork is currently assigned to <strong className="text-text-main">{s.assignedMember}</strong> for verification. Waiting for member check and sign-off.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={comment}
                      onChange={e => setComment(e.target.value)}
                      placeholder="Comment for immediate correction request..."
                      className="bg-surface-hover border border-border text-text-main px-3 py-2 rounded text-xs focus:border-accent outline-none min-w-[180px]"
                    />
                    <button
                      onClick={() => handleReviewDecision('correction')}
                      className="bg-brand-red text-white hover:bg-brand-red/90 px-4 py-2 rounded font-mono text-xs font-semibold tracking-wide transition-all cursor-pointer"
                    >
                      Request Correction
                    </button>
                  </div>
                </div>
              );
            }

            if (stage === 'HEAD_FINAL') {
              const flagged = !!s.memberFlaggedCorrection;
              return (
                <div className="sticky bottom-0 bg-surface/95 backdrop-blur border-t border-border p-4 flex flex-col gap-3 z-25 rounded-b shadow-lg animate-fade-in">
                  {flagged && (
                    <div className="bg-brand-red/10 border border-brand-red/40 rounded px-3 py-2 text-[11px] text-[#f87060]">
                      <strong>{s.assignedMember}</strong> flagged a correction: <em>"{s.correctionNote}"</em>. As Department Head you may <strong>override</strong> it and approve, or <strong>uphold</strong> it — upholding carries the artwork <strong>forward</strong> to the next department with a sticky correction status (it does not return to IB until the chain completes).
                    </div>
                  )}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex-1 min-w-[200px]">
                      <label className={`block text-[10px] font-mono uppercase tracking-wider mb-1 font-bold ${flagged ? 'text-brand-red' : 'text-brand-green'}`}>
                        {flagged ? '⚠ MEMBER CORRECTION AWAITING HEAD DECISION' : `✓ TECHNICAL CHECK PASSED BY ${s.assignedMember?.toUpperCase()} · FINAL DEPT HEAD APPROVAL`}
                      </label>
                      <input
                        type="text"
                        value={comment}
                        onChange={e => setComment(e.target.value)}
                        placeholder={flagged ? 'Optional note for your override / uphold decision...' : 'Add final departmental sign-off or recommendations...'}
                        className="w-full bg-surface-hover border border-border text-text-main px-3 py-2 rounded text-xs focus:border-accent outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-center">
                      {flagged ? (
                        <>
                          <button
                            onClick={handleOverride}
                            title="Dismiss the member's correction and proceed to approval"
                            className="bg-surface-hover border border-border hover:border-accent text-text-main px-4 py-2 rounded font-mono text-xs tracking-wider font-semibold transition-all cursor-pointer"
                          >
                            ⤺ Override Correction
                          </button>
                          <button
                            onClick={handleUphold}
                            title="Uphold and carry the correction forward to the next department"
                            className="bg-brand-red text-white hover:bg-brand-red/90 px-4 py-2 rounded font-mono text-xs tracking-wider font-semibold transition-all cursor-pointer"
                          >
                            ⮞ Uphold &amp; Forward
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => handleReviewDecision('correction')}
                            title="Raise a correction; the artwork is carried forward to the next department with correction status"
                            className="bg-brand-red text-white hover:bg-brand-red/90 px-4 py-2 rounded font-mono text-xs tracking-wider font-semibold transition-all cursor-pointer"
                          >
                            ⮞ Raise Correction &amp; Forward
                          </button>
                          <button
                            onClick={() => handleReviewDecision('approve')}
                            disabled={!hasSigned}
                            title={hasSigned ? 'Approve and release to the next stage' : 'Apply your digital signature first'}
                            className="bg-brand-green hover:bg-brand-green/95 disabled:opacity-40 disabled:cursor-not-allowed text-black px-4 py-2 rounded font-mono text-xs tracking-wider font-bold transition-all cursor-pointer"
                          >
                            {hasSigned ? '✓ Approve & Release' : '🔒 Sign to Approve'}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            }
          } else {
            // regular member
            if (stage === 'MEMBER_REVIEW' && s.assignedMember === user.name) {
              return (
                <div className="sticky bottom-0 bg-surface/95 backdrop-blur border-t border-border p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 z-25 rounded-b shadow-lg animate-fade-in">
                  <div className="flex-1 min-w-[200px]">
                    <label className="block text-[10px] font-mono text-accent uppercase tracking-wider mb-1 font-bold">
                      DELEGATED VERIFICATION: ENTER YOUR TECHNICAL RECOMMENDATION
                    </label>
                    <input
                      type="text"
                      value={comment}
                      onChange={e => setComment(e.target.value)}
                      placeholder="Enter technical observations, dimensions checks, barcode verified notes..."
                      className="w-full bg-surface-hover border border-border text-text-main px-3 py-2 rounded text-xs focus:border-accent outline-none font-medium"
                    />
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-center">
                    <button
                      onClick={() => handleMemberCheck('correction')}
                      className="bg-brand-red text-white hover:bg-brand-red/90 px-4 py-2 rounded font-mono text-xs tracking-wider font-semibold transition-all cursor-pointer"
                    >
                      Request Correction
                    </button>
                    <button
                      onClick={() => handleMemberCheck('member_check')}
                      disabled={!hasSigned}
                      title={hasSigned ? 'Forward your verified check to the Department Head' : 'Apply your digital signature first'}
                      className="bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-black px-4 py-2 rounded font-mono text-xs tracking-wider font-bold transition-all cursor-pointer"
                    >
                      {hasSigned ? '✓ Verified (Forward to Head)' : '🔒 Sign to Forward'}
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <div className="sticky bottom-0 bg-surface/95 backdrop-blur border-t border-border p-4 text-center z-25 rounded-b shadow-lg">
                <span className="font-mono text-xs text-text-muted uppercase font-bold">
                  {stage === 'HEAD_ASSIGN' 
                    ? `Awaiting departmental Head to assign verification associate`
                    : `Assigned to: ${s.assignedMember} · Only the assigned member or department Head can log decisions.`
                  }
                </span>
              </div>
            );
          }
          return null;
        })()}
      </div>
    </div>
  );
}
