import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access } from 'node:fs/promises';
import { join } from 'node:path';

const execute = promisify(execFile);
const names = Object.freeze({ bench: 'scripts/explain-bench/bench.mjs', report: 'scripts/explain-bench/report.mjs',
  pack: 'scripts/explain-bench/topic-pack.mjs', demoPack: 'scripts/explain-bench/demo-lesson04-pack.mjs',
  demoSet: 'scripts/explain-bench/sets/demo-lesson04.json',
  slugIndex: 'docs/features/explain-on-canvas/handoff/figure-briefs/briefs/README.md' });

export async function toolPath(config, name) {
  if (!names[name] || !config.repo.toolingRoot) throw new Error('Configure a tooling checkout in config.local.json');
  const root = config.repo.toolingRoot;
  const { stdout: head } = await execute('git', ['rev-parse', 'HEAD'], { cwd: root });
  const { stdout: expected } = await execute('git', ['rev-parse', `${config.repo.toolingRef}^{commit}`], { cwd: root });
  if (head.trim() !== expected.trim()) throw new Error('The tooling checkout does not match repo.toolingRef');
  const path = join(root, names[name]);
  try { await access(path); }
  catch { throw new Error(`The pinned tooling checkout does not supply ${name}. Wait for its approved tooling merge.`); }
  return path;
}
