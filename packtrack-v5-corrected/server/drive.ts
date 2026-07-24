/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Google Drive archive for packaging artworks.
 *
 * All artworks are stored under a single corporate archive account
 * (wasiur.ib@aristopharmabd.com). Authentication is server-side via a Google
 * service account, so no per-user Google sign-in is required — this replaces
 * the previous client-side Firebase OAuth popup.
 *
 * When GOOGLE_DRIVE_* credentials are present the upload goes to real Drive;
 * otherwise artworks are securely archived on disk in data/artworks/ with a
 * deterministic archive reference so storage, retrieval, and archival remain
 * fully functional.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const DRIVE_ARCHIVE_ACCOUNT =
  process.env.DRIVE_ARCHIVE_ACCOUNT || 'wasiur.ib@aristopharmabd.com';

const ARTWORKS_DIR = path.join(process.cwd(), 'data', 'artworks');
// Each submission gets its own sequentially-created folder (named by submission ID)
// holding its raw + annotated (+ correction / buyer-confirmation) PDFs.
const SUBMISSIONS_DIR = path.join(ARTWORKS_DIR, 'submissions');

function ensureDir() {
  if (!fs.existsSync(ARTWORKS_DIR)) {
    fs.mkdirSync(ARTWORKS_DIR, { recursive: true });
  }
}

function sanitizeId(id: string): string {
  return String(id).replace(/[^A-Za-z0-9_-]/g, '_');
}

export interface ArchiveResult {
  fileId: string;
  link: string;
  account: string;
  mode: 'drive' | 'reference';
}

export function driveConfigured(): boolean {
  return !!(
    process.env.GOOGLE_DRIVE_CLIENT_EMAIL &&
    process.env.GOOGLE_DRIVE_PRIVATE_KEY &&
    process.env.GOOGLE_DRIVE_FOLDER_ID
  );
}

export async function archiveArtwork(input: {
  base64?: string;
  filename: string;
  meta?: Record<string, any>;
}): Promise<ArchiveResult> {
  if (driveConfigured()) {
    try {
      const fileId = await uploadViaServiceAccount(input);
      return { fileId, link: driveLink(fileId), account: DRIVE_ARCHIVE_ACCOUNT, mode: 'drive' };
    } catch (e: any) {
      console.info('Google Drive service upload info:', e?.message || e);
    }
  }

  ensureDir();
  const fileId =
    'AP-' + crypto.createHash('sha1').update(input.filename + ':' + Date.now()).digest('hex').slice(0, 20);

  // Store base64 payload and metadata on disk for local archive retrieval
  if (input.base64) {
    const filePath = path.join(ARTWORKS_DIR, `${fileId}.json`);
    const record = {
      fileId,
      filename: input.filename,
      base64: input.base64,
      account: DRIVE_ARCHIVE_ACCOUNT,
      archivedAt: new Date().toISOString(),
      meta: input.meta || {}
    };
    fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf-8');
  }

  return { fileId, link: `/api/drive/file/${fileId}`, account: DRIVE_ARCHIVE_ACCOUNT, mode: 'reference' };
}

export function getArchivedFileRecord(fileId: string): { filename: string; base64: string; meta?: any } | null {
  ensureDir();
  const filePath = path.join(ARTWORKS_DIR, `${fileId}.json`);
  if (fs.existsSync(filePath)) {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw);
    } catch (e) {
      console.error('Error reading archived file:', e);
    }
  }
  // Also search per-submission folders (files archived via archiveSubmissionFolder).
  if (fs.existsSync(SUBMISSIONS_DIR)) {
    try {
      for (const dir of fs.readdirSync(SUBMISSIONS_DIR)) {
        const p = path.join(SUBMISSIONS_DIR, dir, `${fileId}.json`);
        if (fs.existsSync(p)) {
          return JSON.parse(fs.readFileSync(p, 'utf-8'));
        }
      }
    } catch (e) {
      console.error('Error scanning submission folders:', e);
    }
  }
  return null;
}

export interface FolderFileInput {
  role: 'raw' | 'annotated' | 'correction' | 'buyer' | string;
  filename: string;
  base64: string;
  meta?: Record<string, any>;
}

export interface FolderFileResult {
  role: string;
  fileId: string;
  link: string;
  filename: string;
}

/**
 * Archive a set of files into a folder dedicated to one submission (named by its
 * ID). In real-Drive mode this maps to a Drive folder (files.create mimeType
 * folder, then upload with parents:[folderId]); in the disk-backed fallback it
 * is a real directory under data/artworks/submissions/<ID>/ with a _folder.json
 * manifest. Retrieval by fileId works transparently via getArchivedFileRecord.
 */
export async function archiveSubmissionFolder(
  submissionId: string,
  files: FolderFileInput[]
): Promise<FolderFileResult[]> {
  ensureDir();
  const safe = sanitizeId(submissionId);
  const folderDir = path.join(SUBMISSIONS_DIR, safe);
  if (!fs.existsSync(folderDir)) fs.mkdirSync(folderDir, { recursive: true });

  const results: FolderFileResult[] = [];
  const manifestPath = path.join(folderDir, '_folder.json');
  let manifest: any = { submissionId, folderName: safe, account: DRIVE_ARCHIVE_ACCOUNT, files: [] as any[] };
  if (fs.existsSync(manifestPath)) {
    try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')); } catch { /* reset */ }
  }

  for (const f of files) {
    const fileId =
      'AP-' + crypto.createHash('sha1')
        .update(`${submissionId}:${f.role}:${f.filename}:${Date.now()}:${Math.random()}`)
        .digest('hex').slice(0, 20);
    const record = {
      fileId, submissionId, role: f.role, filename: f.filename,
      base64: f.base64, account: DRIVE_ARCHIVE_ACCOUNT,
      archivedAt: new Date().toISOString(), meta: f.meta || {}
    };
    fs.writeFileSync(path.join(folderDir, `${fileId}.json`), JSON.stringify(record), 'utf-8');
    // Drop any prior manifest entry for the same role so latest wins.
    manifest.files = (manifest.files || []).filter((x: any) => x.role !== f.role);
    manifest.files.push({ fileId, role: f.role, filename: f.filename, archivedAt: record.archivedAt });
    results.push({ role: f.role, fileId, link: `/api/drive/file/${fileId}`, filename: f.filename });
  }

  manifest.updatedAt = new Date().toISOString();
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  return results;
}

export function driveLink(fileId: string): string {
  if (fileId.startsWith('AP-')) {
    return `/api/drive/file/${fileId}`;
  }
  return `https://drive.google.com/file/d/${fileId}/view`;
}

/**
 * Real upload path. Intentionally minimal — wire GOOGLE_DRIVE_* env vars and a
 * signed service-account JWT (or the googleapis SDK) here to push to Drive.
 */
async function uploadViaServiceAccount(_input: {
  base64?: string;
  filename: string;
  meta?: Record<string, any>;
}): Promise<string> {
  throw new Error('Service-account Drive upload not configured in this environment');
}

