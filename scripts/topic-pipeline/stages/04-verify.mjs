import { join } from 'node:path';
import { readJson, writeJson } from '../state.mjs';
import { verifySchema } from '../schemas.mjs';
import { callAgent } from '../agents/call.mjs';
import { referenceInputs, imageInputs, validateIds } from '../agents/fixture-inputs.mjs';
import { createContactSheet } from '../checks/contact-sheet.mjs';
import { fileExists } from '../agents/fixture-inputs.mjs';

async function verifyBatch(ctx, roots, prompts, tag) {
  const records = [], artefacts = [], verdicts = [];
  for (const [index, root] of roots.entries()) {
    records.push(...(await referenceInputs(root)).map(row => ({ ...row, root, index })));
  }
  const ids = records.map(row => row.id);
  if (new Set(ids).size !== ids.length) throw new Error('Reference fixture ids collide');
  // Authored figures: a reference and its depth variants stay in one batch of at most 12. When a batch boundary split a group, the verifier returned the missing siblings' ids too and failed the id check.
  // The human calibration fixture keeps its fixed slices of 12 (the calibration was run on them).
  const baseOf = id => id.replace(/-(?:brief|balanced|detailed)(?:-detail)?(?=@|$)|-detail(?=@|$)/u, '');
  const slices = [];
  if (tag === 'human') for (let start = 0; start < records.length; start += 12) slices.push([start, records.slice(start, start + 12)]);
  else {
    let start = 0, current = [], currentStart = 0;
    const groups = [...Map.groupBy(records, row => baseOf(row.id)).values()];
    for (const group of groups) {
      if (current.length && current.length + group.length > 12) { slices.push([currentStart, current]); current = []; currentStart = start; }
      current.push(...group); start += group.length;
    }
    if (current.length) slices.push([currentStart, current]);
  }
  for (const [offset, batch] of slices) {
    const images = [], numbers = [];
    for (const [index, root] of roots.entries()) {
      const selected = batch.filter(row => row.index === index);
      if (!selected.length) continue;
      const sheet = await createContactSheet({ previewDir: root, references: selected.map(row => row.id),
        outDir: join(ctx.topicDir, 'verify-input', tag, `${offset}-${index}`) });
      numbers.push(...(await readJson(sheet.numbersPath)).numbers);
      images.push(...await imageInputs(sheet.contactSheetPath));
      artefacts.push(sheet.contactSheetPath, sheet.numbersPath);
    }
    const expected = batch.map(row => row.id);
    const result = await callAgent(ctx, 'verifier', { topic: ctx.topic, figures: batch.map(({ id, spec }) => ({ id, spec })), numbers, prompts }, {
      schema: verifySchema, images, mode: tag === 'human' ? 'human' : 'agent', validate: value => validateIds(value, 'figures', expected, ctx.topic),
    });
    validateIds(result, 'figures', expected, ctx.topic);
    verdicts.push(...result.figures);
  }
  const result = { topic: ctx.topic, figures: verdicts };
  const path = join(ctx.topicDir, `verify.${tag}.json`);
  await writeJson(path, result);
  return { result, artefacts: [...artefacts, path] };
}

export async function run(ctx) {
  const artefacts = [];
  let last;
  if (ctx.fixture) {
    const batch = await verifyBatch(ctx, [join(ctx.fixtureDir, 'references.human'), join(ctx.fixtureDir, 'references.defective')],
      await readJson(join(ctx.fixtureDir, 'prompts.human.json')), 'human');
    last = batch.result; artefacts.push(...batch.artefacts);
  }
  const authorPath = join(ctx.topicDir, 'author.json');
  const verifyAuthored = !ctx.fixture || (ctx.dryRun && await fileExists(authorPath));
  if (verifyAuthored) {
    const rounds = ctx.config.limits.verifyRounds;
    for (let round = 1; round <= rounds; round++) {
      const author = await readJson(authorPath);
      const batch = await verifyBatch(ctx, [author.previewDir], await readJson(join(ctx.topicDir, 'prompts.json')), `round-${round}`);
      last = batch.result; artefacts.push(...batch.artefacts);
      const fixes = last.figures.filter(row => row.verdict === 'fix');
      if (!fixes.length || round === rounds) break;
      ctx.authorFeedback = JSON.stringify(last, null, 2);
      const repair = await (await import('./03-author.mjs')).run(ctx);
      artefacts.push(...repair.artefacts);
      if (repair.status !== 'ok') break;
      ctx.state.stages['03'] = { ...ctx.state.stages['03'], ...repair };
    }
  }
  const path = join(ctx.topicDir, 'verify.json');
  await writeJson(path, last);
  const fixes = last.figures.filter(row => row.verdict === 'fix');
  const stop = verifyAuthored && fixes.length > 0;
  return { status: stop ? 'stop' : 'ok', ...(stop ? { stop: 'STOP-2' } : {}), artefacts: [...artefacts, path],
    notes: `${last.figures.length - fixes.length} ship, ${fixes.length} fix` };
}
