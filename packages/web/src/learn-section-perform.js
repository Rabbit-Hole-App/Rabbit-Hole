// packages/web/src/learn-section-perform.js
// Learn sections, Make (learn-section-make-spec.md sections 0 and 11c-d; docs/features/learn-sections/CONTRACT.md "perform"): what the browser does with the server's `perform` for one
// item, through the functions that already make each card. Dev build only (TutorRehearsal.jsx, VITE_REHEARSAL_TRIGGER).
// performItem({ canvasApi, slash, perform, item, ctx }) -> Promise<{ cardId | jobId, highlight?, last }>; it throws when the card could not be made.
//   canvasApi: the canvas's commands (LearnPage canvasOps.tutorCanvas()); slash: the composer's command ref (ask.jsx slashRef); perform: the server's; item: { itemId, command, lead, follow }.
//   ctx: { sectionId, itemId, ops (LearnPage canvasOps), after (the card id of the compose item this one was made for), previous (the section's last card), repository ({ app, repo, commit }), report }.
// Every item gets its `lead` before the card and its `follow` after it as Document cards; each card of the section is tagged block.learn = { sectionId, itemId, role } so the placement
// slice can rearrange them. Until that slice, each lands beside the previous card (besideSpot, through the canvas's insertCodeExplain placement), so nothing overlaps.
import { DOC_CARD_SIZE, newDocBlock } from './canvas-doc.js';
import { placeCodeExplain } from './code-explain-insert.js';
import { insertCodeCards, repoCodeCard } from './code-card.js';

const LINK_COLOR = '#2383e2'; // the code-explain satellites' connector colour (code-explain-insert.js)
const frame = () => new Promise(resolve => (globalThis.requestAnimationFrame ? requestAnimationFrame(() => resolve()) : setTimeout(resolve, 16)));
// A card just inserted is measured after it renders; placing beside it waits for that, a few seconds at most.
async function drawn(canvasApi, id, tries = 120) {
  for (let k = 0; id && k < tries; k += 1) { if (canvasApi.measured?.(id)) return id; await frame(); }
  return id && canvasApi.measured?.(id) ? id : null;
}
export const learnTag = (ctx, role) => ({ sectionId: ctx.sectionId, itemId: ctx.itemId, role });
// lead / follow: a string or a list of paragraphs -> one Markdown text ('' when there is none).
export const flowText = text => (Array.isArray(text) ? text : [text]).map(part => String(part ?? '').trim()).filter(Boolean).join('\n\n');

// Blocks placed together beside `beside` (or the selected card, or the view), one undo step: the code-explain insertion, which places with besideSpot then a row to the right.
export async function placeBlocks(canvasApi, blocks, { beside = null, sizes = [], links = [] } = {}) {
  const near = await drawn(canvasApi, beside);
  return canvasApi.insertCodeExplain({ blocks, links, beside: near, place: env => placeCodeExplain(env, sizes.length ? sizes : blocks.map(() => DOC_CARD_SIZE)) });
}
// A Document card from Markdown (canvas-doc.js newDocBlock, parsed by CanvasDoc.jsx markdownToDocBlocks), tagged with its role. -> its id, or null when there is no text.
export async function placeDoc(canvasApi, markdown, ctx, role, beside) {
  const text = flowText(markdown);
  if (!text) return null;
  const { markdownToDocBlocks } = await import('./CanvasDoc.jsx');
  return placeBlocks(canvasApi, [{ ...newDocBlock(), blocks: markdownToDocBlocks(text), learn: learnTag(ctx, role) }], { beside });
}
// A card made by its own insert: tagged afterwards (no undo-worthy change of content).
export const tagCard = (canvasApi, id, ctx, role = 'card') => id && canvasApi.updateBlock?.(id, block => (block.learn ? block : { ...block, learn: learnTag(ctx, role) }));
// A connector from one card to another once both are drawn (the code-explain satellites' shape).
export async function linkCards(canvasApi, from, to, id = `learn-${from}-${to}`) {
  if (!from || !to || from === to || !(await drawn(canvasApi, from)) || !(await drawn(canvasApi, to))) return false;
  return canvasApi.linkCards?.([{ id, from, fromSide: 'right', to, toSide: 'left', color: LINK_COLOR }]) || false;
}

// The card itself, per perform.op. -> { cardId?, jobId?, highlight?, last? } (last: the right-most card it placed, for the next placement).
async function makeCard({ canvasApi, slash, perform, ctx, beside }) {
  const op = perform?.op;
  if (op === 'slash') {
    if (!slash?.current?.intercept || typeof perform.line !== 'string') throw new Error('no_composer');
    // Exactly as a typed line (DECISIONS M): the composer's command intercept, with the learner's depth (sent with its board, as learn-slash.js generateCommand needs), the server's
    // context in place of a selected card's, and madeBy. Its first card is this item's card; an error notice, or no card, is a failure.
    const cards = [];
    const out = await new Promise(resolve => slash.current.intercept(perform.line, { depth: perform.depth || ctx.depth || null, board: ctx.board || 'main', context: perform.context ?? null, madeBy: perform.madeBy || 'learn-section', onCard: id => cards.push(id), onDone: resolve }));
    if (!cards.length || out?.notice?.tone === 'error') throw new Error(out?.notice?.text || 'no_card');
    return { cardId: cards[0] };
  }
  // Repository code (C section 2a, DECISIONS P): the Files reader's code card per anchor at the pinned commit, its beat's lines as the existing `ranges`; several cards as one group
  // (code-card.js insertCodeCards: an equal card already here is revealed, not doubled), joined in order by connectors as the code-explain satellites are.
  if (op === 'codeCards') {
    const repo = ctx.repository, commit = perform.commit || repo?.commit;
    if (!repo?.repo || !commit || !Array.isArray(perform.cards) || !perform.cards.length) throw new Error('no_repository');
    const blocks = perform.cards.map(card => ({ ...repoCodeCard({ app: repo.app, repo: repo.repo, commit, path: card.path, start: card.start || null, end: card.end || null, nodeId: card.nodeId || null, label: card.label || null, ranges: Array.isArray(card.ranges) ? card.ranges.map(({ id, start, end }) => ({ id, start, end })) : null }), learn: learnTag(ctx, 'card') }));
    const ids = [insertCodeCards(ctx.ops, blocks)].flat().map(out => (typeof out === 'string' ? out : out?.id)).filter(Boolean);
    if (!ids.length) throw new Error('no_card');
    for (let k = 1; k < ids.length; k += 1) await linkCards(canvasApi, ids[k - 1], ids[k]);
    return { cardId: ids[0], last: ids.at(-1) };
  }
  if (op === 'doc') return { cardId: await placeDoc(canvasApi, perform.markdown, ctx, 'card', beside) }; // a pure text beat has no card: only its lead
  throw new Error(`unknown_op:${op}`);
}

export async function performItem({ canvasApi, slash, perform, item, ctx = {} }) {
  if (!canvasApi?.insertCodeExplain) throw new Error('no_canvas');
  const lead = await placeDoc(canvasApi, item?.lead, ctx, 'lead', ctx.previous || null);
  const made = await makeCard({ canvasApi, slash, perform, ctx, beside: lead || ctx.previous || null });
  if (made.cardId) tagCard(canvasApi, made.cardId, ctx);
  if (ctx.after && made.cardId) await linkCards(canvasApi, ctx.after, made.cardId); // pairing: this item was made for the text of that earlier item
  const follow = await placeDoc(canvasApi, item?.follow, ctx, 'follow', made.last || made.cardId || lead || ctx.previous || null);
  const { last, ...done } = made;
  return { ...done, last: follow || last || made.cardId || lead || ctx.previous || null };
}
