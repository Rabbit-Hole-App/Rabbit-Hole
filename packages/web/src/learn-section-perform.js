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
import { newNotebookBlock } from './learn-notebook.js';

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
// A change to a card made by its own insert, once the canvas holds it (a card inserted this tick is in the board's blocks only after it renders).
export async function changeCard(canvasApi, id, change) {
  if (id && (await drawn(canvasApi, id))) canvasApi.updateBlock?.(id, change);
}
// A card made by its own insert: tagged afterwards.
export const tagCard = (canvasApi, id, ctx, role = 'card') => changeCard(canvasApi, id, block => (block.learn ? block : { ...block, learn: learnTag(ctx, role) }));
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
  // Notebook (C section 3, DECISIONS Q): the canvas notebook card (learn-notebook.js newNotebookBlock) holding the server's workspace: the active notebook as the card's own copy, every other
  // file (helper .py files, a second notebook) seeded into the new workspace through the block's seed_files, the shape an imported .py uses (learn-file-import.js; canvas-bridge.js init).
  // ponytail: perform.runtime is not drawn here; the server already marks those cells and appends the sentence to the markdown cell before each (section 3d).
  if (op === 'notebook') {
    const files = (Array.isArray(perform.files) ? perform.files : []).filter(file => typeof file?.path === 'string' && file.path);
    const active = files.find(file => file.path === perform.activePath) || files.find(file => file.path.endsWith('.ipynb'));
    if (!active) throw new Error('no_notebook');
    const text = content => (typeof content === 'string' ? content : JSON.stringify(content ?? ''));
    const ipynb = typeof active.content === 'string' ? JSON.parse(active.content) : active.content;
    const seed = Object.fromEntries(files.filter(file => file !== active).map(file => [file.path, text(file.content)]));
    const block = { ...newNotebookBlock(), active_path: active.path, ipynb_path: active.path, files: files.map(file => file.path), ipynb, ...(Object.keys(seed).length ? { seed_files: seed } : {}), learn: learnTag(ctx, 'card') };
    const id = canvasApi.insertNotebook?.(block);
    if (!id) throw new Error('no_card');
    return { cardId: id };
  }
  // Found material (C sections 5-7): the page's own inserts (DECISIONS R). A quote rides on the card as a highlight entry carrying `learn`; LearnPaper / LearnWiki resolve it when
  // the learner opens that page or article and report one that is not there (learn-wiki-highlights.js resolveLearnQuotes, DECISIONS S).
  const quoteOf = (exact, where) => (String(exact || '').trim() ? [{ ...where, exact: String(exact).trim(), prefix: '', suffix: '', learn: { sectionId: ctx.sectionId, itemId: ctx.itemId } }] : []);
  const addQuotes = (id, quotes) => (quotes.length ? changeCard(canvasApi, id, block => ({ ...block, highlights: [...(block.highlights || []), ...quotes] })) : null);
  if (op === 'video') {
    if (!perform.videoId || !canvasApi.addVideo) throw new Error('no_video');
    const id = canvasApi.addVideo({ videoId: perform.videoId, title: perform.title || null, channel: perform.channel || null, start: Number(perform.start) || 0, end: perform.end ?? null });
    if (!id) throw new Error('no_card');
    return { cardId: id };
  }
  // One paper card per page in reading order (C section 6b): the first through the page's addPaper (the paper becomes a source and the next question's context), each later page
  // a new card of the same paper beside the previous one (addPaper keeps one card per paper and would only turn its page).
  // ponytail: a page's `figure` (the crop beside the card, learn-paper-figures.js) is not drawn yet.
  if (op === 'paper') {
    const pages = (Array.isArray(perform.pages) ? perform.pages : []).filter(entry => Number.isInteger(entry?.page) && entry.page > 0);
    if (!perform.id || !pages.length || !canvasApi.addPaper) throw new Error('no_paper');
    const ids = [];
    for (const [index, entry] of pages.entries()) {
      const quotes = quoteOf(entry.quote, { page: entry.page });
      if (index === 0) { const id = canvasApi.addPaper({ id: perform.id, title: perform.title, page: entry.page }); await addQuotes(id, quotes); if (id) ids.push(id); continue; }
      const id = await placeBlocks(canvasApi, [{ id: crypto.randomUUID(), type: 'paper', dx: 0, dy: 0, title: perform.title || `arXiv ${perform.id}`, paper: { id: perform.id, page: entry.page }, highlights: quotes, learn: learnTag(ctx, 'card') }], { beside: ids.at(-1) || beside, sizes: [{ w: 620, h: 560 }] });
      if (id) ids.push(id);
    }
    if (!ids.length) throw new Error('no_card');
    return { cardId: ids[0], last: ids.at(-1) };
  }
  if (op === 'wiki') {
    if (!perform.title || !canvasApi.addWiki) throw new Error('no_article');
    const id = canvasApi.addWiki({ title: perform.title, section: perform.section ?? 0 });
    if (!id) throw new Error('no_card');
    await addQuotes(id, quoteOf(perform.quote, { title: perform.title }));
    return { cardId: id };
  }
  // Webpage (C section 10c, last): the /browser command's own capture (insertWebpage); the quotes ride on the card and WebpageCard anchors, highlights and scrolls to them once
  // the capture and its text are ready (learnQuotes), reporting one that is not on the page.
  if (op === 'webpage') {
    if (typeof perform.url !== 'string' || !canvasApi.insertWebpage) throw new Error('no_page');
    const id = canvasApi.insertWebpage(perform.url);
    if (!id) throw new Error('no_card');
    const quotes = (Array.isArray(perform.quotes) ? perform.quotes : []).map(quote => String(quote ?? '').trim()).filter(Boolean);
    if (quotes.length) await changeCard(canvasApi, id, block => ({ ...block, learnQuotes: { sectionId: ctx.sectionId, itemId: ctx.itemId, quotes } }));
    return { cardId: id };
  }
  if (op === 'doc') return { cardId: await placeDoc(canvasApi, perform.markdown, ctx, 'card', beside) }; // a pure text beat has no card: only its lead
  throw new Error(`unknown_op:${op}`);
}

export async function performItem({ canvasApi, slash, perform, item, ctx = {} }) {
  if (!canvasApi?.insertCodeExplain) throw new Error('no_canvas');
  const lead = await placeDoc(canvasApi, item?.lead, ctx, 'lead', ctx.previous || null);
  const made = await makeCard({ canvasApi, slash, perform, ctx, beside: lead || ctx.previous || null });
  if (made.cardId) await tagCard(canvasApi, made.cardId, ctx);
  if (ctx.after && made.cardId) await linkCards(canvasApi, ctx.after, made.cardId); // pairing: this item was made for the text of that earlier item
  const follow = await placeDoc(canvasApi, item?.follow, ctx, 'follow', made.last || made.cardId || lead || ctx.previous || null);
  const { last, ...done } = made;
  return { ...done, last: follow || last || made.cardId || lead || ctx.previous || null };
}
