// The lesson's structure, read off the canvas. Headings are the outline: the
// table of contents is not a view onto some other document, it IS this list.
//
// Flat, with a level, rather than a tree. Both the learner and the agent
// restructure this - promoting a sub-section, splicing one in mid-lesson,
// reordering - and every one of those is an easy edit to a flat list and an
// awkward one to a tree.

const UNTITLED = { 1: 'Untitled section', 2: 'Untitled sub-section', 3: 'Untitled sub-sub-section' };
// A heading's optional description (R4 contract C1): what the section covers, at most this long. Absent or '' is none.
export const DESCRIPTION_MAX = 240;
const TITLE_MAX = 200;
const MAX_OPS = 24;
const levelOf = block => (block.level >= 1 && block.level <= 3 ? block.level : 1);
const describedBy = block => (typeof block.description === 'string' ? block.description.trim().slice(0, DESCRIPTION_MAX) : '');

export function outlineFrom(blocks) {
  return (blocks || [])
    .filter(block => block.type === 'heading')
    .map(block => {
      const level = levelOf(block);
      return { id: block.id, level, label: (block.text || '').trim() || UNTITLED[level], done: !!block.done, description: describedBy(block) };
    });
}

// The outline's revision (contract C3): FNV-1a (32 bit, over the UTF-16 code units) of the JSON of
// [id, level, label, description] per entry, as 8 hex digits. A proposal carries the revision it was made against, and
// Apply refuses it once the headings changed. `done` is left out: ticking a section never stales a proposal. Pure and
// import-free so the worker computes the same string.
export function outlineRevision(outline) {
  const text = JSON.stringify((outline || []).map(entry => [entry.id, entry.level, entry.label, entry.description || '']));
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  return (hash >>> 0).toString(16).padStart(8, '0');
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
  return planOutline(blocks, ops, { newId }).blocks;
}

export const STALE_PROPOSAL = 'The contents changed since this proposal. Ask the Tutor again.';

// The canvas's applyOutline (contract C7) as a pure step: { ok: true, blocks, applied, skipped } or
// { ok: false, reason: 'stale' | 'invalid', message }. With `base` (a proposal), the outline must still be at that
// revision, and an add whose title matches a sibling under the same parent is skipped (its key then names that
// sibling), so adopting the same syllabus twice adds nothing. Without `base` (the learner's own edit in the panel) it
// applies unconditionally, as before. Either way an invalid op refuses the whole list.
export function applyOutlineProposal(blocks, ops, { base = null, newId } = {}) {
  if (base != null && outlineRevision(outlineFrom(blocks)) !== base) return { ok: false, reason: 'stale', message: STALE_PROPOSAL };
  const plan = planOutline(blocks, ops, { newId, strict: true, dedupe: base != null });
  return plan.error ? { ok: false, reason: 'invalid', message: `This proposal cannot be applied: ${plan.error}` } : { ok: true, ...plan };
}

// What Apply would say, before it is pressed: the stale or invalid message, or null.
export function proposalProblem(outline, proposal) {
  if (proposal?.base != null && outlineRevision(outline) !== proposal.base) return STALE_PROPOSAL;
  const blocks = (outline || []).map(entry => ({ id: entry.id, type: 'heading', level: entry.level, text: entry.label }));
  let n = 0;
  const result = applyOutlineProposal(blocks, proposal?.ops, { newId: () => `proposed-${n += 1}` });
  return result.ok ? null : result.message;
}

// The section a heading opens, [start, end): the heading and every block after it up to the next heading at its level
// or above.
function sectionEnd(list, start) {
  const level = list[start].level || 1;
  let end = start + 1;
  while (end < list.length && !(list[end].type === 'heading' && (list[end].level || 1) <= level)) end += 1;
  return end;
}

// The id of the heading a heading of `level` at `index` sits under, or null.
function parentAt(list, index, level) {
  for (let i = index - 1; i >= 0; i -= 1) if (list[i].type === 'heading' && levelOf(list[i]) < level) return list[i].id;
  return null;
}

const sameTitle = text => String(text || '').trim().replace(/\s+/g, ' ').toLowerCase();
const trimmed = value => (typeof value === 'string' ? value.trim() : '');

// strict: any op that does not fit the contract (C5) is { error } and nothing applies. Lenient (applyOutlineOps): an op
// on a removed heading is skipped and an add with a lost anchor lands at the end.
function planOutline(blocks, ops, { newId = () => crypto.randomUUID(), strict = false, dedupe = false } = {}) {
  if (strict && (!Array.isArray(ops) || ops.length > MAX_OPS)) return { error: `a proposal has at most ${MAX_OPS} changes.` };
  const next = [...(blocks || [])];
  const minted = new Map();
  const indexOf = ref => (ref == null ? -1 : next.findIndex(block => block.id === (minted.get(ref) ?? ref) && block.type === 'heading'));
  let skipped = 0;
  for (const op of ops || []) {
    if (!['add', 'retitle', 'describe', 'set_level'].includes(op?.op)) {
      if (strict) return { error: 'it has an unknown kind of change.' };
      continue;
    }
    if (strict && op.text !== undefined && (!trimmed(op.text) || trimmed(op.text).length > TITLE_MAX)) return { error: `a title has 1 to ${TITLE_MAX} characters.` };
    if (strict && op.level !== undefined && ![1, 2, 3].includes(op.level)) return { error: 'a heading level is 1, 2 or 3.' };
    if (strict && op.description !== undefined && (typeof op.description !== 'string' || op.description.trim().length > DESCRIPTION_MAX)) return { error: `a description has at most ${DESCRIPTION_MAX} characters.` };
    if (op.op === 'add') {
      if (strict && (op.text === undefined || op.level === undefined)) return { error: 'a new heading needs a title and a level.' };
      if (strict && op.key != null && (typeof op.key !== 'string' || minted.has(op.key))) return { error: 'two new headings share a key.' };
      // No anchor, or an anchor the learner has since removed: keep the section
      // and put it at the end rather than losing it.
      let at = next.length;
      const parent = indexOf(op.parent);
      if (parent >= 0) {
        // Under a parent: one level below it, inside its subtree - by default at the subtree's end. `after` the parent is
        // its first sub-heading (after the parent's own cards); after one of its sub-headings is past that one's section,
        // so no card changes hands.
        if (strict && op.level !== levelOf(next[parent]) + 1) return { error: 'a subtopic sits one level below its parent.' };
        const end = sectionEnd(next, parent), anchor = indexOf(op.after);
        if (op.after == null) at = end;
        else if (anchor === parent) { at = parent + 1; while (at < end && next[at].type !== 'heading') at += 1; }
        else if (anchor > parent && anchor < end) at = sectionEnd(next, anchor);
        else if (strict) return { error: 'a new heading is placed outside its parent.' };
        else at = end;
      } else if (op.parent != null && strict) return { error: 'a parent heading no longer exists.' };
      else if (op.after != null) {
        const anchor = indexOf(op.after);
        if (anchor >= 0) at = anchor + 1;
        else if (strict) return { error: 'a heading it places a new one after no longer exists.' };
      }
      const text = strict ? trimmed(op.text) : op.text, description = trimmed(op.description).slice(0, DESCRIPTION_MAX);
      if (dedupe) {
        const under = parentAt(next, at, op.level);
        const twin = next.find((block, i) => block.type === 'heading' && levelOf(block) === op.level && sameTitle(block.text) === sameTitle(text) && parentAt(next, i, op.level) === under);
        if (twin) { if (op.key != null) minted.set(op.key, twin.id); skipped += 1; continue; }
      }
      const heading = { id: newId(), type: 'heading', dx: 0, dy: 0, level: op.level, text, done: false, ...(description ? { description } : {}) };
      if (op.key != null) minted.set(op.key, heading.id);
      next.splice(at, 0, heading);
      continue;
    }
    const at = indexOf(op.id);
    if (at < 0) { // the learner removed it between proposal and Apply
      if (strict) return { error: 'a heading it changes no longer exists.' };
      continue;
    }
    if (op.op === 'retitle') {
      if (strict && op.text === undefined) return { error: 'a rename needs a title.' };
      next[at] = { ...next[at], text: strict ? trimmed(op.text) : op.text };
    } else if (op.op === 'set_level') {
      if (strict && op.level === undefined) return { error: 'a level change needs a level.' };
      next[at] = { ...next[at], level: op.level };
    } else if (op.op === 'describe') {
      // '' clears it: the learner emptied the field in the panel.
      if (typeof op.description !== 'string') { if (strict) return { error: 'a description change needs a description.' }; continue; }
      const { description: _old, ...rest } = next[at];
      const description = op.description.trim().slice(0, DESCRIPTION_MAX);
      next[at] = description ? { ...rest, description } : rest;
    }
  }
  return { blocks: next, applied: (ops || []).length - skipped, skipped };
}

// Drag a section in the table of contents: its heading moves with everything
// under it - cards and deeper headings - up to the next heading at its level or
// above, and lands before the heading `beforeId` (null: the end). Dropping a
// section inside itself changes nothing.
export function moveSection(blocks, id, beforeId) {
  const list = blocks || [];
  const start = list.findIndex(block => block.id === id && block.type === 'heading');
  if (start < 0 || id === beforeId) return list;
  const end = sectionEnd(list, start);
  const chunk = list.slice(start, end);
  if (chunk.some(block => block.id === beforeId)) return list;
  const rest = [...list.slice(0, start), ...list.slice(end)];
  const at = beforeId == null ? rest.length : rest.findIndex(block => block.id === beforeId);
  if (at < 0) return list;
  return [...rest.slice(0, at), ...chunk, ...rest.slice(at)];
}
