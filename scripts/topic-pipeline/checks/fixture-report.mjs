import { join } from 'node:path';
import { fileExists } from '../agents/fixture-inputs.mjs';
import { callAgent } from '../agents/call.mjs';
import { loadState, readJson, writeJson, saveState } from '../state.mjs';
import { scoreSavedFixture } from './fixture-score.mjs';

export async function fixtureReport(ctx, { mapPrompts = false } = {}) {
  ctx.state = await loadState(ctx.topicDir, ctx.topic);
  const mappingPath = join(ctx.topicDir, 'prompt-mapping.json');
  const expectedPath = join(ctx.fixtureDir, 'prompts.human.json');
  if (mapPrompts && !await fileExists(mappingPath) && await fileExists(expectedPath)) {
    const actual = await readJson(join(ctx.topicDir, 'prompts.json')), expected = await readJson(expectedPath);
    const schema = { type: 'object', additionalProperties: false, required: ['matches'], properties: {
      matches: { type: 'array', items: { type: 'object', additionalProperties: false,
        required: ['promptId', 'humanPromptId', 'sameTeachingPoint'], properties: { promptId: { type: 'string' },
          humanPromptId: { type: 'string' }, sameTeachingPoint: { type: 'boolean' } } } } } };
    const mapping = await callAgent(ctx, 'verifier', { task: 'prompt-mapping', generated: actual, human: expected },
      { schema, stage: '01', mode: 'prompt-mapping' });
    await writeJson(mappingPath, mapping);
  }
  const report = await scoreSavedFixture({ topic: ctx.topic, topicDir: ctx.topicDir, fixtureDir: ctx.fixtureDir,
    authorRounds: ctx.config.limits.authorRounds, verifyRounds: ctx.config.limits.verifyRounds });
  const path = join(ctx.topicDir, 'fixture-score.json');
  await writeJson(path, report);
  ctx.state.fixtureScore = { status: report.status, passed: report.passed, artefact: path };
  await saveState(ctx.topicDir, ctx.state);
  return report;
}
