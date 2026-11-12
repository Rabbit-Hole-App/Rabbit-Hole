import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readJson, writeJson } from '../state.mjs';
import { auditSchema } from '../schemas.mjs';
import { callAgent } from '../agents/call.mjs';
import { cardComparison, fileExists, validateIds } from '../agents/fixture-inputs.mjs';

export async function run(ctx) {
  const root = ctx.fixture ? join(ctx.fixtureDir, 'pack.human') : join(ctx.topicDir, 'pack');
  if (!await fileExists(root)) throw new Error('The required review pack is missing');
  const cards = [], artefacts = [];
  for (const entry of (await readdir(root, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const directory = join(root, entry.name);
    if (!await fileExists(join(directory, 'card.md'))) continue;
    const text = await readFile(join(directory, 'card.md'), 'utf8');
    const comparison = join(ctx.topicDir, 'audit-input', `${entry.name}.png`);
    const images = await cardComparison(directory, comparison);
    const result = await callAgent(ctx, 'auditor', { topic: ctx.topic, cards: [{ id: entry.name, bodyAndPipeline: text }] }, {
      schema: auditSchema, images, validate: value => validateIds(value, 'cards', [entry.name], ctx.topic),
    });
    validateIds(result, 'cards', [entry.name], ctx.topic);
    cards.push(...result.cards);
    artefacts.push(comparison);
  }
  if (!cards.length) throw new Error('The review pack contains no cards');
  const path = join(ctx.topicDir, 'audit.json');
  await writeJson(path, { topic: ctx.topic, cards });
  const holds = cards.filter(row => row.verdict === 'hold');
  const regenerate = cards.filter(row => row.verdict === 'regenerate');
  const ship = cards.filter(row => row.verdict === 'ship');
  const stop = !ctx.fixture && (holds.length || ship.length < Math.min(11, cards.length));
  return { status: stop ? 'stop' : 'ok', ...(stop ? { stop: 'STOP-3' } : {}), artefacts: [...artefacts, path],
    notes: `${ship.length} ship, ${regenerate.length} regenerate, ${holds.length} hold` };
}
