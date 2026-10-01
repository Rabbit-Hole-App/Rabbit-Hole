// Tutor v1 benchmark (docs/features/tutor-v1-implementation-map.md "Benchmarking") on the LOCAL
// integrated stack (docs/features/dive-v1.md "Run it locally": app 8788, control plane 8790).
// Each run opens a fresh Tutor board and plays the golden-trace turns through the real UI:
//   GT-01, GT-04, GT-03 (twice), GT-07, GT-06, GT-D1 (Go down + the hole's opening turn),
//   an answer in the hole, GT-D3 (back on the parent).
// Per turn it joins three sources: the routes' `telemetry` (JEV, larger evaluator, planner,
// tokens), the page's `small:tutor-bench` event (router decision, accepted/rejected actions,
// in-app timings) and what the browser sees (send -> first visible reply, error UI, hangs).
// Output: <out>/turns.jsonl (one record per turn) and <out>/summary.json, plus a printed summary.
// Real models are PAID: run by hand only. --stub scripts both routes in the browser (no model
// calls) to check the harness itself.
// Usage: node e2e/tutor-bench.mjs <out> [--runs N] [--stub] [--price-in USD_per_MTok --price-out USD_per_MTok]
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { cardModule, TUTOR_BOARD } from '../src/learn-tutor-claims.js';

const BASE = process.env.TUTOR_BASE || 'http://127.0.0.1:8788';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8790';
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(BASE)) throw Error('tutor-bench runs against the local stack only');
const args = process.argv.slice(2);
const flag = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const OUT = args.find((arg, i) => !arg.startsWith('--') && !args[i - 1]?.startsWith('--')) || 'tutor-bench-out';
const RUNS = Number(flag('--runs') || 1), STUB = args.includes('--stub');
const PRICE = { in: flag('--price-in') == null ? null : Number(flag('--price-in')), out: flag('--price-out') == null ? null : Number(flag('--price-out')) };
const TURN_LIMIT_MS = 75000; // past the client's 60 s bound: no reply by then is a frontend hang
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/turns.jsonl`, '');

const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'yudhisteer.chin@gmail.com', secret }) })).json();
const cookie = `small_session=${session}`;
const TITLE = id => cardModule(id).scene.title;
const AUTHORED = ['show_authored_card', 'focus_part', 'suggest_depth', 'suggest_practice'];

// The golden-trace turns. expect: what the trace documents; a mismatch is recorded, not thrown.
const say = text => ({ type: 'respond_text', text });
const TURNS = [
  { id: 'GT-01', card: 'depth-attention-overview', text: 'When it reads a character it looks back at earlier ones, mostly at one place, and never ahead.',
    expect: { route: ['uncertain'], evidence: { claim: 'attention/looks-back-never-ahead', result: 'pass' } },
    stub: { evaluation: { status: 'settled', evaluator: 'jev', events: [0, 1].map(() => ({ concept: 'attention', claim: 'attention/looks-back-never-ahead', settled: true, evaluator: 'jev', source: 'free_text', result: 'pass', kind: 'demonstrated_here' })) },
      plan: { strategy: 'feynman', move: 'next_rung', reason: '', actions: [say('Yes: it looks back, never ahead.'), { type: 'suggest_depth', card: 'depth-attention-overview', direction: 'deeper' }] } } },
  { id: 'GT-04', card: 'depth-attention-overview', text: "Don't simplify this. Show me the implementation.",
    expect: { noEvidence: true, authoredCard: 'depth-attention-deep' },
    stub: { evaluation: { status: 'settled', evaluator: 'jev', events: [] },
      plan: { strategy: 'none', move: 'go_deeper', reason: '', explicit_request: 'Show me the implementation', actions: [{ type: 'show_authored_card', card: 'depth-attention-deep', part_id: 'shapes', mode: 'navigate' }, say('Here is CausalSelfAttention.forward.')] } } },
  { id: 'GT-03a', card: 'c11-causal-mask', text: 'Position 99 has to see character 100, otherwise how can it predict it?',
    expect: { evidence: { claim: 'causal-mask/reads-self-and-earlier', result: 'misconception' } },
    stub: { evaluation: { status: 'uncertain', evaluator: 'jev', events: [{ concept: 'causal-mask', claim: 'causal-mask/reads-self-and-earlier', settled: false, evaluator: 'jev', source: 'free_text', result: 'misconception', misconception_id: 'reads-next-target', kind: null }] },
      plan: { strategy: 'feynman', move: 'clarify', reason: '', actions: [{ type: 'ask_question', text: 'What would row 99 be trained to predict?', claim: 'causal-mask/reads-self-and-earlier', purpose: 'diagnose' }] } } },
  { id: 'GT-03b', card: 'c11-causal-mask', text: 'Position 99 has to see character 100, otherwise how can it predict it?',
    expect: { route: ['misconception', 'uncertain_unsettled', 'uncertain'], strategy: ['socrates', 'feynman'] }, // GT-03: uncertain at minimum
    stub: { evaluation: { status: 'settled', evaluator: 'jev', events: [{ concept: 'causal-mask', claim: 'causal-mask/reads-self-and-earlier', settled: true, evaluator: 'jev', source: 'free_text', result: 'misconception', misconception_id: 'reads-next-target', kind: null }] },
      plan: { strategy: 'socrates', move: 'diagnose', reason: '', actions: [{ type: 'ask_question', text: 'If it could see 100, what is left to learn?', claim: 'causal-mask/reads-self-and-earlier', purpose: 'diagnose' }] } } },
  { id: 'GT-07', card: 'c11-causal-mask', text: "If block_size were 8, row 3 keeps columns 0 to 3, four of the eight. Column 4 is its own next character, so it's blocked with everything after it.",
    expect: { evidence: { claim: 'causal-mask/reads-self-and-earlier', result: 'pass' } },
    stub: { evaluation: { status: 'settled', evaluator: 'jev', events: [0, 1].map(() => ({ concept: 'causal-mask', claim: 'causal-mask/reads-self-and-earlier', settled: true, evaluator: 'jev', source: 'free_text', result: 'pass', kind: 'demonstrated_in_transfer' })) },
      plan: { strategy: 'none', move: 'ack', reason: '', actions: [say('Exactly: row 3 keeps columns 0 to 3.')] } } },
  { id: 'GT-06', card: 'depth-attention-guided', text: "I get that q·k gives a score, but why do the weights add up to one? Why isn't the score just the weight?",
    expect: { route: ['gap'], dive: 'softmax', maxSentences: 2 },
    stub: { evaluation: { status: 'settled', evaluator: 'jev', events: [{ concept: 'attention', claim: 'attention/weights-from-scores', settled: true, evaluator: 'jev', source: 'free_text', result: 'gap', prerequisite: 'softmax', kind: null }] },
      plan: { strategy: 'none', move: 'prerequisite', reason: '', actions: [say('Softmax looks like the missing piece.'), { type: 'suggest_dive', concept: 'softmax', title: 'Softmax' }] } } },
  { id: 'GT-D1', action: 'go_down', expect: { opening: true },
    stub: { plan: { strategy: 'feynman', move: 'explain', reason: '', actions: [say('In this hole: softmax turns scores into weights that add up to one.')] } } },
  { id: 'hole-answer', text: 'With scores 2, 1, 0: e² ≈ 7.4, e ≈ 2.7 and 1; divided by their sum 11.1 they are 0.67, 0.24 and 0.09, and they add up to one.',
    expect: { returnOffered: true },
    stub: { evaluation: { status: 'settled', evaluator: 'jev', events: [0, 1].map(() => ({ concept: 'softmax', claim: 'softmax/normalizes-to-one', settled: true, evaluator: 'jev', source: 'free_text', result: 'pass', kind: 'demonstrated_in_transfer' })) },
      plan: { strategy: 'none', move: 'ack', reason: '', actions: [say('Right - that is softmax.'), { type: 'return_from_dive' }] } } },
  { id: 'GT-D3', card: 'depth-attention-guided', text: 'I am back.', afterReturn: true,
    expect: { route: ['returned'], returnedFrom: true },
    stub: { evaluation: { status: 'settled', evaluator: 'jev', events: [] },
      plan: { strategy: 'socrates', move: 're-check', reason: '', actions: [{ type: 'ask_question', text: 'So why do the attention weights add up to one?', claim: 'attention/weights-from-scores', purpose: 'transfer' }] } } },
];

const browser = await chromium.launch();
const records = [];
let serverCold = true; // the first turn after the stack started (JEV/Anthropic connections cold)
for (let run = 1; run <= RUNS; run++) {
  const root = await (await fetch(`${BASE}/api/canvases`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ title: `Attention (Tutor bench ${run})` }) })).json();
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  await context.addInitScript(() => { window.__bench = []; window.addEventListener('small:tutor-bench', event => window.__bench.push({ ...event.detail, at: performance.now() })); });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  let current = null;
  if (STUB) {
    await page.route('**/api/learn/tutor/evaluate', route => route.fulfill({ json: { ...(current?.stub?.evaluation || { status: 'settled', evaluator: 'jev', events: [] }), telemetry: { jev: { called: true, ms: 100, outcome: current?.stub?.evaluation?.status || 'settled', claims: 1, ideas: 2, questions: 5, error: null }, larger: { called: false, ms: null, outcome: null, reason: null } } } }));
    await page.route('**/api/learn/tutor/plan', async route => { await new Promise(resolve => setTimeout(resolve, 300)); await route.fulfill({ json: { ...current.stub.plan, telemetry: { ms: 300, requested_model: 'claude-opus-5-5', served_model: 'stub', input_tokens: 1000, output_tokens: 200, stop_reason: 'tool_use', outcome: 'ok' } } }); });
  }
  const bodies = [];
  page.on('response', async response => {
    if (!response.url().includes('/api/learn/tutor/')) return;
    const body = await response.json().catch(() => null);
    bodies.push({ path: new URL(response.url()).pathname, status: response.status(), body, plan: response.url().endsWith('/plan') ? response.request().postDataJSON()?.context : null });
  });
  const cardEl = id => page.locator('[data-block-id]:not([data-chat-block])', { hasText: TITLE(id) }).first();
  const select = async id => {
    const collapse = page.getByRole('button', { name: 'Collapse chat' });
    if (await collapse.count() && await collapse.first().isVisible()) await collapse.first().click();
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press('Shift+Digit1'); await page.waitForTimeout(500);
    await cardEl(id).locator('[data-drag-zone]').last().click(); await page.waitForTimeout(250);
  };
  const composer = () => page.locator('[data-learn-dock] textarea, [data-learn-dock] input:not([type="file"])').first();
  const replies = () => page.evaluate(() => [...document.querySelectorAll('[data-learn-dock] div')].filter(node => String(node.className).includes('border-accent/30') || node.getAttribute('role') === 'alert').map(node => node.innerText));
  const spinning = () => page.getByText('Thinking...').count();
  await page.goto(`${BASE}/apps/${root.name}?board=${TUTOR_BOARD}`);
  await page.waitForSelector('[data-tool-gutter]', { timeout: 30000 }); await page.waitForTimeout(1500);
  let hole = null, runFirst = true;

  for (const turn of TURNS) {
    current = turn;
    const before = { bodies: bodies.length, bench: await page.evaluate(() => window.__bench.length), replies: (await replies()).length };
    if (turn.afterReturn) {
      const back = page.locator('[data-tutor-chips]').getByText('Back up the Rabbit Hole');
      if (await back.count()) await back.click(); else await page.locator('[data-dive-navigator]').getByRole('button', { name: 'Up to the parent hole' }).click().catch(() => {});
      await page.waitForFunction(name => location.pathname === `/apps/${name}` && !location.search.includes('hole='), root.name, { timeout: 20000 }).catch(() => {});
      await page.waitForSelector('[data-tool-gutter]'); await page.waitForTimeout(1500);
      before.replies = (await replies()).length;
    }
    if (turn.card) await select(turn.card);
    const sent = Date.now();
    if (turn.action === 'go_down') {
      const button = page.getByRole('button', { name: 'Go down a Rabbit Hole' });
      if (!(await button.count())) { records.push(write({ run, turn: turn.id, skipped: 'no dive suggestion on the previous turn' })); continue; }
      await button.click();
      await page.waitForFunction(() => location.search.includes('hole='), null, { timeout: 20000 }).catch(() => {});
      hole = new URL(page.url()).searchParams.get('hole');
      before.replies = 0; // a new page: the hole's own chat
    } else {
      await composer().click(); await composer().fill(turn.text); await composer().press('Enter');
    }
    // First visible reply: a new non-empty reply bubble (or error) with no spinner left.
    let visible = null, hang = false;
    while (Date.now() - sent < TURN_LIMIT_MS) {
      const shown = await replies().catch(() => []);
      if (shown.length > before.replies && shown.at(-1).trim() && !(await spinning())) { visible = Date.now() - sent; break; }
      await page.waitForTimeout(50);
    }
    if (visible == null) hang = true;
    await page.waitForTimeout(400);
    const bench = (await page.evaluate(start => window.__bench.slice(start), before.bench)).at(-1) || null;
    const mine = bodies.slice(before.bodies);
    const evaluate = mine.find(item => item.path.endsWith('/evaluate'));
    const plan = mine.find(item => item.path.endsWith('/plan'));
    const reply = (await replies()).at(-1) || '';
    const record = {
      run, turn: turn.id, cold: serverCold, run_first: runFirst, stub: STUB,
      ui: { first_visible_ms: visible, hang, error_ui: /^\s*✗/.test(reply), timeout: /took too long/.test(reply), stopped: reply.trim() === 'Stopped.', reply_sentences: reply.trim() ? reply.trim().split(/(?<=[.!?])\s+/).length : 0 },
      evaluation: evaluate ? { status: evaluate.body?.status, evaluator: evaluate.body?.evaluator, http: evaluate.status, events: (evaluate.body?.events || []).map(event => ({ claim: event.claim, result: event.result, settled: event.settled, kind: event.kind ?? null, misconception_id: event.misconception_id ?? null, prerequisite: event.prerequisite ?? null })), larger_error: evaluate.body?.larger_error ?? null, telemetry: evaluate.body?.telemetry ?? null } : null,
      planner: plan ? { http: plan.status, strategy: plan.body?.strategy ?? null, requested: (plan.body?.actions || []).map(action => action.type), error: plan.status === 200 ? null : plan.body?.error ?? null, telemetry: plan.body?.telemetry ?? null, returned_from: plan.plan?.dive_context?.returned_from ? { dive_id: plan.plan.dive_context.returned_from.dive_id, claim: plan.plan.dive_context.returned_from.claim } : null } : null,
      app: bench,
    };
    record.checks = check(turn, record, hole);
    records.push(write(record));
    console.log(`run ${run} ${turn.id}: ${visible ?? 'HANG'} ms, route ${bench?.route ?? '-'}, ${record.checks.pass ? 'as expected' : `MISMATCH ${record.checks.failed.join('; ')}`}`);
    serverCold = false; runFirst = false;
  }
  if (pageErrors.length) console.log('page errors:', pageErrors.join(' | '));
  await context.close();
}
await browser.close();

function write(record) { appendFileSync(`${OUT}/turns.jsonl`, `${JSON.stringify(record)}\n`); return record; }

// Pedagogical correctness against the golden trace: evidence, route, actions, authored card,
// Rabbit Hole suggestion and return context.
function check(turn, record, hole) {
  const failed = [], e = turn.expect || {};
  const events = record.evaluation?.events || [];
  const accepted = record.app?.accepted_actions || [];
  if (e.route && !e.route.includes(record.app?.route)) failed.push(`route ${record.app?.route} not in ${e.route.join('|')}`);
  if (e.strategy && !e.strategy.includes(record.planner?.strategy)) failed.push(`strategy ${record.planner?.strategy}`);
  if (e.evidence && !events.some(event => event.claim === e.evidence.claim && event.result === e.evidence.result)) failed.push(`evidence: no ${e.evidence.result} on ${e.evidence.claim}`);
  if (e.noEvidence && events.some(event => ['pass', 'fail', 'misconception'].includes(event.result))) failed.push('a request produced evidence');
  if (e.authoredCard && !accepted.some(type => ['show_authored_card', 'focus_part'].includes(type))) failed.push('no authored card shown');
  if (e.dive && !accepted.includes('suggest_dive')) failed.push('no Rabbit Hole suggestion');
  if (e.maxSentences && record.ui.reply_sentences > e.maxSentences) failed.push(`${record.ui.reply_sentences} sentences before the suggestion`);
  if (e.opening && !record.planner) failed.push('no opening turn planned');
  if (e.returnOffered && !accepted.includes('return_from_dive')) failed.push('no return offered');
  if (e.returnedFrom && record.planner?.returned_from?.dive_id !== hole) failed.push('return context missing the hole');
  if (record.ui.hang) failed.push('frontend hang');
  if (record.ui.error_ui) failed.push('error UI');
  return { pass: !failed.length, failed };
}

// ---------- Aggregate ----------
const done = records.filter(record => !record.skipped);
const stats = values => {
  const list = values.filter(value => typeof value === 'number').sort((a, b) => a - b);
  if (!list.length) return { count: 0 };
  const at = q => list[Math.min(list.length - 1, Math.ceil(q * list.length) - 1)];
  return { count: list.length, mean: Math.round(list.reduce((sum, value) => sum + value, 0) / list.length), p50: at(0.5), p95: at(0.95), max: list.at(-1) };
};
const split = pick => ({ all: stats(done.map(pick)), cold: stats(done.filter(record => record.cold).map(pick)), warm: stats(done.filter(record => !record.cold).map(pick)) });
const jev = record => record.evaluation?.telemetry?.jev, larger = record => record.evaluation?.telemetry?.larger, planner = record => record.planner?.telemetry;
const tokens = record => (planner(record)?.input_tokens || 0) + (planner(record)?.output_tokens || 0) + (larger(record)?.input_tokens || 0) + (larger(record)?.output_tokens || 0);
const count = test => done.filter(test).length;
const n = done.length || 1;
const inTok = done.reduce((sum, record) => sum + (planner(record)?.input_tokens || 0) + (larger(record)?.input_tokens || 0), 0);
const outTok = done.reduce((sum, record) => sum + (planner(record)?.output_tokens || 0) + (larger(record)?.output_tokens || 0), 0);
const cost = PRICE.in != null && PRICE.out != null ? (inTok * PRICE.in + outTok * PRICE.out) / 1e6 : null;
const jevCalls = count(record => jev(record)?.called), largerCalls = count(record => larger(record)?.called), plannerCalls = count(record => record.planner);
const summary = {
  when: new Date().toISOString(), runs: RUNS, turns: done.length, skipped: records.length - done.length, stub: STUB,
  models: { planner: [...new Set(done.map(record => planner(record)?.served_model).filter(Boolean))], larger: [...new Set(done.map(record => larger(record)?.served_model).filter(Boolean))] },
  latency_ms: {
    jev: split(record => jev(record)?.ms), larger_evaluator: split(record => larger(record)?.ms), planner: split(record => planner(record)?.ms),
    first_visible_response: split(record => record.ui.first_visible_ms), evidence_ready_in_app: split(record => record.app?.ms?.to_evidence_ready),
    planner_ready_in_app: split(record => record.app?.ms?.to_planner_ready), canvas_action_complete_in_app: split(record => record.app?.ms?.canvas_done),
  },
  reliability: {
    jev_timeouts: count(record => jev(record)?.outcome === 'timeout'), jev_errors: count(record => jev(record)?.outcome === 'error'),
    larger_timeouts: count(record => larger(record)?.outcome === 'timeout'), larger_errors: count(record => larger(record)?.outcome === 'error'),
    planner_timeouts: count(record => record.ui.timeout), planner_errors: count(record => record.planner && record.planner.http !== 200),
    invalid_structured_outputs: count(record => planner(record)?.outcome === 'invalid'), rejected_actions: done.reduce((sum, record) => sum + (record.app?.rejected?.filter(line => /^dropped|^downgraded/.test(line)).length || 0), 0),
    frontend_hangs: count(record => record.ui.hang), error_ui_turns: count(record => record.ui.error_ui),
  },
  correctness: { turns_as_expected: count(record => record.checks.pass), by_turn: Object.fromEntries(TURNS.map(turn => [turn.id, { as_expected: count(record => record.turn === turn.id && record.checks.pass), of: count(record => record.turn === turn.id), failures: [...new Set(done.filter(record => record.turn === turn.id).flatMap(record => record.checks.failed))] }])) },
  efficiency: {
    jev_calls_per_turn: +(jevCalls / n).toFixed(2), larger_calls_per_turn: +(largerCalls / n).toFixed(2), planner_calls_per_turn: +(plannerCalls / n).toFixed(2),
    larger_escalation_rate: jevCalls ? +(largerCalls / jevCalls).toFixed(2) : null,
    authored_content_reuse_rate: +(count(record => (record.app?.accepted_actions || []).some(type => AUTHORED.includes(type))) / n).toFixed(2),
    generated_text_rate: +(count(record => (record.app?.accepted_actions || []).some(type => type === 'respond_text' || type === 'ask_question')) / n).toFixed(2),
    model_tokens_per_turn: Math.round(done.reduce((sum, record) => sum + tokens(record), 0) / n), input_tokens: inTok, output_tokens: outTok,
    price_per_mtok: PRICE, est_cost_per_turn_usd: cost == null ? null : +(cost / n).toFixed(4), est_cost_per_100_turns_usd: cost == null ? null : +(cost / n * 100).toFixed(2),
    note: 'JEV (TypeSafe) is not priced here; cost covers the Anthropic calls at the supplied per-MTok prices.',
  },
};
writeFileSync(`${OUT}/summary.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
