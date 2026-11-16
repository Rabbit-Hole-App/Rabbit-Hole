import { DatabaseSync } from 'node:sqlite'; import fs from 'node:fs';
const db = new DatabaseSync('r2copy/746c97696fbbb9cf5581f88be52d0dab2857cc3278d166048e6396b80b3dcc16.sqlite', { readOnly: true });
const blobs = 'C:/s/spec/owner-local/persist/local/v3/r2/rabbit-hole-dev-learn-media/blobs/';
fs.mkdirSync('records', { recursive: true });
for (const o of db.prepare("select key, blob_id from _mf_objects where key like 'explain-archive/%'").all()) {
  fs.copyFileSync(blobs + o.blob_id, 'records/' + o.key.split('/').slice(1).join('_'));
}
console.log(fs.readdirSync('records').length);
