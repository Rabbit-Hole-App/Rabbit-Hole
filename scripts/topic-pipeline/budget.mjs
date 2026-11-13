export const ceilings = Object.freeze({
  'prompt-writer': { input: 30000, output: 20000 }, // output includes thinking at effort high (reviewer 2026-11-12)
  'coverage-judge': { input: 2000, output: 200 },
  author: { input: 120000, output: 128000 }, // gpt-6.1-sol maximum (reviewer 2026-11-12); 40000 truncated every effort-max call
  verifier: { input: 60000, output: 20000 },
  auditor: { input: 60000, output: 20000 },
});

// Output ceiling of each call in the batched author (reviewer 2026-11-12); well under the cap the provider has been observed to enforce.
export const BATCH_OUTPUT_CEILING = 40000;

export function agentSettings(config, agent) {
  const flags = config.overrides ?? {};
  if (agent === 'author') return { provider: 'openai', model: flags['author-model'] ?? config.openai?.authorModel ?? 'gpt-6.1-sol',
    effort: flags['author-effort'] ?? config.openai?.reasoningEffort ?? 'max' };
  return { provider: 'anthropic', model: agent === 'coverage-judge'
    ? flags['judge-model'] ?? config.anthropic?.judgeModel ?? 'claude-sonnet-5-5'
    : flags['reviewer-model'] ?? config.anthropic?.reviewerModel ?? 'claude-fable-5-1',
  effort: flags['reviewer-effort'] ?? config.anthropic?.effort ?? 'high' };
}

export function callPrice(config, model, input, output) {
  const price = config.prices?.[model];
  if (!price || !Number.isFinite(price.inputPerMillionUsd) || !Number.isFinite(price.outputPerMillionUsd)
      || price.inputPerMillionUsd < 0 || price.outputPerMillionUsd < 0) throw new Error('Configure nonnegative input and output prices for every selected model');
  return (input * price.inputPerMillionUsd + output * price.outputPerMillionUsd) / 1e6;
}

export function estimateTopic(config) {
  const batchSize = config.limits.authorBatchSize, batched = Number.isInteger(batchSize) && batchSize > 0;
  // Batched author: one foundation call plus ceil(12 / batchSize) batch calls per round.
  const counts = { 'prompt-writer': 1, 'coverage-judge': 12, author: config.limits.authorRounds * (batched ? 1 + Math.ceil(12 / batchSize) : 1),
    verifier: 3 * config.limits.verifyRounds + (config.run?.fixture ? 7 : 0),
    auditor: 12 * (config.limits.regenerateOnce ? 2 : 1) + (config.run?.fixture ? 13 : 0) };
  let estimate = 0;
  for (const [agent, count] of Object.entries(counts)) {
    if (!Number.isInteger(count) || count < 1) throw new Error('Configure positive round limits');
    const { input, output } = agent === 'author' && batched ? { ...ceilings.author, output: BATCH_OUTPUT_CEILING } : ceilings[agent];
    estimate += count * callPrice(config, agentSettings(config, agent).model, input, output);
  }
  estimate += 216 * config.limits.authorRounds * callPrice(config, 'jev-latest', 4000, 0);
  if (config.bench) {
    const { capUsd, judgeCapUsd } = config.bench;
    if (![capUsd, judgeCapUsd].every(value => Number.isFinite(value) && value >= 0)) throw new Error('Configure nonnegative bench generation and judge caps');
    estimate += 3 * (capUsd + judgeCapUsd);
  }
  if (!Number.isFinite(config.limits.perLessonUsd) || config.limits.perLessonUsd <= 0) throw new Error('Configure a positive perLessonUsd limit');
  if (estimate > config.limits.perLessonUsd) throw new Error('Preflight estimate exceeds limits.perLessonUsd');
  return estimate;
}

export function recordSpend(state, entry) {
  state.calls.push(entry);
  state.spendUsd = state.calls.reduce((sum, call) => sum + call.usd, 0);
  if (!Number.isFinite(state.estimateUsd) || state.spendUsd > state.estimateUsd * 1.2) throw new Error('Actual spend exceeds 1.2 times the preflight estimate');
}
