// EXP-13 fast card (owner decisions 2026-11-08 after the gpt-oss benchmark, docs/features/explain.md "Card layout v2"): no repair for what the server can
// fix (fix 1), visuals as structured fields placed by markers (fix 2), pictures started from the streamed answer (fix 3), the asked-for visual mix
// detected and enforced (fix 5b, 5c). Offline: the model and Recraft are doubles, the ledger is the real one on node:sqlite. Nothing is sent or paid.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeVisuals, explanationProseChars, markdownIllustrations, markdownVisuals, settleExplanationBody } from '../src/learn-primitives.js';
import { deriveVisualRequirements, requiredMix, requiredVisualProblem } from '../src/explanation-visuals.js';
import { generateArtifact } from '../src/learn-artifact.js';
import { CHAIN_ENDPOINTS, STREAM_SETTING, visualScanner } from '../src/explanation-fast-chain.js';
import { EXPLANATION_PROFILE_SETTING } from '../src/explanation-models.js';
import { FIGURE_MODEL } from '../src/explanation-figures.js';
import { EXPLANATION_BUDGET } from '../src/chat-depth.js';
import { withUsage, noteUsageIdentity } from '../src/learn-usage.js';
import { cycleSpec, diagramFence, illustrationFence } from './explanation-layout-fixture.js';
import { learnDb } from './learn-grade-fixture.js';

const quiet = t => { const { log, warn } = console; console.log = () => {}; console.warn = () => {}; t.after(() => { console.log = log; console.warn = warn; }); };
const ICE = 'Ice floats because ice is less dense than water.';
const AFTER = 'So the ice cube rises until it displaces its own weight.';
const DIAGRAM = { k: 'diagram', spec: cycleSpec('Ice floats on water') };
const PICTURE = { k: 'picture', p: 'An ice cube floating in a glass of water, side view', a: 'An ice cube floating in water', c: 'Most of the ice sits under the water' };
const answer = (visuals, body = `${ICE}\n\n[[visual:1]]\n\n${AFTER}`, title = 'Why ice floats') => ({ title, visuals, body });
// The plan transport double (Anthropic tool call): each call answers the next input.
const scripted = (...inputs) => { const seen = []; return { seen, callModel: async (env, body) => { seen.push(body); return Response.json({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `c${seen.length}`, name: 'make_explanation', input: inputs[Math.min(seen.length, inputs.length) - 1] }] }); } }; };
const direct = async (inputs, args = 'Why does ice float?', extra = {}) => { const m = scripted(...inputs); const r = deriveVisualRequirements(args);
  const out = await generateArtifact({}, { command: 'explanation', args, ...(r.items?.length ? { visualRequirements: r } : {}) }, { callModel: m.callModel, ...extra }); return { out, m }; };
const kinds = body => ({ diagrams: markdownVisuals(body).diagrams.length, pictures: markdownIllustrations(body).length });

// ---- fix 2: structured visuals ---------------------------------------------------------------------------------------------------------------------------
test('fix 2: visuals are fields; the server writes the same rh-diagram / rh-illustration fences the card already renders, at the markers', async () => {
  const { out, m } = await direct([answer([DIAGRAM, PICTURE], `${ICE}\n\n[[visual:1]]\n\nWater holds the ice up.\n\n[[visual:2]]\n\n${AFTER}`)]);
  assert.deepEqual([out.result, m.seen.length], ['artifact', 1]);
  assert.equal(out.block.body, `${ICE}\n\n${diagramFence(DIAGRAM.spec)}\n\nWater holds the ice up.\n\n${AFTER}`, 'the saved body holds the fences; the picture fence is removed silently as no figures store was given');
  assert.ok(!('visuals' in out.block), 'the author fields are not saved');
  const schema = m.seen[0].tools.find(t => t.name === 'make_explanation').input_schema;
  assert.deepEqual(Object.keys(schema.properties), ['title', 'visuals', 'body'], 'visuals before body');
  assert.deepEqual(schema.required, ['title', 'visuals', 'body']);
  assert.deepEqual(schema.properties.visuals.items.oneOf.map(b => [b.properties.k.const, Object.keys(b.properties)]), [['diagram', ['k', 'spec']], ['picture', ['k', 'p', 'a', 'c']]]);
  assert.deepEqual([schema.properties.visuals.minItems, schema.properties.visuals.maxItems], [1, 3], 'owner 2026-11-08: up to three visuals');
  const picture = schema.properties.visuals.items.oneOf[1].properties;
  assert.deepEqual([picture.p.maxLength, picture.a.maxLength, picture.c.maxLength], [200, 120, 100], 'terse picture fields (owner review 2026-11-08)');
  const description = m.seen[0].tools.find(t => t.name === 'make_explanation').description;
  assert.match(description, /\[\[visual:1\]\]/, 'the author is told to place visuals by marker');
  assert.match(description, /leave out exact numbers, formulas, named parts and historical particulars unless they are standard textbook facts you are certain of, and never invent the name of an object, tool or part/, 'the factual-specifics rule (owner review 2026-11-08)');
  // A picture fence the server wrote is the saved rh-illustration format, with a server-numbered id.
  assert.deepEqual(markdownIllustrations(composeVisuals('A. [[visual:1]] B.', [PICTURE])).map(p => p.spec), [{ version: 1, id: 'pic-1', prompt: PICTURE.p, alt: PICTURE.a, caption: PICTURE.c }]);
  // An unknown or repeated marker is removed; a visual without a marker goes to the end (then the layout is settled).
  assert.equal(composeVisuals('A. [[visual:3]] B. [[visual:1]] C. [[visual:1]]', [DIAGRAM]), `A.\n\nB.\n\n${diagramFence(DIAGRAM.spec)}\n\nC.`);
  const unplaced = await direct([answer([DIAGRAM], `${ICE}\n\n${AFTER}`)]);
  assert.deepEqual([unplaced.out.result, unplaced.m.seen.length], ['artifact', 1], 'a visual with no marker is placed between the prose parts, not repaired');
  // The earlier answer shape (fences inside the body) is still read.
  assert.equal((await direct([{ title: 'Why ice floats', body: `${ICE}\n\n${diagramFence(DIAGRAM.spec)}\n\n${AFTER}` }])).out.result, 'artifact');
});

// ---- fix 1a: budget ---------------------------------------------------------------------------------------------------------------------------------------
test('fix 1a: the author is asked for 450; up to 700 passes untouched; above 700 whole sentences or list items are trimmed from the end, never mid-sentence', async () => {
  assert.deepEqual(EXPLANATION_BUDGET, { target: 450, hard: 700 });
  const sentence = 'Ice is less dense than water, so a block of it floats with most of its bulk below the surface line. ';
  const fit = answer([DIAGRAM], `${sentence.repeat(5).trim()}\n\n[[visual:1]]\n\n${AFTER}`);
  const ok = await direct([fit]);
  assert.ok(explanationProseChars(ok.out.block) > EXPLANATION_BUDGET.target && explanationProseChars(ok.out.block) <= EXPLANATION_BUDGET.hard);
  assert.deepEqual([ok.out.result, ok.m.seen.length, ok.out.block.body.replace(/\s+/g, ' ').includes(sentence.repeat(5).trim())], ['artifact', 1, true], 'between 450 and 700: delivered as written (only paragraph breaks added by the 220-character split)');
  assert.match(JSON.stringify(ok.m.seen[0].tools), /at most 450 characters of prose/);
  const long = await direct([answer([DIAGRAM], `${sentence.repeat(9).trim()}\n\n[[visual:1]]\n\n${AFTER}\n\n- First extra point about ice.\n- Second extra point about ice.`)]);
  const used = explanationProseChars(long.out.block);
  assert.deepEqual([long.out.result, long.m.seen.length], ['artifact', 1], 'no repair');
  assert.ok(used <= EXPLANATION_BUDGET.hard && used > EXPLANATION_BUDGET.hard - sentence.length, `trimmed to ${used}, no more than needed`);
  assert.ok(long.out.block.body.includes(AFTER), 'every prose part keeps a sentence: the list items after the visual went first, then sentences before it');
  assert.ok(!long.out.block.body.includes('extra point'));
  for (const line of long.out.block.body.split('\n').filter(l => l && !l.startsWith('```') && !l.startsWith('{'))) assert.match(line, /[.!?]$/, 'every kept line ends a sentence');
  // One unsplittable sentence per part cannot be trimmed: that still goes to the one repair.
  const stuck = await direct([answer([DIAGRAM], `Ice ${'é'.repeat(800)}\n\n[[visual:1]]\n\n${AFTER}`), answer([DIAGRAM])]);
  assert.deepEqual([stuck.out.result, stuck.out.repaired, stuck.m.seen.length], ['artifact', true, 2]);
  assert.match(stuck.m.seen[1].messages.at(-1).content[0].content, /explanation_over_budget/);
});

// ---- fix 1c: layout ---------------------------------------------------------------------------------------------------------------------------------------
test('fix 1c: a visual first, last or next to the other is moved to the nearest gap with prose on both sides; no valid order goes to the repair', () => {
  const D = diagramFence(DIAGRAM.spec), P = 'Ice is lighter.', Q = 'Water holds it.', R = 'So it floats.';
  const cases = [[`${D}\n\n${P}\n\n${R}`, `${P}\n\n${D}\n\n${R}`, 'visual first'], [`${P}\n\n${R}\n\n${D}`, `${P}\n\n${D}\n\n${R}`, 'visual last'],
    [`${P}\n\n${D}\n\n${D}\n\n${Q}\n\n${R}`, `${P}\n\n${D}\n\n${Q}\n\n${D}\n\n${R}`, 'two visuals next to each other']];
  for (const [body, want, name] of cases) assert.equal(settleExplanationBody(body), want, name);
  const fine = `${P}\n\n${D}\n\n${R}`;
  assert.equal(settleExplanationBody(fine), fine, 'a valid card is the same string');
  assert.equal(settleExplanationBody(`${D}\n\n${P}`), `${D}\n\n${P}`, 'one prose part cannot hold a visual on both sides: left for the repair');
});

// Owner 2026-11-08: up to three visuals, any mix, at most two of them pictures; extras are dropped by the server, never repaired.
test('three visuals: a diagram, a diagram and a picture pass in one call; a fourth is dropped, the first three by position kept; a third picture is dropped first', async () => {
  const second = { ...DIAGRAM, spec: cycleSpec('Water and ice') }, fourth = { ...DIAGRAM, spec: cycleSpec('Ice and water again') };
  const three = `${ICE}\n\n[[visual:1]]\n\nWater holds it.\n\n[[visual:2]]\n\nIt rises.\n\n[[visual:3]]\n\n${AFTER}`;
  const ok = await direct([answer([DIAGRAM, second, PICTURE], three)]);
  assert.deepEqual([ok.out.result, ok.m.seen.length, kinds(ok.out.block.body).diagrams], ['artifact', 1, 2], 'diagram, diagram, picture: no repair (the picture fence then goes, as no store is given)');
  const { out, m } = await direct([answer([DIAGRAM, fourth, second, PICTURE], `${ICE}\n\n[[visual:1]]\n\nWater holds it.\n\n[[visual:3]]\n\nIt rises.\n\n[[visual:4]]\n\nIt stays up.\n\n[[visual:2]]\n\n${AFTER}`)]);
  assert.deepEqual([out.result, m.seen.length], ['artifact', 1], 'the author is asked for three (maxItems 3), and a fourth that arrives anyway is dropped, not repaired');
  assert.equal(m.seen[0].tools.find(t => t.name === 'make_explanation').input_schema.properties.visuals.maxItems, 3);
  assert.ok(!out.block.body.includes('Ice and water again'), 'the fourth by position in the body is the one dropped');
  assert.equal(kinds(out.block.body).diagrams, 2);
  const D = n => diagramFence(cycleSpec(`Ice floats ${n}`)), P = n => illustrationFence({ id: `pic-${n}`, prompt: `Ice cube ${n} in water`, alt: `Ice cube ${n}`, caption: `Ice floats ${n}` });
  const four = `${ICE}\n\n${D(1)}\n\nWater holds it.\n\n${D(2)}\n\nIt rises.\n\n${D(3)}\n\nIt stays.\n\n${D(4)}\n\n${AFTER}`;
  assert.deepEqual(kinds(settleExplanationBody(four)), { diagrams: 3, pictures: 0 });
  assert.ok(!settleExplanationBody(four).includes('Ice floats 4'), 'the fourth by position is the one dropped');
  const pics = settleExplanationBody(`${ICE}\n\n${P(1)}\n\nWater holds it.\n\n${P(2)}\n\nIt rises.\n\n${P(3)}\n\n${AFTER}`);
  assert.deepEqual(kinds(pics), { diagrams: 0, pictures: 2 }, 'three pictures keep two');
  assert.ok(!pics.includes('Ice cube 3'), 'the third picture is the one dropped');
  const mixed = settleExplanationBody(`${ICE}\n\n${P(1)}\n\nA.\n\n${P(2)}\n\nB.\n\n${P(3)}\n\nC.\n\n${D(4)}\n\n${AFTER}`);
  assert.deepEqual(kinds(mixed), { diagrams: 1, pictures: 2 }, 'pictures beyond two go first, so the diagram after them is kept');
  const fenced = await direct([{ title: 'Why ice floats', body: four }]);
  assert.deepEqual([fenced.out.result, fenced.m.seen.length, kinds(fenced.out.block.body).diagrams], ['artifact', 1, 3]);
});

// Owner 2026-11-08: no plain bullet lists. The guidance asks for a visual or sentences; a list the model still writes is delivered unchanged and counted.
test('no bullets: the guidance asks parallel points into a visual; a card with a list is delivered unchanged, with block.proseLists recorded', async () => {
  const { out, m } = await direct([answer([DIAGRAM], `${ICE}\n\n- Ice is light.\n- Water is heavy.\n\n[[visual:1]]\n\n${AFTER}\n\n1. First.\n\n2. Second.\n   still the second.`)]);
  const description = m.seen[0].tools.find(t => t.name === 'make_explanation').description;
  assert.match(description, /Never write a bulleted or numbered list: parallel points go into a visual, a comparison diagram for 2-4 things side by side \(each column a heading and up to 5 short items\), a flow or sequence for steps, a tree for the parts of one thing; anything else is written as sentences\./);
  assert.match(description, /a third only for a list of parallel points turned into a comparison, flow or tree/);
  assert.deepEqual([out.result, m.seen.length], ['artifact', 1], 'no check, no repair');
  assert.ok(out.block.body.includes('- Ice is light.\n- Water is heavy.') && out.block.body.includes('1. First.\n\n2. Second.'), 'the lists stay');
  assert.equal(out.block.proseLists, 2, 'two list blocks (a loose numbered list is one)');
  assert.equal((await direct([answer([DIAGRAM])])).out.block.proseLists, 0, 'recorded as 0 when there is none');
});

// ---- fix 1b: terms ------------------------------------------------------------------------------------------------------------------------------------------
test('fix 1b: an unanchorable or invalid term is dropped silently and the valid ones kept, in the one call', async () => {
  const env = { EXPLANATION_INTERACTIONS: 'true' };
  const qs = ['Why is ice less dense?', 'Does all ice float?', 'What about salt water?'];
  const m = scripted({ ...answer([DIAGRAM]), questions: qs, terms: [{ t: 'dense', d: 'Mass packed into a volume.', n: 0 }, { t: 'principal', d: 'Not in the text.', n: 0 }, { t: 'Ice floats on water', d: 'Too many words.', n: 0 }, { t: 'water', d: 'H2O.', n: 0 }] });
  const out = await generateArtifact(env, { command: 'explanation', args: 'Why does ice float?' }, { callModel: m.callModel });
  assert.deepEqual([out.result, m.seen.length], ['artifact', 1]);
  assert.deepEqual(out.block.interactions.terms.map(t => t.label), ['dense', 'water']);
  assert.equal(out.block.interactions.questions.length, 3);
});

// ---- fix 5b: requirements -------------------------------------------------------------------------------------------------------------------------------------
test('fix 5b: "two diagrams", "two pictures", "a diagram and a picture" and plurals are required visuals of that kind and count', () => {
  const read = q => { const r = deriveVisualRequirements(q); return r.unsupported ? 'unsupported' : r.items.map(i => i.kind).join(','); };
  assert.equal(read('Explain the heart with two diagrams'), 'diagram,diagram');
  assert.equal(read('Show diagrams of the heart'), 'diagram,diagram', 'a plural is two');
  assert.equal(read('How do honeybees make honey? Explain it with a diagram and a picture.'), 'diagram,illustration');
  assert.equal(read('Explain rainbows with two pictures'), 'illustration,illustration');
  assert.equal(read('Draw a flowchart and a bar chart of the budget'), 'diagram,diagram');
  assert.equal(read('Draw a flowchart of it. The flowchart should start at login.'), 'diagram', 'the same diagram named twice is one');
  assert.equal(read('Show an image of a plant cell'), 'illustration');
  assert.equal(read('Give me the big picture of the war'), '', 'not a request for a picture');
  assert.equal(read('Two diagrams and a picture of the moon'), 'diagram,diagram,illustration', 'owner 2026-11-08: three visuals fit a card');
  assert.equal(read('Explain the heart with three diagrams'), 'diagram,diagram,diagram');
  assert.equal(read('Two diagrams and two pictures of the moon'), 'unsupported', 'a card holds three visuals at most: told before any call');
  assert.equal(read('Explain the moon with three pictures'), 'unsupported', 'and two pictures at most');
  assert.equal(deriveVisualRequirements('Explain TCP with two sequence diagrams').items[0].diagramKind, 'sequence');
  assert.deepEqual(requiredMix(deriveVisualRequirements('a diagram and a picture of a bee')), { diagram: 1, illustration: 1 });
  assert.equal(requiredMix(deriveVisualRequirements('Compare them in a table')), null, 'a table fixes no visual mix');
});

// ---- fix 5c: the mix -------------------------------------------------------------------------------------------------------------------------------------------
test('fix 5c: the asked mix is enforced: extra visuals are dropped by the server; a missing one is the one repair; unasked, the author chooses freely', async () => {
  // Asked for two pictures, wrote a diagram and a picture: the diagram is dropped; the asked second picture is missing, so one repair.
  const twoPics = 'Explain how ice floats with two pictures';
  const fixedPics = answer([PICTURE, { ...PICTURE, p: 'A glass of water seen from the side', c: 'The water around the ice' }], `${ICE}\n\n[[visual:1]]\n\nWater holds the ice up.\n\n[[visual:2]]\n\n${AFTER}`);
  const pics = await direct([answer([DIAGRAM, PICTURE], `${ICE}\n\n[[visual:1]]\n\nWater holds it.\n\n[[visual:2]]\n\n${AFTER}`), fixedPics], twoPics);
  assert.deepEqual([pics.out.result, pics.out.repaired, pics.m.seen.length], ['artifact', true, 2]);
  assert.match(pics.m.seen[1].messages.at(-1).content[0].content, /required_visual_missing: the learner asked for an illustration \(vr-2/);
  // Asked for one picture, wrote a picture and an extra diagram: the diagram is dropped, no repair (the picture fence then goes as no store is given).
  const one = await direct([answer([PICTURE, DIAGRAM], `${ICE}\n\n[[visual:1]]\n\nWater holds it.\n\n[[visual:2]]\n\n${AFTER}`)], 'Explain how ice floats with a picture');
  assert.deepEqual([one.out.result, one.m.seen.length, kinds(one.out.block.body).diagrams], ['artifact', 1, 0]);
  assert.equal(one.out.diagramsDropped, 1, 'the drop is recorded with the result');
  // Asked for two diagrams, wrote one: the one repair, naming the missing one.
  const twoD = await direct([answer([DIAGRAM]), answer([DIAGRAM, { ...DIAGRAM, spec: cycleSpec('Water and ice') }], `${ICE}\n\n[[visual:1]]\n\nWater is denser.\n\n[[visual:2]]\n\n${AFTER}`)], 'Explain why ice floats with two diagrams');
  assert.deepEqual([twoD.out.result, twoD.out.repaired], ['artifact', true]);
  assert.match(twoD.m.seen[1].messages.at(-1).content[0].content, /required_visual_missing: the learner asked for a diagram \(vr-2/);
  assert.equal(kinds(twoD.out.block.body).diagrams, 2);
  // A caller that did not settle the body is told the mix.
  assert.match(requiredVisualProblem({ body: `${ICE}\n\n${diagramFence(DIAGRAM.spec)}\n\nMid.\n\n${diagramFence(DIAGRAM.spec)}\n\n${AFTER}` }, deriveVisualRequirements('with a diagram')) || '', /^explanation_visual_mix: the learner asked for 1 diagram\(s\) and 0 picture\(s\); the card has 2 and 0/);
  // Not asked: one or two of any kind, as the author chose.
  const free = await direct([answer([PICTURE, DIAGRAM], `${ICE}\n\n[[visual:1]]\n\nWater holds it.\n\n[[visual:2]]\n\n${AFTER}`)]);
  assert.deepEqual([free.out.result, free.m.seen.length, kinds(free.out.block.body).diagrams], ['artifact', 1, 1]);
  // An asked flow is kept over another diagram kind, so an invalid flow is named for the repair rather than replaced by a cycle.
  const flowAsked = settleExplanationBody(`${ICE}\n\n${diagramFence(DIAGRAM.spec)}\n\nMid.\n\n${diagramFence({ version: 1, diagram: { kind: 'flow', title: 'Ice', nodes: [], edges: [] } })}\n\n${AFTER}`, { diagram: 1, illustration: 0, diagramKind: 'flow' });
  assert.match(flowAsked, /"kind":"flow"/); assert.doesNotMatch(flowAsked, /"kind":"cycle"/);
});

// ---- fix 3: streamed author, early pictures ----------------------------------------------------------------------------------------------------------------
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const STORE = { org: 'org', email: 'owner@example.test', app: 'canvas-0a1b2c3d', boardId: 'board-1' };
function fastEnv(t, patch = {}) {
  const { sqlite, LEARN_DB } = learnDb(t);
  const env = withUsage({ SMALL_ENV: 'dev', LEARN_DB, USAGE_PLATFORM_DAY_USD: '100', AI_MONTHLY_ALLOWANCE_USD: '50', IMAGE_GENERATE_ENABLED: 'true', RECRAFT_API_KEY: 'fixture-not-a-key',
    IMAGE_RESERVED_USD_BY_MODEL: JSON.stringify({ [FIGURE_MODEL]: 0.02 }), IMAGE_MAX_CHARGE_USD_BY_MODEL: JSON.stringify({ [FIGURE_MODEL]: 0.01 }), LEARN_MEDIA: { put: async () => {} },
    [EXPLANATION_PROFILE_SETTING]: 'fireworks-low', FIREWORKS_API_KEY: 'fw-synthetic', EXPLANATION_FALLBACK: 'off', ...patch }, { feature: 'artifact' });
  noteUsageIdentity(env, { userId: 'u-owner', email: STORE.email });
  return { env, rows: sql => sqlite.prepare(sql).all().map(r => ({ ...r })) };
}
const sse = chunk => `data: ${JSON.stringify(chunk)}\n\n`;
const USAGE = { prompt_tokens: 1000, completion_tokens: 600, total_tokens: 1600 };
// The Fireworks double. Each answer is { content, splitAt, at: [first part ms, rest ms] }: the content is streamed in two parts, the first ending right after
// the visuals array. stream:false (EXPLANATION_STREAM=off) gets one JSON body at the second time.
function fireworks(t, ...answers) {
  const sent = [], original = globalThis.fetch, enc = new TextEncoder();
  globalThis.fetch = async (url, init) => {
    assert.equal(url, CHAIN_ENDPOINTS.fireworks.url, 'only Fireworks is called');
    const body = JSON.parse(init.body); sent.push({ body, at: Date.now() });
    const a = answers[Math.min(sent.length, answers.length) - 1], text = JSON.stringify(a.content), cut = text.indexOf('"body"');
    const [first = 0, rest = 0] = a.at || [];
    const later = (ms, fn) => (ms ? setTimeout(fn, ms) : fn());
    if (!body.stream) return new Promise(resolve => later(rest, () => resolve(Response.json({ model: body.model, choices: [{ finish_reason: 'stop', message: { content: text } }], usage: USAGE }))));
    const stream = new ReadableStream({ start(c) {
      later(first, () => c.enqueue(enc.encode(sse({ model: body.model, choices: [{ index: 0, delta: { role: 'assistant', content: text.slice(0, cut) } }] }))));
      later(rest, () => { c.enqueue(enc.encode(sse({ model: body.model, choices: [{ index: 0, delta: { content: text.slice(cut) }, finish_reason: 'stop' }] }) + sse({ model: body.model, choices: [], usage: USAGE }) + 'data: [DONE]\n\n')); c.close(); });
    } });
    return new Response(stream, { headers: { 'content-type': 'text/event-stream' } });
  };
  t.after(() => { globalThis.fetch = original; });
  return sent;
}
const recraft = (ms = 0) => { const calls = []; return { calls, generate: async input => { calls.push({ prompt: input.prompt, at: Date.now() }); if (ms) await new Promise(r => setTimeout(r, ms)); return { bytes: PNG, mimeType: 'image/png', usage: { credits: 7 } }; } }; };
const flush = async () => { for (let i = 0; i < 20; i++) await new Promise(r => setImmediate(r)); };
// Runs the card on the fake clock, ticking 10 ms at a time; -> { out, doneAt }
async function onClock(t, run) {
  let out = null, failed = null;
  run().then(v => { out = { value: v, doneAt: Date.now() }; }, e => { failed = e; });
  for (let n = 0; n < 2000 && !out && !failed; n++) { await flush(); t.mock.timers.tick(10); }
  if (failed) throw failed;
  assert.ok(out, 'the card finished on the fake clock');
  return { out: out.value, doneAt: out.doneAt };
}
const STREAMED = answer([PICTURE]);

test('fix 3: a streamed answer starts its picture before the body has arrived; the card waits for both and takes the longer, not the sum (fake clock)', async t => {
  quiet(t);
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const { env, rows } = fastEnv(t), image = recraft(2000);
  const sent = fireworks(t, { content: STREAMED, at: [300, 2500] });
  const { out, doneAt } = await onClock(t, () => generateArtifact(env, { command: 'explanation', args: 'Why does ice float?' }, { figures: { store: STORE, adapter: image } }));
  const asked = sent[0].at, bodyEnd = asked + 2500;
  assert.equal(sent[0].body.stream, true);
  assert.deepEqual([out.result, out.repaired, image.calls.length], ['artifact', false, 1]);
  assert.equal(image.calls[0].prompt, PICTURE.p);
  assert.ok(image.calls[0].at - asked <= 400, `the picture started ${image.calls[0].at - asked} ms after the request, when its visual arrived`);
  assert.ok(image.calls[0].at < bodyEnd, 'before the body ended');
  assert.ok(doneAt - asked < 2500 + 2000, `the card took ${doneAt - asked} ms: text and picture overlapped (one after the other is 4,500 ms)`);
  assert.ok(doneAt >= bodyEnd, 'and it waited for the text');
  assert.equal(out.block.figures['pic-1'].status, 'ready');
  assert.deepEqual([out.block.figures['pic-1'].alt, out.block.figures['pic-1'].caption], [PICTURE.a, PICTURE.c]);
  // Spend as before: the author call settled from the streamed usage at the Fireworks price; the picture admitted and settled at its own price.
  // 1,000 input at $0.15/M + 600 output at $0.60/M = $0.00051; the picture at the provider-reported $0.007. The picture row comes first: it was admitted mid-stream.
  const attempts = rows('SELECT provider, status, cost_micros, input_tokens, output_tokens FROM usage_attempts ORDER BY provider');
  assert.deepEqual(attempts, [{ provider: 'fireworks', status: 'settled', cost_micros: 510, input_tokens: 1000, output_tokens: 600 }, { provider: 'recraft', status: 'settled', cost_micros: 7000, input_tokens: null, output_tokens: null }]);
});

test('fix 3: EXPLANATION_STREAM=off sends stream:false and makes the picture after the answer is validated (fake clock)', async t => {
  quiet(t);
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const { env } = fastEnv(t, { [STREAM_SETTING]: 'off' }), image = recraft(2000);
  const sent = fireworks(t, { content: STREAMED, at: [0, 2500] });
  const { out, doneAt } = await onClock(t, () => generateArtifact(env, { command: 'explanation', args: 'Why does ice float?' }, { figures: { store: STORE, adapter: image } }));
  assert.deepEqual([sent[0].body.stream, out.result, image.calls.length], [false, 'artifact', 1]);
  assert.ok(image.calls[0].at - sent[0].at >= 2500, 'the picture waits for the whole answer');
  assert.ok(doneAt - sent[0].at >= 4500, 'so the card takes the sum');
});

test('fix 3: after a repair, a picture whose prompt is unchanged is reused; a changed prompt gets a new picture and the old one is settled, not shown', async t => {
  quiet(t);
  const bad = answer([PICTURE, { k: 'diagram', spec: { version: 1, diagram: { kind: 'flow', title: 'Ice', nodes: [], edges: [] } } }], `${ICE}\n\n[[visual:1]]\n\nWater holds it.\n\n[[visual:2]]\n\n${AFTER}`);
  const same = fastEnv(t), keep = recraft();
  fireworks(t, { content: bad }, { content: STREAMED });
  const reused = await generateArtifact(same.env, { command: 'explanation', args: 'Why does ice float?' }, { figures: { store: STORE, adapter: keep } });
  assert.deepEqual([reused.result, reused.repaired, keep.calls.length], ['artifact', true, 1], 'one picture for both answers');
  assert.equal(reused.block.figures['pic-1'].status, 'ready');
  const moved = fastEnv(t), fresh = recraft();
  const changed = answer([{ ...PICTURE, p: 'A block of ice in a lake, seen from the shore' }]);
  fireworks(t, { content: bad }, { content: changed });
  const out = await generateArtifact(moved.env, { command: 'explanation', args: 'Why does ice float?' }, { figures: { store: STORE, adapter: fresh } });
  assert.deepEqual([out.result, fresh.calls.map(c => c.prompt)], ['artifact', [PICTURE.p, 'A block of ice in a lake, seen from the shore']]);
  assert.deepEqual(Object.keys(out.block.figures), ['pic-1']);
  assert.equal(moved.rows("SELECT * FROM usage_attempts WHERE provider = 'recraft' AND status = 'settled'").length, 2, 'both pictures are on the ledger');
});

test('fix 3 with three visuals: a picture at visuals[2] starts early as pic-3; a third picture never starts', async t => {
  quiet(t);
  const pic = n => ({ ...PICTURE, p: `${PICTURE.p}, view ${n}`, c: `Ice floats, view ${n}` });
  const body = `${ICE}\n\n[[visual:1]]\n\nWater holds it.\n\n[[visual:2]]\n\nIt rises.\n\n[[visual:3]]\n\n${AFTER}`;
  const a = fastEnv(t), one = recraft();
  fireworks(t, { content: answer([DIAGRAM, { ...DIAGRAM, spec: cycleSpec('Water and ice') }, PICTURE], body) });
  const out = await generateArtifact(a.env, { command: 'explanation', args: 'Why does ice float?' }, { figures: { store: STORE, adapter: one } });
  assert.deepEqual([out.result, one.calls.length, Object.keys(out.block.figures)], ['artifact', 1, ['pic-3']]);
  const b = fastEnv(t), two = recraft();
  fireworks(t, { content: answer([pic(1), pic(2), pic(3)], body) });
  const kept = await generateArtifact(b.env, { command: 'explanation', args: 'Why does ice float?' }, { figures: { store: STORE, adapter: two } });
  assert.deepEqual([kept.result, two.calls.map(c => c.prompt), Object.keys(kept.block.figures)], ['artifact', [pic(1).p, pic(2).p], ['pic-1', 'pic-2']], 'the third picture is dropped, never made or charged');
});

test('fix 3: the stream scanner hands over each visuals[i] once, as soon as it closes, and is not fooled by braces in strings', () => {
  const got = [], feed = visualScanner((item, i) => got.push([i, item.k]));
  const text = JSON.stringify({ title: 'a {b} "c"', visuals: [{ k: 'picture', p: 'x } ] {', a: 'y', c: 'z' }, DIAGRAM], body: '[[visual:1]] {"visuals":[{}]}' });
  const cut = text.indexOf('"body"');
  for (const piece of text.slice(0, cut).match(/[\s\S]{1,5}/g)) feed(piece);
  assert.deepEqual(got, [[0, 'picture'], [1, 'diagram']], 'both visuals before any of the body');
  feed(text.slice(cut));
  assert.equal(got.length, 2, 'nothing more from the body');
});
