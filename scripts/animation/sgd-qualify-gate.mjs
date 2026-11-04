// Gate 2 preflight (AN-21, owner decision 22): nothing is spent unless the candidate under test IS the candidate Gate 1 measured, and the preview
// serves it. Every check is read-only: git in the candidate worktree, the candidate's own Gate 1 harness (verify-candidate), and wrangler's read
// commands on the dev preview. Any DIFFERENCE prints MUST_RERUN: Gate 1's result does not describe this candidate.
//
// Interface with lane (d)'s harness (scripts/animation/author-sample.mjs verifyCandidate, run from the candidate worktree):
//   node <worktree>/scripts/animation/author-sample.mjs verify-candidate --mvp3-sha S --prompts HASH --golden HASH --worktree PATH
//   -> stdout  PASS|FAIL mvp3-ancestor: ...  /  PASS prompt-files: <hash>  or  FAIL prompt-files: expected <E>, computed <C>  /  the same for
//      golden-artifact  /  RESULT PASS|FAIL (worktree ...); exit 0 on PASS, 1 on any FAIL or a missing flag.
// The harness is given the Gate 1 values and computes the two hashes itself, so Gate 1 and Gate 2 hash the prompt files and the golden artifact the
// same way. parseVerifyCandidate() and candidateHashes() are the only places that know this; an output without a RESULT line refuses (fail closed).
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

export const MUST_RERUN = 'GATE 1 MUST RERUN ON THE REAL CANDIDATE';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX = /^[0-9a-f]{7,64}$/i;

// Two SHAs name the same commit when one is a prefix of the other (7 or more hex).
export const sameSha = (a, b) => HEX.test(a || '') && HEX.test(b || '') && (a.toLowerCase().startsWith(b.toLowerCase()) || b.toLowerCase().startsWith(a.toLowerCase()));

// -> a configuration problem (a missing or malformed input: refuse, but nothing differs yet), or null.
export function inputProblem({ env = process.env, mvp3Sha, promptsHash, goldenHash, worktree }) {
  if (!env.PREVIEW_VERSION || !env.PREVIEW_SHA) return 'set PREVIEW_VERSION and PREVIEW_SHA (the integrator gives them)';
  if (!UUID.test(env.PREVIEW_VERSION)) return 'PREVIEW_VERSION is not a Cloudflare version id (a UUID)';
  if (!/^[0-9a-f]{7,40}$/i.test(env.PREVIEW_SHA)) return 'PREVIEW_SHA is not a git SHA (7 to 40 hex)';
  if (!worktree) return '--candidate-worktree is required (the checkout of the candidate under test)';
  if (!/^[0-9a-f]{7,40}$/i.test(mvp3Sha || '')) return '--mvp3-sha is required (the MVP3/C3 candidate SHA recorded in the Gate 1 table, 7 to 40 hex)';
  if (!HEX.test(promptsHash || '') || !HEX.test(goldenHash || '')) return '--prompts-hash and --golden-hash are required (the values recorded in the Gate 1 table)';
  return null;
}

// The harness's stdout -> { promptsHash, goldenHash, result }: the hashes it COMPUTED (the PASS line carries the hash, the FAIL line says "computed <hash>";
// "absent" when the file is missing), null for a part it did not print, and its RESULT line.
export function parseVerifyCandidate(stdout) {
  const lines = String(stdout).split('\n').map(l => l.trim());
  const computed = name => {
    const m = lines.map(l => l.match(new RegExp(`^(PASS|FAIL) ${name}:\s*(.*)$`))).find(Boolean);
    return !m ? null : m[1] === 'PASS' ? m[2].trim() : m[2].match(/computed\s+(\S+)/)?.[1] ?? null;
  };
  return { promptsHash: computed('prompt-files'), goldenHash: computed('golden-artifact'), result: lines.find(l => /^RESULT (PASS|FAIL)\b/.test(l)) ?? null };
}

// What wrangler printed -> { latest, flag(name), named: [hex tokens in the tag, message or annotations] }. The formats are the ones verify-preview.mjs
// has parsed on this preview since 2 November.
export function readBack(deployments, view) {
  const blocks = String(deployments).split(/\n(?=Created:)/).filter(b => /Version\(s\)/.test(b)), last = blocks.at(-1) || '';
  const tagged = [...(last + view).matchAll(/(?:Tag|Message|Annotations?):\s*(\S[^\n]*)/g)].map(m => m[1].trim()).filter(x => x !== '-');
  return { latest: last.match(/\(100%\)\s+([0-9a-f-]{36})/i)?.[1] ?? null, flag: n => String(view).match(new RegExp(`env\\.${n} \\("([^"]*)"\\)`))?.[1],
    named: tagged.join(' ').match(/\b[0-9a-f]{7,40}\b/gi) || [], tagged };
}

// -> { ok, refusal: 'input' | 'mismatch' | 'unverifiable' | null, mismatches: [], problems: [], lines: [], head }. deps: git(args) -> { status, stdout },
// candidateHashes(mvp3Sha, { promptsHash, goldenHash }) -> { promptsHash, goldenHash } as COMPUTED by the harness, wrangler(args) -> stdout.
export async function runGate(opts, deps) {
  const { env = process.env, mvp3Sha, promptsHash, goldenHash, worktree } = opts, lines = [], mismatches = [], problems = [];
  const bad = inputProblem(opts);
  if (bad) return { ok: false, refusal: 'input', mismatches, problems: [bad], lines };
  const sha = env.PREVIEW_SHA, version = env.PREVIEW_VERSION, pass = text => lines.push(`PASS ${text}`), differ = text => { mismatches.push(text); lines.push(`FAIL ${text}`); };
  const head = (deps.git(['rev-parse', 'HEAD']).stdout || '').trim();
  if (!/^[0-9a-f]{40}$/i.test(head)) return { ok: false, refusal: 'unverifiable', mismatches, problems: [`${worktree} is not a git checkout (rev-parse HEAD gave nothing)`], lines };
  if (sameSha(head, sha)) pass(`the candidate worktree HEAD ${head.slice(0, 9)} is PREVIEW_SHA`); else differ(`the candidate worktree HEAD is ${head.slice(0, 9)}, PREVIEW_SHA is ${sha}`);
  if (!(deps.git(['status', '--porcelain', '--untracked-files=no']).stdout || '').trim()) pass('the candidate worktree has no uncommitted change to a tracked file');
  else differ('the candidate worktree has uncommitted changes to tracked files, so it is not the committed candidate');
  if (deps.git(['rev-parse', '--verify', '--quiet', `${mvp3Sha}^{commit}`]).status !== 0) differ(`the Gate 1 candidate (MVP3/C3) SHA ${mvp3Sha} is not a commit in the candidate worktree`);
  else if (deps.git(['merge-base', '--is-ancestor', mvp3Sha, head]).status === 0) pass(`the Gate 1 candidate (MVP3/C3) SHA ${mvp3Sha.slice(0, 9)} is an ancestor of the candidate HEAD`);
  else differ(`the Gate 1 candidate (MVP3/C3) SHA ${mvp3Sha.slice(0, 9)} is not an ancestor of the candidate HEAD ${head.slice(0, 9)}`);

  let hashes;
  try { hashes = await deps.candidateHashes(mvp3Sha, { promptsHash, goldenHash }); } catch (error) { hashes = { error: error.message }; }
  if (hashes?.missing) differ(`the candidate has no Gate 1 harness (${hashes.missing}), so Gate 1 cannot have measured it`);
  else if (!hashes || hashes.error || ![hashes.promptsHash, hashes.goldenHash].every(h => HEX.test(h || '') || h === 'absent')) problems.push(`verify-candidate gave no usable hashes${hashes?.error ? `: ${hashes.error}` : ''}`);
  else {
    if (hashes.head && !sameSha(hashes.head, head)) differ(`verify-candidate reports HEAD ${hashes.head.slice(0, 9)}, git says ${head.slice(0, 9)}`);
    for (const [name, got, recorded] of [['prompt files', hashes.promptsHash, promptsHash], ['golden artifact', hashes.goldenHash, goldenHash]]) {
      if (got.toLowerCase() === recorded.toLowerCase()) pass(`the ${name} hash is the one Gate 1 recorded (${recorded.slice(0, 12)})`);
      else differ(`the ${name} hash is ${got.slice(0, 12)}, Gate 1 recorded ${recorded.slice(0, 12)}`);
    }
  }

  // The preview-pin gate: Cloudflare itself says which version is live and which SHA that version was tagged with.
  let deployments = '', view = '';
  try { deployments = deps.wrangler(['deployments', 'list']); view = deps.wrangler(['versions', 'view', version]); } catch (error) { problems.push(`could not read the preview from Cloudflare: ${error.message}`); }
  if (!problems.some(p => p.startsWith('could not read'))) {
    const back = readBack(deployments, view);
    if (back.latest?.toLowerCase() === version.toLowerCase()) pass(`the latest deployment is version ${version} at 100%`); else differ(`the latest deployment is ${back.latest ?? 'unreadable'} at 100%, PREVIEW_VERSION is ${version}`);
    if (back.named.some(token => sameSha(token, head))) pass(`the version's tag or message names the candidate SHA (${back.tagged.join(' | ').slice(0, 80)})`);
    else differ(back.named.length ? `the version's tag or message names ${[...new Set(back.named)].join(', ')}, the candidate is ${head.slice(0, 9)}` : 'the version has no tag or message naming a SHA, so Cloudflare does not say which commit the preview serves');
    for (const name of ['ANIMATION_ENABLED', 'ANIMATION_DIAGNOSTICS']) { if (back.flag(name) === 'true') pass(`${name} is true on the preview`); else problems.push(`${name} is ${back.flag(name) ?? 'not set'} on the preview (the spend guard reads the job diagnostics)`); }
    lines.push(`INFO USAGE_PLATFORM_DAY_USD on the preview: ${back.flag('USAGE_PLATFORM_DAY_USD') ?? 'not readable (a secret binding)'}`);
  }
  const refusal = mismatches.length ? 'mismatch' : problems.length ? 'unverifiable' : null;
  return { ok: !refusal, refusal, mismatches, problems, lines, head };
}

// The real dependencies. Credentials are read BY NAME from the credentials file and passed only to the wrangler child process.
export function realDeps({ worktree, worker, credentials, readKey, spawn = spawnSync }) {
  const run = (cmd, args, options) => spawn(cmd, args, { encoding: 'utf8', timeout: 120000, ...options });
  return {
    git: args => { const r = run('git', ['-C', worktree, ...args], {}); return { status: r.status, stdout: r.stdout || '' }; },
    candidateHashes: async (mvp3Sha, recorded) => {
      const script = join(worktree, 'scripts', 'animation', 'author-sample.mjs');
      if (!existsSync(script)) return { missing: `${script} does not exist` };
      const r = run(process.execPath, [script, 'verify-candidate', '--mvp3-sha', mvp3Sha, '--prompts', recorded.promptsHash, '--golden', recorded.goldenHash, '--worktree', worktree], { cwd: worktree });
      const parsed = parseVerifyCandidate(r.stdout); // a FAIL exits 1 too: what matters is the computed hashes it printed, so the exit code alone decides nothing
      return parsed.result ? parsed : { error: `exit ${r.status}: ${(r.stderr || r.stdout || '').trim().split('\n').at(-1) || 'no output'}` };
    },
    wrangler: args => {
      const r = run('npx', ['wrangler', ...args, '--name', worker, '--config', 'wrangler.dev.jsonc'], { cwd: join(worktree, 'packages', 'web'), shell: true,
        env: { ...process.env, CLOUDFLARE_API_TOKEN: readKey(credentials, 'CLOUDFLARE_API_TOKEN'), CLOUDFLARE_ACCOUNT_ID: readKey(credentials, 'CLOUDFLARE_ACCOUNT_ID') } });
      if (r.status !== 0) throw new Error(`wrangler ${args[0]} exit ${r.status}`); // the exit code only: its output may carry account detail
      return r.stdout || '';
    },
  };
}
