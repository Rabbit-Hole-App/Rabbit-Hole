#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const readline = require('node:readline/promises');
const { detect } = require('../lib/detect');
const { init } = require('../lib/init');
const { write, writeFlyToml } = require('../lib/generate');
const { call, apiBase } = require('../lib/api');
const { buildBundle } = require('../lib/bundle');
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

// ---------- deploy review output ----------

const reviewFmt = {
  findings: (x) => `[${x.severity}] ${x.at} — ${x.text}`,
  secrets: (x) => `${x.name} ${x.declared ? 'declared' : 'NOT DECLARED'} · used at ${x.used_at}`,
  undeclared_secrets: (x) => x,
  outbound: (x) => `${x.host} — ${x.purpose} (${x.at})`,
  aws: (x) => `${x.action} ${x.resource} (${x.at})`,
  shell_exec: (x) => `${x.at} — ${x.command}${x.user_input_reaches_it ? ' · user input reaches it' : ''}`,
};

function reviewLine(r) {
  const aws = (r.aws || []).length;
  const lambdas = (r.aws || []).filter((a) => (a.action || '').startsWith('lambda:')).length;
  const awsPart = !aws ? 'no AWS' : lambdas === aws ? `invokes ${aws} Lambda${aws > 1 ? 's' : ''}` : `${aws} AWS call${aws > 1 ? 's' : ''}`;
  const hosts = new Set((r.outbound || []).map((o) => o.host)).size;
  const outPart = !hosts ? 'no outbound' : `${hosts} outbound host${hosts > 1 ? 's' : ''}`;
  const shell = (r.shell_exec || []).length;
  const shellPart = !shell ? 'no shell exec' : `${shell} shell exec`;
  return `review: ${awsPart} · ${outPart} · ${shellPart} · ${r.risk}`;
}

// The review runs concurrently with the Fly build, so it is normally already
// stored by the time the deploy finishes; poll briefly for the stamp to change.
async function reviewAfterDeploy(name, priorReviewedAt) {
  for (let i = 0; i < 6; i++) {
    try {
      const res = await call('GET', `/api/review?app=${encodeURIComponent(name)}`);
      if (res.reviewedAt && res.reviewedAt !== priorReviewedAt) return console.log(reviewLine(res.review));
    } catch {}
    await new Promise((r) => setTimeout(r, 5000));
  }
  console.log('review: unavailable');
}

function printReport(res) {
  const r = res.review;
  const section = (title, key) => {
    if (!(r[key] || []).length) return;
    console.log(`${title}:`);
    for (const x of r[key]) console.log(`  ${reviewFmt[key](x)}`);
  };
  section('findings', 'findings');
  section('secrets', 'secrets');
  section('undeclared secrets', 'undeclared_secrets');
  section('outbound', 'outbound');
  section('aws', 'aws');
  section('shell exec', 'shell_exec');
  const fsys = r.filesystem || { reads: [], writes: [] };
  console.log('filesystem:');
  console.log(`  reads: ${fsys.reads.join(', ') || '—'}`);
  console.log(`  writes: ${fsys.writes.join(', ') || '—'}`);
  if ((r.skipped || []).length) console.log(`skipped: ${r.skipped.join(', ')}`);
  console.log(`summary: ${r.summary}`);
  console.log(`risk: ${r.risk} (${res.model || 'unknown model'}, ${res.reviewedAt})`);
}

function printDiff(res) {
  if (!res.prev) return console.log('no previous review to diff against');
  const { prev, review: cur } = res;
  let changed = false;
  if (prev.risk !== cur.risk) {
    console.log(`risk: ${prev.risk} → ${cur.risk}`);
    changed = true;
  }
  for (const key of Object.keys(reviewFmt)) {
    const before = new Set((prev[key] || []).map(reviewFmt[key]));
    const after = new Set((cur[key] || []).map(reviewFmt[key]));
    for (const s of after) if (!before.has(s)) (changed = true), console.log(`+ ${key.replace('_', ' ')}: ${s}`);
    for (const s of before) if (!after.has(s)) (changed = true), console.log(`- ${key.replace('_', ' ')}: ${s}`);
  }
  for (const dir of ['reads', 'writes']) {
    const before = new Set((prev.filesystem || {})[dir] || []);
    const after = new Set((cur.filesystem || {})[dir] || []);
    for (const s of after) if (!before.has(s)) (changed = true), console.log(`+ filesystem ${dir}: ${s}`);
    for (const s of before) if (!after.has(s)) (changed = true), console.log(`- filesystem ${dir}: ${s}`);
  }
  if (!changed) console.log('no changes since previous deploy');
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

  async init() {
    if (!init(process.cwd(), { force: !!flags.force })) process.exitCode = 1;
  },

  async deploy() {
    const dir = process.cwd();
    if (!fs.existsSync(path.join(dir, 'small.toml')) && !init(dir)) {
      process.exitCode = 1;
      return;
    }
    const app = detect(dir, flags);
    console.log(`✓ entry: ${app.entry} (${app.framework}) via ${app.via}`);

    const envPath = path.resolve(dir, typeof flags.env === 'string' ? flags.env : '.env');
    const secrets = envfile.parse(envPath);
    const required = (app.config.secrets && app.config.secrets.required) || [];
    const missing = required.filter((k) => !(k in secrets));
    if (missing.length) throw new Error(`missing secrets: ${missing.join(', ')} — add them to ${envPath}`);

    write(dir, app);
    const review = buildBundle(dir, app.entry, secrets);
    const visibility = (app.config.access && app.config.access.visibility) || undefined;
    const awsRoleArn = (app.config.aws && app.config.aws.role_arn) || undefined;
    const d = await call('POST', '/api/deploy', { name: app.name, framework: app.framework, visibility, awsRoleArn, review });
    if (!d.flyToken) throw new Error('control plane has no FLY_API_TOKEN configured');
    writeFlyToml(dir, d.flyApp, app.config.memory);

    // gradio builds asset/API URLs from its root; behind the path proxy that must be the public URL
    const rootPath = app.framework === 'gradio' ? { GRADIO_ROOT_PATH: d.url.replace(/\/$/, '') } : {};
    // [aws] role: guard fetches STS session creds from the control plane at boot
    const cpUrl = awsRoleArn ? { SMALL_CP_URL: apiBase() } : {};
    fly.setSecrets(d.flyApp, d.flyToken, { SMALL_PROXY_SECRET: d.proxySecret, ...rootPath, ...cpUrl, ...secrets });
    if (awsRoleArn) console.log(`✓ aws role: ${awsRoleArn} (STS via control plane)`);
    fly.deploy(d.flyApp, d.flyToken, dir);

    console.log(`✓ deployed → ${d.url}`);
    const { org } = config.load();
    console.log(visibility === 'private' ? '✓ login required · explicit members only' : `✓ login required · anyone @${org}`);
    if (d.reviewStarted) await reviewAfterDeploy(app.name, d.reviewedAt);
    else console.log('review: unavailable');
  },

  async review() {
    const name = flags._[0] || appName(process.cwd());
    const res = await call('GET', `/api/review?app=${encodeURIComponent(name)}`);
    if (!res.review) return console.log('review: unavailable — no reviewed deploy yet');
    if (flags.diff) printDiff(res);
    else printReport(res);
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
  console.log('usage: small <login|init|deploy|share|list|logs|review>');
  process.exitCode = 1;
} else {
  run().catch((err) => {
    console.error(`✗ ${err.message}`);
    process.exitCode = 1;
  });
}
