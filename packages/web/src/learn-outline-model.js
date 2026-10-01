// The lesson's structure, read off the canvas. Headings are the outline: the
// table of contents is not a view onto some other document, it IS this list.
//
// Flat, with a level, rather than a tree. Both the learner and the agent
// restructure this - promoting a sub-section, splicing one in mid-lesson,
// reordering - and every one of those is an easy edit to a flat list and an
// awkward one to a tree.

const UNTITLED = { 1: 'Untitled section', 2: 'Untitled sub-section', 3: 'Untitled sub-sub-section' };

export function outlineFrom(blocks) {
  return (blocks || [])
    .filter(block => block.type === 'heading')
    .map(block => {
      const level = block.level >= 1 && block.level <= 3 ? block.level : 1;
      return { id: block.id, level, label: (block.text || '').trim() || UNTITLED[level], done: !!block.done };
    });
}

export function outlineProgress(outline) {
  const entries = outline || [];
  const total = entries.length;
  const done = entries.filter(entry => entry.done).length;
  // A dot per sub-sub-section would be a smear, so only top-level sections mark
  // the bar. Each sits where its own section ends, and fills only when
  // everything inside that section is done - a section is not finished while
  // part of it is outstanding.
  const milestones = [];
  entries.forEach((entry, index) => {
    if (entry.level !== 1) return;
    let end = index;
    while (end + 1 < total && entries[end + 1].level !== 1) end += 1;
    milestones.push({
      id: entry.id,
      label: entry.label,
      at: (end + 1) / total,
      done: entries.slice(index, end + 1).every(item => item.done),
    });
  });
  return { total, done, fraction: total ? done / total : 0, milestones };
}

// Apply a proposal the learner accepted. Pure: it takes the blocks and returns
// new blocks, so the caller wraps it in one snapshot and Ctrl+Z reverts the
// whole restructure rather than one heading at a time.
//
// Stale ids are skipped, not thrown. A proposal is made against the outline as
// it was when the question was asked; by the time Apply is pressed the learner
// may have deleted one of those sections, and losing the rest of a good
// proposal over it would be worse than quietly doing what still applies.
export function applyOutlineOps(blocks, ops, newId = () => crypto.randomUUID()) {
  let next = [...(blocks || [])];
  const minted = new Map();
  const indexOf = id => next.findIndex(block => block.id === id);
  for (const op of ops || []) {
    if (op.op === 'add') {
      const heading = { id: newId(), type: 'heading', dx: 0, dy: 0, level: op.level, text: op.text, done: false };
      if (op.key) minted.set(op.key, heading.id);
      // No anchor, or an anchor the learner has since removed: keep the section
      // and put it at the end rather than losing it.
      const anchor = op.after == null ? -1 : indexOf(minted.get(op.after) ?? op.after);
      if (anchor < 0) next.push(heading);
      else next.splice(anchor + 1, 0, heading);
      continue;
    }
    const at = indexOf(op.id);
    if (at < 0) continue; // the learner removed it between proposal and Apply
    if (op.op === 'retitle') next[at] = { ...next[at], text: op.text };
    else if (op.op === 'set_level') next[at] = { ...next[at], level: op.level };
  }
  return next;
}

// Drag a section in the table of contents: its heading moves with everything
// under it - cards and deeper headings - up to the next heading at its level or
// above, and lands before the heading `beforeId` (null: the end). Dropping a
// section inside itself changes nothing.
export function moveSection(blocks, id, beforeId) {
  const list = blocks || [];
  const start = list.findIndex(block => block.id === id && block.type === 'heading');
  if (start < 0 || id === beforeId) return list;
  const level = list[start].level || 1;
  let end = start + 1;
  while (end < list.length && !(list[end].type === 'heading' && (list[end].level || 1) <= level)) end += 1;
  const chunk = list.slice(start, end);
  if (chunk.some(block => block.id === beforeId)) return list;
  const rest = [...list.slice(0, start), ...list.slice(end)];
  const at = beforeId == null ? rest.length : rest.findIndex(block => block.id === beforeId);
  if (at < 0) return list;
  return [...rest.slice(0, at), ...chunk, ...rest.slice(at)];
}
