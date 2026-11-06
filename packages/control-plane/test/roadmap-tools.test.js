// Contract tests for the draft capability catalogue and dispatch allowlist (src/roadmap/roadmap-tools.js). Pure and offline.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../src/roadmap/roadmap-tools.js';
import { TOOL_STATUS } from '../src/roadmap/roadmap-contract.js';

const handlers = () => {
  const seen = [];
  const h = name => async args => { seen.push([name, args]); return name === 'check_claims' ? { status: 'partial' } : { status: 'ok' }; };
  return { seen, read_source: h('read_source'), check_claims: h('check_claims'), research_gap: h('research_gap'), execute_code: h('execute_code') };
};
const read = args => ({ name: 'read_source', args });

test('only the R4 source reader and text checker are enabled; the ladder is listed but off', () => {
  assert.deepEqual(T.enabledCapabilities().map(c => c.name), ['read_source', 'check_claims']);
  const planned = T.CAPABILITIES.filter(c => !c.enabled).map(c => [c.name, c.release]);
  assert.deepEqual(planned, [['index_source', 'R7a'], ['read_pdf_page', 'R7b'], ['research_gap', 'R8a'],
    ['read_learning_evidence', 'R9'], ['inspect_figure', 'R15'], ['execute_code', 'R16']]);
});

test('the model catalogue lists enabled tools only, with closed schemas', () => {
  const cat = T.capabilityCatalogue();
  assert.deepEqual(cat.map(c => c.name), ['read_source', 'check_claims']);
  for (const c of cat) { assert.equal(c.input_schema.additionalProperties, false); assert.ok(c.input_schema.required.length); }
  assert.ok(!/research_gap|execute_code|calculate|index_source|inspect_figure/.test(JSON.stringify(cat)));
  assert.deepEqual(T.capabilityCatalogue({ read_source: false }).map(c => c.name), ['check_claims'], 'a per-capability flag removes one tool only');
});

test('server dispatch rejects unavailable and unknown tools before any handler runs', async () => {
  const h = handlers();
  for (const name of ['research_gap', 'execute_code', 'calculate_expression', 'index_source']) {
    const out = await T.runRoadmapTool({ name, args: {} }, { handlers: h });
    assert.equal(out.status, 'unavailable', name);
    assert.equal(out.reason, 'not_enabled');
  }
  for (const name of ['sql', 'shell', 'eval', 'write_file', 'read_credentials', '', undefined, 'constructor', '__proto__']) {
    assert.equal((await T.runRoadmapTool({ name, args: {} }, { handlers: h })).status, 'unsupported', String(name));
  }
  assert.equal((await T.runRoadmapTool(null, { handlers: h })).status, 'unsupported');
  assert.deepEqual(h.seen, [], 'zero handler calls for every refusal');
});

test('no general SQL, shell, credential or write tool exists, and a paid tool can never be dispatched by a model call', async () => {
  assert.ok(!T.CAPABILITIES.some(c => /sql|shell|exec_|eval|credential|secret|write|delete/i.test(c.name)));
  const paid = T.CAPABILITIES.filter(c => c.paid);
  assert.ok(paid.length > 0 && paid.every(c => !c.enabled), 'every paid capability is off in R4');
  const forced = T.CAPABILITIES.map(c => (c.name === 'research_gap' ? { ...c, enabled: true, purposes: ['plan'], args: {}, required: [] } : c));
  const h = handlers();
  const out = await T.runRoadmapTool({ name: 'research_gap', args: {} }, { handlers: h, caps: forced });
  assert.equal(out.reason, 'paid_tool_needs_acceptance', 'even a mis-enabled paid tool cannot spend from a tool call');
  assert.deepEqual(h.seen, []);
});

test('arguments are closed and typed; a bad call is unsupported and never reaches the handler', async () => {
  const h = handlers();
  const bad = [{ scope: 'everything' }, { scope: 'passage', start: -1 }, { scope: 'passage', start: 1.5 }, { scope: 'declared', extra: 1 }, {}, { scope: 'declared', end: 'x' }];
  for (const args of bad) assert.equal((await T.runRoadmapTool(read(args), { handlers: h })).status, 'unsupported', JSON.stringify(args));
  const check = args => T.runRoadmapTool({ name: 'check_claims', args }, { handlers: h, purpose: 'check' });
  assert.equal((await check({ claims: [], resultId: 'rs_12345678' })).status, 'unsupported');
  assert.equal((await check({ claims: ['a'], resultId: 'no' })).status, 'unsupported');
  assert.deepEqual(h.seen, []);
  const ok = await T.runRoadmapTool(read({ scope: 'passage', start: 0, end: 100 }), { handlers: h });
  assert.equal(ok.status, 'ok');
  assert.equal(h.seen.length, 1);
});

test('purpose, budget and handler failures are typed limitations, never throws', async () => {
  const h = handlers();
  const declared = read({ scope: 'declared' });
  assert.equal((await T.runRoadmapTool(declared, { handlers: h, purpose: 'check' })).reason, 'wrong_purpose');
  assert.equal((await T.runRoadmapTool(declared, { handlers: h, budget: { used: 8 } })).reason, 'tool_budget_exhausted');
  const spent = { used: 0 };
  for (let i = 0; i < 8; i++) assert.equal((await T.runRoadmapTool(declared, { handlers: h, budget: spent })).status, 'ok');
  assert.equal((await T.runRoadmapTool(declared, { handlers: h, budget: spent })).reason, 'tool_budget_exhausted');
  assert.equal((await T.runRoadmapTool(declared, { handlers: {} })).reason, 'no_handler');
  const boom = await T.runRoadmapTool(declared, { handlers: { read_source: async () => { throw new Error('secret detail'); } } });
  assert.deepEqual(boom, { status: 'unavailable', reason: 'handler_failed' });
  const odd = await T.runRoadmapTool(declared, { handlers: { read_source: async () => ({ status: 'granted' }) } });
  assert.equal(odd.reason, 'invalid_tool_result');
  for (const s of ['ok', 'partial', 'needs_clarification']) assert.ok(TOOL_STATUS.includes(s));
});

test('the format allowlist is exactly the enabled formats: text and table', () => {
  assert.deepEqual([...T.ROADMAP_FORMATS], ['explanation', 'table']);
  assert.ok(Object.isFrozen(T.ROADMAP_FORMATS));
  for (const id of ['animation', 'quiz', 'flashcards', 'image_generate', 'video_generate', 'maths_animation', 'code_sample', 'flow_diagram', 'notebook']) assert.equal(T.isFormatEnabled(id), false, id);
  assert.equal(T.isFormatEnabled('table'), true);
  assert.equal(T.isFormatEnabled('__proto__'), false);
});
