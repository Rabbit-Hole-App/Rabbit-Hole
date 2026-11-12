import { join } from 'node:path';
import { readJson, writeJson, saveState } from '../state.mjs';
import { evaluateCoverage } from '../coverage.mjs';
import { createPlanner } from '../planner.mjs';
import { callAgent } from '../agents/call.mjs';
import { judgeSchema } from '../schemas.mjs';
import { fileExists } from '../agents/fixture-inputs.mjs';

export async function run(ctx) {
  const prompts = await readJson(join(ctx.topicDir, 'prompts.json'));
  const answerPath = join(ctx.fixtureDir, 'coverage-judge.json');
  const fixtureAnswers = !ctx.judge && ctx.fixture && await fileExists(answerPath) ? await readJson(answerPath) : null;
  const answers = fixtureAnswers?.answers ?? fixtureAnswers;
  const recorded = ctx.config.planner?.fixtureFile ? await readJson(ctx.config.planner.fixtureFile) : null;
  const planner = ctx.planner ?? createPlanner(ctx.config, { fixturePlans: recorded, state: ctx.state, onUsage: () => saveState(ctx.topicDir, ctx.state) });
  const judge = ctx.judge ?? (async (row, reference) => {
    if (answers) {
      const answer = answers[String(row.id)] ?? answers[String(row.id).padStart(2, '0')];
      if (typeof answer !== 'boolean') throw new Error(`Missing fixture judge answer for prompt ${row.id}`);
      return answer;
    }
    const result = await callAgent(ctx, 'coverage-judge', { content: row.content,
      reference: { title: reference.spec.diagram.title ?? '', caption: reference.spec.diagram.caption ?? '', useWhen: reference.useWhen } }, { schema: judgeSchema });
    return result.sameTeachingPoint;
  });
  const rows = await evaluateCoverage(prompts.prompts, { planner, judge, fixture: ctx.fixture, topic: ctx.topic });
  const path = join(ctx.topicDir, 'coverage.json');
  await writeJson(path, { topic: ctx.topic, prompts: rows });
  return { status: 'ok', artefacts: [path], notes: `${rows.filter(row => row.decision === 'REUSE').length} REUSE, ${rows.filter(row => row.decision === 'NEW').length} NEW` };
}
