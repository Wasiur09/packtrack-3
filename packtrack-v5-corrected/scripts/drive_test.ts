import { archiveSubmissionFolder, getArchivedFileRecord } from '../server/drive';
import fs from 'node:fs';
import path from 'node:path';
async function main() {
  const id = 'PKG-QC1';
  const res = await archiveSubmissionFolder(id, [
    { role: 'raw', filename: `${id}_RAW.pdf`, base64: Buffer.from('%PDF-raw').toString('base64'), meta: { copy: 'raw' } },
    { role: 'annotated', filename: `${id}_ANN.pdf`, base64: Buffer.from('%PDF-annotated').toString('base64'), meta: { copy: 'annotated' } },
  ]);
  const folder = path.join(process.cwd(), 'data', 'artworks', 'submissions', id);
  const manifestExists = fs.existsSync(path.join(folder, '_folder.json'));
  const raw = res.find(r => r.role === 'raw')!;
  const ann = res.find(r => r.role === 'annotated')!;
  const rawRec = getArchivedFileRecord(raw.fileId);
  const annRec = getArchivedFileRecord(ann.fileId);
  console.log('folderCreated=%s manifest=%s files=%s', fs.existsSync(folder), manifestExists, fs.readdirSync(folder).length);
  console.log('rawRetrieved=%s annotatedRetrieved=%s distinctIds=%s',
    rawRec?.base64 === Buffer.from('%PDF-raw').toString('base64'),
    annRec?.base64 === Buffer.from('%PDF-annotated').toString('base64'),
    raw.fileId !== ann.fileId);
  const manifest = JSON.parse(fs.readFileSync(path.join(folder, '_folder.json'), 'utf-8'));
  console.log('manifest.folderName=%s roles=%s', manifest.folderName, manifest.files.map((f:any)=>f.role).join(','));
  if (!rawRec || !annRec || raw.fileId === ann.fileId || !manifestExists) { console.error('DRIVE TEST FAILED'); process.exit(1); }
  console.log('\n✅ DRIVE FOLDER TEST PASSED');
}
main().catch(e => { console.error('❌', e); process.exit(1); });
