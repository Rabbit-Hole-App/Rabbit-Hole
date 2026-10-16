// The one tool that lets the tutor shape a lesson. It proposes; it never
// applies. Canvas blocks are React state in the browser, so nothing the worker
// does can reach them - the ops ride back to the page, and the learner decides.
//
// Four verbs (add, retitle, describe, set_level). No move and no delete, deliberately: the learner approves from a
// list of titles, and a list of titles cannot show that moving a section reflows
// every card below it and leaves the pen strokes behind at their old positions.
// Add those the day the proposal can show cards.

// 24: adopting a Tutor syllabus as the contents is one proposal (owner decision 5B, contract C5).
const MAX_OPS = 24;
const MAX_TEXT = 200;
const MAX_DESCRIPTION = 240;

export const OUTLINE_TOOL = {
  name: 'propose_lesson_outline',
  description: 'Propose changes to this lesson\'s table of contents: add a section (under an existing topic with parent), retitle one, describe one, or change its depth. The learner sees the proposal and chooses whether to apply it - nothing changes on their canvas when you call this. Call it at most once per answer, and say in your reply what you proposed and why. Only use ids that appear in the outline you were given.',
  input_schema: {
    type: 'object',
    required: ['ops'],
    properties: {
      ops: {
        type: 'array',
        maxItems: MAX_OPS,
        items: {
          type: 'object',
          required: ['op'],
          properties: {
            op: { type: 'string', enum: ['add', 'retitle', 'describe', 'set_level'] },
            id: { type: 'string', description: 'For retitle, describe and set_level: the id of an existing heading.' },
            parent: { type: 'string', description: 'For add: the id of the existing heading (or the key of one added earlier in this call) this one goes under. Its level must be one deeper than the parent\'s. Omit for a new top-level section.' },
            after: { type: 'string', description: 'For add: the id of the heading to put this one after, or the key of one added earlier in this same call. With parent, it is the parent itself (first under it) or a heading inside the parent; omit to go last under the parent. Without parent, omit to append at the end.' },
            key: { type: 'string', description: 'For add: a short name for this new heading so a later op in the same call can put something after or under it.' },
            text: { type: 'string', description: 'The heading title, for add and retitle.' },
            description: { type: 'string', maxLength: MAX_DESCRIPTION, description: 'For add (optional) and describe: one short sentence on what this section covers or what the learner will understand. Not a repeat of the title.' },
            level: { type: 'integer', minimum: 1, maximum: 3, description: '1 section, 2 sub-section, 3 sub-sub-section.' },
          },
        },
      },
    },
  },
};

export { OUTLINE_SYSTEM } from './agents/learn-chat.js';

const title = value => typeof value === 'string' && value.trim() && value.trim().length <= MAX_TEXT;
const level = value => [1, 2, 3].includes(value);
const description = value => typeof value === 'string' && value.trim() && value.trim().length <= MAX_DESCRIPTION;

// `outline` is what the client sent this turn, so an id outside it is either a
// hallucination or a stale turn. Neither should be allowed near the canvas.
// Adds and level changes are played onto a copy of the heading list as they are read, so a parent's subtree is the
// one the learner would see at that point of the proposal. An anchor `after` X lands after X's own subtree, except
// the parent itself, which puts the new heading first under it.
export function validateOutlineOps(ops, outline) {
  if (!Array.isArray(ops) || !ops.length) throw new Error('Propose at least one outline change');
  if (ops.length > MAX_OPS) throw new Error(`Propose at most ${MAX_OPS} outline changes at once`);
  const list = (outline || []).map(entry => ({ id: entry.id, level: entry.level }));
  const known = new Set(list.map(entry => entry.id));
  const minted = new Set();
  const at = id => list.findIndex(entry => entry.id === id);
  const subtreeEnd = index => { let end = index; while (end + 1 < list.length && list[end + 1].level > list[index].level) end += 1; return end; };
  const exists = id => known.has(id) || minted.has(id);
  return ops.map(op => {
    if (!op || typeof op !== 'object') throw new Error('Invalid outline change');
    if (op.op === 'add') {
      if (!title(op.text)) throw new Error('A new section needs a title');
      if (!level(op.level)) throw new Error('A section is level 1, 2 or 3');
      if (op.description != null && op.description !== '' && !description(op.description)) throw new Error(`A description is at most ${MAX_DESCRIPTION} characters`);
      if (op.after != null && !exists(op.after)) throw new Error(`No section ${op.after} in this outline`);
      let index = list.length;
      if (op.parent != null) {
        if (!exists(op.parent)) throw new Error(`No section ${op.parent} in this outline`);
        const p = at(op.parent), end = subtreeEnd(p);
        if (op.level !== list[p].level + 1) throw new Error('A section under another is one level deeper');
        if (op.after != null) {
          const a = at(op.after);
          if (a < p || a > end) throw new Error(`${op.after} is not inside ${op.parent}`);
          index = a === p ? p + 1 : subtreeEnd(a) + 1;
        } else index = end + 1;
      } else if (op.after != null) index = subtreeEnd(at(op.after)) + 1;
      if (op.key != null) {
        if (typeof op.key !== 'string' || !op.key.trim() || exists(op.key)) throw new Error('Invalid section key');
        minted.add(op.key);
      }
      list.splice(index, 0, { id: op.key ?? null, level: op.level });
      const text = op.description?.trim();
      return { op: 'add', text: op.text.trim(), level: op.level, after: op.after ?? null, ...(op.key ? { key: op.key } : {}), ...(op.parent != null ? { parent: op.parent } : {}), ...(text ? { description: text } : {}) };
    }
    if (!known.has(op.id)) throw new Error(`No section ${op.id} in this outline`);
    if (op.op === 'retitle') {
      if (!title(op.text)) throw new Error('A section needs a title');
      return { op: 'retitle', id: op.id, text: op.text.trim() };
    }
    if (op.op === 'describe') {
      if (!description(op.description)) throw new Error(`A description is 1-${MAX_DESCRIPTION} characters`);
      return { op: 'describe', id: op.id, description: op.description.trim() };
    }
    if (op.op === 'set_level') {
      if (!level(op.level)) throw new Error('A section is level 1, 2 or 3');
      list[at(op.id)].level = op.level;
      return { op: 'set_level', id: op.id, level: op.level };
    }
    throw new Error(`Cannot ${op.op} a section here`);
  });
}
