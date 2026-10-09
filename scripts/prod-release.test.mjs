// Refusal paths of the production release job (docs/features/prod-release.md). No network, no build.
//   node --test scripts/prod-release.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { HOLD, NEVER_ON_PRODUCTION, checkPrepare, checkRelease, greenDevDeploy, schemaBlockers, servedRelease, checkCandidate, smoke, smokeOnce, SMOKE_ORIGIN, parseArgs, hashDirs, BUILD_ENV } from './prod-release.mjs';
import { expectedSchema, SOURCES } from './schema-check.mjs';

const SHA = '42f5a4f065d4a1df1b47e2f150893b83d7befe3b';
const OTHER = 'b0ee85f3' + '0'.repeat(32);
const TREES = { [SHA]: 'e'.repeat(40), [OTHER]: 'f'.repeat(40), ['c'.repeat(40)]: 'd'.repeat(40) };
const treeOf = s => TREES[s] ?? null;
// A dev-deploy line with full provenance (r34 audit): tree, gate digest, build, bundle, run, version.
const row = o => ({ tree: treeOf(o.sha), gate_digest: '0123456789abcdef', build: 'b1', bundle: 'w1', run: '37971669845.1', version: 'c9c9cf3d', ...o });
const GREEN = `${JSON.stringify(row({ sha: SHA, gates: 'pass', smoke: 'pass', worker: 'rabbit-hole-web-dev-small-parallel' }))}\n`;
const ok = { sha: SHA, onMain: true, devRecord: GREEN, head: SHA, clean: true, treeOf };
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
  assert.match(schemaBlockers({ ...ready, mainApplied: mainFiles.slice(0, -1) })[0], /rabbit-hole-prod migrations: not applied 0027/);
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
  assert.throws(() => parseArgs(['release', '--sha']), /bad argument/);
});

test('the release preflight refuses the dev sign-in secrets on production, the Access bridge included', () => {
  for (const name of ['TEST_BYPASS_SECRET', 'OAUTH_MOCK', 'DEV_TEST_BYPASS', 'ACCESS_AUD']) assert.ok(NEVER_ON_PRODUCTION.includes(name), name);
});

test('the production workflow: a push to main only, the production environment, a green dev deploy of the exact commit, prepare before release, never a migration', () => {
  const wf = readFileSync(new URL('../.github/workflows/deploy-prod.yml', import.meta.url), 'utf8').replace(/\r\n/g, '\n'); // CRLF checkouts
  assert.match(wf, /on:\n  push:\n    branches: \[main\]\n/, 'push to main is the only trigger');
  assert.doesNotMatch(wf, /pull_request|workflow_run|workflow_dispatch|issue_comment/, 'nothing else starts a release');
  assert.match(wf, /environment: production\n/);
  assert.match(wf, /permissions:\n  contents: read\n/);
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
  assert.equal(checkPrepare({ sha: SHA, onMain: true, devRecord: GREEN, treeOf, head: SHA, clean: false, changes: ' M packages/cli/bin/small.js' }), 'refused: the tracked tree has changes:\n M packages/cli/bin/small.js');
  assert.match(checkRelease({ ...released, clean: false, changes: ' M a.js' }), /changes:\n M a\.js$/);
  const mode = execFileSync('git', ['ls-tree', 'HEAD', 'packages/cli/bin/small.js'], { cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8' });
  assert.match(mode, /^100755 /);
});
