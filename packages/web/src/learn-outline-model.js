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
