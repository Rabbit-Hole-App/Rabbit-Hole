import { SCENE_SCHEMA, validateScene } from './learn-scene-schema.js';
import { validateTeachingHistory } from './learn-teaching.js';
import { SEARCH_ARXIV_TOOL, READ_ARXIV_TOOL, arxivId, searchArxiv, readArxivPaper, paperDocument, fetchArxivPdf } from './arxiv.js';
import { isUploadedPaperId, putUploadedPaper, readUploadedPaper, paperIdentity, PAPER_PAGE_LIMIT } from './learn-paper.js';
import { isUploadedMediaId, putUploadedMedia, readUploadedMedia } from './learn-media.js';
import { fetchWikipediaArticle } from './learn-wiki.js';
import { searchCanvasSource } from './learn-search.js';
import { setMomentFeedback, videoIdFrom } from './learn-youtube.js';
import { pruneVideo } from './learn-moment-index.js';
import { validateToolInput } from './learn-validation.js';
import { VIDEO_SCHEMA, validateVideo } from './learn-video-schema.js';
import { THREE_D_SCHEMA, validateThreeD } from './learn-three-d-schema.js';
import { GRAPH_SCHEMA, validateGraph } from './learn-graph-schema.js';
import { sealPreview, openPreview, previewImages } from './learn-preview-review.js';
import { anthropic, planModel } from './ask.js';
import { modelFailure } from './learn-research.js';
import { subscriptionOwnerRefusal } from './subscription-transport.js';
import { askModel, loggedModel, LEARN_TASKS, MESSAGE_LIMIT, PAPERS_PER_ANSWER, BOARD_DRAFT_TURNS, BOARD_REVIEW_PASSES } from './learn-models.js';
import { PLAN_TOOL, validateTeachingPlan, BOARD_REVIEW_SYSTEM, REVIEW_TOOL, validateBoardReview, strictTool } from './learn-board-review.js';
import { validateLessonSnapshot } from './learn-context.js';
import { PEXELS_TOOL, INSPECT_IMAGE_TOOL, inspectImage, searchPexels } from './pexels.js';

import { BOARD_SYSTEM, BOARD_NO_DESMOS } from './agents/learn-board.js';
export { BOARD_SYSTEM };

export const BOARD_TOOL = { name: 'explain_on_canvas', description: 'Propose a bounded visual explanation, rendered by the application after validation.', input_schema: {
  type: 'object', additionalProperties: false, required: ['summary', 'needsClarification', 'blocks'], properties: {
    summary: { type: 'string', maxLength: 500 }, needsClarification: { type: 'boolean' },
    blocks: { type: 'array', maxItems: 8, items: { type: 'object', additionalProperties: false, required: ['kind', 'text', 'fromObjectId'], properties: {
      kind: { type: 'string', enum: ['text', 'equation', 'diagram', 'code', 'image', 'paper_figure', 'video', 'graph', 'three_d', 'scene'] }, text: { type: 'string', minLength: 1, maxLength: 800 }, fromObjectId: { type: ['string', 'null'] },
      operation: { anyOf: [VIDEO_SCHEMA, GRAPH_SCHEMA, THREE_D_SCHEMA, SCENE_SCHEMA] },
      citation: { type: 'object', additionalProperties: false, required: ['paperId', 'page', 'label'], properties: { paperId: { type: 'string', maxLength: 80 }, page: { type: 'integer', minimum: 1, maximum: PAPER_PAGE_LIMIT }, label: { type: 'string', maxLength: 100 } } },
      crop: { type: 'object', additionalProperties: false, required: ['x', 'y', 'w', 'h'], properties: Object.fromEntries(['x', 'y', 'w', 'h'].map(key => [key, { type: 'number', minimum: 0, maximum: 1 }])) },
      photoId: { type: 'integer' },
      annotations: { type: 'array', maxItems: 4, items: { type: 'object', additionalProperties: false, required: ['kind', 'x', 'y'], properties: {
        kind: { type: 'string', enum: ['box', 'circle', 'highlight', 'arrow', 'label', 'path'] }, x: { type: 'number', minimum: 0, maximum: 1 }, y: { type: 'number', minimum: 0, maximum: 1 },
        w: { type: 'number', minimum: 0, maximum: 1 }, h: { type: 'number', minimum: 0, maximum: 1 }, x2: { type: 'number', minimum: 0, maximum: 1 }, y2: { type: 'number', minimum: 0, maximum: 1 }, text: { type: 'string', maxLength: 40 }, points: { type: 'array', minItems: 2, maxItems: 20, items: { type: 'object', additionalProperties: false, required: ['x', 'y'], properties: { x: { type: 'number', minimum: 0, maximum: 1 }, y: { type: 'number', minimum: 0, maximum: 1 } } } },
      } } },
      nodes: { type: 'array', minItems: 2, maxItems: 4, items: { type: 'object', additionalProperties: false, required: ['id', 'label'], properties: { id: { type: 'string', maxLength: 20 }, label: { type: 'string', maxLength: 60 } } } },
      edges: { type: 'array', maxItems: 5, items: { type: 'object', additionalProperties: false, required: ['from', 'to'], properties: { from: { type: 'string' }, to: { type: 'string' } } } },
    } } },
  },
} };

export function validateBoardPlan(plan, snapshot) {
  // The block count is a clutter limit, not correctness - the same reason the
  // per-kind caps below drop overflow - so trim a plan that ran long instead
  // of losing the whole explanation.
  if (Array.isArray(plan?.blocks) && plan.blocks.length > 8) plan.blocks = plan.blocks.slice(0, 8);
  // Sanitize diagram edges before schema validation: models decorate edges
  // with labels and stray references, which are droppable, not fatal.
  if (Array.isArray(plan?.blocks)) for (const b of plan.blocks) {
    // An omitted anchor means the block is not linked to a supplied object,
    // which is what null already says. Only a schema that enforces required
    // fields guarantees the key is present, so fill it in rather than failing.
    if (b && typeof b === 'object' && b.fromObjectId === undefined) b.fromObjectId = null;
    if (b?.kind === 'diagram' && Array.isArray(b.nodes) && Array.isArray(b.edges)) {
      const nodeIds = new Set(b.nodes.map(n => n?.id));
      b.edges = b.edges.map(e => e && nodeIds.has(e.from) && nodeIds.has(e.to) && e.from !== e.to ? { from: e.from, to: e.to } : null).filter(Boolean).slice(0, 5);
      b.nodes = b.nodes.map(n => n && typeof n === 'object' ? { id: n.id, label: n.label } : n);
    }
  }
  validateToolInput(plan, BOARD_TOOL.input_schema, 'canvas');
  const ids = new Set([snapshot.target, ...snapshot.relatedObjects].filter(Boolean).map(o => o.objectId));
  if (!plan || typeof plan.summary !== 'string' || !plan.summary.trim() || plan.summary.length > 500 || typeof plan.needsClarification !== 'boolean' || !Array.isArray(plan.blocks) || plan.blocks.length > 8 || (!plan.needsClarification && !plan.blocks.length) || (plan.needsClarification && plan.blocks.length)) throw new Error('Invalid canvas explanation');
  if (Object.keys(plan).some(k => !['summary', 'needsClarification', 'blocks'].includes(k))) throw new Error('Unexpected canvas action');
  for (const b of plan.blocks) {
    if (b.fromObjectId !== null && !ids.has(b.fromObjectId)) throw new Error(`canvas.blocks[${plan.blocks.indexOf(b)}].fromObjectId: must be null or an objectId supplied in the snapshot`);
    if (!b || !['text', 'equation', 'diagram', 'code', 'image', 'paper_figure', 'video', 'graph', 'three_d', 'scene'].includes(b.kind) || typeof b.text !== 'string' || !b.text.trim() || b.text.length > 800 || (b.fromObjectId !== null && !ids.has(b.fromObjectId)) || Object.keys(b).some(k => !['kind', 'text', 'fromObjectId', 'nodes', 'edges', 'photoId', 'annotations', 'citation', 'crop', 'operation'].includes(k))) throw new Error('Invalid canvas block or object reference');
    if (b.kind === 'video') validateVideo(b.operation);
    else if (b.kind === 'graph') validateGraph(b.operation);
    else if (b.kind === 'three_d') validateThreeD(b.operation);
    else if (b.kind === 'scene') validateScene(b.operation);
    else if (b.operation !== undefined) throw new Error('Only video, graph, 3D and scene blocks accept operations');
    if (b.kind === 'image' ? !Number.isSafeInteger(b.photoId) : b.photoId !== undefined) throw new Error('Invalid photo reference');
    if (b.citation !== undefined) {
      const c = b.citation;
      if (!c || arxivId(c.paperId) !== c.paperId || !Number.isInteger(c.page) || c.page < 1 || c.page > PAPER_PAGE_LIMIT || typeof c.label !== 'string' || c.label.length > 100 || Object.keys(c).some(k => !['paperId', 'page', 'label'].includes(k))) throw new Error('Invalid paper citation');
    }
    if (b.kind === 'paper_figure') {
      const c = b.crop;
      if (!b.citation || !c || Object.keys(c).length !== 4 || ['x', 'y', 'w', 'h'].some(k => !Number.isFinite(c[k]) || c[k] < 0 || c[k] > 1) || c.w <= 0 || c.h <= 0 || c.x + c.w > 1 || c.y + c.h > 1) throw new Error('Invalid paper figure crop');
    } else if (b.crop !== undefined) throw new Error('Only paper figures accept a crop');
    if (b.annotations !== undefined) {
      if (b.kind !== 'image' || !Array.isArray(b.annotations) || b.annotations.length > 4) throw new Error('Invalid image annotations');
      const unit = n => Number.isFinite(n) && n >= 0 && n <= 1;
      for (const a of b.annotations) {
        if (!a || !['box', 'circle', 'highlight', 'arrow', 'label', 'path'].includes(a.kind) || !unit(a.x) || !unit(a.y) || Object.keys(a).some(k => !['kind', 'x', 'y', 'w', 'h', 'x2', 'y2', 'text', 'points'].includes(k))) throw new Error('Invalid annotation');
        if (['box', 'circle', 'highlight'].includes(a.kind) && (!unit(a.w) || !unit(a.h) || a.w <= 0 || a.h <= 0 || a.x + a.w > 1 || a.y + a.h > 1)) throw new Error('Annotation outside image');
        if (a.kind === 'path' && (!Array.isArray(a.points) || a.points.length < 2 || a.points.length > 20 || a.points.some(p => !p || !unit(p.x) || !unit(p.y) || Object.keys(p).some(k => !['x', 'y'].includes(k))))) throw new Error('Invalid image path');
        if (a.kind === 'arrow' && (!unit(a.x2) || !unit(a.y2))) throw new Error('Arrow outside image');
        if (a.kind === 'label' && (typeof a.text !== 'string' || !a.text.trim() || a.text.length > 40)) throw new Error('Invalid image label');
      }
    }
    if (b.kind === 'equation' && /[\r\n]/.test(b.text)) throw new Error('Equations must stay on one line');
    if (b.kind === 'diagram') {
      if (!Array.isArray(b.nodes) || b.nodes.length < 2 || b.nodes.length > 4 || b.nodes.some(n => !n || typeof n.id !== 'string' || !/^[\w-]{1,20}$/.test(n.id) || typeof n.label !== 'string' || !n.label.trim() || n.label.length > 60)) throw new Error('Invalid diagram nodes');
      // Models decorate nodes/edges with extra fields and stray references;
      // sanitize to the supported shape instead of failing the plan.
      b.nodes = b.nodes.map(n => ({ id: n.id, label: n.label }));
      const nodeIds = new Set(b.nodes.map(n => n.id));
      if (nodeIds.size !== b.nodes.length) throw new Error('Invalid diagram nodes');
      b.edges = (Array.isArray(b.edges) ? b.edges : []).map(e => e && nodeIds.has(e.from) && nodeIds.has(e.to) && e.from !== e.to ? { from: e.from, to: e.to } : null).filter(Boolean).slice(0, 5);
    } else if (b.nodes !== undefined || b.edges !== undefined) throw new Error('Only diagrams accept nodes and edges');
  }
  // Source arrows are decoration, never worth failing the explanation over:
  // keep the first two anchors and detach the rest.
  let anchored = 0;
  for (const b of plan.blocks) if (b.fromObjectId !== null && ++anchored > 2) b.fromObjectId = null;
  // Per-kind caps are cost/clutter limits, not correctness: keep the first N
  // of each capped kind and drop the overflow instead of failing the plan.
  const caps = { image: 2, video: 1, graph: 2, three_d: 1, scene: 1 };
  const counts = {};
  plan.blocks = plan.blocks.filter(b => {
    const cap = caps[b.kind];
    if (!cap) return true;
    counts[b.kind] = (counts[b.kind] || 0) + 1;
    return counts[b.kind] <= cap;
  });
  return plan;
}

export async function generateBoardPlan(env, input, { onProgress = () => {}, callModel = loggedModel('board', planModel), searchPhotos = searchPexels, findPapers = searchArxiv, readPaper = readArxivPaper, renderPreviews = false, continuation = null, previews = null } = {}) {
  const { snapshot, question, answer, model, repositoryEvidence } = input;
  const history = validateTeachingHistory(input.history);
  const messages = [{ role: 'user', content: JSON.stringify({ snapshot, question, answer, history, repositoryEvidence }) }], photos = new Map(), inspected = new Set(), papers = new Map();
  const selectedModel = askModel(model, LEARN_TASKS.board.model);
  // Like the Pexels tools, Desmos needs its key: without DESMOS_API_KEY the
  // renderer cannot load it, so the prompt says so and a desmos graph goes to
  // the one format repair (registries-14).
  const drawingSystem = env.DESMOS_API_KEY ? BOARD_SYSTEM : `${BOARD_SYSTEM}\n${BOARD_NO_DESMOS}`;
  const validateDraft = value => {
    const plan = validateBoardPlan(value, snapshot);
    if (!env.DESMOS_API_KEY && plan.blocks.some(b => b.operation?.renderer === 'desmos')) throw new Error(BOARD_NO_DESMOS);
    return plan;
  };
  const invoke = async (system, tools, toolChoice, history, max_tokens = LEARN_TASKS.board.maxTokens.draft) => {
    const strictNames = [PLAN_TOOL.name, REVIEW_TOOL.name];
    const send = strict => callModel(env, { max_tokens, system, tools: tools.map(tool => strict && strictNames.includes(tool.name) ? strictTool(tool) : tool), tool_choice: toolChoice, messages: history }, selectedModel, null);
    let response = await send(true);
    // Structured outputs compile the schema into a grammar; when that request
    // is rejected the plan is still validated here, so drop strict rather than
    // lose the whole explanation.
    if (response.status === 400 && tools.some(tool => strictNames.includes(tool.name))) response = await send(false);
    if (!response.ok) throw await modelFailure(response, 'Canvas explanation unavailable', '. Try again.');
    const result = await response.json();
    const calls = result.content?.filter(b => b.type === 'tool_use');
    if (calls?.length !== 1) throw new Error('Invalid explanation tool response');
    return { result, call: calls[0] };
  };
  const forced = tool => ({ type: 'tool', name: tool.name, disable_parallel_tool_use: true });
  let formatRepairUsed = continuation?.formatRepairUsed || false;
  // Last resort after a failed repair: drop individually invalid blocks and
  // render the rest, so a bad block never sinks the whole explanation.
  const salvage = (input, validate) => {
    let plan = input && typeof input === 'object' ? { ...input, blocks: Array.isArray(input.blocks) ? [...input.blocks] : input.blocks } : input;
    for (let round = 0; round < 8; round++) {
      try { return validate(plan); }
      catch (error) {
        if (!Array.isArray(plan?.blocks) || plan.blocks.length <= 1) throw error;
        const bad = plan.blocks.findIndex(block => { try { validate({ ...plan, blocks: [block] }); return false; } catch { return true; } });
        if (bad < 0) throw error; // plan-level failure, not a block problem
        console.warn('Learn salvage dropped a block', { kind: plan.blocks[bad]?.kind, reason: error.message });
        plan = { ...plan, blocks: plan.blocks.filter((_, i) => i !== bad) };
      }
    }
    return validate(plan);
  };
  const validateOrRepair = async (response, tool, validate, history, maxTokens = LEARN_TASKS.board.maxTokens.draft) => {
    try {
      if (response.result.stop_reason === 'max_tokens') throw new Error(`${tool.name}: output reached its ${maxTokens}-token limit before completing`);
      return { ...response, plan: validate(response.call.input) };
    }
    catch (error) {
      console.warn('Learn validation failed', { tool: tool.name, reason: error.message });
      if (formatRepairUsed) {
        if (tool.name === PLAN_TOOL.name) return { ...response, plan: salvage(response.call.input, validate) };
        throw error;
      }
      formatRepairUsed = true;
      onProgress(`Correcting ${tool.name === PLAN_TOOL.name ? 'teaching plan' : 'canvas format'}: ${error.message}`);
      const repairHistory = [...history, { role: 'assistant', content: response.result.content }, { role: 'user', content: [{ type: 'tool_result', tool_use_id: response.call.id, is_error: true, content: `Validation failed: ${error.message}. Return the complete corrected ${tool.name} input. Follow all schema limits, preserving supported meaning. This is the only format correction attempt; factual review still follows.` }] }];
      // A truncated response cannot be repaired with the same too-small budget.
      const repairTokens = response.result.stop_reason === 'max_tokens' ? Math.min(6000, Math.max(2400, maxTokens * 2)) : maxTokens;
      const repaired = await invoke(drawingSystem, [tool], forced(tool), repairHistory, repairTokens);
      if (repaired.call.name !== tool.name) throw new Error('Unexpected correction tool');
      if (repaired.result.stop_reason === 'max_tokens') throw new Error(`${tool.name}: correction reached its ${repairTokens}-token limit`);
      try { return { ...repaired, plan: validate(repaired.call.input) }; }
      catch (secondError) {
        console.warn('Learn validation failed', { tool: tool.name, reason: secondError.message, attempt: 'repair' });
        if (tool.name === PLAN_TOOL.name) return { ...repaired, plan: salvage(repaired.call.input, validate) };
        throw secondError;
      }
    }
  };
  const reply = (result, call, content, is_error = false) => messages.push({ role: 'assistant', content: result.content }, { role: 'user', content: [{ type: 'tool_result', tool_use_id: call.id, content, is_error }] });
  const resolve = plan => ({ ...plan, blocks: plan.blocks.map(b => {
    if (b.citation) {
      if (!papers.has(b.citation.paperId)) throw new Error('Model cited an unread paper');
      if (b.kind === 'image') throw new Error('Use a paper figure for paper images');
      return { ...b, paper: papers.get(b.citation.paperId) };
    }
    if (b.kind !== 'image') return b;
    if (!photos.has(b.photoId) || !inspected.has(b.photoId)) throw new Error('Model referenced an uninspected photo');
    return { ...b, photo: photos.get(b.photoId) };
  }) });

  let teachingPlan, draft, previousReview = continuation?.previousReview || null;
  if (continuation) {
    teachingPlan = continuation.teachingPlan; draft = { plan: continuation.plan };
    continuation.photos.forEach(p => photos.set(p.id, p));
    continuation.inspected.forEach(id => inspected.add(id));
    continuation.papers.forEach(p => papers.set(p.id, p));
  } else {
  for (const id of input.paperIds || []) {
    onProgress('Reading paper from chat...');
    const paper = await readPaper(id);
    papers.set(paper.id, paper);
    messages[0].content = typeof messages[0].content === 'string' ? [{ type: 'text', text: messages[0].content }] : messages[0].content;
    messages[0].content.push({ type: 'text', text: `Paper already retrieved for this chat: ${JSON.stringify(paper)}` }, paperDocument(paper));
  }
  onProgress('Planning explanation...');
  let planning = await invoke(drawingSystem, [PLAN_TOOL], forced(PLAN_TOOL), messages, LEARN_TASKS.board.maxTokens.plan);
  if (planning.call.name !== PLAN_TOOL.name) throw new Error('No teaching plan returned');
  planning = await validateOrRepair(planning, PLAN_TOOL, validateTeachingPlan, messages, LEARN_TASKS.board.maxTokens.plan);
  teachingPlan = planning.plan;
  onProgress(`Preparing ${teachingPlan.depth.replace('_', ' ')} explanation...`);
  reply(planning.result, planning.call, 'Teaching plan recorded. Gather required assets, inspect them, and draft the explanation.');
  // Optional tools only: allow discovery/reading when useful, then force a final draft.
  for (let attempt = 0; attempt < BOARD_DRAFT_TURNS; attempt++) {
    const search = attempt < BOARD_DRAFT_TURNS - 1;
    onProgress('Preparing explanation and assets...');
    const { result, call } = await invoke(drawingSystem, [BOARD_TOOL, ...(search ? [SEARCH_ARXIV_TOOL, READ_ARXIV_TOOL, ...(env.PEXELS_API_KEY ? [PEXELS_TOOL, INSPECT_IMAGE_TOOL] : [])] : [])], search ? { type: 'any', disable_parallel_tool_use: true } : forced(BOARD_TOOL), messages);
    if (call.name === BOARD_TOOL.name) { draft = await validateOrRepair({ result, call }, BOARD_TOOL, validateDraft, messages); break; }
    if (!search || ![PEXELS_TOOL.name, INSPECT_IMAGE_TOOL.name, SEARCH_ARXIV_TOOL.name, READ_ARXIV_TOOL.name].includes(call.name)) throw new Error('No canvas explanation returned');
    let content, is_error = false;
    try {
      if (call.name === SEARCH_ARXIV_TOOL.name) {
        onProgress('Finding relevant papers...');
        content = [{ type: 'text', text: JSON.stringify(await findPapers(call.input.query)) }];
      } else if (call.name === READ_ARXIV_TOOL.name) {
        onProgress('Reading paper...');
        if (papers.size >= PAPERS_PER_ANSWER && !papers.has(call.input.id)) throw new Error('Use the two papers already read');
        const paper = await readPaper(call.input.id);
        papers.set(paper.id, paper);
        content = [{ type: 'text', text: JSON.stringify(paper) }, paperDocument(paper)];
      } else if (call.name === PEXELS_TOOL.name) {
        onProgress('Finding photos...');
        const found = await searchPhotos(env, call.input.query);
        found.forEach(p => photos.set(p.id, p));
        content = [{ type: 'text', text: JSON.stringify(found) }];
      } else {
        onProgress('Inspecting photo...');
        content = inspectImage(photos, call.input.photoId);
        inspected.add(call.input.photoId);
      }
    } catch (error) { content = [{ type: 'text', text: error.message }]; is_error = true; }
    reply(result, call, content, is_error);
  }
  if (!draft) throw new Error('No canvas explanation returned');
  }
  // Two reviews maximum: initial candidate, then at most one revision.
  for (let pass = continuation?.pass || 1; pass <= BOARD_REVIEW_PASSES; pass++) {
    const plan = resolve(draft.plan);
    if (plan.needsClarification) return { ...plan, teachingPlan };
    if (renderPreviews && plan.blocks.some(b => b.kind === 'paper_figure') && !previews) {
      return { previewPlan: plan, state: { input, teachingPlan, plan: draft.plan, previousReview, pass, formatRepairUsed, photos: [...photos.values()], inspected: [...inspected], papers: [...papers.values()] } };
    }
    onProgress(`Reviewing explanation (${pass}/${BOARD_REVIEW_PASSES})...`);
    const content = [{ type: 'text', text: JSON.stringify({ question, answer, snapshot, history, repositoryEvidence, teachingPlan, plan, previousReview }) }];
    for (const photoId of new Set(plan.blocks.filter(b => b.kind === 'image').map(b => b.photoId))) content.push(...inspectImage(photos, photoId));
    for (const paper of papers.values()) content.push(paperDocument(paper));
    const renderedCrops = previews ? previewImages(previews, plan) : [];
    content.push(...renderedCrops);
    const reviewResponse = await invoke(BOARD_REVIEW_SYSTEM, [REVIEW_TOOL], forced(REVIEW_TOOL), [{ role: 'user', content }], LEARN_TASKS.board.maxTokens.review);
    if (reviewResponse.call.name !== REVIEW_TOOL.name) throw new Error('No explanation review returned');
    const review = validateBoardReview(reviewResponse.call.input, plan.blocks.length);
    if (review.verdict === 'ready') return { ...plan, teachingPlan, review: { passes: pass, checks: review.checks } };
    if (pass === BOARD_REVIEW_PASSES) throw new Error(`The explanation did not pass review after one revision: ${review.findings[0].problem}`);
    previousReview = review;
    onProgress('Revising explanation...');
    const revisionContent = [{ type: 'text', text: JSON.stringify({ question, snapshot, history, repositoryEvidence, teachingPlan, rejectedPlan: draft.plan, review, availablePhotos: [...photos.values()], availablePapers: [...papers.values()], instruction: 'Return a complete corrected explanation. Check every requiredChange against the supplied original assets and change every affected block, including captions and diagram labels. The rejected draft is not evidence. If source wording differs between a figure, caption, and body, explicitly distinguish them rather than equating their claims. Remove unsupported claims; if the teaching objective cannot be supported, request clarification. Do not repeat the earlier chat answer as authority.' }) }];
    for (const photoId of inspected) revisionContent.push(...inspectImage(photos, photoId));
    for (const paper of papers.values()) revisionContent.push(paperDocument(paper));
    revisionContent.push(...renderedCrops);
    const revised = await invoke(drawingSystem, [BOARD_TOOL], forced(BOARD_TOOL), [{ role: 'user', content: revisionContent }]);
    if (revised.call.name !== BOARD_TOOL.name) throw new Error('No revised explanation returned');
    draft = await validateOrRepair(revised, BOARD_TOOL, validateDraft, [{ role: 'user', content: revisionContent }]);
    previews = null;
  }
}

// Dev-only transport: the existing control plane verifies session/workspace/app access.
export async function boardFetch(req, env, generate = generateBoardPlan) {
  const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);
  let body;
  try {
    const raw = await req.text();
    if (raw.length > 12000000) return json({ error: 'Canvas request too large' }, 413);
    body = JSON.parse(raw);
    if (body?.continuation) {
      if (typeof body.app !== 'string' || raw.length > 12000000) throw new Error('Invalid figure review request');
    } else {
    if (raw.length > 40000) return json({ error: 'Canvas request too large' }, 413);
    if (!body || typeof body.app !== 'string' || !/^[a-z0-9-]{1,100}$/.test(body.app) || typeof body.question !== 'string' || !body.question.trim() || body.question.length > MESSAGE_LIMIT || typeof body.answer !== 'string' || !body.answer.trim() || body.answer.length > 10000) throw new Error('Invalid canvas request');
    if (body.paperIds !== undefined && (!Array.isArray(body.paperIds) || body.paperIds.length > PAPERS_PER_ANSWER || body.paperIds.some(id => arxivId(id) !== id))) throw new Error('Invalid paper references');
    validateLessonSnapshot(body.snapshot);
    validateTeachingHistory(body.history);
    }
  } catch (error) { return json({ error: error.message }, 400); }
  const access = await authorizedBoardApp(req, env, body.app);
  if (access instanceof Response) return access;
  const ownerRefused = subscriptionOwnerRefusal(env, access);
  if (ownerRefused) return ownerRefused;
  delete body.repositoryEvidence;
  if(access.kind==='repository'&&!body.continuation){
    try{const {repositoryEvidence}=await import('./repositories.js');body.repositoryEvidence=await repositoryEvidence(env,access,body);}
    catch(error){return json({error:error.message},400);}
  }
  let continuation = null, previews = null;
  if (body.continuation) {
    try {
      continuation = await openPreview(body.continuation, access, body.app, env.LEARN_PREVIEW_SECRET);
      previews = body.previews;
      previewImages(previews, continuation.plan);
      body = continuation.input;
    } catch (error) { return json({ error: error.message }, 400); }
  }
  const generateResult = async onProgress => {
    const result = await generate(env, body, { onProgress, renderPreviews: true, continuation, previews });
    if (result.previewPlan) return { previewPlan: result.previewPlan, continuation: await sealPreview(result.state, access, env.LEARN_PREVIEW_SECRET) };
    return { plan: result };
  };
  if (req.headers.get('accept')?.includes('text/event-stream')) {
    const encoder = new TextEncoder();
    let cancelled = false;
    const stream = new ReadableStream({
      async start(controller) {
        const emit = (event, data) => { if (!cancelled) controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); };
        try {
          const result = await generateResult(stage => emit('progress', { stage }));
          emit(result.previewPlan ? 'preview' : 'plan', result);
        } catch (error) { emit('error', { error: error.message }); }
        finally { if (!cancelled) controller.close(); }
      },
      cancel() { cancelled = true; },
    });
    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' } });
  }
  try { return json(await generateResult(() => {})); }
  catch (error) { return json({ error: error.message }, 502); }
}

export async function authorizedBoardApp(req, env, name, pending = null) {
  const json = (body, status) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  if (typeof name !== 'string' || !/^[a-z0-9-]{1,100}$/.test(name)) return json({ error: 'App required' }, 400);
  if (env.LEARN_DB && name.startsWith('repo-')) {
    const { repositoryAccess } = await import('./repositories.js');
    return repositoryAccess(req, env, name);
  }
  if (env.LEARN_DB && /^canvas-[a-f0-9]{8}$/.test(name)) {
    const { canvasAccess } = await import('./canvases.js');
    return canvasAccess(req, env, name, pending);
  }
  const url = new URL(req.url); url.pathname = `/api/apps/${encodeURIComponent(name)}`; url.search = '';
  const headers = new Headers();
  for (const name of ['cookie', 'authorization', 'x-small-workspace']) if (req.headers.has(name)) headers.set(name, req.headers.get(name));
  const access = await env.CONTROL_PLANE.fetch(new Request(url, { headers, redirect: 'manual' }));
  if (!access.ok) return json({ error: 'Sign in with access to this app to explain on canvas.' }, access.status >= 400 ? access.status : 401);
  if (!(access.headers.get('content-type') || '').includes('application/json')) return json({ error: 'Sign in first.' }, 401);
  const app = await access.json();
  if (app.name !== name || app.hosting === 'aws') return json({ error: 'Canvas explanations are available in regular Small dev only.' }, 403);
  return app;
}

// The canvas search bar: one query, one source (YouTube, arXiv, Wikipedia),
// the five best results. See learn-search.js. The Exa key stays a worker secret.
export async function canvasSearch(req, env) {
  if (req.method !== 'GET') return Response.json({ error: 'GET required' }, { status: 405 });
  const url = new URL(req.url);
  const access = await authorizedBoardApp(req, env, url.searchParams.get('app'));
  if (access instanceof Response) return access;
  try { return Response.json(await searchCanvasSource(url.searchParams.get('source') || '', url.searchParams.get('q') || '', env)); }
  catch (error) { return Response.json({ error: error.message }, { status: 400 }); }
}

// The article itself, for a card or the reader. Fetched here rather than in the
// browser for two reasons measured against the live API: Wikimedia 403s a
// request with no User-Agent, which a browser cannot set, and the section
// endpoint sends no CORS header at all.
export async function wikiArticle(req, env) {
  if (req.method !== 'GET') return Response.json({ error: 'GET required' }, { status: 405 });
  const url = new URL(req.url);
  const access = await authorizedBoardApp(req, env, url.searchParams.get('app'));
  if (access instanceof Response) return access;
  try { return Response.json(await fetchWikipediaArticle(url.searchParams.get('title') || '')); }
  catch (error) { return Response.json({ error: error.message }, { status: 400 }); }
}

// Browser PDF rendering uses an authenticated, fixed-host fetch, never a model URL.
// POST stores a learner's own PDF; GET serves either that or an arXiv paper, so
// the reader is identical whichever a canvas block points at.
export async function paperFetch(req, env) {
  if (!['GET', 'POST'].includes(req.method)) return Response.json({ error: 'GET or POST required' }, { status: 405 });
  const url = new URL(req.url);
  const access = await authorizedBoardApp(req, env, url.searchParams.get('app'));
  if (access instanceof Response) return access;
  const identity = paperIdentity(access);
  if (req.method === 'POST') {
    // This route was read-only until now, so it had no CSRF guard to inherit.
    if (req.headers.has('origin') && req.headers.get('origin') !== url.origin) return Response.json({ error: 'Invalid origin' }, { status: 403 });
    let file;
    try { file = (await req.formData()).get('file'); } catch { return Response.json({ error: 'Send the PDF as multipart form data' }, { status: 400 }); }
    if (!file || typeof file === 'string') return Response.json({ error: 'No file received' }, { status: 400 });
    try { return Response.json(await putUploadedPaper(env, identity, file)); }
    catch (error) { return Response.json({ error: error.message }, { status: 400 }); }
  }
  const raw = url.searchParams.get('id');
  if (isUploadedPaperId(raw)) {
    try {
      const { bytes } = await readUploadedPaper(env, identity, raw);
      return new Response(bytes, { headers: { 'Content-Type': 'application/pdf', 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' } });
    } catch (error) { return Response.json({ error: error.message }, { status: 404 }); }
  }
  let id; try { id = arxivId(raw); } catch (error) { return Response.json({ error: error.message }, { status: 400 }); }
  try {
    return new Response(await fetchArxivPdf(id), { headers: { 'Content-Type': 'application/pdf', 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) { return Response.json({ error: error.message }, { status: 502 }); }
}

// A learner's verdict on a tutor-shown moment: one org-scoped UPDATE. The
// same CSRF stance as the other POST routes here.
export async function momentFeedback(req, env) {
  if (req.method !== 'POST') return Response.json({ error: 'POST required' }, { status: 405 });
  let body;
  try { body = await req.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const access = await authorizedBoardApp(req, env, body.app);
  if (access instanceof Response) return access;
  if (req.headers.has('origin') && req.headers.get('origin') !== new URL(req.url).origin) return Response.json({ error: 'Invalid origin' }, { status: 403 });
  try { return Response.json(await setMomentFeedback(env, access.org, body.momentId, body.accepted)); }
  catch (error) { return Response.json({ error: error.message }, { status: 400 }); }
}

// A card reporting its video gone (the thumbnail 404ed). A signal, not a
// verdict: derived data is pruned, the moment log is untouched, and a false
// report costs one re-index.
export async function videoGone(req, env) {
  if (req.method !== 'POST') return Response.json({ error: 'POST required' }, { status: 405 });
  let body;
  try { body = await req.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const access = await authorizedBoardApp(req, env, body.app);
  if (access instanceof Response) return access;
  const videoId = videoIdFrom(body.videoId);
  if (!videoId) return Response.json({ error: 'Invalid video' }, { status: 400 });
  return Response.json(await pruneVideo(env, videoId));
}

// Images dropped on the canvas. Same shape as paperFetch: POST stores this
// learner's image, GET serves it back to the same identity. The card renders
// from the browser's IndexedDB copy; this copy is for the tutor's ask path.
export async function mediaFetch(req, env) {
  if (!['GET', 'POST'].includes(req.method)) return Response.json({ error: 'GET or POST required' }, { status: 405 });
  const url = new URL(req.url);
  const access = await authorizedBoardApp(req, env, url.searchParams.get('app'));
  if (access instanceof Response) return access;
  const identity = paperIdentity(access);
  if (req.method === 'POST') {
    if (req.headers.has('origin') && req.headers.get('origin') !== url.origin) return Response.json({ error: 'Invalid origin' }, { status: 403 });
    let file;
    try { file = (await req.formData()).get('file'); } catch { return Response.json({ error: 'Send the image as multipart form data' }, { status: 400 }); }
    if (!file || typeof file === 'string') return Response.json({ error: 'No file received' }, { status: 400 });
    try { return Response.json(await putUploadedMedia(env, identity, file)); }
    catch (error) { return Response.json({ error: error.message }, { status: 400 }); }
  }
  const id = url.searchParams.get('id');
  if (!isUploadedMediaId(id)) return Response.json({ error: 'Not an uploaded image id' }, { status: 400 });
  try {
    const { bytes, contentType } = await readUploadedMedia(env, identity, id);
    return new Response(bytes, { headers: { 'Content-Type': contentType, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) { return Response.json({ error: error.message }, { status: 404 }); }
}
