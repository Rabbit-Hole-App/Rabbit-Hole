// Integration fix for the combined tree: every file listed in ladder-smoke.json "landsWith" (required files that arrive with a lane not yet on main) is now in the
// tree, and ladder-smoke.test.mjs fails a listed file that exists. Empties the block; nothing else changes.
import fs from 'node:fs';
const f = process.argv[2];
const t = fs.readFileSync(f, 'utf8');
const m = t.match(/"landsWith": \{[\s\S]*?\r?\n  \},\r?\n/);
if (!m) throw new Error('landsWith block not found');
const crlf = t.includes('\r\n');
const next = t.replace(m[0], () => `"landsWith": {},${crlf ? '\r\n' : '\n'}`);
JSON.parse(next);
fs.writeFileSync(f, next);
console.log('landsWith emptied');
