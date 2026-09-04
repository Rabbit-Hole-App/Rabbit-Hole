'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function flyctlBin() {
  const local = path.join(os.homedir(), '.fly', 'bin', process.platform === 'win32' ? 'flyctl.exe' : 'flyctl');
  return fs.existsSync(local) ? local : 'flyctl'; // fall back to PATH
}

function flyEnv(token) {
  return { ...process.env, FLY_API_TOKEN: token, FLY_ACCESS_TOKEN: token, FLY_NO_UPDATE_CHECK: '1' };
}

function run(args, token, { capture = false, cwd } = {}) {
  const r = spawnSync(flyctlBin(), args, {
    env: flyEnv(token),
    cwd,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf8',
  });
  if (r.error && r.error.code === 'ENOENT') {
    throw new Error('flyctl not installed — https://fly.io/docs/flyctl/install/');
  }
  return r;
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

module.exports = { setSecrets, deploy, logs };
