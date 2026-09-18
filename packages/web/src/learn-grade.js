import { wsHeaders } from './api.js';

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

export function challengePrompt(block, answer) {
  return [
    'You are grading a learner\'s first-guess answer to a lesson challenge. Be encouraging and specific.',
    `Challenge: ${block.prompt}`,
    `Key ideas a good answer touches: ${(block.expects || []).join('; ') || 'the main mechanism being asked about'}`,
    `Learner's answer: "${answer}"`,
    'Start your reply with a line reading exactly "VERDICT: good" when the answer covers the key ideas, or "VERDICT: partial" otherwise.',
    'Then reply in at most three short sentences: say which key ideas they already have, name what is missing or wrong, and end with one nudge about what to watch for next. Address the learner as "you". Do not give the full explanation away.',
  ].join('\n');
}
