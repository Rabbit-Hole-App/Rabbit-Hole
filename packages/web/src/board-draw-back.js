// The Tutor's answer on a native Whiteboard (docs/features/tldraw-removal.md, workstream T). Pure: no DOM, no network, no
// tldraw. It turns a board plan into the contract's draw-back { explanationId, marks, cards }, applies it to the board's
// blocks in one state update (marks on the board's sketch, graph / 3D / video / scene / image as ordinary cards beside it),
// answers Ask about selection from the sketch, and removes an explanation. It replaces the drawing half of the retired
// learn-board-renderer.js; the request to the server (learn-board-request.js) is passed in by the host.
import {
  cardsOf, contentBounds, countAssistant, digestOf, explanationIdFor, insertLinkedCards, cardIdFor, listsOf, markBounds, marksIn,
  mayPersist, normalizeSketch, removeExplanation, saveVerdict, toSketch, validateDrawBack, withSketch, withStrokeIds,
} from './whiteboard-sketch.js';
import { connector, overlaps } from './learn-board-layout.js';

// The plan kinds the planner understands. Anything else fails closed: a generated plan is never reinterpreted as text.
export const PLAN_KINDS = ['text', 'equation', 'diagram', 'code', 'image', 'paper_figure', 'video', 'graph', 'three_d', 'scene'];
// Default card sizes (LearningBlocks BLOCK_TYPES width / height or typicalHeight), used only to place a card before it is measured.
export const CARD_SIZE = { graph: { w: 560, h: 520 }, three_d: { w: 560, h: 460 }, scene: { w: 560, h: 480 }, video: { w: 560, h: 440 }, image: { w: 480, h: 450 }, paper_figure: { w: 480, h: 450 } };

const INK = '#37352f', BLUE = '#2383e2', RED = '#b42318', YELLOW = '#f59e0b', GREY = '#6b7280';
const WIDTH = 460, LINE = 24, PITCH = 200, NODE = { w: 160, h: 100 };
const wrap = text => text.split('\n').flatMap(line => line.match(/.{1,52}(?:\s|$)|\S{1,52}/g)?.map(part => part.trim()) || ['']).join('\n');
const widest = text => Math.max(...text.split('\n').map(row => row.length));

// ---------- the planner ----------
function shift(marks, dx, dy) {
  return {
    strokes: marks.strokes.map(m => ({ ...m, points: m.points.map(p => ({ x: p.x + dx, y: p.y + dy })) })),
    shapes: marks.shapes.map(m => ({ ...m, x1: m.x1 + dx, x2: m.x2 + dx, y1: m.y1 + dy, y2: m.y2 + dy })),
    items: marks.items.map(m => ({ ...m, x: m.x + dx, y: m.y + dy })),
  };
}
const rectOf = b => ({ x: b.x, y: b.y, w: b.x2 - b.x, h: b.y2 - b.y });
const holds = (box, point) => point.x >= box.x && point.x <= box.x + box.w && point.y >= box.y && point.y <= box.y + box.h;

// The card a rich plan object becomes: { kind, objectId, text, operation, block }. `block` is the saved block without id, type,
// link or place; the host adds those (insertLinkedCards, placement).
function cardFor(block, objectId) {
  const op = block.operation, title = String(op?.title || op?.concept || block.text).slice(0, 80);
  const common = { kind: block.kind, objectId, text: block.text, operation: op };
  if (block.kind === 'graph') return { ...common, block: { title, brief: block.text, spec: op, state: {} } };
  if (block.kind === 'three_d') return { ...common, block: { title, brief: op.description || block.text, modelUrl: op.modelUrl, camera: op.camera || {}, autoRotate: !!op.autoRotate, animation: op.animation || { autoplay: false }, animationTime: 0 } };
  if (block.kind === 'video') return { ...common, block: { mode: 'generate', title, src: '', caption: op.caption || block.text, operation: op, status: 'idle' } };
  if (block.kind === 'scene') return { ...common, block: { title, brief: block.text, operation: op, status: 'idle', modelUrl: '', camera: {}, autoRotate: false, animation: { autoplay: true }, animationTime: 0 } };
  const photo = block.photo || block.figure;
  const entry = { src: photo.src, alt: photo.alt, ...(block.photo ? { credit: { photographer: photo.photographer, url: photo.url } } : {}) };
  const source = block.paper ? `\n\nSource: ${block.paper.title}, arXiv:${block.paper.id}, PDF page ${block.citation.page}, ${block.citation.label}` : '';
  return { ...common, block: { mode: 'search', title, ...entry, caption: block.text + source, variants: [entry], variant: 0 } };
}

// plan: the validated board plan { blocks }; snapshot: { runId, lessonId }; sketch: what the board holds now (the new column
// goes to the right of it); requestKey: stable per Tutor request (the answer's id, else a digest of question and answer).
// Returns the draw-back; `spoken` is the text offered for narration. Throws on a kind it cannot draw, before anything is made.
export function planDrawBack({ plan, snapshot = {}, whiteboardId, requestKey, sketch }) {
  const unknown = plan.blocks.find(block => !PLAN_KINDS.includes(block.kind));
  if (unknown) throw new Error(`The explanation contains an unsupported block (${String(unknown.kind).slice(0, 40)}), so nothing was drawn.`);
  const explanationId = explanationIdFor(whiteboardId, requestKey);
  const existing = normalizeSketch(sketch), have = contentBounds(existing);
  const objectIds = plan.blocks.map((_, i) => `explanation-${explanationId}-${i}`);
  const occupied = listsOf(existing).flatMap(([list, marks]) => marks.map(mark => markBounds(mark, list))).filter(Boolean).map(rectOf);
  const anchor = have ? rectOf(have) : { x: 0, y: 0, w: 640, h: 480 };
  const centre = { x: anchor.x + anchor.w / 2, y: anchor.y + anchor.h / 2 };
  const columnX = have ? have.x2 + 80 : 24;
  let columnY = have ? have.y : 24;
  const out = { strokes: [], shapes: [], items: [] }, cards = [];
  plan.blocks.forEach((block, i) => {
    const objectId = objectIds[i], local = { strokes: [], shapes: [], items: [] };
    const photo = block.photo || block.figure;
    const meta = {
      kind: block.kind, label: block.text.slice(0, 80), runId: snapshot.runId, lessonId: snapshot.lessonId,
      relatedObjectIds: objectIds.filter(id => id !== objectId),
      originalText: ((block.kind === 'image' ? `${block.text}\nPhoto description: ${block.photo.alt}\nPhoto by ${block.photo.photographer} on Pexels.\nAnnotations: ${JSON.stringify(block.annotations || [])}`
        : block.kind === 'diagram' ? `${block.text}\nNodes: ${block.nodes.map(n => `${n.id}: ${n.label}`).join('; ')}\nConnections: ${block.edges.map(e => `${e.from} -> ${e.to}`).join('; ')}` : block.text)
        + (block.paper ? `\nSource: ${block.paper.title}, arXiv:${block.paper.id}, PDF page ${block.citation.page}, ${block.citation.label}` : '')).slice(0, 1000),
      ...(block.paper ? { paper: { ...block.paper, page: block.citation.page } } : {}),
    };
    let n = 0;
    const add = (list, mark) => { local[list].push({ ...mark, id: `${objectId}:${n}`, author: 'assistant', explanationId, objectId, meta: n ? { kind: block.kind, label: meta.label } : meta }); n++; };
    const text = (x, y, words, extra = {}) => { add('items', { kind: 'text', x, y, w: extra.w ?? WIDTH, text: words, color: INK, level: 'body', ...extra }); return (words.split('\n').length) * LINE; };
    if (['text', 'equation', 'code'].includes(block.kind)) {
      // Equations and code keep their exact lines; only prose is wrapped.
      const words = block.kind === 'text' ? wrap(block.text) : block.text;
      text(0, 0, words, { w: block.kind === 'text' ? WIDTH : Math.max(120, widest(words) * 9 + 16), ...(block.kind === 'equation' ? { color: BLUE } : {}), ...(block.kind === 'code' ? { mode: 'code' } : {}) });
    } else if (block.kind === 'diagram') {
      const head = text(0, 0, wrap(block.text));
      const pending = block.nodes.map(node => node.id), order = [];
      // Topological order so edges point rightward (cycles keep the given order).
      while (pending.length) {
        const next = pending.find(id => !block.edges.some(e => e.to === id && e.from !== id && pending.includes(e.from))) ?? pending[0];
        order.push(next); pending.splice(pending.indexOf(next), 1);
      }
      const nodes = order.map(id => block.nodes.find(node => node.id === id)), top = head + LINE;
      nodes.forEach((node, j) => add('shapes', { kind: 'rect', x1: j * PITCH, y1: top, x2: j * PITCH + NODE.w, y2: top + NODE.h, color: BLUE, fill: BLUE, width: 2, text: node.label }));
      const mid = top + NODE.h / 2, bottom = top + NODE.h;
      for (const edge of block.edges) {
        const from = nodes.findIndex(node => node.id === edge.from), to = nodes.findIndex(node => node.id === edge.to);
        if (from === to) continue; // ponytail: a self-loop is not drawn; the sketch has no loop arrow
        const edgeMark = { color: BLUE, width: 2 };
        if (to === from + 1) add('shapes', { kind: 'arrow', x1: from * PITCH + NODE.w + 4, y1: mid, x2: to * PITCH - 4, y2: mid, ...edgeMark });
        // Every other edge arcs below the row: a curve bows to the right of its direction, so a forward skip is drawn from the
        // target back to the source with the head at its start.
        else if (to < from) add('shapes', { kind: 'curve', x1: from * PITCH + NODE.w / 2, y1: bottom, x2: to * PITCH + NODE.w / 2, y2: bottom, endHead: 'arrow', ...edgeMark });
        else add('shapes', { kind: 'curve', x1: to * PITCH + NODE.w / 2, y1: bottom, x2: from * PITCH + NODE.w / 2, y2: bottom, startHead: 'arrow', endHead: 'none', ...edgeMark });
      }
    } else {
      // Image, paper figure, graph, 3D, video and scene: the picture or object is a card beside the board; the board keeps the
      // words, and an image's marks are drawn on a frame of the picture's proportions.
      const head = text(0, 0, wrap(block.text));
      if (photo) {
        const scale = Math.min(1, 480 / photo.width, 320 / photo.height), w = photo.width * scale, h = photo.height * scale, y0 = head + 16;
        if (block.annotations?.length) {
          add('shapes', { kind: 'rect', x1: 0, y1: y0, x2: w, y2: y0 + h, color: GREY, width: 1, dash: 'dashed' });
          for (const mark of block.annotations) {
            const x = mark.x * w, y = y0 + mark.y * h;
            if (['box', 'circle', 'highlight'].includes(mark.kind)) add('shapes', { kind: mark.kind === 'circle' ? 'ellipse' : 'rect', x1: x, y1: y, x2: x + mark.w * w, y2: y + mark.h * h, color: mark.kind === 'highlight' ? YELLOW : RED, ...(mark.kind === 'highlight' ? { fill: YELLOW } : {}), width: 2 });
            else if (mark.kind === 'arrow') add('shapes', { kind: 'arrow', x1: x, y1: y, x2: mark.x2 * w, y2: y0 + mark.y2 * h, color: RED, width: 2 });
            else if (mark.kind === 'path') add('strokes', { tool: 'pen', color: RED, width: 3, points: mark.points.map(p => ({ x: p.x * w, y: y0 + p.y * h })) });
            else text(x, y, mark.text, { color: RED, w: 160 });
          }
        }
      }
      cards.push(cardFor(block, objectId));
    }
    const at = contentBounds(local), size = rectOf(at);
    const position = { x: columnX, y: columnY, w: size.w, h: size.h };
    const placed = shift(local, columnX - at.x, columnY - at.y);
    columnY += size.h + 48;
    const route = block.fromObjectId && connector(anchor, position, occupied.filter(b => !holds(b, centre)));
    for (const list of Object.keys(out)) out[list].push(...placed[list]);
    if (route) out.shapes.push({ kind: 'arrow', x1: route.start.x, y1: route.start.y, x2: route.end.x, y2: route.end.y, color: RED, width: 2, id: `${objectId}:source`, author: 'assistant', explanationId, objectId, meta: { kind: block.kind, label: meta.label } });
    occupied.push(position);
  });
  const drawBack = { explanationId, marks: out, cards, spoken: plan.blocks.map(item => item.text).filter(Boolean).join(' ').slice(0, 3800) };
  const check = validateDrawBack(drawBack);
  if (!check.ok) throw new Error(`The explanation could not be drawn: ${check.errors[0]}`);
  return drawBack;
}

// ---------- applying it ----------
export const hasExplanation = (sketch, explanationId) => listsOf(sketch).some(([, marks]) => marks.some(mark => mark.explanationId === explanationId));
// The rectangle the explanation covers, for the editor's focus (focusView), or null when it has no marks.
export function explanationBounds(sketch, explanationId) {
  return contentBounds(Object.fromEntries(listsOf(sketch).map(([list, marks]) => [list, marks.filter(mark => mark.explanationId === explanationId)])));
}

// Where each new card goes so that it sits beside the whiteboard, as { dx, dy } in the cards' own position fields (a card's
// drawn place is its flow place in the column plus dx, dy). layout is read by the host at the moment of applying, never when the
// request started, so a board moved or resized meanwhile still gets its cards beside it: { box: the board as drawn
// {x, y, w, h}, taken: every other drawn card {x, y, w, h}, nextFlowTop: where a card appended to the column would sit in the
// flow, column: 560 }. Without a layout the cards join the end of the column (offset 0, 0): still linked, just not beside.
export function placeCards(kinds, layout) {
  if (!layout?.box || !Number.isFinite(layout.nextFlowTop)) return kinds.map(() => ({ dx: 0, dy: 0 }));
  const column = layout.column ?? 560, placed = [];
  let flowTop = layout.nextFlowTop;
  return kinds.map(kind => {
    const size = CARD_SIZE[kind], x = layout.box.x + layout.box.w + 40;
    let y = layout.box.y;
    for (let pass = 0; pass < 20; pass++) {
      const hit = [...(layout.taken || []), ...placed].find(other => overlaps({ x, y, ...size }, other));
      if (!hit) break;
      y = hit.y + hit.h + 24;
    }
    placed.push({ x, y, ...size });
    const at = { dx: Math.round(x - (size.w > column ? 0 : (column - size.w) / 2)), dy: Math.round(y - flowTop) };
    flowTop += size.h + 20; // ponytail: the next appended card's flow top assumes this card's default height; the host may re-place it once measured
    return at;
  });
}

// One state update for the whole draw-back: `blocks` is the canvas's blocks as they are now (the host passes the latest, from a
// functional state update), `sketch` the board's sketch as the card shows it (derived in memory for an unconverted legacy board),
// `permit` { readOnly, canEdit } the viewer's rights now. Never writes for a viewer who may not edit (the same array comes
// back). Replaying the same draw-back adds nothing: marks of the explanation are not added twice and a card's id is a function
// of its link. A save that does not fit changes nothing and says why (`reason`); `sketch` is then the merged drawing for the
// card to hold in memory with tooLarge, exactly as an over-size board always did.
export function applyDrawBack({ blocks, whiteboardId, drawBack, sketch, permit, layout, boardChars }) {
  const board = blocks.find(block => block.id === whiteboardId && block.type === 'whiteboard');
  if (!board) return { blocks, reason: 'no-board' };
  if (!mayPersist(permit)) return { blocks, reason: 'read-only' };
  const check = validateDrawBack(drawBack);
  if (!check.ok) throw new Error(`The explanation could not be drawn: ${check.errors[0]}`);
  const base = withStrokeIds(sketch ?? board.sketch ?? {});
  const merged = hasExplanation(base, drawBack.explanationId) ? base : { strokes: [...base.strokes, ...(drawBack.marks.strokes || [])], shapes: [...base.shapes, ...(drawBack.marks.shapes || [])], items: [...base.items, ...(drawBack.marks.items || [])] };
  const link = card => ({ whiteboard: whiteboardId, explanationId: drawBack.explanationId, objectId: card.objectId });
  const have = new Set(blocks.map(block => block.id));
  const fresh = (drawBack.cards || []).filter(card => !have.has(cardIdFor(link(card))));
  const at = placeCards(fresh.map(card => card.kind), layout);
  const linked = fresh.map((card, i) => ({ kind: card.kind, whiteboardLink: link(card), block: { ...card.block, ...at[i] } }));
  const cardChars = JSON.stringify(linked).length;
  const verdict = saveVerdict({ block: board, sketch: merged, boardChars: (boardChars ?? JSON.stringify(blocks).length) + cardChars });
  if (!verdict.ok) return { blocks, sketch: merged, reason: verdict.reason, verdict };
  const inserted = insertLinkedCards(blocks.map(block => (block === board ? withSketch(board, merged) : block)), linked);
  return { blocks: inserted.blocks, sketch: merged, added: inserted.added, reason: null, verdict };
}

// Remove explanation: the Tutor's marks go (one explanation, or all), the learner's and the lesson's stay; the cards beside the
// board are ordinary cards and stay. Same rights rule as any write.
export function clearExplanation({ blocks, whiteboardId, sketch, permit, explanationId }) {
  const board = blocks.find(block => block.id === whiteboardId && block.type === 'whiteboard');
  if (!board) return { blocks, reason: 'no-board' };
  if (!mayPersist(permit)) return { blocks, reason: 'read-only' };
  const kept = removeExplanation(sketch ?? board.sketch ?? {}, explanationId);
  return { blocks: blocks.map(block => (block === board ? withSketch(board, kept) : block)), sketch: kept, reason: null };
}
export const explanationCount = countAssistant;
export const cardsBeside = cardsOf;

// ---------- asking the Tutor ----------
// What the card's `explain` does: guard, request, plan. It draws nothing itself; the host applies the draw-back.
//   getSketch(): the sketch now. exists(id): the board already holds that explanation. permit(): { readOnly, canEdit } now.
//   request: requestBoardExplanation (learn-board-request.js). key: the answer's id when the host has one.
// Resolves to the draw-back, or { explanationId, drawBack: null, reason: 'already-drawn' } before any paid request is made.
export async function explainBoard({ whiteboardId, title, appName, question, answer, key, onStage, getSketch, exists, permit, request }) {
  const denied = () => new Error('This board is read-only for you, so the tutor cannot draw on it.');
  if (!mayPersist(permit())) throw denied();
  const requestKey = key ?? digestOf([question, answer]), explanationId = explanationIdFor(whiteboardId, requestKey);
  if (exists(explanationId)) return { explanationId, drawBack: null, reason: 'already-drawn' };
  const snapshot = { lessonId: 'learn-freeform', runId: whiteboardId, method: 'lesson', target: null, relatedObjects: [], lessonContext: { topic: (title || 'Whiteboard').slice(0, 150), currentStage: 'explanation', recentExplanations: [] } };
  onStage?.('Planning explanation');
  const { plan } = await request({ app: appName, snapshot, question, answer }, stage => onStage?.(stage));
  if (plan.needsClarification) throw new Error(plan.summary);
  if (!mayPersist(permit())) throw denied(); // the plan takes a while; the viewer's rights may have changed
  onStage?.('Drawing');
  return planDrawBack({ plan, snapshot, whiteboardId, requestKey, sketch: getSketch() });
}

// ---------- Ask about selection ----------
// frame: { rect: the drawing surface's client rect (left, top, width), w: its logical width }, so the canvas's own zoom is
// divided out; view: the card's { s, tx, ty }. Returns the crop as a rectangle in sketch space.
export function sketchRect(screen, frame, view) {
  const zoom = frame.rect.width / frame.w || 1;
  const a = toSketch({ x: (screen.left - frame.rect.left) / zoom, y: (screen.top - frame.rect.top) / zoom }, view);
  const b = toSketch({ x: (screen.left + screen.width - frame.rect.left) / zoom, y: (screen.top + screen.height - frame.rect.top) / zoom }, view);
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), x2: Math.max(a.x, b.x), y2: Math.max(a.y, b.y) };
}
// registerBoardAsk(id, { shapesIn: boardShapesIn(() => ({ sketch, frame, view })), explain }): the signature is unchanged.
export const boardShapesIn = state => screen => {
  const now = state();
  return now?.frame?.rect ? marksIn(withStrokeIds(now.sketch ?? {}), sketchRect(screen, now.frame, now.view)) : [];
};
