export const ceilings = Object.freeze({
  'prompt-writer': { input: 30000, output: 8000 },
  'coverage-judge': { input: 2000, output: 200 },
  author: { input: 120000, output: 40000 },
  verifier: { input: 60000, output: 8000 },
  auditor: { input: 60000, output: 8000 },
});

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
  const counts = { 'prompt-writer': 1, 'coverage-judge': 12, author: config.limits.authorRounds,
    verifier: config.limits.verifyRounds, auditor: 12 * (config.limits.regenerateOnce ? 2 : 1) };
  let estimate = 0;
  for (const [agent, count] of Object.entries(counts)) {
    if (!Number.isInteger(count) || count < 1) throw new Error('Configure positive round limits');
    const { input, output } = ceilings[agent];
    estimate += count * callPrice(config, agentSettings(config, agent).model, input, output);
  }
  estimate += 216 * config.limits.authorRounds * callPrice(config, 'jev-latest', 4000, 0);
  if (!Number.isFinite(config.limits.perLessonUsd) || config.limits.perLessonUsd <= 0) throw new Error('Configure a positive perLessonUsd limit');
  if (estimate > config.limits.perLessonUsd) throw new Error('Preflight estimate exceeds limits.perLessonUsd');
  return estimate;
}

export function recordSpend(state, entry) {
  state.calls.push(entry);
  state.spendUsd = state.calls.reduce((sum, call) => sum + call.usd, 0);
  if (!Number.isFinite(state.estimateUsd) || state.spendUsd > state.estimateUsd * 1.2) throw new Error('Actual spend exceeds 1.2 times the preflight estimate');
}
