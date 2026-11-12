import { join } from 'node:path';
import { readJson, writeJson, saveState } from '../state.mjs';
import { evaluateCoverage } from '../coverage.mjs';
import { createPlanner } from '../planner.mjs';

export async function run(ctx) {
  const prompts = await readJson(join(ctx.topicDir, 'prompts.json'));
  const answers = ctx.judge ? null : await readJson(join(ctx.fixtureDir, 'coverage-judge.json'));
  const recorded = ctx.config.planner?.fixtureFile ? await readJson(ctx.config.planner.fixtureFile) : null;
  const planner = ctx.planner ?? createPlanner(ctx.config, { fixturePlans: recorded, state: ctx.state, onUsage: () => saveState(ctx.topicDir, ctx.state) });
  const judge = ctx.judge ?? (async row => {
    if (typeof answers[String(row.id)] !== 'boolean') throw new Error(`Missing fixture judge answer for prompt ${row.id}`);
    return answers[String(row.id)];
  });
  const rows = await evaluateCoverage(prompts.prompts, { planner, judge, fixture: ctx.fixture, topic: ctx.topic });
  const path = join(ctx.topicDir, 'coverage.json');
  await writeJson(path, { topic: ctx.topic, prompts: rows });
  return { status: 'ok', artefacts: [path], notes: `${rows.filter(row => row.decision === 'REUSE').length} REUSE, ${rows.filter(row => row.decision === 'NEW').length} NEW` };
}
