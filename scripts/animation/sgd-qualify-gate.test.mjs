// Offline tests for sgd-qualify-gate.mjs (owner decision 22): git, the candidate's verify-candidate harness and wrangler are all fakes.
//   node --test scripts/animation/sgd-qualify-gate.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { MUST_RERUN, inputProblem, readBack, realDeps, runGate, sameSha } from './sgd-qualify-gate.mjs';

const HEAD = 'a'.repeat(40), MVP3 = 'b'.repeat(40), VERSION = '0fd062bf-f9e4-4099-8894-2d2924e94d6b', PROMPTS = 'c1'.repeat(16), GOLDEN = 'd2'.repeat(16);
const env = { PREVIEW_VERSION: VERSION, PREVIEW_SHA: HEAD.slice(0, 12) };
const opts = (over = {}) => ({ env, mvp3Sha: MVP3, promptsHash: PROMPTS, goldenHash: GOLDEN, worktree: 'C:/cand', ...over });
const DEPLOYMENTS = v => `Created:     2026-11-03T20:00:00.000Z\nSource:      Upload\nVersion(s):  (100%) ${v}\n      Created:  2026-11-03T20:00:00.000Z\n      Tag:      ${HEAD.slice(0, 9)}\n      Message:  deploy ${HEAD.slice(0, 9)}\n`;
const VIEW = (flags = {}) => `Version ID: ${VERSION}\nTag: ${HEAD.slice(0, 9)}\nMessage: deploy\nBindings:\nenv.ANIMATION_ENABLED ("${flags.enabled ?? 'true'}")\nenv.ANIMATION_DIAGNOSTICS ("${flags.diag ?? 'true'}")\nenv.USAGE_PLATFORM_DAY_USD ("40")\n`;
// A fake world; every field can be bent to make one difference.
function world(over = {}) {
  const w = { head: HEAD, dirty: false, mvp3Exists: true, ancestor: true, hashes: { head: HEAD, promptsHash: PROMPTS, goldenHash: GOLDEN }, deployments: DEPLOYMENTS(VERSION), view: VIEW(), calls: [], ...over };
  w.deps = {
    git: args => {
      w.calls.push(`git ${args.join(' ')}`);
      if (args[0] === 'rev-parse' && args[1] === 'HEAD') return { status: 0, stdout: `${w.head}\n` };
      if (args[0] === 'status') return { status: 0, stdout: w.dirty ? ' M packages/web/src/x.js\n' : '' };
      if (args[0] === 'rev-parse') return { status: w.mvp3Exists ? 0 : 1, stdout: '' };
      if (args[0] === 'merge-base') return { status: w.ancestor ? 0 : 1, stdout: '' };
      throw new Error(`unexpected git ${args}`);
    },
    candidateHashes: async sha => { w.calls.push(`hashes ${sha}`); if (w.hashes instanceof Error) throw w.hashes; return w.hashes; },
    wrangler: args => { w.calls.push(`wrangler ${args.join(' ')}`); if (w.wranglerError) throw new Error(w.wranglerError); return args[0] === 'deployments' ? w.deployments : w.view; },
  };
  return w;
}

test('the real candidate passes: ancestor, clean tree, both Gate 1 hashes, the latest deployment and a version tag that names the SHA', async () => {
  const w = world(), r = await runGate(opts(), w.deps);
  assert.equal(r.ok, true, r.lines.join('\n'));
  assert.equal(r.refusal, null);
  assert.equal(r.head, HEAD, 'the full HEAD is returned for the result file');
  assert.deepEqual([r.mismatches, r.problems], [[], []]);
  assert.match(r.lines.join('\n'), /is an ancestor of the candidate HEAD/);
  assert.match(r.lines.join('\n'), /INFO USAGE_PLATFORM_DAY_USD on the preview: 40/);
  assert.deepEqual(w.calls.filter(c => c.startsWith('wrangler')), ['wrangler deployments list', `wrangler versions view ${VERSION}`]);
});

test('every single difference refuses as a mismatch (the caller prints GATE 1 MUST RERUN ON THE REAL CANDIDATE) and names what differs', async () => {
  const cases = [
    ['a different prompt-files hash', { hashes: { head: HEAD, promptsHash: 'e3'.repeat(16), goldenHash: GOLDEN } }, /prompt files hash is e3e3e3e3e3e3, Gate 1 recorded c1c1c1c1c1c1/],
    ['a different golden artifact hash', { hashes: { head: HEAD, promptsHash: PROMPTS, goldenHash: 'f4'.repeat(16) } }, /golden artifact hash is f4f4f4f4f4f4, Gate 1 recorded d2d2d2d2d2d2/],
    ['MVP3 is not an ancestor', { ancestor: false }, /is not an ancestor of the candidate HEAD/],
    ['MVP3 sha is not a commit here', { mvp3Exists: false }, /is not a commit in the candidate worktree/],
    ['the worktree HEAD is not PREVIEW_SHA', { head: '9'.repeat(40), hashes: { head: '9'.repeat(40), promptsHash: PROMPTS, goldenHash: GOLDEN } }, /HEAD is 999999999, PREVIEW_SHA is aaaaaaaaaaaa/],
    ['uncommitted changes', { dirty: true }, /uncommitted changes to tracked files/],
    ['the harness reports another HEAD', { hashes: { head: '8'.repeat(40), promptsHash: PROMPTS, goldenHash: GOLDEN } }, /verify-candidate reports HEAD 888888888/],
    ['the candidate has no Gate 1 harness', { hashes: { missing: 'C:/cand/scripts/animation/author-sample.mjs does not exist' } }, /cannot have measured it/],
    ['another version is live', { deployments: DEPLOYMENTS('11111111-2222-3333-4444-555555555555') }, /latest deployment is 11111111-2222-3333-4444-555555555555 at 100%/],
    ['the version names another SHA', { deployments: DEPLOYMENTS(VERSION).replaceAll(HEAD.slice(0, 9), '1234567'), view: VIEW().replaceAll(HEAD.slice(0, 9), '1234567') }, /names 1234567, the candidate is aaaaaaaaa/],
    ['the version names no SHA', { deployments: 'Created: x\nVersion(s):  (100%) ' + VERSION + '\n  Tag: -\n', view: VIEW().replaceAll(HEAD.slice(0, 9), '-') }, /no tag or message naming a SHA/],
  ];
  for (const [name, over, expected] of cases) {
    const r = await runGate(opts(), world(over).deps);
    assert.equal(r.ok, false, name);
    assert.equal(r.refusal, 'mismatch', name);
    assert.match(r.mismatches.join('\n'), expected, name);
  }
});

test('missing or malformed inputs refuse before any command runs; an unreadable verifier or preview refuses as unverifiable, never as a pass', async () => {
  for (const [name, o, expected] of [
    ['no PREVIEW_VERSION', { env: { PREVIEW_SHA: HEAD } }, /set PREVIEW_VERSION and PREVIEW_SHA/],
    ['no PREVIEW_SHA', { env: { PREVIEW_VERSION: VERSION } }, /set PREVIEW_VERSION and PREVIEW_SHA/],
    ['a version that is not a UUID', { env: { ...env, PREVIEW_VERSION: 'latest' } }, /not a Cloudflare version id/],
    ['a SHA that is not hex', { env: { ...env, PREVIEW_SHA: 'main' } }, /not a git SHA/],
    ['no worktree', { worktree: '' }, /--candidate-worktree is required/],
    ['no mvp3 sha', { mvp3Sha: '' }, /--mvp3-sha is required/],
    ['no prompts hash', { promptsHash: undefined }, /--prompts-hash and --golden-hash are required/],
    ['no golden hash', { goldenHash: 'xyz' }, /--prompts-hash and --golden-hash are required/],
  ]) {
    const w = world(), r = await runGate(opts(o), w.deps);
    assert.deepEqual([r.ok, r.refusal, w.calls], [false, 'input', []], name);
    assert.match(r.problems[0], expected, name);
    assert.equal(inputProblem(opts(o)) !== null, true, name);
  }
  for (const [name, over, expected] of [
    ['a verifier that fails', { hashes: new Error('exit 1: boom') }, /verify-candidate gave no usable hashes: exit 1: boom/],
    ['a verifier with no hashes', { hashes: { head: HEAD } }, /no usable hashes/],
    ['wrangler unreadable', { wranglerError: 'wrangler deployments exit 1' }, /could not read the preview from Cloudflare/],
    ['diagnostics off', { view: VIEW({ diag: 'false' }) }, /ANIMATION_DIAGNOSTICS is false on the preview/],
    ['animation off', { view: VIEW({ enabled: 'false' }) }, /ANIMATION_ENABLED is false/],
  ]) {
    const r = await runGate(opts(), world(over).deps);
    assert.deepEqual([r.ok, r.refusal], [false, 'unverifiable'], name);
    assert.match(r.problems.join('\n'), expected, name);
  }
  const nogit = await runGate(opts(), { ...world().deps, git: () => ({ status: 128, stdout: '' }) });
  assert.deepEqual([nogit.ok, nogit.refusal], [false, 'unverifiable']);
});

test('sameSha is a 7-or-more-hex prefix match either way; readBack reads the 100% deployment, the flags and the SHA tokens', () => {
  assert.equal(sameSha('abcdef1', 'abcdef1234567890'), true);
  assert.equal(sameSha('abcdef1234567890', 'ABCDEF1'), true);
  assert.equal(sameSha('abcdef', 'abcdef1234'), false, 'under 7 hex never matches');
  assert.equal(sameSha('abcdef1', 'abcdef2'), false);
  assert.equal(sameSha('', 'abcdef1'), false);
  const back = readBack(DEPLOYMENTS(VERSION), VIEW());
  assert.equal(back.latest, VERSION);
  assert.equal(back.flag('USAGE_PLATFORM_DAY_USD'), '40');
  assert.ok(back.named.includes(HEAD.slice(0, 9)));
  assert.equal(MUST_RERUN, 'GATE 1 MUST RERUN ON THE REAL CANDIDATE');
});

test('realDeps: git and the harness run in the candidate worktree; credentials go only to wrangler\'s environment; a missing harness is a mismatch, not a pass', async () => {
  const seen = [];
  const spawn = (cmd, args, options) => { seen.push({ cmd, args, cwd: options.cwd, env: options.env }); return { status: 0, stdout: cmd === 'git' ? 'ok' : JSON.stringify({ head: HEAD, promptsHash: PROMPTS, goldenHash: GOLDEN }), stderr: '' }; };
  const deps = realDeps({ worktree: 'C:/definitely/not/here', worker: 'rabbit-hole-web-dev-x', credentials: 'creds', readKey: (_file, name) => `value-of-${name}`, spawn });
  assert.equal(deps.git(['rev-parse', 'HEAD']).stdout, 'ok');
  assert.deepEqual(seen[0].args.slice(0, 3), ['-C', 'C:/definitely/not/here', 'rev-parse']);
  assert.match((await deps.candidateHashes(MVP3)).missing, /author-sample\.mjs does not exist/);
  deps.wrangler(['deployments', 'list']);
  const w = seen.at(-1);
  assert.deepEqual(w.args, ['wrangler', 'deployments', 'list', '--name', 'rabbit-hole-web-dev-x', '--config', 'wrangler.dev.jsonc']);
  assert.match(w.cwd.replaceAll('\\', '/'), /not\/here\/packages\/web$/);
  assert.deepEqual([w.env.CLOUDFLARE_API_TOKEN, w.env.CLOUDFLARE_ACCOUNT_ID], ['value-of-CLOUDFLARE_API_TOKEN', 'value-of-CLOUDFLARE_ACCOUNT_ID']);
  assert.throws(() => realDeps({ worktree: 'w', worker: 'x', credentials: 'c', readKey: () => 's', spawn: () => ({ status: 1, stdout: 'account detail', stderr: '' }) }).wrangler(['versions', 'view', 'v']), /wrangler versions exit 1$/);
});
