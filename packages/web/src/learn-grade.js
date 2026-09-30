import { wsHeaders } from './api.js';
import { createShadowGrader } from './learn-grade-shadow.js';
import { assessBody } from '../../control-plane/src/agents/learn-grade.js';

export { challengePrompt, explainBackPrompt } from './learn-grade-prompts.js';
export { parseVerdict } from './learn-grade-shadow.js';

// Jev side by side (docs/features/jev-grading.md): fire-and-forget. Neither
// call throws, and the learner path never waits on them.
export const { shadowGrade, recordBaseline } = createShadowGrader({ headers: wsHeaders });

// The visible grade of a challenge block's answer (/api/learn/assess, dev
// worker): the server builds the instruction from the block's fields and
// streams the Learn chat's SSE shape back. No thread, chat or app context.
export async function gradeAnswer({ app, block, answer, onDelta }) {
  const response = await fetch('/api/learn/assess', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...wsHeaders() },
    body: JSON.stringify({ app, ...assessBody(block, answer) }),
  });
  if (!response.ok || (response.headers.get('Content-Type') || '').includes('json')) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  let verdict = false;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop();
    for (const event of events) {
      const type = (event.match(/^event: (.+)$/m) || [])[1];
      const data = (event.match(/^data: (.+)$/m) || [])[1];
      if (!type || !data) continue;
      const payload = JSON.parse(data);
      if (type === 'chunk') { verdict = true; onDelta(payload.text); }
      else if (type === 'error') throw new Error(payload.error);
    }
  }
  if (!verdict) throw new Error('No verdict returned');
}
