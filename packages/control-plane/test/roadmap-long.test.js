// R7a minimum: a Markdown source over the R4 bound is planned across the whole document through the outline and a bounded evidence loop, behind
// ROADMAP_LONG_MARKDOWN_ENABLED (and ROADMAP_ENABLED). The real State store/money/lifecycle, the real planner, evidence retrieval and platform model transport
// (platformCallModel: stable operation ids, checkpoints, the 'plan' quota); only the model transport, the checker, the classifier and the card provider are doubled.
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerRoadmapHandlers } from '../src/roadmap/roadmap-wire.js';
import { runDueRoadmapEvents } from '../src/roadmap/roadmap-events.js';
import { spendTransport } from '../src/learn-spend.js';
import { buildIndex } from '../src/roadmap/roadmap-source-index.js';
import { LONG_LIMITS } from '../src/roadmap/roadmap-source-long.js';
import { rows, MODEL } from './roadmap-fixture.js';
import { BOARD, GOOD, ID_B, KEY, classify, loop, planInput, toolUse } from './roadmap-loop-fixture.js';
import { longDoc } from './roadmap-source-fixture.js';

const ON = { ROADMAP_LONG_MARKDOWN_ENABLED: 'true' };
const ASK = 'Teach me what the appendix says about zebrafish.';
const DOC = longDoc({ chapters: 40, para: 3000 });
const APPENDIX = DOC.indexOf('# Appendix'), CH1 = DOC.indexOf('# Chapter 1\n');
assert.ok(DOC.length > 200000 && APPENDIX > 150000, 'the fixture document is long and its answer is late');
const REGISTRY = { roadmap_draft: { provider: 'anthropic', model: MODEL, effort: 'low', maxTokens: 12000 }, roadmap_revise: { provider: 'anthropic', model: MODEL, effort: 'low', maxTokens: 12000 } };
const PLAN = { ...planInput([['What the appendix says about zebrafish', APPENDIX, DOC.length], ['Chapter 1 in brief', CH1, CH1 + 3000]]), instructionAck: { honored: ['zebrafish'], skips: [] }, assumptions: [] };

const create = (h, scope, instruction = ASK) => h.json('POST', '/api/learn/roadmap', { boardId: BOARD, source: { key: `file:${ID_B}`, rev: h.rev, scope }, instruction, depth: 'balanced', actionKey: KEY('create') });
const LONG = { kind: 'section', locationId: 'long', part: 1 };

// A planning transport double behind the real spend path: `answer(n, body)` -> [toolName, input] for the nth call. Every body it saw is kept.
function planner(h, answer) {
  const seen = [];
  const transport = (env, body, model, org) => spendTransport(env, body, model, org, async () => {
    const [name, input] = answer(seen.length, body);
    seen.push(body);
    return Response.json({ model: MODEL, usage: { input_tokens: 100, output_tokens: 20 }, content: [{ type: 'tool_use', id: `tu_${seen.length}`, name, input }] });
  }, { userId: 'provider:platform', category: 'roadmap' });
  registerRoadmapHandlers({ registry: REGISTRY, transport, checkCallModel: h.m.callModel, classify, base: h.p.base });
  return seen;
}
const readThenSubmit = (n) => (n === 0 ? ['read_source_evidence', { terms: ['zebrafish'], maxChars: 2000 }] : ['submit_roadmap', PLAN]);
const R3 = `CREATE TABLE IF NOT EXISTS learn_source_refs (id TEXT PRIMARY KEY, org TEXT NOT NULL, owner_email TEXT NOT NULL, kind TEXT NOT NULL, source_key TEXT NOT NULL, source_home TEXT, source_name TEXT NOT NULL, source_rev TEXT NOT NULL,
  anchor_json TEXT NOT NULL, anchor_hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'current', checked_at INTEGER, created_at INTEGER NOT NULL);
  CREATE UNIQUE INDEX IF NOT EXISTS learn_source_refs_passage ON learn_source_refs (org, owner_email, source_key, source_rev, anchor_hash);`;

test('the whole flow: a late section of a long document is planned from the outline and one evidence read, explained, with the coverage limit shown and R3 references kept', async t => {
  const h = await loop(t, { md: DOC, envExtra: ON, script: [GOOD] });
  h.w.sqlite.exec(R3);
  // D1 limits that node:sqlite does not enforce: a statement over 100 bound parameters (the LIKE limit is already enforced by the world fixture).
  const prepare = h.env.LEARN_DB.prepare, widest = { n: 0 };
  h.env.LEARN_DB.prepare = sql => { const st = prepare.call(h.env.LEARN_DB, sql), bind = st.bind; st.bind = function (...v) { widest.n = Math.max(widest.n, v.length); return bind.apply(this, v); }; return st; };
  const seen = planner(h, readThenSubmit);

  const refused = await create(h, { kind: 'whole' });
  assert.equal(refused.status, 422);
  assert.equal(refused.body.limitation.choices[0].locationId, 'long', 'the whole document is the first thing offered');
  assert.ok(refused.body.limitation.choices.length > 1, 'sections are still offered (the R4 behaviour)');
  assert.equal(seen.length, 0);

  const made = await create(h, LONG);
  assert.equal(made.status, 202);
  const view = made.body;
  assert.equal(view.roadmap.scope.kind, 'long');
  assert.equal(view.roadmap.state, 'proposed');
  assert.equal(seen.length, 2, 'one evidence read, then the plan');
  // The prompt carries the outline and the tool, never the document.
  const first = seen[0], prompt = first.messages[0].content;
  assert.deepEqual(first.tools.map(x => x.name), ['submit_roadmap', 'read_source_evidence']);
  assert.match(prompt, /<outline revision=/);
  assert.ok(prompt.length < 40000, `the prompt is ${prompt.length} characters for a ${DOC.length} character document`);
  assert.ok(!prompt.includes('Zebrafish are mentioned only in the appendix'));
  assert.match(first.system, /LONG DOCUMENT MODE/);
  // The original text of the late section reached the model through the evidence read.
  const result = seen[1].messages[2].content[0];
  assert.equal(result.type, 'tool_result');
  assert.match(result.content, /Zebrafish are mentioned only in the appendix/);
  assert.match(result.content, new RegExp(`"start":${APPENDIX - 0}|"start":\\d+`));
  // The plan: steps are offsets of the live source; the learner reads the coverage limit first, and the structured account matches the steps.
  assert.equal(view.plan.steps[0].passage.start, APPENDIX);
  assert.match(view.plan.assumptions[0], /^Coverage: this plan teaches [\d,]+ of the [\d,]+ characters of this document\. Not covered: /);
  assert.match(view.plan.assumptions[0], /Start another roadmap on a section to cover the rest\.$/);
  const cov = view.plan.sourceCoverage;
  assert.equal(cov.totalChars, DOC.length);
  assert.equal(cov.plannedChars, (DOC.length - APPENDIX) + 3000);
  assert.ok(cov.notCovered.length > 10 && cov.notCovered.every(n => n.start < n.end), 'what is left out is named, never silently dropped');
  assert.ok(!cov.notCovered.some(n => n.start >= APPENDIX), 'the appendix, which the plan covers, is not listed as uncovered');
  assert.equal(cov.read.calls, 1);
  assert.ok(cov.read.chars > 0 && cov.read.chars <= 2000);
  // Quota and ledger rules are the R4 ones: every model turn is one counted plan call with its own checkpointed operation, platform-paid.
  assert.deepEqual(rows(h.w.sqlite, "SELECT stage, call_no AS call, payer, checkpoint FROM learn_roadmap_calls WHERE stage = 'draft' ORDER BY call_no").map(r => [r.stage, r.call, r.payer, r.checkpoint]), [['draft', 0, 'platform', 'settled'], ['draft', 1, 'platform', 'settled']]);
  assert.equal(rows(h.w.sqlite, "SELECT calls FROM learn_roadmap_quota WHERE scope = 'plan.hour'")[0].calls, 2);
  assert.equal((await h.totals()).used, 0, 'planning is never charged to the learner');
  assert.equal(rows(h.w.sqlite, 'SELECT prompt_version FROM learn_roadmap_plan_versions')[0].prompt_version, 'roadmap-plan-4+long-1');
  assert.ok(widest.n <= 100, `widest statement binds ${widest.n} parameters`);

  // Accept: R3 passage references are minted from the exact late passage.
  const id = made.body.roadmapId;
  const accepted = await h.json('POST', `/api/learn/roadmap/${id}/accept-plan`, { boardId: BOARD, revision: view.roadmap.revision, actionKey: KEY('plan'), planVersion: view.roadmap.planVersion });
  assert.equal(accepted.status, 200);
  const refs = rows(h.w.sqlite, 'SELECT s.position, r.source_rev, r.anchor_json FROM learn_roadmap_steps s JOIN learn_source_refs r ON r.id = s.source_ref_id ORDER BY s.position');
  assert.equal(refs.length, 2);
  assert.equal(JSON.parse(refs[0].anchor_json).quote.exact, DOC.slice(APPENDIX, DOC.length));
  assert.equal(refs[0].source_rev, h.rev);
  // The first step is explained from the late passage.
  const proposed = accepted; // accepting the plan offers the first proposal (core 74)
  assert.equal(proposed.body.proposal.title, 'What the appendix says about zebrafish');
  const bought = await h.json('POST', `/api/learn/roadmap/${id}/proposals/${proposed.body.proposal.id}/accept`, { boardId: BOARD, revision: proposed.body.roadmap.revision, actionKey: KEY('accept'), proposalVersion: proposed.body.proposal.version });
  assert.equal(bought.status, 202);
  assert.equal(bought.body.results[0].generation, 'generated');
  assert.ok(!h.m.calls.includes('roadmap_grounding_check'), 'owner MVP: no per-card citation check');
  assert.equal(JSON.parse(rows(h.w.sqlite, 'SELECT check_json FROM learn_step_results')[0].check_json).grounding.validation, 'not_run', 'recorded as not run, never as passed');
  const deliver = await h.json('POST', `/api/learn/roadmap/${id}/results/${bought.body.results[0].id}/deliver`, { boardId: BOARD, revision: bought.body.roadmap.revision, actionKey: KEY('deliver') });
  assert.equal(deliver.status, 200);
  assert.ok(deliver.body.cards[0].block.sourceRef, 'the delivered card carries its R3 reference');
});

test('hard budgets: turns, reads and evidence characters are bounded, and the last turn offers the plan tool only', async t => {
  const h = await loop(t, { md: DOC, envExtra: ON });
  const seen = planner(h, n => (n < LONG_LIMITS.turns - 1 ? ['read_source_evidence', { terms: ['paragraph'], maxChars: 24000 }] : ['submit_roadmap', PLAN]));
  const made = await create(h, LONG);
  assert.equal(made.body.roadmap.state, 'proposed');
  assert.equal(seen.length, LONG_LIMITS.turns);
  assert.deepEqual(seen.at(-1).tools.map(x => x.name), ['submit_roadmap'], 'no more reading on the last turn');
  assert.ok(seen.slice(0, -1).every(b => b.tools.length === 2));
  const read = made.body.plan.sourceCoverage.read;
  assert.ok(read.chars <= LONG_LIMITS.evidenceChars, `${read.chars} evidence characters`);
  assert.equal(read.calls, LONG_LIMITS.turns - 1);
  const results = seen.slice(1).map(b => b.messages.at(-1).content[0].content);
  assert.match(results.at(-1), /"charactersLeft":0?\d*/);
  assert.equal(rows(h.w.sqlite, "SELECT calls FROM learn_roadmap_quota WHERE scope = 'plan.hour'")[0].calls, LONG_LIMITS.turns, 'each turn is a counted plan call');
});

test('a model that reads on the last turn gets the one repair, then a typed failure: nothing is recorded', async t => {
  const h = await loop(t, { md: DOC, envExtra: ON });
  const seen = planner(h, () => ['read_source_evidence', { terms: ['paragraph'], maxChars: 400 }]);
  const made = await create(h, LONG);
  assert.equal(made.body.limitation.code, 'plan_failed');
  assert.equal(seen.length, LONG_LIMITS.turns + 1, 'the turns plus the one repair');
  assert.deepEqual(made.body.steps, []);
});

test('fallback to "choose a section": the switch off after creation, an unavailable model after the loop began, and a model unavailable before any call', async t => {
  // Switch turned off after the roadmap was made: the R4 limitation with the section choices, no model call.
  const h = await loop(t, { md: DOC, envExtra: ON });
  const seen = [];
  registerRoadmapHandlers({ callModel: async () => { seen.push(1); throw new Error('model down'); }, checkCallModel: h.m.callModel, classify, base: h.p.base });
  const made = await create(h, LONG);
  assert.equal(made.body.roadmap.state, 'draft', 'planning waits: the model was unavailable before any call was paid');
  h.env.ROADMAP_LONG_MARKDOWN_ENABLED = 'false';
  const [event] = rows(h.w.sqlite, "SELECT next_at FROM learn_roadmap_outbox WHERE kind = 'plan_requested'");
  assert.equal(await runDueRoadmapEvents(h.env, { now: event.next_at + 1 }), 1);
  const view = (await h.json('GET', `/api/learn/roadmap?boardId=${BOARD}`)).body;
  assert.equal(view.limitation.code, 'source_too_large');
  assert.deepEqual(view.limitation.offers.map(o => o.label), ['Select a passage', 'Pick a section']);
  assert.equal(seen.length, 1, 'only the first, unavailable attempt; the fallback made no model call');

  // The model fails after the first read: the learner is not asked to wait for a retry that would pay for the read again.
  const h2 = await loop(t, { md: DOC, envExtra: ON });
  const seen2 = planner(h2, n => { if (n === 0) return ['read_source_evidence', { terms: ['zebrafish'], maxChars: 2000 }]; throw new Error('provider down'); });
  const failed = (await create(h2, LONG)).body;
  assert.equal(failed.limitation.code, 'source_too_large');
  assert.ok(failed.limitation.choices.length > 1 && failed.limitation.choices.every(c => c.locationId && c.label));
  assert.ok(seen2.length <= 2);
  assert.equal(failed.roadmap.state, 'questioning');

  // Unavailable before any call (quota exhausted): transient, nothing recorded, nothing substituted; the event waits.
  const h3 = await loop(t, { md: DOC, envExtra: ON });
  planner(h3, readThenSubmit);
  const hourStart = Math.floor(Date.now() / 1000 / 3600) * 3600;
  h3.w.sqlite.prepare("INSERT INTO learn_roadmap_quota (org, owner_user_id, scope, window_start, calls, micros) VALUES ('team', 'u-alice', 'plan.hour', ?, 6, 0)").run(hourStart);
  const waiting = (await create(h3, LONG)).body;
  assert.equal(waiting.roadmap.state, 'draft');
  assert.equal(rows(h3.w.sqlite, 'SELECT * FROM learn_roadmap_plan_versions').length, 0);
});

test('flag off (ROADMAP_ENABLED true, the R7 switch unset): no D1 statement, model call or response field is added to the R4 flow', async t => {
  const h = await loop(t, { md: DOC });
  const sql = [];
  const prepare = h.env.LEARN_DB.prepare;
  h.env.LEARN_DB.prepare = text => { sql.push(text); return prepare.call(h.env.LEARN_DB, text); };
  const seen = planner(h, () => { throw new Error('no model call expected'); });
  const refused = await create(h, { kind: 'whole' });
  assert.equal(refused.status, 422);
  assert.equal(refused.body.code, 'source_too_large');
  assert.deepEqual(Object.keys(refused.body.limitation).sort(), ['code', 'message', 'offers', 'readChars', 'sourceChars']);
  const section = await create(h, LONG);
  assert.equal(section.status, 400, 'a section scope is not a scope while the switch is off');
  assert.equal(seen.length, 0);
  assert.ok(!sql.some(s => /learn_source_index/.test(s)), 'no statement touches the index tables');
  // A short source: the R4 plan has no new field and the request carries no long-document tool.
  const short = await loop(t, { plans: undefined });
  const shortSeen = [];
  registerRoadmapHandlers({ callModel: async (role, body) => { shortSeen.push(body); return short.m.callModel(role, body); }, checkCallModel: short.m.callModel, classify, base: short.p.base });
  const made = await short.json('POST', '/api/learn/roadmap', { boardId: BOARD, source: { key: `file:${ID_B}`, rev: short.rev, scope: { kind: 'whole' } }, instruction: 'Teach me gradient descent.', depth: 'balanced', actionKey: KEY('create') });
  assert.equal(made.status, 202);
  assert.equal(shortSeen.length, 1);
  assert.deepEqual(shortSeen[0].tools.map(x => x.name), ['submit_roadmap']);
  assert.ok(!('sourceCoverage' in made.body.plan));
  assert.ok(!/Coverage:/.test(JSON.stringify(made.body.plan)));
});

test('R7a verifier defects: CRLF fenced code does not start sections, and a file over the reader limit says so and offers nothing it cannot read', async t => {
  const crlf = '# A\r\n\r\ntext\r\n\r\n```\r\n# not a heading\r\n```\r\n\r\n# B\r\n\r\nmore\r\n'.replace(/\r\n/g, '\r\n');
  const { sections } = buildIndex(crlf);
  assert.deepEqual(sections.map(s => s.title), ['A', 'B'], 'the fence is closed, so the fake heading inside it is not a section');
  const h = await loop(t, { md: DOC, envExtra: ON });
  h.env.LEARN_MEDIA = { get: async () => { throw new Error('a file over the reader limit must not be fetched'); } };
  h.w.sqlite.prepare('UPDATE file_sources SET bytes = ?').run(3 * 1024 * 1024);
  const big = await create(h, { kind: 'whole' });
  assert.equal(big.status, 422);
  assert.equal(big.body.error, 'This file is too large to index (over 2 MB).', 'the learner is not told to choose a section that does not exist');
  assert.equal(big.body.limitation.message, big.body.error);
  assert.deepEqual(big.body.limitation.offers, []);
  assert.deepEqual(big.body.limitation.choices, []);
});
