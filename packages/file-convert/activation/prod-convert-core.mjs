// OWNER COMMAND core: stand up (and take down) the PRODUCTION file converter. All side effects come in through `deps`, so the harness
// (prod-convert.test.mjs) runs this exact code with fakes; the entry point (prod-convert.mjs) wires the real ones and accepts no override.
// Credentials are read BY NAME from the owner's credentials file; the two service secrets are generated here from the system CSPRNG. No
// value is ever printed, put in argv, logged, written to the state file or kept in the environment: it travels only over a child's stdin.
//
// Order (each step is recorded in the state file, so a stopped run resumes at the first unfinished step; a finished step is skipped):
//   preflight  reads production (names and listings only)
//   APP        fly apps create rabbit-hole-convert-prod                        typed phrase, shows the cost       (starts the Fly bill)
//   SECRETS    CONVERT_TOKEN to Fly (staged) and the Worker; FILE_JOB_SECRET to the Worker            typed phrase
//   DEPLOY     fly deploy of ONE commit that is already in rabbit-hole/main (remote build, one machine)        typed phrase
//   HEALTH     /health answers, four converters listed, the service answers 401 to a missing or wrong token
// Activation is NOT a step here: it is the release of the two config vars (CONVERT_URL, FILE_JOB_ORIGIN) in wrangler.rabbit-hole-prod.jsonc,
// which is the owner's `!` push. Rollback: `rollback L1` (instant, no deploy), `L2` (stop the machine), `L3` (destroy the app).
export const FLY_APP = 'rabbit-hole-convert-prod'; // packages/file-convert/fly.prod.toml "app"
export const FLY_ORG = 'rabbit-hole';
export const WORKER = 'rabbit-hole-app'; // packages/web/wrangler.rabbit-hole-prod.jsonc "name"
export const ACCOUNT = 'c08d3dbdc53a3afd3cb09a536ac42318'; // the rabbit-hole Cloudflare account (same file)
export const ORIGIN = 'https://digrabbithole.com';
export const CONVERT_URL = `https://${FLY_APP}.fly.dev`;
export const CF_NAMES = ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'];
export const FLY_NAME = 'FLY_ORG_TOKEN'; // handed to flyctl as FLY_API_TOKEN, never a personal login
export const WORKER_SECRETS = ['CONVERT_TOKEN', 'FILE_JOB_SECRET'];
export const CONVERTERS = ['audio-playback', 'office-pdf', 'slides', 'step-glb'];
export const PHRASE = {
  app: `CREATE ${FLY_APP} AND ACCEPT THE FLY COST`, secrets: 'SET CONVERT SECRETS', deploy: 'DEPLOY CONVERTER', rotate: 'ROTATE CONVERT SECRETS',
  L1: 'DISABLE CONVERSION', L2: 'STOP CONVERTER', L3: 'DESTROY CONVERTER APP',
};
export const COST = 'Fly cost (estimate from canvas-file-converter.md 3.2, not a measured bill): about US$0.035 per running hour; about US$1.5 to US$9.8 a month at 10 to 100 conversion bursts a day; under US$0.20 a month stopped.';
export const USAGE = 'usage: node prod-convert.mjs [--dry-run | --preflight] [run [--sha <40-hex commit in rabbit-hole/main>] | rotate | rollback L1|L2|L3]';

export function readByName(text, name) {
  for (const line of String(text).split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (m && m[1] === name) { const v = m[2].trim().replace(/^(['"])(.*)\1$/, '$2'); return v || null; }
  }
  return null;
}

export function parse(argv) {
  const o = { dry: false, pre: false, cmd: 'run', sha: null, level: null };
  let cmd = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') o.dry = true;
    else if (a === '--preflight') o.pre = true;
    else if (a === '--sha') o.sha = argv[++i] ?? null;
    else if (['run', 'rotate', 'rollback'].includes(a) && !cmd) cmd = a;
    else if (/^L[123]$/.test(a) && cmd === 'rollback' && !o.level) o.level = a;
    else return null;
  }
  o.cmd = cmd || 'run';
  if (o.dry && o.pre) return null;
  if (o.sha !== null && !/^[0-9a-f]{40}$/.test(o.sha)) return null;
  if (o.cmd === 'rollback' && !o.level) return null;
  if (o.cmd !== 'rollback' && o.level) return null;
  if (o.sha && o.cmd !== 'run') return null;
  return o;
}

const listed = (stdout, key) => {
  const a = stdout.indexOf('['), b = stdout.lastIndexOf(']');
  if (a < 0 || b < a) return null;
  try { const rows = JSON.parse(stdout.slice(a, b + 1)); return Array.isArray(rows) ? rows.map(r => r?.[key] ?? r?.[key.toLowerCase()]).filter(n => typeof n === 'string') : null; } catch { return null; }
};

export async function run(argv, deps) {
  const say = deps.out;
  const o = parse(argv);
  if (!o) { say(USAGE); return 2; }
  const log = deps.state.read().split(/\r?\n/).filter(Boolean).map(l => l.split(' '));
  const done = step => log.some(r => r[1] === step), value = step => log.filter(r => r[1] === step).at(-1)?.[2];
  const mark = (step, v = '-') => { log.push([deps.now(), step, v]); deps.state.append(`${deps.now()} ${step} ${v}`); };

  say(`production file converter: Fly app ${FLY_APP} (org ${FLY_ORG}), Worker ${WORKER}, origin ${ORIGIN}`);
  say(`secrets (names only): ${WORKER_SECRETS.join(', ')} on ${WORKER}; CONVERT_TOKEN also on ${FLY_APP}. Values are generated here and never shown.`);
  say(`steps: ${['APP', 'SECRETS', 'DEPLOY', 'HEALTH'].map(s => `${s} ${done(s) ? `done${value(s) && value(s) !== '-' ? ` (${value(s).slice(0, 12)})` : ''}` : 'pending'}`).join(', ')}`);
  say(COST);
  if (o.dry) {
    say(`plan for \`${[o.cmd, o.level, o.sha && `--sha ${o.sha.slice(0, 12)}`].filter(Boolean).join(' ')}\`: ${plan(o).join(' -> ')}`);
    say('dry run: read no credential, started no tool, contacted nothing. Nothing was run, called or changed.');
    return 0;
  }
  if (!deps.interactive()) { say('stopped: this command asks for typed confirmations and needs an interactive terminal. Nothing was changed.'); return 1; }

  const text = deps.readCredentials();
  const names = [...CF_NAMES, FLY_NAME];
  const have = Object.fromEntries(names.map(n => [n, readByName(text, n) != null]));
  for (const n of names) say(`  ${n}: ${have[n] ? 'present in the credentials file' : 'MISSING in the credentials file'}`);
  const wrangler = deps.wrangler(), flyctl = deps.flyctl();
  say(`wrangler: ${wrangler ? wrangler.version : 'NOT FOUND (needs 4.150.0)'}; flyctl: ${flyctl ? 'found' : 'NOT FOUND'}`);
  if (!Object.values(have).every(Boolean) || !wrangler || !flyctl) { say('stopped: fix what is MISSING above. Nothing was changed.'); return 1; }
  if (readByName(text, 'CLOUDFLARE_ACCOUNT_ID') !== ACCOUNT) { say(`stopped: CLOUDFLARE_ACCOUNT_ID is not the rabbit-hole account ${ACCOUNT}. Nothing was changed.`); return 1; }

  const cf = { CLOUDFLARE_API_TOKEN: readByName(text, 'CLOUDFLARE_API_TOKEN'), CLOUDFLARE_ACCOUNT_ID: ACCOUNT }, fly = { FLY_API_TOKEN: readByName(text, FLY_NAME) };
  const wr = (args, input) => deps.spawn('wrangler', args, { input, env: cf });
  const fl = (args, input) => deps.spawn('fly', args, { input, env: fly });
  const workerSecrets = () => { const r = wr(['secret', 'list', '--name', WORKER, '--format', 'json']); return r.status === 0 ? listed(r.stdout || '', 'name') : null; };
  const flyApps = () => { const r = fl(['apps', 'list', '--org', FLY_ORG, '--json']); return r.status === 0 ? listed(r.stdout || '', 'Name') : null; };
  const flySecrets = () => { const r = fl(['secrets', 'list', '-a', FLY_APP, '--json']); return r.status === 0 ? listed(r.stdout || '', 'Name') : null; };
  const stop = why => { say(`stopped: ${why} Nothing further was changed.`); return 1; };
  const confirm = async (phrase, what) => (await deps.ask(`Type ${phrase} to ${what}: `)) === phrase;

  const apps = flyApps(), secrets = workerSecrets();
  if (!apps) return stop(`could not list the Fly apps of org ${FLY_ORG} (is FLY_ORG_TOKEN an org token for it?).`);
  if (!secrets) return stop(`could not list the secrets of ${WORKER} (does the Cloudflare token reach it?).`);
  const exists = apps.includes(FLY_APP), onWorker = WORKER_SECRETS.filter(n => secrets.includes(n));
  say(`preflight: Fly app ${FLY_APP} ${exists ? 'EXISTS' : 'does not exist'}; ${WORKER} holds: ${onWorker.length ? onWorker.join(', ') : 'none of the two converter secrets'}`);
  if (o.sha) {
    const g = deps.spawn('git', ['cat-file', '-e', `${o.sha}^{commit}`], {}), anc = deps.spawn('git', ['merge-base', '--is-ancestor', o.sha, 'rabbit-hole/main'], {});
    if (g.status !== 0) return stop(`commit ${o.sha.slice(0, 12)} is not in this checkout.`);
    if (anc.status !== 0) return stop(`commit ${o.sha.slice(0, 12)} is not in rabbit-hole/main (git fetch rabbit-hole main first). Only released code is deployed to production.`);
    say(`preflight: commit ${o.sha.slice(0, 12)} is in rabbit-hole/main`);
  }
  if (o.pre) { say('preflight finished. It only read names and listings; nothing was changed.'); return 0; }

  if (o.cmd === 'rollback') return rollback(o.level);
  if (o.cmd === 'rotate') return rotate();
  return provision();

  function plan(opt) {
    if (opt.cmd === 'rollback') return [{ L1: `wrangler secret delete CONVERT_TOKEN --name ${WORKER} (conversion off at once, no deploy)`, L2: `fly machine stop (every machine of ${FLY_APP})`, L3: `fly apps destroy ${FLY_APP} (irreversible)` }[opt.level]];
    if (opt.cmd === 'rotate') return ['regenerate both secrets', `put CONVERT_TOKEN on ${FLY_APP} and ${WORKER}`, `put FILE_JOB_SECRET on ${WORKER}`, 'verify names'];
    return ['preflight (read-only)', `fly apps create ${FLY_APP}`, 'put the two secrets', opt.sha ? `fly deploy ${opt.sha.slice(0, 12)}` : 'fly deploy (needs --sha)', 'health and 401 checks'];
  }

  async function putSecrets(staged) {
    const token = deps.random(48).toString('base64url'), fileJob = deps.random(48).toString('base64url');
    const f = fl(['secrets', 'import', ...(staged ? ['--stage'] : []), '-a', FLY_APP], `CONVERT_TOKEN=${token}\n`);
    if (f.status !== 0) return stop(`FLY secret CONVERT_TOKEN failed (flyctl exit ${f.status}).`);
    say(`put CONVERT_TOKEN on ${FLY_APP}${staged ? ' (staged: it applies at the first deploy)' : ''}`);
    for (const [n, v] of [['CONVERT_TOKEN', token], ['FILE_JOB_SECRET', fileJob]]) {
      const r = wr(['secret', 'put', n, '--name', WORKER], v);
      if (r.status !== 0) return stop(`${n} failed (wrangler exit ${r.status}); run again to redo both secrets.`);
      say(`put ${n} on ${WORKER}`);
    }
    const w = workerSecrets(), fs = flySecrets();
    const missing = [...WORKER_SECRETS.filter(n => !w?.includes(n)).map(n => `${WORKER}:${n}`), ...(fs?.includes('CONVERT_TOKEN') ? [] : [`${FLY_APP}:CONVERT_TOKEN`])];
    if (missing.length) return stop(`VERIFY FAILED, missing: ${missing.join(', ')}.`);
    say(`verified: CONVERT_TOKEN and FILE_JOB_SECRET on ${WORKER}; CONVERT_TOKEN on ${FLY_APP}. Conversion is still OFF until CONVERT_URL and FILE_JOB_ORIGIN are released.`);
    return 0;
  }

  async function provision() {
    if (!done('APP')) {
      say(exists ? `note: ${FLY_APP} already exists and was not created by this script; it will be ADOPTED, not recreated.` : `will create ${FLY_APP}: new infrastructure that starts the Fly bill once deployed.`);
      if (!(await confirm(PHRASE.app, exists ? `adopt the existing ${FLY_APP}` : `create ${FLY_APP}`))) return stop('confirmation not given.');
      if (!exists) {
        const r = fl(['apps', 'create', FLY_APP, '--org', FLY_ORG]);
        if (r.status !== 0) return stop(`fly apps create failed (exit ${r.status}).`);
        if (!flyApps()?.includes(FLY_APP)) return stop(`${FLY_APP} is not in the org listing after creation.`);
      }
      mark('APP', exists ? 'adopted' : 'created');
      say(`${FLY_APP} ${exists ? 'adopted' : 'created'}`);
    } else say(`APP already done (${value('APP')}); skipped`);

    if (!done('SECRETS')) {
      if (onWorker.length && !done('SECRETS_STARTED')) return stop(`${onWorker.join(' and ')} already exist on ${WORKER} but this script did not put them. Replacing them is \`rotate\`; this command never overwrites.`);
      if (!(await confirm(PHRASE.secrets, `put the converter secrets on ${FLY_APP} and ${WORKER}`))) return stop('confirmation not given.');
      mark('SECRETS_STARTED');
      const code = await putSecrets(true);
      if (code) return code;
      mark('SECRETS');
    } else say('SECRETS already done; skipped');

    if (!o.sha) return stop('the DEPLOY step needs --sha <40-hex commit of rabbit-hole/main that holds packages/file-convert/fly.prod.toml>.');
    if (value('DEPLOY') !== o.sha) {
      say(`will build and deploy commit ${o.sha.slice(0, 12)} to ${FLY_APP} with one machine (--ha=false, remote build). It starts the machine and the Fly bill.`);
      if (!(await confirm(PHRASE.deploy, `deploy ${o.sha.slice(0, 12)} to ${FLY_APP}`))) return stop('confirmation not given.');
      const ctx = deps.makeContext(o.sha);
      try {
        const r = fl(['deploy', ctx, '--config', `${ctx}/fly.prod.toml`, '-a', FLY_APP, '--build-arg', `CONVERT_BUILD=${o.sha}`, '--ha=false', '--remote-only']);
        if (r.status !== 0) return stop(`fly deploy failed (exit ${r.status}); run again to retry the deploy.`);
      } finally { deps.cleanup(ctx); }
      mark('DEPLOY', o.sha);
      say(`deployed ${o.sha.slice(0, 12)}`);
    } else say(`DEPLOY ${o.sha.slice(0, 12)} already done; skipped`);

    const bad = await health(o.sha);
    if (bad) return stop(`HEALTH FAILED: ${bad}.`);
    mark('HEALTH', o.sha);
    say(`converter healthy at ${CONVERT_URL}. NEXT (owner): release the two vars so Rabbit Hole uses it -- CONVERT_URL=${CONVERT_URL} and FILE_JOB_ORIGIN=${ORIGIN} in wrangler.rabbit-hole-prod.jsonc (candidate branch, then your \`!\` push); then run acceptance.mjs.`);
    return 0;
  }

  async function health(sha) {
    let h = null, err = 'no answer';
    for (let i = 0; i < 12 && !h; i++) {
      try { const r = await deps.fetch(`${CONVERT_URL}/health`); if (r.status === 200) h = await r.json(); else err = `HTTP ${r.status}`; } catch (e) { err = String(e?.cause?.code || e?.message || e); }
      if (!h) await deps.sleep(10000);
    }
    if (!h) return `/health gave ${err}`;
    const got = Object.keys(h.converters || {}).sort();
    say(`health: version ${h.version}, sandbox ${h.sandbox}, slots ${h.slots}, converters ${got.join(', ')}`);
    if (h.ok !== true || h.service !== 'rabbit-hole-convert') return 'ok is not true or the service name is wrong';
    if (JSON.stringify(got) !== JSON.stringify(CONVERTERS)) return `converters are ${got.join(', ')}, expected ${CONVERTERS.join(', ')}`;
    if (!String(h.version).includes(sha.slice(0, 12))) return `the running version ${h.version} does not carry commit ${sha.slice(0, 12)}`;
    for (const [label, auth] of [['no token', {}], ['a wrong token', { authorization: `Bearer ${deps.random(32).toString('base64url')}` }]]) {
      const r = await deps.fetch(`${CONVERT_URL}/jobs`, { method: 'POST', headers: auth, body: '{}' });
      say(`  POST /jobs with ${label}: ${r.status}`);
      if (r.status !== 401) return `POST /jobs with ${label} answered ${r.status}, not 401`;
    }
    return null;
  }

  async function rotate() {
    if (!done('SECRETS')) return stop('there is nothing to rotate: no SECRETS step is recorded. Run without `rotate` first.');
    say('rotating replaces both secrets. Jobs in flight during the swap may get one 401 and are retried by the runner.');
    if (!(await confirm(PHRASE.rotate, 'replace CONVERT_TOKEN and FILE_JOB_SECRET'))) return stop('confirmation not given.');
    const code = await putSecrets(false);
    if (code) return code;
    mark('ROTATED');
    return 0;
  }

  async function rollback(level) {
    const what = { L1: `delete CONVERT_TOKEN from ${WORKER}: conversion is OFF at once (new jobs fail with "File conversion is not configured on this server."), no deploy`,
      L2: `stop every machine of ${FLY_APP} (it holds no state; a request restarts it, so do L1 first)`, L3: `DESTROY ${FLY_APP}: irreversible; the vars must also be removed by a release` }[level];
    say(`rollback ${level}: ${what}`);
    if (!(await confirm(PHRASE[level], level === 'L1' ? 'turn conversion off' : level === 'L2' ? 'stop the converter' : `destroy ${FLY_APP}`))) return stop('confirmation not given.');
    if (level === 'L1') {
      const r = wr(['secret', 'delete', 'CONVERT_TOKEN', '--name', WORKER], 'y\n');
      if (r.status !== 0) return stop(`wrangler secret delete failed (exit ${r.status}).`);
      if (workerSecrets()?.includes('CONVERT_TOKEN')) return stop('CONVERT_TOKEN is still listed.');
      mark('ROLLBACK_L1');
      say('conversion is OFF. To turn it back on: `rotate` (a new token) or put the same secret again; nothing else changes.');
    } else if (level === 'L2') {
      const r = fl(['machines', 'list', '-a', FLY_APP, '--json']);
      const ids = r.status === 0 ? listed(r.stdout || '', 'id') : null;
      if (!ids?.length) return stop('could not list the machines (or there are none).');
      const s = fl(['machine', 'stop', ...ids, '-a', FLY_APP]);
      if (s.status !== 0) return stop(`fly machine stop failed (exit ${s.status}).`);
      mark('ROLLBACK_L2');
      say(`stopped ${ids.length} machine(s). A dispatch would start one again: keep conversion off (L1) while it is stopped.`);
    } else {
      const r = fl(['apps', 'destroy', FLY_APP, '--yes']);
      if (r.status !== 0) return stop(`fly apps destroy failed (exit ${r.status}).`);
      mark('ROLLBACK_L3');
      say(`${FLY_APP} destroyed. Also release the removal of CONVERT_URL and FILE_JOB_ORIGIN from wrangler.rabbit-hole-prod.jsonc.`);
    }
    return 0;
  }
}
