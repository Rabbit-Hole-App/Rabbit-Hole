'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { detect } = require('../lib/detect');
const { init } = require('../lib/init');
const { runCommand, dockerfile, write, writeFlyToml } = require('../lib/generate');
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
  assert.equal(runCommand('app.py', 'gradio'), 'GRADIO_SERVER_NAME=0.0.0.0 GRADIO_SERVER_PORT=$PORT python app.py');
  assert.equal(runCommand('job.py', 'script'), 'python job.py');
});

test('detect: gradio hint', () => {
  const dir = tmp({ 'demo.py': 'import gradio as gr\ndemo = gr.Interface(lambda x: x, "text", "text")' });
  assert.equal(detect(dir).framework, 'gradio');
});

test('dockerfile: top-level system packages + fly.toml memory', () => {
  const dir = tmp({
    'small.toml': 'framework = "gradio"\nentry = "app.py"\nmemory = "2GB"\nsystem = ["libgl1", "libglib2.0-0"]\n',
    'app.py': 'import gradio as gr',
  });
  const app = detect(dir);
  assert.match(dockerfile(app, dir), /apt-get install -y --no-install-recommends libgl1 libglib2\.0-0/);
  write(dir, app);
  writeFlyToml(dir, 'small-x-abc123', app.config.memory);
  assert.match(fs.readFileSync(path.join(dir, '.small', 'fly.toml'), 'utf8'), /memory = "2gb"/);
});

test('init: writes small.toml with framework and detected env vars', () => {
  const dir = tmp({
    'app.py': 'import os\nfrom flask import Flask\napp = Flask(__name__)\nkey = os.environ["STRIPE_KEY"]\n',
    'requirements.txt': 'flask\n',
  });
  assert.equal(init(dir), true);
  const t = parse(fs.readFileSync(path.join(dir, 'small.toml'), 'utf8'));
  assert.equal(t.entry, 'app.py');
  assert.equal(t.framework, 'flask');
  assert.equal(t.deps.file, 'requirements.txt');
  assert.deepEqual(t.secrets.required, ['STRIPE_KEY']);
  assert.equal(t.access.visibility, 'domain');
});

test('init: sqlite3 import adds [storage]; SMALL_ vars are not secrets', () => {
  const dir = tmp({
    'app.py': 'import os\nimport sqlite3\nfrom flask import Flask\napp = Flask(__name__)\ndb = os.environ.get("SMALL_DATA", ".")\n',
    'requirements.txt': 'flask\n',
  });
  assert.equal(init(dir), true);
  const t = parse(fs.readFileSync(path.join(dir, 'small.toml'), 'utf8'));
  assert.equal(t.storage.path, '/data');
  assert.equal(t.storage.size, '1GB');
  assert.deepEqual(t.secrets.required, []);
});

test('init: no [storage] without sqlite3 or SMALL_DATA', () => {
  const dir = tmp({ 'app.py': 'from flask import Flask\napp = Flask(__name__)\n' });
  assert.equal(init(dir), true);
  const t = parse(fs.readFileSync(path.join(dir, 'small.toml'), 'utf8'));
  assert.equal(t.storage, undefined);
});

test('writeFlyToml: storage pins region, mounts volume, sets SMALL_DATA', () => {
  const dir = tmp({});
  fs.mkdirSync(path.join(dir, '.small'));
  writeFlyToml(dir, 'small-x-abc123', undefined, { path: '/data', region: 'iad' });
  const toml = fs.readFileSync(path.join(dir, '.small', 'fly.toml'), 'utf8');
  assert.match(toml, /primary_region = "iad"/);
  assert.match(toml, /source = "data"/);
  assert.match(toml, /destination = "\/data"/);
  assert.match(toml, /SMALL_DATA = "\/data"/);

  writeFlyToml(dir, 'small-x-abc123', undefined, undefined);
  assert.doesNotMatch(fs.readFileSync(path.join(dir, '.small', 'fly.toml'), 'utf8'), /mounts|SMALL_DATA|primary_region/);
});

test('dockerfile + write for a job: runner.py, no guard, no port', () => {
  const dir = tmp({
    'small.toml': 'name = "j"\nentry = "pipeline.py"\nframework = "script"\nkind = "job"\n',
    'pipeline.py': 'print(1)',
  });
  const app = detect(dir);
  const df = dockerfile(app, dir);
  assert.match(df, /CMD \["python", "\.small\/runner\.py", "sh", "-c", "python pipeline\.py"\]/);
  assert.match(df, /PYTHONUNBUFFERED=1/);
  assert.doesNotMatch(df, /guard\.py|EXPOSE/);
  const out = write(dir, app);
  assert.ok(fs.existsSync(path.join(out, 'runner.py')));
  assert.ok(!fs.existsSync(path.join(out, 'guard.py')));
});

test('source: normalizeRemote handles ssh, scp and https shapes', () => {
  const { normalizeRemote } = require('../lib/source');
  assert.equal(normalizeRemote('git@github.com:acme/tools.git'), 'https://github.com/acme/tools');
  assert.equal(normalizeRemote('ssh://git@github.com/acme/tools.git'), 'https://github.com/acme/tools');
  assert.equal(normalizeRemote('https://github.com/acme/tools.git'), 'https://github.com/acme/tools');
  assert.equal(normalizeRemote('https://github.com/acme/tools'), 'https://github.com/acme/tools');
  assert.equal(normalizeRemote('https://gitlab.com/acme/sub/tools.git'), 'https://gitlab.com/acme/sub/tools');
  assert.equal(normalizeRemote('not a url'), null);
  assert.equal(normalizeRemote(null), null);
});

test('source: capture reads commit, branch and dirty from a real repo; null outside one', () => {
  const { spawnSync } = require('node:child_process');
  const { capture } = require('../lib/source');
  const dir = tmp({ 'app.py': 'print(1)' });
  assert.equal(capture(dir), null); // temp dir is not a repo

  const git = (...args) => {
    const r = spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: dir, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim();
  };
  git('init');
  git('remote', 'add', 'origin', 'git@github.com:acme/tools.git');
  git('add', '.');
  git('commit', '-m', 'x', '--no-gpg-sign');
  const clean = capture(dir);
  assert.equal(clean.repoUrl, 'https://github.com/acme/tools');
  assert.equal(clean.commit, git('rev-parse', 'HEAD'));
  assert.equal(clean.branch, git('rev-parse', '--abbrev-ref', 'HEAD'));
  assert.ok(clean.commit.startsWith(clean.shortCommit));
  assert.equal(clean.dirty, false);

  fs.writeFileSync(path.join(dir, 'extra.py'), 'print(2)');
  assert.equal(capture(dir).dirty, true);
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
