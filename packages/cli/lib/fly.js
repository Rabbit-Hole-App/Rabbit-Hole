'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const exe = process.platform === 'win32' ? 'flyctl.exe' : 'flyctl';
function flyctlBin() {
  for (const dir of [path.join(os.homedir(), '.fly', 'bin'), path.join(os.homedir(), '.small', 'bin')]) {
    const p = path.join(dir, exe);
    if (fs.existsSync(p)) return p;
  }
  return 'flyctl'; // fall back to PATH
}

function versionLine() {
  const r = spawnSync(flyctlBin(), ['version'], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
  if (r.error && r.error.code === 'ENOENT') return null;
  return ((r.stdout || '').trim().split('\n')[0] || 'flyctl').trim();
}

// Follow-redirect download (GitHub releases 302 to a storage host). Stdlib only.
function fetchTo(url, dest, hops = 0) {
  return new Promise((resolve, reject) => {
    if (hops > 5) return reject(new Error('too many redirects'));
    require('https').get(url, { headers: { 'User-Agent': 'small-deploy' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(fetchTo(res.headers.location, dest, hops + 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`download failed (${res.statusCode}) ${url}`)); }
      const out = fs.createWriteStream(dest);
      res.pipe(out);
      out.on('finish', () => out.close(resolve));
      out.on('error', reject);
    }).on('error', reject);
  });
}

function latestTag() {
  return new Promise((resolve) => {
    require('https').get('https://api.github.com/repos/superfly/flyctl/releases/latest',
      { headers: { 'User-Agent': 'small-deploy' } }, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          try { resolve(JSON.parse(body).tag_name.replace(/^v/, '')); } catch { resolve(null); }
        });
      }).on('error', () => resolve(null));
  });
}

// Deploy calls this FIRST: the build tool must exist before anything touches
// the network or the user's cloud account (a role once got created for a deploy
// that could never succeed). Missing -> download the official release binary
// into ~/.small/bin - stdlib https + the system tar, no shell scripts piped.
const PINNED = '0.4.99'; // fallback when the GitHub API is unreachable/rate-limited
async function ensureInstalled() {
  const have = versionLine();
  if (have) return have;
  const osName = { linux: 'Linux', darwin: 'macOS', win32: 'Windows' }[process.platform];
  const arch = { x64: 'x86_64', arm64: 'arm64' }[process.arch];
  const manual = process.platform === 'win32'
    ? 'pwsh -Command "iwr https://fly.io/install.ps1 -useb | iex"'
    : 'curl -L https://fly.io/install.sh | sh';
  if (!osName || !arch) throw new Error(`flyctl not installed and no prebuilt binary for ${process.platform}/${process.arch} - install it yourself: ${manual}`);
  const v = (await latestTag()) || PINNED;
  const asset = `flyctl_${v}_${osName}_${arch}.${process.platform === 'win32' ? 'zip' : 'tar.gz'}`;
  console.log(`flyctl not found - downloading v${v} from github.com/superfly/flyctl (one time)`);
  const binDir = path.join(os.homedir(), '.small', 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  const archive = path.join(os.tmpdir(), asset);
  try {
    await fetchTo(`https://github.com/superfly/flyctl/releases/download/v${v}/${asset}`, archive);
    const t = spawnSync('tar', ['-xf', archive, '-C', binDir, exe], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
    if (t.status !== 0) throw new Error((t.stderr || 'tar extract failed').trim());
    if (process.platform !== 'win32') fs.chmodSync(path.join(binDir, exe), 0o755);
  } catch (e) {
    throw new Error(`flyctl auto-install failed (${e.message}) - install it yourself: ${manual}\nthen re-run small deploy`);
  } finally {
    try { fs.unlinkSync(archive); } catch {}
  }
  const now = versionLine();
  if (!now) throw new Error(`flyctl downloaded but does not run - install it yourself: ${manual}`);
  console.log(`✓ flyctl installed to ${binDir}`);
  return now;
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
    throw new Error('flyctl not installed - https://fly.io/docs/flyctl/install/');
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
  if (r.status !== 0) throw new Error('deploy failed - see flyctl output above');
}

// Jobs: build + push the image only, start nothing. Label makes the ref
// deterministic so no output parsing is needed.
function buildImage(flyApp, token, cwd, label) {
  const r = run(
    ['deploy', '.', '--app', flyApp, '--config', '.small/fly.toml', '--dockerfile', '.small/Dockerfile', '--remote-only', '--build-only', '--push', '--image-label', label, '--yes'],
    token,
    { cwd }
  );
  if (r.status !== 0) throw new Error('image build failed - see flyctl output above');
  return `registry.fly.io/${flyApp}:${label}`;
}

function logs(flyApp, token) {
  run(['logs', '--app', flyApp, '--no-tail'], token);
}

module.exports = { ensureInstalled, setSecrets, deploy, buildImage, logs };
