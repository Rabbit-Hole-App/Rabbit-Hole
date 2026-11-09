// Minimize an Explanation card to a compact tile (owner spec 2026-11-08; ledger row "minimize card" in docs/features/explain/benchmarks/test-ledger.md).
// Pure helpers shared by the tile (LearningBlocks.jsx ExplanationTile), the canvas wiring (AdaptiveCanvas.jsx) and the control plane's summary route
// (explanation-summary.js imports capSummary, so the cap is one rule on both sides). `minimized` and `summary` are plain fields of the saved card.
import { parseIllustrationFence } from './explanation-lead.js';
import { parseTutorDiagram } from './tutor-diagrams/spec.js';
import { capSummary } from './explanation-summary-text.js';

export { SUMMARY_CHARS, capSummary } from './explanation-summary-text.js';

// What the tile says: the model's summary when the card has one, else the first sentences of the body, cut the same way.
export const tileSummary = block => capSummary(typeof block?.summary === 'string' && block.summary.trim() ? block.summary : block?.body);

// Only a written Explanation with prose has a summary to write: not a Rabbit Hole's topic anchor, a PDF excerpt or an empty card.
export const summarizable = block => block?.type === 'explanation' && !block.anchor && !block.excerpt && capSummary(block.body).length >= 20;
// The one thing the summary call reads: the title and the body's prose (no diagram JSON, no questions, no More sections).
export const summaryInput = block => (summarizable(block) ? { title: String(block.title ?? '').slice(0, 300), body: capSummaryBody(block.body) } : null);
const capSummaryBody = body => String(body ?? '').replace(/```[\s\S]*?```/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, 6000);

// Whether the Explanation can be minimized, and whether it is now.
export const minimizable = block => block?.type === 'explanation' && !block.anchor && !block.excerpt;
export const isMinimized = block => minimizable(block) && block.minimized === true;

const FENCE = /^[ \t]*```[ \t]*(rh-illustration|rh-diagram)[^\n]*\n([\s\S]*?)^[ \t]*```[ \t]*$/gim;
// The tile's one visual, computed from the card each time (nothing is stored): the first picture (the card's illustration, else the first ready
// rh-illustration figure, in reading order: body, then More), else the first valid diagram, else null.
// -> { kind: 'picture', illustration } | { kind: 'diagram', spec } | null
export function minimizedVisual(block) {
  const own = block?.illustration;
  if (own && (own.src || own.cacheKey || own.fileRef?.source?.id)) return { kind: 'picture', illustration: { ...own, caption: '' } };
  let diagram = null;
  for (const text of [block?.body, ...(block?.more || []).map(section => section?.text)]) {
    for (const [, lang, source] of String(text ?? '').matchAll(FENCE)) {
      if (lang.toLowerCase() === 'rh-illustration') {
        const fence = parseIllustrationFence(source), entry = fence && Object.hasOwn(block.figures || {}, fence.id) ? block.figures[fence.id] : null;
        if (entry?.status === 'ready') return { kind: 'picture', illustration: { alt: fence.alt, ...entry, caption: '' } };
      } else if (!diagram) {
        try { parseTutorDiagram(source); diagram = source; } catch { /* an invalid spec is not drawn */ }
      }
    }
  }
  return diagram ? { kind: 'diagram', spec: diagram } : null;
}

// The summary request: fire and forget. -> the summary text or null; it never throws and never raises a notice (the tile keeps its fallback text).
export async function requestSummary(post, { app, block }) {
  const input = summaryInput(block);
  if (!input || !app) return null;
  try {
    const answer = await post('/api/learn/explanation-summary', { method: 'POST', body: JSON.stringify({ app, ...input }) });
    return typeof answer?.summary === 'string' && answer.summary.trim() ? capSummary(answer.summary) : null;
  } catch { return null; }
}

// The tile's width: the card's own width held between the narrowest and the widest the tile is drawn at (320 and 408 px).
export const tileWidth = block => Math.min(408, Math.max(320, block?.cardLayout?.scrollableSize?.w || block?.w || 408));

// The summary lands on the card as it is now (a functional update on the latest blocks): only that field, only on an Explanation still on the canvas that has no
// summary of its own, so a deleted card is skipped and nothing the learner changed meanwhile is overwritten.
export const landSummary = (blocks, id, summary) => blocks.map(block => (block.id === id && block.type === 'explanation' && !block.summary ? { ...block, summary } : block));
