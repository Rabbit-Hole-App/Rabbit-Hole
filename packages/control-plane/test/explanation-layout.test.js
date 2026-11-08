// EXP-13 card layout v2 (docs/features/explain.md "Card layout v2", owner decisions 2026-11-08): prose, visual, prose (optionally visual, prose, up to three); one to three
// visuals, each related to the question or the prose around it; a budget of prose only (asked for 600, refused above 700); no folded sections on new cards;
// rh-illustration fences made with Recraft before the card is returned (three attempts; a picture that still fails loses its fence, never the card),
// priced and settled on the real ledger. Saved cards keep reading as before. The image provider is a double: nothing is sent or paid.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { explanationLayoutProblem, explanationProblem, explanationProseChars, explanationChars, markdownVisuals, contentWords } from '../src/learn-primitives.js';
import { fieldText } from '../src/explanation-interactions.js';
import { requiredVisualProblem } from '../src/explanation-visuals.js';
import { generateArtifact } from '../src/learn-artifact.js';
import { generateRoadmapCard, quoteRoadmapCard } from '../src/roadmap/roadmap-generate.js';
import { FIGURE_ATTEMPTS, FIGURES_MAX, FIGURE_MODEL } from '../src/explanation-figures.js';
import { fileRefSources } from '../src/file-refs.js';
import { withUsage, noteUsageIdentity } from '../src/learn-usage.js';
import { EXPLANATION_BUDGET } from '../src/chat-depth.js';
import { cycleSpec, diagramFence, illustrationFence, withVisual } from './explanation-layout-fixture.js';
import { learnDb } from './learn-grade-fixture.js';

const scripted = (...replies) => { const seen = []; return { seen, callModel: async (env, body) => { seen.push(body); const [name, input] = replies[Math.min(seen.length, replies.length) - 1]; return Response.json({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `c${seen.length}`, name, input }] }); } }; };
const direct = (block, options = {}, env = {}, args = 'Why does ice float?') => { const m = scripted(['make_explanation', block], ['make_explanation', block]); return generateArtifact(env, { command: 'explanation', args }, { callModel: m.callModel, ...options }).then(out => ({ out, m })); };
const access = { org: 'o', actorUserId: 'u1', actorEmail: 'a@x.test', boardId: 'b1', boardOwnerEmail: 'a@x.test', role: 'owner', payerUserId: 'u1' };
const ref = { authorizationId: 'auth_00000001', resultId: 'res_00000001', resultVersion: 1 };
const record = (over = {}) => ({ cardId: 'card_0000001', stepId: 'step_0000001', proposalId: 'prop_0000001', proposalVersion: 1, format: 'explanation', stepTitle: 'Why ice floats', stepGoal: 'Explain density.', passageText: 'Ice is less dense than water.', language: 'en', depth: 'standard', retry: 0, ...over });

const ICE = 'Ice floats because ice is less dense than water.';
const PIC = illustrationFence({ id: 'ice', prompt: 'An ice cube floating in a glass of water, side view', alt: 'An ice cube floating in water', caption: 'Most of the ice sits under the water' });
const card = (body, title = 'Why ice floats') => ({ title, body });

// ---- layout ---------------------------------------------------------------------------------------------------------------------------------------------
test('a card with no visual is refused with explanation_missing_visual', () => {
  assert.match(explanationLayoutProblem(card(ICE), 'Why does ice float?') || '', /^explanation_missing_visual:/);
  const tableOnly = card(`${ICE}\n\n| Phase | Density |\n| --- | --- |\n| Ice | 0.92 |\n\nSo it floats.`);
  assert.match(explanationLayoutProblem(tableOnly) || '', /^explanation_missing_visual:/, 'a table is not a visual');
});

test('every visual needs prose before and after it (explanation_layout); a table alone is not prose between two visuals', () => {
  const fence = diagramFence(cycleSpec('Ice floats'));
  for (const [name, body] of [['visual first', `${fence}\n\n${ICE}`], ['visual last', `${ICE}\n\n${fence}`], ['two visuals touching', `${ICE}\n\n${fence}\n\n${fence}\n\nSo it floats.`],
    ['only a table between', `${ICE}\n\n${fence}\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\n${fence}\n\nSo ice floats.`]]) {
    assert.match(explanationLayoutProblem(card(body)) || '', /^explanation_layout: a visual needs prose before and after it/, name);
  }
  assert.equal(explanationLayoutProblem(card(`${ICE}\n\n${fence}\n\nSo ice floats.`)), null, 'prose, visual, prose');
  assert.equal(explanationLayoutProblem(card(`${ICE}\n\n${fence}\n\nIce is lighter.\n\n${PIC}\n\nSo ice floats.`)), null, 'prose, diagram, prose, illustration, prose');
});

test('three visuals pass (owner 2026-11-08); four visuals, or three pictures, are refused (explanation_too_many_visuals)', () => {
  const fence = diagramFence(cycleSpec('Ice floats'));
  const three = `${ICE}\n\n${fence}\n\nIce one.\n\n${fence}\n\nIce two.\n\n${PIC}\n\nIce three.`;
  assert.equal(explanationLayoutProblem(card(three)), null, 'diagram, diagram, picture');
  assert.match(explanationLayoutProblem(card(`${three}\n\n${fence}\n\nIce four.`)) || '', /^explanation_too_many_visuals: the card has 4 visuals/);
  assert.match(explanationLayoutProblem(card(`${ICE}\n\n${PIC}\n\nIce one.\n\n${PIC}\n\nIce two.\n\n${PIC}\n\nIce three.`)) || '', /^explanation_too_many_visuals: the card has 3 pictures; keep at most two/);
});

test('a new card has no folded sections: `more` is refused by the schema, so the one repair sees it', async () => {
  const { out, m } = await direct({ ...card(withVisual(ICE)), more: [{ label: 'Example', text: 'A cube.' }] });
  assert.equal(out.result, 'validation_error');
  assert.equal(m.seen.length, 2, 'one call and its one repair');
  assert.match(m.seen[1].messages.at(-1).content[0].content, /unexpected field; allowed fields: title, visuals, body/);
  assert.equal(m.seen[0].tools.find(t => t.name === 'make_explanation').input_schema.properties.more, undefined);
});

// ---- prose-only budget -------------------------------------------------------------------------------------------------------------------------------------
test('only prose counts: a long table, the title, a diagram and an illustration add nothing; 700 passes and 701 fails; the request asks for 600', async () => {
  const { target, hard } = EXPLANATION_BUDGET;
  const after = 'So ice floats.';
  const build = n => card(`Ice ${'é'.repeat(n - 'Ice '.length - 1 - after.length)}\n\n| Phase | ${'x'.repeat(2000)} |\n| --- | --- |\n| Ice | 0.92 |\n\n${PIC}\n\n${after}`, 'T'.repeat(120));
  assert.equal(explanationProseChars(build(hard)), hard);
  assert.ok(explanationChars(build(hard)) > 2000, 'the old inclusive count would have been far over');
  assert.equal(explanationProblem(build(hard), 'overview', 'ice'), null);
  assert.match(explanationProblem(build(hard + 1), 'deep', 'ice') || '', /^explanation_over_budget: the card has 701 characters of prose/);
  const { m } = await direct(build(hard));
  assert.match(m.seen[0].tools.find(t => t.name === 'make_explanation').description, new RegExp(`at most ${target} characters of prose`));
});

// ---- relevance -----------------------------------------------------------------------------------------------------------------------------------------------
test('visual relevance: related passes; a visual naming nothing from the question or its neighbouring prose fails; case and plural variants match', () => {
  const related = card(`${ICE}\n\n${diagramFence(cycleSpec('Ice and water'))}\n\nSo it floats.`);
  assert.equal(explanationLayoutProblem(related, 'Why does ice float?'), null);
  const unrelated = card(`${ICE}\n\n${diagramFence(cycleSpec('Stock market'))}\n\nSo it floats.`);
  assert.match(explanationLayoutProblem(unrelated, 'Why does ice float?') || '', /^explanation_visual_unrelated: the diagram "Stock market" names nothing from the question or the text around it/);
  const picture = card(`${ICE}\n\n${illustrationFence({ caption: 'A red sports car', alt: 'A car on a road' })}\n\nSo it floats.`);
  assert.match(explanationLayoutProblem(picture, 'Why does ice float?') || '', /^explanation_visual_unrelated: the illustration "A red sports car"/);
  // only the question names it: still related
  assert.equal(explanationLayoutProblem(card(`It sits on top.\n\n${diagramFence(cycleSpec('Density'))}\n\nThat is all.`), 'What is density?'), null);
  // case and simple plurals: Cells/cell, Boxes/box, Batteries/battery
  for (const [title, prose] of [['CELLS', 'A cell divides.'], ['Boxes', 'Each box holds one.'], ['Batteries', 'A battery stores charge.']]) {
    assert.equal(explanationLayoutProblem(card(`${prose}\n\n${diagramFence(cycleSpec(title))}\n\nDone.`), 'unrelated words'), null, title);
  }
  assert.deepEqual([...contentWords('The Cells and the boxes')], ['cell', 'box'], 'stop words removed, plurals stripped');
});

test('the relevance failure goes through the one repair on the direct path', async () => {
  const unrelated = card(`${ICE}\n\n${diagramFence(cycleSpec('Stock market'))}\n\nSo it floats.`);
  const m = scripted(['make_explanation', unrelated], ['make_explanation', card(withVisual(ICE))]);
  const out = await generateArtifact({}, { command: 'explanation', args: 'Why does ice float?' }, { callModel: m.callModel });
  assert.deepEqual([out.result, out.repaired, m.seen.length], ['artifact', true, 2]);
  assert.match(m.seen[1].messages.at(-1).content[0].content, /explanation_visual_unrelated/);
});

test('a broken illustration fence is named for the repair (explanation_bad_illustration)', () => {
  const bad = card(`${ICE}\n\n\`\`\`rh-illustration\n{"version":1,"id":"ice","prompt":"p","alt":"a"}\n\`\`\`\n\nSo it floats.`);
  assert.match(explanationProblem(bad, 'standard', 'ice') || '', /explanation_bad_illustration: the rh-illustration "ice" needs a caption/);
  const twice = card(`${ICE}\n\n${PIC}\n\nIce again.\n\n${PIC}\n\nSo ice floats.`);
  assert.match(explanationProblem(twice, 'standard', 'ice') || '', /two rh-illustration fences share an id/);
});

// ---- saved cards ---------------------------------------------------------------------------------------------------------------------------------------------
test('a saved card with `more` still reads exactly as before: sections, display text, counted length and required visuals', () => {
  const saved = { type: 'explanation', title: 'Why ice floats', body: 'Ice is **less dense** than water.', more: [{ label: 'Worked example', text: '| a | b |\n| --- | --- |\n| 1 | 2 |\n\n' + diagramFence(cycleSpec('Ice')) }] };
  assert.equal(fieldText(saved, 'more[0].text'), 'a b 1 2 Ice Start Change Repeat');
  assert.equal(explanationChars(saved), Array.from('Why ice floats Ice is less dense than water. Worked example a b 1 2 Ice Start Change Repeat').length);
  assert.deepEqual(markdownVisuals(saved.more[0].text).tables, [{ ok: true }]);
  assert.equal(requiredVisualProblem(saved, { items: [{ id: 'vr-1', kind: 'table', purpose: 'a table' }, { id: 'vr-2', kind: 'diagram', purpose: 'a diagram' }] }), null, 'visuals in a saved section still satisfy');
  assert.deepEqual(JSON.parse(JSON.stringify(saved)), saved);
});

// ---- auto Recraft ----------------------------------------------------------------------------------------------------------------------------------------------
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const OWNER = { org: 'org', email: 'owner@example.test', userId: 'u-owner' };
const STORE = { org: OWNER.org, email: OWNER.email, app: 'canvas-0a1b2c3d', boardId: 'board-1' };
const failure = () => Object.assign(new Error('image provider provider_error'), { code: 'provider_error', providerRequestStarted: true, definiteResponse: true, status: 500 });
function imageEnv(t, patch = {}) {
  const { sqlite, LEARN_DB } = learnDb(t);
  const puts = [];
  const base = { SMALL_ENV: 'dev', LEARN_DB, USAGE_PLATFORM_DAY_USD: '100', AI_MONTHLY_ALLOWANCE_USD: '50', IMAGE_GENERATE_ENABLED: 'true', RECRAFT_API_KEY: 'fixture-not-a-key',
    IMAGE_RESERVED_USD_BY_MODEL: JSON.stringify({ [FIGURE_MODEL]: 0.02 }), IMAGE_MAX_CHARGE_USD_BY_MODEL: JSON.stringify({ [FIGURE_MODEL]: 0.01 }),
    LEARN_MEDIA: { put: async (key, bytes) => { puts.push({ key, bytes }); } }, ...patch };
  for (const key of Object.keys(patch)) if (patch[key] === undefined) delete base[key];
  const env = withUsage(base, { feature: 'artifact' });
  noteUsageIdentity(env, { userId: OWNER.userId, email: OWNER.email });
  const rows = sql => sqlite.prepare(sql).all().map(r => ({ ...r }));
  return { env, puts, rows };
}
const adapterOf = (...outcomes) => { const calls = []; return { calls, generate: async input => { calls.push(input); const next = outcomes[Math.min(calls.length, outcomes.length) - 1]; if (next === 'fail') throw failure(); return { bytes: PNG, mimeType: 'image/png', providerModel: FIGURE_MODEL, usage: { credits: 7 } }; } }; };
const withPic = card(`${ICE}\n\n${PIC}\n\nSo the cube rises until it displaces its own weight.`);

test('an rh-illustration is generated before the card returns, stored as a file source of the board owner, and priced and settled on the ledger', async t => {
  const { env, puts, rows } = imageEnv(t), adapter = adapterOf('ok');
  const { out } = await direct(withPic, { figures: { store: STORE, adapter } }, env);
  assert.equal(out.result, 'artifact');
  assert.equal(adapter.calls.length, 1);
  assert.deepEqual([adapter.calls[0].model, adapter.calls[0].prompt, adapter.calls[0].settings], [FIGURE_MODEL, 'An ice cube floating in a glass of water, side view', { model: FIGURE_MODEL, aspect_ratio: '1:1', resolution: '1K' }]);
  const fig = out.block.figures.ice;
  assert.deepEqual(Object.keys(out.block.figures), ['ice']);
  assert.deepEqual({ ...fig, fileRef: { ...fig.fileRef, source: { ...fig.fileRef.source, id: 'ID', rev: 'REV' } } },
    { status: 'ready', fileRef: { v: 1, source: { id: 'ID', rev: 'REV' }, meta: { name: 'illustration.png', type: 'image/png', size: PNG.length } }, alt: 'An ice cube floating in water', caption: 'Most of the ice sits under the water', aspect: 1 });
  assert.match(fig.fileRef.source.id, /^fs_[a-f0-9]{24}$/);
  assert.equal(out.block.body, withPic.body, 'the fence stays where the picture goes');
  const [source] = rows('SELECT * FROM file_sources');
  assert.deepEqual([source.id, source.org, source.owner_email, source.app, source.board_id, source.status, source.sha256, source.bytes], [fig.fileRef.source.id, OWNER.org, OWNER.email, STORE.app, STORE.boardId, 'stored', fig.fileRef.source.rev, PNG.length]);
  assert.equal(puts[0].key, `file-sources/${fig.fileRef.source.id}/original/${fig.fileRef.source.rev}`);
  const [op] = rows('SELECT * FROM usage_operations'), [attempt] = rows('SELECT * FROM usage_attempts');
  assert.deepEqual([op.category, op.status, op.provider, op.model, op.cost_usd], ['explain_illustration', 'settled', 'recraft', FIGURE_MODEL, 0.007], 'settled at the provider-reported cost');
  assert.deepEqual([attempt.status, attempt.reserved_micros, attempt.cost_micros, attempt.kind], ['settled', 20000, 7000, 'media'], 'reserved at the image quote; the learner is charged the picture, as part of the same /explain action');
  assert.deepEqual(fileRefSources({ blocks: [out.block] }), [fig.fileRef.source.id], 'the board keeps a reference to the stored picture');
});

test('two illustrations are generated in parallel', async t => {
  const { env } = imageEnv(t);
  let started = 0, release;
  const gate = new Promise(resolve => { release = resolve; });
  const adapter = { generate: async () => { started++; if (started === 2) release(); await gate; return { bytes: PNG, mimeType: 'image/png', usage: { credits: 7 } }; } };
  const second = illustrationFence({ id: 'glass', prompt: 'A glass of water', alt: 'A glass', caption: 'The water around the ice' });
  const two = card(`${ICE}\n\n${PIC}\n\nThe water holds it up.\n\n${second}\n\nSo ice floats.`);
  const { out } = await direct(two, { figures: { store: STORE, adapter } }, env);
  assert.equal(started, 2, 'both pictures were asked for before either answered');
  assert.deepEqual(Object.keys(out.block.figures).sort(), ['glass', 'ice']);
});

test('a failed first attempt is retried and the picture is stored; each attempt is its own settled ledger row', async t => {
  const { env, rows } = imageEnv(t), adapter = adapterOf('fail', 'ok');
  const { out } = await direct(withPic, { figures: { store: STORE, adapter } }, env);
  assert.equal(adapter.calls.length, 2);
  assert.equal(out.block.figures.ice.status, 'ready');
  assert.deepEqual(rows('SELECT status, cost_usd FROM usage_operations ORDER BY rowid'), [{ status: 'failed', cost_usd: 0.02 }, { status: 'settled', cost_usd: 0.007 }], 'the failed call keeps its reservation as unknown cost, never zero');
});

test(`after ${FIGURE_ATTEMPTS} failed attempts the fence is removed silently: the card is delivered with no figure and no error text`, async t => {
  const { env, rows } = imageEnv(t), adapter = adapterOf('fail');
  const logs = [];
  const { out } = await direct(withPic, { figures: { store: STORE, adapter, log: line => logs.push(JSON.parse(line)) } }, env);
  assert.equal(adapter.calls.length, FIGURE_ATTEMPTS);
  assert.equal(out.result, 'artifact');
  assert.equal(out.block.figures, undefined);
  assert.equal(out.block.body, `${ICE}\n\nSo the cube rises until it displaces its own weight.`, 'the prose around the fence is joined cleanly');
  assert.doesNotMatch(JSON.stringify(out), /fail|unavailable|could not/i, 'nothing about the picture reaches the learner');
  assert.equal(rows('SELECT * FROM usage_operations').length, FIGURE_ATTEMPTS, 'the failures are on the ledger');
  assert.deepEqual(logs.map(l => l.outcome), ['attempt_failed', 'attempt_failed', 'attempt_failed'], 'and in the server log');
});

test('no RECRAFT_API_KEY (or image generation off, or no board): no provider call, no ledger row, the fence is removed and the card delivered', async t => {
  for (const [name, patch, store] of [['no key', { RECRAFT_API_KEY: undefined }, STORE], ['generation off', { IMAGE_GENERATE_ENABLED: undefined }, STORE], ['no board', {}, null], ['no price', { IMAGE_MAX_CHARGE_USD_BY_MODEL: undefined }, STORE]]) {
    const { env, rows } = imageEnv(t, patch), adapter = adapterOf('ok'), logs = [];
    const { out } = await direct(withPic, { figures: { store, adapter, log: line => logs.push(JSON.parse(line)) } }, env);
    assert.deepEqual([out.result, adapter.calls.length, out.block.figures, rows('SELECT * FROM usage_operations').length], ['artifact', 0, undefined, 0], name);
    assert.equal(out.block.body.includes('rh-illustration'), false, name);
    assert.equal(logs[0].outcome, 'not_made', name);
  }
  const { env } = imageEnv(t, { RECRAFT_API_KEY: undefined });
  assert.equal((await direct(withPic, {}, env)).out.block.body.includes('rh-illustration'), false, 'a caller that passes no figures option makes no picture either');
});

// ---- the Tutor roadmap path ----------------------------------------------------------------------------------------------------------------------------------
const viaRoadmap = (block, deps = {}) => { const m = scripted(['make_explanation', block]); const stages = []; return generateRoadmapCard({}, access, ref, { loadAccepted: async () => record(), withProviderCall: (env, fields) => { stages.push(fields); return { ...env }; }, callModel: m.callModel, ...deps }).then(out => ({ out, m, stages })); };

test('the roadmap path applies the same rules: missing visual, a layout with no valid order, relevance and the prose budget are terminal after one call', async () => {
  const fence = diagramFence(cycleSpec('Ice floats'));
  // Owner 2026-11-08: up to three visuals; a fourth is dropped by the server (the first three kept), so it never fails the card.
  const four = await viaRoadmap(card(`${ICE}\n\n${fence}\n\nIce one.\n\n${fence}\n\nIce two.\n\n${fence}\n\nIce three.\n\n${fence}\n\nIce four.`));
  assert.deepEqual([four.out.outcome, markdownVisuals(four.out.block.body).diagrams.length, four.m.seen.length], ['ok', 3, 1]);
  for (const [body, code] of [[ICE, 'explanation_missing_visual'], [`${fence}\n\n${ICE}`, 'explanation_layout'],
    [`${ICE}\n\n${diagramFence(cycleSpec('Stock market'))}\n\nSo it floats.`, 'explanation_visual_unrelated'], [withVisual(`Ice ${'é'.repeat(800)}`), 'explanation_over_budget']]) {
    const { out, m } = await viaRoadmap(card(body));
    assert.deepEqual([out.failure_class, out.code, m.seen.length], ['terminal_validation_failure', code, 1], code);
  }
  assert.equal((await viaRoadmap(card(withVisual(ICE)))).out.outcome, 'ok');
});

test('the roadmap path makes the pictures too, each attempt on its own stable illustration operation, and its quote holds room for them', async () => {
  const adapter = adapterOf('fail', 'ok');
  const env = { SMALL_ENV: 'test', LEARN_DB: learnDbStub(), IMAGE_GENERATE_ENABLED: 'true', RECRAFT_API_KEY: 'fixture-not-a-key', LEARN_MEDIA: { put: async () => {} },
    IMAGE_RESERVED_USD_BY_MODEL: JSON.stringify({ [FIGURE_MODEL]: 0.02 }), IMAGE_MAX_CHARGE_USD_BY_MODEL: JSON.stringify({ [FIGURE_MODEL]: 0.01 }) };
  const m = scripted(['make_explanation', withPic]); const stages = [];
  const out = await generateRoadmapCard(env, access, ref, { loadAccepted: async () => record(), withProviderCall: (e, fields) => { stages.push(fields); return e; }, callModel: m.callModel, figureStore: STORE, figureAdapter: adapter });
  assert.equal(out.outcome, 'ok');
  assert.equal(out.block.figures.ice.status, 'ready');
  assert.deepEqual(stages.map(s => [s.stage, s.call]), [['generate', 0], ['illustration', 0], ['illustration', 1]], 'the author call, then one operation per picture attempt');
  const plain = await quoteRoadmapCard({}, record()), held = await quoteRoadmapCard(env, record());
  assert.equal(held.boundMicros - plain.boundMicros, FIGURES_MAX * FIGURE_ATTEMPTS * 20000, 'two pictures, three attempts each, at the image reservation');
});
function learnDbStub() { return { prepare: () => ({ bind() { return this; }, run: async () => ({ meta: { changes: 1 } }), first: async () => null }) }; }
