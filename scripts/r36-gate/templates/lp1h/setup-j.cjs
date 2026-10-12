// Keyless LP1 journey stack for the integration gate (packages/web/e2e/journey-local-stack.md), with this session's own
// Worker names and ports: int35-alp-app on 8878, int35-alp-cp on 8879. Vars hold no model key; secrets are random and never printed.
const fs = require('fs'), crypto = require('crypto');
const R = '@@APP_ROOT@@', W = '@@GATE_ROOT@@/lp1h/ws';
const strip = s => { let o = '', q = false; for (let i = 0; i < s.length; i++) { const c = s[i];
  if (q) { o += c; if (c === String.fromCharCode(92)) o += s[++i]; else if (c === '"') q = false; continue; }
  if (c === '"') { q = true; o += c; continue; }
  if (c === '/' && s[i + 1] === '/') { while (i < s.length && s[i] !== '\n') i++; o += '\n'; continue; } o += c; }
  return o.replace(/,(\s*[}\]])/g, '$1'); };
const read = f => JSON.parse(strip(fs.readFileSync(f, 'utf8')));
const app = read(`${R}/packages/web/wrangler.dev.jsonc`), cp = read(`${R}/packages/control-plane/wrangler.rabbit-hole-dev.jsonc`);
delete app.account_id; delete cp.account_id;
// Provider tripwire (owner, 2026-10-07): when the tree has it, both workers start through its entrypoints, so the journeys
// and the Tutor slice cannot reach a model provider and the gate can read the count.
const TW = require('fs').existsSync(`${R}/packages/web/e2e/provider-tripwire.js`);
console.log(`provider tripwire: ${TW ? 'on' : 'off'}`);
Object.assign(app, { name: 'int35-alp-app', main: TW ? `${R}/packages/web/e2e/tripwire-dev-worker.js` : `${R}/packages/web/dev-worker.js`, preview_urls: false,
  services: [{ binding: 'CONTROL_PLANE', service: 'int35-alp-cp' }], vars: { ...app.vars, SMALL_ENV: 'test', JOURNEY_MODEL_STUB: 'fixtures' } });
app.assets.directory = `${R}/packages/web/dist-dev`;
Object.assign(cp, { name: 'int35-alp-cp', main: TW ? `${R}/packages/web/e2e/tripwire-cp-worker.js` : `${R}/packages/control-plane/src/index.js`, vars: { SMALL_ENV: 'test', BASE_URL: 'http://127.0.0.1:8878' } });
cp.assets.directory = `${R}/packages/web/dist`;
cp.d1_databases = cp.d1_databases.map(d => (d.migrations_dir ? { ...d, migrations_dir: `${R}/packages/control-plane/migrations` } : d));
const vars = ['SMALL_ENV=test', `TEST_BYPASS_SECRET=${crypto.randomBytes(24).toString('hex')}`, `MASTER_KEY=${crypto.randomBytes(32).toString('hex')}`, 'OAUTH_MOCK=true', 'JOURNEY_MODEL_STUB=fixtures', ''].join('\n');
for (const [dir, config] of [['app', app], ['cp', cp]]) {
  fs.mkdirSync(`${W}/cfg/${dir}`, { recursive: true });
  fs.writeFileSync(`${W}/cfg/${dir}/wrangler.jsonc`, JSON.stringify(config, null, 2));
  fs.writeFileSync(`${W}/cfg/${dir}/.dev.vars`, vars);
}
console.log('configs written');
