'use strict';
const { spawnSync } = require('child_process');

function flyEnv(token) {
  return { ...process.env, FLY_API_TOKEN: token, FLY_ACCESS_TOKEN: token, FLY_NO_UPDATE_CHECK: '1' };
}

function run(args, token, { capture = false, cwd } = {}) {
  const r = spawnSync('flyctl', args, {
    env: flyEnv(token),
    cwd,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf8',
    shell: process.platform === 'win32', // flyctl is a .exe wrapper on Windows installs
  });
  if (r.error && r.error.code === 'ENOENT') {
    throw new Error('flyctl not installed — https://fly.io/docs/flyctl/install/');
  }
  return r;
}

function ensureApp(flyApp, org, token) {
  const r = run(['apps', 'create', flyApp, '--org', org], token, { capture: true });
  const out = (r.stdout || '') + (r.stderr || '');
  // Name collisions are near-impossible (random suffix); an existing app is ours from a prior deploy.
  if (r.status !== 0 && !/already|taken/i.test(out)) throw new Error(`flyctl apps create failed:\n${out.trim()}`);
}

function setSecrets(flyApp, token, kv) {
  const pairs = Object.entries(kv).map(([k, v]) => `${k}=${v}`);
  if (!pairs.length) return;
  const r = run(['secrets', 'set', '--app', flyApp, '--stage', ...pairs], token, { capture: true });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status !== 0 && !/no change/i.test(out)) throw new Error(`flyctl secrets set failed:\n${out.trim()}`);
}

function deploy(flyApp, token, cwd) {
  const r = run(
    ['deploy', '.', '--app', flyApp, '--config', '.small/fly.toml', '--dockerfile', '.small/Dockerfile', '--remote-only', '--ha=false', '--yes'],
    token,
    { cwd }
  );
  if (r.status !== 0) throw new Error('deploy failed — see flyctl output above');
}

function logs(flyApp, token) {
  run(['logs', '--app', flyApp, '--no-tail'], token);
}

module.exports = { ensureApp, setSecrets, deploy, logs };
