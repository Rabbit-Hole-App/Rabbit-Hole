// READ ONLY post-release verification of one SGD-ladder slice in production. Every request is a GET; nothing is changed; no model call; no session.
// It runs the release's own checks (C:/s/spec/animation/release/post-release-verify.mjs: served commit of both Workers, app and control-plane flags, the
// Durable Object binding, the base bundle probe, the signed-out routes) and adds the slice's own. Run it the second release-mvp.sh / release.sh prints
// RELEASE DONE, through with-cf.mjs so the Cloudflare token and account come from the environment by name (never printed), from a worktree that has
// scripts/prod-release.mjs (servedRelease is the reader release.sh's own read-back uses):
//   node C:/s/spec/day-1021/with-cf.mjs <worktree> node scripts/animation/post-release-verify-ladder.mjs --slice mvp3 --sha <40-hex release sha>
//        [--origin https://digrabbithole.com] [--state on|off|kill] [--recovered] [--canary-file <file>] [--no-base] [--base-dir C:/s/spec/animation/release]
// --recovered: the sha is a forward RECOVERY release of the slice (cut-recovery.sh), so the slice's own checks expect the recovered state.
// --no-base: only the checks that need no credential (the base items are then absent, and "served commit" is reported UNKNOWN, never PASS).
// Items (one PASS / FAIL / UNKNOWN line each; exit 0 only when none is FAIL or UNKNOWN):
//   all       served commit (from the base item 1); signed-out jobs route 401, results route 401 (404 when --state off), the five diagnostics paths 404
//   mvp2b     ANIMATION_STREAMING on the app Worker: unset or "true" (the default, streaming on); "false" when --recovered
//   combined  (owner decision 23: ONE release carries mvp2b + mvp3 + mvp4 + mvp5) all of the items of mvp2b, mvp3 and mvp5. The prompts are server code: they are verified by the served commit, not by a GET
//   mvp3+     the served bundle declares the five client features (surface_grid trail_points text_readout arrow_anchor clamp). Also after a mvp3 recovery:
//             the recovery filters the five in the SERVER (animation-brief.js clientFeatures), so the browser still declares them
//   mvp5      the request-box copy is the final /animation line (owner decision 38: no sentence about loss surfaces) and neither old sentence, "not supported yet" or "Also draws
//             gradient descent on a loss surface", is in any chunk; the canary description file names weekly, SGD and two failures in a row (--canary-file). --recovered: the
//             "not supported yet" line is back
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { LADDER_FEATURES, originReader, probeBundle, scanBundle } from './bundle-probe.mjs';

const UA = { 'User-Agent': 'rabbit-hole-prod-release-readonly' };
export const DIAGNOSTIC_PATHS = ['render-fixture', 'render-result', 'render-candidate', 'seed-outcomes', 'seed-fixture'].map(n => `/api/learn/animation/diagnostics/${n}`);
export const JOBS = '/api/learn/animation/jobs?board=x';
export const RESULTS = '/api/learn/animation/jobs/results/ar_post_release_probe?board=x&features=';
export const NOT_SUPPORTED_COPY = ['loss surfaces?[^"\'`]{0,120}not (yet )?supported', 'not (yet )?supported[^"\'`]{0,120}loss surfaces?', 'optimizers are not supported yet'];
export const STALE_COPY = [...NOT_SUPPORTED_COPY, 'Also draws gradient descent on a loss surface']; // either old sentence
export const FINAL_COPY = 'Describe an idea to see as a live 3D scene you can watch, adjust or play; review its plan, then generate it\\. Works best for mechanisms, loops and small games\\.';
export const SLICES = ['mvp2b', 'mvp3', 'mvp4', 'mvp5', 'combined'];

// The base item 2 knows ANIMATION_ENABLED / ANIMATION_EXECUTION_KILL only and calls any other ANIMATION_* name a failure. ANIMATION_STREAMING is a
// legitimate recovery var of MVP2b, judged by this file's own mvp2b item, so a base item 2 whose ONLY complaint is that name is let through.
export function reclassifyBase(results) {
  return results.map(r => {
    if (!/^2 app flags/.test(r.item) || r.status !== 'FAIL') return r;
    const rest = String(r.detail).split('; ').filter(p => !/^ANIMATION_STREAMING is set\b/.test(p));
    return rest.length ? r : { ...r, status: 'PASS', detail: 'ANIMATION_ENABLED/ANIMATION_EXECUTION_KILL as wanted (ANIMATION_STREAMING is judged by the mvp2b item)' };
  });
}

// deps: { slice, sha, origin, state, recovered, fetch, read(path)->text|null, cf(path)->result (or null), baseResults (or null), canaryText (or null) }
export async function verifyLadder(deps) {
  const { slice, sha, origin, state = 'on', recovered = false, fetch: get, read, cf, baseResults = null, canaryText = null } = deps;
  if (!SLICES.includes(slice)) throw new Error(`slice must be one of ${SLICES.join(', ')}`);
  const out = [], add = (item, status, detail) => out.push({ item, status, detail });
  // served commit: the base reader or nothing; an HTTP-only run cannot know it
  const served = (baseResults ?? []).filter(r => /^1 served commit/.test(r.item));
  if (!served.length) add('served commit', 'UNKNOWN', 'not read: no Cloudflare credentials (run through with-cf.mjs) or --no-base');
  else add('served commit', served.every(r => r.status === 'PASS') ? 'PASS' : 'FAIL', `${served.map(r => `${r.item.replace('1 served commit ', '')}: ${r.detail}`).join(' | ')} (wanted ${sha.slice(0, 12)})`);

  const status = async path => { try { return (await get(new URL(path, origin), { method: 'GET', redirect: 'manual', headers: UA })).status; } catch (e) { return `error ${e.name}`; } };
  const wantRoute = state === 'off' ? 404 : 401;
  for (const [name, path] of [['jobs', JOBS], ['results', RESULTS]]) {
    const s = await status(path);
    add(`signed-out ${name} route`, s === wantRoute ? 'PASS' : 'FAIL', `GET ${path.split('?')[0]} -> ${s}, wanted ${wantRoute}${s === 404 && state !== 'off' ? ' (404 means ANIMATION_ENABLED is off)' : ''}`);
  }
  const open = [];
  for (const path of DIAGNOSTIC_PATHS) { const s = await status(path); if (s !== 404) open.push(`${path.split('/').pop()} -> ${s}`); }
  add('diagnostics closed', open.length ? 'FAIL' : 'PASS', open.length ? open.join('; ') : 'render-fixture, render-result, render-candidate, seed-outcomes, seed-fixture all 404');

  if (slice === 'mvp2b' || slice === 'combined') {
    if (!cf) add('mvp2b streaming flag', 'UNKNOWN', 'ANIMATION_STREAMING is a Worker var: no Cloudflare credentials, so it was not read');
    else {
      let found;
      try { found = (await cf('/workers/scripts/rabbit-hole-app/settings')).bindings.find(b => b.name === 'ANIMATION_STREAMING'); } catch (e) { found = e; }
      if (found instanceof Error) add('mvp2b streaming flag', 'UNKNOWN', `settings unreadable: ${found.message}`);
      else if (recovered) add('mvp2b streaming flag', found?.type === 'plain_text' && found.text === 'false' ? 'PASS' : 'FAIL', `ANIMATION_STREAMING is ${found ? JSON.stringify(found.text ?? `(${found.type})`) : 'unset'}, wanted "false" (recovery: the single non-streaming request)`);
      else add('mvp2b streaming flag', !found || (found.type === 'plain_text' && found.text === 'true') ? 'PASS' : 'FAIL', `ANIMATION_STREAMING is ${found ? JSON.stringify(found.text ?? `(${found.type})`) : 'unset'}, wanted unset or "true" (streaming on)`);
    }
  }

  if (slice !== 'mvp2b') { // mvp3, mvp4, mvp5 and combined
    const p = await probeBundle({ read, entry: '/explore', features: LADDER_FEATURES });
    const ok = p.chunks > 0 && p.card.length > 0 && p.declaredIn.length > 0;
    add('five client features declared', ok ? 'PASS' : 'FAIL', `${p.chunks} chunks; Animation3DCard ${p.card.length ? 'reached' : 'NOT reached'}; ${LADDER_FEATURES.join(',')} ${p.declaredIn.length ? `declared in ${p.declaredIn[0]}` : 'declared nowhere'}${recovered && slice === 'mvp3' ? ' (a mvp3 recovery leaves the browser declaring them; the server refuses them)' : ''}`);
  }

  if (slice === 'mvp5' || slice === 'combined') {
    const s = await scanBundle({ read, entry: '/explore', patterns: [...STALE_COPY, FINAL_COPY] });
    const stale = STALE_COPY.filter(p => s.hits[p].length), notSupported = NOT_SUPPORTED_COPY.filter(p => s.hits[p].length), final = s.hits[FINAL_COPY].length > 0;
    if (!(s.chunks > 0 && s.card.length > 0)) add('request-box copy', 'FAIL', 'the walk did not reach an Animation3DCard chunk (blind)');
    else if (recovered) add('request-box copy', notSupported.length ? 'PASS' : 'FAIL', notSupported.length ? `the "not supported yet" line is back (${s.hits[notSupported[0]][0]})` : 'recovery wanted the "loss surfaces ... not supported yet" line back, and it is in no chunk');
    else add('request-box copy', !stale.length && final ? 'PASS' : 'FAIL', stale.length ? `still says it: /${stale[0]}/ in ${s.hits[stale[0]][0]}` : final ? `${s.chunks} chunks; the final /animation line in ${s.hits[FINAL_COPY][0]}; neither "not supported yet" nor "Also draws gradient descent"` : 'no old sentence, but no chunk carries the final /animation line');
    if (recovered) add('canary description', 'PASS', 'not judged for a recovery');
    else if (canaryText == null) add('canary description', 'UNKNOWN', 'pass --canary-file <the scheduled task description> (AN-21 closeout)');
    else {
      const need = [['weekly', /weekly|every week|once a week/i], ['SGD', /\bSGD\b|stochastic gradient/i], ['two failures in a row reopen', /two[^.\n]{0,40}(in a row|consecutive)/i]];
      const miss = need.filter(([, re]) => !re.test(canaryText)).map(([n]) => n);
      add('canary description', miss.length ? 'FAIL' : 'PASS', miss.length ? `the description does not say: ${miss.join(', ')}` : 'names weekly, SGD and two failures in a row');
    }
  }
  return [...(baseResults ?? []).map(r => ({ ...r, item: `base ${r.item}` })), ...out];
}

export const summary = results => results.map(r => `${r.status} ${r.item}: ${r.detail}`).join('\n');
export const exitCode = results => (results.some(r => r.status !== 'PASS') ? 1 : 0);

export function parseArgs(argv) {
  const o = { origin: 'https://digrabbithole.com', state: 'on', baseDir: 'C:/s/spec/animation/release' };
  const value = { '--slice': 'slice', '--sha': 'sha', '--origin': 'origin', '--state': 'state', '--canary-file': 'canaryFile', '--base-dir': 'baseDir' };
  for (let i = 0; i < argv.length; i++) {
    if (value[argv[i]]) { if (argv[i + 1] === undefined) throw new Error(`${argv[i]} needs a value`); o[value[argv[i]]] = argv[++i]; } else if (argv[i] === '--recovered') o.recovered = true; else if (argv[i] === '--no-base') o.noBase = true; else throw new Error(`unknown argument ${argv[i]}`);
  }
  if (!SLICES.includes(o.slice)) throw new Error(`--slice must be one of ${SLICES.join(', ')}`);
  if (!/^[0-9a-f]{40}$/.test(o.sha || '')) throw new Error('--sha must be a full 40-character release sha');
  if (!['on', 'off', 'kill'].includes(o.state)) throw new Error('--state must be on, off or kill');
  if (!/^https:\/\//.test(o.origin)) throw new Error('--origin must be an https origin');
  return o;
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  try {
    const o = parseArgs(process.argv.slice(2));
    const { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: account } = process.env, creds = !!(token && account);
    const cf = creds ? async path => {
      const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}${path}`, { method: 'GET', headers: { authorization: `Bearer ${token}`, ...UA } });
      const body = await r.json().catch(() => null);
      if (!r.ok || body?.success === false) throw new Error(`GET ${path.split('?')[0]}: HTTP ${r.status}`);
      return body.result;
    } : null;
    let baseResults = null;
    if (!o.noBase && creds) {
      const base = await import(pathToFileURL(resolve(o.baseDir, 'post-release-verify.mjs')).href);
      const { servedRelease } = await import(pathToFileURL(resolve('scripts/prod-release.mjs')).href);
      const probe = origin => { const r = spawnSync(process.execPath, [resolve(o.baseDir, 'prod-bundle-probe.mjs'), '--origin', origin], { encoding: 'utf8' }); return { code: r.status ?? 1, out: `${r.stdout}${r.stderr}` }; };
      baseResults = reclassifyBase(await base.verify({ fetch, token, account, sha: o.sha, origin: o.origin, servedRelease, probe, state: o.state }));
    } else if (!o.noBase) console.error('no Cloudflare credentials in the environment: the base checks and the served commit are UNKNOWN (run through with-cf.mjs)');
    const results = await verifyLadder({ ...o, fetch, read: originReader(o.origin), cf, baseResults, canaryText: o.canaryFile ? readFileSync(o.canaryFile, 'utf8') : null });
    console.log(summary(results));
    console.log(results.every(r => r.status === 'PASS') ? `ALL PASS: production serves ${o.sha.slice(0, 12)} and ${o.slice} checks out${o.recovered ? ' (recovered state)' : ''}` : `NOT ALL PASS: ${results.filter(r => r.status !== 'PASS').length} item(s) need attention`);
    process.exitCode = exitCode(results);
  } catch (e) { console.error(`✗ ${e.message}`); process.exitCode = 2; }
}
