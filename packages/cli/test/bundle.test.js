'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { buildBundle } = require('../lib/bundle');

function tmp(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'small-bundle-'));
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), content);
  }
  return dir;
}

test('bundle: includes py files + small.toml + requirements.txt, excludes junk dirs and .gitignore', () => {
  const dir = tmp({
    'app.py': 'import helpers\nfrom utils.text import clean\n',
    'helpers.py': 'import subprocess\n',
    'utils/text.py': 'def clean(s): return s\n',
    'requirements.txt': 'flask\n',
    'small.toml': 'entry = "app.py"\n',
    '.gitignore': 'data/\n*.local.py\n',
    '.venv/lib.py': 'x = 1\n',
    '__pycache__/app.pyc.py': 'x = 1\n',
    'tests/test_app.py': 'x = 1\n',
    'data/gen.py': 'x = 1\n',
    'config.local.py': 'x = 1\n',
  });
  const { bundle, skipped } = buildBundle(dir, 'app.py', {});
  for (const f of ['app.py', 'helpers.py', 'utils/text.py', 'small.toml', 'requirements.txt']) {
    assert.ok(bundle.includes(`=== ${f} ===`), `missing ${f}`);
  }
  for (const f of ['.venv', '__pycache__', 'tests/test_app.py', 'data/gen.py', 'config.local.py']) {
    assert.ok(!bundle.includes(f), `should exclude ${f}`);
  }
  assert.deepEqual(skipped, []);
});

test('bundle: secret values redacted — model sees names only', () => {
  const dir = tmp({
    'app.py': 'import os\nSTRIPE_KEY = "sk-live-hunter22222"\nos.environ.get("STRIPE_KEY")\n',
    'small.toml': 'entry = "app.py"\n',
  });
  const { bundle } = buildBundle(dir, 'app.py', { STRIPE_KEY: 'sk-live-hunter22222' });
  assert.ok(!bundle.includes('sk-live-hunter22222'));
  assert.ok(bundle.includes('«redacted»'));
  assert.ok(bundle.includes('STRIPE_KEY')); // the name stays
});

test('bundle: over ~100k tokens falls back to transitive imports from entry, rest skipped', () => {
  const dir = tmp({
    'app.py': 'import helpers\n',
    'helpers.py': 'import subprocess\n',
    'notebook_dump.py': '# filler\n' + 'x = 1  # padding line\n'.repeat(30000),
    'small.toml': 'entry = "app.py"\n',
  });
  const { bundle, skipped } = buildBundle(dir, 'app.py', {});
  assert.ok(bundle.includes('=== app.py ==='));
  assert.ok(bundle.includes('=== helpers.py ==='));
  assert.ok(!bundle.includes('=== notebook_dump.py ==='));
  assert.deepEqual(skipped, ['notebook_dump.py']);
});
