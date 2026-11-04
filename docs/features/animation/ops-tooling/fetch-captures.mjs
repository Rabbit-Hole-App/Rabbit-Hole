// Downloads every capture PNG of a Gate 2 export from the dev R2 bucket (read-only GETs) into <dest>/<job>/captures/.
// Usage: node fetch-captures.mjs <export dir (has aj_*)> <dest dir>   (credentials come BY NAME via with-cf.mjs env; never printed)
import { readFileSync, readdirSync, mkdirSync, existsSync, writeFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const [src, dest] = process.argv.slice(2);
const WR = 'C:/Users/cyudhist/Desktop/workspace/animation-rca/node_modules/wrangler/bin/wrangler.js';
const BUCKET = 'rabbit-hole-dev-learn-media';
const ENV_FILE = 'C:/Users/cyudhist/Desktop/workspace/small-deploy/.env';
const text = readFileSync(ENV_FILE, 'utf8'); const env = { ...process.env };
for (const n of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']) { const m = text.match(new RegExp(`^${n}=(.*)$`, 'm')); if (!m) throw new Error(`${n} missing`); env[n] = m[1].trim().replace(/^['"]|['"]$/g, ''); }
const out = [];
for (const job of readdirSync(src).filter(x => x.startsWith('aj_'))) {
  const read = f => { try { return JSON.parse(readFileSync(`${src}/${job}/${f}`, 'utf8')); } catch { return null; } };
  const keys = new Map();
  const detail = read('diagnostics-detail1.json')?.diagnostics;
  for (const c of detail?.captures ?? []) if (c.key) keys.set(c.key, { id: c.id, round: 'final', recorded: c.sha256 });
  const reviews = read('reviews.json'); const list = Array.isArray(reviews) ? reviews : Object.values(reviews ?? {});
  list.forEach((r, i) => { const h = String(r.artifactHash ?? '').slice(0, 16); for (const c of r.raw?.captures ?? []) { const key = `animation/${job}/${h}-${c.id}.png`; if (!keys.has(key)) keys.set(key, { id: c.id, round: `review-${i + 1}`, recorded: null }); } });
  const dir = `${dest}/${job}/captures`; mkdirSync(dir, { recursive: true });
  for (const [key, meta] of keys) {
    const file = `${dir}/${key.split('/').pop()}`;
    if (!existsSync(file)) { const r = spawnSync(process.execPath, [WR, 'r2', 'object', 'get', `${BUCKET}/${key}`, '--file', file, '--remote'], { env, encoding: 'utf8' }); if (r.status !== 0) { out.push({ job, key, ok: false, why: (r.stderr || r.stdout || '').split('\n').filter(l => /error|not found|no such/i.test(l)).slice(0, 1).join('') }); continue; } }
    const bytes = readFileSync(file), sha = createHash('sha256').update(bytes).digest('hex');
    out.push({ job, key, ok: true, bytes: bytes.length, sha256: sha, round: meta.round, recordedSha256: meta.recorded, match: meta.recorded ? meta.recorded === sha : null });
  }
  writeFileSync(`${dir}/manifest.json`, JSON.stringify(out.filter(o => o.job === job), null, 1));
  console.log(job, out.filter(o => o.job === job && o.ok).length, 'ok', out.filter(o => o.job === job && !o.ok).length, 'missing');
}
