import { DatabaseSync } from 'node:sqlite'; import fs from 'node:fs';
const dir = process.argv[2];
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.sqlite') && f !== 'metadata.sqlite')) {
  const db = new DatabaseSync(`${dir}/${f}`, { readOnly: true });
  const t = db.prepare("select name from sqlite_master where type='table'").all().map(r => r.name);
  const objs = t.includes('_mf_objects') ? db.prepare('select key, size, uploaded from _mf_objects').all() : [];
  const ea = objs.filter(o => o.key.startsWith('explain-archive/'));
  console.log(f.slice(0, 8), 'tables', t.join(','), 'objects', objs.length, 'explain-archive', ea.length);
  const days = {}; for (const o of ea) { const d = o.key.split('/')[1]; days[d] = (days[d] || 0) + 1; } console.log(days);
  const prefixes = {}; for (const o of objs) { const p = o.key.split('/')[0]; prefixes[p] = (prefixes[p] || 0) + 1; } console.log(prefixes);
}
