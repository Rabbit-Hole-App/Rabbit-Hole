// The one tool that lets the tutor shape a lesson. It proposes; it never
// applies. Canvas blocks are React state in the browser, so nothing the worker
// does can reach them - the ops ride back to the page, and the learner decides.
//
// Three verbs. No move and no delete, deliberately: the learner approves from a
// list of titles, and a list of titles cannot show that moving a section reflows
// every card below it and leaves the pen strokes behind at their old positions.
// Add those the day the proposal can show cards.

const MAX_OPS = 12;
const MAX_TEXT = 200;

export const OUTLINE_TOOL = {
  name: 'propose_lesson_outline',
  description: 'Propose changes to this lesson\'s table of contents: add a section, retitle one, or change its depth. The learner sees the proposal and chooses whether to apply it - nothing changes on their canvas when you call this. Call it at most once per answer, and say in your reply what you proposed and why. Only use ids that appear in the outline you were given.',
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
            op: { type: 'string', enum: ['add', 'retitle', 'set_level'] },
            id: { type: 'string', description: 'For retitle and set_level: the id of an existing heading.' },
            after: { type: 'string', description: 'For add: the id of the heading to put this one after, or the key of one added earlier in this same call. Omit to append at the end.' },
            key: { type: 'string', description: 'For add: a short name for this new heading so a later op in the same call can put something after it.' },
            text: { type: 'string', description: 'The heading title, for add and retitle.' },
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

// `outline` is what the client sent this turn, so an id outside it is either a
// hallucination or a stale turn. Neither should be allowed near the canvas.
export function validateOutlineOps(ops, outline) {
  if (!Array.isArray(ops) || !ops.length) throw new Error('Propose at least one outline change');
  if (ops.length > MAX_OPS) throw new Error(`Propose at most ${MAX_OPS} outline changes at once`);
  const known = new Set((outline || []).map(entry => entry.id));
  const minted = new Set();
  return ops.map(op => {
    if (!op || typeof op !== 'object') throw new Error('Invalid outline change');
    if (op.op === 'add') {
      if (!title(op.text)) throw new Error('A new section needs a title');
      if (!level(op.level)) throw new Error('A section is level 1, 2 or 3');
      if (op.after != null && !known.has(op.after) && !minted.has(op.after)) throw new Error(`No section ${op.after} in this outline`);
      if (op.key != null) {
        if (typeof op.key !== 'string' || !op.key.trim()) throw new Error('Invalid section key');
        minted.add(op.key);
      }
      return { op: 'add', text: op.text.trim(), level: op.level, after: op.after ?? null, ...(op.key ? { key: op.key } : {}) };
    }
    if (!known.has(op.id)) throw new Error(`No section ${op.id} in this outline`);
    if (op.op === 'retitle') {
      if (!title(op.text)) throw new Error('A section needs a title');
      return { op: 'retitle', id: op.id, text: op.text.trim() };
    }
    if (op.op === 'set_level') {
      if (!level(op.level)) throw new Error('A section is level 1, 2 or 3');
      return { op: 'set_level', id: op.id, level: op.level };
    }
    throw new Error(`Cannot ${op.op} a section here`);
  });
}
