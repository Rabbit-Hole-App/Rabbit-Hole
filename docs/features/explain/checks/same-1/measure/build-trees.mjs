// Builds the three arm trees (git archive of `packages`) for the SAME-1 measurement. No provider call.
//   node build-trees.mjs [--repo C:/s/same-1] [--out C:/s/same1-measure-trees]
//        [--before 2aeca536d] [--after feat/same-1] [--everything feat/same-1,feat/same-1-validator,explain/same-1-data]
// before = the given ref as is; after = the given ref as is (planner text only: feat/same-1); everything = the FIRST ref of the list checked out detached in a temporary worktree, the others merged
// into it in order (`git merge --no-edit`; a ref that does not exist yet, such as Codex's explain/same-1-data before it is pushed, is skipped with a warning; a merge conflict stops the build).
// A bare branch name is tried as `rabbit-hole/<name>` first, then as given.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
const { values: a } = parseArgs({ options: { repo: { type: 'string', default: 'C:/s/same-1' }, out: { type: 'string', default: 'C:/s/same1-measure-trees' }, before: { type: 'string', default: '2aeca536d' }, after: { type: 'string', default: 'feat/same-1' }, everything: { type: 'string', default: 'feat/same-1,feat/same-1-validator,explain/same-1-data' } } });
const git = (args, cwd = a.repo, input) => { const r = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 1 << 28, input }); return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() }; };
const resolve = ref => { for (const candidate of [`rabbit-hole/${ref}`, ref]) { const r = git(['rev-parse', '--verify', '--quiet', `${candidate}^{commit}`]); if (r.ok) return r.out; } return null; };
git(['fetch', '-q', 'rabbit-hole']);
const archive = (sha, dest) => {
  fs.rmSync(dest, { recursive: true, force: true }); fs.mkdirSync(dest, { recursive: true });
  // bash: GNU tar understands the piped archive (the Windows system tar does not take it on stdin)
  const r = spawnSync('bash', ['-c', 'git -C "$1" archive "$2" packages | tar -x -C "$3"', 'x', a.repo.replace(/^([A-Za-z]):/, '/$1'), sha, dest.split(String.fromCharCode(92)).join('/').replace(/^([A-Za-z]):/, '/$1')], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`archive of ${sha} failed: ${r.stderr}`);
};
const summary = {};
for (const [arm, ref] of [['before', a.before], ['after', a.after]]) { const sha = resolve(ref); if (!sha) throw new Error(`cannot resolve ${ref}`); archive(sha, path.join(a.out, arm)); summary[arm] = { ref, sha }; }
const refs = a.everything.split(',').map(s => s.trim()).filter(Boolean), merged = [], skipped = [];
const wt = path.join(a.out, '_everything-worktree');
fs.rmSync(wt, { recursive: true, force: true }); git(['worktree', 'prune']);
const first = resolve(refs[0]); if (!first) throw new Error(`cannot resolve the first ref ${refs[0]}`);
if (!git(['worktree', 'add', '--detach', wt, first]).ok) throw new Error('worktree add failed');
try {
  merged.push({ ref: refs[0], sha: first });
  for (const ref of refs.slice(1)) {
    const sha = resolve(ref);
    if (!sha) { skipped.push(ref); console.warn(`WARNING: ${ref} does not exist (yet); skipped`); continue; }
    const m = git(['-c', 'user.name=measure', '-c', 'user.email=measure@example.test', 'merge', '--no-edit', sha], wt);
    if (!m.ok) { git(['merge', '--abort'], wt); throw new Error(`merge of ${ref} conflicts: ${m.err || m.out}`); }
    merged.push({ ref, sha });
  }
  const head = git(['rev-parse', 'HEAD'], wt).out;
  archive(head, path.join(a.out, 'everything'));
  summary.everything = { merged, skipped, tree: git(['rev-parse', 'HEAD^{tree}'], wt).out };
} finally { git(['worktree', 'remove', '--force', wt]); }
fs.writeFileSync(path.join(a.out, 'trees.json'), JSON.stringify(summary, null, 1));
console.log(JSON.stringify(summary));
