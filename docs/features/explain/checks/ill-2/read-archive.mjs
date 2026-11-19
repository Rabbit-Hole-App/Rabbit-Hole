// read-only: copy the local R2 sqlite files (and WAL) to a scratch dir, find an object by key, print its blob (the explain archive record)
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
const key = process.argv[2], out = process.argv[3];
const R2 = 'C:/s/spec/owner-local/persist/local/v3/r2/';
const tmp = 'C:/s/gen1-prep/r2-copy/'; fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
let found = null;
for (const f of fs.readdirSync(R2 + 'miniflare-R2BucketObject').filter(f => f.endsWith('.sqlite'))) {
  for (const ext of ['', '-wal', '-shm']) if (fs.existsSync(R2 + 'miniflare-R2BucketObject/' + f + ext)) fs.copyFileSync(R2 + 'miniflare-R2BucketObject/' + f + ext, tmp + f + ext);
  const db = new DatabaseSync(tmp + f, { readOnly: false });
  try {
    const row = db.prepare('SELECT key, blob_id, size FROM _mf_objects WHERE key = ?').get(key);
    if (row) found = { file: f, ...row };
  } catch (e) { /* not an objects db */ }
  db.close();
}
if (!found) { console.error('key not found in', R2); process.exit(2); }
console.error('found', found.file.slice(0, 12), 'blob', found.blob_id, 'size', found.size);
const blob = path.join(R2, 'rabbit-hole-dev-learn-media', 'blobs', found.blob_id);
fs.copyFileSync(blob, out);
console.error('wrote', out, fs.statSync(out).size, 'bytes');
