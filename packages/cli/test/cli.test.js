'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { detect } = require('../lib/detect');
const { runCommand, dockerfile, write } = require('../lib/generate');
const { parse } = require('../lib/toml');

function tmp(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'small-test-'));
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), content);
  return dir;
}

test('toml parses small.toml shape', () => {
  const t = parse('name = "counter"\nentry = "app.py"\n\n[deps]\nfile = "requirements.txt"\nsystem = []\n\n[secrets]\nrequired = ["API_KEY"]\n');
  assert.equal(t.name, 'counter');
  assert.equal(t.entry, 'app.py');
  assert.deepEqual(t.deps.system, []);
  assert.deepEqual(t.secrets.required, ['API_KEY']);
});

test('detect: small.toml wins', () => {
  const dir = tmp({ 'small.toml': 'name = "x"\nentry = "web.py"\n', 'web.py': 'print(1)', 'app.py': 'from flask import Flask\napp = Flask(__name__)' });
  const app = detect(dir);
  assert.equal(app.entry, 'web.py');
  assert.equal(app.via, 'small.toml');
});

test('detect: framework hint', () => {
  const dir = tmp({ 'tool.py': 'from flask import Flask\napp = Flask(__name__)' });
  const app = detect(dir);
  assert.equal(app.entry, 'tool.py');
  assert.equal(app.framework, 'flask');
  assert.equal(app.via, 'framework hint');
});

test('detect: filename convention', () => {
  const dir = tmp({ 'main.py': 'print(1)', 'other.py': 'print(2)' });
  const app = detect(dir);
  assert.equal(app.entry, 'main.py');
  assert.equal(app.framework, 'script');
});

test('detect: only .py file', () => {
  const dir = tmp({ 'thing.py': 'print(1)' });
  assert.equal(detect(dir).entry, 'thing.py');
});

test('detect: fails with fix message', () => {
  const dir = tmp({ 'a.py': 'print(1)', 'b.py': 'print(2)' });
  assert.throws(() => detect(dir), /add entry = "app.py" to small.toml/);
});

test('run commands per framework', () => {
  assert.equal(runCommand('app.py', 'flask'), 'gunicorn --bind 0.0.0.0:$PORT --timeout 300 app:app');
  assert.equal(runCommand('api.py', 'fastapi'), 'uvicorn api:app --host 0.0.0.0 --port $PORT');
  assert.match(runCommand('app.py', 'streamlit'), /^streamlit run app\.py/);
  assert.equal(runCommand('job.py', 'script'), 'python job.py');
});

test('dockerfile + write for counter example', () => {
  const counter = path.join(__dirname, '..', '..', '..', 'examples', 'counter');
  const app = detect(counter);
  const df = dockerfile(app, counter);
  assert.match(df, /FROM python:3\.13-slim/);
  assert.match(df, /RUN pip install --no-cache-dir -r requirements\.txt/);
  assert.match(df, /CMD \["python", "\.small\/guard\.py", "sh", "-c", "gunicorn --bind 0\.0\.0\.0:\$PORT --timeout 300 app:app"\]/);

  const dir = tmp({ 'app.py': 'from flask import Flask\napp = Flask(__name__)' });
  const out = write(dir, detect(dir));
  assert.ok(fs.existsSync(path.join(out, 'Dockerfile')));
  assert.ok(fs.existsSync(path.join(out, 'guard.py')));
  assert.match(fs.readFileSync(path.join(dir, '.dockerignore'), 'utf8'), /\.env/);
});
