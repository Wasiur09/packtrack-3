/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type Plant = 'Shampur' | 'Gachha';

export type Priority = 'Normal' | 'Medium' | 'Urgent';

export type SubmissionStatus = 'In Progress' | 'Correction' | 'Approved';

export interface User {
  role: string;
  name: string;
  email: string;
  isHead?: boolean;
}

export interface ArtworkPage {
  pageNumber: number;
  product: string;
  country: string;
  purpose: string;
  date: string;
  plant: Plant | '';
  text: string;
}

export interface Annotation {
  id: string;
  type: 'comment' | 'highlight' | 'circle' | 'measure' | 'signature' | 'symbol';
  by: string;
  role: string;
  ts: number;
  page?: number; // 1-based PDF page the annotation is anchored to
  // Professional digital-signature metadata (type === 'signature'). A signature
  // is immutable once applied and may be applied only ONCE per user per artwork.
  signedName?: string;
  signedRole?: string;
  signedDate?: string; // human-readable local timestamp captured at signing
  // Regulatory marking glyph for the symbol tool (type === 'symbol'): / * ^ ° ± × etc.
  symbol?: string;
  // Legacy 800x540 mock-canvas coordinates (kept for back-compat with seeds)
  x?: number;
  y?: number;
  text?: string;
  w?: number;
  h?: number;
  cx?: number;
  cy?: number;
  rx?: number;
  ry?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  // Normalized (0..1) coordinates relative to the real PDF page — resolution
  // and zoom independent, so markers stay pinned to the artwork at any scale.
  nx?: number;
  ny?: number;
  nw?: number;
  nh?: number;
  ncx?: number;
  ncy?: number;
  nrx?: number;
  nry?: number;
  nx1?: number;
  ny1?: number;
  nx2?: number;
  ny2?: number;
  lengthMm?: number; // measured real-world length for 'measure' markers
}

export interface BuyerConfirmation {
  id: string;
  filename: string;
  dataUrl?: string; // base64 jpg (client preview / archive payload)
  by: string;
  role: string;
  ts: number;
  note?: string;
}

export interface ChatMessage {
  by: string;
  role: string;
  ts: number;
  text: string;
  system?: boolean;
}

export interface HistoryEvent {
  dept: string;
  action: string;
  ts: number;
  by: string;
  comment?: string;
}

export interface Submission {
  id: string;
  product: string;
  dosageForm: string;
  country: string;
  plant: Plant;
  purpose: string;
  flowKey: string;
  flowLocked: boolean;
  workflowConfirmed?: boolean;
  priority: Priority;
  components: string[];
  currentStage: string;
  workflow: string[];
  stageIndex: number;
  status: SubmissionStatus;
  submittedBy: string;
  submitterRole: string;
  submittedAt: number;
  comments: string;
  filename: string;
  packSize: string;
  // Regulatory fields extracted from the artwork by Gemini (IB-CO verifies)
  genericName?: string;
  strength?: string;
  darNumber?: string;
  composition?: string;
  manufacturer?: string;
  barcodeNumber?: string;
  materialCode?: string;
  storage?: string;
  marketCountries?: string;
  pagesText?: string[];
  extractedText?: string; // flattened page text used by the read-only viewer fallback
  // Commercial-only: buyer confirmation e-mail screenshots (jpg) attached by IB-CO
  // at any point in the workflow. Travels with the artwork and is surfaced in audit.
  buyerConfirmations?: BuyerConfirmation[];
  driveFileId?: string;
  driveLink?: string;
  approvedFileId?: string; // archive copy created on final approval (points to the annotated/baked PDF)
  approvedLink?: string;
  // Final archive: raw (plain) artwork and the annotation-baked copy, both stored
  // in the submission's own Drive folder (named by ID) and downloadable separately.
  rawFileId?: string;
  rawLink?: string;
  annotatedFileId?: string;
  annotatedLink?: string;
  calibrationMmPerPt?: number; // measurement calibration (real mm per PDF point)
  history: HistoryEvent[];
  chat: ChatMessage[];
  annotations: Annotation[];
  correctionNote?: string | null;
  // Sticky correction status: once a correction is upheld it rides FORWARD with the
  // artwork through the remaining departments and cannot be cleared by downstream
  // approvals. Materializes as status==='Correction' only when it lands at IB-CO.
  correctionRaised?: boolean;
  // A member has flagged a correction and it is awaiting the Head's override/uphold decision.
  memberFlaggedCorrection?: boolean;
  date?: string;
  pages?: ArtworkPage[];
  subDeptStage?: 'HEAD_ASSIGN' | 'MEMBER_REVIEW' | 'HEAD_FINAL';
  assignedMember?: string | null;
}

export interface AuditLogEntry {
  id: string;
  submissionId?: string;
  time: string;
  ts: number;
  dot: 'orange' | 'green' | 'blue' | 'red';
  text: string;
  plant?: Plant;
  product?: string;
  country?: string;
  by?: string;
  role?: string;
}

export interface EmailLogEntry {
  id: string;
  time: string;
  ts: number;
  to: string;
  dept: string;
  subject: string;
  tid: string;
  status: 'Delivered';
  plant: Plant;
}

export interface RequestMetric {
  id: string;
  timestamp: number;
  method: string;
  url: string;
  status: number;
  duration: number; // in ms
}

export interface SystemProfile {
  cpuUsage: number; // percentage
  memoryUsed: number; // in MB
  memoryTotal: number; // in MB
  uptime: number; // in seconds
  totalRequests: number;
  averageLatency: number; // in ms
  activeSessions: number;
}
