import fs from 'fs';
import path from 'path';
import { Submission, AuditLogEntry, EmailLogEntry, RequestMetric, SystemProfile, Plant } from '../src/types';
import { DEPT_LABELS, plantPrefix } from '../src/shared/constants';

const DB_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DB_DIR, 'db.json');

interface DatabaseSchema {
  submissions: Submission[];
  auditLogs: AuditLogEntry[];
  emailLogs: EmailLogEntry[];
  requestMetrics: RequestMetric[];
  activeSessions: Record<string, { name: string; role: string; lastSeen: number }>;
  departments?: Array<{ code: string; label: string; email: string }>;
  workflows?: Array<{ plant: string; name: string; steps: string[] }>;
}

let dbCache: DatabaseSchema | null = null;

// Helpers to calculate names & routes
function deptReviewerName(dept: string): string {
  const map: Record<string, string> = {
    'IB-CO': 'Wasiur Rahman Khan',
    'IB-SH': 'Mahmud Chowdhury Sumon',
    'IRA-SH': 'MM Kamrul Hasan',
    'QC-SH': 'Khalilur Rahman Rokon',
    'RnD-SH': 'Mock_RnD-SH_H',
    'PROD-SH': 'Mock_PROD-SH_H',
    'QCom-SH': 'Mock_QCom-SH_H',
    'IRA-GA': 'Arifur Rahman Rahul',
    'RnD-GA': 'Mock_RnD-GA_H',
    'QC-GA': 'Mock_QC-GA_H',
    'QM-GA': 'Mock_QM-GA_H',
    'QCom-GA': 'Mock_QCom-GA_H'
  };
  return map[dept] || dept;
}

const WORKFLOWS: Record<string, Record<string, string[]>> = {
  Shampur: {
    'Existing Pack': ['IB-CO', 'IB-SH', 'IRA-SH', 'QC-SH', 'QCom-SH'],
    'New Pack': ['IB-CO', 'IB-SH', 'RnD-SH', 'PROD-SH', 'IRA-SH', 'QC-SH', 'QCom-SH'],
  },
  Gachha: {
    Dossier: ['IB-CO', 'IB-SH', 'IRA-GA', 'QC-GA', 'QM-GA', 'QCom-GA'],
    Commercial: ['IB-CO', 'IB-SH', 'IRA-GA', 'RnD-GA', 'QC-GA', 'QM-GA', 'QCom-GA'],
    Renewal: ['IB-CO', 'IB-SH', 'IRA-GA', 'RnD-GA', 'QC-GA', 'QM-GA', 'QCom-GA'],
    'Site Transfer': ['IB-CO', 'IB-SH', 'IRA-GA', 'RnD-GA', 'QC-GA', 'QM-GA', 'QCom-GA'],
    Variation: ['IB-CO', 'IB-SH', 'IRA-GA', 'RnD-GA', 'QC-GA', 'QM-GA', 'QCom-GA'],
  }
};

function defaultShampurFlow(purpose: string): string {
  if (['Dossier', 'Commercial'].includes(purpose)) return 'New Pack';
  return 'Existing Pack';
}

function generateInitialData(): DatabaseSchema {
  const now = Date.now();
  const mins = (m: number) => now - m * 60000;
  const days = (d: number) => now - d * 24 * 60 * 60 * 1000;

  const seeds = [
    { p: 'Ciprofloxacin 500mg Tablet', df: 'Tablet', c: 'Myanmar', plant: 'Shampur' as Plant, pur: 'Renewal', pri: 'Medium', comp: ['Inner Carton', 'Blister Foil', 'Label'], stage: 'IB-SH', si: 1, ts: mins(2880) },
    { p: 'Lisinopril 10mg Tablet', df: 'Tablet', c: 'Tanzania', plant: 'Shampur' as Plant, pur: 'Dossier', pri: 'Urgent', comp: ['Inner Carton', 'Insert'], stage: 'IB-SH', si: 1, ts: mins(120) },
    { p: 'Salbutamol Inhaler 100mcg', df: 'Inhaler', c: 'Vietnam', plant: 'Shampur' as Plant, pur: 'Commercial', pri: 'Normal', comp: ['Inner Carton', 'Insert', 'Label'], stage: 'IB-SH', si: 1, ts: mins(420) },
    { p: 'Atenolol 50mg Tablet', df: 'Tablet', c: 'Kenya', plant: 'Shampur' as Plant, pur: 'Renewal', pri: 'Urgent', comp: ['Inner Carton', 'Insert'], stage: 'IRA-SH', si: 2, ts: mins(340), flow: 'Existing Pack' },
    { p: 'Timolol 0.5% Eye Drops', df: 'Ophthalmic', c: 'Sri Lanka', plant: 'Shampur' as Plant, pur: 'Variation', pri: 'Medium', comp: ['Inner Carton', 'Insert', 'Label'], stage: 'IRA-SH', si: 2, ts: mins(720), flow: 'Existing Pack' },
    { p: 'Amoxicillin 500mg Capsule', df: 'Capsule', c: 'Vietnam', plant: 'Shampur' as Plant, pur: 'Commercial', pri: 'Medium', comp: ['Insert', 'Blister Foil'], stage: 'QC-SH', si: 3, ts: mins(890), flow: 'Existing Pack', correction: 'Font size on ingredient list does not meet regulatory requirement. Please update.' },
    { p: 'Hydrocortisone 1% Cream', df: 'Cream/Ointment', c: 'Cambodia', plant: 'Shampur' as Plant, pur: 'Dossier', pri: 'Normal', comp: ['Tube', 'Inner Carton', 'Insert'], stage: 'QC-SH', si: 5, ts: mins(1200), flow: 'New Pack' },
    { p: 'Ceftriaxone 1g Injection', df: 'Injection', c: 'Nigeria', plant: 'Shampur' as Plant, pur: 'Dossier', pri: 'Urgent', comp: ['Inner Carton', 'Insert', 'Label'], stage: 'RnD-SH', si: 2, ts: mins(180), flow: 'New Pack' },
    { p: 'Diclofenac 75mg Injection', df: 'Injection', c: 'Ghana', plant: 'Shampur' as Plant, pur: 'Commercial', pri: 'Medium', comp: ['Inner Carton', 'Insert', 'Label'], stage: 'RnD-SH', si: 2, ts: mins(960), flow: 'New Pack' },
    { p: 'Latanoprost 0.005% Eye Drops', df: 'Ophthalmic', c: 'Philippines', plant: 'Shampur' as Plant, pur: 'Commercial', pri: 'Medium', comp: ['Inner Carton', 'Insert', 'Label'], stage: 'PROD-SH', si: 3, ts: mins(7200), flow: 'New Pack' },
    { p: 'Amlodipine 5mg Tablet', df: 'Tablet', c: 'Kenya', plant: 'Shampur' as Plant, pur: 'Commercial', pri: 'Normal', comp: ['Inner Carton', 'Insert', 'Blister Foil'], stage: 'PROD-SH', si: 3, ts: mins(2300), flow: 'New Pack' },
    { p: 'Lisinopril 10mg Tablet', df: 'Tablet', c: 'Cambodia', plant: 'Shampur' as Plant, pur: 'Renewal', pri: 'Normal', comp: ['Inner Carton', 'Insert', 'Blister Foil'], stage: 'QCom-SH', si: 4, ts: mins(5760), flow: 'Existing Pack' },
    { p: 'Paracetamol 500mg Tablet', df: 'Tablet', c: 'Bangladesh', plant: 'Shampur' as Plant, pur: 'Variation', pri: 'Medium', comp: ['Inner Carton', 'Insert'], stage: 'QCom-SH', si: 4, ts: mins(2700), flow: 'Existing Pack' },
    { p: 'Omeprazole 20mg Capsule', df: 'Capsule', c: 'Sri Lanka', plant: 'Gachha' as Plant, pur: 'Commercial', pri: 'Urgent', comp: ['Inner Carton', 'Insert'], stage: 'IRA-GA', si: 2, ts: mins(60) },
    { p: 'Cetirizine 10mg Syrup', df: 'Syrup', c: 'Uganda', plant: 'Gachha' as Plant, pur: 'Dossier', pri: 'Medium', comp: ['Bottle Label', 'Inner Carton', 'Insert'], stage: 'IRA-GA', si: 2, ts: mins(540) },
    { p: 'Metformin 500mg Tablet', df: 'Tablet', c: 'Bangladesh', plant: 'Gachha' as Plant, pur: 'Commercial', pri: 'Urgent', comp: ['Inner Carton', 'Tube'], stage: 'RnD-GA', si: 3, ts: mins(180) },
    { p: 'Ibuprofen 100mg/5ml Suspension', df: 'Suspension', c: 'Tanzania', plant: 'Gachha' as Plant, pur: 'Commercial', pri: 'Medium', comp: ['Bottle Label', 'Outer Carton', 'Insert'], stage: 'RnD-GA', si: 3, ts: mins(1320) },
    { p: 'Metformin 500mg Tablet', df: 'Tablet', c: 'Nigeria', plant: 'Gachha' as Plant, pur: 'Dossier', pri: 'Normal', comp: ['Label'], stage: 'QC-GA', si: 3, ts: mins(1440) },
    { p: 'Omeprazole 20mg Capsule', df: 'Capsule', c: 'Ethiopia', plant: 'Gachha' as Plant, pur: 'Renewal', pri: 'Medium', comp: ['Inner Carton', 'Blister Foil'], stage: 'QC-GA', si: 4, ts: mins(2880), correction: 'Blister foil pinhole tolerance not specified per Ethiopia EFDA template.' },
    { p: 'Atenolol 50mg Tablet', df: 'Tablet', c: 'Ethiopia', plant: 'Gachha' as Plant, pur: 'Dossier', pri: 'Normal', comp: ['Label', 'Insert'], stage: 'QM-GA', si: 4, ts: mins(2160) },
    { p: 'Cetirizine 10mg Syrup', df: 'Syrup', c: 'Kenya', plant: 'Gachha' as Plant, pur: 'Variation', pri: 'Medium', comp: ['Bottle Label', 'Outer Carton'], stage: 'QM-GA', si: 5, ts: mins(4200) },
    { p: 'Paracetamol 500mg Tablet', df: 'Tablet', c: 'Nigeria', plant: 'Gachha' as Plant, pur: 'Commercial', pri: 'Medium', comp: ['Label', 'Inner Carton'], stage: 'QCom-GA', si: 6, ts: mins(6480) },
    { p: 'Ciprofloxacin 500mg Tablet', df: 'Tablet', c: 'Ghana', plant: 'Gachha' as Plant, pur: 'Renewal', pri: 'Normal', comp: ['Inner Carton', 'Insert', 'Blister Foil'], stage: 'QCom-GA', si: 6, ts: mins(8200) },

    // Closed ones
    { p: 'Paracetamol 500mg Tablet', df: 'Tablet', c: 'Ghana', plant: 'Shampur' as Plant, pur: 'Variation', pri: 'Normal', comp: ['Insert'], stage: 'APPROVED', si: 5, ts: days(3), flow: 'Existing Pack' },
    { p: 'Omeprazole 20mg Capsule', df: 'Capsule', c: 'Kenya', plant: 'Shampur' as Plant, pur: 'Variation', pri: 'Normal', comp: ['Insert'], stage: 'APPROVED', si: 5, ts: days(6), flow: 'Existing Pack' },
    { p: 'Atenolol 50mg Tablet', df: 'Tablet', c: 'Vietnam', plant: 'Shampur' as Plant, pur: 'Renewal', pri: 'Medium', comp: ['Inner Carton', 'Insert'], stage: 'APPROVED', si: 5, ts: days(12), flow: 'Existing Pack' },
    { p: 'Salbutamol Inhaler 100mcg', df: 'Inhaler', c: 'Philippines', plant: 'Shampur' as Plant, pur: 'Commercial', pri: 'Urgent', comp: ['Inner Carton', 'Insert', 'Label'], stage: 'APPROVED', si: 7, ts: days(18), flow: 'New Pack' },
    { p: 'Timolol 0.5% Eye Drops', df: 'Ophthalmic', c: 'Cambodia', plant: 'Shampur' as Plant, pur: 'Dossier', pri: 'Medium', comp: ['Inner Carton', 'Insert', 'Label'], stage: 'APPROVED', si: 7, ts: days(22), flow: 'New Pack' },
    { p: 'Metformin 500mg Tablet', df: 'Tablet', c: 'Sri Lanka', plant: 'Gachha' as Plant, pur: 'Commercial', pri: 'Medium', comp: ['Inner Carton', 'Insert', 'Blister Foil'], stage: 'APPROVED', si: 7, ts: days(4) },
    { p: 'Cetirizine 10mg Syrup', df: 'Syrup', c: 'Bangladesh', plant: 'Gachha' as Plant, pur: 'Variation', pri: 'Normal', comp: ['Bottle Label', 'Outer Carton'], stage: 'APPROVED', si: 7, ts: days(9) },
  ];

  let idCounter = 1;
  const submissions: Submission[] = seeds.map(s => {
    const fKey = s.flow || (s.plant === 'Shampur' ? defaultShampurFlow(s.pur) : s.pur);
    const wf = WORKFLOWS[s.plant][fKey];
    const subId = `PKG-${String(idCounter++).padStart(3, '0')}`;

    const sub: Submission = {
      id: subId,
      product: s.p,
      dosageForm: s.df,
      country: s.c,
      plant: s.plant,
      purpose: s.pur,
      flowKey: fKey,
      flowLocked: s.si > 1,
      workflowConfirmed: true,
      priority: s.pri as any,
      components: s.comp,
      currentStage: s.stage,
      workflow: wf,
      stageIndex: s.si,
      status: s.stage === 'APPROVED' ? 'Approved' : (s.correction ? 'Correction' : 'In Progress'),
      submittedBy: 'Wasiur Rahman Khan',
      submitterRole: 'IB-CO',
      submittedAt: s.ts,
      comments: '',
      filename: `${s.p.replace(/\s+/g, '_')}_${s.c}_v1.pdf`,
      packSize: '10×10 blister',
      history: [],
      chat: [],
      annotations: [],
      correctionNote: s.correction || null,
      date: '2026-07-21',
      pages: [
        {
          pageNumber: 1,
          product: s.p,
          country: s.c,
          purpose: s.pur,
          date: '2026-07-21',
          plant: s.plant,
          text: `ARISTOPHARMA LTD.\n${s.p.toUpperCase()}\nFor oral use\nComposition: Each tablet contains active ingredients.\nManufactured by Aristopharma Ltd, ${s.plant} Plant.`
        }
      ],
      subDeptStage: s.stage === 'APPROVED' ? 'HEAD_FINAL' : 'HEAD_ASSIGN',
      assignedMember: null
    };

    // Populate history
    sub.history.push({ dept: 'IB-CO', action: 'Submitted', ts: s.ts, by: 'Wasiur Rahman Khan' });
    if (s.stage === 'APPROVED') {
      for (let i = 1; i < wf.length; i++) {
        sub.history.push({
          dept: wf[i],
          action: 'Approved',
          ts: s.ts + i * 4 * 3600000,
          by: deptReviewerName(wf[i]),
          comment: 'Approved successfully'
        });
      }
    } else if (s.correction) {
      const issuer = s.stage;
      const idx = wf.indexOf(issuer);
      for (let i = 1; i < idx; i++) {
        sub.history.push({
          dept: wf[i],
          action: 'Approved',
          ts: s.ts + i * 3 * 3600000,
          by: deptReviewerName(wf[i]),
          comment: 'Approved'
        });
      }
      sub.history.push({
        dept: issuer,
        action: 'Correction Requested',
        ts: s.ts + idx * 3 * 3600000 + 1800000,
        by: deptReviewerName(issuer),
        comment: s.correction
      });
    }

    // Populate chat on a few items
    if (s.p.startsWith('Atenolol') && s.c === 'Kenya') {
      sub.chat = [
        { by: 'Wasiur Rahman Khan', role: 'IB-CO', ts: s.ts + 500000, text: 'Sent over for IRA review. Kenya filing deadline is end of month — please prioritize.' },
        { by: 'Mahmud Chowdhury Sumon', role: 'IB-SH', ts: s.ts + 1000000, text: 'Existing-pack flow selected. Forwarding straight to IRA.' },
        { by: 'MM Kamrul Hasan', role: 'IRA-SH', ts: s.ts + 2000000, text: 'Quick check — is the Kenya PPB requirement for the batch number font size 6pt or 8pt? I want to confirm before signing off.' },
        { by: 'Khalilur Rahman Rokon', role: 'QC-SH', ts: s.ts + 2500000, text: 'PPB updated their guidance in March — minimum 7pt now. Current artwork is at 8pt so we\'re fine.' },
        { by: 'MM Kamrul Hasan', role: 'IRA-SH', ts: s.ts + 3000000, text: 'Perfect, thanks. Reviewing now.' }
      ];
    }

    return sub;
  });

  // Build audit & email logs from submissions
  const auditLogs: AuditLogEntry[] = [];
  const emailLogs: EmailLogEntry[] = [];

  submissions.forEach(s => {
    s.history.forEach(h => {
      let dot: 'orange' | 'green' | 'blue' | 'red' = 'orange';
      let text = '';
      if (h.action === 'Submitted') {
        text = `<strong>${s.product} / ${s.country}</strong> — Submitted by ${h.by} (IB-CO)`;
      } else if (h.action === 'Approved') {
        dot = (h.dept === s.workflow[s.workflow.length - 1]) ? 'green' : 'blue';
        text = `<strong>${s.product} / ${s.country}</strong> — Approved by ${h.by} (${h.dept})`;
      } else if (h.action === 'Correction Requested') {
        dot = 'red';
        text = `<strong>${s.product} / ${s.country}</strong> — Correction by ${h.by} (${h.dept}): "${h.comment || ''}"`;
      }

      auditLogs.push({
        id: `AUD-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
        submissionId: s.id,
        time: new Date(h.ts).toLocaleString(),
        ts: h.ts,
        dot,
        text,
        plant: s.plant,
        product: s.product,
        country: s.country,
        by: h.by,
        role: h.dept
      });

      // Email log
      if (h.action === 'Submitted') {
        const next = s.workflow[1];
        if (next) {
          emailLogs.push({
            id: `EML-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
            time: new Date(h.ts).toLocaleString(),
            ts: h.ts,
            to: 'wasiur.ib@aristopharmabd.com',
            dept: next,
            subject: `[${s.id}] ${plantPrefix(s.plant)} ${s.priority === 'Urgent' ? 'URGENT: ' : ''}${s.product}/${s.country} — ${s.purpose} artwork for review`,
            tid: s.id,
            status: 'Delivered',
            plant: s.plant
          });
        }
      } else if (h.action === 'Approved') {
        const idx = s.workflow.indexOf(h.dept);
        const next = s.workflow[idx + 1];
        if (next) {
          emailLogs.push({
            id: `EML-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
            time: new Date(h.ts).toLocaleString(),
            ts: h.ts,
            to: 'wasiur.ib@aristopharmabd.com',
            dept: next,
            subject: `[${s.id}] ${plantPrefix(s.plant)} ACTION: ${s.product}/${s.country} — review by ${DEPT_LABELS[next]}`,
            tid: s.id,
            status: 'Delivered',
            plant: s.plant
          });
        }
      } else if (h.action === 'Correction Requested') {
        emailLogs.push({
          id: `EML-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
          time: new Date(h.ts).toLocaleString(),
          ts: h.ts,
          to: 'wasiur.ib@aristopharmabd.com',
          dept: 'IB-CO',
          subject: `[${s.id}] ${plantPrefix(s.plant)} CORRECTION: ${s.product}/${s.country} — revision required`,
          tid: s.id,
          status: 'Delivered',
          plant: s.plant
        });
      }
    });
  });

  return {
    submissions,
    auditLogs,
    emailLogs,
    requestMetrics: [],
    activeSessions: {}
  };
}

export function initDatabase() {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  if (fs.existsSync(DB_FILE)) {
    try {
      const data = fs.readFileSync(DB_FILE, 'utf-8');
      dbCache = JSON.parse(data);
    } catch (e) {
      console.error('Failed to read database file, generating new seeds', e);
      dbCache = generateInitialData();
      saveDatabase();
    }
  } else {
    dbCache = generateInitialData();
    saveDatabase();
  }
}

export function getDatabase(): DatabaseSchema {
  if (!dbCache) {
    initDatabase();
  }
  return dbCache!;
}

export function saveDatabase() {
  if (!dbCache) return;
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(dbCache, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to write database file', e);
  }
}

// Submissions CRUD
export function getSubmissions(): Submission[] {
  const subs = getDatabase().submissions;
  let changed = false;
  subs.forEach(s => {
    if (!s.date) {
      s.date = '2026-07-21';
      changed = true;
    }
    if (!s.pages) {
      s.pages = [
        {
          pageNumber: 1,
          product: s.product,
          country: s.country,
          purpose: s.purpose,
          date: s.date || '2026-07-21',
          plant: s.plant,
          text: s.pagesText?.[0] || `ARISTOPHARMA LTD.\n${s.product.toUpperCase()}\nFor oral use\nComposition: Each tablet contains active ingredients.\nManufactured by Aristopharma Ltd, ${s.plant} Plant.`
        }
      ];
      changed = true;
    }
    if (!s.subDeptStage) {
      s.subDeptStage = s.currentStage === 'APPROVED' ? 'HEAD_FINAL' : 'HEAD_ASSIGN';
      changed = true;
    }
    if (s.assignedMember === undefined) {
      s.assignedMember = null;
      changed = true;
    }
  });
  if (changed) {
    saveDatabase();
  }
  return subs;
}

export function saveSubmission(sub: Submission) {
  const db = getDatabase();
  const idx = db.submissions.findIndex(s => s.id === sub.id);
  if (idx >= 0) {
    db.submissions[idx] = sub;
  } else {
    db.submissions.push(sub);
  }
  saveDatabase();
}

// Audit Logs
export function getAuditLogs(): AuditLogEntry[] {
  return getDatabase().auditLogs;
}

export function addAuditLog(entry: Omit<AuditLogEntry, 'id' | 'time'>) {
  const db = getDatabase();
  const fullEntry: AuditLogEntry = {
    ...entry,
    id: `AUD-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
    time: new Date(entry.ts).toLocaleString()
  };
  db.auditLogs.push(fullEntry);
  saveDatabase();
}

// Email Logs
export function getEmailLogs(): EmailLogEntry[] {
  return getDatabase().emailLogs;
}

export function addEmailLog(entry: Omit<EmailLogEntry, 'id' | 'time'>) {
  const db = getDatabase();
  const fullEntry: EmailLogEntry = {
    ...entry,
    id: `EML-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
    time: new Date(entry.ts).toLocaleString()
  };
  db.emailLogs.push(fullEntry);
  saveDatabase();
}

// Request Metrics / Profiler
export function addRequestMetric(metric: Omit<RequestMetric, 'id'>) {
  const db = getDatabase();
  const fullMetric: RequestMetric = {
    ...metric,
    id: `REQ-${Math.random().toString(36).substr(2, 9).toUpperCase()}`
  };
  db.requestMetrics.push(fullMetric);
  // Cap request logs to latest 1000 items to avoid infinite storage bloat
  if (db.requestMetrics.length > 1000) {
    db.requestMetrics.shift();
  }
  saveDatabase();
}

export function getRequestMetrics(): RequestMetric[] {
  return getDatabase().requestMetrics;
}

// Session Tracking
export function trackSession(email: string, name: string, role: string) {
  const db = getDatabase();
  db.activeSessions[email] = { name, role, lastSeen: Date.now() };
  // Clean sessions older than 30 minutes
  const limit = Date.now() - 30 * 60000;
  for (const key in db.activeSessions) {
    if (db.activeSessions[key].lastSeen < limit) {
      delete db.activeSessions[key];
    }
  }
  saveDatabase();
}

export function getActiveSessionCount(): number {
  const db = getDatabase();
  const limit = Date.now() - 5 * 60000; // 5 mins activity window
  return Object.values(db.activeSessions).filter(s => s.lastSeen >= limit).length;
}

export function getDepartments() {
  const db = getDatabase();
  if (!db.departments) {
    db.departments = [
      { code: 'IB-CO', label: 'IB Corporate Office', email: 'ib-co@aristopharmabd.com' },
      { code: 'IB-SH', label: 'IB Shampur', email: 'ib-sh@aristopharmabd.com' },
      { code: 'QC-SH', label: 'QC Shampur', email: 'qc-sh@aristopharmabd.com' },
      { code: 'IRA-SH', label: 'IRA Shampur', email: 'ira-sh@aristopharmabd.com' },
      { code: 'QCom-SH', label: 'QCom Shampur', email: 'qcom-sh@aristopharmabd.com' },
      { code: 'PROD-SH', label: 'Production SH', email: 'prod-sh@aristopharmabd.com' },
      { code: 'RnD-SH', label: 'R&D Shampur', email: 'rnd-sh@aristopharmabd.com' },
      { code: 'IRA-GA', label: 'IRA Gachha', email: 'ira-ga@aristopharmabd.com' },
      { code: 'RnD-GA', label: 'R&D Gachha', email: 'rnd-ga@aristopharmabd.com' },
      { code: 'QC-GA', label: 'QC Gachha', email: 'qc-ga@aristopharmabd.com' },
      { code: 'QM-GA', label: 'QM Gachha', email: 'qm-ga@aristopharmabd.com' },
      { code: 'QCom-GA', label: 'QCom Gachha', email: 'qcom-ga@aristopharmabd.com' }
    ];
    saveDatabase();
  }
  return db.departments;
}

export function saveDepartments(departments: any[]) {
  const db = getDatabase();
  db.departments = departments;
  saveDatabase();
}

export function getWorkflows() {
  const db = getDatabase();
  if (!db.workflows) {
    db.workflows = [
      { plant: 'Shampur', name: 'Existing Pack', steps: ['IB-CO', 'IB-SH', 'IRA-SH', 'QC-SH', 'QCom-SH'] },
      { plant: 'Shampur', name: 'New Pack', steps: ['IB-CO', 'IB-SH', 'RnD-SH', 'PROD-SH', 'IRA-SH', 'QC-SH', 'QCom-SH'] },
      { plant: 'Gachha', name: 'Dossier', steps: ['IB-CO', 'IB-SH', 'IRA-GA', 'QC-GA', 'QM-GA', 'QCom-GA'] },
      { plant: 'Gachha', name: 'Commercial', steps: ['IB-CO', 'IB-SH', 'IRA-GA', 'RnD-GA', 'QC-GA', 'QM-GA', 'QCom-GA'] },
      { plant: 'Gachha', name: 'Renewal', steps: ['IB-CO', 'IB-SH', 'IRA-GA', 'RnD-GA', 'QC-GA', 'QM-GA', 'QCom-GA'] },
      { plant: 'Gachha', name: 'Site Transfer', steps: ['IB-CO', 'IB-SH', 'IRA-GA', 'RnD-GA', 'QC-GA', 'QM-GA', 'QCom-GA'] },
      { plant: 'Gachha', name: 'Variation', steps: ['IB-CO', 'IB-SH', 'IRA-GA', 'RnD-GA', 'QC-GA', 'QM-GA', 'QCom-GA'] }
    ];
    saveDatabase();
  }
  return db.workflows;
}

export function saveWorkflows(workflows: any[]) {
  const db = getDatabase();
  db.workflows = workflows;
  saveDatabase();
}
