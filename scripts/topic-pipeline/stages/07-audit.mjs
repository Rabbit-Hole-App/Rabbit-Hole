import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readJson, writeJson } from '../state.mjs';
import { auditSchema } from '../schemas.mjs';
import { callAgent } from '../agents/call.mjs';
import { cardComparison, fileExists, validateIds } from '../agents/fixture-inputs.mjs';

async function auditPack(ctx, root, tag) {
  if (!await fileExists(root)) throw new Error('The required review pack is missing');
  const cards = [], artefacts = [];
  for (const entry of (await readdir(root, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const directory = join(root, entry.name);
    if (!await fileExists(join(directory, 'card.md'))) continue;
    const text = await readFile(join(directory, 'card.md'), 'utf8');
    const comparison = join(ctx.topicDir, 'audit-input', tag, `${entry.name}.png`);
    const images = await cardComparison(directory, comparison);
    const result = await callAgent(ctx, 'auditor', { topic: ctx.topic, cards: [{ id: entry.name, bodyAndPipeline: text }] }, {
      schema: auditSchema, images, validate: value => validateIds(value, 'cards', [entry.name], ctx.topic),
    });
    validateIds(result, 'cards', [entry.name], ctx.topic);
    cards.push(...result.cards);
    artefacts.push(comparison);
  }
  if (!cards.length) throw new Error('The review pack contains no cards');
  const path = join(ctx.topicDir, `audit.${tag}.json`);
  await writeJson(path, { topic: ctx.topic, cards });
  return { cards, artefacts: [...artefacts, path] };
}

export async function run(ctx) {
  let batch;
  const artefacts = [];
  if (ctx.fixture) {
    batch = await auditPack(ctx, join(ctx.fixtureDir, 'pack.human'), 'human');
    artefacts.push(...batch.artefacts);
  }
  const operational = !ctx.fixture || (ctx.dryRun && await fileExists(join(ctx.topicDir, 'pack.json')));
  if (operational) {
    batch = await auditPack(ctx, join(ctx.topicDir, 'pack'), 'round-1');
    artefacts.push(...batch.artefacts);
    const regenerate = batch.cards.filter(row => row.verdict === 'regenerate');
    if (regenerate.length && !batch.cards.some(row => row.verdict === 'hold') && ctx.config.limits.regenerateOnce) {
      const manifest = await readJson(join(ctx.topicDir, 'pack.json'));
      const ids = regenerate.map(card => manifest.rows.find(row => row.name === card.id)?.promptId ?? card.id);
      const rerun = await (await import('./06-pack.mjs')).regenerateCards(ctx, ids);
      artefacts.push(...rerun.artefacts);
      if (rerun.status === 'ok') {
        batch = await auditPack(ctx, join(ctx.topicDir, 'pack'), 'round-2');
        artefacts.push(...batch.artefacts);
      }
    }
  }
  const cards = batch.cards;
  const path = join(ctx.topicDir, 'audit.json');
  await writeJson(path, { topic: ctx.topic, cards });
  const holds = cards.filter(row => row.verdict === 'hold');
  const regenerate = cards.filter(row => row.verdict === 'regenerate');
  const ship = cards.filter(row => row.verdict === 'ship');
  const stop = operational && (holds.length || ship.length < 11);
  return { status: stop ? 'stop' : 'ok', ...(stop ? { stop: 'STOP-3' } : {}), artefacts: [...artefacts, path],
    notes: `${ship.length} ship, ${regenerate.length} regenerate, ${holds.length} hold` };
}
