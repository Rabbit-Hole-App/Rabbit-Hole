// Live isolation check for the Rabbit Hole dev environment (docs/features/rabbit-hole-dev.md).
// Synthetic users only (@example.test). Never prints a secret or a session.
// Needs CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID (rabbit-hole) in the environment and
// RABBIT_HOLE_DEV_TEST_BYPASS in the environment or the repo-root .env.
//   node scripts/rabbit-hole-dev-verify.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const CP = 'https://rabbit-hole-cp-dev.tryrabbithole.workers.dev';
const WEB = process.env.RABBIT_HOLE_DEV_WEB || 'https://small-cp-dev.tryrabbithole.workers.dev';
const ACCOUNT = 'c08d3dbdc53a3afd3cb09a536ac42318';
const D1 = { main: '1ad18fef-ccf9-4a2c-86c7-dc7e87b268a2', learn: '028f800f-ce8e-4461-adb2-827f417492eb' };
const PRODUCTION = ['small-cp', 'small', '3a9cc077-4dc8-4fbd-8bf7-8ed3b971af8b', 'small-runs'];

assert.equal(process.env.CLOUDFLARE_ACCOUNT_ID, ACCOUNT, 'CLOUDFLARE_ACCOUNT_ID must be the rabbit-hole account');
const env = () => { try { return readFileSync(new URL('../.env', import.meta.url), 'utf8'); } catch { return ''; } };
const secret = process.env.RABBIT_HOLE_DEV_TEST_BYPASS || env().match(/^RABBIT_HOLE_DEV_TEST_BYPASS=(.*)$/m)?.[1]?.trim();
assert.ok(secret, 'RABBIT_HOLE_DEV_TEST_BYPASS missing from the environment and the repo-root .env');

const UA = { 'User-Agent': 'rabbit-hole-dev-verify' };
const cf = async (path, init = {}) => {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}${path}`, { ...init, headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json', ...init.headers } });
  const j = await r.json(); if (!j.success) throw new Error(`${path}: ${JSON.stringify(j.errors)}`); return j.result;
};
const sql = async (db, query, params = []) => (await cf(`/d1/database/${D1[db]}/query`, { method: 'POST', body: JSON.stringify({ sql: query, params }) }))[0].results;
const objects = async bucket => (await cf(`/r2/buckets/${bucket}/objects`)).map(o => o.key);
const session = async email => {
  const r = await fetch(`${CP}/test/session`, { method: 'POST', headers: { ...UA, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, secret }) });
  assert.equal(r.status, 200, `/test/session ${email}`); return (await r.json()).session;
};
const as = s => ({ ...UA, Cookie: `small_session=${s}` });
const results = [];
const check = async (name, fn) => { try { const detail = await fn(); results.push(`PASS ${name}${detail ? ` - ${detail}` : ''}`); } catch (e) { results.push(`FAIL ${name} - ${e.message}`); } };
const stamp = Date.now().toString(36);

await check('dev control plane login fails closed: no link, no code, no challenge for any caller', async () => {
  const web = await fetch(`${CP}/login`, { method: 'POST', headers: { ...UA, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'email=dev-owner%40example.test' });
  const text = await web.text();
  assert.equal(web.status, 503); assert.ok(!text.includes('/auth?token'));
  const cli = await fetch(`${CP}/api/cli/login`, { method: 'POST', headers: { ...UA, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'dev-owner@example.test' }) });
  const body = await cli.text();
  assert.equal(cli.status, 503); assert.ok(!/devCode|challenge/.test(body));
  return `web ${web.status}, cli ${cli.status}`;
});

const owner = await session('dev-owner@example.test'), other = await session('dev-other@example.test');

await check('/test/session refuses a wrong secret', async () => {
  const r = await fetch(`${CP}/test/session`, { method: 'POST', headers: { ...UA, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'dev-owner@example.test', secret: 'wrong' }) });
  assert.equal(r.status, 401); return '401';
});

await check('the dev worker accepts a dev control-plane session and rejects none/forged', async () => {
  const ok = await (await fetch(`${WEB}/api/apps`, { headers: as(owner) })).json();
  assert.equal(ok.email, 'dev-owner@example.test'); assert.equal(ok.org, 'example-test');
  assert.equal((await fetch(`${WEB}/api/apps`, { headers: UA })).status, 401);
  assert.equal((await fetch(`${WEB}/api/apps`, { headers: { ...UA, Cookie: 'small_session=forged.token' } })).status, 401);
  return `identity ${ok.email} / ${ok.org}`;
});

await check('the dev worker still refuses auth routes (P0-B barrier)', async () => {
  const codes = [];
  for (const [m, p] of [['POST', '/login'], ['GET', '/auth'], ['POST', '/logout'], ['POST', '/test/session']]) codes.push((await fetch(`${WEB}${p}`, { method: m, headers: UA, redirect: 'manual' })).status);
  assert.ok(codes.every(c => c === 403), codes.join(',')); return codes.join(',');
});

let slug;
await check('a workspace created on the dev control plane lands in rabbit-hole-dev', async () => {
  const r = await fetch(`${CP}/api/workspaces`, { method: 'POST', headers: { ...as(owner), 'Content-Type': 'application/json' }, body: JSON.stringify({ name: `P0B verify ${stamp}` }) });
  assert.equal(r.status, 200); slug = (await r.json()).slug;
  const rows = await sql('main', 'SELECT slug, owner_email FROM workspaces WHERE slug = ?', [slug]);
  assert.deepEqual(rows, [{ slug, owner_email: 'dev-owner@example.test' }]);
  return slug;
});

await check('workspace switch: the member switches, a non-member stays home and does not see it', async () => {
  const mine = await (await fetch(`${WEB}/api/apps`, { headers: { ...as(owner), 'X-Small-Workspace': slug } })).json();
  assert.equal(mine.org, slug);
  const refused = await fetch(`${WEB}/api/apps`, { headers: { ...as(other), 'X-Small-Workspace': slug } });
  assert.equal(refused.status, 403, 'dev worker lets a non-member into the workspace');
  const theirs = await (await fetch(`${CP}/api/apps`, { headers: { ...as(other), 'X-Small-Workspace': slug } })).json();
  assert.equal(theirs.org, 'example-test');
  const list = await (await fetch(`${WEB}/api/workspaces`, { headers: as(other) })).json();
  assert.ok(!list.workspaces.some(w => w.slug === slug));
  return `owner org ${mine.org}; non-member: dev worker 403, control plane falls back to ${theirs.org}`;
});

let canvas;
await check('a Learn canvas lands in rabbit-hole-learn-dev and is private to its owner', async () => {
  const r = await fetch(`${WEB}/api/canvases`, { method: 'POST', headers: { ...as(owner), 'Content-Type': 'application/json' }, body: JSON.stringify({ title: `P0B verify ${stamp}` }) });
  assert.equal(r.status, 201); canvas = (await r.json()).name;
  assert.equal((await sql('learn', 'SELECT COUNT(*) AS n FROM canvases WHERE name = ? AND owner_email = ?', [canvas, 'dev-owner@example.test']))[0].n, 1);
  const theirs = await (await fetch(`${WEB}/api/canvases`, { headers: as(other) })).json();
  assert.ok(!theirs.canvases.some(c => c.name === canvas), 'other user sees the canvas');
  return canvas;
});

await check('Learn media lands in rabbit-hole-dev-learn-media only', async () => {
  const before = new Set(await objects('rabbit-hole-dev-learn-media'));
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const form = new FormData(); form.append('file', new Blob([png], { type: 'image/png' }), 'dot.png');
  const r = await fetch(`${WEB}/api/learn/media?app=${canvas}`, { method: 'POST', headers: as(owner), body: form });
  assert.equal(r.status, 200, await r.clone().text());
  const added = (await objects('rabbit-hole-dev-learn-media')).filter(k => !before.has(k));
  assert.ok(added.length >= 1); assert.deepEqual(await objects('rabbit-hole-dev-repositories').then(k => k.filter(x => x.includes(stamp))), []);
  return `new object(s): ${added.length}`;
});

await check('repository import reaches the dev indexer with the shared credential', async () => {
  // SCENE_WORKER_TOKEN on the dev worker matches the Fly lesson renderer (docs/features/learn-repositories.md).
  // The renderer scales to zero, so a cold start may answer the mapped 503 once.
  const branches = () => fetch(`${WEB}/api/repositories/branches?url=${encodeURIComponent('https://github.com/octocat/Hello-World')}`, { headers: as(owner) });
  let r = await branches();
  if (r.status === 503) { await new Promise(done => setTimeout(done, 20000)); r = await branches(); }
  const body = await r.json(); assert.equal(r.status, 200, JSON.stringify(body)); assert.ok(body.branches.includes('master'), JSON.stringify(body));
  return `branches ${body.branches.join(',')}`;
});

await check('every rabbit-hole Worker binds only rabbit-hole dev resources; small-cp is not on this account', async () => {
  const scripts = (await cf('/workers/scripts')).map(s => s.id);
  assert.ok(!scripts.includes('small-cp'), 'small-cp exists on rabbit-hole');
  const seen = [];
  for (const name of scripts) {
    const bindings = (await cf(`/workers/scripts/${name}/settings`)).bindings || [];
    for (const b of bindings) {
      const target = b.service || b.bucket_name || b.id || b.database_id || '';
      assert.ok(!PRODUCTION.includes(target), `${name}.${b.name} -> ${target}`);
    }
    seen.push(`${name}(${bindings.length})`);
  }
  return seen.join(' ');
});

console.log(results.join('\n'));
if (results.some(r => r.startsWith('FAIL'))) process.exit(1);
