// The calibration harness (scripts/code-explain-calibration.mjs) end to end with a stubbed model: the thirteen rows resolve against the nanoGPT fixture, the
// checks run, the report and the markdown are produced. No real model call, and no key needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROWS, markdown, runCalibration } from '../scripts/code-explain-calibration.mjs';

// A model that explains whatever it was shown: it anchors the first two lines of the first shown block and mentions train.py.
const model = async (env, body) => {
  const text = body.messages[0].content, shown = /### (\S+)  lines (\d+)-(\d+)/.exec(text);
  const [, path, a] = shown, start = Number(a);
  const input = {
    title: 'A stubbed answer', suggestions: ['One?', 'Two?', 'Three?'],
    files: [{ path, ranges: [{ id: 'r1', start, end: start + 1 }] }], mentioned: [{ id: 'm1', path: 'train.py', start: 1, end: 1 }],
    depths: {
      brief: { prose: 'It does a thing. It does it quietly.', anchors: [] },
      standard: { prose: 'First this happens. Then that happens.', anchors: [{ sentence: 0, target: 'r1' }, { sentence: 1, target: 'm1' }] },
      detailed: { prose: 'Why it happens. What moves through it.', anchors: [{ sentence: 0, target: 'r1' }], trace: { input: 'T = 4', steps: ['a', 'b'] } },
    },
  };
  return Response.json({ model: 'claude-sonnet-5-5', stop_reason: 'tool_use', usage: { input_tokens: 6000, output_tokens: 1200 }, content: [{ type: 'tool_use', id: 't', name: 'code_explain', input }] });
};

test('the thirteen rows of prompts file 8a run through the handler and make a pass/fail table and a JSON report', async t => {
  assert.deepEqual(ROWS.map(r => r.n), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  assert.deepEqual(ROWS.filter(r => r.n >= 11).map(r => r.use), ['use_codebase', 'debug_behavior', null]);
  const out = mkdtempSync(join(tmpdir(), 'cx-cal-'));
  t.after(() => rmSync(out, { recursive: true, force: true }));
  const err = console.error; console.error = () => {}; t.after(() => { console.error = err; });
  const report = await runCalibration({ out, callModel: model });
  assert.equal(report.results.length, 13);
  assert.ok(report.results.every(r => r.valid && r.firstTry && r.card), 'every row produced a validated card on the first try');
  assert.equal(report.summary.usd, 13 * Number(((6000 * 2 + 1200 * 10) / 1e6).toFixed(4)));
  // The checks are mechanical and can fail: the stub names nothing the rows ask for (row 1 wants the mask lines anchored).
  const one = report.results[0];
  assert.equal(one.pass, false);
  assert.deepEqual(one.checks.filter(c => !c.ok).map(c => c.name), ['Standard anchors the mask buffer line', 'Standard anchors the masked_fill line']);
  assert.ok(report.results.find(r => r.n === 8).checks.some(c => c.name === 'the second sentence corrects the premise'));
  assert.equal(report.summary.cross.length, 3);
  const md = readFileSync(join(out, 'code-explain-calibration.md'), 'utf8');
  assert.match(md, /\| 1 \| how does attention hide later tokens\? \| none \| FAIL \|/);
  assert.equal(md, markdown(JSON.parse(readFileSync(join(out, 'code-explain-calibration.json'), 'utf8'))), 'the file is the table of the JSON');
  assert.equal(JSON.parse(readFileSync(join(out, 'code-explain-calibration.json'), 'utf8')).results.length, 13);
});

// v1.1 (prompts file 5 and 8a-ii): the row records what failed on the first try, and the checks follow the new rules.
test('a row that needed the re-ask records its first-try errors in the JSON and the table; Brief identifiers and a missing trace are caught', async t => {
  const err = console.error; console.error = () => {}; t.after(() => { console.error = err; });
  let calls = 0;
  const flaky = async (env, body) => {
    const res = await model(env, body), msg = await res.json(), input = msg.content[0].input;
    if (++calls === 1) input.depths.brief.prose = 'One. Two. Three.'; // fails the handler's rule on the first try
    return Response.json(msg);
  };
  const report = await runCalibration({ rows: [ROWS[1]], callModel: flaky });
  const row = report.results[0];
  assert.equal(row.attempts, 2);
  assert.deepEqual(row.firstTryErrors, ['depths.brief has 3 sentences; at most 2']);
  assert.match(markdown(report), /\| after 2 tries \| depths\.brief has 3 sentences; at most 2 \|/);
  // A Brief with identifiers and a DETAILED with no trace fail their checks (row 5's run 1 miss: always_save_checkpoint in BRIEF).
  const identifiers = async (env, body) => { const msg = await (await model(env, body)).json(); msg.content[0].input.depths.brief.prose = 'It saves `ckpt` when always_save_checkpoint is set.'; return Response.json(msg); };
  const named = (await runCalibration({ rows: [ROWS[4]], callModel: identifiers })).results[0];
  assert.deepEqual(named.checks.filter(c => !c.ok && /^brief/.test(c.name)).map(c => c.detail), ['always_save_checkpoint'], 'ckpt is inside the question ckpt.pt');
  const noTrace = async (env, body) => { const msg = await (await model(env, body)).json(); delete msg.content[0].input.depths.detailed.trace; return Response.json(msg); };
  const bare = (await runCalibration({ rows: [ROWS[0]], callModel: noTrace })).results[0];
  assert.deepEqual([bare.valid, bare.attempts, bare.firstTryErrors[0].slice(0, 30)], [false, 2, 'depths.detailed needs a trace:']);
});
