'use strict';
const fs = require('fs');
const path = require('path');
const { detect } = require('./detect');
const { checkSchema } = require('./inputs');
const { parse } = require('./toml');

// os.environ["X"], os.environ.get("X"), os.getenv("X")
const ENV_RE = /os\.environ\[\s*["']([A-Za-z_]\w*)["']\s*\]|os\.(?:getenv|environ\.get)\(\s*["']([A-Za-z_]\w*)["']/g;

// Write small.toml from detection. Returns false when the entry could not be determined.
function init(dir, { force = false } = {}) {
  const tomlPath = path.join(dir, 'small.toml');
  if (fs.existsSync(tomlPath) && !force) {
    checkSchema(parse(fs.readFileSync(tomlPath, 'utf8'))); // bad [inputs] type stops init in one line
    console.log('small.toml already exists — use --force to overwrite');
    return true;
  }

  let app = null;
  try {
    app = detect(dir);
  } catch {}
  const name = (app && app.name) || path.basename(dir).toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const required = [];
  let source = '';
  if (app) {
    source = fs.readFileSync(path.join(dir, app.entry), 'utf8');
    for (const m of source.matchAll(ENV_RE)) {
      const v = m[1] || m[2];
      if (v.startsWith('SMALL_')) continue; // platform-injected (SMALL_DATA etc.), never a secret
      if (!required.includes(v)) required.push(v);
    }
  }
  const wantsStorage = /^\s*(?:import|from)\s+sqlite3\b/m.test(source) || source.includes('SMALL_DATA');
  const hasReqs = fs.existsSync(path.join(dir, 'requirements.txt'));

  const lines = [`name = "${name}"`];
  lines.push(app ? `entry = "${app.entry}"` : 'entry = ""                     # fill in: your app\'s main .py file');
  lines.push(`framework = "${app ? app.framework : ''}"`);
  if (hasReqs) lines.push('', '[deps]', 'file = "requirements.txt"');
  lines.push('', '[secrets]');
  lines.push(required.length ? `required = [${required.map((n) => `"${n}"`).join(', ')}]` : 'required = []                  # env vars this app reads — fill in');
  if (wantsStorage) lines.push('', '[storage]', 'path = "/data"', 'size = "1GB"');
  lines.push('', '[access]', 'visibility = "domain"', '');
  fs.writeFileSync(tomlPath, lines.join('\n'));

  console.log(`✓ name: ${name}`);
  if (app) console.log(`✓ entry: ${app.entry} (${app.framework})`);
  if (hasReqs) console.log('✓ deps: requirements.txt');
  if (required.length) console.log(`✓ secrets: ${required.join(', ')} (read by ${app.entry})`);
  if (wantsStorage) console.log('✓ storage: /data (1GB)');
  console.log('✓ visibility: domain');
  console.log('✓ wrote small.toml');
  // AGENT.md feeds the dashboard's Ask agent at app scope, verbatim, on every deploy.
  const agentPath = path.join(dir, 'AGENT.md');
  if (!fs.existsSync(agentPath)) {
    fs.writeFileSync(agentPath, [
      '<!-- Things the agent should know that the code doesn\'t say.',
      '     Two paragraphs, plain English. Uploaded with every `small deploy`. -->',
      '',
    ].join('\n'));
    console.log('✓ wrote AGENT.md (notes for the Ask agent — optional)');
  }
  if (!app) console.log('✗ could not find the entry file — fill in entry = "your-app.py" in small.toml');
  return !!app;
}

module.exports = { init };
