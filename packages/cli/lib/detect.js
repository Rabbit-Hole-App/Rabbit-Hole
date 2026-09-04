'use strict';
const fs = require('fs');
const path = require('path');
const { parse } = require('./toml');

const HINTS = [
  ['Flask(', 'flask'],
  ['FastAPI(', 'fastapi'],
  ['import streamlit', 'streamlit'],
];

function frameworkOf(source) {
  for (const [hint, fw] of HINTS) if (source.includes(hint)) return fw;
  return 'script';
}

// Detection order per SCOPE.md: small.toml -> --entry -> framework hint -> filename
// convention -> only .py file -> fail with the one-line fix.
function detect(dir, flags = {}) {
  const tomlPath = path.join(dir, 'small.toml');
  const config = fs.existsSync(tomlPath) ? parse(fs.readFileSync(tomlPath, 'utf8')) : {};
  const name = config.name || path.basename(dir).toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const pick = (entry, via) => {
    const full = path.join(dir, entry);
    if (!fs.existsSync(full)) throw new Error(`entry ${entry} (via ${via}) does not exist`);
    const source = fs.readFileSync(full, 'utf8');
    return { name, entry, framework: config.framework || frameworkOf(source), via, config };
  };
  if (config.entry) return pick(config.entry, 'small.toml');
  if (flags.entry) return pick(flags.entry, '--entry');
  const pys = fs.readdirSync(dir).filter((f) => f.endsWith('.py'));
  for (const f of pys) {
    if (frameworkOf(fs.readFileSync(path.join(dir, f), 'utf8')) !== 'script') return pick(f, 'framework hint');
  }
  for (const f of ['app.py', 'main.py', 'server.py']) {
    if (pys.includes(f)) return pick(f, 'filename convention');
  }
  if (pys.length === 1) return pick(pys[0], 'only .py file');
  throw new Error('cannot find the app entry — add entry = "app.py" to small.toml');
}

module.exports = { detect, frameworkOf };
