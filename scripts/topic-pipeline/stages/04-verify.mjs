import { join } from 'node:path';
import { readJson, writeJson } from '../state.mjs';
import { verifySchema } from '../schemas.mjs';
import { callAgent } from '../agents/call.mjs';
import { referenceInputs, imageInputs, validateIds } from '../agents/fixture-inputs.mjs';
import { createContactSheet } from '../checks/contact-sheet.mjs';

export async function run(ctx) {
  const roots = ctx.fixture ? [join(ctx.fixtureDir, 'references.human'), join(ctx.fixtureDir, 'references.defective')]
    : [(await readJson(join(ctx.topicDir, 'author.json'))).previewDir];
  const figures = [], images = [], numbers = [], artefacts = [];
  for (const [index, root] of roots.entries()) {
    const records = await referenceInputs(root);
    const sheet = await createContactSheet({ previewDir: root, outDir: join(ctx.topicDir, 'verify-input', String(index)) });
    figures.push(...records.map(({ id, spec }) => ({ id, spec })));
    numbers.push(...(await readJson(sheet.numbersPath)).numbers);
    images.push(...await imageInputs(sheet.contactSheetPath));
    artefacts.push(sheet.contactSheetPath, sheet.numbersPath);
  }
  const promptPath = ctx.fixture ? join(ctx.fixtureDir, 'prompts.human.json') : join(ctx.topicDir, 'prompts.json');
  const prompts = await readJson(promptPath);
  const ids = figures.map(row => row.id);
  if (new Set(ids).size !== ids.length) throw new Error('Reference fixture ids collide');
  const result = await callAgent(ctx, 'verifier', { topic: ctx.topic, figures, numbers, prompts }, {
    schema: verifySchema, images, validate: value => validateIds(value, 'figures', ids, ctx.topic),
  });
  validateIds(result, 'figures', ids, ctx.topic);
  const path = join(ctx.topicDir, 'verify.json');
  await writeJson(path, result);
  const fixes = result.figures.filter(row => row.verdict === 'fix');
  return { status: ctx.fixture || !fixes.length ? 'ok' : 'stop', ...(ctx.fixture || !fixes.length ? {} : { stop: 'STOP-2' }),
    artefacts: [...artefacts, path], notes: `${result.figures.length - fixes.length} ship, ${fixes.length} fix` };
}
