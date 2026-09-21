// Present mode steps through the canvas a section at a time. A step is a heading
// and everything under it until the next heading, so a deck imported one slide
// per section presents as a deck and a lesson presents as its sections.
//
// Depth does not nest: a sub-heading opens its own step rather than living
// inside its parent's. Presenting is a walk, not a tree, and a sub-section you
// have to stop at is more useful than one you sail past.

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
