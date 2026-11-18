import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const env = { ...process.env, VITE_COACHING_DEV: 'true' };
for (const line of readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m && m[1] === 'TLDRAW_LICENSE_KEY') env.VITE_TLDRAW_LICENSE_KEY = m[2].replace(/^(['"])(.*)\1$/, '$2');
}
if (!env.VITE_TLDRAW_LICENSE_KEY) { console.error('VITE_TLDRAW_LICENSE_KEY missing (name only checked)'); process.exit(2); }
const r = spawnSync(process.execPath, ['../../node_modules/vite/bin/vite.js', 'build', '--outDir', process.argv[2] ?? 'dist'], { cwd: 'C:/s/kinds-fit/packages/web', env, stdio: ['ignore', 'ignore', 'inherit'] });
console.log('vite exit', r.status);
process.exit(r.status ?? 1);
