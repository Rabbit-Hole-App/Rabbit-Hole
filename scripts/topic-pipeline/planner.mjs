import { planExplanation } from '../../packages/control-plane/src/explanation-planner.js';
import { readJson } from './state.mjs';
import { callPrice, estimateTopic, recordSpend } from './budget.mjs';

export function createPlanner(config, { fixturePlans, fetchImpl = globalThis.fetch, state, onUsage } = {}) {
  const recordings = fixturePlans ? Promise.resolve(fixturePlans) : config.planner?.fixtureFile ? readJson(config.planner.fixtureFile) : null;
  const budget = state ?? { calls: [], spendUsd: 0 };
  return async (prompt, depth) => {
    if (recordings) {
      const row = (await recordings)[prompt];
      const plan = row?.[depth] ?? row;
      if (!plan?.planner) throw new Error('Planner fixture has no recorded plan for this prompt and depth');
      return plan;
    }
    if (!config.planner?.apiKey || !config.planner?.endpoint) throw new Error('Configure the planner key and endpoint in config.local.json');
    budget.estimateUsd ??= estimateTopic(config);
    if (budget.calls.some(entry => entry.usageKnown === false)) throw new Error('Reconcile unknown usage before another paid call');
    if (budget.spendUsd > budget.estimateUsd * 1.2) throw new Error('Actual spend exceeds the admitted estimate');
    const started = Date.now();
    const plan = await planExplanation({ TYPESAFE_API_KEY: config.planner.apiKey }, { question: prompt, depth }, {
      fetchImpl: async (_url, options) => {
        try { return await fetchImpl(config.planner.endpoint, options); }
        catch { throw new Error('Planner request failed'); }
      },
    });
    if (!plan || !Number.isFinite(plan.inputTokens)) {
      recordSpend(budget, { agent: 'planner', model: 'jev-latest', inputTokens: 0, outputTokens: 0, usd: 0, usageKnown: false, ms: Date.now() - started });
      await onUsage?.();
      throw new Error('The planner returned no accountable plan. Reconcile unknown usage before retrying.');
    }
    const entry = { agent: 'planner', model: 'jev-latest', inputTokens: plan.inputTokens, outputTokens: 0,
      usd: callPrice(config, 'jev-latest', plan.inputTokens, 0), usageKnown: true, ms: Date.now() - started };
    recordSpend(budget, entry);
    await onUsage?.(entry);
    return plan;
  };
}
