// Refusal paths of the production release job (docs/features/prod-release.md). No network, no build.
//   node --test scripts/prod-release.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOLD, NEVER_ON_PRODUCTION, allowedMvpSha, checkPrepare, checkRelease, greenDevDeploy, schemaBlockers, servedRelease, checkCandidate, smoke, smokeOnce, SMOKE_ORIGIN, parseArgs, hashDirs, BUILD_ENV, DEV_ONLY_ENV } from './prod-release.mjs';
import { expectedSchema, SOURCES } from './schema-check.mjs';
import { greenDev } from './dev-deploy-gate.mjs';
import { REQUIRED, makeRecord, mvpSummary } from './mvp-fast-path.mjs';

const SHA = '42f5a4f065d4a1df1b47e2f150893b83d7befe3b';
const OTHER = 'b0ee85f3' + '0'.repeat(32);
const TREES = { [SHA]: 'e'.repeat(40), [OTHER]: 'f'.repeat(40), ['c'.repeat(40)]: 'd'.repeat(40) };
const treeOf = s => TREES[s] ?? null;
// A dev-deploy line with full provenance (r34 audit): tree, gate digest, build, bundle, run, version.
const row = o => ({ tree: treeOf(o.sha), gate_digest: '0123456789abcdef', build: 'b1', bundle: 'w1', run: '37971669845.1', version: 'c9c9cf3d', ...o });
const GREEN = `${JSON.stringify(row({ sha: SHA, gates: 'pass', smoke: 'pass', worker: 'rabbit-hole-web-dev-small-parallel' }))}\n`;
// verify-evidence.mjs runs output: the newest fast-e2e and verify runs of SHA, both completed successes (OPS-04).
const FAST = '.github/workflows/fast-e2e.yml', VERIFY = '.github/workflows/verify.yml';
const ciRun = (path, o = {}) => ({ id: 39719683140, run_attempt: 1, path, head_sha: SHA, event: 'push', status: 'completed', conclusion: 'success', html_url: 'https://github.com/x', run_started_at: '2026-10-22T03:57:33Z', ...o });
const RUNS = { sha: SHA, runs: { [FAST]: [ciRun(FAST)], [VERIFY]: [ciRun(VERIFY)] } };
const ok = { sha: SHA, onMain: true, devRecord: GREEN, runs: RUNS, head: SHA, clean: true, treeOf };
const released = { hold: false, sha: SHA, build: 'abc123', approve: `RELEASE ${SHA} abc123`, prepared: { sha: SHA, build: 'abc123' }, head: SHA, clean: true };

test('the production hold is lifted (owner, 2026-10-09), and the hold is a reviewed code line, never a flag', () => {
  assert.equal(HOLD, false);
  assert.match(readFileSync(new URL('./prod-release.mjs', import.meta.url), 'utf8'), /^export const HOLD = false;$/m);
  assert.match(checkRelease({ ...released, hold: true }), /^HOLD/, 'set again, it refuses first');
});

test('with the hold lifted, release still refuses an unprepared commit before any remote call', () => {
  const script = fileURLToPath(new URL('./prod-release.mjs', import.meta.url));
  // An empty environment: no Cloudflare credential exists, so a remote call could not succeed even by accident.
  const r = (() => { try { execFileSync(process.execPath, [script, 'release', '--sha', SHA, '--build', 'abc123', '--approve', `RELEASE ${SHA} abc123`], { env: {}, encoding: 'utf8', stdio: 'pipe' }); return { status: 0 }; } catch (e) { return e; } })();
  assert.equal(r.status, 1);
  assert.match(r.stderr, /never prepared/);
});

test('prepare refuses a wrong or short sha', () => {
  assert.match(checkPrepare({ ...ok, sha: '42f5a4f0' }), /full 40-character/);
  assert.match(checkPrepare({ ...ok, sha: undefined }), /full 40-character/);
  assert.match(checkPrepare({ ...ok, onMain: false }), /not on origin\/main/);
});

test('prepare refuses a sha without a green dev deployment', () => {
  assert.match(checkPrepare({ ...ok, devRecord: '' }), /no green dev deployment/);
  assert.match(checkPrepare({ ...ok, devRecord: JSON.stringify(row({ sha: SHA, gates: 'pass', smoke: 'fail' })) }), /no green dev deployment/);
  assert.match(checkPrepare({ ...ok, devRecord: JSON.stringify(row({ sha: OTHER, gates: 'pass', smoke: 'pass' })) }), /no green dev deployment/);
  assert.equal(greenDevDeploy(SHA, `not json\n${GREEN}`, { treeOf }).sha, SHA);
});

test('r34 audit: a green line without full provenance, or for another tree, never releases', () => {
  // The r33 record (7198b971, 2026-10-09) had no tree, gate digest or run: under this rule it would be refused.
  const r33 = { sha: SHA, gates: 'pass', build: '2cb1d5c1f9f7', bundle: 'fbe9f052d2c0', smoke: 'pass', worker: 'rabbit-hole-web-dev-small-parallel', version: '9fecbdfa', at: '2026-10-09T18:09:16Z' };
  assert.equal(greenDevDeploy(SHA, `${JSON.stringify(r33)}\n`, { treeOf }), null);
  for (const k of ['tree', 'gate_digest', 'build', 'bundle', 'run', 'version']) {
    const { [k]: _, ...partial } = row({ sha: SHA, gates: 'pass', smoke: 'pass' });
    assert.equal(greenDevDeploy(SHA, `${JSON.stringify(partial)}\n`, { treeOf }), null, `without ${k}`);
  }
  assert.equal(greenDevDeploy(SHA, `${JSON.stringify(row({ sha: SHA, gates: 'pass', smoke: 'pass', tree: 'a'.repeat(40) }))}\n`, { treeOf }), null, 'a tree that is not this commit\'s');
  assert.equal(greenDevDeploy(SHA, GREEN), null, 'the tree is never taken on trust');
});

test('a reused-gate dev deploy releases only with its base G green on a full gate, the same build and bundle, and G an ancestor', () => {
  // Owner, 2026-10-09 (option a): script-only changes reuse a gate and may still release.
  const G = 'c'.repeat(40), line = o => `${JSON.stringify(row(o))}\n`;
  const gRow = { sha: G, gates: 'pass', smoke: 'pass', build: 'b1', bundle: 'w1' };
  const reused = { sha: SHA, gates: 'reused', app_gate_sha: G, smoke: 'pass', build: 'b1', bundle: 'w1' };
  const yes = () => true, no = () => false;
  assert.equal(greenDevDeploy(SHA, line(gRow) + line(reused), { isAncestor: yes, treeOf }).app_gate_sha, G);
  assert.equal(checkPrepare({ ...ok, devRecord: line(gRow) + line(reused), isAncestor: yes }), null);
  const refused = [
    ['G not in the record', line(reused), yes],
    ['G itself reused', line({ ...gRow, gates: 'reused' }) + line(reused), yes],
    ['G smoke failed', line({ ...gRow, smoke: 'fail' }) + line(reused), yes],
    ['this smoke failed', line(gRow) + line({ ...reused, smoke: 'fail' }), yes],
    ['another page build', line(gRow) + line({ ...reused, build: 'b2' }), yes],
    ['another Worker bundle', line(gRow) + line({ ...reused, bundle: 'w2' }), yes],
    ['no bundle recorded', line({ ...gRow, bundle: null }) + line({ ...reused, bundle: null }), yes],
    ['G without provenance', `${JSON.stringify({ ...gRow, version: 'x' })}\n` + line(reused), yes],
    ['G not an ancestor', line(gRow) + line(reused), no],
    ['ancestry never checked', line(gRow) + line(reused), undefined],
  ];
  for (const [why, record, isAncestor] of refused) assert.equal(greenDevDeploy(SHA, record, { isAncestor, treeOf }), null, why);
});

test('UI only (owner, 2026-10-21): a reused deploy with another build releases only when the diff since G is UI-only', () => {
  const G = 'c'.repeat(40), line = o => `${JSON.stringify(row(o))}\n`;
  const record = line({ sha: G, gates: 'pass', smoke: 'pass', build: 'b1', bundle: 'w1' }) + line({ sha: SHA, gates: 'reused', app_gate_sha: G, smoke: 'pass', build: 'b2', bundle: 'w2' });
  const yes = () => true;
  assert.equal(greenDevDeploy(SHA, record, { isAncestor: yes, treeOf, uiOnly: (g, s) => g === G && s === SHA }).app_gate_sha, G);
  assert.equal(checkPrepare({ ...ok, devRecord: record, isAncestor: yes, uiOnly: yes }), null);
  assert.equal(greenDevDeploy(SHA, record, { isAncestor: yes, treeOf }), null, 'uiOnly defaults to no');
  assert.equal(greenDevDeploy(SHA, record, { isAncestor: yes, treeOf, uiOnly: () => false }), null, 'a diff with server, config or lockfile changes');
  assert.equal(greenDevDeploy(SHA, record, { isAncestor: () => false, treeOf, uiOnly: yes }), null, 'G must still be an ancestor');
  assert.notEqual(record.replace('"app_gate_sha":"' + G + '","smoke":"pass"', 'x'), record);
  assert.equal(greenDevDeploy(SHA, record.replace('"app_gate_sha":"' + G + '","smoke":"pass"', '"app_gate_sha":"' + G + '","smoke":"fail"'), { isAncestor: yes, treeOf, uiOnly: yes }), null, 'its own smoke must pass');
});

test('OPS-04: a green dev deploy, fully gated or on a green ancestor gate (UI only), never releases without a successful fast-e2e and verify run of the exact sha', () => {
  // UI-17 14310051 (2026-10-21) released on batch F's gate while its own fast-e2e run 39719683140 had failed.
  const G = 'c'.repeat(40), line = o => `${JSON.stringify(row(o))}\n`, yes = () => true;
  const reusedRecord = line({ sha: G, gates: 'pass', smoke: 'pass', build: 'b1', bundle: 'w1' }) + line({ sha: SHA, gates: 'reused', app_gate_sha: G, smoke: 'pass', build: 'b2', bundle: 'w2' });
  const records = [['full gate', { devRecord: GREEN }], ['UI-only reuse of a green ancestor gate', { devRecord: reusedRecord, isAncestor: yes, uiOnly: yes }]];
  const bad = [
    ['failed', { [FAST]: [ciRun(FAST, { conclusion: 'failure' })] }, /fast-e2e run 39719683140\.1 of 42f5a4f0 is completed\/failure/],
    ['in progress', { [FAST]: [ciRun(FAST, { status: 'in_progress', conclusion: null })] }, /fast-e2e run .* is in_progress\/null/],
    ['queued', { [FAST]: [ciRun(FAST, { status: 'queued', conclusion: null })] }, /is queued\/null/],
    ['cancelled', { [FAST]: [ciRun(FAST, { conclusion: 'cancelled' })] }, /is completed\/cancelled/],
    ['missing', { [FAST]: [] }, /no fast-e2e run of 42f5a4f0/],
    ['wrong sha', { [FAST]: [ciRun(FAST, { head_sha: G })] }, /no fast-e2e run of 42f5a4f0 \(the runs read are of cccccccc\)/],
    ['a newer attempt failed', { [FAST]: [ciRun(FAST), ciRun(FAST, { id: 2, run_attempt: 2, conclusion: 'failure', run_started_at: '2026-10-22T05:00:00Z' })] }, /run 2\.2 .* completed\/failure/],
    ['verify failed', { [VERIFY]: [ciRun(VERIFY, { conclusion: 'failure' })] }, /verify run .* completed\/failure/],
    ['verify missing', { [VERIFY]: [] }, /no verify run of 42f5a4f0/],
  ];
  for (const [kind, record] of records) {
    assert.equal(checkPrepare({ ...ok, ...record }), null, `${kind} with good runs releases`);
    assert.match(checkPrepare({ ...ok, ...record, runs: null }), /no CI run evidence/, `${kind}, runs never read`);
    for (const [state, runs, why] of bad) {
      const err = checkPrepare({ ...ok, ...record, runs: { sha: SHA, runs: { ...RUNS.runs, ...runs } } });
      assert.match(err, /^refused: 42f5a4f0\S+ needs a successful fast-e2e and verify run of this exact commit; a gate, its own or reused, never stands in for them:\n- /, `${kind} + ${state}`);
      assert.match(err, why, `${kind} + ${state}`);
    }
  }
  const after = { [FAST]: [ciRun(FAST, { conclusion: 'failure' }), ciRun(FAST, { id: 2, run_attempt: 2, run_started_at: '2026-10-22T05:00:00Z' })] };
  assert.equal(checkPrepare({ ...ok, runs: { sha: SHA, runs: { ...RUNS.runs, ...after } } }), null, 'a newer passing attempt of the same sha clears a failed one');
});

test('prepare refuses another checkout or a dirty tree, and passes the exact green commit', () => {
  assert.match(checkPrepare({ ...ok, head: OTHER }), /HEAD is/);
  assert.match(checkPrepare({ ...ok, clean: false }), /tracked tree has changes/);
  assert.equal(checkPrepare(ok), null);
});

test('release refuses an approval that does not name the exact sha and build', () => {
  assert.match(checkRelease({ ...released, approve: 'RELEASE' }), /--approve must be exactly/);
  assert.match(checkRelease({ ...released, approve: `RELEASE ${OTHER} abc123` }), /--approve must be exactly/);
  assert.match(checkRelease({ ...released, approve: `RELEASE ${SHA} abc124` }), /--approve must be exactly/);
  assert.match(checkRelease({ ...released, sha: '42f5a4f0', approve: 'RELEASE 42f5a4f0 abc123' }), /full 40-character/);
});

test('release refuses an unprepared sha or a different prepared build', () => {
  assert.match(checkRelease({ ...released, prepared: null }), /never prepared/);
  assert.match(checkRelease({ ...released, prepared: { sha: SHA, build: 'zzz999' } }), /prepared build/);
  assert.match(checkRelease({ ...released, head: OTHER }), /HEAD is/);
  assert.match(checkRelease({ ...released, clean: false }), /tracked tree/);
  assert.equal(checkRelease(released), null);
});

test('the schema preflight needs the complete schema and the exact migration list, never the first table', () => {
  const expected = { main: expectedSchema('main'), learn: expectedSchema('learn') };
  const mainFiles = SOURCES.main().filter(f => f.startsWith('migrations/')).map(f => f.slice('migrations/'.length));
  const ready = { mainFiles, mainApplied: mainFiles, mainLive: { ...expected.main }, learnLive: { ...expected.learn }, expected };
  assert.deepEqual(schemaBlockers(ready), []);
  // 0011 half applied: canvas_members (its first table) exists, a later Comments index does not. The old check passed this.
  const { ['index:canvas_comments_thread']: _, ...half } = expected.learn;
  const b = schemaBlockers({ ...ready, learnLive: half });
  assert.deepEqual(b.slice(0, -1), ['rabbit-hole-learn-prod schema: missing index:canvas_comments_thread']);
  assert.match(b.at(-1), /owner's GO; this job never applies one/);
  assert.match(schemaBlockers({ ...ready, mainApplied: mainFiles.slice(0, -1) })[0], new RegExp(`rabbit-hole-prod migrations: not applied ${mainFiles.at(-1)}`));
  assert.match(schemaBlockers({ ...ready, mainLive: { ...expected.main, 'index:by_hand': 'x' } })[0], /unexpected index:by_hand/);
});

test('what production serves: one version at 100% and its release, read through a secret-change deployment', () => {
  const dep = (v, message, extra = {}) => ({ versions: [{ version_id: v, percentage: 100 }], annotations: { 'workers/message': message, ...extra } });
  assert.deepEqual(servedRelease([dep('v2', 'release 431f0124e683 build c7089914a2a5674a')]), { version: 'v2', sha12: '431f0124e683' });
  assert.deepEqual(servedRelease([dep('v3', undefined, { 'workers/triggered_by': 'secret' }), dep('v2', 'release 431f0124e683 build c7')]), { version: 'v3', sha12: '431f0124e683' });
  assert.deepEqual(servedRelease([dep('v4', 'manual'), dep('v2', 'release 431f0124e683 build c7')]), { version: 'v4', sha12: null }, 'a hand deploy is not read through');
  assert.deepEqual(servedRelease([dep('v5', 'rollback to release 7198b9718d38: smoke failed')]), { version: 'v5', sha12: '7198b9718d38' });
  assert.match(servedRelease([{ versions: [{ version_id: 'a', percentage: 50 }, { version_id: 'b', percentage: 50 }] }]).error, /split rollout/);
  assert.match(servedRelease([]).error, /no deployment/);
});

test('r34 audit: a stale or backwards candidate, or a split production, is refused; the same release is a no-op', () => {
  const pair = sha12 => ({ cp: { version: 'c', sha12 }, app: { version: 'a', sha12 } });
  const anc = (a, b) => b === SHA && OTHER.startsWith(a);
  assert.equal(checkCandidate({ sha: SHA, mainTip: SHA, ...pair(OTHER.slice(0, 12)), isAncestor: anc }), null);
  assert.match(checkCandidate({ sha: SHA, mainTip: SHA, ...pair(null), isAncestor: anc }), /no release named/, 'a hand-deployed pair is never overwritten blind');
  assert.match(checkCandidate({ sha: SHA, mainTip: OTHER, ...pair(OTHER.slice(0, 12)), isAncestor: anc }), /is stale: origin\/main is now b0ee85f30000/);
  assert.match(checkCandidate({ sha: SHA, mainTip: SHA, ...pair('ffffffffffff'), isAncestor: anc }), /never release backwards/);
  assert.match(checkCandidate({ sha: SHA, mainTip: SHA, cp: { version: 'c', sha12: OTHER.slice(0, 12) }, app: { version: 'a', sha12: 'ffffffffffff' }, isAncestor: anc }), /production is split/);
  assert.match(checkCandidate({ sha: SHA, mainTip: SHA, cp: { error: 'a split rollout' }, app: { version: 'a', sha12: null }, isAncestor: anc }), /rabbit-hole-cp: a split rollout/);
  assert.deepEqual(checkCandidate({ sha: SHA, mainTip: SHA, ...pair(SHA.slice(0, 12)), isAncestor: anc }), { noop: '42f5a4f065d4 is already released' });
  // Animation tube scenes (owner 2026-11-02): a release that stops declaring a client feature production's build declares is refused, so a stored
  // tube scene is never left to a server or client that cannot read it. The features each tree declares are read per sha (clientFeatures).
  const tubes = { [OTHER.slice(0, 12)]: ['curve_radius'], [SHA]: ['curve_radius'] };
  assert.equal(checkCandidate({ sha: SHA, mainTip: SHA, ...pair(OTHER.slice(0, 12)), isAncestor: anc, clientFeatures: s => tubes[s] ?? null }), null, 'keeping the feature releases');
  assert.equal(checkCandidate({ sha: SHA, mainTip: SHA, ...pair(OTHER.slice(0, 12)), isAncestor: anc, clientFeatures: s => (s === SHA ? [] : ['curve_radius']) }) !== null, true);
  assert.match(checkCandidate({ sha: SHA, mainTip: SHA, ...pair(OTHER.slice(0, 12)), isAncestor: anc, clientFeatures: s => (s === SHA ? [] : ['curve_radius']) }), /declares curve_radius, and 42f5a4f065d4 does not: stored scenes that use it would stop opening/);
  assert.equal(checkCandidate({ sha: SHA, mainTip: SHA, ...pair(OTHER.slice(0, 12)), isAncestor: anc, clientFeatures: s => (s === SHA ? ['curve_radius'] : []) }), null, 'the first release that adds the feature is fine');
  assert.equal(checkCandidate({ sha: SHA, mainTip: SHA, ...pair(OTHER.slice(0, 12)), isAncestor: anc, clientFeatures: () => null }), null, 'a tree whose features cannot be read does not block a release (the bundle check is the first-release assertion)');
});

test('the production smoke: GET only, the new build\'s entry must be serving, bounded retries, then a verdict', async () => {
  const page = entry => `<html><script type="module" crossorigin src="${entry}"></script></html>`;
  const site = (entry, over = {}) => async path => over[path] ?? (path === '/' ? { status: 200, body: page(entry) }
    : path === entry ? { status: 200 } : path === '/login' ? { status: 302, location: `${SMOKE_ORIGIN}/sign-in` } : path === '/a/x' ? { status: 404 } : { status: 401 });
  const built = e => e === '/static/landing-NEW.js';
  assert.ok((await smokeOnce(site('/static/landing-NEW.js'), built)).every(r => r.ok));
  assert.ok(!(await smokeOnce(site('/static/landing-OLD.js'), built))[0].ok, 'the old build still serving is not a pass');
  assert.ok(!(await smokeOnce(site('/static/landing-NEW.js', { '/api/me': { status: 200 } }), built)).every(r => r.ok), 'a signed-out /api/me must be 401');
  // Rollout lag: old build twice, then the new one.
  let calls = 0, t = 0;
  const lagging = async path => (path === '/' && ++calls <= 2 ? site('/static/landing-OLD.js') : site('/static/landing-NEW.js'))(path);
  const fast = { now: () => t, sleep: async ms => { t += ms; }, deadlineMs: 60_000, everyMs: 5_000 };
  assert.ok((await smoke(lagging, built, fast)).every(r => r.ok));
  t = 0;
  const never = await smoke(site('/static/landing-OLD.js'), built, fast);
  assert.ok(!never.every(r => r.ok) && t >= 60_000 && t < 70_000, 'gives up at the deadline with the failing checks');
});

test('the release records a receipt and recovers a failed upload or smoke with the matched previous pair', () => {
  const src = readFileSync(new URL('./prod-release.mjs', import.meta.url), 'utf8');
  assert.match(src, /previous: \{ cp: before\.cp\.version, app: before\.app\.version/, 'the previous pair is captured before any upload');
  assert.match(src, /time_travel\/bookmark/, 'D1 bookmarks go in the receipt: a Worker rollback never restores data');
  assert.ok(src.indexOf("receipt.bookmarks[db] = await bookmark(db)") < src.indexOf("'deploy', '--config', CONFIG, '--message', message"), 'bookmarks before the first upload');
  assert.match(src, /\[\['rabbit-hole-app', WEB\], \['rabbit-hole-cp', CP\]\]/, 'rollback order: app first, then the control plane');
  assert.match(src, /catch \(e\) \{ receipt\.deployed\[name\] = 'unknown'; return await rollback\(/, 'a failed upload rolls back what was uploaded');
  assert.match(src, /if \(!receipt\.smoke\.every\(r => r\.ok\)\) return await rollback\(/, 'a failed smoke rolls back both');
  assert.match(src, /\} finally \{ save\(\); \}/, 'the receipt is written whatever happens');
  const smokeSrc = src.slice(src.indexOf('export async function smokeOnce'), src.indexOf('export async function smoke('));
  assert.deepEqual([...smokeSrc.matchAll(/get\('([^']+)'\)/g)].map(m => m[1]), ['/', '/login'], 'GETs only: the page, its entry, /login, /a/x, /api/me');
  assert.doesNotMatch(smokeSrc, /\/api\/(ask|learn|tutor)|method:/i, 'the smoke never calls a model or writes');
});

test('the build hash is stable and changes with any byte', () => {
  const dir = fileURLToPath(new URL('../packages/control-plane/learn-migrations', import.meta.url));
  assert.equal(hashDirs([['a', dir]]), hashDirs([['a', dir]]));
  assert.notEqual(hashDirs([['a', dir]]), hashDirs([['b', dir]]));
});

test('the build hash ignores what wrangler writes differently on every dry run: README.md and source maps', async () => {
  // Run 37966166779 (2026-10-09): prepare and release dry-ran seconds apart; README.md's "generated at" timestamp
  // differed and release refused its own prepared build. A .map's sourceRoot names the outdir.
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(fileURLToPath(new URL(`file:///${tmpdir().replaceAll('\\', '/')}/hash-`)));
  const put = (name, text) => writeFileSync(`${dir}/${name}`, text);
  put('index.js', 'code'); put('README.md', 'generated at 1'); put('index.js.map', '{"sourceRoot":"/a"}');
  const first = hashDirs([['cp', dir]]);
  put('README.md', 'generated at 2'); put('index.js.map', '{"sourceRoot":"/b"}');
  assert.equal(hashDirs([['cp', dir]]), first, 'a new timestamp or outdir is the same build');
  put('index.js', 'code!');
  assert.notEqual(hashDirs([['cp', dir]]), first, 'any code byte is a new build');
});

test('the production build env is the Rabbit Hole build, never the dev tools', () => {
  assert.equal(BUILD_ENV.VITE_RABBIT_HOLE, 'true');
  assert.ok(!('VITE_COACHING_DEV' in BUILD_ENV) && !('VITE_BYOC_DEV' in BUILD_ENV));
  // A dev flag in the releaser's shell never reaches the production build; production offers /motion by its own flag (owner
  // activation GO, 2026-10-21).
  for (const name of ['VITE_COACHING_DEV', 'VITE_BYOC_DEV', 'VITE_MOTION_DEV']) assert.ok(DEV_ONLY_ENV.includes(name) && !(name in BUILD_ENV), name);
  assert.equal(BUILD_ENV.VITE_MOTION, 'true');
  // /animation has no build flag (owner GO 2026-11-02): the command ships in every build and the server's ANIMATION_ENABLED decides.
  assert.deepEqual(Object.keys(BUILD_ENV).filter(k => /ANIMATION/.test(k)), []);
  assert.throws(() => parseArgs(['release', '--sha']), /bad argument/);
});

// Usage analytics (docs/features/usage-analytics.md): the release build and the production control plane carry the same public PostHog
// project token and US host; the browser build is tagged production; no personal API key (phx_) anywhere in the release config.
test('the production release carries the PostHog project configuration, never a personal key', () => {
  assert.match(BUILD_ENV.VITE_POSTHOG_TOKEN, /^phc_[A-Za-z0-9]{20,}$/);
  assert.equal(BUILD_ENV.VITE_POSTHOG_HOST, 'https://us.i.posthog.com');
  assert.equal(BUILD_ENV.VITE_ANALYTICS_ENV, 'production');
  const cp = JSON.parse(readFileSync(new URL('../packages/control-plane/wrangler.rabbit-hole-prod.jsonc', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, ''));
  assert.equal(cp.vars.POSTHOG_PROJECT_TOKEN, BUILD_ENV.VITE_POSTHOG_TOKEN);
  assert.equal(cp.vars.POSTHOG_HOST, BUILD_ENV.VITE_POSTHOG_HOST);
  assert.ok(cp.vars.ANALYTICS_INTERNAL_USER_IDS.split(',').every(id => /^[0-9a-f]{32}$/.test(id)), 'internal accounts are users.id values, never emails');
  for (const file of ['prod-release.mjs', '../packages/control-plane/wrangler.rabbit-hole-prod.jsonc', '../packages/web/wrangler.rabbit-hole-prod.jsonc', '../.github/workflows/deploy-prod.yml'])
    assert.doesNotMatch(readFileSync(new URL(file, import.meta.url), 'utf8'), /phx_[A-Za-z0-9]/, file);
  // prepare runs the bundle check in its analytics mode, so the deployed build is proven to carry the configuration
  assert.ok(readFileSync(new URL('prod-release.mjs', import.meta.url), 'utf8').includes("run('node', ['e2e/production-bundle-check.mjs'], WEB, { ...process.env, EXPECT_ANALYTICS: '1' })"));
});

test('the release preflight refuses the dev sign-in secrets on production, the Access bridge included', () => {
  for (const name of ['TEST_BYPASS_SECRET', 'OAUTH_MOCK', 'DEV_TEST_BYPASS', 'ACCESS_AUD']) assert.ok(NEVER_ON_PRODUCTION.includes(name), name);
});

test('the production workflow: a push to main only, the production environment, a green dev deploy of the exact commit, prepare before release, never a migration', () => {
  const wf = readFileSync(new URL('../.github/workflows/deploy-prod.yml', import.meta.url), 'utf8').replace(/\r\n/g, '\n'); // CRLF checkouts
  assert.match(wf, /on:\n  push:\n    branches: \[main\]\n/, 'push to main is the only trigger');
  assert.doesNotMatch(wf, /pull_request|workflow_run|workflow_dispatch|issue_comment/, 'nothing else starts a release');
  assert.match(wf, /environment: production\n/);
  assert.match(wf, /permissions:\n  contents: read\n  actions: read # /, 'read-only: contents, and the Actions runs of this commit (OPS-04)');
  assert.match(wf, /if: github\.repository == 'Rabbit-Hole-App\/Rabbit-Hole'/);
  assert.match(wf, /notes --ref=dev-deploys show "\$GITHUB_SHA"[^\n]*\n[^\n]*\|\| \{[^}]*exit 1; \}/, 'never deployed on dev, never released');
  const prepare = wf.indexOf('prod-release.mjs prepare --sha "$GITHUB_SHA" --dev-record'), release = wf.indexOf('prod-release.mjs release --sha "$GITHUB_SHA" --build "$build" --approve "RELEASE $GITHUB_SHA $build"');
  assert.ok(prepare > 0 && release > prepare, 'release only after prepare, with the prepared build');
  assert.doesNotMatch(wf, /migrations apply|d1 execute|wrangler deploy|HOLD\s*[:=]/, 'all through prod-release.mjs, which keeps HOLD and never migrates');
  for (const uses of wf.match(/uses: \S+/g)) assert.match(uses, /@[0-9a-f]{40}$/, `${uses} is pinned to a commit`);
});

test('r34 audit: the build step never holds the deploy token, the deploy step never builds, and the receipt is kept', () => {
  const wf = readFileSync(new URL('../.github/workflows/deploy-prod.yml', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const steps = wf.split('\n      - ').slice(1);
  const step = name => steps.find(s => s.startsWith(`name: ${name}`));
  assert.match(step('Prepare'), /prod-release\.mjs prepare/);
  assert.doesNotMatch(step('Prepare'), /CLOUDFLARE_API_TOKEN/, 'npm and Vite build scripts never see the Cloudflare token');
  assert.match(step('Release'), /CLOUDFLARE_API_TOKEN/);
  assert.doesNotMatch(step('Release'), /prod-release.mjs prepare|npm (ci|run)|VITE_TLDRAW/, 'release only re-hashes what prepare built');
  for (const s of steps.filter(s => /npm ci|ensure-natives/.test(s))) assert.doesNotMatch(s, /secrets\./, 'installs run without secrets');
  assert.match(step('Release receipt'), /if: always\(\)[\s\S]*upload-artifact@[0-9a-f]{40}[\s\S]*release-receipt\.json[\s\S]*retention-days: 90/);
  assert.match(step('Release'), /--receipt "\$RUNNER_TEMP\/release-receipt\.json"/);
  for (const f of ['../packages/web/wrangler.rabbit-hole-prod.jsonc', '../packages/control-plane/wrangler.rabbit-hole-prod.jsonc'])
    assert.doesNotMatch(readFileSync(new URL(f, import.meta.url), 'utf8'), /"build"\s*:/, `${f}: a wrangler build command would run in the credentialed step`);
});

test('a dirty-tree refusal names the changed paths, and the CLI bin is committed executable so npm ci on Linux leaves the tree clean', () => {
  // Run 37956890240 (2026-10-09): npm ci set packages/cli/bin/small.js to 755 on the runner and prepare refused with no path.
  assert.equal(checkPrepare({ sha: SHA, onMain: true, devRecord: GREEN, runs: RUNS, treeOf, head: SHA, clean: false, changes: ' M packages/cli/bin/small.js' }), 'refused: the tracked tree has changes:\n M packages/cli/bin/small.js');
  assert.match(checkRelease({ ...released, clean: false, changes: ' M a.js' }), /changes:\n M a\.js$/);
  const mode = execFileSync('git', ['ls-tree', 'HEAD', 'packages/cli/bin/small.js'], { cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8' });
  assert.match(mode, /^100755 /);
});

test('a release refuses when either worker lacks the daily spend cap (USAGE_PLATFORM_DAY_USD)', async () => {
  const release = await import('./prod-release.mjs');
  for (const worker of ['rabbit-hole-cp', 'rabbit-hole-app']) {
    const all = release.SECRETS[worker].required;
    assert.ok(all.includes('USAGE_PLATFORM_DAY_USD'), `${worker} requires the cap`);
    assert.deepEqual(release.secretBlockers(worker, all.filter(n => n !== 'USAGE_PLATFORM_DAY_USD')), [`${worker} is missing secret USAGE_PLATFORM_DAY_USD`]);
    assert.deepEqual(release.secretBlockers(worker, all), [], 'with every required secret, nothing blocks');
    assert.deepEqual(release.secretBlockers(worker, [...all, 'TEST_BYPASS_SECRET']), [`${worker} must not have secret TEST_BYPASS_SECRET`]);
  }
});

// ---- the MVP fast path (owner policy 2026-11-03, docs/features/mvp-fast-path.md) ----
// An MVP preview record as scripts/mvp-fast-path.mjs writes it, and the ordinary rules it must leave alone.
const mvpParts = (over = {}) => ({ sha: SHA, tree: treeOf(SHA), base: 'a'.repeat(40), build: 'b1b1b1b1b1b1', targets: { worker: 'rabbit-hole-web-dev-mvp-fast-path', url: 'https://x', account: 'c08d3dbdc53a3afd3cb09a536ac42318', env: 'dev' },
  checks: REQUIRED.map(name => ({ name, cmd: name, exit: 0, result: 'pass' })), recovery: { branch: 'recovery/forward', tip: 'e'.repeat(40) }, version: 'c9c9cf3d', run: 'local', at: '2026-11-03T10:00:00.000Z', ...over });
const MVP = makeRecord(mvpParts());
const mvpLine = r => `${JSON.stringify(r)}\n`;
const recoveryTip = 'e'.repeat(40); // a recovery branch whose tip descends from SHA, as checkRecovery reports it
const mvpOk = { ...ok, devRecord: mvpLine(MVP), runs: null, mvp: true, mvpAllowedSha: SHA, recoveryCheck: () => ({ tip: recoveryTip }) }; // no gate, no dev deploy, no CI runs: the MVP record, the owner's allowance and the recovery branch

test('MVP is off by default: ordinary prepare keeps its rules and refusal text, and an MVP record never stands in for them', () => {
  const noGreen = `refused: no green dev deployment with provenance (tree, build, bundle, gate digest, run, version) is recorded for ${SHA}`;
  for (const devRecord of ['', mvpLine(MVP)]) { // an MVP record is not a green dev deployment
    assert.equal(checkPrepare({ ...ok, devRecord }), noGreen);
    assert.equal(checkPrepare({ ...ok, devRecord, mvp: false }), noGreen);
    assert.equal(checkPrepare({ ...ok, devRecord, mvp: undefined }), noGreen);
  }
  const needs = `refused: ${SHA} needs a successful fast-e2e and verify run of this exact commit; a gate, its own or reused, never stands in for them:\n- `;
  assert.equal(checkPrepare({ ...ok, runs: null }), `${needs}no CI run evidence for this commit (the Actions runs could not be read)`);
  assert.equal(checkPrepare({ ...ok, runs: { sha: SHA, runs: { ...RUNS.runs, [FAST]: [ciRun(FAST, { conclusion: 'failure' })] } } }), `${needs}fast-e2e run 39719683140.1 of 42f5a4f0 is completed/failure, not a completed success: https://github.com/x`);
  assert.equal(checkPrepare({ ...ok, runs: { sha: SHA, runs: { ...RUNS.runs, [VERIFY]: [] } } }), `${needs}no verify run of 42f5a4f0; push the commit to a branch other than main or dev and let verify finish`);
  assert.equal(checkPrepare(ok), null);
  // The gate: an MVP-previewed commit is never the full gate G a later reused deploy builds on, here or in dev-deploy-gate.mjs.
  const G = 'c'.repeat(40);
  const reused = mvpLine(row({ sha: SHA, gates: 'reused', app_gate_sha: G, smoke: 'pass', build: 'b1', bundle: 'w1' }));
  assert.equal(greenDevDeploy(SHA, mvpLine(makeRecord(mvpParts({ sha: G, tree: treeOf(G) }))) + reused, { isAncestor: () => true, treeOf }), null);
  assert.equal(greenDev(mvpLine(MVP), SHA), null);
});

test('the ordinary dev path is untouched: the gate note and the verify and fast-e2e waits are still required, and no script or step there knows MVP', () => {
  const dev = readFileSync(new URL('../.github/workflows/deploy-dev.yml', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(dev, /no gate record note for \$GITHUB_SHA: nothing deployed/);
  assert.match(dev, /no verify evidence for \$GITHUB_SHA: nothing deployed/);
  assert.match(dev, /verify-evidence\.mjs runs --sha "\$GITHUB_SHA" --out "\$RUNNER_TEMP\/ci-runs\.json" --wait 30/);
  assert.match(dev, /dev-deploy-gate\.mjs --sha "\$GITHUB_SHA" --gate "\$RUNNER_TEMP\/gate\.log" --dev-deploys dev-deploys --verify "\$RUNNER_TEMP\/verify\.json" --runs "\$RUNNER_TEMP\/ci-runs\.json"/);
  assert.doesNotMatch(dev.split('\n').filter(l => !l.trim().startsWith('#')).join('\n'), /mvp/i, 'no step of deploy-dev.yml is MVP-aware');
  for (const f of ['dev-deploy.mjs', 'dev-deploy-gate.mjs', 'verify-evidence.mjs']) assert.doesNotMatch(readFileSync(new URL(`./${f}`, import.meta.url), 'utf8'), /from '[.][/]mvp|--mvp|mvpVerdict|[.]mvp(?![a-z])/, `${f} is the ordinary path`);
});

test('MVP prepare: only with the explicit flag, the MVP record replaces the dev deploy, the gate and the CI runs', () => {
  assert.equal(checkPrepare(mvpOk), null);
  assert.equal(checkPrepare({ ...mvpOk, mvp: false }), `refused: no green dev deployment with provenance (tree, build, bundle, gate digest, run, version) is recorded for ${SHA}`, 'not implicit');
  assert.equal(checkPrepare({ ...mvpOk, runs: RUNS }), null, 'CI runs are not consulted, green or not');
  assert.equal(checkPrepare({ ...mvpOk, runs: { sha: SHA, runs: { [FAST]: [ciRun(FAST, { conclusion: 'failure' })], [VERIFY]: [] } } }), null, 'broad CI is nonblocking');
  assert.equal(parseArgs(['prepare', '--mvp', '--sha', SHA, '--runs', 'x.json']).mvp, true);
  assert.equal(parseArgs(['prepare', '--sha', SHA, '--runs', 'x.json', '--mvp']).mvp, true);
  assert.equal(parseArgs(['prepare', '--sha', SHA, '--runs', 'x.json']).mvp, undefined);
  assert.equal(parseArgs(['prepare', '--mvp', '--sha', SHA]).sha, SHA);
  assert.throws(() => parseArgs(['prepare', '--mvp', '--sha']), /bad argument/);
});

test('MVP prepare still rejects a failed required check, another commit, a missing field, a passed claim and a tampered record', () => {
  const refused = r => checkPrepare({ ...mvpOk, devRecord: mvpLine(r) });
  for (const name of REQUIRED) {
    const failed = makeRecord(mvpParts({ checks: REQUIRED.map(n => ({ name: n, cmd: n, exit: n === name ? 2 : 0, result: n === name ? 'fail' : 'pass' })) }));
    assert.equal(refused(failed), `refused: ${SHA} has no acceptable MVP preview record: required check ${name} did not pass (exit 2)`, name);
  }
  assert.match(refused(makeRecord(mvpParts({ sha: OTHER, tree: treeOf(OTHER) }))), /no acceptable MVP preview record: no MVP preview record is recorded for 42f5a4f0/, 'a record for another commit');
  assert.match(refused(makeRecord(mvpParts({ tree: treeOf(OTHER) }))), /another tree/);
  assert.match(refused({ ...MVP, build: 'c2c2c2c2c2c2' }), /digest/, 'tampered');
  assert.match(checkPrepare({ ...mvpOk, devRecord: GREEN }), /no acceptable MVP preview record/, 'an ordinary green deploy is not an MVP record');
  const { digest: _, ...bare } = MVP;
  assert.match(refused({ ...bare, broad_ci: 'passed' }), /no digest/);
  assert.match(refused(makeRecord(mvpParts({ targets: { ...MVP.targets, worker: 'rabbit-hole-app' } }))), /not a rabbit-hole-web-dev-\* clone/, 'environment targeting');
});

test('MVP prepare needs the owner\'s allowance for this exact commit; without it nothing else is looked at', () => {
  const refusal = `refused: --mvp needs the owner's allowance for this exact commit: MVP_ALLOWED_SHA must equal ${SHA} (the repository variable in the workflow; by hand pass --mvp-allowed-sha ${SHA})`;
  for (const mvpAllowedSha of [undefined, '', OTHER, SHA.slice(0, 12), SHA.toUpperCase()]) assert.equal(checkPrepare({ ...mvpOk, mvpAllowedSha }), refusal, String(mvpAllowedSha));
  assert.equal(checkPrepare({ ...mvpOk, mvpAllowedSha: SHA }), null);
  assert.equal(checkPrepare({ ...mvpOk, mvpAllowedSha: undefined, devRecord: '' }), refusal, 'the allowance is asked for before the record');
  assert.match(checkPrepare({ ...mvpOk, mvpAllowedSha: undefined, onMain: false }), /not on origin\/main/, 'the identity checks come first');
  // An allowance changes nothing for ordinary prepare: the same inputs are judged on the ordinary rules.
  assert.equal(checkPrepare({ ...ok, mvpAllowedSha: SHA }), null);
  assert.match(checkPrepare({ ...ok, mvpAllowedSha: SHA, devRecord: mvpLine(MVP) }), /no green dev deployment/);
  // In the workflow only the repository variable counts; by hand the explicit argument does too.
  assert.equal(allowedMvpSha({}, { GITHUB_ACTIONS: 'true', MVP_ALLOWED_SHA: SHA }), SHA);
  assert.equal(allowedMvpSha({ 'mvp-allowed-sha': SHA }, { GITHUB_ACTIONS: 'true' }), undefined, 'in the workflow an argument is not an allowance');
  assert.equal(allowedMvpSha({ 'mvp-allowed-sha': SHA }, {}), SHA);
  assert.equal(allowedMvpSha({}, { MVP_ALLOWED_SHA: SHA }), SHA);
  assert.equal(allowedMvpSha({}, {}), undefined);
  assert.equal(parseArgs(['prepare', '--mvp', '--mvp-allowed-sha', SHA, '--sha', SHA])['mvp-allowed-sha'], SHA);
});

test('MVP prepare needs the recovery branch: in the record, on rabbit-hole and containing the commit; ordinary prepare is unaffected', () => {
  const { recovery: _, ...bare } = mvpParts();
  assert.match(checkPrepare({ ...mvpOk, devRecord: mvpLine(makeRecord(bare)) }), /^refused: 42f5a4f0\S+ has no acceptable MVP preview record: the record names no recovery branch \(the owner's MVP minimum: preview --mvp ... --recovery <branch>\)$/, 'missing from the record');
  const gone = { error: 'recovery: branch recovery/forward is not on rabbit-hole (push it, then git fetch rabbit-hole recovery/forward)' };
  assert.equal(checkPrepare({ ...mvpOk, recoveryCheck: () => gone }), `refused: ${SHA} has no acceptable MVP preview record: ${gone.error}`, 'deleted since the preview');
  const notDescendant = { error: 'recovery: branch recovery/forward (eeeeeeee) does not contain 42f5a4f0 as an ancestor' };
  assert.match(checkPrepare({ ...mvpOk, recoveryCheck: () => notDescendant }), /does not contain 42f5a4f0 as an ancestor/, 'rewritten so it no longer contains the commit');
  assert.equal(checkPrepare(mvpOk), null, 'valid');
  assert.equal(checkPrepare({ ...mvpOk, recoveryCheck: undefined }), null, 'the record\'s own claim is enough for the pure check; the CLI always passes the live one');
  // The CLI asks about the real remote-tracking refs, so the workflow's full checkout (all branches) is what it needs.
  const src = readFileSync(new URL('./prod-release.mjs', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(src, /recoveryCheck: branch => checkRecovery\(sha, branch, \{ rev: revOf, isAncestor \}\)/);
  assert.match(readFileSync(new URL('../.github/workflows/deploy-prod.yml', import.meta.url), 'utf8'), /fetch-depth: 0/);
  // Ordinary prepare never looks at a recovery branch.
  assert.equal(checkPrepare({ ...ok, recoveryCheck: () => gone }), null);
  assert.equal(checkPrepare({ ...ok, devRecord: mvpLine(makeRecord(bare)), recoveryCheck: () => gone }), `refused: no green dev deployment with provenance (tree, build, bundle, gate digest, run, version) is recorded for ${SHA}`);
});

test('MVP prepare keeps the identity checks: full sha, on main, HEAD at the sha, a clean tree', () => {
  assert.match(checkPrepare({ ...mvpOk, sha: '42f5a4f0' }), /full 40-character/);
  assert.match(checkPrepare({ ...mvpOk, onMain: false }), /not on origin\/main/);
  assert.match(checkPrepare({ ...mvpOk, head: OTHER }), /HEAD is/);
  assert.match(checkPrepare({ ...mvpOk, clean: false, changes: ' M a.js' }), /tracked tree has changes:\n M a\.js$/);
});

test('MVP release keeps the approval, the prepared build and the identity checks, and refuses a prepared record that claims a passed gate', () => {
  const prepared = { sha: SHA, build: 'abc123', mvp: mvpSummary(MVP) };
  assert.deepEqual(prepared.mvp, { digest: MVP.digest, worker: 'rabbit-hole-web-dev-mvp-fast-path', checks: REQUIRED.map(n => `${n}:pass`), recovery: { branch: 'recovery/forward', tip: recoveryTip }, broad_ci: 'bypassed', release_gate: 'bypassed' });
  assert.equal(checkRelease({ ...released, prepared }), null);
  assert.match(checkRelease({ ...released, prepared: { ...prepared, mvp: { ...prepared.mvp, recovery: undefined } } }), /names no recovery branch/, 'a prepared record without its recovery branch');
  assert.match(checkRelease({ ...released, prepared, approve: 'RELEASE' }), /--approve must be exactly/);
  assert.match(checkRelease({ ...released, prepared: null }), /never prepared/);
  assert.match(checkRelease({ ...released, prepared: { ...prepared, build: 'zzz999' } }), /prepared build/);
  assert.match(checkRelease({ ...released, prepared, head: OTHER }), /HEAD is/);
  assert.match(checkRelease({ ...released, prepared, clean: false }), /tracked tree/);
  assert.match(checkRelease({ ...released, hold: true, prepared }), /^HOLD/);
  for (const k of ['broad_ci', 'release_gate']) assert.match(checkRelease({ ...released, prepared: { ...prepared, mvp: { ...prepared.mvp, [k]: 'passed' } } }), /does not say broad CI and the release gate were bypassed/, k);
  assert.equal(checkRelease({ ...released, prepared: { sha: SHA, build: 'abc123' } }), null, 'an ordinary prepared build has no MVP field and is unchanged');
});

test('MVP release prints the banner and its receipt carries it; the secret and schema preflight, smoke and rollback are not MVP-aware', () => {
  const src = readFileSync(new URL('./prod-release.mjs', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const rel = src.slice(src.indexOf('async function release'), src.indexOf('// Cloudflare API reads'));
  assert.match(rel, /if \(prepared\.mvp\) console\.log\(`\$\{MVP_BANNER\} /, 'loud, before any remote call');
  assert.ok(rel.indexOf('MVP_BANNER') < rel.indexOf('ACCOUNT'), 'the banner comes before the Cloudflare account check and every remote read');
  assert.match(rel, /\.\.\.\(prepared\.mvp && \{ mvp: \{ notice: MVP_BANNER, \.\.\.prepared\.mvp \} \}\)/, 'the receipt carries the notice and the record summary');
  const checks = rel.slice(rel.indexOf('// Stale candidate'), rel.indexOf('// The release receipt'));
  assert.match(checks, /checkCandidate\(/);
  assert.match(checks, /secretBlockers\(/);
  assert.match(checks, /schemaBlockers\(/);
  assert.match(checks, /if \(blockers\.length\) return fail\(/);
  assert.doesNotMatch(checks, /mvp/i, 'stale-candidate, secret and schema preflight run the same in MVP mode');
  const deploy = rel.slice(rel.indexOf('try {\n    for (const db'));
  assert.ok(deploy.length > 200);
  assert.match(deploy, /smoke\(httpGet/);
  assert.match(deploy, /rollback\(/);
  assert.doesNotMatch(deploy, /mvp/i, 'upload, production smoke and rollback run the same in MVP mode');
  const prep = src.slice(src.indexOf('function prepare('), src.indexOf('async function release'));
  assert.match(prep, /mvp: opts\.mvp === true/, 'the CLI flag is the only switch');
  for (const must of ['BUILD_ENV', "'e2e/production-bundle-check.mjs'", 'bundleHash(sha)']) assert.ok(prep.includes(must), `prepare still has ${must}`);
});

test('the production workflow selects MVP mode only from an explicit MVP record, and then skips only the CI runs step', () => {
  const wf = readFileSync(new URL('../.github/workflows/deploy-prod.yml', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const steps = wf.split('\n      - ').slice(1), step = name => steps.find(s => s.startsWith(`name: ${name}`));
  assert.match(step('MVP preview record'), /id: mvp\n        env:\n          MVP_ALLOWED_SHA: \$\{\{ vars\.MVP_ALLOWED_SHA \}\}\n[\s\S]*grep -q '"mvp":true' "\$RUNNER_TEMP\/dev-deploys\.jsonl"[\s\S]*\[ "\$MVP_ALLOWED_SHA" = "\$GITHUB_SHA" \][\s\S]*echo "flag=--mvp" >> "\$GITHUB_OUTPUT"[\s\S]*MVP MODE: broad CI and release gate BYPASSED by owner policy/);
  assert.match(step('Prepare'), /MVP_ALLOWED_SHA: \$\{\{ vars\.MVP_ALLOWED_SHA \}\}/, 'prepare is told the allowance too and checks it again');
  assert.match(step('Fast-e2e and verify runs'), /^name: Fast-e2e and verify runs of this commit\n        if: steps\.mvp\.outputs\.flag != '--mvp'\n/);
  assert.match(step('Prepare'), /prepare --sha "\$GITHUB_SHA" --dev-record "\$RUNNER_TEMP\/dev-deploys\.jsonl" --runs "\$RUNNER_TEMP\/ci-runs\.json" \$MVP_FLAG\n/);
  assert.match(step('Prepare'), /MVP_FLAG: \$\{\{ steps\.mvp\.outputs\.flag \}\}/);
  assert.doesNotMatch(step('Release'), /mvp/i, 'release reads the prepared build, which carries the MVP record');
  assert.deepEqual(steps.filter(s => /\n        if: steps\.mvp/.test(s)).map(s => s.split('\n')[0]), ['name: Fast-e2e and verify runs of this commit'], 'no other step is conditional on MVP mode');
  assert.match(wf, /notes --ref=dev-deploys show "\$GITHUB_SHA"[^\n]*\n[^\n]*\|\| \{[^}]*exit 1; \}/, 'a commit with no dev-deploys note is still never released');
});

// The workflow's own MVP step, run for real with bash: the note alone never enters MVP mode, the owner's variable must name the commit.
test('MVP mode needs the note AND vars.MVP_ALLOWED_SHA equal to the commit; a note without the variable is ignored loudly and the ordinary rules apply', t => {
  if (spawnSync('bash', ['-c', 'true']).error) return t.skip('bash is not on PATH');
  const wf = readFileSync(new URL('../.github/workflows/deploy-prod.yml', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const stepText = wf.split('\n      - ').slice(1).find(s => s.startsWith('name: MVP preview record'));
  const script = stepText.split('        run: |\n')[1].split('\n').map(l => l.replace(/^ {10}/, '')).join('\n');
  const run = (note, allowed) => {
    const dir = mkdtempSync(join(tmpdir(), 'mvp-wf-')).replaceAll('\\', '/'), out = `${dir}/output`;
    writeFileSync(`${dir}/dev-deploys.jsonl`, note); writeFileSync(out, '');
    const r = spawnSync('bash', ['-e', '-c', script], { encoding: 'utf8', env: { PATH: process.env.PATH, RUNNER_TEMP: dir, GITHUB_SHA: SHA, GITHUB_OUTPUT: out, ...(allowed !== undefined && { MVP_ALLOWED_SHA: allowed }) } });
    return { status: r.status, flag: readFileSync(out, 'utf8'), log: r.stdout };
  };
  const banner = 'MVP MODE: broad CI and release gate BYPASSED by owner policy';
  const entered = run(mvpLine(MVP), SHA);
  assert.deepEqual([entered.status, entered.flag], [0, 'flag=--mvp\n']);
  assert.match(entered.log, new RegExp(banner));
  for (const [why, allowed, shown] of [['variable missing', undefined, 'unset'], ['variable empty', '', 'unset'], ['variable names another commit', OTHER, OTHER], ['variable is a prefix', SHA.slice(0, 12), SHA.slice(0, 12)]]) {
    const r = run(mvpLine(MVP), allowed);
    assert.deepEqual([r.status, r.flag], [0, ''], `${why}: no MVP flag, the step still succeeds`);
    assert.doesNotMatch(r.log, new RegExp(banner), why);
    assert.match(r.log, new RegExp(`::warning title=MVP record ignored::vars\\.MVP_ALLOWED_SHA is '${shown}', not ${SHA}`), why);
    assert.match(r.log, /MVP record IGNORED: .* The ordinary rules apply: verify, fast-e2e and the gate\./, why);
  }
  for (const allowed of [SHA, undefined]) { // an ordinary dev deploy: nothing to say, whatever the variable
    const r = run(GREEN, allowed);
    assert.deepEqual([r.status, r.flag, r.log], [0, '', ''], `an ordinary note with ${allowed ? 'the variable set' : 'no variable'}`);
  }
});

// CF-1: both Workers are deployed with their release sha as a var (env.RELEASE_SHA: archive records and telemetry read it); a var is not part of the built bundle, so the bundle hash is unchanged.
test('the release deploys each Worker with RELEASE_SHA set to the released sha', () => {
  const src = readFileSync(new URL('./prod-release.mjs', import.meta.url), 'utf8');
  assert.match(src, /'--message', message, '--var', `RELEASE_SHA:\$\{sha\}`\]/, 'wrangler deploy carries --var RELEASE_SHA:<sha>');
  assert.doesNotMatch(src, /VITE_RELEASE_SHA/, 'no build-time release var: it would make the production bundle differ from the dev bundle it was gated on');
});
