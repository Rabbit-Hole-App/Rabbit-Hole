// The keyless guard shared by the local-stack acceptance scripts that drive a real browser or session (next-steps-check.mjs,
// journey-check.mjs): they run only against a stack that has no model, voice or subscription key anywhere, and refuse before any
// request when it might. wrangler dev reads .dev.vars (and .env) from the folder of each config it is started with, so the stack's
// control plane (--vars) and its app worker (--app-vars; by default the app/ folder beside the control plane's) both bind what the
// workers can reach. Three sources are checked, and any one of them refuses the run:
//  1. every vars file the stack loads, with a STRICT per-line allowlist (not a name reader): wrangler parses these with dotenv, which
//     also takes `KEY: value`, `export KEY=...`, quoted multi-line values and bare CR line breaks, so every line, split on CRLF, CR,
//     LF and the Unicode separators, must be blank, a # comment, or one of the five stack names with a value that holds no quote
//     character (so no value can run over several lines). Anything else - including any denied key in any dotenv form - refuses.
//     Both .dev.vars files must exist (review R2-M1): wrangler falls back to .env* files - and to the process environment where it is
//     told to include it - only when there is no .dev.vars, and that is exactly what a file check cannot vouch for.
//  2. the `vars` of the wrangler config beside each vars file (and of its env blocks): no *_API_KEY, ELEVENLABS_ or SUBSCRIPTION_BRIDGE_
//     name, and SUBSCRIPTION_ONLY only as "false".
//  3. the script's own process environment, which a wrangler dev started from the same shell would pass on: no denied name in it.
// A refusal reports the file and LINE NUMBERS only, never text from a vars file (a continuation line of a quoted value is part of a
// secret); the only names it prints are denied names from a config's `vars` and from the environment, which are structured keys.
// What no file check can see is a --var or --env-file flag on the stack's own start line: e2e/journey-local-stack.md forbids both.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export const STACK_KEYS = ['SMALL_ENV', 'TEST_BYPASS_SECRET', 'MASTER_KEY', 'OAUTH_MOCK', 'JOURNEY_MODEL_STUB'];
const MODEL_KEY = /_API_KEY|^ELEVENLABS_|^SUBSCRIPTION_/i; // *_API_KEY (model, voice, search, image), ELEVENLABS_*, SUBSCRIPTION_ONLY / SUBSCRIPTION_BRIDGE_*
const CONFIG_KEY = /_API_KEY|^ELEVENLABS_|^SUBSCRIPTION_BRIDGE_/i; // SUBSCRIPTION_ONLY "false" and SUBSCRIPTION_OWNER_EMAIL are allowed in a config
const LINE_BREAK = new RegExp(`\r\n?|\n|${String.fromCharCode(0x2028)}|${String.fromCharCode(0x2029)}`); // CRLF, CR, LF, and the Unicode separators
const ALLOWED_LINE = new RegExp(`^\\s*(?:export\\s+)?(?:${STACK_KEYS.join('|')})\\s*[=:][^"'\`]*$`);
const LEADING_NAME = /^\s*(?:export\s+)?([\w.-]+)\s*[=:]/;
const loadedBy = dir => readdirSync(dir).filter(file => /^\.(dev\.vars|env)(\.|$)/.test(file)).map(file => join(dir, file));
const jsonc = text => { // comments and trailing commas out, string-aware (the recipe's own reader)
  let out = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { out += c; if (c === '\\') out += text[++i]; else if (c === '"') quoted = false; continue; }
    if (c === '"') { quoted = true; out += c; continue; }
    if (c === '/' && text[i + 1] === '/') { while (i < text.length && text[i] !== '\n') i++; out += '\n'; continue; }
    if (c === '/' && text[i + 1] === '*') { i += 2; while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++; i++; continue; }
    out += c;
  }
  return out.replace(/,(\s*[}\]])/g, '$1');
};

// The app worker's vars file unless --app-vars says otherwise: app/.dev.vars beside the control plane's folder.
export const defaultAppVars = vars => join(dirname(dirname(vars)), 'app', '.dev.vars');

// who: the script's name for the message. vars / appVars: the control plane's and the app worker's .dev.vars. Throws when refused.
export function assertKeyless({ who, vars, appVars }) {
  if (!existsSync(dirname(appVars))) throw Error(`cannot find the app worker's vars folder ${dirname(appVars)}: pass --app-vars <the app worker .dev.vars> (e2e/journey-local-stack.md)`);
  const refusals = [];
  for (const file of new Set([vars, appVars])) if (!existsSync(file)) refusals.push(`${file}: missing; the stack needs both its control plane and its app worker .dev.vars (e2e/journey-local-stack.md)`);
  for (const file of new Set([vars, appVars, ...loadedBy(dirname(vars)), ...loadedBy(dirname(appVars))].filter(existsSync).map(path => resolve(path)))) { // resolved, so one file is read once
    const bad = [], denied = [];
    readFileSync(file, 'utf8').split(LINE_BREAK).forEach((line, index) => {
      if (!line.trim() || line.trim().startsWith('#') || ALLOWED_LINE.test(line)) return;
      bad.push(index + 1);
      if (MODEL_KEY.test(line.match(LEADING_NAME)?.[1] ?? '')) denied.push(index + 1);
    });
    if (bad.length) refusals.push(`${file}: line${bad.length > 1 ? 's' : ''} ${bad.slice(0, 20).join(', ')} ${bad.length > 1 ? 'are' : 'is'} not one of the stack's allowed lines${denied.length ? ` (line${denied.length > 1 ? 's' : ''} ${denied.slice(0, 20).join(', ')} bind${denied.length > 1 ? '' : 's'} a model, voice or subscription key)` : ''}`);
  }
  for (const folder of new Set([dirname(vars), dirname(appVars)])) {
    const file = ['wrangler.jsonc', 'wrangler.json'].map(name => join(folder, name)).find(existsSync);
    if (!file) { refusals.push(`${folder}: no wrangler.jsonc or wrangler.json beside the vars file, so its vars cannot be checked`); continue; }
    let config; try { config = JSON.parse(jsonc(readFileSync(file, 'utf8'))); } catch { refusals.push(`${file}: cannot be read as JSON, so its vars cannot be checked`); continue; }
    const declared = [config.vars, ...Object.values(config.env || {}).map(env => env?.vars)].filter(Boolean).flatMap(block => Object.entries(block));
    const bad = [...new Set(declared.filter(([name, value]) => CONFIG_KEY.test(name) || (/^SUBSCRIPTION_ONLY$/i.test(name) && value !== 'false')).map(([name]) => name))];
    if (bad.length) refusals.push(`${file}: vars declare ${bad.join(', ')}, a model, voice or subscription name (SUBSCRIPTION_ONLY is allowed only as "false")`);
  }
  const inEnvironment = Object.keys(process.env).filter(name => MODEL_KEY.test(name));
  if (inEnvironment.length) refusals.push(`the environment of this run carries ${inEnvironment.join(', ')}: unset ${inEnvironment.length > 1 ? 'them' : 'it'} before running (a wrangler dev started from the same shell would bind ${inEnvironment.length > 1 ? 'them' : 'it'})`);
  if (refusals.length) throw Error(`${who} runs only against the keyless stack (e2e/journey-local-stack.md); refused:\n  ${refusals.join('\n  ')}`);
}
