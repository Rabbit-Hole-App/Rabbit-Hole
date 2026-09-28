import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawnSync, spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const BENCH = new URL('./bench.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const tinySet = version => ({
  version,
  challenges: [
    { id: 'ch1', mode: 'challenge', prompt: 'Why exp?', expects: ['positive', 'sums to one', 'bigger wins'] },
    { id: 'ch2', mode: 'challenge', prompt: 'Why chain rule?', expects: ['local derivative', 'multiply through', 'flows backward'] },
    { id: 'ch3', mode: 'challenge', prompt: 'Why learning rate?', expects: ['step size', 'too big diverges', 'too small is slow'] },
    { id: 'eb1', mode: 'explain_back', prompt: 'Explain descent.', expects: ['gradient', 'opposite step', 'learning rate'] },
    { id: 'eb2', mode: 'explain_back', prompt: 'Explain embeddings.', expects: ['lookup table', 'learned vector', 'one row per token'] },
    { id: 'eb3', mode: 'explain_back', prompt: 'Explain attention.', expects: ['compares tokens', 'softmax weights', 'weighted sum'] },
  ],
  cases: [
    { id: 'ch1-all', challenge: 'ch1', pattern: 'all_ideas', answer: 'all three', gold: { ideas: [true, true, true], misconception: false, non_attempt: false } },
    { id: 'eb1-idk', challenge: 'eb1', pattern: 'idk', answer: 'no idea', gold: { ideas: [false, false, false], misconception: false, non_attempt: true } },
  ],
});

// A stub clone: /test/session, /api/learn/grade/bench (scripted per case id), /api/learn/ask.
function stubServer(script) {
  const calls = { grade: [] };
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      const send = (status, body, type = 'application/json') => { res.writeHead(status, { 'Content-Type': type }); res.end(typeof body === 'string' ? body : JSON.stringify(body)); };
      if (req.url === '/test/session') return send(200, { session: 'stub-session' });
      if (req.url === '/api/learn/grade/bench') {
        const body = JSON.parse(raw);
        const caseId = body.attempt_id.split(':').pop();
        calls.grade.push(caseId);
        const reply = script(caseId, calls.grade.filter(id => id === caseId).length);
        return send(reply.status, reply.body);
      }
      if (req.url === '/v1/models' && script.pricing) return send(200, { data: [{ id: 'typesafe-ai/jev', pricing: script.pricing }] });
      if (req.url === '/api/learn/ask') return send(200, `event: chunk\ndata: ${JSON.stringify({ text: 'VERDICT: good\nfine' })}\n\nevent: done\ndata: {"ok":true}\n\n`, 'text/event-stream');
      return send(404, { error: 'no' });
    });
  });
  // fail() calls process.exit() mid-run; a lingering keep-alive socket to this
  // stub at that moment crashes Node on Windows (libuv UV_HANDLE_CLOSING).
  server.keepAliveTimeout = 0;
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ server, calls, base: `http://127.0.0.1:${server.address().port}` })));
}
const done = (ideas = [0.9, 0.9, 0.9]) => ({ status: 200, body: { status: 'done', grader_protocol_version: 'jev-grade-p1', ms: 120, model: 'typesafe-ai/jev', generation_id: 'gen_x', jev: { ideas: ideas.map((p, i) => ({ text: `i${i}`, p })), misconception: 0.05, non_attempt: 0.05 } } });

function workspace(set, extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'bench-'));
  writeFileSync(join(dir, 'set.json'), JSON.stringify(set));
  writeFileSync(join(dir, '.env'), 'SMALL_TEST_BYPASS=bypass\nLEARN_BENCH_SECRET=secret-123\n');
  mkdirSync(join(dir, 'results'));
  Object.entries(extra).forEach(([name, text]) => writeFileSync(join(dir, name), text));
  return dir;
}
const run = (args, env = {}) => new Promise(resolve => {
  const child = spawn(process.execPath, [BENCH, ...args], { env: { ...process.env, LEARN_BENCH_ALLOW_LOCAL: '1', ...env } });
  let out = '';
  child.stdout.on('data', chunk => { out += chunk; });
  child.stderr.on('data', chunk => { out += chunk; });
  child.on('close', code => resolve({ code, out }));
});
const common = (base, dir) => ['--base', base, '--app', 'demo-app', '--env-file', join(dir, '.env'), '--results-dir', join(dir, 'results'), '--min-per-mode', '1', '--pending-wait-ms', '1'];

test('refuses a host that is not a dev clone', () => {
  const result = spawnSync(process.execPath, [BENCH, '--base', 'https://small-cp.example.com', '--app', 'demo-app'], { encoding: 'utf8', env: { ...process.env, LEARN_BENCH_ALLOW_LOCAL: '' } });
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /refusing .* not a small-cp-dev-<name> clone/);
});

test('pending is re-sent, then scored as an error; 409 is an incomplete error; never a grade', async () => {
  const { server, base } = await stubServer((caseId, attempt) => {
    if (caseId === 'ch1-all') return attempt < 3 ? { status: 202, body: { status: 'pending' } } : done();
    return { status: 409, body: { status: 'incomplete', error: 'never finished' } };
  });
  const dir = workspace(tinySet('benchmark-v1'));
  try {
    const result = await run([...common(base, dir), '--set-file', join(dir, 'set.json')]);
    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /✓ target: http:\/\/127\.0\.0\.1:\d+ · app demo-app · set benchmark-v1 · run benchmark-v1-\d{4}-\d{2}-\d{2}-a · 2 cases \(1 challenge \/ 1 explain_back\) · ~2 Opus calls/);
    assert.match(result.out, /jev errors: pending 0 · incomplete 1 · failed 0/);
    const [file] = readdirSync(join(dir, 'results', 'benchmark-v1'));
    const saved = JSON.parse(readFileSync(join(dir, 'results', 'benchmark-v1', file), 'utf8'));
    assert.equal(saved.cases.find(item => item.id === 'ch1-all').jev.verdict, 'good');
    assert.equal(saved.cases.find(item => item.id === 'eb1-idk').jev.error, 'incomplete');
  } finally { server.close(); }
});

test('jev cost is computed from input tokens × the published price, not the gateway\'s reported $0', async () => {
  const script = () => ({ ...done(), body: { ...done().body, cost: 0, input_tokens: 300 } });
  script.pricing = { input: '0.000000042', output: '0' };
  const { server, base } = await stubServer(script);
  const dir = workspace(tinySet('benchmark-v1'));
  try {
    const result = await run([...common(base, dir), '--set-file', join(dir, 'set.json')]);
    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /✓ jev cost method: input tokens × \$0\.000000042\/token published at http:\/\/127\.0\.0\.1:\d+\/v1\/models \(output \$0\)/);
    assert.match(result.out, /jev cost per grade \$0\.0000126\d* computed \(n 2; input tokens/);
    assert.match(result.out, /gateway reported \$0 \(n 2\)/);
    const [file] = readdirSync(join(dir, 'results', 'benchmark-v1'));
    const saved = JSON.parse(readFileSync(join(dir, 'results', 'benchmark-v1', file), 'utf8'));
    assert.match(saved.jev_cost_per_grade.method, /^input tokens × /);
  } finally { server.close(); }
});

test('with no published input-only price the cost says not computed instead of $0', async () => {
  const script = () => ({ ...done(), body: { ...done().body, cost: 0, input_tokens: 300 } });
  script.pricing = { input: '0.000000042', output: '0.000001' };
  const { server, base } = await stubServer(script);
  const dir = workspace(tinySet('benchmark-v1'));
  try {
    const result = await run([...common(base, dir), '--set-file', join(dir, 'set.json')]);
    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /✗ jev cost method: not computed: no input-only price for typesafe-ai\/jev/);
    assert.match(result.out, /jev cost per grade \$- computed \(n 0; not computed/);
  } finally { server.close(); }
});

test('a pending that never resolves is scored as a pending error', async () => {
  const { server, base, calls } = await stubServer(() => ({ status: 202, body: { status: 'pending' } }));
  const dir = workspace(tinySet('benchmark-v1'));
  try {
    const result = await run([...common(base, dir), '--set-file', join(dir, 'set.json')]);
    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /jev errors: pending 2 · incomplete 0 · failed 0/);
    assert.equal(calls.grade.filter(id => id === 'ch1-all').length, 6, 'the first send plus 5 re-sends');
  } finally { server.close(); }
});

test('--holdout-hash-file is refused outside local mode', async () => {
  const dir = workspace(tinySet('benchmark-v1-holdout'), { 'HOLDOUT.sha256': 'f'.repeat(64) });
  const result = await new Promise(resolve => {
    const child = spawn(process.execPath, [BENCH, '--base', 'https://small-cp-dev-x.zeroshothq.workers.dev', '--app', 'demo-app', '--env-file', join(dir, '.env'), '--holdout', join(dir, 'set.json'), '--holdout-hash-file', join(dir, 'HOLDOUT.sha256')], { env: { ...process.env, LEARN_BENCH_ALLOW_LOCAL: '' } });
    let out = '';
    child.stdout.on('data', chunk => { out += chunk; });
    child.stderr.on('data', chunk => { out += chunk; });
    child.on('close', code => resolve({ code, out }));
  });
  assert.equal(result.code, 1);
  assert.match(result.out, /refusing --holdout-hash-file with --holdout/);
});

test('a 400 from the bench route stops the run with the server\'s message', async () => {
  const { server, base } = await stubServer(() => ({ status: 400, body: { error: 'expects must be 1-8 ideas of 1-300 characters, each non-empty without code blocks' } }));
  const dir = workspace(tinySet('benchmark-v1'));
  try {
    const result = await run([...common(base, dir), '--set-file', join(dir, 'set.json')]);
    assert.equal(result.code, 1);
    assert.match(result.out, /400 from the bench route: expects must be 1-8 ideas/);
  } finally { server.close(); }
});

test('403 and 404 print the server\'s own reason unless it names the bench secret; 401 stops the run', async () => {
  const dir = workspace(tinySet('benchmark-v1'));
  const trial = async (status, error, expected) => {
    const { server, base } = await stubServer(() => ({ status, body: { error } }));
    try {
      const result = await run([...common(base, dir), '--set-file', join(dir, 'set.json')]);
      assert.equal(result.code, 1, result.out);
      assert.match(result.out, expected);
    } finally { server.close(); }
  };
  await trial(404, 'Not found', /404 from the bench route: set LEARN_BENCH_SECRET on the clone/);
  await trial(403, 'Bench secret required', /403 from the bench route: set LEARN_BENCH_SECRET in .*\.env to match the clone/);
  await trial(404, 'Repository not found in this workspace', /404 from the bench route: Repository not found in this workspace/);
  await trial(403, 'Canvas explanations are available in regular Small dev only.', /403 from the bench route: Canvas explanations are available/);
  await trial(401, 'Sign in to this workspace first', /401 from the bench route: Sign in to this workspace first - get a fresh test session/);
});

test('a holdout whose hash does not match is refused before any call', async () => {
  const { server, base, calls } = await stubServer(() => done());
  const dir = workspace(tinySet('benchmark-v1-holdout'), { 'HOLDOUT.sha256': 'f'.repeat(64) });
  try {
    const result = await run([...common(base, dir), '--holdout', join(dir, 'set.json'), '--holdout-hash-file', join(dir, 'HOLDOUT.sha256')]);
    assert.equal(result.code, 2);
    assert.match(result.out, /does not match HOLDOUT\.sha256/);
    assert.equal(calls.grade.length, 0);
  } finally { server.close(); }
});

test('a holdout run is aggregate-only, and a later grader change burns it', async () => {
  const { server, base } = await stubServer(() => done());
  const set = tinySet('benchmark-v1-holdout');
  const hash = createHash('sha256').update(JSON.stringify(set)).digest('hex');
  const dir = workspace(set, { 'HOLDOUT.sha256': hash });
  const args = [...common(base, dir), '--holdout', join(dir, 'set.json'), '--holdout-hash-file', join(dir, 'HOLDOUT.sha256')];
  try {
    const first = await run(args);
    assert.equal(first.code, 0, first.out);
    const [file] = readdirSync(join(dir, 'results', 'benchmark-v1-holdout'));
    const saved = JSON.parse(readFileSync(join(dir, 'results', 'benchmark-v1-holdout', file), 'utf8'));
    assert.equal(saved.cases, undefined, 'no per-case output for a holdout');
    assert.doesNotMatch(JSON.stringify(saved), /all three|no idea/, 'no answer text for a holdout');
    assert.doesNotMatch(first.out, /best threshold/, 'no tuning number in holdout output');
    saved.thresholds = { yes: 0.8, no: 0.3 };
    writeFileSync(join(dir, 'results', 'benchmark-v1-holdout', file), JSON.stringify(saved));
    const second = await run(args);
    assert.equal(second.code, 2);
    assert.match(second.out, /holdout burned by thresholds: write benchmark-v2-holdout/);
  } finally { server.close(); }
});

test('a holdout is burned when grader_protocol_fingerprint changes', async () => {
  const { server, base } = await stubServer(() => done());
  const set = tinySet('benchmark-v1-holdout');
  const hash = createHash('sha256').update(JSON.stringify(set)).digest('hex');
  const dir = workspace(set, { 'HOLDOUT.sha256': hash });
  const args = [...common(base, dir), '--holdout', join(dir, 'set.json'), '--holdout-hash-file', join(dir, 'HOLDOUT.sha256')];
  try {
    const first = await run(args);
    assert.equal(first.code, 0, first.out);
    const [file] = readdirSync(join(dir, 'results', 'benchmark-v1-holdout'));
    const saved = JSON.parse(readFileSync(join(dir, 'results', 'benchmark-v1-holdout', file), 'utf8'));
    saved.grader_protocol_fingerprint = 'changed-fingerprint';
    writeFileSync(join(dir, 'results', 'benchmark-v1-holdout', file), JSON.stringify(saved));
    const second = await run(args);
    assert.equal(second.code, 2);
    assert.match(second.out, /holdout burned by grader_protocol_fingerprint: write benchmark-v2-holdout/);
  } finally { server.close(); }
});

test('a holdout is burned when verdict_logic_fingerprint changes', async () => {
  const { server, base } = await stubServer(() => done());
  const set = tinySet('benchmark-v1-holdout');
  const hash = createHash('sha256').update(JSON.stringify(set)).digest('hex');
  const dir = workspace(set, { 'HOLDOUT.sha256': hash });
  const args = [...common(base, dir), '--holdout', join(dir, 'set.json'), '--holdout-hash-file', join(dir, 'HOLDOUT.sha256')];
  try {
    const first = await run(args);
    assert.equal(first.code, 0, first.out);
    const [file] = readdirSync(join(dir, 'results', 'benchmark-v1-holdout'));
    const saved = JSON.parse(readFileSync(join(dir, 'results', 'benchmark-v1-holdout', file), 'utf8'));
    saved.verdict_logic_fingerprint = 'changed-fingerprint';
    writeFileSync(join(dir, 'results', 'benchmark-v1-holdout', file), JSON.stringify(saved));
    const second = await run(args);
    assert.equal(second.code, 2);
    assert.match(second.out, /holdout burned by verdict_logic_fingerprint: write benchmark-v2-holdout/);
  } finally { server.close(); }
});
