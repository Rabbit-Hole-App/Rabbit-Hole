import assert from 'node:assert';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { runReview, generateRunbook, computeRisk, validateReview, hostAllowed, MODEL } from '../src/review.js';

// The bundle is built by the CLI; use the real builder so the cross-file flow
// genuinely depends on both fixture files reaching the model.
const { buildBundle } = createRequire(import.meta.url)('../../cli/lib/bundle.js');

const emptyReview = () => ({
  summary: 'a test app',
  risk: 'low',
  secrets: [],
  undeclared_secrets: [],
  outbound: [],
  aws: [],
  filesystem: { reads: [], writes: [] },
  shell_exec: [],
  user_input: [],
  findings: [],
  skipped: [],
  runbook: '# a test app\n\n## What it does\n\nA test app.\n',
});

function tmpApp(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'small-review-'));
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), content);
  }
  return dir;
}

function dbStub() {
  const writes = [];
  return {
    writes,
    prepare: (sql) => ({ bind: (...args) => ({ first: async () => null, run: async () => writes.push({ sql, args }) }) }),
  };
}

// Fake Anthropic endpoint: derives the review from the bundle it was sent, so
// assertions about "found across both files" actually test what we sent.
function mockAnthropic(reviewFromBundle) {
  return async (url, init) => {
    assert.match(String(url), /api\.anthropic\.com/);
    const body = JSON.parse(init.body);
    assert.equal(body.model, MODEL);
    assert.equal(body.output_config.format.type, 'json_schema');
    const review = reviewFromBundle(body.messages[0].content);
    return new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(review) }] }), { status: 200 });
  };
}

async function withFetch(fetchImpl, fn) {
  const real = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try {
    return await fn();
  } finally {
    globalThis.fetch = real;
  }
}

const stored = (db) => JSON.parse(db.writes[0].args[0]);

test('review finds form-field → subprocess flow across app.py and helpers.py; risk high', async () => {
  const dir = tmpApp({
    'app.py': 'from flask import Flask, request\nimport helpers\napp = Flask(__name__)\n@app.route("/", methods=["POST"])\ndef run():\n    return helpers.process(request.form["cmd"])\n',
    'helpers.py': 'import subprocess\ndef process(cmd):\n    return subprocess.run(cmd, shell=True, capture_output=True).stdout\n',
    'requirements.txt': 'flask\n',
    'small.toml': 'name = "fixture"\nentry = "app.py"\n',
  });
  const { bundle, skipped } = buildBundle(dir, 'app.py', {});
  const db = dbStub();
  await withFetch(
    mockAnthropic((sent) => {
      // the mocked model only reports the flow if both files made it into the bundle
      const seesFlow = sent.includes('=== app.py ===') && sent.includes('=== helpers.py ===') && sent.includes('subprocess.run');
      if (!seesFlow) return emptyReview();
      return {
        ...emptyReview(),
        risk: 'low', // deliberately wrong — the Worker must overwrite it
        shell_exec: [{ command: 'subprocess.run(cmd, shell=True)', user_input_reaches_it: true, at: 'helpers.py:3' }],
        user_input: [{ source: "form field 'cmd'", flows_to: 'subprocess.run via helpers.process', validated: false }],
        findings: [
          { severity: 'low', at: 'app.py:6', text: 'no input validation' },
          { severity: 'high', at: 'helpers.py:3', text: 'user input reaches subprocess without validation' },
        ],
      };
    }),
    () => runReview({ ANTHROPIC_API_KEY: 'k', DB: db }, 1, bundle, skipped)
  );
  assert.equal(db.writes.length, 1);
  const review = stored(db);
  assert.equal(review.risk, 'high');
  assert.equal(review.shell_exec[0].at, 'helpers.py:3');
  assert.match(review.user_input[0].flows_to, /subprocess/);
  assert.equal(review.findings[0].severity, 'high'); // sorted, high first
  assert.equal(db.writes[0].args[1], MODEL);
});

test('undeclared os.environ["FOO"] → undeclared_secrets == ["FOO"], risk >= medium', async () => {
  const dir = tmpApp({
    'app.py': 'import os\nfrom flask import Flask\napp = Flask(__name__)\nkey = os.environ["FOO"]\n',
    'small.toml': 'name = "fixture"\nentry = "app.py"\n\n[secrets]\nrequired = []\n',
  });
  const { bundle, skipped } = buildBundle(dir, 'app.py', {});
  const db = dbStub();
  await withFetch(
    mockAnthropic((sent) =>
      sent.includes('os.environ["FOO"]') ? { ...emptyReview(), undeclared_secrets: ['FOO'] } : emptyReview()
    ),
    () => runReview({ ANTHROPIC_API_KEY: 'k', DB: db }, 2, bundle, skipped)
  );
  const review = stored(db);
  assert.deepEqual(review.undeclared_secrets, ['FOO']);
  assert.ok(['medium', 'high'].includes(review.risk));
});

test('platform SMALL_* vars are not undeclared secrets and do not raise risk', async () => {
  const db = dbStub();
  await withFetch(
    mockAnthropic(() => ({
      ...emptyReview(),
      secrets: [{ name: 'SMALL_DATA', declared: false, used_at: 'app.py:10' }],
      undeclared_secrets: ['SMALL_DATA'],
    })),
    () => runReview({ ANTHROPIC_API_KEY: 'k', DB: db }, 3, 'bundle', [])
  );
  const review = stored(db);
  assert.deepEqual(review.undeclared_secrets, []);
  assert.deepEqual(review.secrets, []);
  assert.equal(review.risk, 'low');
});

test('risk rules: outbound allowlist', () => {
  assert.ok(hostAllowed('api.stripe.com'));
  assert.ok(hostAllowed('lambda.us-east-1.amazonaws.com'));
  assert.ok(!hostAllowed('evil.example.com'));
  assert.equal(computeRisk({ ...emptyReview(), outbound: [{ host: 'api.openai.com', purpose: '', at: '' }] }), 'low');
  assert.equal(computeRisk({ ...emptyReview(), outbound: [{ host: 'evil.example.com', purpose: '', at: '' }] }), 'medium');
  assert.equal(
    computeRisk({ ...emptyReview(), shell_exec: [{ command: 'x', user_input_reaches_it: true, at: 'a.py:1' }] }),
    'high'
  );
  assert.equal(computeRisk(emptyReview()), 'low');
});

test('runbook is stored with the review, review summary line appended with the computed risk', async () => {
  const db = dbStub();
  await withFetch(
    mockAnthropic(() => ({
      ...emptyReview(),
      summary: 'a shell runner',
      risk: 'low', // deliberately wrong — the appended line must carry the computed risk
      shell_exec: [{ command: 'x', user_input_reaches_it: true, at: 'a.py:1' }],
      runbook: '# shell runner\n\n## What it does\n\nRuns shells.\n',
    })),
    () => runReview({ ANTHROPIC_API_KEY: 'k', DB: db }, 5, 'bundle', [])
  );
  const review = stored(db);
  assert.ok(review.runbook.startsWith('# shell runner\n'));
  assert.ok(review.runbook.endsWith('\n---\n*review: a shell runner - risk: high*\n'));
});

test('generateRunbook returns the finished runbook without a DB', async () => {
  const runbook = await withFetch(
    mockAnthropic(() => emptyReview()),
    () => generateRunbook({ ANTHROPIC_API_KEY: 'k' }, 'bundle')
  );
  assert.ok(runbook.startsWith('# a test app\n'));
  assert.match(runbook, /\*review: a test app - risk: low\*\n$/);
});

test('missing or empty runbook fails validation', () => {
  const { runbook, ...withoutRunbook } = emptyReview();
  assert.throws(() => validateReview(withoutRunbook));
  assert.throws(() => validateReview({ ...emptyReview(), runbook: '  ' }));
});

test('API failure never throws and stores nothing', async () => {
  const db = dbStub();
  await withFetch(
    async () => {
      throw new Error('network down');
    },
    () => runReview({ ANTHROPIC_API_KEY: 'k', DB: db }, 3, 'bundle', [])
  );
  assert.equal(db.writes.length, 0);
});

test('invalid JSON from the model stores nothing', async () => {
  const db = dbStub();
  await withFetch(
    async () => new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'not json' }] }), { status: 200 }),
    () => runReview({ ANTHROPIC_API_KEY: 'k', DB: db }, 4, 'bundle', [])
  );
  assert.equal(db.writes.length, 0);
  assert.throws(() => validateReview({ summary: 's' }));
});
