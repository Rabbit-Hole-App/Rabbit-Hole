// Offline stand-in for fly, wrangler, curl and sh, used only by whiteboard-renderer.test.mjs through the harness's own pins file.
// State and the call log live in the JSON file named by STUB_STATE; stdin (a secret) is recorded, never logged.
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const [tool, ...a] = process.argv.slice(2);
const F = process.env.STUB_STATE, S = JSON.parse(readFileSync(F, 'utf8'));
const save = () => writeFileSync(F, JSON.stringify(S));
const stdin = () => { try { return readFileSync(0, 'utf8'); } catch { return ''; } };
appendFileSync(F + '.log', `${tool} ${a.join(' ')}\n`);
const out = (o, code = 0) => { process.stdout.write(typeof o === 'string' ? o : JSON.stringify(o)); process.exit(code); };
if (tool === 'fly') {
  if (a[0] === 'apps' && a[1] === 'list') out(S.apps.map(Name => ({ Name })));
  if (a[0] === 'apps' && a[1] === 'create') { S.apps.push(a[2]); save(); out(''); }
  if (a[0] === 'secrets' && a[1] === 'list') out(S.flySecrets.map(Name => ({ Name })));
  if (a[0] === 'secrets' && a[1] === 'import') { S.tokenFly = stdin().trim().split('=')[1]; S.flySecrets = ['MOTION_RENDERER_TOKEN']; save(); out(''); }
  if (a[0] === 'deploy') {
    if (S.failDeploy) { process.stderr.write(`deploy failed for token ${S.tokenFly}\n`); process.exit(1); }
    S.revision = a.find(x => x.startsWith('MOTION_RENDERER_BUILD=')).split('=')[1]; save(); out('');
  }
}
if (tool === 'wrangler') {
  if (a[0] === 'secret' && a[1] === 'list') out(S.workerSecrets.map(name => ({ name, type: 'secret_text' })));
  if (a[0] === 'secret' && a[1] === 'put') { S.tokenWorker = stdin().trim(); S.workerSecrets = ['WHITEBOARD_RENDERER_TOKEN']; save(); out(''); }
}
if (tool === 'curl') {
  const url = a.at(-1);
  if (url.endsWith('/health')) out(S.revision ? { ok: true, service: 'rabbit-hole-motion-renderer', version: 'stub', settings: { git_revision: S.revision }, limits: { concurrent_renders: 1 } } : '');
  if (/\/render\//.test(url)) { const m = stdin().match(/Bearer (\S+)"/); out('{}\n' + (m && m[1] === S.tokenFly ? '404' : '401')); }
}
if (tool === 'sh') { const ctx = a.at(-1); mkdirSync(ctx, { recursive: true }); writeFileSync(join(ctx, 'fly.whiteboard.toml'), ''); writeFileSync(join(ctx, 'src.tar'), ''); out(''); }
process.stderr.write(`stub: unexpected call: ${tool} ${a.join(' ')}\n`);
process.exit(9);
