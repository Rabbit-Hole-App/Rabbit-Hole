// A Tutor syllabus as table-of-contents ops (R4 contract C8, owner decision 5B): "Use as table of contents" turns the
// chat syllabus into one proposal for the page's existing Apply/Discard flow, so the saved headings become the working
// syllabus and the chat message stays a historical proposal.
// Empty contents: one level-1 add per topic (keyed, with its description) and a level-2 add per subtopic under it.
// Existing contents: a topic matches the level-1 heading with the same normalized title. A matched topic gets adds for
// its missing subtopics under that heading, and a describe only when the heading has no description; a title or an
// existing description is never overwritten. An unmatched topic is appended as a new level-1 topic with its subtopics.
// [] means everything is already there.
import { outlineRevision } from './learn-outline-model.js';

// The same normalization as Apply's sibling check (learn-outline-model.js sameTitle): trim, collapse spaces, case-fold.
const same = text => String(text || '').trim().replace(/\s+/g, ' ').toLowerCase();
const described = text => (typeof text === 'string' ? text.trim().slice(0, 240) : '');
const withDescription = (op, text) => (described(text) ? { ...op, description: described(text) } : op);

export function syllabusToOutlineOps(syllabus, outline = []) {
  const entries = outline || [], ops = [];
  (syllabus?.topics || []).forEach((topic, i) => {
    const subtopics = Array.isArray(topic.subtopics) ? topic.subtopics : [];
    const at = entries.findIndex(entry => entry.level === 1 && same(entry.label) === same(topic.title));
    if (at < 0) {
      const key = `syllabus-${i + 1}`;
      ops.push(withDescription({ op: 'add', key, text: topic.title.trim(), level: 1 }, topic.description));
      for (const sub of subtopics) ops.push(withDescription({ op: 'add', text: sub.title.trim(), level: 2, parent: key }, sub.description));
      return;
    }
    const heading = entries[at];
    if (!described(heading.description) && described(topic.description)) ops.push({ op: 'describe', id: heading.id, description: described(topic.description) });
    // The heading's direct children: level-2 entries up to the next level-1 heading.
    const children = new Set();
    for (let j = at + 1; j < entries.length && entries[j].level > 1; j += 1) if (entries[j].level === 2) children.add(same(entries[j].label));
    for (const sub of subtopics) {
      if (children.has(same(sub.title))) continue;
      ops.push(withDescription({ op: 'add', text: sub.title.trim(), level: 2, parent: heading.id }, sub.description));
    }
  });
  return ops;
}

// The proposal object the page's Apply/Discard flow takes (contract C6), against the contents as they are now.
export const syllabusProposal = (syllabus, outline = []) => ({ ops: syllabusToOutlineOps(syllabus, outline), base: outlineRevision(outline || []), source: 'syllabus' });
