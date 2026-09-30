import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const AB = new URL('./transport-ab.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const set = {
  version: 'benchmark-v1',
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
};
const done = (transport, ideas, flags = 0.05) => ({ status: 200, body: { status: 'done', transport, grader_protocol_version: 'jev-grade-p1', ms: transport === 'direct' ? 90 : 250, model: transport === 'direct' ? 'jev-1.13.0' : 'typesafe-ai/jev', input_tokens: 600, cost: transport === 'gateway' ? 0.0000252 : null, retries: 0, jev: { ideas: ideas.map((p, i) => ({ text: `i${i}`, p })), misconception: 0.05, non_attempt: flags } } });

function stub(script) {
  const calls = [];
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      const send = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
      if (req.url === '/test/session') return send(200, { session: 's' });
      if (req.url === '/api/learn/grade/bench') {
        const body = JSON.parse(raw);
        calls.push({ transport: body.transport, attempt_id: body.attempt_id, set: body.set });
        const reply = script(body.transport, body.attempt_id.split(':').pop());
        return send(reply.status, reply.body);
      }
      if (req.url === '/api/learn/ask') calls.push({ opus: true });
      return send(404, { error: 'no' });
    });
  });
  server.keepAliveTimeout = 0;
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ server, calls, base: `http://127.0.0.1:${server.address().port}` })));
}
function workspace() {
  const dir = mkdtempSync(join(tmpdir(), 'ab-'));
  writeFileSync(join(dir, 'set.json'), JSON.stringify(set));
  writeFileSync(join(dir, '.env'), 'SMALL_TEST_BYPASS=bypass\nLEARN_BENCH_SECRET=secret-123\n');
  mkdirSync(join(dir, 'results'));
  return dir;
}
const run = args => new Promise(resolve => {
  const child = spawn(process.execPath, [AB, ...args], { env: { ...process.env, LEARN_BENCH_ALLOW_LOCAL: '1' } });
  let out = '';
  child.stdout.on('data', chunk => { out += chunk; });
  child.stderr.on('data', chunk => { out += chunk; });
  child.on('close', code => resolve({ code, out }));
});
const common = (base, dir) => ['--base', base, '--app', 'demo-app', '--env-file', join(dir, '.env'), '--results-dir', join(dir, 'results'), '--set-file', join(dir, 'set.json'), '--min-per-mode', '1'];

test('refuses a host that is not a dev clone, and the holdout', async () => {
  assert.match((await run(['--base', 'https://small-cp.zeroshothq.workers.dev', '--app', 'x'])).out, /refusing https:\/\/small-cp\.zeroshothq\.workers\.dev: not a small-cp-dev-<name> clone/);
  assert.match((await run(['--base', 'https://small-cp-dev-x.zeroshothq.workers.dev', '--app', 'x', '--holdout', 'h.json'])).out, /refusing: the transport A\/B runs on benchmark-v1 only/);
});

test('each case goes through both transports in alternating order, with its own attempt id, and never calls Opus', async () => {
  const { server, calls, base } = await stub((transport, caseId) => {
    if (caseId === 'ch1-all') return transport === 'gateway' ? { status: 502, body: { status: 'failed', error: 'Jev timed out after 3000 ms', transport, error_code: 'timeout', error_status: null } } : done(transport, [0.9, 0.9, 0.9]);
    return done(transport, [0.05, 0.05, 0.05], 0.95);
  });
  const dir = workspace();
  try {
    const result = await run(common(base, dir));
    assert.equal(result.code, 0, result.out);
    assert.deepEqual(calls.map(call => call.transport), ['gateway', 'direct', 'direct', 'gateway']);
    assert.equal(new Set(calls.map(call => call.attempt_id)).size, 4);
    assert.ok(calls.every(call => call.set === 'benchmark-v1' && !call.opus));
    assert.match(result.out, /gateway: completed 1 \/ 2 · timeouts 1 · other errors 0 · 429 retries 0 · ms p50 250 p90 250 p95 250 max 250 · accuracy 1 \/ 2 \(50%\)/);
    assert.match(result.out, /direct: completed 2 \/ 2 · timeouts 0 · other errors 0 · 429 retries 0 · ms p50 90 p90 90 p95 90 max 90 · accuracy 2 \/ 2 \(100%\)/);
    assert.match(result.out, /direct: .* cost \$0\.0000252\d* computed, \$- reported \(n 0\) · models jev-1\.13\.0/);
    assert.match(result.out, /paired: both 1 · only gateway 0 · only direct 1 · neither 0 · verdict disagreements 0/);
    const [file] = readdirSync(join(dir, 'results', 'transport-ab'));
    const saved = JSON.parse(readFileSync(join(dir, 'results', 'transport-ab', file), 'utf8'));
    assert.equal(saved.cases[0].gateway.error_code, 'timeout');
    assert.equal(saved.arms.direct.requested_model, 'jev-1.13.0');
    assert.match(saved.cases[0].direct.at, /^\d{4}-\d{2}-\d{2}T/);
  } finally { server.close(); }
});

test('a clone that ignores the transport field stops the run', async () => {
  const { server, base } = await stub(() => done('gateway', [0.9, 0.9, 0.9]));
  const dir = workspace();
  try {
    const result = await run(common(base, dir));
    assert.equal(result.code, 1);
    assert.match(result.out, /asked for direct, the clone answered gateway: redeploy the clone/);
  } finally { server.close(); }
});
