'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { listPyFiles } = require('./bundle');

// os.environ["X"] bracket reads — no default, so an unset var crashes at runtime
const HARD_ENV_RE = /os\.environ\[\s*["']([A-Za-z_]\w*)["']\s*\]/g;

function pythonExe() {
  for (const exe of ['python3', 'python']) {
    const r = spawnSync(exe, ['--version'], { encoding: 'utf8' });
    if (r.status === 0) return exe;
  }
  return null;
}

// Syntax-check every bundled .py with the local python — a syntax error can never
// deploy, so this one is a hard stop. Silently skipped when python is not installed.
function checkSyntax(dir) {
  const exe = pythonExe();
  if (!exe) return 'skipped (no local python)';
  const files = listPyFiles(dir);
  if (!files.length) return 'no .py files';
  const r = spawnSync(exe, ['-m', 'py_compile', ...files.map((f) => path.join(dir, f))], { encoding: 'utf8' });
  if (r.status !== 0) {
    const line = (r.stderr || '').split('\n').find((l) => l.includes('Error') || l.trim()) || 'syntax error';
    throw new Error(`syntax: ${line.trim()} — fix before deploying`);
  }
  return `${files.length} file${files.length === 1 ? '' : 's'} compile`;
}

// requirement line -> package name: strip comments, flags, extras, pins, markers
function depNames(text) {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/#.*$/, '').trim())
    .filter((l) => l && !l.startsWith('-'))
    .map((l) => l.split(/[\s[=<>!~;@]/)[0])
    .filter(Boolean);
}

// Each name HEAD-checked against PyPI. Warnings only — private indexes and network
// flake must never block a deploy; a typo'd public dep still surfaces before the
// minutes-long remote build fails on it.
async function checkDeps(dir, file) {
  const p = path.join(dir, file || 'requirements.txt');
  if (!fs.existsSync(p)) return null;
  const names = depNames(fs.readFileSync(p, 'utf8'));
  const missing = [];
  await Promise.all(
    names.map(async (n) => {
      try {
        const norm = n.toLowerCase().replace(/[._-]+/g, '-'); // PEP 503
        const resp = await fetch(`https://pypi.org/simple/${norm}/`, { method: 'HEAD', signal: AbortSignal.timeout(4000) });
        if (resp.status === 404) missing.push(n);
      } catch {} // network hiccup is not the dep's fault
    })
  );
  return { count: names.length, missing };
}

// Bracket env reads that are neither declared secrets, in .env, nor SMALL_ platform
// vars — they will be unset in the container. Plus: a job reading SMALL_INPUT_*
// without [inputs] declared.
function checkEnvReads(dir, config, secrets) {
  const declared = new Set([...((config.secrets && config.secrets.required) || []), ...Object.keys(secrets || {})]);
  const warned = new Set();
  const warnings = [];
  let readsInputs = false;
  for (const f of listPyFiles(dir)) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    if (src.includes('SMALL_INPUT_')) readsInputs = true;
    for (const m of src.matchAll(HARD_ENV_RE)) {
      const v = m[1];
      if (v.startsWith('SMALL_') || declared.has(v) || warned.has(v)) continue;
      warned.add(v);
      warnings.push(`${f} reads ${v} — not in [secrets] or .env, it will be unset in the container`);
    }
  }
  if (readsInputs && config.kind === 'job' && !config.inputs) warnings.push('reads SMALL_INPUT_* but small.toml has no [inputs] — declare them');
  return warnings;
}

module.exports = { checkSyntax, checkDeps, checkEnvReads, depNames };
