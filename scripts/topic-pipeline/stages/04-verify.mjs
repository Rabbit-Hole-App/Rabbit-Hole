import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { readJson, writeJson } from '../state.mjs';
import { verifySchema } from '../schemas.mjs';
import { callAgent } from '../agents/call.mjs';
import { referenceInputs, imageInputs, validateIds } from '../agents/fixture-inputs.mjs';
import { createContactSheet } from '../checks/contact-sheet.mjs';
import { fileExists } from '../agents/fixture-inputs.mjs';

// previous (repair rounds, reviewer 2026-11-13): { hashes, verdicts } of the round before. A reference whose spec is byte-identical keeps its verdict and is not sent again; only changed and new references are verified.
export async function verifyBatch(ctx, roots, prompts, tag, previous = null) {
  const records = [], artefacts = [], verdicts = [];
  for (const [index, root] of roots.entries()) {
    records.push(...(await referenceInputs(root)).map(row => ({ ...row, root, index })));
  }
  const ids = records.map(row => row.id);
  if (new Set(ids).size !== ids.length) throw new Error('Reference fixture ids collide');
  const hashes = Object.fromEntries(records.map(row => [row.id, createHash('sha256').update(JSON.stringify(row.spec)).digest('hex')]));
  const kept = new Map(records.filter(row => previous?.verdicts.has(row.id) && previous.hashes[row.id] === hashes[row.id]).map(row => [row.id, previous.verdicts.get(row.id)]));
  const work = records.filter(row => !kept.has(row.id));
  // Authored figures: a reference and its depth variants stay in one batch of at most 12. When a batch boundary split a group, the verifier returned the missing siblings' ids too and failed the id check.
  // The human calibration fixture keeps its fixed slices of 12 (the calibration was run on them).
  const baseOf = id => id.replace(/-(?:brief|balanced|detailed)(?:-detail)?(?=@|$)|-detail(?=@|$)/u, '');
  const slices = [];
  if (tag === 'human') for (let start = 0; start < work.length; start += 12) slices.push([start, work.slice(start, start + 12)]);
  else {
    let start = 0, current = [], currentStart = 0;
    const groups = [...Map.groupBy(work, row => baseOf(row.id)).values()];
    for (const group of groups) {
      if (current.length && current.length + group.length > 12) { slices.push([currentStart, current]); current = []; currentStart = start; }
      current.push(...group); start += group.length;
    }
    if (current.length) slices.push([currentStart, current]);
  }
  // The batches are independent (their own contact sheets and verdicts), so they run in parallel like the author's batches (reviewer 2026-11-13).
  // Verdicts and artefacts keep the batch order; the first failure is thrown once every call has settled.
  const outcomes = await Promise.allSettled(slices.map(async ([offset, batch]) => {
    const images = [], numbers = [], sheets = [];
    for (const [index, root] of roots.entries()) {
      const selected = batch.filter(row => row.index === index);
      if (!selected.length) continue;
      const sheet = await createContactSheet({ previewDir: root, references: selected.map(row => row.id),
        outDir: join(ctx.topicDir, 'verify-input', tag, `${offset}-${index}`) });
      numbers.push(...(await readJson(sheet.numbersPath)).numbers);
      images.push(...await imageInputs(sheet.contactSheetPath));
      sheets.push(sheet.contactSheetPath, sheet.numbersPath);
    }
    const expected = batch.map(row => row.id);
    const result = await callAgent(ctx, 'verifier', { topic: ctx.topic, figures: batch.map(({ id, spec }) => ({ id, spec })), numbers, prompts }, {
      schema: verifySchema, images, mode: tag === 'human' ? 'human' : 'agent', validate: value => validateIds(value, 'figures', expected, ctx.topic),
    });
    validateIds(result, 'figures', expected, ctx.topic);
    return { sheets, figures: result.figures };
  }));
  const failure = outcomes.find(outcome => outcome.status === 'rejected');
  if (failure) throw failure.reason;
  const fresh = new Map();
  for (const { value } of outcomes) { artefacts.push(...value.sheets); for (const figure of value.figures) fresh.set(figure.id, figure); }
  for (const row of records) verdicts.push(kept.get(row.id) ?? fresh.get(row.id));
  const result = { topic: ctx.topic, figures: verdicts };
  const hashFile = join(ctx.topicDir, 'verify-input', `${tag}.hashes.json`);
  await writeJson(hashFile, hashes);
  const path = join(ctx.topicDir, `verify.${tag}.json`);
  await writeJson(path, result);
  return { result, artefacts: [...artefacts, path, hashFile], reused: kept.size };
}

export async function previousRound(ctx, round) {
  const verdictFile = join(ctx.topicDir, `verify.round-${round}.json`), hashFile = join(ctx.topicDir, 'verify-input', `round-${round}.hashes.json`);
  if (round < 1 || !await fileExists(verdictFile) || !await fileExists(hashFile)) return null;
  return { hashes: await readJson(hashFile), verdicts: new Map((await readJson(verdictFile)).figures.map(figure => [figure.id, figure])) };
}

export async function run(ctx) {
  const artefacts = [];
  let last;
  const humanFile = join(ctx.topicDir, 'verify.human.json');
  if (ctx.fixture && await fileExists(humanFile)) { last = await readJson(humanFile); artefacts.push(humanFile); }   // the calibration runs once per topic (reviewer 2026-11-13); delete verify.human.json to run it again
  else if (ctx.fixture) {
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
      const batch = await verifyBatch(ctx, [author.previewDir], await readJson(join(ctx.topicDir, 'prompts.json')), `round-${round}`, await previousRound(ctx, round - 1));
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
