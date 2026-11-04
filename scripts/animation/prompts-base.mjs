// READ ONLY. Which commit is the prompt base of a candidate: the value for  cut-recovery.sh combined <C4> --prompts-from <this>  (and, with ONE tree, the
// "MVP3 SHA" of decision 22: the integrator's tree just before the AN-20 prompt work). Two independent derivations over the candidate's FIRST-PARENT history
// (the integrator's own line, so a lane that merged other lanes' branches earlier does not confuse it):
//   A, by content: the AN-20 prompt cut deleted a sentence of the author prompt ("tube-curve wireframes on level lines", --marker). The prompt base is the last
//      first-parent commit that still has it; the AN-20 commit X is the next one (binary search, the marker is present at the previous release and absent at the candidate).
//   B, by subject: X is the oldest first-parent commit that touches a prompt file and whose subject says AN-20 (AN-20, an20).
// The base is X's first parent. A and B must agree; if they do not, nothing is decided (exit 1, both printed).
//   node scripts/animation/prompts-base.mjs <candidate sha> [--main <ref, default rabbit-hole/main>] [--marker <regex>]
// Also prints WARNINGS for every commit in <base>..<candidate> that touches a prompt file but does not say AN-20 (restoring the prompts would undo it too).
// Exit 0 agreed and clean, 1 ambiguous or warnings (values printed), 2 cannot decide. Nothing is written.
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const PROMPT_FILES = ['packages/control-plane/src/agents/animation-author.js', 'packages/control-plane/src/agents/animation-brief.js'];
export const MARKER = 'tube-curve wireframes on level lines';
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
const show = (cwd, rev, path) => { try { return execFileSync('git', ['show', `${rev}:${path}`], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 }); } catch { return ''; } };
const firstParent = (cwd, c) => git(cwd, 'rev-list', '--parents', '-n', '1', c).split(' ')[1];

// -> { value, a: {x, value}|null, b: {x, value}|null, agree, mainBase, subject, evidence[], warnings[] }; throws when neither derivation works
export function promptsBase(cand, { cwd = process.cwd(), main = 'rabbit-hole/main', marker = MARKER, files = PROMPT_FILES } = {}) {
  if (!/^[0-9a-f]{40}$/.test(cand || '')) throw new Error('the candidate must be a full 40-character sha');
  let mainBase;
  try { git(cwd, 'cat-file', '-e', `${cand}^{commit}`); mainBase = git(cwd, 'merge-base', cand, main); } catch { throw new Error(`${cand.slice(0, 12)} is not a commit here, or ${main} is not (git fetch rabbit-hole main)`); }
  const chain = git(cwd, 'rev-list', '--first-parent', '--reverse', `${mainBase}..${cand}`).split('\n').filter(Boolean);
  if (!chain.length) throw new Error('the candidate adds nothing to the previous release');
  // A: the transition of the marker along the chain
  const re = new RegExp(marker), has = c => re.test(show(cwd, c, files[0]));
  let a = null;
  if (has(mainBase) && !has(cand)) {
    let lo = 0, hi = chain.length - 1; // smallest index whose commit lacks the marker
    while (lo < hi) { const mid = (lo + hi) >> 1; if (has(chain[mid])) lo = mid + 1; else hi = mid; }
    a = { x: chain[lo], value: lo === 0 ? mainBase : chain[lo - 1] };
  }
  // B: the oldest first-parent commit touching a prompt file whose subject says AN-20
  const hits = git(cwd, 'log', '--first-parent', '--reverse', '--format=%H', '-i', '-E', '--grep=AN-?20', `${mainBase}..${cand}`, '--', ...files).split('\n').filter(Boolean);
  const b = hits.length ? { x: hits[0], value: firstParent(cwd, hits[0]) } : null;
  if (!a && !b) throw new Error('neither derivation works: the marker is not removed along the first-parent history and no first-parent prompt commit says AN-20; pass --marker <regex of a sentence AN-20 deleted>');
  const value = (a ?? b).value, agree = !!a && !!b && a.value === b.value;
  const warnings = [], evidence = [];
  for (const line of git(cwd, 'log', '--format=%h %s', `${value}..${cand}`, '--', ...files).split('\n').filter(Boolean)) (/AN-?20|FX-AN-05\d/i.test(line) ? evidence : warnings).push(line);
  if (a && b && !agree) warnings.push(`the two derivations disagree: by content ${a.value.slice(0, 9)}, by subject ${b.value.slice(0, 9)}; pick by reading both`);
  if (!a || !b) warnings.push(`only one derivation worked (${a ? 'content' : 'subject'}); read the evidence before using the value`);
  if (value === mainBase) warnings.push('the prompt base is the previous release itself: --prompts-from adds nothing over --prev');
  if (value === cand) throw new Error('the prompt base equals the candidate');
  return { value, a, b, agree, mainBase, subject: git(cwd, 'log', '-1', '--format=%h %s', value), evidence, warnings };
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
  try {
    const r = promptsBase(process.argv[2], { main: arg('--main'), marker: arg('--marker') });
    console.log(`prompt base (use as --prompts-from, and as the "MVP3 SHA" of decision 22): ${r.value}`);
    console.log(`  ${r.subject}`);
    console.log(`previous release (merge-base with main, use as --prev): ${r.mainBase}`);
    if (r.a) console.log(`  by content: the marker last appears at ${r.a.value.slice(0, 9)}; AN-20 prompt work first appears at ${r.a.x.slice(0, 9)}`);
    if (r.b) console.log(`  by subject: first first-parent prompt commit that says AN-20 is ${r.b.x.slice(0, 9)}, whose parent is ${r.b.value.slice(0, 9)}`);
    for (const e of r.evidence) console.log(`  prompt-file commit after the base: ${e}`);
    for (const w of r.warnings) console.log(`WARNING ${w.startsWith('the ') || w.startsWith('only ') ? w : `restoring the prompts would also undo: ${w}`}`);
    process.exitCode = r.warnings.length ? 1 : 0;
  } catch (e) { console.error(`STOP: ${e.message}`); process.exitCode = 2; }
}
