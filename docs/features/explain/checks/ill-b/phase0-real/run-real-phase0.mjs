// Phase 0 real calls (owner approved 2026-11-19 08:26 PT: four images incl. F2, about US$0.13, hard cap US$15 total). Loads RECRAFT_API_KEY by NAME from small-deploy/.env into the child's environment only; never printed.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const t = fs.readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8');
const m = t.match(/^\s*(?:export\s+)?RECRAFT_API_KEY\s*=\s*(.*?)\s*$/m);
if (!m) { console.error('STOP: RECRAFT_API_KEY not in .env (name checked)'); process.exit(2); }
const key = m[1].replace(/^(['"])(.*)\1$/, '$2');
const r = spawnSync(process.execPath, ['ill-b.mjs', '--real', '--phase0', '--owner-ok-usd', '15'], { cwd: 'C:/s/ill-b', env: { ...process.env, RECRAFT_API_KEY: key }, encoding: 'utf8', timeout: 600000 });
const clean = s => String(s || '').split(key).join('[key]');
console.log(clean(r.stdout)); if (r.stderr) console.error(clean(r.stderr).slice(-600));
process.exit(r.status ?? 1);
