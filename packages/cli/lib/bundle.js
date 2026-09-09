'use strict';
const fs = require('fs');
const path = require('path');

// Review bundle: every .py file (=== path === headers) plus small.toml and
// requirements.txt, secret values redacted, capped at ~100k tokens.

const EXCLUDED_DIRS = new Set(['.venv', 'node_modules', '__pycache__', 'tests', '.git', '.small']);
const MAX_TOKENS = 100000; // ~4 chars per token

const escapeRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ponytail: common-subset .gitignore - names, dir/, *, **, ?, leading /;
// negation is conservatively ignored rather than re-including private files.
function gitignoreMatchers(dir, filename = '.gitignore') {
  const file = path.join(dir, filename);
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && !l.startsWith('!'))
    .map((raw) => {
      let pat = raw.replace(/\/$/, '');
      const anchored = pat.startsWith('/');
      if (anchored) pat = pat.slice(1);
      const glob = pat.split(/(\*\*\/|\*\*|\*|\?)/).map((part) =>
        part === '**/' ? '(?:.*/)?' : part === '**' ? '.*' : part === '*' ? '[^/]*' : part === '?' ? '[^/]' : escapeRx(part)).join('');
      const rx = new RegExp('^' + glob + '$');
      return (rel) => (anchored ? rx.test(rel) || rx.test(rel.split('/')[0]) : rel.split('/').some((seg) => rx.test(seg)) || rx.test(rel));
    });
}

function listPyFiles(dir) {
  const ignored = gitignoreMatchers(dir);
  const isIgnored = (rel) => ignored.some((m) => m(rel));
  const out = [];
  (function walk(rel) {
    for (const name of fs.readdirSync(path.join(dir, rel || '.'))) {
      const r = rel ? `${rel}/${name}` : name;
      if (fs.statSync(path.join(dir, r)).isDirectory()) {
        if (!EXCLUDED_DIRS.has(name) && !isIgnored(r)) walk(r);
      } else if (name.endsWith('.py') && !isIgnored(r)) {
        out.push(r);
      }
    }
  })('');
  return out.sort();
}

// Local files reachable via `import x` / `from x import y` starting at the entry file.
function transitiveFrom(entry, files, dir) {
  const all = new Set(files);
  const keep = new Set();
  const queue = [entry];
  while (queue.length) {
    const f = queue.pop();
    if (keep.has(f) || !all.has(f)) continue;
    keep.add(f);
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const m of src.matchAll(/^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.]+(?:\s*,\s*[\w.]+)*))/gm)) {
      const mods = m[1] ? [m[1]] : m[2].split(',').map((s) => s.trim());
      for (const mod of mods) {
        const base = mod.replace(/\./g, '/');
        for (const cand of [`${base}.py`, `${base}/__init__.py`, `${mod.split('.')[0]}.py`, `${mod.split('.')[0]}/__init__.py`]) {
          if (all.has(cand)) queue.push(cand);
        }
      }
    }
  }
  return keep;
}

// The model must never see secret values - only names and line numbers.
function redact(text, secrets) {
  for (const value of Object.values(secrets || {})) {
    if (value && value.length >= 4) text = text.split(value).join('«redacted»');
  }
  return text;
}

function buildBundle(dir, entry, secrets) {
  let files = listPyFiles(dir);
  const extras = ['small.toml', 'requirements.txt'].filter((f) => fs.existsSync(path.join(dir, f)));
  let skipped = [];
  const bytes = [...extras, ...files].reduce((n, f) => n + fs.statSync(path.join(dir, f)).size, 0);
  if (bytes / 4 > MAX_TOKENS) {
    const keep = transitiveFrom(entry, files, dir);
    skipped = files.filter((f) => !keep.has(f));
    files = files.filter((f) => keep.has(f));
  }
  const section = (f) => `=== ${f} ===\n${redact(fs.readFileSync(path.join(dir, f), 'utf8'), secrets)}\n`;
  return { bundle: [...extras, ...files].map(section).join('\n'), skipped };
}

module.exports = { buildBundle, listPyFiles, gitignoreMatchers };
