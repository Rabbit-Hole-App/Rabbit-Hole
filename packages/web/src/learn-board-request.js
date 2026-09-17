import { wsHeaders } from './api.js';

// Stream real workflow stages; do not estimate completion percentages.
export async function requestBoardExplanation(body, onProgress) {
  let renderedPlan;
  // Initial draft plus at most two rendered-preview review requests.
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await requestBoardStep(body, onProgress);
    if (result.plan) {
      if (renderedPlan) result.plan = { ...result.plan, blocks: result.plan.blocks.map((block, i) => block.kind === 'paper_figure' && JSON.stringify(block.crop) === JSON.stringify(renderedPlan.blocks[i]?.crop) && JSON.stringify(block.citation) === JSON.stringify(renderedPlan.blocks[i]?.citation) ? { ...block, figure: renderedPlan.blocks[i].figure } : block) };
      return result;
    }
    if (!result.previewPlan || !result.continuation || attempt === 2) throw new Error('Invalid figure review continuation');
    onProgress('Rendering figure preview for review...');
    const { preparePaperFigures } = await import('./learn-paper-figures.js');
    renderedPlan = await preparePaperFigures(result.previewPlan, body.app);
    const previews = renderedPlan.blocks.flatMap((block, blockIndex) => block.kind === 'paper_figure' ? [{ blockIndex, src: block.figure.src }] : []);
    body = { app: body.app, continuation: result.continuation, previews };
  }
}

async function requestBoardStep(body, onProgress) {
  const response = await fetch('/api/learn/board', { method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', ...wsHeaders() },
    signal: AbortSignal.timeout(120000), body: JSON.stringify(body),
  });
  if (!(response.headers.get('content-type') || '').includes('text/event-stream')) {
    const data = await response.json();
    if (!response.ok || data.error) throw new Error(data.error || 'Explanation unavailable');
    return data;
  }
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let pending = '', result;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      const events = pending.split('\n\n'); pending = events.pop();
      for (const event of events) {
        const type = event.match(/^event: (.+)$/m)?.[1], raw = event.match(/^data: (.+)$/m)?.[1];
        if (!raw) continue;
        const data = JSON.parse(raw);
        if (type === 'progress') onProgress(data.stage);
        if (type === 'error') throw new Error(data.error);
        if (type === 'plan' || type === 'preview') result = data;
      }
    }
  } finally { await reader.cancel(); }
  if (!result) throw new Error('The explanation was interrupted. Try again.');
  return result;
}
