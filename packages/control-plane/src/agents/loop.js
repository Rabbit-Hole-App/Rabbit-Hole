// The shared agent loop: call the model with tools, dispatch tool_use through
// `exec`, and finish on either the submit tool's input (structured agents) or
// the final text (prose agents). Every agent in this directory uses it.
import { anthropic } from '../ask.js';

export async function toolLoop(env, { system, tools, exec, intro, submitName = null, maxTokens = 3000, maxTurns = 10 }) {
  const messages = [{ role: 'user', content: intro }];
  for (let i = 0; i < maxTurns; i++) {
    const resp = await anthropic(env, { max_tokens: maxTokens, system, tools, messages });
    if (!resp.ok) throw new Error(`anthropic ${resp.status}`);
    const msg = await resp.json();
    messages.push({ role: 'assistant', content: msg.content });

    if (submitName) {
      const submit = (msg.content || []).find((b) => b.type === 'tool_use' && b.name === submitName);
      if (submit) return submit.input;
    }
    if (msg.stop_reason !== 'tool_use') {
      if (submitName) {
        // a structured agent that stopped talking gets one nudge toward the tool
        messages.push({ role: 'user', content: `Call ${submitName} with your findings now.` });
        continue;
      }
      const text = (msg.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
      if (!text.trim()) throw new Error('the agent returned nothing');
      return text.trim();
    }
    const results = [];
    for (const b of msg.content) {
      if (b.type === 'tool_use' && b.name !== submitName) {
        results.push({ type: 'tool_result', tool_use_id: b.id, content: String(await exec(b.name, b.input || {})).slice(0, 30000) });
      }
    }
    messages.push({ role: 'user', content: results });
  }
  throw new Error('the agent did not finish in time');
}
