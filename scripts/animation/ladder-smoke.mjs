// Focused smoke for one SGD-ladder MVP slice: PASS / FAIL / SKIP per item, nonzero exit on any FAIL. The test lists are data
// (ladder-smoke.json), so lanes adjust them without editing this file. Built to be the --smoke command of
//   node scripts/mvp-fast-path.mjs preview --mvp --sha <sha> --smoke "node scripts/animation/ladder-smoke.mjs mvp3 --strict" ...
// NOTE the fast path runs the smoke AFTER the build and BEFORE it deploys the clone, so inside --smoke the live items (--origin) cannot
// see the new build yet: the local items run against packages/web/dist-dev (the very bytes the deploy ships). Run the live items
// afterwards:  node scripts/animation/ladder-smoke.mjs mvp3 --live-only --origin https://rabbit-hole-web-dev-<worktree>.tryrabbithole.workers.dev
//
//   node scripts/animation/ladder-smoke.mjs <mvp2b|mvp3|mvp4|mvp5> [--sha <40hex>] [--origin <url>] [--cookie-file <file>] [--stack <persist dir>]
//        [--gate2-result <Gate 2 result json or folder> | --gate2-pending] [--browser] [--strict] [--require-live] [--require-browser] [--live-only] [--config <json>] [--gate2-args "<flags of sgd-qualify --check>"]
// SKIP is never a PASS. Reasons: missing (an optional file or test that is not in this candidate; --strict fails it), live (no --origin;
// --require-live fails it), browser (the browser check was not run; --require-browser fails it). No model call, no write, no deploy.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, basename, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirReader, originReader, probeBundle, scanBundle } from './bundle-probe.mjs';
import { allowed } from './recovery-steps.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, '../..');
export const SLICES = ['mvp2b', 'mvp3', 'mvp4', 'mvp5', 'combined'];
const strip = s => s.replace(/\x1b\[[0-9;]*m/g, '');

// ${flags}, ${golden}, ${stack}, ${origin}, ${sha}: a value that is an array is joined with commas inside a string.
const fill = (value, vars) => {
  if (Array.isArray(value)) return value.map(v => fill(v, vars));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fill(v, vars)]));
  if (typeof value !== 'string') return value;
  if (/^\$\{(\w+)\}$/.test(value) && Array.isArray(vars[value.slice(2, -1)])) return vars[value.slice(2, -1)];
  return value.replace(/\$\{(\w+)\}/g, (m, k) => (vars[k] === undefined ? m : Array.isArray(vars[k]) ? vars[k].join(',') : vars[k]));
};
const unresolved = value => JSON.stringify(value).match(/\$\{\w+\}/)?.[0];

// The real world; tests replace it with fakes.
export const realIo = {
  root: ROOT,
  exists: p => existsSync(p),
  list: dir => (existsSync(dir) ? readdirSync(dir) : []),
  run: (cmd, args, { cwd, env, shell = false } = {}) => {
    const r = spawnSync(cmd, args, { cwd, env: { ...process.env, ...env }, encoding: 'utf8', shell, maxBuffer: 64 * 1024 * 1024 });
    return { code: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
  },
  head: () => { const r = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }); return r.status === 0 ? r.stdout.trim() : null; },
  readText: p => readFileSync(p, 'utf8'),
  probe: ({ dir, origin }, features) => probeBundle({ read: dir ? dirReader(dir) : originReader(origin), entry: dir ? 'index.html' : '/explore', features }),
  scan: ({ dir, origin }, patterns) => scanBundle({ read: dir ? dirReader(dir) : originReader(origin), entry: dir ? 'index.html' : '/explore', patterns }),
  get: async (url, headers) => { try { return (await fetch(url, { redirect: 'manual', headers: { 'User-Agent': 'rabbit-hole-ladder-smoke', ...headers }, signal: AbortSignal.timeout(20_000) })).status; } catch (e) { return `error ${e.name}`; } },
};

// A file entry: a name, {file, optional}, or a basename glob. -> { found: [relative paths], missing: [{pattern, optional}] }
function resolveFiles(entries, cwdAbs, io, itemOptional) {
  const found = [], missing = [];
  for (const entry of entries) {
    const { file, optional = itemOptional } = typeof entry === 'string' ? { file: entry } : entry;
    if (file.includes('*')) {
      const dir = dirname(file), re = new RegExp(`^${basename(file).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
      const hits = io.list(join(cwdAbs, dir)).filter(n => re.test(n)).sort().map(n => `${dir}/${n}`);
      if (hits.length) found.push(...hits); else missing.push({ pattern: file, optional });
    } else if (io.exists(join(cwdAbs, file))) found.push(file);
    else missing.push({ pattern: file, optional });
  }
  return { found: [...new Set(found)], missing };
}

// Each handler -> { status: PASS|FAIL|SKIP|INFO, detail, skip?: 'missing'|'live'|'browser' }
const handlers = {
  note: item => ({ status: 'INFO', detail: item.text }),

  exists: (item, ctx) => {
    const gone = item.paths.filter(p => !ctx.io.exists(join(ctx.io.root, p)));
    return gone.length ? { status: 'FAIL', detail: `missing from this checkout: ${gone.join(', ')}` } : { status: 'PASS', detail: item.paths.join(', ') };
  },

  // The recorded Gate 2 table of the frozen candidate (sgd-qualify.mjs writes result-<sha7>-<stamp>.json): read only, never a job. PASS when the table says PASS
  // AND recounts to 8 of the first 9 accepted with a control that did not become SGD, AND the tested commit is this checkout or an ancestor of it with no change since
  // to a frozen file (the release candidate is the tested one plus only the copy and claim commit, scripts and docs).
  gate2: (item, ctx) => {
    const target = ctx.opts.gate2Result;
    // --gate2-pending: Gate 2 is still running, so this run is reported PENDING (exit 3, never a release pass) instead of failing on the absent table
    if (!target && ctx.opts.gate2Pending) return { status: 'SKIP', skip: 'pending', detail: 'PENDING: Gate 2 has not finished, so its result is NOT checked by this run and this run is NOT a release pass. Rerun without --gate2-pending and with --gate2-result when the table exists' };
    if (!target) return { status: 'SKIP', skip: 'missing', detail: 'no --gate2-result <result-*.json or its folder>: the recorded Gate 2 table of the frozen candidate is the MVP5 smoke input' };
    let file = target;
    if (!/\.json$/.test(target)) {
      const names = ctx.io.list(target).filter(n => /^result-.*\.json$/.test(n)).sort();
      if (!names.length) return { status: 'FAIL', detail: `no result-*.json in ${target}` };
      file = join(target, names.at(-1));
    }
    let rec;
    try { rec = JSON.parse(ctx.io.readText(file)); } catch (e) { return { status: 'FAIL', detail: `${file} is not readable JSON: ${e.message}` }; }
    const rows = rec.rows ?? [], first = rows.filter(r => r.n <= 9), accepted = first.filter(r => r.outcome === 'accepted').length, control = rows.find(r => r.n === 10);
    const bad = [];
    if (rec.verdict !== 'PASS') bad.push(`the recorded verdict is ${rec.verdict}`);
    if (first.length < 9 || accepted < 8) bad.push(`${accepted} of the first ${first.length} accepted, 8 of 9 needed`);
    if (!control || control.silentSgd !== false) bad.push('the control (job 10) has no result or silently became SGD');
    const tested = rec.sha, head = ctx.io.head();
    if (!/^[0-9a-f]{40}$/.test(tested ?? '')) bad.push('the table names no full candidate sha');
    let since = [];
    if (!bad.length && tested !== head) {
      const git = args => ctx.io.run('git', args, { cwd: ctx.io.root });
      if (git(['merge-base', '--is-ancestor', tested, 'HEAD']).code !== 0) bad.push(`the tested candidate ${tested.slice(0, 12)} is not an ancestor of this checkout ${head?.slice(0, 12)}`);
      else {
        since = git(['diff', '--name-only', tested, 'HEAD']).out.split('\n').filter(Boolean);
        const frozen = since.filter(p => allowed(p, item.frozen));
        if (frozen.length) bad.push(`changed since the tested candidate, in files Gate 2 measured: ${frozen.join(', ')}`);
      }
    }
    if (bad.length) return { status: 'FAIL', detail: `${file}: ${bad.join('; ')}` };
    return { status: 'PASS', detail: `Gate 2 PASS recorded for ${tested.slice(0, 12)} (preview version ${rec.version}): ${accepted} of the first 9 accepted, control did not become SGD; this checkout ${tested === head ? 'is the tested candidate' : `adds ${since.length} file(s) and none Gate 2 measured: ${since.slice(0, 12).join(', ')}${since.length > 12 ? ', ...' : ''}`}` };
  },

  tests: (item, ctx) => {
    const cwd = join(ctx.io.root, item.cwd);
    const { found, missing } = resolveFiles(item.files, cwd, ctx.io, item.optional);
    const hard = missing.filter(m => !m.optional);
    if (hard.length) return { status: 'FAIL', detail: `test file(s) named in ladder-smoke.json are not in this checkout: ${hard.map(m => m.pattern).join(', ')}` };
    const soft = missing.filter(m => m.optional).map(m => m.pattern);
    if (!found.length) return { status: 'SKIP', skip: 'missing', detail: `nothing matched (${soft.join(', ')}): not in this candidate` };
    const r = ctx.io.run(process.execPath, ['--test', ...found], { cwd, env: item.env });
    const out = strip(r.out), count = n => Number(out.match(new RegExp(`^(?:ℹ|#) ${n} (\\d+)`, 'm'))?.[1] ?? NaN);
    const [tests, fail] = [count('tests'), count('fail')];
    const note = soft.length ? `; optional, not in this candidate: ${soft.join(', ')}` : '';
    if (r.code !== 0 || fail > 0) return { status: 'FAIL', detail: `exit ${r.code}, ${Number.isNaN(fail) ? '?' : fail} failing of ${Number.isNaN(tests) ? '?' : tests}; ${out.split('\n').filter(l => /^\s*(not ok|✖)/.test(l)).slice(0, 4).join(' | ') || out.trim().split('\n').slice(-4).join(' | ')}` };
    if (!(tests > 0)) return { status: 'FAIL', detail: `exit 0 but ${Number.isNaN(tests) ? 'no test count' : '0 tests'} ran (a bad path under node --test exits 0): ${found.join(', ')}` };
    return { status: 'PASS', detail: `${tests} tests in ${found.length} file(s) (${item.cwd})${note}` };
  },

  script: (item, ctx) => {
    if (item.file && !ctx.io.exists(join(ctx.io.root, item.file))) return { status: 'SKIP', skip: 'missing', detail: `${item.file} is not in this candidate` };
    const args = item.args.flatMap(a => { const v = fill(a, ctx.vars); return Array.isArray(v) ? v : [v]; });
    const need = unresolved(args);
    if (need) return { status: 'SKIP', skip: 'live', detail: `needs ${need} on the command line` };
    const r = ctx.io.run(item.cmd, args, { cwd: ctx.io.root, env: item.env });
    return r.code === 0 ? { status: 'PASS', detail: `${item.cmd} ${args.join(' ')} exit 0` } : { status: 'FAIL', detail: `exit ${r.code}: ${strip(r.out).trim().split('\n').slice(-3).join(' | ')}` };
  },

  bundle: async (item, ctx) => {
    const target = item.origin ? { origin: ctx.opts.origin } : { dir: join(ctx.io.root, item.dir) };
    if (item.origin && !ctx.opts.origin) return { status: 'SKIP', skip: 'live', detail: 'no --origin: run it after the preview deploy' };
    if (item.dir && !ctx.io.exists(target.dir)) return { status: 'SKIP', skip: 'missing', detail: `${item.dir} is not built here` };
    const features = fill(item.features, ctx.vars), want = item.expect || 'present';
    const r = await ctx.io.probe(target, features);
    const ok = r.chunks > 0 && r.card.length > 0 && (want === 'present' ? r.declaredIn.length > 0 : r.declaredIn.length === 0);
    return { status: ok ? 'PASS' : 'FAIL', detail: `${r.chunks} chunks; Animation3DCard ${r.card.length ? 'reached' : 'NOT reached'}; ${features.join(',')} ${r.declaredIn.length ? `declared in ${r.declaredIn[0]}` : 'declared nowhere'} (expected ${want})` };
  },

  copy: async (item, ctx) => {
    if (item.dir && !ctx.io.exists(join(ctx.io.root, item.dir))) return { status: 'SKIP', skip: 'missing', detail: `${item.dir} is not built here` };
    if (item.origin && !ctx.opts.origin) return { status: 'SKIP', skip: 'live', detail: 'no --origin' };
    const r = await ctx.io.scan(item.origin ? { origin: ctx.opts.origin } : { dir: join(ctx.io.root, item.dir) }, [...item.absent, ...item.present]);
    const bad = item.absent.filter(p => r.hits[p].length), lacking = item.present.filter(p => !r.hits[p].length);
    if (!(r.chunks > 0 && r.card.length > 0)) return { status: 'FAIL', detail: 'the walk did not reach an Animation3DCard chunk (blind)' };
    if (bad.length || lacking.length) return { status: 'FAIL', detail: [...bad.map(p => `still present: /${p}/ in ${r.hits[p][0]}`), ...lacking.map(p => `absent: /${p}/`)].join('; ') };
    return { status: 'PASS', detail: `${r.chunks} chunks; none of ${item.absent.length} stale phrase(s); ${item.present.length} claim phrase(s) present` };
  },

  route: async (item, ctx) => {
    if (!ctx.opts.origin) return { status: 'SKIP', skip: 'live', detail: 'no --origin' };
    let headers = {};
    if (item.cookie) {
      if (!ctx.opts.cookieFile) return { status: 'SKIP', skip: 'live', detail: 'no --cookie-file' };
      headers = { Cookie: ctx.io.readText(ctx.opts.cookieFile).trim() }; // never printed
    }
    const status = await ctx.io.get(new URL(item.path, ctx.opts.origin).href, headers);
    return item.expect.includes(status) ? { status: 'PASS', detail: `GET ${item.path} -> ${status}` } : { status: 'FAIL', detail: `GET ${item.path} -> ${status}, wanted ${item.expect.join(' or ')}${status === 401 && item.cookie ? ' (the session cookie was not accepted)' : ''}` };
  },

  browser: async (item, ctx) => {
    const cmd = fill(item.cmd, { ...ctx.vars, stack: ctx.opts.stack ?? '<stack persist dir>' });
    const skip = why => ({ status: 'SKIP', skip: 'browser', detail: `NOT RUN, NOT A PASS: ${why}. Command: ${cmd}` });
    if (!ctx.io.exists(join(ctx.io.root, item.file))) return { status: 'SKIP', skip: 'missing', detail: `${item.file} is not in this candidate` };
    if (!ctx.opts.browser) return skip('browser checks run in CI fast-e2e or on the owner machine; pass --browser --stack <dir> to run it here when the stack is up');
    if (!ctx.opts.stack) return skip('--browser needs --stack <persist dir> of a started scripts/ci/stack.sh');
    if (typeof (await ctx.io.get('http://127.0.0.1:8878/', {})) !== 'number') return skip('no local stack answers on 127.0.0.1:8878 (bash scripts/ci/stack.sh start <dir>, Linux/CI)');
    const r = ctx.io.run('bash', ['-c', cmd], { cwd: ctx.io.root });
    return r.code === 0 ? { status: 'PASS', detail: `exit 0: ${strip(r.out).trim().split('\n').slice(-1)[0]}` } : { status: 'FAIL', detail: `exit ${r.code}: ${strip(r.out).trim().split('\n').slice(-3).join(' | ')}` };
  },
};

// A slice that `includes` others (combined, owner decision 23) is the union of their items in order, ids prefixed with their slice, then its own items. A tests item
// drops the files an earlier included item already runs (the same file is not run twice), and disappears when nothing is left.
export function itemsFor(config, slice) {
  const entry = config[slice];
  if (!entry.includes) return entry.items;
  const seen = new Set(), out = [];
  for (const inc of entry.includes) for (const raw of config[inc].items) {
    let item = { ...raw, id: `${inc}:${raw.id}` };
    if (item.kind === 'tests') {
      const files = item.files.filter(f => { const k = `${item.cwd}/${typeof f === 'string' ? f : f.file}`; if (seen.has(k)) return false; seen.add(k); return true; });
      if (!files.length && item.files.length) continue;
      item = { ...item, files };
    }
    out.push(item);
  }
  return [...out, ...entry.items];
}

// -> { lines: [string], counts, code }
export async function runSmoke(slice, opts = {}, io = realIo) {
  const config = opts.config ?? JSON.parse(readFileSync(opts.configPath ?? join(HERE, 'ladder-smoke.json'), 'utf8'));
  if (!SLICES.includes(slice) || !config[slice]) throw new Error(`slice must be one of ${SLICES.join(', ')}`);
  const vars = { flags: config.flags, golden: config.golden, stack: opts.stack, origin: opts.origin, sha: opts.sha, gate2args: opts.gate2Args?.split(/\s+/).filter(Boolean) };
  const ctx = { io, opts, vars: Object.fromEntries(Object.entries(vars).filter(([, v]) => v !== undefined)) };
  const lines = [], counts = { PASS: 0, FAIL: 0, SKIP: 0, INFO: 0 }, fatal = [], pending = [];
  const say = (status, id, text) => lines.push(`${status.padEnd(4)} ${id}: ${text}`);
  const head = io.head();
  lines.push(`ladder smoke ${slice}: ${config[slice].title}; checkout ${head ? head.slice(0, 12) : 'unknown'}`);
  if (opts.sha && head !== opts.sha) { say('FAIL', 'identity', `this checkout is at ${head ?? 'no commit'}, not the pinned ${opts.sha}`); counts.FAIL++; } else if (opts.sha) { say('PASS', 'identity', `checkout is the pinned ${opts.sha.slice(0, 12)}`); counts.PASS++; }
  for (const raw of itemsFor(config, slice)) {
    const item = fill(raw, ctx.vars);
    if (opts.liveOnly && !(item.origin || item.kind === 'route')) continue; // after the preview deploy: only the items that read the served clone
    let r;
    try { r = await handlers[item.kind](item, ctx); } catch (e) { r = { status: 'FAIL', detail: `the check itself failed: ${e.message}` }; }
    counts[r.status]++;
    const reason = r.skip ? `[${r.skip}]` : '';
    if (r.skip === 'pending') pending.push(item.id);
    if (r.status === 'SKIP' && ((r.skip === 'missing' && opts.strict) || (r.skip === 'live' && opts.requireLive) || (r.skip === 'browser' && opts.requireBrowser))) { fatal.push(item.id); }
    say(r.status, `${item.id}${reason}`, `${item.label} | ${r.detail}`);
  }
  const failed = counts.FAIL + fatal.length > 0;
  if (counts.SKIP) lines.push(`SKIPPED ITEMS ARE NOT PASSES (${counts.SKIP}): read the SKIP lines above${fatal.length ? `; ${fatal.join(', ')} are required by your flags and count as FAIL` : ''}`);
  if (opts.liveOnly) lines.push('LIVE ITEMS ONLY: the local list (tests, built bundle, harness) and the Gate 2 result are NOT part of this run; this is not a release pass');
  const verdict = failed ? 'FAIL' : pending.length ? 'PENDING GATE 2 (not a release pass)' : opts.liveOnly ? 'LIVE ITEMS ONLY (not a release pass)' : counts.SKIP ? 'PASS WITH SKIPS' : 'PASS';
  lines.push(`SMOKE ${slice} ${verdict}: ${counts.PASS} pass, ${counts.FAIL + fatal.length} fail, ${counts.SKIP - fatal.length} skip`);
  // exit 0 pass, 1 fail, 3 no failure but Gate 2 pending: a pending run can never be taken for the fast path's --smoke pass
  return { lines, counts, code: failed ? 1 : pending.length ? 3 : 0 };
}

export function parseArgs(argv) {
  const [slice, ...rest] = argv, o = { slice };
  const value = new Set(['--sha', '--origin', '--cookie-file', '--stack', '--config', '--gate2-args', '--gate2-result']);
  const flag = { '--browser': 'browser', '--strict': 'strict', '--require-live': 'requireLive', '--require-browser': 'requireBrowser', '--live-only': 'liveOnly', '--gate2-pending': 'gate2Pending' };
  for (let i = 0; i < rest.length; i++) {
    if (value.has(rest[i])) { const v = rest[++i]; if (v === undefined) throw new Error(`${rest[i - 1]} needs a value`); o[rest[i - 1].slice(2).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = v; } else if (flag[rest[i]]) o[flag[rest[i]]] = true; else throw new Error(`unknown argument ${rest[i]}`);
  }
  if (o.sha && !/^[0-9a-f]{40}$/.test(o.sha)) throw new Error('--sha must be a full 40-character commit sha');
  if (o.origin && !/^https:\/\/rabbit-hole-web-dev-[a-z0-9-]+\.tryrabbithole\.workers\.dev\/?$/.test(o.origin) && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(o.origin)) throw new Error('--origin must be an isolated rabbit-hole-web-dev-<worktree> clone or a local server, never production or the shared worker');
  if (o.configPath === undefined && o.config) { o.configPath = o.config; delete o.config; }
  return o;
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  try {
    const o = parseArgs(process.argv.slice(2));
    if (!SLICES.includes(o.slice)) throw new Error(`usage: ladder-smoke.mjs <${SLICES.join('|')}> [--sha <sha>] [--origin <clone url>] [--cookie-file <f>] [--stack <dir>] [--browser] [--strict] [--require-live] [--require-browser] [--live-only] [--config <json>]`);
    const { lines, code } = await runSmoke(o.slice, o);
    console.log(lines.join('\n'));
    process.exitCode = code;
  } catch (e) { console.error(`✗ ${e.message}`); process.exitCode = 2; }
}
