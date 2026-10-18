// Annotation connectors (docs/features/inline-ai-editor.md §8): an explanation's arrow is marked by metadata on the
// link (kind: 'annotation'), never told apart by how it looks, and it never becomes a domain edge for any reader of the
// board's links. These pass on 5b3552a5 too: they pin behaviour the review asked to verify.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { buildContext, createContextCache, freezeTarget, staleness } from './inline-ai-context.js';
import { explainTx, applyTx } from './inline-ai-apply.js';
import { treeBoard, withBoxes } from './inline-ai-fixtures.js';
import { canvasObjects } from './dive.js';
import { outlineFrom } from './learn-outline-model.js';

const build = (board, selection) => {
  const cache = createContextCache();
  const target = freezeTarget(board, selection);
  return { target, cache, context: buildContext(board, target, { cache, boardKey: 'b1' }) };
};
const structure = context => context.connections.filter(link => link.kind === 'connection').map(link => [link.id, link.from, link.to]).sort();
const related = (context, relation) => context.related.filter(entry => entry.relation === relation).map(entry => entry.id).sort();
const withLink = (board, link) => withBoxes({ ...board, links: [...board.links, link] });
const arrow = { id: 'a1', from: 'n7', fromSide: 'right', to: 'n23', toSide: 'left', color: '#6b7280', route: 'straight', head: true };

test('annotation: identified by kind on the link, never by its look', () => {
  const base = withBoxes(treeBoard());
  const before = build(base, ['n23']);
  const frozen = { ...before.target, prints: before.context.prints };
  // Solid, no dash anywhere: still an annotation because the link says so.
  const marked = build(withLink(base, { ...arrow, kind: 'annotation' }), ['n23']);
  assert.deepEqual(structure(marked.context), structure(before.context));
  assert.deepEqual(related(marked.context, 'sibling'), related(before.context, 'sibling'));
  assert.equal(staleness(frozen, withLink(base, { ...arrow, kind: 'annotation' }), createContextCache(), 'b1').relations, false, 'adding one does not change the relations a preview is checked against');
  // A dashed-looking link with no kind is a stored connection: structure.
  const dashed = build(withLink(base, { ...arrow, dash: 'dashed' }), ['n23']);
  assert.ok(structure(dashed.context).some(([id]) => id === 'a1'));
  assert.equal(staleness(frozen, withLink(base, { ...arrow, dash: 'dashed' }), createContextCache(), 'b1').relations, true);
});

test('annotation: an explanation leaves the diagram meaning as it was, around the target and elsewhere', () => {
  const board = withBoxes(treeBoard());
  const target = freezeTarget(board, ['n23']);
  const tx = explainTx({ requestId: 'r1', text: 'Node 23 is a child of node 4.', frozen: target, board, boxes: { target: board.boxes.n23, obstacles: Object.values(board.boxes) }, size: { w: 260, h: 60 } });
  assert.equal(tx.links.length, 1);
  assert.equal(tx.links[0].kind, 'annotation');
  const after = withBoxes(applyTx(board, tx));
  for (const id of ['n23', 'n4', 'n1', 'n3']) {
    const was = build(board, [id]).context, now = build(after, [id]).context;
    assert.deepEqual(structure(now), structure(was), `${id}: same stored connections`);
    assert.deepEqual(related(now, 'sibling'), related(was, 'sibling'), `${id}: same siblings`);
    assert.deepEqual(related(now, 'connected'), related(was, 'connected'), `${id}: same connected objects`);
    assert.equal(now.prints.relations, was.prints.relations, `${id}: same relations fingerprint`);
  }
  assert.deepEqual(after.links.filter(link => link.kind !== 'annotation'), board.links, 'the domain edges themselves are untouched');
});

test('annotation: Dive and the owned Tutor outline do not read links at all', () => {
  const board = withBoxes(treeBoard());
  const annotated = withLink(board, { ...arrow, kind: 'annotation' });
  // Dive's object count (dive.js canvasObjects: what makes a hole worth keeping) takes no links.
  assert.equal(canvasObjects(annotated), canvasObjects(board));
  // The Tutor's outline on an owned canvas is built from cards only (learn-outline-model.js).
  assert.deepEqual(outlineFrom(annotated.blocks || []), outlineFrom(board.blocks || []));
});

// Every module that reads a board's `links`, and what it does with them. A new reader fails this check until it is
// listed here after its annotation handling is reviewed. Matches that are not a board's links say so.
const READERS = {
  'web/src/inline-diagram-layout.js': 'annotation links remain protected dependencies but never influence structural graph ranks',
  'control-plane/src/agents/learn-inline.js': 'tool schema describes proposed graph links; shared validator rejects annotation connectors as structural targets',
  'web/src/inline-native-plan.js': 'explicit selected appearance/layout only; no inferred graph structure',
  'web/src/inline-native-tools.js': 'explicit selected native appearance; no inferred graph structure',
  'web/src/inline-tool-plan.js': 'rejects selected annotation connectors for structural edits; keeps incident annotations as protected deletion dependencies',
  'web/src/inline-diagram-edit.js': 'bounded explicit graph edit helper; caller rejects annotation selection, dependent annotations prevent implicit deletion',
  'web/src/inline-annotation-tools.js': 'writes and edits native annotations; does not promote them to structural edges',
  'web/src/canvas-search-index.js': 'local literal Search indexes stored annotation labels; never model context',
  'web/src/use-canvas-search.jsx': 'Search resolves already-authorized canvas reference metadata, not model context',
  'web/src/AdaptiveCanvas.jsx': 'draws them (dashed from kind), selects, styles, copies, cascades deletes; no structure',
  'web/src/inline-ai-context.js': 'the context builder: kind annotation is never structure (tested above)',
  'web/src/inline-ai-apply.js': 'writes the annotation connector with kind annotation',
  'web/src/InlineAiEditor.jsx': 'finds a target among them; no structure',
  'web/src/inline-ai-fixtures.js': 'test boards',
  'web/src/inline-diagram.js': 'writes a new diagram\'s own connectors; reads none',
  'web/src/inline-placement.js': 'the region style: connector route and colour, annotations skipped',
  'web/src/canvas-semantics.js': 'the shared snapshot: kind annotation is source annotation, never a connector (its own tests)',
  'web/src/curious-context.js': 'recent edits: a new or changed link marks its two ends as edited; no structure',
  'web/src/canvas-persist.js': 'saves them as one of the board lists',
  'web/src/learn-style-panel.js': 'styles selected links',
  'control-plane/src/learn-boards.js': 'copies the list on fork; no reading',
  'control-plane/src/canvases.js': 'the empty board',
  'control-plane/src/dives.js': 'its "links" are canvas_dives rows (the Dive tree and map), not board links',
  'web/src/map-memory.js': 'a helper named links over code references, not board links',
  'web/src/RepositoryGraph.jsx': 'graph edges of a repository scene, not board links',
  'web/src/SourcesDisclosure.jsx': 'a comment about web links',
  'web/src/agent/AgentBar.jsx': 'agent result links, not board links',
  'web/src/agent/ResultSheet.jsx': 'agent result links, not board links',
  'web/src/card-open.js': 'a comment about web links',
  'web/src/graph-renderers.js': 'a Desmos option',
  'web/src/landing/docs-content.js': 'documentation link lists',
  'web/src/landing/docs.jsx': 'documentation link lists',
  'web/src/LearnPage.jsx': 'the Links tab and canvas references, not board links',
  'web/src/LinksPanel.jsx': 'canvas references (links between canvases), not board links',
  'web/src/PanelHeader.jsx': 'the Links tab id',
  'web/src/chat-panels.js': 'the Links tab id in a comment',
  'web/src/comments/MemberBoardPage.jsx': 'canvas references, not board links',
};
test('annotation: every reader of board links is known; the Tutor, map and shared Ask readers are not among them', () => {
  const root = new URL('../../', import.meta.url);
  const found = [];
  for (const dir of ['web/src', 'control-plane/src']) {
    for (const name of readdirSync(new URL(dir, root), { recursive: true })) {
      const file = `${dir}/${String(name).replace(/\\/g, '/')}`;
      if (!/\.(js|jsx)$/.test(file) || /\.test\.|nanogpt/.test(file)) continue;
      if (/\.links\b|\blinks\s*[:=,}]|'links'/.test(readFileSync(new URL(file, root), 'utf8'))) found.push(file);
    }
  }
  assert.deepEqual(found.sort(), Object.keys(READERS).sort());
  for (const file of ['web/src/dive.js', 'web/src/Dive.jsx', 'web/src/LearnTutor.jsx', 'web/src/learn-tutor-actions.js', 'web/src/learn-outline-model.js', 'web/src/MapMemory.jsx', 'web/src/MapInspector.jsx', 'web/src/learn-minimap.js', 'web/src/CanvasMinimap.jsx', 'web/src/learn-next-steps.js', 'control-plane/src/learn-shared-ask.js', 'control-plane/src/learn-tutor-handoff.js', 'control-plane/src/learn-next-steps-routes.js']) {
    assert.ok(!found.includes(file), `${file} does not read board links`);
  }
});
