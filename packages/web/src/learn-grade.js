import { wsHeaders } from './api.js';
import { createShadowGrader } from './learn-grade-shadow.js';

export { challengePrompt, explainBackPrompt } from './learn-grade-prompts.js';
export { parseVerdict } from './learn-grade-shadow.js';

// Jev side by side (docs/features/jev-grading.md): fire-and-forget. Neither
// call throws, and the learner path never waits on them.
export const { shadowGrade, recordBaseline } = createShadowGrader({ headers: wsHeaders });

// One-shot tutor call used by canvas blocks that grade a free-text answer.
// It streams the same SSE the Learn chat uses, but keeps its own thread so a
// verdict never pollutes the learner's conversation.
export async function gradeAnswer({ app, repositoryContext = null, prompt, onDelta }) {
  const response = await fetch('/api/learn/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...wsHeaders() },
    body: JSON.stringify({ scope: { app }, ...(repositoryContext ? { repository_context: repositoryContext } : {}), message: prompt }),
  });
  if ((response.headers.get('Content-Type') || '').includes('json')) {
    const data = await response.json();
    throw new Error(data.error || `HTTP ${response.status}`);
  }
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
      if (type === 'chunk') onDelta(payload.text);
      else if (type === 'error') throw new Error(payload.error);
    }
  }
}
