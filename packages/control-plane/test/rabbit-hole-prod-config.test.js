import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Rabbit Hole production (docs/features/rabbit-hole-production.md): one public origin, digrabbithole.com, served
// by the app Worker; the control plane has no public route and is reached only through the app's service binding.
// Neither config shares a resource with dev or with the legacy small-cp production.
const here = new URL('.', import.meta.url);
const raw = path => readFileSync(new URL(path, here), 'utf8');
const config = path => JSON.parse(raw(path).replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (_, s) => s || '').replace(/,(\s*[}\]])/g, '$1'));
const d1 = c => Object.fromEntries((c.d1_databases || []).map(d => [d.binding, d.database_name]));
const r2 = c => Object.fromEntries((c.r2_buckets || []).map(b => [b.binding, b.bucket_name]));

const APP = '../../web/wrangler.rabbit-hole-prod.jsonc', CP = '../wrangler.rabbit-hole-prod.jsonc';
const RABBIT_HOLE = 'c08d3dbdc53a3afd3cb09a536ac42318';
const D1 = { DB: 'rabbit-hole-prod', LEARN_DB: 'rabbit-hole-learn-prod' };
const BUCKETS = { LEARN_MEDIA: 'rabbit-hole-prod-learn-media', REPOSITORY_SNAPSHOTS: 'rabbit-hole-prod-repositories' };
// Dev, legacy production and personal-account identifiers that no production config may name.
const FORBIDDEN = [
  '1ad18fef-ccf9-4a2c-86c7-dc7e87b268a2', '028f800f-ce8e-4461-adb2-827f417492eb', 'cae839e6-6d58-4037-9e92-d47346356c2f',
  '3a9cc077-4dc8-4fbd-8bf7-8ed3b971af8b', 'small-runs', 'rabbit-hole-cp-dev', 'small-cp', 'zeroshothq', 'lesson-renderer-dev',
];

test('both production configs pin the rabbit-hole account and name no dev, legacy or personal resource', () => {
  for (const path of [APP, CP]) {
    const c = config(path), text = JSON.stringify(c);
    assert.equal(c.account_id, RABBIT_HOLE, path);
    for (const id of FORBIDDEN) assert.ok(!text.includes(id), `${path} names ${id}`);
    // tryrabbithole.dev is legacy (redirect to digrabbithole.com later), never a production origin or comment target.
    assert.ok(!raw(path).includes('tryrabbithole'), `${path} names tryrabbithole`);
    for (const name of [c.name, ...Object.values(d1(c)), ...Object.values(r2(c)), ...(c.services || []).map(s => s.service)]) assert.doesNotMatch(name, /-dev\b/, `${path} names dev resource ${name}`);
    assert.deepEqual(d1(c), D1, path);
    assert.deepEqual(r2(c), BUCKETS, path);
    assert.equal(c.triggers, undefined, `${path}: the legacy crons start Fly machines and send email`);
    assert.equal(c.preview_urls, false, path);
    assert.equal(c.ai, undefined, path); assert.equal(c.vectorize, undefined, path); assert.equal(c.queues, undefined, path);
    for (const key of Object.keys(c.vars || {})) assert.doesNotMatch(key, /TEST|OAUTH_MOCK|^FLY_|SUBSCRIPTION/, `${path} var ${key}`);
  }
});

test('the app Worker owns digrabbithole.com and binds its own control plane, with the dev worker Durable Objects', () => {
  const app = config(APP), dev = config('../../web/wrangler.dev.jsonc');
  assert.equal(app.name, 'rabbit-hole-app');
  assert.equal(app.main, 'app-worker.js');
  assert.equal(app.workers_dev, false);
  assert.deepEqual(app.routes, [{ pattern: 'digrabbithole.com', custom_domain: true }]);
  assert.deepEqual(app.services, [{ binding: 'CONTROL_PLANE', service: 'rabbit-hole-cp' }]);
  // Same classes and migration tags as dev, so the Durable Object model is the one tested there.
  assert.deepEqual(app.durable_objects, dev.durable_objects);
  assert.deepEqual(app.migrations, dev.migrations);
  // dev-worker.js bundles its HTML from ./dist-dev, so the directory keeps that name.
  assert.equal(app.assets.directory, './dist-dev');
  // The one public origin (auth.js on feature/rabbit-hole-production-auth sends sign-in there).
  assert.equal(app.vars.PUBLIC_ORIGIN, 'https://digrabbithole.com');
});

test('the control plane is private: no route, no workers.dev, SMALL_ENV production, BASE_URL and PUBLIC_ORIGIN the public origin', () => {
  const cp = config(CP);
  assert.equal(cp.name, 'rabbit-hole-cp');
  assert.equal(cp.main, 'src/index.js');
  assert.equal(cp.workers_dev, false);
  assert.equal(cp.routes, undefined);
  assert.equal(cp.services, undefined);
  assert.equal(cp.vars.SMALL_ENV, 'production');
  assert.equal(cp.vars.BASE_URL, 'https://digrabbithole.com');
  assert.equal(cp.vars.PUBLIC_ORIGIN, 'https://digrabbithole.com');
  assert.equal(cp.d1_databases.find(d => d.binding === 'DB').migrations_dir, 'migrations');
});

test('only the production app config runs app-worker.js; every dev and review worker keeps the barrier', () => {
  const web = new URL('../../web/', here);
  for (const name of ['wrangler.dev.jsonc', 'wrangler.parallel.jsonc']) assert.equal(config(new URL(name, web)).main, 'dev-worker.js', name);
  assert.match(raw(APP), /"main": "app-worker\.js"/);
});

// The notebook iframes run user Python with allow-same-origin, so their sites must be a different site from
// digrabbithole.com: static Workers on the rabbit-hole account's workers.dev, no bindings, no route.
test('the production notebook sites are static rabbit-hole Workers on workers.dev with nothing bound', () => {
  for (const [file, name, site] of [['wrangler.rabbit-hole-notebook-prod.jsonc', 'rabbit-hole-notebook', 'notebook-site'], ['wrangler.rabbit-hole-canvas-notebook-prod.jsonc', 'rabbit-hole-canvas-notebook', 'canvas-notebook-site']]) {
    const c = config(`../../web/${file}`);
    assert.equal(c.name, name, file);
    assert.equal(c.account_id, RABBIT_HOLE, file);
    assert.equal(c.workers_dev, true, file);
    assert.equal(c.preview_urls, false, file);
    assert.equal(c.routes, undefined, file);
    assert.equal(c.main, undefined, `${file}: static assets only`);
    assert.deepEqual(Object.keys(c).filter(k => /d1_|r2_|services|vars|durable|queues|ai|vectorize/.test(k)), [], file);
    assert.equal(c.assets.directory, `../../.small/${site}`, file);
  }
});

// Production repository import must not launch on the 503: it calls the Rabbit Hole-owned production renderer
// (Fly org rabbit-hole), never a dev one, with its own SCENE_WORKER_TOKEN (docs/features/rabbit-hole-production.md).
test('production repository import calls rabbit-hole-lesson-renderer-prod, never a dev renderer', () => {
  const app = config(APP), cp = config(CP);
  assert.equal(app.vars.SCENE_WORKER_URL, 'https://rabbit-hole-lesson-renderer-prod.fly.dev');
  assert.equal(cp.vars.SCENE_WORKER_URL, undefined, 'only the app Worker runs repository import');
  for (const c of [app, cp]) assert.doesNotMatch(JSON.stringify(c), /lesson-renderer-dev/);
  const prod = raw('../../lesson-renderer/fly.prod.toml'), dev = raw('../../lesson-renderer/fly.dev.toml');
  assert.match(prod, /^app = "rabbit-hole-lesson-renderer-prod"\r?$/m);
  // The validated dev renderer's runtime, health check and VM, unchanged: only the app line differs.
  const body = toml => toml.split(/\r?\n/).filter(line => !line.startsWith('app = ')).join('\n');
  assert.equal(body(prod), body(dev));
});

test('production sign-in email goes out as Rabbit Hole <signin@digrabbithole.com>, from the control plane only', () => {
  assert.equal(config(CP).vars.EMAIL_FROM, 'Rabbit Hole <signin@digrabbithole.com>');
  assert.equal(config(APP).vars.EMAIL_FROM, undefined);
});
