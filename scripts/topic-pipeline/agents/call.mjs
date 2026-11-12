import { readFile } from 'node:fs/promises';
import { saveState } from '../state.mjs';

export async function callAgent(ctx, agent, inputs, options = {}) {
  const system = options.system ?? await readFile(new URL(`./prompts/${agent}.md`, import.meta.url), 'utf8');
  if (ctx.call) return ctx.call(agent, inputs, { ...options, system });
  const { createClient } = await import('./client.mjs');
  ctx.client ??= createClient({ config: ctx.config, state: ctx.state, topicDir: ctx.topicDir, fetchImpl: ctx.fetchImpl });
  try { return await ctx.client.call(agent, inputs, { ...options, system }); }
  finally { await saveState(ctx.topicDir, ctx.state); }
}
