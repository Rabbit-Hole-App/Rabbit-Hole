// The edit engine behind cut-recovery.sh: applies one slice's recovery recipe (recovery-recipes.json) to the CURRENT working tree, which
// the shell wrapper has just switched to a new branch cut from the candidate. It only edits and stages files; the wrapper commits,
// verifies and (explicitly) pushes. Run inside the repository:
//   node recovery-steps.mjs apply --slice mvp3 --recipes <json> --cand <sha> --prev <sha>      prints one "TOUCHED <path>" line per file
//   node recovery-steps.mjs message|allow --slice mvp3 --recipes <json>                       prints the commit message / the allow globs
//   node recovery-steps.mjs check --slice mvp3 --recipes <json>  < paths                      prints every path (stdin, one per line) the recipe does not allow; exit 1 if any
//   node recovery-steps.mjs release-check --cand <sha> --tip <sha>                          asks the tree's own prod-release.mjs checkCandidate to release the tip over the candidate
//   node recovery-steps.mjs verify --slice mvp3 --recipes <json>                              runs the recipe's node --test sets in this tree; a set that runs 0 tests fails
// Step ops (all exact, none silent):
//   replace          {file, pattern, with}   the regular expression must match exactly once; $1.. are the capture groups
//   restore          {paths[]}               each path goes back to its text at PREV; a path that did not exist at PREV is removed
//   restoreMatching  {under[], suffix?[], candMatches?, prevMatches?, required?, added?}   (added: only files the candidate added, which are removed)
//                    every file changed between PREV and the candidate under a listed prefix, and (when given) whose text at the candidate
//                    matches candMatches or whose text at PREV matches prevMatches, goes back to PREV (or is removed when added since)
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
const show = (rev, path) => { try { return execFileSync('git', ['show', `${rev}:${path}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 }); } catch { return null; } };

export const globRe = g => new RegExp(`^${g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*')}$`);
export const allowed = (path, globs) => globs.some(g => globRe(g).test(path));

// -> sorted list of touched paths (relative, forward slashes). `cwd` is the working tree; throws with a one-line fix on any miss.
export function applyRecipe(recipe, { cand, prev, cwd = process.cwd() }) {
  const touched = new Set(), abs = p => resolve(cwd, p);
  const put = (path, text) => { mkdirSync(dirname(abs(path)), { recursive: true }); writeFileSync(abs(path), text); touched.add(path); };
  const drop = path => { if (existsSync(abs(path))) { rmSync(abs(path)); touched.add(path); } };
  const restoreOne = path => { const old = show(prev, path); if (old === null) drop(path); else if (!existsSync(abs(path)) || readFileSync(abs(path), 'utf8') !== old) put(path, old); };
  let changed = null; // PREV..CAND name-status, read once and only when a step needs it
  const diff = () => changed ??= git('diff', '--name-status', '--no-renames', prev, cand).split('\n').filter(Boolean).map(l => { const [s, ...p] = l.split('\t'); return { status: s, path: p.join('\t') }; });
  for (const [i, step] of recipe.steps.entries()) {
    const where = `step ${i + 1} (${step.op})`;
    if (step.op === 'replace') {
      if (!existsSync(abs(step.file))) throw new Error(`${where}: ${step.file} does not exist in the candidate; the switch moved, update the recipe`);
      const text = readFileSync(abs(step.file), 'utf8'), re = new RegExp(step.pattern, 'g'), n = [...text.matchAll(re)].length;
      if (n !== 1) throw new Error(`${where}: /${step.pattern}/ matches ${n} time(s) in ${step.file}, expected exactly 1; the switch moved, update the recipe`);
      const next = text.replace(re, step.with);
      if (next === text) throw new Error(`${where}: the replacement leaves ${step.file} unchanged; the candidate is already in the recovery state`);
      put(step.file, next);
    } else if (step.op === 'restore') {
      for (const p of step.paths) {
        if (show(prev, p) === null && !existsSync(abs(p))) throw new Error(`${where}: ${p} is in neither the previous release nor the candidate; fix the recipe path`);
        restoreOne(p);
      }
    } else if (step.op === 'restoreMatching') {
      const cm = step.candMatches && new RegExp(step.candMatches, 'i'), pm = step.prevMatches && new RegExp(step.prevMatches, 'i');
      const hits = diff().filter(({ status }) => !step.added || status === 'A') // added: only files the candidate ADDED (they are removed)
        .filter(({ path }) => step.under.some(u => path === u || path.startsWith(u.endsWith('/') ? u : `${u}/`)) && (!step.suffix || step.suffix.some(s => path.endsWith(s))))
        .filter(({ status, path }) => !cm && !pm || (cm && status !== 'D' && cm.test(show(cand, path) ?? '')) || (pm && status !== 'A' && pm.test(show(prev, path) ?? '')));
      if (step.required && !hits.length) throw new Error(`${where}: no changed file under ${step.under.join(', ')} matches ${step.candMatches ?? step.prevMatches}; the candidate does not contain what this recovery undoes (wrong --prev, or the recipe is stale)`);
      hits.forEach(h => restoreOne(h.path));
    } else throw new Error(`${where}: unknown op ${step.op}`);
  }
  // what git says changed, not what the steps wrote: a file rewritten with identical text (line endings) is not a change
  if (touched.size) git('add', '-A', '--', ...touched);
  const list = git('diff', '--cached', '--name-only').split('\n').filter(Boolean).sort();
  if (!list.length) throw new Error('the recipe changes nothing: the candidate already matches the previous release for these files');
  return list;
}

// Would the real release check accept the recovery tip as a release over the served candidate? scripts/prod-release.mjs checkCandidate (loaded from the
// current tree, which is the recovery branch) refuses a tree that stops declaring a client feature the served release declares. The feature reader is the
// same regular expression prod-release.mjs uses (its local clientFeatures). -> { ok } | { ok: false, message } | { skipped }
export async function releaseCheck({ cand, tip, cwd = process.cwd() }) {
  const file = resolve(cwd, 'scripts/prod-release.mjs');
  if (!existsSync(file)) return { skipped: 'no scripts/prod-release.mjs in this tree' };
  const { checkCandidate } = await import(pathToFileURL(file).href);
  const features = rev => { try { return [...git('show', `${rev}:packages/web/src/animation3d/capabilities.js`).matchAll(/ANIMATION_CLIENT_FEATURES\s*=\s*Object\.freeze\(\[([^\]]*)\]/g)].flatMap(m => [...m[1].matchAll(/'([a-z_]+)'/g)].map(x => x[1])); } catch { return null; } };
  const isAncestor = (a, b) => { try { git('merge-base', '--is-ancestor', a, b); return true; } catch { return false; } };
  const verdict = checkCandidate({ sha: tip, mainTip: tip, cp: { sha12: cand.slice(0, 12) }, app: { sha12: cand.slice(0, 12) }, isAncestor, clientFeatures: features });
  return verdict === null ? { ok: true } : { ok: false, message: verdict.noop ?? String(verdict) };
}

// The recipe's own tests, run on the recovery branch itself so a broken cut is found when it is cut, not when it is needed.
export function verifyTests(recipe, cwd = process.cwd(), log = console.log) {
  for (const set of recipe.verify ?? []) {
    const r = spawnSync(process.execPath, ['--test', ...set.files], { cwd: resolve(cwd, set.cwd ?? '.'), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const out = `${r.stdout}${r.stderr}`.replace(/\x1b\[[0-9;]*m/g, ''), tests = Number(out.match(/^(?:ℹ|#) tests (\d+)/m)?.[1] ?? 0);
    if (r.status !== 0 || tests === 0) throw new Error(`verify ${set.cwd ?? '.'}: ${set.files.join(' ')} exit ${r.status}, ${tests} tests; ${out.split('\n').filter(l => /^\s*(not ok|✖)|Error/.test(l)).slice(0, 4).join(' | ')} (a dependent file may need to join the recipe's restore list)`);
    log(`verified ${tests} tests in ${set.files.length} file(s) (${set.cwd ?? '.'})`);
  }
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
  try {
    const cmd = process.argv[2], slice = arg('--slice'), recipes = JSON.parse(readFileSync(arg('--recipes'), 'utf8')), recipe = recipes[slice];
    if (!recipe || !Array.isArray(recipe.steps)) throw new Error(`no recipe for ${slice}`);
    if (cmd === 'allow') console.log(recipe.allow.join('\n'));
    else if (cmd === 'message') console.log(recipe.message);
    else if (cmd === 'apply') console.log(applyRecipe(recipe, { cand: arg('--cand'), prev: arg('--prev') }).map(p => `TOUCHED ${p}`).join('\n'));
    else if (cmd === 'check') {
      const bad = readFileSync(0, 'utf8').split('\n').filter(Boolean).filter(p => !allowed(p, recipe.allow));
      if (bad.length) { console.log(bad.join('\n')); process.exit(1); }
    } else if (cmd === 'verify') verifyTests(recipe);
    else if (cmd === 'release-check') {
      const r = await releaseCheck({ cand: arg('--cand'), tip: arg('--tip') });
      if (r.skipped) console.log(`skipped (${r.skipped})`);
      else if (r.ok) console.log(`checkCandidate accepts ${arg('--tip').slice(0, 12)} as a release over the served ${arg('--cand').slice(0, 12)}`);
      else { console.log(r.message); process.exit(1); }
    }
    else throw new Error('usage: recovery-steps.mjs apply|allow|message|check|verify|release-check --slice <s> --recipes <json> [--cand <sha> --prev <sha>]');
  } catch (e) { console.error(`STOP: ${e.message}`); process.exit(1); }
}
