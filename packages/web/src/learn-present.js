// Present mode steps through the canvas a section at a time. A step is a heading
// and everything under it until the next heading, so a deck imported one slide
// per section presents as a deck and a lesson presents as its sections.
//
// Depth does not nest: a sub-heading opens its own step rather than living
// inside its parent's. Presenting is a walk, not a tree, and a sub-section you
// have to stop at is more useful than one you sail past.

// The section being viewed (R4 owner decision 7A), which the Table of contents marks. Of the sections a heading opens
// (the heading and its cards, up to the next heading at any level, as presentSteps groups them) that show inside `view`
// (world coordinates { x, y, w, h }), the one nearest the middle of the view: the one spanning the view's centre line,
// else the one closest to it; a tie goes to the earlier section, and nothing in view is null. Framing a section from the
// contents centres it, so the section a title opens is the one marked. Deterministic and read-only: it never changes
// completion and never moves the camera.
export function activeSection(blocks = [], bounds = {}, view = null) {
  if (!view) return null;
  const spans = new Map();
  let head = null;
  for (const block of blocks || []) {
    if (block.type === 'heading') head = block.id;
    const box = bounds?.[block.id];
    if (!head || !box) continue;
    const span = spans.get(head) || { top: Infinity, bottom: -Infinity, shown: false };
    span.top = Math.min(span.top, box.y);
    span.bottom = Math.max(span.bottom, box.y + box.h);
    span.shown ||= box.x < view.x + view.w && box.x + box.w > view.x && box.y < view.y + view.h && box.y + box.h > view.y;
    spans.set(head, span);
  }
  const middle = view.y + view.h / 2;
  let best = null, nearest = Infinity;
  for (const [id, span] of spans) {
    if (!span.shown) continue;
    const away = middle < span.top ? span.top - middle : middle > span.bottom ? middle - span.bottom : 0;
    if (away < nearest) { best = id; nearest = away; }
  }
  return best;
}

export function presentSteps(blocks = [], bounds = {}) {
  const list = blocks || [];
  const boxes = bounds || {};
  // With no headings at all there is no grouping to infer, so each card stands
  // alone. Once one heading exists, headings are what a step means.
  const titled = list.some(block => block.type === 'heading');
  const groups = [];
  for (const block of list) {
    // A heading always opens a step; anything else joins the one in progress,
    // or opens one itself when it appears before any heading exists.
    if (!titled || block.type === 'heading' || !groups.length) groups.push({ head: block.type === 'heading' ? block : null, blocks: [] });
    groups[groups.length - 1].blocks.push(block);
  }
  return groups.flatMap((group, index) => {
    // Only measured cards can be framed, and a step with nothing to frame is
    // not a step - stopping on a blank screen reads as a broken presentation.
    const measured = group.blocks.filter(block => boxes[block.id]);
    if (!measured.length) return [];
    const title = (group.head?.text || '').trim();
    return [{
      label: title || `Section ${index + 1}`,
      ids: measured.map(block => block.id),
      boxes: measured.map(block => boxes[block.id]),
    }];
  });
}
