import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readJson, writeJson } from '../state.mjs';
import { command, configuredCommand, exists, integration, manifest, scrub } from './operator.mjs';

export async function run(ctx) {
  if (!ctx.go) throw new Error('Release requires --go');
  const artefacts = [];
  try {
    if (ctx.fixture || ctx.dryRun) return { status: 'fail', artefacts, notes: 'Release is a no-op in dry-run/fixture mode; no launcher, ledger or queue mutation ran.' };
    if (ctx.state?.stages?.['08']?.stop !== 'STOP-4' || !await exists(join(ctx.topicDir, 'READY.md'))) throw new Error('Release requires the saved STOP-4 READY checkpoint.');
    const { commands, ledgerPath, queuePath } = ctx.config.release ?? {};
    if (!Array.isArray(commands) || !commands.length || commands.some(c => typeof c !== 'string' || !c.trim()) || !ledgerPath || !queuePath) {
      return { status: 'fail', artefacts, notes: 'Release commands or ledger/queue paths are empty; no release launcher ran and no release was recorded.' };
    }
    const integrated = await integration(ctx);
    const ledger = await readFile(ledgerPath, 'utf8'), queue = await readJson(queuePath);
    if (!Array.isArray(queue) || queue.some(row => !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(row.topic) || !Array.isArray(row.lessons))) throw new Error('Queue must be an ordered array of topic and lessons entries.');
    const entries = queue;
    const index = entries.findIndex(row => row.topic === ctx.topic);
    if (index < 0) throw new Error('The current topic is missing from the configured queue.');
    const head = (await command(ctx, '09', 'candidate', 'git', ['rev-parse', 'HEAD'], { cwd: integrated.worktree })).stdout.trim();
    if (!/^[a-f0-9]{40}$/.test(head)) throw new Error('Release candidate commit could not be identified.');
    const receiptPath = join(ctx.topicDir, 'release.json');
    let receipt = await exists(receiptPath) ? await readJson(receiptPath) : { topic: ctx.topic, branch: integrated.branch, head, queueBefore: structuredClone(queue), launcherCompleted: false };
    if (receipt.head !== head || receipt.topic !== ctx.topic) throw new Error('Release receipt belongs to another candidate; inspect it before restarting launchers.');
    if (!receipt.launcherCompleted) {
      for (let i = 0; i < commands.length; i++) {
        const result = await configuredCommand(ctx, '09', `launcher-${i + 1}`, commands[i], integrated.worktree);
        artefacts.push(result.log);
      }
      receipt.launcherCompleted = true; receipt.releasedAt = new Date().toISOString();
      artefacts.push(await manifest(ctx, 'release.json', receipt));
    }
    const nextTopic = entries.filter((_, i) => i !== index)[0]?.topic ?? null;
    const marker = `<!-- topic-release:${ctx.topic}:${head} -->`;
    if (!ledger.includes(marker)) await writeFile(ledgerPath, `${ledger.trimEnd()}\n\n${marker}\n| ${receipt.releasedAt.slice(0, 10)} | ${ctx.topic} | ${head} | tier 1; configured launcher completed; next topic ${nextTopic ?? 'none'} |\n`);
    entries.splice(index, 1);
    await writeJson(queuePath, entries);
    receipt.status = 'recorded'; receipt.nextTopic = nextTopic;
    if (!artefacts.includes(receiptPath)) artefacts.push(receiptPath);
    await manifest(ctx, 'release.json', receipt);
    return { status: 'ok', artefacts, notes: `Configured tier-1 release launchers completed; ledger and topic queue updated.${nextTopic ? ' Next topic is recorded in the queue.' : ' No next topic is queued.'}` };
  } catch (error) { return { status: 'fail', artefacts, notes: scrub(error.message, ctx) }; }
}
