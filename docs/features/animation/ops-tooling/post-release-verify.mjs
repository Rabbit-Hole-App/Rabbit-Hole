// READ ONLY post-release verification of the Animation production release. Every request is a GET; nothing is changed; no model call; no session.
// Run it the second release.cmd prints RELEASE DONE, through with-cf.mjs so the Cloudflare token and account come from the environment by name
// (they are never printed), from the release worktree so prod-release.mjs servedRelease is the same reader release.sh's read-back uses:
//   node C:/s/spec/day-1021/with-cf.mjs C:/Users/cyudhist/Desktop/workspace/animation-release node C:/s/spec/animation/release/post-release-verify.mjs --sha <release sha> [--state on|off|kill]
// --state defaults to on (the Animation release). After a forward recovery use --state off (rollback/animation-disable) or --state kill (rollback/animation-kill).
// Items (one PASS / FAIL / UNKNOWN line each; exit 0 only when none is FAIL or UNKNOWN):
//   1 served commit      rabbit-hole-app and rabbit-hole-cp both serve <sha>[0:12] as one 100% version (servedRelease)
//   2 app flags          ANIMATION_ENABLED "true", ANIMATION_EXECUTION_KILL "false", no ANIMATION_DIAGNOSTICS binding of any type, no other ANIMATION_* name
//   3 cp flags           the control plane has no ANIMATION_* binding at all
//   4 Durable Object     app binds ANIMATION_JOBS -> AnimationJobs; migration tag animation-jobs-1 applied (script list migration_tag; if the API does not
//                        return it, the AnimationJobs SQLite namespace of rabbit-hole-app counts, and the line says which evidence it used)
//   5 bundle             prod-bundle-probe.mjs --origin <origin>: the served entry graph reaches Animation3DCard and declares curve_radius + action_motion
//   6 routes             signed-out GET /api/learn/animation/jobs?board=x is 401 (never 404 = disabled, never 5xx); the five diagnostics/seed/probe paths are 404
// Only the names and values of the three Animation flags are ever printed from Cloudflare settings.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const APP = 'rabbit-hole-app', CP = 'rabbit-hole-cp', TAG = 'animation-jobs-1';
const API = 'https://api.cloudflare.com/client/v4';
const DIAGNOSTIC_PATHS = ['render-fixture', 'render-result', 'render-candidate', 'seed-outcomes', 'seed-fixture'].map(n => `/api/learn/animation/diagnostics/${n}`);
const ROUTE = '/api/learn/animation/jobs?board=x';
const UA = { 'User-Agent': 'rabbit-hole-prod-release-readonly' };

// deps: { fetch, token, account, sha, origin, servedRelease, probe(origin) -> { code, out } }
export async function verify(deps) {
  const { fetch, token, account, sha, origin, servedRelease, probe, state = "on" } = deps;
  // state: on (the release), off (rollback/animation-disable is live: ANIMATION_ENABLED "false"), kill (rollback/animation-kill is live: ANIMATION_EXECUTION_KILL "true")
  const WANT_FLAGS = { on: { ANIMATION_ENABLED: "true", ANIMATION_EXECUTION_KILL: "false" }, off: { ANIMATION_ENABLED: "false", ANIMATION_EXECUTION_KILL: "false" }, kill: { ANIMATION_ENABLED: "true", ANIMATION_EXECUTION_KILL: "true" } };
  if (!WANT_FLAGS[state]) throw new Error(`state must be on, off or kill, not ${state}`);
  const results = [];
  const add = (item, status, detail) => results.push({ item, status, detail });
  const cf = async path => {
    const r = await fetch(`${API}/accounts/${account}${path}`, { method: 'GET', headers: { authorization: `Bearer ${token}`, ...UA } });
    const body = await r.json().catch(() => null);
    if (!r.ok || body?.success === false) throw new Error(`GET ${path.split('?')[0]}: HTTP ${r.status}`);
    return body.result;
  };
  const settings = {}, served = {};
  for (const name of [APP, CP]) {
    try { settings[name] = (await cf(`/workers/scripts/${name}/settings`)).bindings; if (!Array.isArray(settings[name])) throw new Error('no bindings list'); } catch (e) { settings[name] = null; add(`settings ${name}`, 'UNKNOWN', e.message); }
    try { served[name] = servedRelease((await cf(`/workers/scripts/${name}/deployments`)).deployments); } catch (e) { served[name] = { error: e.message }; }
  }
  // 1 served commit
  for (const name of [APP, CP]) {
    const s = served[name];
    if (s.error) add(`1 served commit ${name}`, 'FAIL', s.error);
    else if (s.sha12 === sha.slice(0, 12)) add(`1 served commit ${name}`, 'PASS', `serves ${s.sha12} as one version (${s.version})`);
    else add(`1 served commit ${name}`, 'FAIL', `serves ${s.sha12 ?? 'an unnamed version'}, wanted ${sha.slice(0, 12)}`);
  }
  // 2 app flags
  const app = settings[APP];
  if (app) {
    const flag = n => app.find(b => b.name === n);
    const animation = app.filter(b => String(b.name).startsWith('ANIMATION_'));
    const want = WANT_FLAGS[state];
    const bad = [
      ...Object.entries(want).filter(([n, v]) => !(flag(n)?.type === 'plain_text' && flag(n).text === v)).map(([n, v]) => `${n} is ${flag(n) ? JSON.stringify(flag(n).text ?? `(${flag(n).type})`) : 'unset'}, wanted ${JSON.stringify(v)}`),
      ...animation.filter(b => !(b.name in want) && !(b.name === "ANIMATION_JOBS" && b.type === "durable_object_namespace")).map(b => `${b.name} is set (${b.type})`),
    ];
    add('2 app flags', bad.length ? 'FAIL' : 'PASS', bad.length ? bad.join('; ') : `ANIMATION_ENABLED "${want.ANIMATION_ENABLED}", ANIMATION_EXECUTION_KILL "${want.ANIMATION_EXECUTION_KILL}", ANIMATION_DIAGNOSTICS unset (state ${state})`);
  }
  // 3 cp flags
  const cp = settings[CP];
  if (cp) {
    const set = cp.filter(b => String(b.name).startsWith('ANIMATION_'));
    add('3 cp flags', set.length ? 'FAIL' : 'PASS', set.length ? `the control plane has ${set.map(b => b.name).join(', ')}` : 'no ANIMATION_* binding (ANIMATION_DIAGNOSTICS unset)');
  }
  // 4 Durable Object binding and migration tag
  if (app) {
    const bound = app.find(b => b.type === 'durable_object_namespace' && b.name === 'ANIMATION_JOBS');
    if (bound?.class_name !== 'AnimationJobs') add('4 Durable Object', 'FAIL', bound ? `ANIMATION_JOBS binds ${bound.class_name}` : 'the app has no ANIMATION_JOBS binding');
    else {
      let tag = null, namespace = null, why = [];
      try { tag = (await cf('/workers/scripts')).find(s => s.id === APP)?.migration_tag ?? null; } catch (e) { why.push(e.message); }
      try { namespace = (await cf('/workers/durable_objects/namespaces')).find(n => n.script === APP && n.class === 'AnimationJobs') ?? null; } catch (e) { why.push(e.message); }
      if (tag === TAG) add('4 Durable Object', 'PASS', `ANIMATION_JOBS -> AnimationJobs; script migration_tag ${TAG}${namespace ? `; SQLite namespace ${namespace.use_sqlite ? 'yes' : 'NO'}` : ''}`);
      else if (tag && tag !== TAG) add('4 Durable Object', 'FAIL', `script migration_tag is ${tag}, wanted ${TAG}`);
      else if (namespace) add('4 Durable Object', namespace.use_sqlite === false ? 'FAIL' : 'PASS', `ANIMATION_JOBS -> AnimationJobs; the AnimationJobs namespace of ${APP} exists (use_sqlite ${namespace.use_sqlite}); the API did not return migration_tag, so the tag itself is not read`);
      else add('4 Durable Object', 'UNKNOWN', `binding present, but neither migration_tag nor the AnimationJobs namespace could be read${why.length ? ` (${why.join('; ')})` : ''}`);
    }
  }
  // 5 served bundle
  const p = probe(origin);
  add('5 bundle', p.code === 0 ? 'PASS' : 'FAIL', p.out.trim().split('\n').slice(-2).join(' | '));
  // 6 unauthenticated routes
  const get = async path => { try { return (await fetch(new URL(path, origin), { method: 'GET', redirect: 'manual', headers: UA })).status; } catch (e) { return `error ${e.name}`; } };
  const jobs = await get(ROUTE);
  const wantJobs = state === 'off' ? 404 : 401;
  add('6 route enabled', jobs === wantJobs ? 'PASS' : 'FAIL', `signed-out GET ${ROUTE} -> ${jobs}, wanted ${wantJobs}${jobs === 404 && state !== 'off' ? ' (404 means ANIMATION_ENABLED is off)' : ''}`);
  const open = [];
  for (const path of DIAGNOSTIC_PATHS) { const s = await get(path); if (s !== 404) open.push(`${path.split('/').pop()} -> ${s}`); }
  add('6 diagnostics closed', open.length ? 'FAIL' : 'PASS', open.length ? open.join('; ') : 'render-fixture, render-result, render-candidate, seed-outcomes, seed-fixture all 404');
  return results;
}

export const summary = results => results.map(r => `${r.status} ${r.item}: ${r.detail}`).join('\n');
export const exitCode = results => (results.some(r => r.status !== 'PASS') ? 1 : 0);

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
  const sha = arg('--sha'), origin = arg('--origin') || 'https://digrabbithole.com';
  const { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: account } = process.env;
  if (!/^[0-9a-f]{40}$/.test(sha || '')) { console.error('usage: post-release-verify.mjs --sha <40-hex release sha> [--origin https://digrabbithole.com] [--state on|off|kill]'); process.exit(2); }
  if (!token || !account) { console.error('no Cloudflare credentials in the environment: run through with-cf.mjs'); process.exit(2); }
  const { servedRelease } = await import(pathToFileURL(resolve('scripts/prod-release.mjs')).href);
  const state = arg('--state') || 'on';
  const probe = o => { const r = spawnSync(process.execPath, ['C:/s/spec/animation/release/prod-bundle-probe.mjs', '--origin', o], { encoding: 'utf8' }); return { code: r.status ?? 1, out: `${r.stdout}${r.stderr}` }; };
  const results = await verify({ fetch, token, account, sha, origin, servedRelease, probe, state });
  console.log(summary(results));
  console.log(results.every(r => r.status === 'PASS') ? `ALL PASS: production serves ${sha.slice(0, 12)} with Animation live` : `NOT ALL PASS: ${results.filter(r => r.status !== 'PASS').length} item(s) need attention`);
  process.exit(exitCode(results));
}
