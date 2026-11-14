import { readFile } from 'node:fs/promises';
import { saveState } from '../state.mjs';

export async function callAgent(ctx, agent, inputs, options = {}) {
  const system = options.system ?? await readFile(new URL(`./prompts/${agent}.md`, import.meta.url), 'utf8');
  if (ctx.call) return ctx.call(agent, inputs, { ...options, system });
  const { createClient } = await import('./client.mjs');
  ctx.client ??= createClient({ config: ctx.config, state: ctx.state, topicDir: ctx.topicDir, fetchImpl: ctx.fetchImpl });
  const before = ctx.state.calls.length;
  try { return await ctx.client.call(agent, inputs, { ...options, system }); }
  finally {
    const stages = { 'prompt-writer': '01', 'coverage-judge': '02', author: '03', verifier: '04', auditor: '07' };
    for (const call of ctx.state.calls.slice(before)) {
      call.stage = options.stage ?? stages[agent];
      call.mode = options.mode ?? 'agent';
    }
    await saveState(ctx.topicDir, ctx.state);
  }
}
