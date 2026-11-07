// Ask about selection (EXP-T28): the target text claims "the attached image shows that area" only for a picture the model request really
// carries. readLearnSource decides what rides; settleAreaPicture rewrites the claim to match. Doubles only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appendCanvasTarget, isAreaTarget, readLearnSource, settleAreaPicture } from '../src/learn-ask-context.js';

const CLAIM = 'The learner drew a rectangle on the canvas and asks about what is inside it; the attached image shows that area.';
const target = { id: 'area:abc', kind: 'Canvas selection', title: 'Selected area', text: `${CLAIM}\nCards inside or touching it:\nNotebook "n" (notebook, revision r1): crop covers {}.\n  Not in the picture: the live notebook pane is omitted. Saved cells follow below.\nSaved content of these cards:\nSaved cells of "n":\n[code 1] print(1)` };
const app = { org: 'o', name: 'a', email: 'x@example.com' };
const image = { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AA==' } };
const bag = () => ({ extraBlocks: [], papers: [], articles: new Map(), foundVideos: new Map(), videoContext: null });
const read = { uploadedMediaAsImage: async () => ({ title: 'selected-area.png', image }), uploadedPaperAsDocument: async () => ({ id: 'up', title: 'P', document: { type: 'text', text: 'page' } }), readArxivPaper: async () => { throw new Error('no network'); } };
const model = async (body, overrides = {}) => {
  const blocks = bag();
  const source = await readLearnSource({}, body, app, blocks, { ...read, ...overrides });
  return { source, blocks, text: appendCanvasTarget('{}', settleAreaPicture(body.canvas_target, body, source)) };
};

test('the web claim line and the server rewrite agree on the sentence', () => {
  const web = readFileSync(new URL('../../web/src/area-crop.js', import.meta.url), 'utf8');
  assert.ok(web.includes('the attached image shows that area'));
  assert.ok(readFileSync(new URL('../src/learn-ask-context.js', import.meta.url), 'utf8').includes("'the attached image shows that area'"));
  assert.equal(isAreaTarget(target), true);
  assert.equal(isAreaTarget({ id: 'block-1' }), false);
});

test('a successful capture: the image block rides and the claim stays, with the card report beside it', async () => {
  const { blocks, text } = await model({ message: 'what is here', image_context: { id: 'media:0123456789ab' }, canvas_target: target });
  assert.deepEqual(blocks.extraBlocks, [image]);
  assert.ok(text.includes('the attached image shows that area'));
  assert.ok(text.includes('Saved cells of'), 'the saved content rides too');
  assert.ok(text.indexOf('Not in the picture') < text.indexOf('Saved content of these cards'), 'the coverage line comes before the excerpt, so the cap cuts the excerpt first');
});

test('report only: no picture was sent, so the text says it was not attached and the report still rides', async () => {
  const { blocks, text } = await model({ message: 'what is here', canvas_target: target });
  assert.deepEqual(blocks.extraBlocks, []);
  assert.ok(!text.includes('the attached image shows that area'));
  assert.match(text, /its picture was not attached \(none was sent\)/);
  assert.ok(text.includes('Not in the picture: the live notebook pane is omitted'));
});

test('a failed media read does not fail the question: the report rides and the text says the picture could not be read', async () => {
  const { source, blocks, text } = await model({ message: 'what is here', image_context: { id: 'media:0123456789ab' }, canvas_target: target }, { uploadedMediaAsImage: async () => { throw new Error('expired'); } });
  assert.equal(source, null);
  assert.deepEqual(blocks.extraBlocks, []);
  assert.match(text, /its picture was not attached \(it could not be read\)/);
  assert.ok(text.includes('[code 1] print(1)'));
});

test('a plain dropped image that is not an area still fails when it cannot be read', async () => {
  await assert.rejects(model({ message: 'm', image_context: { id: 'media:0123456789ab' }, canvas_target: { id: 'block-1', kind: 'Image', text: 'Image' } }, { uploadedMediaAsImage: async () => { throw new Error('expired'); } }), /Could not read that image/);
});

test('an open paper outranks the area picture: the picture is not attached and the text says why; the report still rides', async () => {
  const { source, blocks, text } = await model({ message: 'compare', paper_context: { id: 'upload:0123456789ab', page: 1 }, image_context: { id: 'media:0123456789ab' }, canvas_target: target }, { uploadedPaperAsDocument: async () => ({ id: 'up', title: 'P', document: { type: 'text', text: 'page' } }) });
  assert.ok(source.paper);
  assert.ok(!blocks.extraBlocks.includes(image));
  assert.match(text, /its picture was not attached \(a paper page is open and outranks it\)/);
  assert.ok(text.includes('Saved cells of'));
});

test('the single-Paper region path is unchanged: the page region image is the picture and the claim stays', async () => {
  const selection = { region: { x: 0, y: 0, w: 1, h: 1 }, preview: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==' };
  const paperTarget = { ...target, text: `${CLAIM}\nPaper "P" (revision r1), page 1.` };
  const body = { message: 'what is here', paper_context: { id: 'upload:0123456789ab', page: 1, selection }, canvas_target: paperTarget };
  const { source, text } = await model(body);
  assert.deepEqual(source.paper.selectedRegion, selection.region);
  assert.ok(text.includes('the attached image shows that area'));
});

test('a target that already says no picture, and a non-area target, are never rewritten', () => {
  const none = { ...target, text: 'The learner drew a rectangle on the canvas and asks about what is inside it; no picture of it could be attached, so work from the card details below.' };
  assert.equal(settleAreaPicture(none, {}, null), none);
  const card = { id: 'block-1', kind: 'Explanation', text: CLAIM };
  assert.equal(settleAreaPicture(card, {}, null), card);
  assert.equal(settleAreaPicture(null, {}, null), null);
});
