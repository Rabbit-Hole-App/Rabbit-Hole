#!/usr/bin/env node
'use strict';
const path = require('path');
const readline = require('node:readline/promises');
const { detect } = require('../lib/detect');
const { write, writeFlyToml } = require('../lib/generate');
const { call, apiBase } = require('../lib/api');
const config = require('../lib/config');
const envfile = require('../lib/envfile');
const fly = require('../lib/fly');

const [cmd, ...rest] = process.argv.slice(2);
const flags = { _: [] };
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith('--')) {
    const key = rest[i].slice(2);
    flags[key] = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : true;
  } else {
    flags._.push(rest[i]);
  }
}

async function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(question);
  rl.close();
  return answer.trim();
}

function appName(dir) {
  if (flags.app) return flags.app;
  return detect(dir).name;
}

const commands = {
  async login() {
    if (flags.api) config.save({ ...config.load(), apiBase: flags.api });
    const email = flags.email || (await ask('work email: '));
    const res = await call('POST', '/api/cli/login', { email }, { auth: false });
    if (res.devCode) console.log(`(dev) code: ${res.devCode}`);
    else console.log(`✓ code sent to ${email}`);
    const code = flags.code || (await ask('6-digit code: '));
    const v = await call('POST', '/api/cli/verify', { challenge: res.challenge, code }, { auth: false });
    config.save({ ...config.load(), token: v.token, email: v.email, org: v.org, apiBase: apiBase() });
    console.log(`✓ logged in as ${v.email} (org: ${v.org})`);
  },

  async deploy() {
    const dir = process.cwd();
    const app = detect(dir, flags);
    console.log(`✓ entry: ${app.entry} (${app.framework}) via ${app.via}`);

    const envPath = path.resolve(dir, typeof flags.env === 'string' ? flags.env : '.env');
    const secrets = envfile.parse(envPath);
    const required = (app.config.secrets && app.config.secrets.required) || [];
    const missing = required.filter((k) => !(k in secrets));
    if (missing.length) throw new Error(`missing secrets: ${missing.join(', ')} — add them to ${envPath}`);

    write(dir, app);
    const visibility = (app.config.access && app.config.access.visibility) || undefined;
    const d = await call('POST', '/api/deploy', { name: app.name, framework: app.framework, visibility });
    if (!d.flyToken) throw new Error('control plane has no FLY_API_TOKEN configured');
    writeFlyToml(dir, d.flyApp, app.config.memory);

    fly.ensureApp(d.flyApp, d.flyOrg, d.flyToken);
    // gradio builds asset/API URLs from its root; behind the path proxy that must be the public URL
    const rootPath = app.framework === 'gradio' ? { GRADIO_ROOT_PATH: d.url.replace(/\/$/, '') } : {};
    fly.setSecrets(d.flyApp, d.flyToken, { SMALL_PROXY_SECRET: d.proxySecret, ...rootPath, ...secrets });
    fly.deploy(d.flyApp, d.flyToken, dir);

    console.log(`✓ deployed → ${d.url}`);
    const { org } = config.load();
    console.log(visibility === 'private' ? '✓ login required · explicit members only' : `✓ login required · anyone @${org}`);
  },

  async share() {
    const email = flags._[0];
    if (!email || !email.includes('@')) throw new Error('usage: small share <email> [--edit] [--app name]');
    const name = appName(process.cwd());
    const res = await call('POST', '/api/share', { app: name, email, role: flags.edit ? 'edit' : 'view' });
    console.log(`✓ ${res.email} can ${res.role} ${res.app}`);
  },

  async list() {
    const { apps } = await call('GET', '/api/apps');
    if (!apps.length) return console.log('no apps yet — run small deploy');
    for (const a of apps) console.log(`${a.name}  ${a.visibility}  owner:${a.owner_email}`);
  },

  async logs() {
    const name = flags._[0] || appName(process.cwd());
    const res = await call('GET', `/api/logs?app=${encodeURIComponent(name)}`);
    if (!res.flyToken) throw new Error('control plane has no FLY_API_TOKEN configured');
    fly.logs(res.flyApp, res.flyToken);
  },
};

const run = commands[cmd];
if (!run) {
  console.log('usage: small <login|deploy|share|list|logs>');
  process.exitCode = 1;
} else {
  run().catch((err) => {
    console.error(`✗ ${err.message}`);
    process.exitCode = 1;
  });
}
