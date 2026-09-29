// Tool Performance v1 timing (docs/features/learn-tool-performance.md).
// Every canvas card records four User Timing marks, named rh:<blockId>:<phase>:
//   insert       the insertion was requested
//   visible      the card's shell is painted
//   content      its first meaningful content is drawn (the graph, the page, the diagram)
//   interactive  the learner can use it (type, drag, run)
// A card that draws everything on its first paint reports all three at once;
// a heavy card reports content/interactive when its library has actually
// finished. Marks are cheap and local: nothing is sent anywhere.
import { createContext, useContext, useEffect } from 'react';

const seen = new Set();
export function perfMark(id, phase) {
  const name = `rh:${id}:${phase}`;
  if (!id || seen.has(name)) return;
  seen.add(name);
  try { performance.mark(name); } catch { /* timing is best effort */ }
}

// After the next paint, not at render time: "visible" means on screen.
export const afterPaint = callback => requestAnimationFrame(() => requestAnimationFrame(callback));

// Cards whose body reports content/interactive itself; every other card is
// complete on its first paint.
export const SELF_REPORTING = new Set(['graph', 'flow', 'mermaid', 'paper', 'whiteboard', 'model3d', 'video', 'notebook']);

export const PerfContext = createContext(null);
// The reporter for the card being rendered: report('content'), report('interactive').
export const usePerf = () => useContext(PerfContext) || (() => {});

// Marks visible (and, for simple cards, content and interactive) once painted.
export function usePaintedMarks(id, type) {
  useEffect(() => {
    afterPaint(() => {
      perfMark(id, 'visible');
      if (!SELF_REPORTING.has(type)) { perfMark(id, 'content'); perfMark(id, 'interactive'); }
    });
  }, [id]);
}
