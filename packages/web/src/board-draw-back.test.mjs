// The Tutor on a native Whiteboard (docs/features/tldraw-removal.md, workstream T): the planner, applying a draw-back in one
// update, rich-media cards beside the board, Remove explanation, and Ask about selection over sketch marks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  applyDrawBack, boardShapesIn, clearExplanation, explainBoard, explanationBounds, explanationCount, hasExplanation, placeCards, planDrawBack, sketchRect,
} from './board-draw-back.js';
import {
  LIMITS, cardIdFor, cardsOf, countAssistant, digestOf, explanationIdFor, legacyState, mayPersist, validateDrawBack, validateSketch, withSketch,
} from './whiteboard-sketch.js';
import { areaTarget, cropBinding } from './area-crop.js';

const photo = { src: 'data:image/jpeg;base64,AAAA', url: 'https://www.pexels.com/photo/1', alt: 'A prism', width: 960, height: 640, photographer: 'Ada' };
const operations = {
  graph: { op: 'interactive_plot', id: 'g1', renderer: 'desmos', concept: 'sigmoid', expressions: [{ id: 'a', expression: 'y=x' }] },
  three_d: { op: 'show_3d_model', concept: 'Fox', modelUrl: 'https://example.test/fox.glb', description: 'A fox' },
  video: { op: 'generate_video', id: 'v1', prompt: 'A prism', aspectRatio: '16:9', caption: 'Light through a prism' },
  scene: { op: 'generate_3d_animation', id: 's1', concept: 'frustum', caption: 'A frustum', scene: { objects: [], animations: [] } },
};
const plan = () => ({
  blocks: [
    { kind: 'text', text: 'The sigmoid squashes any number into the range from zero to one, which is why it is used for probabilities.', fromObjectId: null },
    { kind: 'equation', text: 'σ(x) = 1 / (1 + e^-x)', fromObjectId: null },
    { kind: 'diagram', text: 'The data flow', nodes: [{ id: 'a', label: 'Input' }, { id: 'b', label: 'Linear' }, { id: 'c', label: 'Sigmoid' }], edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'a', to: 'c' }, { from: 'c', to: 'a' }], fromObjectId: null },
    { kind: 'code', text: 'def sigmoid(x):\n    return 1 / (1 + math.exp(-x))', fromObjectId: null },
    { kind: 'image', text: 'A prism splits white light.', photo, annotations: [{ kind: 'box', x: 0.1, y: 0.1, w: 0.3, h: 0.2 }, { kind: 'path', points: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }] }, { kind: 'label', x: 0.6, y: 0.6, text: 'beam' }], fromObjectId: null },
    { kind: 'graph', text: 'Drag k to sharpen the curve.', operation: operations.graph, fromObjectId: null },
    { kind: 'three_d', text: 'A fox to orbit.', operation: operations.three_d, fromObjectId: null },
    { kind: 'video', text: 'Light bends in a prism.', operation: operations.video, fromObjectId: null },
    { kind: 'scene', text: 'A camera frustum.', operation: operations.scene, fromObjectId: null },
  ],
});
const board = (extra = {}) => ({ id: 'w1', type: 'whiteboard', title: 'Sigmoid board', dx: 0, dy: 0, ...extra });
const learnerSketch = () => ({ strokes: [{ id: 's1', tool: 'pen', color: '#37352f', width: 2, points: [{ x: 10, y: 10 }, { x: 80, y: 60 }] }], shapes: [{ id: 'box', kind: 'rect', x1: 100, y1: 20, x2: 220, y2: 90, text: 'Mine' }], items: [] });
const draw = (options = {}) => planDrawBack({ plan: plan(), snapshot: { runId: 'w1', lessonId: 'learn-freeform' }, whiteboardId: 'w1', requestKey: 'answer-1', sketch: learnerSketch(), ...options });
const layout = (box = { x: 100, y: 200, w: 640, h: 420 }, extra = {}) => ({ box, taken: [], nextFlowTop: 900, column: 560, ...extra });
const all = marks => [...marks.strokes, ...marks.shapes, ...marks.items];

test('the planner draws every plan kind as assistant marks that pass the contract, and only the rich ones become cards', () => {
  const back = draw();
  assert.deepEqual(validateDrawBack(back), { ok: true, errors: [] });
  assert.equal(back.explanationId, explanationIdFor('w1', 'answer-1'));
  assert.deepEqual(validateSketch(back.marks), { ok: true, errors: [] });
  const marks = all(back.marks);
  assert.ok(marks.length > 12);
  assert.ok(marks.every(m => m.author === 'assistant' && m.explanationId === back.explanationId && /^explanation-/.test(m.objectId)));
  assert.equal(new Set(marks.map(m => m.id)).size, marks.length, 'ids are unique');
  assert.deepEqual(back.cards.map(c => c.kind), ['image', 'graph', 'three_d', 'video', 'scene']);
  assert.deepEqual(back.cards.map(c => c.objectId), [`explanation-${back.explanationId}-4`, `explanation-${back.explanationId}-5`, `explanation-${back.explanationId}-6`, `explanation-${back.explanationId}-7`, `explanation-${back.explanationId}-8`]);
  assert.match(back.spoken, /^The sigmoid squashes/);
  // the new column lies to the right of the learner's own drawing, which is untouched
  const learnerRight = Math.max(...learnerSketch().shapes.map(s => s.x2));
  assert.ok(back.marks.items.every(i => i.x > learnerRight) && back.marks.shapes.every(s => Math.min(s.x1, s.x2) > learnerRight));
  // equations and code keep their lines, prose is wrapped
  assert.equal(back.marks.items.find(i => i.objectId.endsWith('-3') && i.kind === 'text').text, 'def sigmoid(x):\n    return 1 / (1 + math.exp(-x))');
  assert.equal(back.marks.items.find(i => i.objectId.endsWith('-3')).mode, 'code');
  assert.ok(back.marks.items.find(i => i.objectId.endsWith('-0')).text.split('\n').every(row => row.length <= 52));
});

test('the same request plans the same marks and ids, and an empty board starts inside the card', () => {
  assert.deepEqual(draw(), draw());
  assert.notEqual(draw({ requestKey: 'answer-2' }).explanationId, draw().explanationId);
  const fresh = draw({ sketch: undefined });
  assert.ok(Math.min(...fresh.marks.items.map(i => i.x)) >= 24 && fresh.marks.items.every(i => i.x < 600));
});

test('a diagram: boxes with labels, straight arrows between neighbours, curves below the row for skips and loops', () => {
  const back = draw(), at = i => back.marks.shapes.filter(s => s.objectId.endsWith(`-${i}`));
  const diagram = at(2), boxes = diagram.filter(s => s.kind === 'rect');
  assert.deepEqual(boxes.map(b => b.text), ['Input', 'Linear', 'Sigmoid']);
  const arrows = diagram.filter(s => s.kind === 'arrow'), curves = diagram.filter(s => s.kind === 'curve');
  assert.equal(arrows.length, 2);
  assert.ok(arrows.every(a => a.y1 === a.y2 && a.x2 > a.x1), 'neighbours point rightward');
  assert.equal(curves.length, 2);
  const skip = curves.find(c => c.startHead === 'arrow'), loopBack = curves.find(c => c.endHead === 'arrow');
  assert.ok(skip.x2 > skip.x1 === false && loopBack.x2 < loopBack.x1, 'both bow below because they run right to left');
  assert.ok(curves.every(c => c.y1 === boxes[0].y2 && c.y2 === c.y1));
  // a cycle with a hub still lays out every node
  const cyc = planDrawBack({ plan: { blocks: [{ kind: 'diagram', text: 'Loop', nodes: [{ id: 'x', label: 'X' }, { id: 'y', label: 'Y' }], edges: [{ from: 'x', to: 'y' }, { from: 'y', to: 'x' }, { from: 'x', to: 'x' }], fromObjectId: null }] }, whiteboardId: 'w1', requestKey: 'k' });
  assert.equal(cyc.marks.shapes.filter(s => s.kind === 'rect').length, 2);
  assert.equal(cyc.marks.shapes.filter(s => ['arrow', 'curve'].includes(s.kind)).length, 2, 'a self loop is not drawn');
});

test('an image keeps its marks on a frame of the picture and the picture becomes a card with its credit', () => {
  const back = draw(), image = back.cards[0];
  assert.deepEqual([image.block.src, image.block.alt, image.block.credit, image.block.mode, image.block.variant], [photo.src, 'A prism', { photographer: 'Ada', url: photo.url }, 'search', 0]);
  const frame = back.marks.shapes.find(s => s.objectId.endsWith('-4') && s.dash === 'dashed');
  assert.ok(frame && frame.x2 - frame.x1 === 480 && frame.y2 - frame.y1 === 320, 'scaled like the old board: 480 by 320 at most');
  assert.deepEqual(back.marks.shapes.filter(s => s.objectId.endsWith('-4')).map(s => s.kind), ['rect', 'rect']);
  assert.equal(back.marks.strokes.length, 1);
  assert.ok(back.marks.strokes[0].points.every(p => p.x >= frame.x1 && p.y >= frame.y1 && p.y <= frame.y2));
  assert.ok(back.marks.items.some(i => i.text === 'beam' && i.color === '#b42318'));
  const figure = planDrawBack({ plan: { blocks: [{ kind: 'paper_figure', text: 'Figure 2 of the paper.', figure: { src: 'data:image/png;base64,AAAA', alt: 'Fig 2', width: 400, height: 300 }, paper: { title: 'Attention', id: '1706.03762', pdfUrl: 'https://arxiv.org/pdf/1706.03762' }, citation: { page: 3, label: 'Figure 2' }, fromObjectId: null }] }, whiteboardId: 'w1', requestKey: 'p' });
  assert.equal(figure.cards[0].kind, 'paper_figure');
  assert.match(figure.cards[0].block.caption, /Source: Attention, arXiv:1706.03762, PDF page 3, Figure 2/);
  assert.equal(figure.cards[0].block.credit, undefined);
  assert.equal(figure.marks.items[0].meta.paper.page, 3);
});

test('a plan with an unsupported block draws nothing and says which', () => {
  const bad = { blocks: [{ kind: 'text', text: 'ok', fromObjectId: null }, { kind: 'poem', text: 'x', fromObjectId: null }] };
  assert.throws(() => planDrawBack({ plan: bad, whiteboardId: 'w1', requestKey: 'k' }), /unsupported block \(poem\), so nothing was drawn/);
});

test('a block that points at a source gets one connector from the existing drawing to its new place', () => {
  const back = planDrawBack({ plan: { blocks: [{ kind: 'text', text: 'Because the box says so.', fromObjectId: 'o1' }] }, whiteboardId: 'w1', requestKey: 'k', sketch: learnerSketch() });
  const arrow = back.marks.shapes.find(s => s.id.endsWith(':source'));
  assert.ok(arrow && arrow.color === '#b42318' && arrow.author === 'assistant');
  assert.ok(arrow.x1 > 220 && arrow.x2 > arrow.x1);
});

test('applying: one update puts the marks on the sketch and the media in cards beside the board, linked and typed for the card renderer', () => {
  const back = draw(), blocks = [board(), { id: 'other', type: 'note' }];
  const result = applyDrawBack({ blocks, whiteboardId: 'w1', drawBack: back, sketch: learnerSketch(), layout: layout() });
  assert.equal(result.reason, null);
  const [wb, , ...made] = result.blocks;
  assert.equal(wb.sketch.shapes.length, learnerSketch().shapes.length + back.marks.shapes.length);
  assert.equal(countAssistant(wb.sketch), all(back.marks).length);
  assert.equal(explanationCount(wb.sketch), all(back.marks).length);
  assert.equal(result.blocks.length, 7, 'the board, the other card and five new cards');
  assert.deepEqual(made.map(b => b.type), ['image', 'graph', 'model3d', 'video', 'scene']);
  assert.deepEqual(made.map(b => b.mode), ['search', undefined, undefined, 'generate', undefined]);
  for (const card of made) {
    assert.equal(card.whiteboardLink.whiteboard, 'w1');
    assert.equal(card.whiteboardLink.explanationId, back.explanationId);
    assert.equal(card.id, cardIdFor(card.whiteboardLink));
  }
  assert.equal(cardsOf(result.blocks, 'w1').length, 5);
  assert.deepEqual([made[1].spec, made[2].modelUrl, made[3].operation, made[4].operation], [operations.graph, operations.three_d.modelUrl, operations.video, operations.scene]);
  assert.deepEqual(validateSketch(wb.sketch), { ok: true, errors: [] });
});

test('replay: the same draw-back applied twice, after a reload, or from a retried request leaves one set of marks and one card each', () => {
  const blocks = [board()], first = applyDrawBack({ blocks, whiteboardId: 'w1', drawBack: draw(), sketch: learnerSketch(), layout: layout() });
  const twice = applyDrawBack({ blocks: first.blocks, whiteboardId: 'w1', drawBack: draw(), layout: layout() });
  assert.equal(twice.blocks.length, first.blocks.length);
  assert.deepEqual(twice.added, []);
  assert.deepEqual(twice.blocks[0].sketch, first.blocks[0].sketch, 'the marks are not added again');
  // a reload: the saved blocks come back from JSON, the plan arrives again (a new request with the same key)
  const reloaded = JSON.parse(JSON.stringify(first.blocks));
  const again = applyDrawBack({ blocks: reloaded, whiteboardId: 'w1', drawBack: draw(), layout: layout({ x: 700, y: 50, w: 300, h: 300 }) });
  assert.equal(again.blocks.length, 6);
  assert.deepEqual(again.blocks.slice(1), reloaded.slice(1), 'an existing card is not replaced or moved');
  assert.equal(again.blocks.filter(b => b.whiteboardLink).length, 5);
  // a different request on the same board adds its own cards, never touching the first one's
  const other = applyDrawBack({ blocks: first.blocks, whiteboardId: 'w1', drawBack: draw({ requestKey: 'answer-2' }), layout: layout() });
  assert.equal(other.blocks.length, 11);
  assert.equal(countAssistant(other.blocks[0].sketch), 2 * countAssistant(first.blocks[0].sketch));
});

test('a viewer who may not edit never writes: the same blocks come back', () => {
  const blocks = [board()], back = draw();
  for (const permit of [{ readOnly: true }, { canEdit: false }, { readOnly: true, canEdit: false }]) {
    const result = applyDrawBack({ blocks, whiteboardId: 'w1', drawBack: back, sketch: learnerSketch(), permit, layout: layout() });
    assert.equal(result.blocks, blocks);
    assert.equal(result.reason, 'read-only');
    assert.equal(blocks[0].sketch, undefined);
    assert.equal(clearExplanation({ blocks, whiteboardId: 'w1', sketch: learnerSketch(), permit }).blocks, blocks);
  }
  assert.equal(applyDrawBack({ blocks: [], whiteboardId: 'gone', drawBack: back }).reason, 'no-board');
  assert.equal(mayPersist({ canEdit: true }), true);
});

test('the board moved or resized while the plan was coming: cards go beside it where it is now, and stack instead of overlapping', () => {
  const back = draw(), column = 560;
  const place = box => applyDrawBack({ blocks: [board()], whiteboardId: 'w1', drawBack: back, sketch: learnerSketch(), layout: layout(box) }).blocks.slice(1);
  const drawnX = card => (column - { image: 480, graph: 560, model3d: 560, video: 560, scene: 560 }[card.type]) / 2 + card.dx;
  for (const box of [{ x: 100, y: 200, w: 640, h: 420 }, { x: -800, y: 3000, w: 900, h: 700 }]) {
    const cards = place(box);
    assert.ok(cards.every(card => drawnX(card) === box.x + box.w + 40), `every card starts 40 px right of the board at ${box.x}`);
    assert.ok(cards.every(card => Number.isInteger(card.dx) && Number.isInteger(card.dy)));
  }
  const [a, b] = placeCards(['graph', 'graph'], layout({ x: 0, y: 0, w: 400, h: 300 }));
  assert.equal(a.dy + 900, 0, 'the first card is level with the top of the board');
  assert.equal(b.dy + 900 + 520 + 20, 520 + 24, 'the second sits below the first, not over it');
  // something already beside the board pushes the card below it
  const [c] = placeCards(['graph'], layout({ x: 0, y: 0, w: 400, h: 300 }, { taken: [{ x: 440, y: 0, w: 560, h: 520 }] }));
  assert.equal(c.dy + 900, 520 + 24);
  // no measured layout: the cards join the end of the column, still linked
  const unplaced = applyDrawBack({ blocks: [board()], whiteboardId: 'w1', drawBack: back, sketch: learnerSketch() }).blocks.slice(1);
  assert.ok(unplaced.every(card => card.dx === 0 && card.dy === 0 && card.whiteboardLink));
});

test('a legacy board keeps its snapshot untouched and records where the sketch came from; both count toward the size', () => {
  const snapshot = { document: { store: { 'shape:a': { id: 'shape:a' } }, schema: { schemaVersion: 2 } }, session: {} }, before = JSON.stringify(snapshot);
  const legacy = board({ snapshot });
  assert.equal(legacyState(legacy), 'unconverted');
  const result = applyDrawBack({ blocks: [legacy], whiteboardId: 'w1', drawBack: draw(), sketch: learnerSketch(), layout: layout() });
  assert.equal(result.blocks[0].snapshot, snapshot);
  assert.equal(JSON.stringify(snapshot), before);
  assert.equal(legacyState(result.blocks[0]), 'converted');
  assert.ok(result.blocks[0].sketch.shapes.some(s => s.id === 'box'), 'the derived sketch the card showed is what gets saved');
  // too large: nothing changes, the merged drawing is handed back for memory, and the snapshot is never offered for removal
  const huge = applyDrawBack({ blocks: [legacy], whiteboardId: 'w1', drawBack: draw(), sketch: learnerSketch(), layout: layout(), boardChars: LIMITS.boardChars - 10 });
  assert.equal(huge.reason, 'board-too-large');
  assert.equal(huge.blocks[0], legacy);
  assert.equal(huge.blocks.length, 1);
  assert.ok(huge.sketch.items.length > 0);
});

test('Remove explanation takes the Tutor marks only, one explanation or all, and leaves the cards beside the board', () => {
  const first = applyDrawBack({ blocks: [board()], whiteboardId: 'w1', drawBack: draw(), sketch: learnerSketch(), layout: layout() });
  const second = applyDrawBack({ blocks: first.blocks, whiteboardId: 'w1', drawBack: draw({ requestKey: 'answer-2' }), layout: layout() });
  const one = clearExplanation({ blocks: second.blocks, whiteboardId: 'w1', explanationId: draw().explanationId });
  assert.equal(countAssistant(one.blocks[0].sketch), countAssistant(first.blocks[0].sketch), 'only the second explanation is left');
  assert.equal(hasExplanation(one.sketch, draw().explanationId), false);
  assert.equal(hasExplanation(one.sketch, draw({ requestKey: 'answer-2' }).explanationId), true);
  const none = clearExplanation({ blocks: second.blocks, whiteboardId: 'w1' });
  assert.deepEqual(none.blocks[0].sketch, learnerSketch(), 'the learner’s own marks are exactly what was there');
  assert.equal(none.blocks.length, second.blocks.length, 'no card is removed');
  // drawing again after removal finds its cards already there
  const redo = applyDrawBack({ blocks: none.blocks, whiteboardId: 'w1', drawBack: draw(), layout: layout() });
  assert.equal(redo.blocks.length, none.blocks.length);
  assert.ok(hasExplanation(redo.sketch, draw().explanationId));
});

test('the explanation can be focused: its bounds cover its marks and nothing of the learner’s', () => {
  const applied = applyDrawBack({ blocks: [board()], whiteboardId: 'w1', drawBack: draw(), sketch: learnerSketch(), layout: layout() });
  const bounds = explanationBounds(applied.sketch, draw().explanationId);
  assert.ok(bounds.x > 220 && bounds.x2 > bounds.x && bounds.y2 > bounds.y);
  assert.equal(explanationBounds(learnerSketch(), 'exp:none'), null);
});

test('Ask about selection on sketch marks: the crop goes through the frame, the canvas zoom and the view; learner and Tutor marks are named', () => {
  const applied = applyDrawBack({ blocks: [board()], whiteboardId: 'w1', drawBack: draw(), sketch: learnerSketch(), layout: layout() });
  const sketch = applied.sketch;
  // the card is drawn at 2x canvas zoom, its frame 600 wide logically, shown fitted at half scale
  const frame = { rect: { left: 1000, top: 500, width: 1200, height: 800 }, w: 600 }, view = { s: 0.5, tx: 10, ty: 20 };
  const crop = { left: 1000 + (10 + 90 * 0.5) * 2, top: 500 + (20 + 15 * 0.5) * 2, width: (230 - 90) * 0.5 * 2, height: (95 - 15) * 0.5 * 2 };
  const rect = sketchRect(crop, frame, view);
  assert.deepEqual([rect.x, rect.y, rect.x2, rect.y2].map(Math.round), [90, 15, 230, 95]);
  const shapes = boardShapesIn(() => ({ sketch, frame, view }))(crop);
  assert.deepEqual(shapes, [{ id: 'box', type: 'rect', text: 'Mine', author: 'learner' }]);
  // a crop over the Tutor's column names assistant marks with their text
  const box = explanationBounds(sketch, draw().explanationId), at = { x: box.x, y: box.y, x2: box.x + 300, y2: box.y + 40 };
  const tutor = boardShapesIn(() => ({ sketch, frame: { rect: { left: 0, top: 0, width: 600, height: 400 }, w: 600 }, view: { s: 1, tx: 0, ty: 0 } }))({ left: at.x, top: at.y, width: at.x2 - at.x, height: at.y2 - at.y });
  assert.ok(tutor.length > 0 && tutor.every(s => s.author === 'assistant'));
  assert.ok(tutor.some(s => /sigmoid squashes/.test(s.text)));
  assert.deepEqual(boardShapesIn(() => null)(crop), [], 'a board not mounted names nothing');
  // the area-crop binding is the unchanged seam: the same { id, type, text, author } list
  const binding = cropBinding({ id: 'w1', type: 'whiteboard', title: 'Sigmoid board' }, { left: 0, top: 0, width: 50, height: 50 }, { card: { left: 0, top: 0, width: 100, height: 100 }, shapes });
  assert.deepEqual(binding.shapes, shapes);
  assert.match(areaTarget({ id: 'area:s', bindings: [binding] }).text, /Selected shapes: rect "Mine" \(learner, box\)/);
});

test('an id-less stroke is still named in a selection, by a stable derived id', () => {
  const bare = { strokes: [{ tool: 'pen', points: [{ x: 5, y: 5 }, { x: 25, y: 25 }] }], shapes: [], items: [] };
  const ask = boardShapesIn(() => ({ sketch: bare, frame: { rect: { left: 0, top: 0, width: 100, height: 100 }, w: 100 }, view: { s: 1, tx: 0, ty: 0 } }));
  const [a] = ask({ left: 0, top: 0, width: 50, height: 50 }), [b] = ask({ left: 0, top: 0, width: 50, height: 50 });
  assert.equal(a.type, 'stroke');
  assert.match(a.id, /^stroke:[0-9a-f]{10}$/);
  assert.equal(a.id, b.id);
});

// ---------- the request ----------
const host = (over = {}) => {
  const calls = [], stages = [];
  return { calls, stages, args: {
    whiteboardId: 'w1', title: 'Sigmoid board', appName: 'app', question: 'What is flat?', answer: 'The tails.', onStage: s => stages.push(s),
    getSketch: () => learnerSketch(), exists: () => false, permit: () => ({}),
    request: async (body, progress) => { calls.push(body); progress('Writing'); return { plan: plan() }; }, ...over,
  } };
};

test('explaining: stages in order, the board plan request carries no tldraw target, and the result is a valid draw-back', async () => {
  const { args, calls, stages } = host();
  const back = await explainBoard(args);
  assert.deepEqual(stages, ['Planning explanation', 'Writing', 'Drawing']);
  assert.equal(calls.length, 1);
  assert.deepEqual([calls[0].app, calls[0].snapshot.target, calls[0].snapshot.runId, calls[0].snapshot.lessonContext.topic, calls[0].question], ['app', null, 'w1', 'Sigmoid board', 'What is flat?']);
  assert.deepEqual(validateDrawBack(back), { ok: true, errors: [] });
  assert.equal(back.explanationId, explanationIdFor('w1', digestOf(['What is flat?', 'The tails.'])), 'without a key, the question and answer name the request');
  assert.equal((await explainBoard({ ...args, key: 'exchange-7' })).explanationId, explanationIdFor('w1', 'exchange-7'));
});

test('explaining for a viewer who may not edit, or for an explanation already on the board, makes no paid request', async () => {
  const readOnly = host({ permit: () => ({ readOnly: true }) });
  await assert.rejects(explainBoard(readOnly.args), /read-only for you/);
  assert.equal(readOnly.calls.length, 0);
  const there = host({ exists: id => id === explanationIdFor('w1', 'k') });
  const result = await explainBoard({ ...there.args, key: 'k' });
  assert.deepEqual([result.reason, result.drawBack], ['already-drawn', null]);
  assert.equal(there.calls.length, 0);
});

test('rights lost while the plan was coming: nothing is drawn; a clarification question is surfaced; a bad plan fails before drawing', async () => {
  let editable = true;
  const slow = host({ permit: () => ({ readOnly: !editable }), request: async () => { editable = false; return { plan: plan() }; } });
  await assert.rejects(explainBoard(slow.args), /read-only for you/);
  const ask = host({ request: async () => ({ plan: { needsClarification: true, summary: 'Which curve do you mean?', blocks: [] } }) });
  await assert.rejects(explainBoard(ask.args), /Which curve do you mean\?/);
  const bad = host({ request: async () => ({ plan: { blocks: [{ kind: 'poem', text: 'x', fromObjectId: null }] } }) });
  await assert.rejects(explainBoard(bad.args), /unsupported block/);
});

test('the module is pure: no DOM, network, tldraw or editor imports', () => {
  const source = readFileSync(new URL('./board-draw-back.js', import.meta.url), 'utf8');
  const imports = [...source.matchAll(/from\s+'([^']+)'/g)].map(m => m[1]);
  assert.deepEqual(imports.sort(), ['./learn-board-layout.js', './whiteboard-sketch.js']);
  assert.doesNotMatch(source, /\b(window|document|fetch|localStorage)\b/);
});

test('withSketch on the applied board keeps the block fields the card owns', () => {
  const kept = board({ narration: 'Say it', marked: { x: 1, y: 2, w: 3, h: 4 }, title: 'T' });
  const result = applyDrawBack({ blocks: [kept], whiteboardId: 'w1', drawBack: draw(), sketch: learnerSketch(), layout: layout() });
  assert.deepEqual([result.blocks[0].narration, result.blocks[0].marked, result.blocks[0].title], ['Say it', kept.marked, 'T']);
  assert.deepEqual(result.blocks[0], withSketch(kept, result.sketch));
});
