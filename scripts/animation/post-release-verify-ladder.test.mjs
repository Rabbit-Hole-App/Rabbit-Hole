// Tests for post-release-verify-ladder.mjs against FAKE origins (an in-memory site and an in-memory Cloudflare): no network, no credential.
//   node --test scripts/animation/post-release-verify-ladder.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { exitCode, parseArgs, reclassifyBase, summary, verifyLadder } from './post-release-verify-ladder.mjs';

const SHA = 'c'.repeat(40);
const FIVE = '["curve_radius","action_motion","surface_grid","trail_points","text_readout","arrow_anchor","clamp"]';
const TWO = '["curve_radius","action_motion"]';
// A fake production site: /explore names an entry chunk that reaches the Animation card chunk and the capabilities chunk.
function site({ features = FIVE, copy = 'Works best for mechanisms, loops, small games and loss surfaces.', jobs = 401, results = 401, open = [] } = {}) {
  const files = {
    '/explore': '<script type="module" src="/static/index-1.js"></script>',
    '/static/index-1.js': 'import("./Animation3DCard-2.js");import("./caps-3.js");',
    '/static/Animation3DCard-2.js': `export default 1;const copy=${JSON.stringify(copy)};`,
    '/static/caps-3.js': `export const F=${features};`,
  };
  const status = path => (path.startsWith('/api/learn/animation/jobs/results/') ? results : path.startsWith('/api/learn/animation/jobs') ? jobs : open.includes(path.split('/').pop()) ? 200 : 404);
  return { read: async p => files[p] ?? null, fetch: async url => ({ status: status(new URL(url).pathname) }) };
}
const base = (status = 'PASS') => [{ item: '1 served commit rabbit-hole-app', status, detail: `serves ${SHA.slice(0, 12)} as one version (v1)` }, { item: '1 served commit rabbit-hole-cp', status, detail: `serves ${SHA.slice(0, 12)} as one version (v2)` }];
const cfWith = bindings => async () => ({ bindings });
const run = (slice, s, extra = {}) => verifyLadder({ slice, sha: SHA, origin: 'https://digrabbithole.com', fetch: s.fetch, read: s.read, baseResults: base(), ...extra });
const find = (results, item) => results.find(r => r.item === item);

test('mvp3 on a healthy production: every item PASS, base items kept and prefixed, exit 0', async () => {
  const r = await run('mvp3', site());
  assert.equal(exitCode(r), 0, summary(r));
  assert.equal(find(r, 'served commit').status, 'PASS');
  assert.ok(r.some(x => x.item === 'base 1 served commit rabbit-hole-app'));
  assert.match(find(r, 'five client features declared').detail, /declared in \/static\/caps-3\.js/);
});

test('the five features missing from the served bundle fail mvp3, mvp4 and mvp5 (a stale build is serving)', async () => {
  for (const slice of ['mvp3', 'mvp4', 'mvp5']) {
    const r = await run(slice, site({ features: TWO }), { canaryText: 'weekly SGD, two failures in a row' });
    assert.equal(find(r, 'five client features declared').status, 'FAIL', slice);
    assert.equal(exitCode(r), 1);
  }
  assert.ok(!(await run('mvp2b', site({ features: TWO }), { cf: cfWith([]) })).some(x => x.item === 'five client features declared'), 'mvp2b does not judge the five');
});

test('signed-out matrix: a disabled feature (404), a 5xx, or an open diagnostics path fails; state off wants 404', async () => {
  let r = await run('mvp3', site({ jobs: 404 }));
  assert.match(find(r, 'signed-out jobs route').detail, /404 means ANIMATION_ENABLED is off/); assert.equal(find(r, 'signed-out jobs route').status, 'FAIL');
  r = await run('mvp3', site({ results: 502 }));
  assert.equal(find(r, 'signed-out results route').status, 'FAIL');
  r = await run('mvp3', site({ open: ['seed-fixture'] }));
  assert.match(find(r, 'diagnostics closed').detail, /seed-fixture -> 200/);
  r = await run('mvp3', site({ jobs: 404, results: 404 }), { state: 'off' });
  assert.equal(find(r, 'signed-out jobs route').status, 'PASS'); assert.equal(find(r, 'signed-out results route').status, 'PASS');
});

test('without Cloudflare credentials the served commit is UNKNOWN, never PASS, and the exit is nonzero', async () => {
  const r = await run('mvp3', site(), { baseResults: null });
  assert.equal(find(r, 'served commit').status, 'UNKNOWN'); assert.equal(exitCode(r), 1);
  assert.equal((await run('mvp3', site(), { baseResults: base('FAIL') })).find(x => x.item === 'served commit').status, 'FAIL');
});

test('mvp2b: ANIMATION_STREAMING unset or "true" passes a normal release; "false" fails it; --recovered wants "false"', async () => {
  const flag = text => [{ name: 'ANIMATION_STREAMING', type: 'plain_text', text }];
  assert.equal(find(await run('mvp2b', site(), { cf: cfWith([]) }), 'mvp2b streaming flag').status, 'PASS');
  assert.equal(find(await run('mvp2b', site(), { cf: cfWith(flag('true')) }), 'mvp2b streaming flag').status, 'PASS');
  assert.equal(find(await run('mvp2b', site(), { cf: cfWith(flag('false')) }), 'mvp2b streaming flag').status, 'FAIL');
  assert.equal(find(await run('mvp2b', site(), { cf: cfWith(flag('false')), recovered: true }), 'mvp2b streaming flag').status, 'PASS');
  assert.equal(find(await run('mvp2b', site(), { cf: cfWith([]), recovered: true }), 'mvp2b streaming flag').status, 'FAIL');
  assert.equal(find(await run('mvp2b', site(), { cf: cfWith([{ name: 'ANIMATION_STREAMING', type: 'secret_text' }]) }), 'mvp2b streaming flag').status, 'FAIL');
  assert.equal(find(await run('mvp2b', site(), { cf: null }), 'mvp2b streaming flag').status, 'UNKNOWN');
  assert.equal(find(await run('mvp2b', site(), { cf: async () => { throw new Error('GET settings: HTTP 403'); } }), 'mvp2b streaming flag').status, 'UNKNOWN');
});

test('the base "2 app flags" failure that is only about ANIMATION_STREAMING is let through; any other complaint stays a FAIL', () => {
  const only = [{ item: '2 app flags', status: 'FAIL', detail: 'ANIMATION_STREAMING is set (plain_text)' }];
  assert.equal(reclassifyBase(only)[0].status, 'PASS');
  const mixed = [{ item: '2 app flags', status: 'FAIL', detail: 'ANIMATION_STREAMING is set (plain_text); ANIMATION_DIAGNOSTICS is set (plain_text)' }];
  assert.equal(reclassifyBase(mixed)[0].status, 'FAIL');
  const other = [{ item: '1 served commit x', status: 'FAIL', detail: 'ANIMATION_STREAMING is set' }];
  assert.equal(reclassifyBase(other)[0].status, 'FAIL', 'only item 2 is reclassified');
});

test('mvp5: the stale copy anywhere fails, a clean bundle that names loss surfaces passes, --recovered wants the line back', async () => {
  const canary = 'Weekly canary: one full SGD job on production; two failures in a row reopen the ladder.';
  const stale = 'Works best for mechanisms; loss surfaces and optimizers are not supported yet.';
  let r = await run('mvp5', site({ copy: stale }), { canaryText: canary });
  assert.equal(find(r, 'request-box copy').status, 'FAIL'); assert.match(find(r, 'request-box copy').detail, /still says it/);
  r = await run('mvp5', site(), { canaryText: canary });
  assert.equal(find(r, 'request-box copy').status, 'PASS'); assert.equal(exitCode(r), 0, summary(r));
  r = await run('mvp5', site({ copy: 'Works best for mechanisms and small games.' }), { canaryText: canary });
  assert.match(find(r, 'request-box copy').detail, /no chunk names loss surfaces as supported/); assert.equal(find(r, 'request-box copy').status, 'FAIL');
  r = await run('mvp5', site({ copy: stale }), { recovered: true });
  assert.equal(find(r, 'request-box copy').status, 'PASS');
  r = await run('mvp5', site(), { recovered: true });
  assert.equal(find(r, 'request-box copy').status, 'FAIL');
});

test('mvp5 canary description: missing text is UNKNOWN, a description that omits a rule fails, a complete one passes', async () => {
  assert.equal(find(await run('mvp5', site()), 'canary description').status, 'UNKNOWN');
  const r = await run('mvp5', site(), { canaryText: 'Runs weekly. Posts the result.' });
  assert.match(find(r, 'canary description').detail, /SGD, two failures in a row reopen/); assert.equal(find(r, 'canary description').status, 'FAIL');
  assert.equal(find(await run('mvp5', site(), { canaryText: 'Every week run one SGD job; two consecutive failures reopen the ladder UUID.' }), 'canary description').status, 'PASS');
});

test('arguments: a slice and a full sha are required; defaults point at production and the base verifier directory', () => {
  assert.throws(() => parseArgs(['--sha', SHA]), /--slice/);
  assert.throws(() => parseArgs(['--slice', 'mvp3', '--sha', 'abc']), /40-character/);
  assert.throws(() => parseArgs(['--slice', 'mvp3', '--sha', SHA, '--state', 'x']), /--state/);
  assert.throws(() => parseArgs(['--slice', 'mvp3', '--sha', SHA, '--post']), /unknown argument/);
  const o = parseArgs(['--slice', 'mvp5', '--sha', SHA, '--recovered', '--no-base', '--canary-file', 'c.txt']);
  assert.deepEqual([o.origin, o.baseDir, o.recovered, o.noBase, o.canaryFile], ['https://digrabbithole.com', 'C:/s/spec/animation/release', true, true, 'c.txt']);
});

test('combined (one release carries all four): streaming, the five features, the request-box copy and the canary are all judged; a healthy production passes', async () => {
  const canary = 'Weekly canary: one full SGD job; two failures in a row reopen the ladder.';
  const r = await run('combined', site(), { cf: cfWith([]), canaryText: canary });
  assert.equal(exitCode(r), 0, summary(r));
  for (const item of ['mvp2b streaming flag', 'five client features declared', 'request-box copy', 'canary description', 'served commit', 'signed-out jobs route', 'diagnostics closed']) assert.equal(find(r, item)?.status, 'PASS', item);
});

test('combined: a missing part fails the whole run (streaming off by mistake, the five undeclared, the old copy still served, no credentials for the flag)', async () => {
  const flag = text => [{ name: 'ANIMATION_STREAMING', type: 'plain_text', text }];
  const canary = 'Weekly canary: one full SGD job; two failures in a row reopen the ladder.';
  assert.equal(find(await run('combined', site(), { cf: cfWith(flag('false')), canaryText: canary }), 'mvp2b streaming flag').status, 'FAIL');
  assert.equal(find(await run('combined', site({ features: TWO }), { cf: cfWith([]), canaryText: canary }), 'five client features declared').status, 'FAIL');
  assert.equal(find(await run('combined', site({ copy: 'Loss surfaces and optimizers are not supported yet.' }), { cf: cfWith([]), canaryText: canary }), 'request-box copy').status, 'FAIL');
  const noCreds = await run('combined', site(), { cf: null, canaryText: canary });
  assert.equal(find(noCreds, 'mvp2b streaming flag').status, 'UNKNOWN'); assert.equal(exitCode(noCreds), 1);
});

test('combined --recovered: streaming false, the five still declared (the filter is server side), the not-supported line back', async () => {
  const flag = text => [{ name: 'ANIMATION_STREAMING', type: 'plain_text', text }];
  const stale = 'Works best for mechanisms; loss surfaces and optimizers are not supported yet.';
  const r = await run('combined', site({ copy: stale }), { cf: cfWith(flag('false')), recovered: true });
  assert.equal(exitCode(r), 0, summary(r));
  assert.match(find(r, 'five client features declared').detail, /leaves the browser declaring them|declared in/);
  assert.equal((await run('combined', site(), { cf: cfWith(flag('false')), recovered: true })).find(x => x.item === 'request-box copy').status, 'FAIL', 'a recovery that left the claim in is not recovered');
});
