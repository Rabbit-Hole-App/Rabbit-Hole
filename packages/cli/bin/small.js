#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const readline = require('node:readline/promises');
const { detect } = require('../lib/detect');
const { init } = require('../lib/init');
const { write, writeFlyToml } = require('../lib/generate');
const { call, apiBase, fetchRaw } = require('../lib/api');
const { buildBundle } = require('../lib/bundle');
const config = require('../lib/config');
const envfile = require('../lib/envfile');
const fly = require('../lib/fly');
const inputs = require('../lib/inputs');
const preflight = require('../lib/preflight');
const source = require('../lib/source');
const toml = require('../lib/toml');

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

function fmtSize(b) {
  return b < 1024 ? `${b} B` : b < 1048576 ? `${Math.round(b / 1024)} KB` : `${(b / 1048576).toFixed(1)} MB`;
}

// The [inputs] schema lives in the local small.toml; running someone else's app
// from elsewhere has no schema to validate against.
function localConfig(name) {
  const p = path.join(process.cwd(), 'small.toml');
  if (!fs.existsSync(p)) return null;
  const cfg = toml.parse(fs.readFileSync(p, 'utf8'));
  const local = cfg.name || path.basename(process.cwd()).toLowerCase().replace(/[^a-z0-9-]/g, '-');
  return local === name ? cfg : null;
}

async function printOutputs(name, runId) {
  // ponytail: catch-all until the control-plane outputs routes ship
  const res = await call('GET', `/api/runs/${encodeURIComponent(runId)}/outputs`).catch(() => null);
  if (!res || !(res.outputs || []).length) return;
  console.log('outputs:');
  for (const o of res.outputs) console.log(`  ${o.name}  ${fmtSize(o.size)}`);
  console.log(`fetch: small run ${name} --download ./out`);
}

async function downloadOutputs(name, dir) {
  const { runs } = await call('GET', `/api/runs?app=${encodeURIComponent(name)}`);
  const last = (runs || []).find((r) => r.status === 'finished'); // list is newest-first
  if (!last) throw new Error(`no finished runs for ${name}`);
  const { outputs } = await call('GET', `/api/runs/${encodeURIComponent(last.run_id)}/outputs`);
  if (!(outputs || []).length) return console.log(`run ${last.run_id} produced no outputs`);
  for (const o of outputs) {
    if (o.name.includes('..')) continue; // never let a server-supplied name walk out of dir
    const dest = path.join(dir, o.name);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, await fetchRaw(`/api/runs/${encodeURIComponent(last.run_id)}/outputs/${encodeURIComponent(o.name)}`));
    console.log(`✓ wrote ${dest} (${fmtSize(o.size)})`);
  }
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
    const dir = process.cwd();
    if (!init(dir, { force: !!flags.force })) {
      process.exitCode = 1;
      return;
    }
    // First runbook, from the code as it stands. Never fails the init.
    const rbPath = path.join(dir, 'RUNBOOK.md');
    if (fs.existsSync(rbPath) && !flags.force) return console.log('RUNBOOK.md already exists — use --force to regenerate');
    try {
      const app = detect(dir);
      const { bundle } = buildBundle(dir, app.entry, envfile.parse(path.join(dir, '.env')));
      const { runbook } = await call('POST', '/api/runbook', { bundle });
      fs.writeFileSync(rbPath, runbook);
      console.log('✓ wrote RUNBOOK.md');
    } catch (e) {
      console.log(`runbook: unavailable (${e.message}) — regenerated on every small deploy`);
    }
  },

  async deploy() {
    const dir = process.cwd();
    if (!fs.existsSync(path.join(dir, 'small.toml')) && !init(dir)) {
      process.exitCode = 1;
      return;
    }
    const app = detect(dir, flags);
    console.log(`✓ entry: ${app.entry} (${app.framework}) via ${app.via}`);
    inputs.checkSchema(app.config); // bad [inputs]/[outputs] stops the deploy here

    const src = source.capture(dir);
    if (src) {
      const repo = src.repoUrl ? `${src.repoUrl.replace(/^https:\/\//, '')} @ ` : '';
      console.log(`✓ source: ${repo}${src.branch} ${src.shortCommit}`);
      if (src.dirty) console.log('⚠ uncommitted changes deployed — commit before sharing');
    } else {
      console.log('source: not a git repo');
    }

    const envPath = path.resolve(dir, typeof flags.env === 'string' ? flags.env : '.env');
    const secrets = envfile.parse(envPath);
    const required = (app.config.secrets && app.config.secrets.required) || [];
    const missing = required.filter((k) => !(k in secrets));
    if (missing.length) throw new Error(`missing secrets: ${missing.join(', ')} — add them to ${envPath}`);

    // pre-flight: catch here what would otherwise burn the remote build or fail at runtime
    console.log(`✓ syntax: ${preflight.checkSyntax(dir)}`);
    const deps = await preflight.checkDeps(dir, app.config.deps && app.config.deps.file);
    if (deps) {
      if (deps.missing.length) console.log(`⚠ deps: not on PyPI: ${deps.missing.join(', ')} — the build will likely fail`);
      else console.log(`✓ deps: ${deps.count} on PyPI`);
    }
    for (const w of preflight.checkEnvReads(dir, app.config, secrets)) console.log(`⚠ env: ${w}`);

    write(dir, app);
    const review = buildBundle(dir, app.entry, secrets);
    const visibility = (app.config.access && app.config.access.visibility) || undefined;
    const storage = app.config.storage;
    let sizeGb;
    if (storage) {
      const m = /^(\d+)\s*gb$/i.exec(String(storage.size || '1GB'));
      if (!m) throw new Error('storage.size must be whole gigabytes, like "1GB"');
      sizeGb = Number(m[1]);
    }
    const awsRoleArn = (app.config.aws && app.config.aws.role_arn) || undefined;
    const kind = app.config.kind === 'job' ? 'job' : 'server';
    const schedule = app.config.schedule;
    const d = await call('POST', '/api/deploy', {
      name: app.name,
      framework: app.framework,
      visibility,
      awsRoleArn,
      kind,
      storage: storage ? { sizeGb } : undefined,
      schedule: kind === 'job' ? schedule || null : undefined, // null clears a removed schedule
      source: src ? { repoUrl: src.repoUrl, branch: src.branch, commit: src.commit, dirty: src.dirty } : undefined,
      // the dashboard's Run form renders from these; null clears a removed [inputs]
      inputs: kind === 'job' ? app.config.inputs || null : undefined,
      outputs: kind === 'job' ? app.config.outputs || null : undefined,
    });
    if (!d.flyToken) throw new Error('control plane has no FLY_API_TOKEN configured');
    if (storage && !d.volumeRegion) throw new Error('control plane does not support [storage] yet — redeploy the worker');
    writeFlyToml(dir, d.flyApp, app.config.memory, storage ? { path: storage.path || '/data', region: d.volumeRegion } : undefined);
    if (storage) console.log(`✓ storage: ${storage.path || '/data'} (${sizeGb}GB volume in ${d.volumeRegion}, survives redeploys)`);
    // reaching here means the control plane test-assumed the role during /api/deploy
    if (awsRoleArn) console.log(`✓ aws role: ${awsRoleArn} (verified — STS via control plane)`);

    // The worker's waitUntil window (~30s) is too short for the model to write review +
    // runbook, so the CLI holds this request open in parallel with the Fly build instead;
    // the worker awaits the model and stores the result before responding.
    const reviewPromise = call('POST', '/api/review/run', {
      app: app.name,
      bundle: review.bundle,
      skipped: review.skipped,
    }).catch(() => null);
    const printReview = async () => {
      const res = await reviewPromise;
      if (res && res.review) console.log(reviewLine(res.review));
      else console.log('review: unavailable');
    };

    if (kind === 'job') {
      if (schedule) {
        if (!d.nextRun && !d.schedulePaused) throw new Error('control plane does not support schedule yet — redeploy the worker');
        const next = d.schedulePaused
          ? `paused — small schedule resume ${app.name}`
          : `next run ${new Date(d.nextRun).toISOString().slice(0, 16).replace('T', ' ')}`;
        console.log(`✓ schedule: ${schedule} (UTC) · ${next}`);
      }
      // jobs: build + register the image, start nothing — the control plane starts machines per run
      fly.setSecrets(d.flyApp, d.flyToken, secrets);
      const image = fly.buildImage(d.flyApp, d.flyToken, dir, `v${Date.now()}`);
      await call('POST', '/api/image', { app: app.name, image });
      console.log(`✓ built ${app.name} — start it with: small run ${app.name}`);
      await printReview();
      return;
    }

    // gradio builds asset/API URLs from its root; behind the path proxy that must be the public URL
    const rootPath = app.framework === 'gradio' ? { GRADIO_ROOT_PATH: d.url.replace(/\/$/, '') } : {};
    // [aws] role: guard fetches STS session creds from the control plane at boot
    const cpUrl = awsRoleArn ? { SMALL_CP_URL: apiBase() } : {};
    // guard batches request-log lines here, authed by the proxy secret it already holds
    const logUrl = { SMALL_LOG_URL: `${apiBase()}/api/apps/${app.name}/request-log` };
    fly.setSecrets(d.flyApp, d.flyToken, { SMALL_PROXY_SECRET: d.proxySecret, ...rootPath, ...cpUrl, ...logUrl, ...secrets });
    fly.deploy(d.flyApp, d.flyToken, dir);

    console.log(`✓ deployed → ${d.url}`);
    const { org } = config.load();
    console.log(visibility === 'private' ? '✓ login required · explicit members only' : `✓ login required · anyone @${org}`);
    await printReview();
  },

  async review() {
    const name = flags._[0] || appName(process.cwd());
    const res = await call('GET', `/api/review?app=${encodeURIComponent(name)}`);
    if (!res.review) return console.log('review: unavailable — no reviewed deploy yet');
    if (flags.diff) printDiff(res);
    else printReport(res);
  },

  async runbook() {
    const name = flags._[0] || appName(process.cwd());
    const res = await call('GET', `/api/review?app=${encodeURIComponent(name)}`);
    const cur = res.review && res.review.runbook;
    if (!cur) return console.log('runbook: unavailable — no reviewed deploy yet');
    if (flags.diff) {
      const prev = res.prev && res.prev.runbook;
      if (!prev) return console.log('no previous runbook to diff against');
      // ponytail: line-set diff, no ordering — mirror of review --diff; real diff when it matters
      const before = new Set(prev.split('\n'));
      const after = new Set(cur.split('\n'));
      let changed = false;
      for (const l of cur.split('\n')) if (!before.has(l)) (changed = true), console.log(`+ ${l}`);
      for (const l of prev.split('\n')) if (!after.has(l)) (changed = true), console.log(`- ${l}`);
      if (!changed) console.log('no changes since previous deploy');
      return;
    }
    if (flags.write) {
      fs.writeFileSync(path.join(process.cwd(), 'RUNBOOK.md'), cur);
      return console.log('✓ wrote RUNBOOK.md');
    }
    console.log(cur);
  },

  async run() {
    const name = flags._[0] || appName(process.cwd());
    if (flags.download) return downloadOutputs(name, typeof flags.download === 'string' ? flags.download : '.');

    let cfg = localConfig(name);
    if (cfg) inputs.checkSchema(cfg);
    if (!cfg) {
      // away from the app dir: the schema stored at deploy still validates flags and required inputs
      const remote = await call('GET', `/api/apps/${encodeURIComponent(name)}`).catch(() => null);
      if (remote && remote.inputs) cfg = { inputs: remote.inputs };
      else {
        const extra = Object.keys(flags).filter((k) => !['_', 'app'].includes(k));
        if (extra.length) throw new Error(`--${extra[0]}: ${name} declares no inputs (or the control plane predates them)`);
      }
    }
    const { values, files } = cfg ? inputs.validate(cfg.inputs, flags) : { values: {}, files: {} };

    if (Object.keys(values).length) {
      const line = Object.entries(values)
        .map(([k, v]) => (files[k] ? `${k}=${v} (${fmtSize(files[k].size)})` : `${k}=${v}`))
        .join(' · ');
      console.log(`✓ inputs: ${line}`);
    }
    const total = Object.values(files).reduce((s, f) => s + f.size, 0);
    if (total > 100 * 1024 * 1024) throw new Error(`input files total ${fmtSize(total)} — cap is 100 MB per run`);

    let body;
    if (Object.keys(files).length) {
      // files ride a multipart POST; scalars stay in the JSON part
      body = new FormData();
      body.append('body', JSON.stringify({ app: name, inputs: values }));
      for (const [n, f] of Object.entries(files)) body.append(`input:${n}`, new Blob([fs.readFileSync(f.path)]), path.basename(f.path));
    } else {
      body = { app: name, inputs: Object.keys(values).length ? values : undefined };
    }
    const { runId } = await call('POST', '/api/runs', body);
    console.log(`run: ${runId}`);
    let cursor = -1;
    for (;;) {
      const r = await call('GET', `/api/runs/${encodeURIComponent(runId)}?after=${cursor}`);
      for (const line of r.lines) console.log(line);
      if (r.lines.length) cursor = r.cursor;
      if (r.status !== 'running' && !r.lines.length) {
        console.log(r.exitCode === 0 ? `✓ finished (exit ${r.exitCode})` : `✗ failed (exit ${r.exitCode})`);
        await printOutputs(name, runId);
        process.exitCode = r.exitCode === 0 ? 0 : 1;
        return;
      }
      await new Promise((res) => setTimeout(res, 1000));
    }
  },

  async runs() {
    const name = flags._[0] || appName(process.cwd());
    const { runs } = await call('GET', `/api/runs?app=${encodeURIComponent(name)}`);
    if (!runs.length) return console.log(`no runs yet — small run ${name}`);
    for (const r of runs) {
      // sqlite datetime('now') strings are UTC without a zone marker
      const dur = r.status === 'skipped' ? '—' : r.finished_at ? `${Math.round((new Date(r.finished_at + 'Z') - new Date(r.started_at + 'Z')) / 1000)}s` : '…';
      const by = r.started_by === 'cron' ? '⏱ cron' : r.started_by;
      console.log(`${r.run_id}  ${r.status}  ${dur}  ${by}  ${r.started_at}${r.reason ? `  (${r.reason})` : ''}`);
    }
  },

  async schedule() {
    const action = flags._[0];
    if (!['pause', 'resume'].includes(action)) throw new Error('usage: small schedule <pause|resume> [app]');
    const name = flags._[1] || appName(process.cwd());
    const res = await call('POST', '/api/schedule', { app: name, paused: action === 'pause' });
    console.log(`✓ schedule ${res.paused ? 'paused' : 'resumed'} for ${name} (${res.schedule})`);
  },

  async logs() {
    const arg = flags._[0];
    if (arg && arg.startsWith('r-')) {
      const r = await call('GET', `/api/runs/${encodeURIComponent(arg)}?after=-1`);
      for (const line of r.lines) console.log(line);
      return;
    }
    const name = arg || appName(process.cwd());
    if (flags.machine) {
      const res = await call('GET', `/api/logs?app=${encodeURIComponent(name)}`);
      if (!res.flyToken) throw new Error('control plane has no FLY_API_TOKEN configured');
      return fly.logs(res.flyApp, res.flyToken);
    }
    // ponytail: no export — pipe stdout to a file until a --json flag is asked for
    let base = `/api/request-logs?app=${encodeURIComponent(name)}`;
    if (typeof flags.user === 'string') base += `&user=${encodeURIComponent(flags.user)}`;
    if (typeof flags.status === 'string') base += `&status=${encodeURIComponent(flags.status)}`;
    const fmt = (l) => {
      const t = new Date(l.ts).toTimeString().slice(0, 8);
      return `${t} ${l.method} ${l.path} ${l.status} ${l.ms}ms${l.user ? ' ' + l.user : ''}`;
    };
    const res = await call('GET', base);
    if (!flags.follow) {
      if (!res.lines.length) return console.log('no requests yet');
      for (const l of res.lines) console.log(fmt(l)); // newest first
      return;
    }
    for (const l of [...res.lines].reverse()) console.log(fmt(l)); // --follow reads top-down: oldest of the last 100 first
    let cursor = res.cursor;
    for (;;) {
      await new Promise((r) => setTimeout(r, 1000));
      const more = await call('GET', `${base}&after=${cursor}`);
      for (const l of more.lines) console.log(fmt(l));
      cursor = more.cursor;
    }
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

  // Install the agent skill into this project so Claude Code/Codex knows how to
  // deploy with small. Files ship inside the npm package (synced at prepack).
  async skill() {
    const src = path.join(__dirname, '..', 'assets', 'skill');
    if (!fs.existsSync(src)) throw new Error('skill assets missing — reinstall: npm i -g small-deploy');
    const dst = path.join(process.cwd(), '.claude', 'skills', 'small');
    fs.cpSync(src, dst, { recursive: true });
    console.log(`✓ skill installed → ${path.join('.claude', 'skills', 'small')} (SKILL.md + references/)`);
  },

};

const run = commands[cmd];
if (!run) {
  console.log('usage: small <login|init|deploy|run|runs|schedule|share|list|logs|review|runbook|skill>');
  process.exitCode = 1;
} else {
  run().catch((err) => {
    console.error(`✗ ${err.message}`);
    process.exitCode = 1;
  });
}
