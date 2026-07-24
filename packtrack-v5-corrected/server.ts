import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import {
  initDatabase,
  getSubmissions,
  saveSubmission,
  getAuditLogs,
  addAuditLog,
  getEmailLogs,
  addEmailLog,
  getRequestMetrics,
  trackSession,
  getDepartments,
  saveDepartments,
  getWorkflows,
  saveWorkflows
} from './server/db';
import { profilerMiddleware, collectSystemProfile } from './server/profiler';
import { Submission, AuditLogEntry, EmailLogEntry, Plant, Priority, Annotation } from './src/types';
import { archiveArtwork, DRIVE_ARCHIVE_ACCOUNT, getArchivedFileRecord, archiveSubmissionFolder } from './server/drive';
import { bakeAnnotations, makeArtworkPdf } from './server/bake';
import { PLANT_DEPARTMENTS } from './src/shared/constants';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Initialize DB
  initDatabase();

  // Express parser
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Profiler middleware for measuring performance/latency
  app.use(profilerMiddleware);

  // ==========================================
  // API ROUTES
  // ==========================================

  // Authentication & session tracking
  app.post('/api/auth/session', (req, res) => {
    const { email, name, role } = req.body;
    if (!email || !name || !role) {
      return res.status(400).json({ error: 'Missing session parameters' });
    }
    trackSession(email, name, role);
    res.json({ status: 'ok' });
  });

  // Get all submissions
  app.get('/api/submissions', (req, res) => {
    res.json(getSubmissions());
  });

  // Get single submission
  app.get('/api/submissions/:id', (req, res) => {
    const subs = getSubmissions();
    const sub = subs.find(s => s.id === req.params.id);
    if (!sub) {
      return res.status(404).json({ error: 'Submission not found' });
    }
    res.json(sub);
  });

  // Submit artwork package (supports single object or array of submissions for multi-page forms)
  app.post('/api/submissions', (req, res) => {
    const rawItems = Array.isArray(req.body) ? req.body : [req.body];

    if (rawItems.length === 0) {
      return res.status(400).json({ error: 'No submission data provided' });
    }

    const createdSubmissions: Submission[] = [];
    const subs = getSubmissions();

    let latestNum = subs.reduce((max, s) => {
      const num = parseInt(s.id.split('-')[1]);
      return !isNaN(num) && num > max ? num : max;
    }, 0);

    for (const item of rawItems) {
      const {
        product,
        dosageForm,
        country, // main country
        plant,
        purpose,
        priority = 'Normal',
        components,
        comments,
        packSize,
        submittedBy,
        filename,
        date, // artwork date
        pages,
        pagesText,
        driveFileId,
        driveLink,
        genericName,
        strength,
        darNumber,
        composition,
        manufacturer,
        barcodeNumber,
        materialCode,
        storage,
        marketCountries
      } = item;

      if (!product || !dosageForm || !country || !plant || !components || !Array.isArray(components) || components.length === 0) {
        return res.status(400).json({ error: 'Missing required parameters (plant, product, dosageForm, main country, components)' });
      }

      latestNum += 1;
      const subId = `PKG-${String(latestNum).padStart(3, '0')}`;

      const workflow = ['IB-CO', 'IB-SH'];
      const nextDept = 'IB-SH';

      const sub: Submission = {
        id: subId,
        product,
        dosageForm,
        country,
        plant: plant as Plant,
        purpose: purpose || '—',
        flowKey: '(pending IB-SH)',
        flowLocked: false,
        workflowConfirmed: false,
        priority: priority as Priority,
        components,
        currentStage: nextDept,
        workflow,
        stageIndex: 1,
        status: 'In Progress',
        submittedBy: submittedBy || 'IB-CO User',
        submitterRole: 'IB-CO',
        submittedAt: Date.now(),
        comments: comments || '',
        filename: filename || `${product.replace(/\s+/g, '_')}_${country}_v1.pdf`,
        packSize: packSize || '',
        genericName: genericName || '',
        strength: strength || '',
        darNumber: darNumber || '',
        composition: composition || '',
        manufacturer: manufacturer || '',
        barcodeNumber: barcodeNumber || '',
        materialCode: materialCode || '',
        storage: storage || '',
        marketCountries: marketCountries || '',
        pagesText: pagesText || (pages ? pages.map((p: any) => p.text) : []),
        driveFileId,
        driveLink,
        history: [{ dept: 'IB-CO', action: 'Submitted', ts: Date.now(), by: submittedBy || 'IB-CO User' }],
        chat: comments ? [{ by: submittedBy || 'IB-CO User', role: 'IB-CO', ts: Date.now(), text: comments }] : [],
        annotations: [],
        correctionNote: null,
        correctionRaised: false,
        memberFlaggedCorrection: false,
        date: date || '',
        pages: pages || [],
        subDeptStage: 'HEAD_ASSIGN',
        assignedMember: null
      };

      saveSubmission(sub);
      createdSubmissions.push(sub);

      const pfx = plant === 'Shampur' ? '[SH]' : '[GA]';
      const emailSubject = `[${subId}] ${pfx} ${priority === 'Urgent' ? 'URGENT: ' : ''}${product}/${country} — filed; IB-SH to set workflow`;
      addEmailLog({
        ts: Date.now(),
        to: 'wasiur.ib@aristopharmabd.com',
        dept: nextDept,
        subject: emailSubject,
        tid: subId,
        status: 'Delivered',
        plant: plant as Plant
      });

      addAuditLog({
        submissionId: subId,
        ts: Date.now(),
        dot: 'orange',
        text: `<strong>${submittedBy || 'IB-CO'} (IB-CO)</strong> submitted <strong>${product} / ${country}</strong> (${purpose || 'Standard'}, ${priority}) — Tracking ID: <strong>${subId}</strong>`,
        plant: plant as Plant,
        product,
        country,
        by: submittedBy || 'IB-CO',
        role: 'IB-CO'
      });
    }

    res.status(201).json(Array.isArray(req.body) ? createdSubmissions : createdSubmissions[0]);
  });

  // Update submission (approvals, chats, annotations, flow change)
  app.put('/api/submissions/:id', async (req, res) => {
    const { id } = req.params;
    const {
      action, // 'approve' | 'correction' | 'flow_change' | 'chat' | 'annotations' | 'calibrate'
      comment,
      user,
      flowKey,
      chatMessage,
      annotations,
      calibrationMmPerPt
    } = req.body;

    const subs = getSubmissions();
    const sub = subs.find(s => s.id === id);
    if (!sub) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    const pfx = sub.plant === 'Shampur' ? '[SH]' : '[GA]';

    // Shared archival helper — at final archiving this resolves the raw (plain)
    // artwork, permanently BAKES the annotation ledger into an annotated copy, and
    // stores BOTH in the submission's own Drive folder (named by ID) so the raw
    // PDF and the annotated PDF live on the same submission and download separately.
    const archiveDossier = async (kind: 'Approved' | 'Correction') => {
      try {
        // 1) Resolve the raw (plain) artwork bytes.
        let rawB64: string | undefined;
        if (sub.driveFileId) {
          const rec = getArchivedFileRecord(sub.driveFileId);
          if (rec?.base64) rawB64 = rec.base64;
        }
        if (!rawB64) {
          rawB64 = await makeArtworkPdf(sub.product || 'Packaging Artwork', `Submission ${sub.id} | ${sub.plant} | ${sub.country}`);
        }

        // 2) Flatten the annotation ledger permanently into an annotated copy.
        const baked = await bakeAnnotations(rawB64, sub.annotations || []);

        const annotationManifest = (sub.annotations || []).map((a: any) => ({
          type: a.type, by: a.by, role: a.role, page: a.page || 1,
          text: a.text, symbol: a.symbol,
          signedName: a.signedName, signedRole: a.signedRole, signedDate: a.signedDate,
          lengthMm: a.lengthMm, ts: a.ts
        }));

        const meta = {
          submissionId: sub.id,
          // Full regulatory dossier metadata as captured on the submission form
          product: sub.product, genericName: sub.genericName, strength: sub.strength,
          dosageForm: sub.dosageForm, composition: sub.composition,
          country: sub.country, marketCountries: sub.marketCountries, plant: sub.plant,
          purpose: sub.purpose, flowKey: sub.flowKey, priority: sub.priority,
          components: sub.components, packSize: sub.packSize,
          darNumber: sub.darNumber, materialCode: sub.materialCode, barcodeNumber: sub.barcodeNumber,
          manufacturer: sub.manufacturer, storage: sub.storage,
          artworkDate: sub.date, comments: sub.comments,
          submittedBy: sub.submittedBy, submitterRole: sub.submitterRole,
          submittedAt: sub.submittedAt ? new Date(sub.submittedAt).toISOString() : null,
          // Finalization + audit context
          status: kind, stage: kind === 'Approved' ? 'FINAL_APPROVAL' : 'CORRECTION_RETURNED',
          correctionRaised: !!sub.correctionRaised, correctionNote: sub.correctionNote || null,
          finalizedBy: user?.name || null, finalizedAt: new Date().toISOString(),
          originalFileId: sub.driveFileId || null,
          annotationsCount: annotationManifest.length,
          bakedMarkers: baked.count,
          buyerConfirmations: (sub.buyerConfirmations || []).map((b: any) => ({ id: b.id, filename: b.filename, by: b.by, role: b.role, ts: b.ts, note: b.note })),
          annotations: annotationManifest
        };

        // 3) Store raw + annotated together in this submission's own Drive folder.
        const stored = await archiveSubmissionFolder(sub.id, [
          { role: 'raw', filename: `${sub.id}_RAW_${sub.filename || 'artwork.pdf'}`, base64: rawB64, meta: { ...meta, copy: 'raw' } },
          { role: 'annotated', filename: `${sub.id}_ANNOTATED_${sub.filename || 'artwork.pdf'}`, base64: baked.base64, meta: { ...meta, copy: 'annotated' } },
        ]);
        const raw = stored.find(f => f.role === 'raw');
        const ann = stored.find(f => f.role === 'annotated');
        if (raw) { sub.rawFileId = raw.fileId; sub.rawLink = raw.link; }
        if (ann) {
          sub.annotatedFileId = ann.fileId; sub.annotatedLink = ann.link;
          // approvedFileId retained for back-compat (points to the annotated/baked copy)
          sub.approvedFileId = ann.fileId; sub.approvedLink = ann.link;
        }
        return { manifestCount: annotationManifest.length };
      } catch (e) {
        console.warn('Archive step notice:', e);
        return { manifestCount: (sub.annotations || []).length };
      }
    };

    // IB-SH defines (or edits) the workflow for this submission. Departments are
    // added/removed here, the workflow can be named, and optionally saved as a
    // reusable template. Only IB-SH acts at the routing stage.
    if (action === 'set_workflow') {
      if (user?.role !== 'IB-SH' || sub.currentStage !== 'IB-SH') {
        return res.status(403).json({ error: 'Only IB-SH can set the workflow, and only at the routing stage.' });
      }
      const steps: string[] = Array.isArray(req.body.steps) ? req.body.steps : [];
      const flowName: string = (req.body.flowName || '').trim() || 'Custom Route';
      const valid = new Set(['IB-CO', 'IB-SH', ...(PLANT_DEPARTMENTS[sub.plant] || [])]);
      const prefixOk = steps[0] === 'IB-CO' && steps[1] === 'IB-SH';
      const allKnown = steps.every(st => valid.has(st));
      if (steps.length < 3 || !prefixOk || !allKnown) {
        return res.status(400).json({ error: 'Workflow must start with IB-CO → IB-SH and include at least one downstream department valid for the plant.' });
      }
      sub.workflow = steps;
      sub.flowKey = flowName;
      sub.workflowConfirmed = true;
      sub.flowLocked = true;
      sub.stageIndex = 1;
      sub.currentStage = 'IB-SH';

      if (req.body.saveAsTemplate) {
        const templates = getWorkflows();
        if (!templates.some((t: any) => t.plant === sub.plant && t.name === flowName)) {
          templates.push({ plant: sub.plant, name: flowName, steps });
          saveWorkflows(templates);
        }
      }

      sub.history.push({ dept: 'IB-SH', action: 'Workflow Set', ts: Date.now(), by: user.name, comment: `Route "${flowName}": ${steps.join(' → ')}` });
      addAuditLog({
        submissionId: sub.id, ts: Date.now(), dot: 'blue',
        text: `<strong>${user.name} (IB-SH)</strong> set workflow <strong>${flowName}</strong> for ${sub.product} / ${sub.country}`,
        plant: sub.plant, product: sub.product, country: sub.country, by: user.name, role: user.role
      });
      saveSubmission(sub);
      return res.json(sub);
    }

    if (action === 'chat') {
      if (!chatMessage) {
        return res.status(400).json({ error: 'Missing chatMessage' });
      }
      sub.chat = sub.chat || [];
      sub.chat.push(chatMessage);
      saveSubmission(sub);
      return res.json(sub);
    }

    if (action === 'annotations') {
      const incoming: Annotation[] = annotations || [];
      const oldList: Annotation[] = sub.annotations || [];
      const oldIds = new Set(oldList.map(a => a.id));
      const newIds = new Set(incoming.map(a => a.id));
      const added = incoming.filter(a => !oldIds.has(a.id));
      const removed = oldList.filter(a => !newIds.has(a.id));
      const label = (t: string) =>
        (({ comment: 'comment', highlight: 'highlight', circle: 'circle mark', measure: 'measurement', signature: 'sign-off' } as Record<string, string>)[t] || t);
      for (const a of added) {
        const extra = a.type === 'comment' && a.text ? ` — “${a.text}”`
          : a.type === 'measure' && a.text ? ` — ${a.text}` : '';
        addAuditLog({
          submissionId: sub.id, ts: Date.now(), dot: 'blue',
          text: `<strong>${a.by} (${a.role})</strong> added a ${label(a.type)} annotation on <strong>${sub.product} / ${sub.country}</strong>${a.page ? ` (page ${a.page})` : ''}${extra}`,
          plant: sub.plant, product: sub.product, country: sub.country, by: a.by, role: a.role
        });
      }
      for (const a of removed) {
        addAuditLog({
          submissionId: sub.id, ts: Date.now(), dot: 'orange',
          text: `<strong>${a.by} (${a.role})</strong> removed a ${label(a.type)} annotation from <strong>${sub.product} / ${sub.country}</strong>`,
          plant: sub.plant, product: sub.product, country: sub.country, by: a.by, role: a.role
        });
      }
      sub.annotations = incoming;
      saveSubmission(sub);
      return res.json(sub);
    }

    if (action === 'calibrate') {
      if (typeof calibrationMmPerPt === 'number' && calibrationMmPerPt > 0) {
        sub.calibrationMmPerPt = calibrationMmPerPt;
        addAuditLog({
          submissionId: sub.id, ts: Date.now(), dot: 'blue',
          text: `<strong>${user?.name || 'Reviewer'}</strong> calibrated the measurement scale for <strong>${sub.product} / ${sub.country}</strong> (1&nbsp;pt = ${calibrationMmPerPt.toFixed(4)}&nbsp;mm)`,
          plant: sub.plant, product: sub.product, country: sub.country, by: user?.name || 'Reviewer', role: user?.role || ''
        });
      }
      saveSubmission(sub);
      return res.json(sub);
    }

    if (action === 'assign_member') {
      if (sub.currentStage !== user?.role || !user?.isHead || (sub.subDeptStage || 'HEAD_ASSIGN') !== 'HEAD_ASSIGN') {
        return res.status(403).json({ error: 'Only the department Head at the assignment stage can delegate this artwork.' });
      }
      const { assignedMember } = req.body;
      if (!assignedMember) {
        return res.status(400).json({ error: 'Missing assigned member email/name' });
      }
      sub.subDeptStage = 'MEMBER_REVIEW';
      sub.assignedMember = assignedMember;
      
      sub.history.push({
        dept: sub.currentStage,
        action: 'Assigned',
        ts: Date.now(),
        by: user.name,
        comment: `Head ${user.name} assigned artwork to ${assignedMember} for detailed technical verification.`
      });

      addAuditLog({
        submissionId: sub.id,
        ts: Date.now(),
        dot: 'orange',
        text: `<strong>Head ${user.name} (${sub.currentStage})</strong> assigned artwork to <strong>${assignedMember}</strong> for verification`,
        plant: sub.plant,
        product: sub.product,
        country: sub.country,
        by: user.name,
        role: user.role
      });

      saveSubmission(sub);
      return res.json(sub);
    }

    if (action === 'member_check') {
      if (sub.currentStage !== user?.role || (sub.subDeptStage || '') !== 'MEMBER_REVIEW' || sub.assignedMember !== user?.name) {
        return res.status(403).json({ error: 'Only the assigned member can submit the verification for this artwork.' });
      }
      sub.subDeptStage = 'HEAD_FINAL';
      
      sub.history.push({
        dept: sub.currentStage,
        action: 'Member Verified',
        ts: Date.now(),
        by: user.name,
        comment: comment || 'Checked and verified.'
      });

      addAuditLog({
        submissionId: sub.id,
        ts: Date.now(),
        dot: 'blue',
        text: `<strong>Associate ${user.name} (${sub.currentStage})</strong> verified and forwarded artwork back to Head`,
        plant: sub.plant,
        product: sub.product,
        country: sub.country,
        by: user.name,
        role: user.role
      });

      saveSubmission(sub);
      return res.json(sub);
    }

    if (action === 'approve') {
      // IB-SH must define the workflow before the artwork can move downstream.
      if (sub.currentStage === 'IB-SH' && !sub.workflowConfirmed) {
        return res.status(400).json({ error: 'Set the workflow for this artwork before forwarding it.' });
      }
      // Enforce Head -> Member -> Head workflow for all verification departments
      if (sub.stageIndex > 0) {
        if (!user.isHead) {
          return res.status(400).json({ error: 'Only the Department Head is authorized to give final approval and forward the artwork to the next department.' });
        }
        if (sub.subDeptStage !== 'HEAD_FINAL') {
          return res.status(400).json({ error: 'You must first assign a department member to verify this artwork and receive their confirmation before giving the final departmental approval.' });
        }
      }

      const nextIdx = sub.stageIndex + 1;
      sub.history.push({
        dept: sub.currentStage,
        action: 'Approved',
        ts: Date.now(),
        by: user.name,
        comment
      });

      if (nextIdx >= sub.workflow.length) {
        if (sub.correctionRaised) {
          // A correction was raised upstream. The final artwork is NOT approved and
          // NOT archived as an approved copy — it returns to IB-CO carrying the
          // sticky correction status; only the correction dossier is archived.
          sub.status = 'Correction';
          sub.currentStage = 'IB-CO';
          sub.stageIndex = 0;
          sub.subDeptStage = 'HEAD_FINAL';
          sub.assignedMember = null;
          const { manifestCount } = await archiveDossier('Correction');
          addEmailLog({
            ts: Date.now(), to: 'wasiur.ib@aristopharmabd.com', dept: 'IB-CO',
            subject: `[${sub.id}] ${pfx} CORRECTION RETURNED: ${sub.product}/${sub.country} completed the review chain with corrections`,
            tid: sub.id, status: 'Delivered', plant: sub.plant
          });
          addAuditLog({
            submissionId: sub.id, ts: Date.now(), dot: 'red',
            text: `<strong>${sub.product} / ${sub.country}</strong> (${sub.id}) completed the full review chain carrying a <strong>CORRECTION</strong> and returned to IB-CO — ${manifestCount} annotation(s) in the correction dossier`,
            plant: sub.plant, product: sub.product, country: sub.country, by: user.name, role: user.role
          });
        } else {
          sub.status = 'Approved';
          sub.currentStage = 'APPROVED';
          sub.stageIndex = sub.workflow.length;
          sub.correctionNote = null;
          sub.subDeptStage = 'HEAD_FINAL';
          sub.assignedMember = null;
          const { manifestCount } = await archiveDossier('Approved');
          addAuditLog({
            submissionId: sub.id, ts: Date.now(), dot: 'green',
            text: `Approved artwork for <strong>${sub.product} / ${sub.country}</strong> (${sub.id}) archived to corporate Drive (${DRIVE_ARCHIVE_ACCOUNT}) — ${manifestCount} annotation(s) recorded in the audit dossier`,
            plant: sub.plant, product: sub.product, country: sub.country, by: user.name, role: user.role
          });
          addAuditLog({
            submissionId: sub.id, ts: Date.now(), dot: 'green',
            text: `<strong>${sub.product} / ${sub.country}</strong> (${sub.id}) fully approved by <strong>${user.name}</strong> ✓`,
            plant: sub.plant, product: sub.product, country: sub.country, by: user.name, role: user.role
          });
        }
      } else {
        sub.stageIndex = nextIdx;
        sub.currentStage = sub.workflow[nextIdx];
        sub.status = 'In Progress';
        // A sticky correction must survive downstream approvals — keep the note.
        sub.correctionNote = sub.correctionRaised ? sub.correctionNote : null;
        // Reset subdepartment stage for the next department so they start fresh
        sub.subDeptStage = 'HEAD_ASSIGN';
        sub.assignedMember = null;

        const nextDept = sub.workflow[nextIdx];
        const emailSubject = `[${sub.id}] ${pfx} ACTION: ${sub.product}/${sub.country} — review by ${nextDept}${sub.correctionRaised ? ' (carries CORRECTION)' : ''}`;
        addEmailLog({
          ts: Date.now(),
          to: 'wasiur.ib@aristopharmabd.com',
          dept: nextDept,
          subject: emailSubject,
          tid: sub.id,
          status: 'Delivered',
          plant: sub.plant
        });

        addAuditLog({
          submissionId: sub.id,
          ts: Date.now(),
          dot: sub.correctionRaised ? 'red' : 'blue',
          text: `<strong>${user.name} (${user.role})</strong> approved <strong>${sub.product} / ${sub.country}</strong> — forwarded to <strong>${nextDept}</strong>${sub.correctionRaised ? ' <em>(carrying correction status)</em>' : ''}`,
          plant: sub.plant,
          product: sub.product,
          country: sub.country,
          by: user.name,
          role: user.role
        });
      }

      saveSubmission(sub);
      return res.json(sub);
    }

    if (action === 'correction') {
      if (sub.currentStage !== user?.role) {
        return res.status(403).json({ error: 'Only the department currently holding this artwork can request a correction.' });
      }
      if (!comment) {
        return res.status(400).json({ error: 'Correction note is required' });
      }

      // A MEMBER's correction is NOT committed — it pauses at the Department Head,
      // who may OVERRIDE it or UPHOLD it. It never bounces back to IB mid-flow.
      if (!user.isHead) {
        if ((sub.subDeptStage || '') !== 'MEMBER_REVIEW' || sub.assignedMember !== user.name) {
          return res.status(403).json({ error: 'Only the assigned member can raise a correction at this stage.' });
        }
        sub.memberFlaggedCorrection = true;
        sub.correctionNote = comment;
        sub.subDeptStage = 'HEAD_FINAL'; // hand back to head for override / uphold
        sub.history.push({ dept: user.role, action: 'Correction Flagged (member)', ts: Date.now(), by: user.name, comment });
        addAuditLog({
          submissionId: sub.id, ts: Date.now(), dot: 'red',
          text: `<strong>Associate ${user.name} (${user.role})</strong> flagged a correction — routed to Department Head for override/uphold: "${comment}"`,
          plant: sub.plant, product: sub.product, country: sub.country, by: user.name, role: user.role
        });
        saveSubmission(sub);
        return res.json(sub);
      }

      // A HEAD's correction is UPHELD and CARRIED FORWARD to the next department,
      // carrying all annotations and a sticky correction status (never back to IB).
      sub.memberFlaggedCorrection = false;
      sub.correctionRaised = true;
      sub.correctionNote = comment;
      sub.history.push({ dept: user.role, action: 'Correction Raised (carried forward)', ts: Date.now(), by: user.name, comment });

      const nextIdxC = sub.stageIndex + 1;
      if (nextIdxC >= sub.workflow.length) {
        // Last department — return to IB-CO carrying the correction status.
        sub.status = 'Correction';
        sub.currentStage = 'IB-CO';
        sub.stageIndex = 0;
        sub.subDeptStage = 'HEAD_FINAL';
        sub.assignedMember = null;
        const { manifestCount } = await archiveDossier('Correction');
        addEmailLog({
          ts: Date.now(), to: 'wasiur.ib@aristopharmabd.com', dept: 'IB-CO',
          subject: `[${sub.id}] ${pfx} CORRECTION RETURNED: ${sub.product}/${sub.country} — corrections carried to end of chain`,
          tid: sub.id, status: 'Delivered', plant: sub.plant
        });
        addAuditLog({
          submissionId: sub.id, ts: Date.now(), dot: 'red',
          text: `<strong>${user.name} (${user.role})</strong> raised a correction on <strong>${sub.product} / ${sub.country}</strong> at the final stage — returned to IB-CO with correction status (${manifestCount} annotation(s))`,
          plant: sub.plant, product: sub.product, country: sub.country, by: user.name, role: user.role
        });
      } else {
        const nextDept = sub.workflow[nextIdxC];
        sub.currentStage = nextDept;
        sub.stageIndex = nextIdxC;
        sub.status = 'In Progress'; // rides forward; correctionRaised carries the status
        sub.subDeptStage = 'HEAD_ASSIGN';
        sub.assignedMember = null;
        addEmailLog({
          ts: Date.now(), to: 'wasiur.ib@aristopharmabd.com', dept: nextDept,
          subject: `[${sub.id}] ${pfx} CORRECTION FORWARDED: ${sub.product}/${sub.country} — review by ${nextDept}`,
          tid: sub.id, status: 'Delivered', plant: sub.plant
        });
        addAuditLog({
          submissionId: sub.id, ts: Date.now(), dot: 'red',
          text: `<strong>${user.name} (${user.role})</strong> raised a correction on <strong>${sub.product} / ${sub.country}</strong> — carried FORWARD to <strong>${nextDept}</strong> with correction status: "${comment}"`,
          plant: sub.plant, product: sub.product, country: sub.country, by: user.name, role: user.role
        });
      }

      saveSubmission(sub);
      return res.json(sub);
    }

    // Department Head overrides a member's flagged correction (dismisses it). The
    // artwork is NOT marked as corrected; the head then signs and gives normal approval.
    if (action === 'override_correction') {
      if (sub.currentStage !== user?.role || !user?.isHead) {
        return res.status(403).json({ error: 'Only the Department Head can override a correction.' });
      }
      if (!sub.memberFlaggedCorrection) {
        return res.status(400).json({ error: 'There is no member-flagged correction to override.' });
      }
      sub.memberFlaggedCorrection = false;
      sub.correctionNote = null;
      sub.subDeptStage = 'HEAD_FINAL';
      sub.history.push({ dept: user.role, action: 'Correction Overridden (Head)', ts: Date.now(), by: user.name, comment: comment || 'Head reviewed and overrode the member correction.' });
      addAuditLog({
        submissionId: sub.id, ts: Date.now(), dot: 'orange',
        text: `<strong>Head ${user.name} (${user.role})</strong> overrode the member's correction request — proceeding to final approval`,
        plant: sub.plant, product: sub.product, country: sub.country, by: user.name, role: user.role
      });
      saveSubmission(sub);
      return res.json(sub);
    }

    // IB-CO attaches a buyer confirmation e-mail screenshot (jpg) to a COMMERCIAL
    // artwork at any point. It travels with the artwork, is archived with it, and
    // is surfaced in the audit trail.
    if (action === 'attach_buyer_confirmation') {
      if (user?.role !== 'IB-CO') {
        return res.status(403).json({ error: 'Only IB-CO can attach buyer confirmation screenshots.' });
      }
      const isCommercial = /commercial/i.test(sub.purpose || '') || /commercial/i.test(sub.flowKey || '');
      if (!isCommercial) {
        return res.status(400).json({ error: 'Buyer confirmations apply to Commercial artworks only.' });
      }
      const { filename, dataUrl, note } = req.body;
      if (!dataUrl) {
        return res.status(400).json({ error: 'Missing buyer confirmation image data.' });
      }
      sub.buyerConfirmations = sub.buyerConfirmations || [];
      const entry = {
        id: `BC-${Date.now()}`,
        filename: filename || 'buyer_confirmation.jpg',
        dataUrl, by: user.name, role: user.role, ts: Date.now(), note: note || ''
      };
      sub.buyerConfirmations.push(entry);
      sub.history.push({ dept: 'IB-CO', action: 'Buyer Confirmation Attached', ts: Date.now(), by: user.name, comment: note || entry.filename });
      addAuditLog({
        submissionId: sub.id, ts: Date.now(), dot: 'blue',
        text: `<strong>${user.name} (IB-CO)</strong> attached buyer confirmation <strong>${entry.filename}</strong> to ${sub.product} / ${sub.country}${note ? ` — "${note}"` : ''}`,
        plant: sub.plant, product: sub.product, country: sub.country, by: user.name, role: user.role
      });
      saveSubmission(sub);
      return res.json(sub);
    }

    res.status(400).json({ error: 'Invalid update action' });
  });

  // Get audit log entries
  app.get('/api/audit', (req, res) => {
    res.json(getAuditLogs());
  });

  // Get email log entries
  app.get('/api/emails', (req, res) => {
    res.json(getEmailLogs());
  });

  // Real-time Analytics & Profiling System
  app.get('/api/analytics', (req, res) => {
    const system = collectSystemProfile();
    const metrics = getRequestMetrics();
    
    // Calculate page hit distribution
    const pageHits = { index: 0, api: 0 };
    metrics.forEach(m => {
      if (m.url.startsWith('/api')) pageHits.api++;
      else pageHits.index++;
    });

    // Calculate latency percentiles
    const sortedLatencies = [...metrics].map(m => m.duration).sort((a, b) => a - b);
    const p50 = sortedLatencies.length > 0 ? sortedLatencies[Math.floor(sortedLatencies.length * 0.5)] : 0;
    const p90 = sortedLatencies.length > 0 ? sortedLatencies[Math.floor(sortedLatencies.length * 0.9)] : 0;
    const p99 = sortedLatencies.length > 0 ? sortedLatencies[Math.floor(sortedLatencies.length * 0.99)] : 0;

    res.json({
      system,
      metrics: metrics.slice(-50), // Send latest 50 request metrics for chart
      p50,
      p90,
      p99,
      pageHits
    });
  });

  // Segregated Audit Trail Report Generation
  app.get('/api/report', (req, res) => {
    const { product, country } = req.query;
    if (!product || !country) {
      return res.status(400).json({ error: 'Missing product or country parameter for segregated report' });
    }

    const logs = getAuditLogs().filter(l => 
      l.product === product && l.country === country
    );

    const matchingSubs = getSubmissions().filter(s => 
      s.product === product && s.country === country
    );

    // Calculate stage transition times, approval status
    const reportData = {
      product,
      country,
      generatedAt: new Date().toLocaleString(),
      totalLogsCount: logs.length,
      submissionsCount: matchingSubs.length,
      submissions: matchingSubs.map(s => ({
        id: s.id,
        plant: s.plant,
        status: s.status,
        submittedBy: s.submittedBy,
        submittedAt: new Date(s.submittedAt).toLocaleString(),
        currentStage: s.currentStage,
        completedWorkflow: s.status === 'Approved',
        driveFileId: s.driveFileId,
        approvedFileId: s.approvedFileId,
        calibrationMmPerPt: s.calibrationMmPerPt,
        components: s.components,
        history: s.history.map(h => ({
          dept: h.dept,
          action: h.action,
          by: h.by,
          time: new Date(h.ts).toLocaleString(),
          comment: h.comment
        })),
        annotations: (s.annotations || []).map(a => ({
          id: a.id,
          type: a.type,
          by: a.by,
          role: a.role,
          page: a.page || 1,
          note: a.text || '',
          lengthMm: a.lengthMm ?? null,
          time: new Date(a.ts).toLocaleString()
        }))
      })),
      // Flattened annotation ledger across all matching submissions (for spreadsheet export)
      annotations: matchingSubs.flatMap(s => (s.annotations || []).map(a => ({
        submissionId: s.id,
        product: s.product,
        country: s.country,
        plant: s.plant,
        type: a.type,
        by: a.by,
        role: a.role,
        page: a.page || 1,
        note: a.text || '',
        lengthMm: a.lengthMm ?? null,
        time: new Date(a.ts).toLocaleString()
      }))),
      logs: logs.map(l => ({
        id: l.id,
        time: l.time,
        actionText: l.text.replace(/<\/?[^>]+(>|$)/g, ""), // strip html for clean logs
        dot: l.dot
      }))
    };

    res.json(reportData);
  });

  // ==========================================
  // CONFIG & GEMINI API ROUTES
  // ==========================================

  app.get('/api/config', (req, res) => {
    res.json({
      departments: getDepartments(),
      workflows: getWorkflows()
    });
  });

  app.post('/api/config/departments', (req, res) => {
    const { departments } = req.body;
    if (!Array.isArray(departments)) {
      return res.status(400).json({ error: 'Departments must be an array' });
    }
    saveDepartments(departments);
    res.json({ status: 'ok', departments });
  });

  app.post('/api/config/workflows', (req, res) => {
    const { workflows } = req.body;
    if (!Array.isArray(workflows)) {
      return res.status(400).json({ error: 'Workflows must be an array' });
    }
    saveWorkflows(workflows);
    res.json({ status: 'ok', workflows });
  });

  // Archive an artwork file to the corporate Google Drive account.
  app.post('/api/drive/archive', async (req, res) => {
    const { fileBase64, filename, meta } = req.body;
    if (!filename) {
      return res.status(400).json({ error: 'filename is required' });
    }
    try {
      const result = await archiveArtwork({ base64: fileBase64, filename, meta });
      res.json(result);
    } catch (e: any) {
      console.error('Archive failed:', e);
      res.status(500).json({ error: 'Failed to archive artwork' });
    }
  });

function createSamplePdfBuffer(title: string, subtitle: string = ''): Buffer {
  const cleanTitle = (title || 'Pharmaceutical Packaging Artwork').replace(/[()\\]/g, '');
  const cleanSub = (subtitle || 'Aristo Pharma International Business Division').replace(/[()\\]/g, '');
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
/F1 10 Tf
0 -25 Td
(Official Packaging Artwork Specimen - Aristo Pharma IB System) Tj
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

  // Retrieve an archived artwork file record by fileId
  app.get('/api/drive/file/:fileId', (req, res) => {
    const { fileId } = req.params;
    const isDownload = req.query.download === '1';
    const isJson = req.query.json === '1';

    let record: { filename: string; base64: string; meta?: any; fileId?: string; archivedAt?: string } | null = getArchivedFileRecord(fileId);

    if (!record) {
      const subs = getSubmissions();
      const matchedSub = subs.find(s => s.id === fileId || s.driveFileId === fileId);
      if (matchedSub) {
        if (matchedSub.driveFileId && matchedSub.driveFileId !== fileId) {
          record = getArchivedFileRecord(matchedSub.driveFileId);
        }
        if (!record) {
          const title = `${matchedSub.product || 'Packaging Artwork'}`;
          const subtitle = `Submission ID: ${matchedSub.id} | Plant: ${matchedSub.plant} | Country: ${matchedSub.country}`;
          const pdfBuf = createSamplePdfBuffer(title, subtitle);
          record = {
            fileId: matchedSub.id,
            filename: matchedSub.filename || `${matchedSub.id}_Artwork.pdf`,
            base64: pdfBuf.toString('base64')
          };
        }
      }
    }

    if (!record) {
      const pdfBuf = createSamplePdfBuffer('Packaging Artwork Document', `File Reference: ${fileId}`);
      record = {
        fileId,
        filename: `${fileId}.pdf`,
        base64: pdfBuf.toString('base64')
      };
    }

    if (isJson) {
      return res.json(record);
    }

    const buffer = Buffer.from(record.base64, 'base64');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${isDownload ? 'attachment' : 'inline'}; filename="${record.filename}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.send(buffer);
  });

  app.post('/api/analyze-artwork', async (req, res) => {
    const { fileBase64, filename, fileType } = req.body;
    if (!fileBase64) {
      return res.status(400).json({ error: 'Missing artwork file content' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
      console.warn("GEMINI_API_KEY is not configured or using placeholder. Falling back to mock extraction.");
      return res.json(generateMockAnalysis(filename));
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      let response: any = null;
      let lastError: any = null;
      const modelsToTry = ['gemini-3.6-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];

      for (const modelName of modelsToTry) {
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            response = await ai.models.generateContent({
              model: modelName,
              contents: [
                {
                  inlineData: {
                    data: fileBase64,
                    mimeType: fileType || 'application/pdf'
                  }
                },
                `Analyze this pharmaceutical packaging artwork (carton/label/insert). Extract the regulatory print data and return ONE JSON object. Detect whether the manufacturer address/body text mentions "Shampur" or "Gachha". Extract page-specific information for EACH page present in the document into the "pages" array so that each page form carries only its own page information. Use this exact structure:
{
  "product": "Brand/product name as printed",
  "genericName": "Generic/INN active",
  "strength": "Strength as printed",
  "dosageForm": "Tablet" | "Capsule" | "Ophthalmic" | "Injection" | "Syrup" | "Suspension" | "Cream/Ointment" | "Inhaler" | "Suppository" | "Sachet",
  "packSize": "Pack/presentation",
  "composition": "Composition line(s)",
  "darNumber": "Drug/registration number",
  "barcodeNumber": "Printed barcode digits",
  "materialCode": "Internal artwork/material code",
  "manufacturer": "Manufacturer name and address",
  "storage": "Storage/handling statements",
  "marketCountries": "Destination market(s)",
  "country": "Primary destination country",
  "purpose": "Purpose label",
  "date": "Artwork date (YYYY-MM-DD)",
  "plant": "Shampur" | "Gachha" | "",
  "pages": [
    {
      "pageNumber": 1,
      "product": "Product name printed on this page specifically",
      "genericName": "Generic name on this page",
      "strength": "Strength on this page",
      "dosageForm": "Dosage form on this page",
      "packSize": "Pack size on this page",
      "composition": "Composition on this page",
      "darNumber": "DAR No on this page",
      "materialCode": "Material code on this page",
      "barcodeNumber": "Barcode on this page",
      "country": "Main country on this page",
      "marketCountries": "Market countries on this page",
      "purpose": "Purpose label on this page",
      "date": "Artwork date on this page",
      "plant": "Shampur" | "Gachha" | "",
      "storage": "Storage statement on this page",
      "components": ["Inner Carton"] | ["Insert"] | ["Label"] | ["Blister Foil"],
      "text": "Full extracted text of this page"
    }
  ]
}`
              ],
              config: {
                responseMimeType: 'application/json'
              }
            });
            if (response && response.text) break;
          } catch (err: any) {
            lastError = err;
            const msg = err?.message || String(err);
            console.warn(`Gemini attempt ${attempt} with model ${modelName} notice:`, msg.includes('503') || msg.includes('UNAVAILABLE') ? '503 Model high demand' : msg);
            if (attempt < 2) await new Promise(r => setTimeout(r, 600));
          }
        }
        if (response && response.text) break;
      }

      if (response && response.text) {
        let cleanText = response.text.trim();
        if (cleanText.startsWith('```')) {
          cleanText = cleanText.replace(/^```(json)?\n?/, '').replace(/\n?```$/, '').trim();
        }
        const parsed = JSON.parse(cleanText);
        return res.json(parsed);
      } else {
        if (lastError) throw lastError;
        throw new Error("Empty response from Gemini API");
      }
    } catch (error: any) {
      console.error("Gemini analysis fallback triggered due to error:", error?.message || error);
      return res.json(generateMockAnalysis(filename));
    }
  });

  function generateMockAnalysis(filename: string) {
    const cleanName = (filename || 'Rupatadine_10mg_Tablet_Kenya.pdf').replace(/\.[^/.]+$/, "").replace(/_/g, " ");
    const lower = cleanName.toLowerCase();

    // Recognise the provided sample artworks for a realistic demo extraction.
    if (/rupa|rupatadine/.test(lower)) {
      return {
        product: 'Rupatadine Tablets, 10 mg', genericName: 'Rupatadine', strength: '10 mg',
        dosageForm: 'Tablet', packSize: '3x10 alu-alu blister',
        composition: 'Each tablet contains Rupatadine Fumarate BP equivalent to Rupatadine 10 mg.',
        darNumber: '143-525-021', barcodeNumber: '', materialCode: '20005038/01',
        manufacturer: 'Aristopharma Ltd., Plot # 14-22, Road # 11 & 12, Shampur-Kadamtali I/A, Dhaka-1204, Bangladesh',
        storage: 'Store below 30°C; Protect from light; Keep out of the reach of children.',
        marketCountries: 'Kenya & Laos', country: 'Kenya', purpose: 'Commercial', plant: 'Shampur', date: '2025-07-03',
        pages: [{ pageNumber: 1, product: 'Rupatadine Tablets, 10 mg', country: 'Kenya', purpose: 'Commercial', date: '2025-07-03', plant: 'Shampur', text: cleanName }]
      };
    }
    if (/avatan|travoprost/.test(lower)) {
      return {
        product: 'Avatan (Travoprost) Ophthalmic Solution', genericName: 'Travoprost', strength: '0.004% w/v',
        dosageForm: 'Ophthalmic', packSize: '3 ml LDPE dropper bottle',
        composition: 'Each ml contains Travoprost USP 0.04 mg. Preservative: Ionic Buffered System. Vehicle: Cremophor RH 40 USP NF 0.1%.',
        darNumber: '143-366-052', barcodeNumber: '8906169840179', materialCode: '20000914/04',
        manufacturer: 'Aristopharma Ltd. (Aristovision), Shampur, Dhaka, Bangladesh',
        storage: 'Store below 30°C; Protect from light; Discard 30 days after opening; Keep out of the reach of children.',
        marketCountries: 'Sri Lanka & Maldives', country: 'Sri Lanka', purpose: 'Commercial', plant: 'Shampur', date: '2026-01-05',
        pages: [{ pageNumber: 1, product: 'Avatan (Travoprost) Ophthalmic Solution', country: 'Sri Lanka', purpose: 'Commercial', date: '2026-01-05', plant: 'Shampur', text: cleanName }]
      };
    }

    const matchProd = cleanName.match(/(ciprofloxacin|amoxicillin|metformin|omeprazole|atenolol|paracetamol|lisinopril|amlodipine|timolol|latanoprost|ceftriaxone|diclofenac|salbutamol|hydrocortisone|cetirizine|ibuprofen)/i);
    const generic = matchProd ? matchProd[0].charAt(0).toUpperCase() + matchProd[0].slice(1).toLowerCase() : 'Ciprofloxacin';
    const matchedProduct = `${generic} 500mg Tablet`;

    const matchCountry = cleanName.match(/(kenya|vietnam|philippines|nigeria|ethiopia|ghana|cambodia|myanmar|sri lanka)/i);
    const matchedCountry = matchCountry ? matchCountry[0].charAt(0).toUpperCase() + matchCountry[0].slice(1).toLowerCase() : 'Kenya';

    const isGachha = lower.includes('gachha');
    const detectedPlant = isGachha ? 'Gachha' : 'Shampur';
    const address = detectedPlant === 'Shampur'
      ? 'Aristopharma Ltd., Shampur, Dhaka, Bangladesh'
      : 'Aristopharma Ltd., Gachha, Gazipur, Bangladesh';
    const mockDate = '2026-07-21';

    return {
      product: matchedProduct, genericName: generic, strength: '500 mg',
      dosageForm: 'Tablet', packSize: '10x10 blister',
      composition: `Each tablet contains ${generic} 500 mg.`,
      darNumber: `143-000-000`, barcodeNumber: '', materialCode: '20000000/01',
      manufacturer: address,
      storage: 'Store below 30°C; Protect from light & moisture; Keep out of reach of children.',
      marketCountries: matchedCountry, country: matchedCountry, purpose: 'Commercial', plant: detectedPlant, date: mockDate,
      pages: [
        { pageNumber: 1, product: matchedProduct, country: matchedCountry, purpose: 'Commercial', date: mockDate, plant: detectedPlant, text: `ARISTOPHARMA LTD.\n${matchedProduct.toUpperCase()}\nComposition: Each tablet contains ${generic} 500mg.\n${address}\nD.A.R. No.: 143-000-000\nFor sale in ${matchedCountry}.` }
      ]
    };
  }

  // ==========================================
  // VITE DEV SERVER OR STATIC SERVING
  // ==========================================

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
