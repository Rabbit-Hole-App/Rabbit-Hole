import { IMAGE_MODELS, imageQuote } from '../src/image-providers.js';
import { IMAGE_VALIDATED } from '../src/image-settings.js';
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
// Telemetry (docs/features/telemetry.md): once provisioned, the app Worker alone binds exactly this database and private archive
// bucket, together, and labels itself production. The control plane binds neither. Until then neither config names them.
const TELEMETRY_D1 = { TELEMETRY_DB: 'rabbit-hole-telemetry' }, TELEMETRY_R2 = { TELEMETRY_ARCHIVE: 'rabbit-hole-telemetry-archive' };
const expected = (c, path) => {
  const on = 'TELEMETRY_DB' in d1(c) || 'TELEMETRY_ARCHIVE' in r2(c);
  if (!on) return { d1: D1, r2: BUCKETS };
  assert.equal(path, APP, 'only the app Worker binds telemetry storage');
  assert.equal(c.vars?.TELEMETRY_ENVIRONMENT, 'production', `${path}: the production app Worker records as production`);
  return { d1: { ...D1, ...TELEMETRY_D1 }, r2: { ...BUCKETS, ...TELEMETRY_R2 } };
};
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
    const want = expected(c, path);
    assert.deepEqual(d1(c), want.d1, path);
    assert.deepEqual(r2(c), want.r2, path);
    // The control plane's legacy crons start Fly machines and send email. The app Worker has one cron, the analytics cleanup, whose handler does nothing else.
    if (c.name === 'rabbit-hole-app') assert.deepEqual(c.triggers, { crons: ['0 4 * * *'] }, path);
    else assert.equal(c.triggers, undefined, `${path}: the legacy crons start Fly machines and send email`);
    assert.equal(c.preview_urls, false, path);
    assert.equal(c.ai, undefined, path); assert.equal(c.vectorize, undefined, path); assert.equal(c.queues, undefined, path);
    for (const key of Object.keys(c.vars || {})) assert.doesNotMatch(key, /TEST|OAUTH_MOCK|^FLY_|SUBSCRIPTION/, `${path} var ${key}`);
  }
});

// Final review A-m5: journey planner fixtures run only when SMALL_ENV is test AND JOURNEY_MODEL_STUB is fixtures
// (learn-next-steps-planner.js journeyCallModel), so no production config names JOURNEY_MODEL_STUB at all, and the app
// Worker sets no SMALL_ENV of its own.
test('no production config names JOURNEY_MODEL_STUB, and the app Worker sets no SMALL_ENV', () => {
  for (const path of [APP, CP, '../wrangler.jsonc', '../../web/wrangler.rabbit-hole-notebook-prod.jsonc', '../../web/wrangler.rabbit-hole-canvas-notebook-prod.jsonc']) {
    assert.ok(!raw(path).includes('JOURNEY_MODEL_STUB'), `${path} names JOURNEY_MODEL_STUB`);
  }
  assert.ok(!raw(APP).includes('SMALL_ENV'), `${APP} names SMALL_ENV`);
  assert.equal(config(CP).vars.SMALL_ENV, 'production');
});

test('the app Worker owns digrabbithole.com and binds its own control plane, with the dev worker Durable Objects', () => {
  const app = config(APP), dev = config('../../web/wrangler.dev.jsonc');
  assert.equal(app.name, 'rabbit-hole-app');
  assert.equal(app.main, 'app-worker.js');
  assert.equal(app.workers_dev, false);
  assert.deepEqual(app.routes, [{ pattern: 'digrabbithole.com', custom_domain: true }]);
  assert.deepEqual(app.services, [{ binding: 'CONTROL_PLANE', service: 'rabbit-hole-cp' }]);
  // Same classes and migration tags as dev, so the Durable Object model is the one tested there. FileJobs (file imports) is bound here
  // too (file-jobs-1, last) as shared plumbing only; docs/features/file-jobs-production.md lists what each feature still needs.
  // Owner authorized ongoing production CAD on 2026-10-17; binding is required,
  // while actual admission remains disabled until bounded production verification.
  assert.ok(app.durable_objects.bindings.some(b => b.name === 'CAD_JOBS' && b.class_name === 'CadJobs'));
  assert.equal(app.vars.CAD_PRODUCTION_REQUIRED, 'true');
  assert.equal(app.vars.CAD_MODEL_REQUIRE_DEDICATED, 'true');
  assert.equal(app.vars.CAD_PRODUCTION_MONTHLY_MODEL_USD, '10');
  assert.equal(app.vars.CAD_PRODUCTION_ENABLED, undefined);
  assert.equal(app.vars.CAD_MODEL_ENABLED, undefined);
  // CAD job limits (docs/features/cad.md, cad-review-first-acceptance.md): review-first is brief + source + review = three calls, so the two
  // flags may never diverge; US$0.20 is reserved against the monthly US$10 line once per job (50 jobs), not per call.
  assert.deepEqual([app.vars.CAD_MAX_CALLS, app.vars.CAD_MAX_USD, app.vars.CAD_MAX_REPAIRS], ['3', '0.20', '0']);
  assert.ok(['true', 'false'].includes(app.vars.CAD_BRIEF_FIRST));
  if (app.vars.CAD_BRIEF_FIRST === 'true') assert.ok(Number(app.vars.CAD_MAX_CALLS) >= 3, 'review-first needs three calls');
  // ExplainJobs (EXP-T12) is bound everywhere; in prod its tag follows the already-applied cad-jobs-1, since a migration tag
  // placed before an applied one would never run.
  // ImageJobs (IMG-01) likewise: bound everywhere, its image-jobs-1 tag last in prod, after the applied explain-jobs-1.
  // AnimationJobs (AN-05, owner production GO 2026-11-02): the dev binding and dev tag, its animation-jobs-1 last in prod, after the applied file-jobs-1.
  const devOnly = { bindings: [...dev.durable_objects.bindings.filter(b => !['FileJobs','CadJobs','ExplainJobs','ImageJobs','AnimationJobs','WhiteboardJobs','RoadmapJobs'].includes(b.class_name)), {name:'CAD_JOBS',class_name:'CadJobs'}, {name:'EXPLAIN_JOBS',class_name:'ExplainJobs'}, {name:'IMAGE_JOBS',class_name:'ImageJobs'}, {name:'FILE_JOBS',class_name:'FileJobs'}, {name:'ANIMATION_JOBS',class_name:'AnimationJobs'}, {name:'WHITEBOARD_JOBS',class_name:'WhiteboardJobs'}, {name:'ROADMAP_JOBS',class_name:'RoadmapJobs'}] };
  assert.deepEqual(app.durable_objects, devOnly);
  assert.deepEqual(app.migrations, [...dev.migrations.filter(m => !['file-jobs-1','cad-jobs-1','explain-jobs-1','image-jobs-1','animation-jobs-1','whiteboard-jobs-1','roadmap-jobs-1'].includes(m.tag)), {tag:'cad-jobs-1',new_sqlite_classes:['CadJobs']}, {tag:'explain-jobs-1',new_sqlite_classes:['ExplainJobs']}, {tag:'image-jobs-1',new_sqlite_classes:['ImageJobs']}, {tag:'file-jobs-1',new_sqlite_classes:['FileJobs']}, {tag:'animation-jobs-1',new_sqlite_classes:['AnimationJobs']}, {tag:'whiteboard-jobs-1',new_sqlite_classes:['WhiteboardJobs']}, {tag:'roadmap-jobs-1',new_sqlite_classes:['RoadmapJobs']}]);
  assert.deepEqual(dev.migrations.find(m => m.tag === 'animation-jobs-1'), { tag: 'animation-jobs-1', new_sqlite_classes: ['AnimationJobs'] }, 'the same tag as dev');
  // A migration tag is applied once per worker: every config's tags are unique, and image-jobs-1 adds only ImageJobs.
  for (const c of [app, dev]) assert.equal(new Set(c.migrations.map(m => m.tag)).size, c.migrations.length);
  // IMG-01 is public in production only (owner GO); the dev configs stay off; only the string 'true' accepts new jobs (image-jobs.js imageJobsEnabled).
  assert.equal(app.vars.IMAGE_GENERATE_ENABLED, 'true');
  assert.equal(dev.vars.IMAGE_GENERATE_ENABLED, 'false');
  // Owner-only acceptance window (owner 2026-10-25): the public flag is off; the hold is derived from the enabled combinations' priced estimates.
  assert.equal(app.vars.IMAGE_ACCEPTANCE_EMAILS, 'user@dda2350771a4066e3080c605ba092e0a.rabbithole.invalid yudhisteer.chin@gmail.com');
  assert.equal(dev.vars.IMAGE_ACCEPTANCE_EMAILS, undefined);
  assert.equal(dev.vars.IMAGE_GENERATE_RESERVED_USD, undefined);
  assert.equal(app.vars.IMAGE_GENERATE_RESERVED_USD, '0.20');
  const promptBytes = 4000; // the longest prompt the job accepts
  const wide = { IMAGE_GENERATE_RESERVED_USD: '9', IMAGE_MAX_CHARGE_USD_BY_MODEL: JSON.stringify(Object.fromEntries(Object.keys(IMAGE_MODELS).map(m => [m, 9]))) };
  const estimates = IMAGE_VALIDATED.map(r => imageQuote(wide, { model: r.model, quality: r.quality ?? undefined, aspect_ratio: r.aspect_ratio, resolution: r.resolution }, r.max_references, promptBytes)).filter(q => q.state === 'priced').map(q => q.estimateUsd);
  assert.ok(estimates.length >= 6, 'the enabled combinations are priced');
  assert.ok(Math.max(...estimates) <= Number(app.vars.IMAGE_GENERATE_RESERVED_USD), `the hold ${app.vars.IMAGE_GENERATE_RESERVED_USD} covers the largest estimate ${Math.max(...estimates)}`);
  assert.ok(Math.max(...estimates) >= 0.14, 'the derivation in the config comment (Pro 1K US$0.134 + prompt bound) is the maximum');
  // The hold is per model (image-providers.js reserveFor): every enabled row is quoted under its own model's hold, and no hold is below that model's largest estimate.
  const byModel = JSON.parse(app.vars.IMAGE_RESERVED_USD_BY_MODEL);
  assert.deepEqual(Object.keys(byModel).sort(), Object.keys(IMAGE_MODELS).sort(), 'every model has its own hold');
  for (const r of IMAGE_VALIDATED) {
    const q = imageQuote(app.vars, { model: r.model, quality: r.quality ?? undefined, aspect_ratio: r.aspect_ratio, resolution: r.resolution }, r.max_references, promptBytes);
    if (q.state === 'priced') assert.ok(q.estimateUsd <= byModel[r.model] && q.reserveUsd === byModel[r.model], `${r.model} ${r.operation}: hold ${byModel[r.model]} covers ${q.estimateUsd}`);
  }
  assert.ok(byModel['gemini-3-pro-image'] >= 0.3, 'Pro holds room for its unpublished thinking tokens: the shared 0.20 broke at about 480 of them');
  // The maximum charge per model (docs/features/image-jobs.md 6f): every enabled and priced row has estimate <= maximum <= hold, in dollars and in credits.
  const maxes = JSON.parse(app.vars.IMAGE_MAX_CHARGE_USD_BY_MODEL);
  assert.deepEqual(Object.keys(maxes).sort(), Object.keys(IMAGE_MODELS).sort(), 'every model has its own maximum charge');
  let pricedRows = 0;
  for (const r of IMAGE_VALIDATED) {
    const q = imageQuote(app.vars, { model: r.model, quality: r.quality ?? undefined, aspect_ratio: r.aspect_ratio, resolution: r.resolution }, r.max_references, promptBytes);
    assert.equal(q.state, 'priced', `${r.model} ${r.operation} is ready, so it must be priced (${q.reason})`);
    pricedRows += 1;
    assert.ok(q.estimateUsd <= q.maxUsd && q.maxUsd <= q.reserveUsd && q.maxUsd === maxes[r.model], `${r.model} ${r.operation}: ${q.estimateUsd} <= ${q.maxUsd} <= ${q.reserveUsd}`);
    assert.ok(q.estimate_credits <= q.max_credits && q.max_credits <= q.reserve_credits);
  }
  assert.equal(pricedRows, 8, 'every ready combination is priced: eight, Sunburst editing included');
  assert.equal(app.vars.EXPLAIN_V2_ENABLED, 'true'); // R1 switch-on (owner production GO, 2026-10-22)
  assert.equal(app.vars.EXPLAIN_PROGRAM_ENABLED, 'true'); // generated programs on (owner production GO, 2026-10-28)
  assert.equal(app.vars.EXPLAIN_PROGRAM_EXECUTION_KILL, 'false'); // the kill switch is present and off
  assert.equal(app.vars.EXPLAIN_PROGRAM_STATEFUL, 'true'); // stateful programs on with R3 (owner decision 2026-10-29)
  assert.equal('EXPLAIN_DIAGNOSTICS' in app.vars, false); // owner diagnostics are never configured in production
  assert.deepEqual(JSON.parse(app.vars.EXPLAIN_BRIEF_THRESHOLDS), { components: 12, credits: 400 });
  // dev-worker.js bundles its HTML from ./dist-dev, so the directory keeps that name.
  assert.equal(app.assets.directory, './dist-dev');
  // The one public origin (auth.js on feature/rabbit-hole-production-auth sends sign-in there).
  assert.equal(app.vars.PUBLIC_ORIGIN, 'https://digrabbithole.com');
});

// FILE_JOBS is plumbing for file conversion, Ctrl+K image edits and Ctrl+K JavaScript runs. Binding it enables none of them (the plumbing
// release); the activation release adds only the conversion vars below. Each other
// feature's own vars, secrets and (for JavaScript) the Dynamic Workers loader stay absent until that feature's own release.
// The loader is also absent on purpose: on an account without Workers Paid its deploy is refused (error 10195) and would block the release.
test('production binds FILE_JOBS and enables file conversion and Ctrl+K image edit, not JavaScript runs', () => {
  const app = config(APP);
  assert.deepEqual(app.durable_objects.bindings.filter(b => b.name === 'FILE_JOBS'), [{ name: 'FILE_JOBS', class_name: 'FileJobs' }]);
  assert.deepEqual(app.migrations.at(-4), { tag: 'file-jobs-1', new_sqlite_classes: ['FileJobs'] }, 'a new tag goes after every applied one');
  for (const name of ['FILE_JOB_CONCURRENCY',
    'INLINE_CODE_ENABLED', 'INLINE_CODE_MAX_RUNS', 'INLINE_CODE_MAX_MICROS', 'INLINE_CODE_RESERVE_MICROS']) assert.equal(app.vars[name], undefined, name);
  // Ctrl+K image edit is the one feature activated here (ctrlk-completion.md): its flag and hold are set; its OPENAI_API_KEY secret is never in the config.
  assert.deepEqual([app.vars.INLINE_IMAGE_EDIT_ENABLED, app.vars.INLINE_IMAGE_EDIT_RESERVED_USD], ['true', '0.03']);
  assert.equal(app.worker_loaders, undefined);
  // File conversion is the one feature enabled here (canvas-file-converter.md section 7); it names the production converter, never the dev one.
  assert.equal(app.vars.CONVERT_URL, 'https://rabbit-hole-convert-prod.fly.dev');
  assert.equal(app.vars.FILE_JOB_ORIGIN, 'https://digrabbithole.com');
  assert.doesNotMatch(JSON.stringify(app), /convert-dev/);
  for (const name of ['CONVERT_TOKEN', 'FILE_JOB_SECRET', 'INLINE_CODE_LOADER']) assert.ok(!JSON.stringify(app).includes(name), `${name} is a secret or a loader, never in the config`);
});

// Batch B6 shipped Image, File Converter and Ctrl+K without Motion (Motion is blocked on owner acceptance). A Motion release replaces this pin in the same change that flips one of these:
// the credit disclosure adds the signed maximum charge on the app Worker; the policy values commit (owner-approved 2026-10-27 for the owner-only validation window; public activation not approved) sets it to 500 credits (US$5.00);
// R2a (HELD, owner-only activation) turns the measured renderer config on the app Worker; R2b (HELD, the public flip) sets paused "0" and nothing else.
test('production Motion (R2b): public generation unpaused, the measured renderer config on the app Worker only, the disclosed maximum on the app Worker only', () => {
  const app = config(APP), cp = config(CP);
  assert.equal(app.vars.MOTION_GENERATION_PAUSED, '0');
  assert.deepEqual([app.vars.MOTION_ORCHESTRATOR_URL, app.vars.MOTION_JOB_RESERVATION_USD, app.vars.MOTION_ESTIMATE_USD],
    ['https://rabbit-hole-motion-orchestrator.fly.dev', '8.96', '1.00']);
  assert.equal(app.vars.MOTION_RENDERER_CONFIG, '03f2a1efc08e-1.5cpu-3gib-420s', 'MOTION_RENDERER_CONFIG on the app Worker');
  assert.equal(cp.vars?.MOTION_RENDERER_CONFIG, undefined, 'MOTION_RENDERER_CONFIG on the control plane Worker');
  assert.equal(app.vars.MOTION_MAX_CHARGE_USD, '5.00');
  assert.equal(cp.vars?.MOTION_MAX_CHARGE_USD, undefined, 'the control plane Worker has no maximum');
});

// /animation (owner production GO 2026-11-02): ANIMATION_JOBS and animation-jobs-1 on the app Worker, generation on, the execution kill
// switch present and off, diagnostics never. The rollback commits flip one pin below; the binding and the tag stay in every state.
test('production /animation: bound, on, kill switch off, no diagnostics; each rollback flip stops its part and keeps the objects', async () => {
  const { animationEnabled, animationExecution, animationRoute, ANIMATION_PROBE_PATH, ANIMATION_SEED_FIXTURE_PATH } = await import('../src/animation-job.js');
  const app = config(APP), cp = config(CP);
  assert.deepEqual(app.durable_objects.bindings.filter(b => b.class_name === 'AnimationJobs'), [{ name: 'ANIMATION_JOBS', class_name: 'AnimationJobs' }]);
  assert.deepEqual(app.migrations.at(-3), { tag: 'animation-jobs-1', new_sqlite_classes: ['AnimationJobs'] }, 'animation-jobs-1 is followed only by whiteboard-jobs-1 and roadmap-jobs-1');
  assert.equal(app.vars.ANIMATION_ENABLED, 'true');
  assert.equal(app.vars.ANIMATION_EXECUTION_KILL, 'false');
  assert.deepEqual(Object.keys(app.vars).filter(k => k.startsWith('ANIMATION_')).sort(), ['ANIMATION_ENABLED', 'ANIMATION_EXECUTION_KILL'], 'no ANIMATION_DIAGNOSTICS or other Animation var');
  assert.deepEqual(Object.keys(cp.vars).filter(k => k.startsWith('ANIMATION_')), [], 'the control plane Worker runs no /animation');
  // What each state does, read by the server's own switches. Fixture bindings stand in for the real ones (never reached on a refusal).
  const env = vars => ({ ...vars, ANIMATION_JOBS: { get: () => assert.fail('a refused request reached the job object') }, LEARN_DB: {} });
  const post = path => new Request(`https://digrabbithole.com${path}`, { method: 'POST', body: '{}' });
  const on = { ...app.vars, ANIMATION_ENABLED: 'true', ANIMATION_EXECUTION_KILL: 'false' };
  assert.deepEqual([animationEnabled(on), animationExecution(on).allowed], [true, true]);
  assert.equal((await animationRoute(ANIMATION_PROBE_PATH, post(ANIMATION_PROBE_PATH), env(on))).status, 404, 'the render probes stay off');
  assert.equal((await animationRoute(ANIMATION_SEED_FIXTURE_PATH, post(ANIMATION_SEED_FIXTURE_PATH), env(on))).status, 404, 'the offline fixture seeding stays off (owner 2026-11-02)');
  const off = { ...on, ANIMATION_ENABLED: 'false' };
  const refused = await animationRoute('/api/learn/animation/jobs', post('/api/learn/animation/jobs'), env(off));
  assert.deepEqual([refused.status, (await refused.json()).code], [404, 'animation_disabled'], 'rollback "off": no new plan or build starts');
  assert.equal(animationExecution(off).allowed, true, 'rollback "off" leaves the execution switch alone');
  assert.equal(animationExecution({ ...on, ANIMATION_EXECUTION_KILL: 'true' }).allowed, false, 'rollback "kill": saved cards stop running');
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

// The gate's local stacks run these configs through the provider-tripwire entries (e2e/tripwire-*-worker.js); wrangler refuses
// to start a worker whose config binds a Durable Object class its entry does not export (ExplainJobs, release/explain-found
// shard-1, 2026-10-22). Names come from the entry's `export { ... }` lines, following `export *`.
test('every Durable Object class a web config binds is exported by its entry and by that entry\'s tripwire entry', () => {
  const exported = url => raw(url).split('\n').flatMap(line => {
    const star = line.match(/^export \* from '(.+)'/), named = line.match(/^export \{([^}]+)\} from/);
    return star ? exported(new URL(star[1], url)) : named ? named[1].split(',').map(name => name.trim()) : [];
  });
  const web = new URL('../../web/', here);
  for (const name of ['wrangler.dev.jsonc', 'wrangler.parallel.jsonc', 'wrangler.rabbit-hole-prod.jsonc']) {
    const c = config(new URL(name, web)), classes = c.durable_objects.bindings.map(b => b.class_name);
    for (const entry of [c.main, `e2e/tripwire-${c.main}`, ...(c.main === 'dev-worker.js' ? ['e2e/explain-gate-stub-worker.js', 'dev-access-worker.js'] : [])]) {
      const names = exported(new URL(entry, web));
      for (const cls of classes) assert.ok(names.includes(cls), `${entry} does not export ${cls}, which ${name} binds`);
    }
  }
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

test('production email (sign-in, invitations, feedback) goes out as Rabbit Hole <hello@digrabbithole.com>, from the control plane only', () => {
  assert.equal(config(CP).vars.EMAIL_FROM, 'Rabbit Hole <hello@digrabbithole.com>');
  assert.equal(config(APP).vars.EMAIL_FROM, undefined);
});

// /whiteboard (roadmap W0, binding commit): WHITEBOARD_JOBS and whiteboard-jobs-1 on the app Worker, the feature OFF, the renderer URL the
// whiteboard's own Fly app (never Motion's). W0 shipped it OFF; the W1 release flips WHITEBOARD_ENABLED (owner decision 5 Nov 2026).
test('production /whiteboard: bound, on (W1), its own renderer, no secret in the file; dev points at the same renderer', () => {
  const app = config(APP), dev = config('../../web/wrangler.dev.jsonc'), cp = config(CP);
  assert.deepEqual(app.durable_objects.bindings.filter(b => b.class_name === 'WhiteboardJobs'), [{ name: 'WHITEBOARD_JOBS', class_name: 'WhiteboardJobs' }]);
  assert.deepEqual(app.migrations.at(-2), { tag: 'whiteboard-jobs-1', new_sqlite_classes: ['WhiteboardJobs'] });
  assert.deepEqual(dev.migrations.at(-2), { tag: 'whiteboard-jobs-1', new_sqlite_classes: ['WhiteboardJobs'] }, 'the same tag as dev');
  assert.deepEqual(Object.keys(app.vars).filter(k => k.startsWith('WHITEBOARD_')).sort(), ['WHITEBOARD_ENABLED', 'WHITEBOARD_RENDERER_URL'], 'no WHITEBOARD_ESTIMATE_USD and no token');
  assert.equal(app.vars.WHITEBOARD_ENABLED, 'true');
  assert.equal(dev.vars.WHITEBOARD_ENABLED, 'true');
  assert.equal(app.vars.WHITEBOARD_RENDERER_URL, 'https://rabbit-hole-whiteboard-renderer.fly.dev');
  assert.equal(dev.vars.WHITEBOARD_RENDERER_URL, app.vars.WHITEBOARD_RENDERER_URL, 'W-D9: dev clones use the whiteboard renderer, there is no dev renderer');
  assert.notEqual(app.vars.WHITEBOARD_RENDERER_URL, app.vars.MOTION_ORCHESTRATOR_URL);
  assert.deepEqual(Object.keys(cp.vars).filter(k => k.startsWith('WHITEBOARD_')), [], 'the control plane Worker runs no /whiteboard');
});

// Tutor R4 roadmap (docs/features/explain-on-canvas): ROADMAP_JOBS and roadmap-jobs-1 are bound last on the app Worker, dev and the parallel clone configs, and the feature is
// ON in production only (owner's production GO, candidate 65; ROADMAP_AUTO_ENABLED, candidate 76): ROADMAP_ENABLED and ROADMAP_AUTO_ENABLED are exactly 'true' on the app Worker; dev, the parallel clone config and the control plane leave it unset (a dev clone qualifies separately).
test('production roadmap: ROADMAP_JOBS bound last with roadmap-jobs-1, ROADMAP_ENABLED and ROADMAP_AUTO_ENABLED exactly true in production and unset in dev, parallel and the control plane', () => {
  const app = config(APP), dev = config('../../web/wrangler.dev.jsonc'), parallel = config('../../web/wrangler.parallel.jsonc'), cp = config(CP);
  for (const [name, c] of [['app', app], ['dev', dev], ['parallel', parallel]]) {
    assert.deepEqual(c.durable_objects.bindings.filter(b => b.class_name === 'RoadmapJobs'), [{ name: 'ROADMAP_JOBS', class_name: 'RoadmapJobs' }], name);
    assert.deepEqual(c.migrations.at(-1), { tag: 'roadmap-jobs-1', new_sqlite_classes: ['RoadmapJobs'] }, `${name}: a new tag goes after every applied one`);
  }
  assert.equal(app.vars?.ROADMAP_ENABLED, 'true', 'production: the owner GO turns the roadmap on, as the exact string true');
  for (const [name, c] of [['dev', dev], ['parallel', parallel]]) assert.equal(c.vars?.ROADMAP_ENABLED, undefined, `${name}: stays unset, a dev clone qualifies separately`);
  assert.equal(cp.vars?.ROADMAP_ENABLED, undefined);
  assert.equal(app.vars?.ROADMAP_AUTO_ENABLED, 'true', 'production: the automatic next-step suggestion is on, as the exact string true');
  for (const [name, c] of [['dev', dev], ['parallel', parallel], ['control plane', cp]]) assert.equal(c.vars?.ROADMAP_AUTO_ENABLED, undefined, `${name}: stays unset`);
  // Release 91 (owner 2026-11-06): R5 proposal editing and R7a long Markdown are on in production, as the exact string true.
  for (const flag of ['ROADMAP_EDIT_ENABLED', 'ROADMAP_LONG_MARKDOWN_ENABLED']) {
    assert.equal(app.vars?.[flag], 'true', `production: ${flag} is on`);
    for (const [name, c] of [['dev', dev], ['parallel', parallel], ['control plane', cp]]) assert.equal(c.vars?.[flag], undefined, `${name}: ${flag} stays unset`);
  }
  assert.equal(new Set(app.migrations.map(m => m.tag)).size, app.migrations.length, 'every tag is unique');
});
