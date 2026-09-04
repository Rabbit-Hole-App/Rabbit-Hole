'use strict';
const fs = require('fs');
const path = require('path');
const { detect } = require('./detect');

// os.environ["X"], os.environ.get("X"), os.getenv("X")
const ENV_RE = /os\.environ\[\s*["']([A-Za-z_]\w*)["']\s*\]|os\.(?:getenv|environ\.get)\(\s*["']([A-Za-z_]\w*)["']/g;

// Write small.toml from detection. Returns false when the entry could not be determined.
function init(dir, { force = false } = {}) {
  const tomlPath = path.join(dir, 'small.toml');
  if (fs.existsSync(tomlPath) && !force) {
    console.log('small.toml already exists — use --force to overwrite');
    return true;
  }

  let app = null;
  try {
    app = detect(dir);
  } catch {}
  const name = (app && app.name) || path.basename(dir).toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const required = [];
  if (app) {
    const source = fs.readFileSync(path.join(dir, app.entry), 'utf8');
    for (const m of source.matchAll(ENV_RE)) {
      const v = m[1] || m[2];
      if (!required.includes(v)) required.push(v);
    }
  }
  const hasReqs = fs.existsSync(path.join(dir, 'requirements.txt'));

  const lines = [`name = "${name}"`];
  lines.push(app ? `entry = "${app.entry}"` : 'entry = ""                     # fill in: your app\'s main .py file');
  lines.push(`framework = "${app ? app.framework : ''}"`);
  if (hasReqs) lines.push('', '[deps]', 'file = "requirements.txt"');
  lines.push('', '[secrets]');
  lines.push(required.length ? `required = [${required.map((n) => `"${n}"`).join(', ')}]` : 'required = []                  # env vars this app reads — fill in');
  lines.push('', '[access]', 'visibility = "domain"', '');
  fs.writeFileSync(tomlPath, lines.join('\n'));

  console.log(`✓ name: ${name}`);
  if (app) console.log(`✓ entry: ${app.entry} (${app.framework})`);
  if (hasReqs) console.log('✓ deps: requirements.txt');
  if (required.length) console.log(`✓ secrets: ${required.join(', ')} (read by ${app.entry})`);
  console.log('✓ visibility: domain');
  console.log('✓ wrote small.toml');
  if (!app) console.log('✗ could not find the entry file — fill in entry = "your-app.py" in small.toml');
  return !!app;
}

module.exports = { init };
