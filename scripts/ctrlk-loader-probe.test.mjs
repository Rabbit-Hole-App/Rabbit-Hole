// The loader probe's safety properties, run against fakes only: no wrangler, no network, no credential. The dry run must be unable to
// mutate, a wrong name or account is refused before anything is created, and the throwaway Worker is always deleted and confirmed gone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CASES, NAME_RE, PHRASE, plan, run } from './ctrlk-loader-probe.mjs';

const ACCOUNT = readFileSync(new URL('../packages/web/wrangler.dev.jsonc', import.meta.url), 'utf8').match(/"account_id":\s*"([0-9a-f]{32})"/)[1];
const NAME = 'rabbit-hole-loader-probe-2610261100';
const URL_OK = 'https://rabbit-hole-loader-probe-2610261100.tryrabbithole.workers.dev';
const ok = { status: 'ok', stdout: [], result: null, error: null };
// What a healthy Dynamic Workers loader answers for each case, keyed by its code.
const HEALTHY = Object.fromEntries(CASES.map(c => [c.code, {
  finite: { ...ok, result: 42, stdout: [{ level: 'log', text: 'hi' }] }, thrown: { status: 'error', error: { message: 'boom' } }, network_denied: { ...ok, result: true },
  stdout_limit: { status: 'error', error: { message: 'stdout_limit' } }, output_limit: { status: 'error', error: { message: 'output_limit' } }, fresh_globals: { ...ok, result: 1 },
  cpu_loop: { status: 'error', error: { message: 'Worker exceeded CPU time limit.' } }, wall_deadline: { status: 'timeout', terminationConfirmed: false, error: { message: 'deadline' } },
  memory: { status: 'error', error: { message: 'Worker exceeded memory limit.' } }, recovers_after_abuse: { ...ok, result: 2 },
}[c.id]]));

function harness(over = {}) {
  const log = { exec: [], fetch: [], files: [], said: [], removed: 0 };
  let deployed = false, deleted = false;
  const deps = {
    say: line => log.said.push(line), env: { CLOUDFLARE_API_TOKEN: 'fixture-token', CLOUDFLARE_ACCOUNT_ID: ACCOUNT }, sleep: async () => {},
    confirm: async () => PHRASE, writeFile: (path, text) => log.files.push({ path, text }), tempDir: () => 'C:/tmp/probe', removeDir: () => { log.removed++; },
    exec: argv => {
      log.exec.push(argv);
      if (argv[0] === 'deploy') { deployed = true; return { status: 0, output: `Deployed ${URL_OK}` }; }
      deleted = true; return { status: 0, output: '' };
    },
    fetch: async (url, init = {}) => {
      log.fetch.push(url);
      if (url.startsWith('https://api.cloudflare.com')) return new Response('', { status: deployed && !deleted ? 200 : 404 });
      const { code } = JSON.parse(init.body);
      return Response.json(HEALTHY[code]);
    },
    ...over,
  };
  return { deps, log };
}
const options = { dryRun: false, name: NAME, receiptDir: 'C:/receipts' };

test('the dry run prints the plan and cannot mutate: no command, request, prompt, temp dir or file', async () => {
  const boom = name => () => { throw new Error(`${name} was used in a dry run`); };
  const { deps, log } = harness({ exec: boom('exec'), fetch: boom('fetch'), confirm: boom('confirm'), writeFile: boom('writeFile'), tempDir: boom('tempDir'), removeDir: boom('removeDir'), env: {} });
  assert.deepEqual(await run({ ...options, dryRun: true }, deps), { dryRun: true });
  assert.ok(log.said.length >= plan({ name: NAME }).length);
  assert.ok(log.said.some(line => /DRY RUN/.test(line)));
});

test('only throwaway probe names are accepted: never a shared, dev-clone or production Worker', async () => {
  for (const bad of ['rabbit-hole-app', 'rabbit-hole-cp', 'rabbit-hole-cp-dev', 'small-cp-dev', 'rabbit-hole-web-dev-fj-ctrlk', 'rabbit-hole-loader-probe-', 'rabbit-hole-loader-probe-AB12', 'rabbit-hole-loader-probe-a/../b']) {
    assert.equal(NAME_RE.test(bad), false, bad);
    const { deps, log } = harness();
    await assert.rejects(run({ ...options, name: bad }, deps), /Refusing the name/);
    assert.deepEqual(log.exec, []);
  }
});

test('missing credentials, another account, an existing Worker or a wrong phrase stop before anything is created', async () => {
  const cases = [
    [{ env: {} }, /must be set/], [{ env: { CLOUDFLARE_API_TOKEN: 'x', CLOUDFLARE_ACCOUNT_ID: '0'.repeat(32) } }, /not the rabbit-hole account/],
    [{ fetch: async () => new Response('', { status: 200 }) }, /already exists/], [{ confirm: async () => 'yes' }, /Nothing was created/],
  ];
  for (const [over, message] of cases) {
    const { deps, log } = harness(over);
    await assert.rejects(run(options, deps), message);
    assert.deepEqual(log.exec, [], 'no wrangler command ran');
    assert.deepEqual(log.files, [], 'nothing was written');
  }
});

test('a healthy loader passes every case, the Worker is deleted by exact name and confirmed gone, and the token never reaches a file or the output', async () => {
  const { deps, log } = harness();
  const receipt = await run(options, deps);
  assert.equal(receipt.outcome, 'pass');
  assert.equal(receipt.tornDown, true);
  assert.deepEqual(log.exec.map(a => a[0]), ['deploy', 'delete']);
  assert.deepEqual(log.exec[1], ['delete', '--name', NAME, '--force']);
  const deployConfig = log.files.find(f => f.path.endsWith('wrangler.jsonc'));
  const config = JSON.parse(deployConfig.text);
  assert.deepEqual(config.worker_loaders, [{ binding: 'INLINE_CODE_LOADER' }]);
  assert.deepEqual(Object.keys(config).filter(key => /d1|r2|durable|kv|queues|services|secrets|migrations/.test(key)), [], 'no data binding is deployed');
  const probeToken = config.vars.PROBE_TOKEN;
  assert.match(probeToken, /^[0-9a-f]{48}$/);
  for (const text of [...log.files.filter(f => f !== deployConfig).map(f => f.text), ...log.said]) assert.ok(!text.includes(probeToken) && !text.includes('fixture-token'));
  assert.equal(log.removed, 1, 'the temp directory holding the config is removed');
  assert.equal(receipt.results.filter(r => r.verdict === 'FAIL').length, 0);
});

test('a CPU loop that only ends at the 3 s wall deadline is a FAIL: the loader did not prove termination', async () => {
  const cpu = CASES.find(c => c.id === 'cpu_loop');
  const { deps } = harness({ fetch: async (url, init = {}) => {
    if (url.startsWith('https://api.cloudflare.com')) return new Response('', { status: 404 });
    const { code } = JSON.parse(init.body);
    return Response.json(code === cpu.code ? { status: 'timeout', terminationConfirmed: false, error: { message: 'deadline' } } : HEALTHY[code]);
  } });
  const receipt = await run(options, deps);
  assert.equal(receipt.outcome, 'fail');
  assert.deepEqual(receipt.results.filter(r => r.verdict === 'FAIL').map(r => r.case), ['cpu_loop']);
});

test('error 10195 means Workers Paid is not active: reported as blocked, torn down, no case run', async () => {
  const { deps, log } = harness({ exec: argv => { log.exec.push(argv); return { status: 1, output: 'A request to the Cloudflare API failed. In order to use Dynamic Workers, you must switch to a paid plan [code: 10195]' }; } });
  const receipt = await run(options, deps);
  assert.equal(receipt.outcome, 'blocked');
  assert.match(receipt.blocked, /Workers Paid/);
  assert.deepEqual(receipt.results, []);
  assert.deepEqual(log.exec.map(a => a[0]), ['deploy', 'delete']);
  assert.equal(receipt.tornDown, true);
});

test('a Worker that survives the delete is reported loudly with the exact recovery command', async () => {
  const { deps, log } = harness({ fetch: async url => (url.startsWith('https://api.cloudflare.com') ? new Response('', { status: log.exec.length ? 200 : 404 }) : Response.json(ok)) });
  const receipt = await run(options, deps);
  assert.equal(receipt.tornDown, false);
  assert.ok(log.said.some(line => /STILL EXISTS.*--teardown/.test(line)));
});
