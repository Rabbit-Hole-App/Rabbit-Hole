// Read-only execution preflight. Never prints secret values and never creates stack state.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const R = '@@APP_ROOT@@';
const G = '@@GATE_ROOT@@';
function need(condition, message) { if (!condition) throw Error(message); }
const sha = process.env.INT35_EXPECTED_SHA;
need(/^[a-f0-9]{40}$/.test(sha || ''), 'INT35_EXPECTED_SHA must be the final 40-character commit.');
const tree = process.env.INT35_EXPECTED_TREE;
const grant = process.env.INT35_GRANT_ID;
need(/^[a-f0-9]{40}$/.test(tree || ''), 'INT35_EXPECTED_TREE must be the final 40-character index tree.');
need(grant && grant !== 'none', 'A real heavy-test grant is required.');
const schedule = fs.readFileSync(path.join(G, '../../heavy-tests.md'), 'utf8');
// Only the authoritative Slot block grants execution; later headings can contain history or another lane's grant.
const scheduleLines = schedule.split(/\r?\n/);
const slotHeadings = scheduleLines.flatMap((line, index) => /^##[ \t]+Slot[ \t]*$/.test(line) ? [index] : []);
need(slotHeadings.length === 1, 'heavy-tests.md must contain exactly one authoritative ## Slot section.');
const slotStart = slotHeadings[0] + 1;
const nextHeading = scheduleLines.findIndex((line, index) => index >= slotStart && /^##(?:[ \t]|$)/.test(line));
const slotLines = scheduleLines.slice(slotStart, nextHeading < 0 ? undefined : nextHeading);
function slotField(label) {
  const entries = slotLines.filter(line => line.startsWith(`${label}:`));
  need(entries.length === 1, `Slot must declare exactly one ${label}.`);
  return entries[0].slice(label.length + 1).replace(/`/g, '').trim().replace(/\.$/, '');
}
need(/^(?:RUNNING|GRANTED)\b/.test(slotField('State')), 'Authoritative Slot is not RUNNING or GRANTED.');
need(slotField('Holder') === 'Parallel (r35)', 'Authoritative Slot holder must be Parallel (r35).');
need(slotField('Grant ID') === grant, 'Grant ID does not match the authoritative Slot section.');
const denied = Object.keys(process.env).filter(name => /_API_KEY|^ELEVENLABS_|^SUBSCRIPTION_/i.test(name));
need(!denied.length, `Gate shell carries disallowed key names: ${denied.join(', ')}`);
for (const rel of ['node_modules/vite/bin/vite.js', 'node_modules/wrangler/bin/wrangler.js', 'packages/web/e2e/provider-tripwire.js']) need(fs.existsSync(path.join(R, rel)), `Missing prerequisite: ${rel}`);
const configs = ['packages/web/integ-local.jsonc','packages/web/integ-app.jsonc','packages/control-plane/integ-local.jsonc','packages/control-plane/integ-local-cp2.jsonc'];
for (const rel of configs) {
  need(fs.existsSync(path.join(R, rel)), `Missing reviewed config template at ${rel}; see PREPARATION.md.`);
  const normalize = text => text.replace(/\r\n/g, '\n');
  need(normalize(fs.readFileSync(path.join(R, rel), 'utf8')) === normalize(fs.readFileSync(path.join(G, 'config-templates', rel), 'utf8')), `Config differs from reviewed copy: ${rel}`);
}
const allowed = /^\s*(?:export\s+)?(?:SMALL_ENV|TEST_BYPASS_SECRET|MASTER_KEY|OAUTH_MOCK|JOURNEY_MODEL_STUB)\s*[=:][^"'`]*$/;
let vars;
for (const folder of ['packages/control-plane', 'packages/web']) {
  const directory = path.join(R, folder);
  need(fs.existsSync(path.join(directory, '.dev.vars')), `Missing keyless ${folder}/.dev.vars`);
  for (const name of fs.readdirSync(directory).filter(name => /^\.(dev\.vars|env)(\.|$)/.test(name))) {
    const text = fs.readFileSync(path.join(directory, name), 'utf8');
    text.split(/\r\n?|\n|\u2028|\u2029/).forEach((line, index) => need(!line.trim() || line.trim().startsWith('#') || allowed.test(line), `Refused ${folder}/${name} line ${index + 1}; keyless stack values only.`));
    if (name === '.dev.vars') { if (vars !== undefined) need(text.replace(/\r\n/g,'\n') === vars, 'App and control-plane keyless vars must match.'); else vars=text.replace(/\r\n/g,'\n'); }
  }
}
need(/^SMALL_ENV=test\s*$/m.test(vars), 'Keyless local vars must use SMALL_ENV=test.');
need(/^OAUTH_MOCK=true\s*$/m.test(vars), 'Keyless local vars must enable OAUTH_MOCK=true.');
for (const name of ['MASTER_KEY', 'TEST_BYPASS_SECRET']) need(new RegExp(`^${name}=[a-f0-9]{32,}\\s*$`, 'm').test(vars), `Use generated local-only ${name}.`);
const prepared = path.join(G,'fork/SCHEMA-PREPARED-TREE');
need(fs.existsSync(prepared) && fs.readFileSync(prepared,'utf8').trim() === tree, 'Fork local schema preparation is not acknowledged for this candidate.');
const listeners = cp.execFileSync('powershell', ['-NoProfile','-Command', '@(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in @(8878,8879) }).Count'], {encoding:'utf8'}).trim();
need(listeners === '0', 'Integration ports 8878/8879 are occupied; coordinate ownership before execution.');
console.log(`INT35 preflight: candidate ${tree}; grant ${grant}; local keyless prerequisites checked.`);
