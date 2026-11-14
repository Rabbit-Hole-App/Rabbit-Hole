// bench-design-mvp.mjs harness proof ($0, no network): the brief extracted from each pinned toss plan passes end to end (expand, plan checks, formula check, template build, headless run, arrow rule, match to the
// approved card), a wrong formula fails with the role, the point, got and expected, the match rule names what differs, the family arrow oracle exists for the three depths, and the report reads rows.
import test from 'node:test';
import assert from 'node:assert/strict';
import { interactFixtures } from '../../web/src/interact-plan-fixtures.js';
import { extractBrief } from '../../web/src/interact-plan-brief.js';
import { scriptedAdapter } from '../src/interact-fixtures.js';
import { verticalThrowArrowOracle } from '../src/interact-oracle.js';
import { DEPTHS, designAttempt, fillSystem, matchProblems, reportMarkdown, scriptedDesignAdapter } from '../../../scripts/interact/bench-design-mvp.mjs';
import { briefSchema } from '../../web/src/interact-plan-brief.js';
import { SCENE_TEACHING_GUIDE } from '../src/agents/interact-design-author.js';
import { benchContext } from '../../../scripts/interact/bench-author.mjs';

const { referencePlans } = await interactFixtures();
const PINNED = { brief: 'tossOverview', balanced: 'tossStandard', detailed: 'tossDeep' };
const ctxOf = adapter => benchContext({ model: 'gemini-3.5-flash-lite', env: {}, scripted: adapter });

test('the brief of each pinned toss plan passes end to end at its depth, $0', async () => {
  for (const depth of DEPTHS) {
    const row = await designAttempt({ depth, model: 'gemini-3.5-flash-lite', ctx: ctxOf(scriptedDesignAdapter()) });
    assert.equal(row.result, 'pass', `${depth}: [${row.step}] ${row.firstProblem}`);
    assert.equal(row.step, 'done');
    assert.equal(row.costUsd ?? 0, 0);
    assert.ok(row.msFill >= 0 && row.msExpand >= 0 && row.msChecks > 0 && row.msBuild > 0 && row.msTotal > 0, JSON.stringify(row));
    assert.ok(row.oracleChecked > 0, `${depth}: the arrow rule checked ${row.oracleChecked} rows`);
  }
});

test('a wrong formula is a failed row naming the role, the point, got and expected', async () => {
  const wrong = scriptedAdapter({ build_author: async ({ input }) => {
    const brief = extractBrief(referencePlans[PINNED[input.depth]], input.depth);
    brief.formulas.velocity = { ...brief.formulas.velocity, formula: 'launchSpeed - gravity * t^2' }; // the toss's velocity is linear in t
    return brief;
  } });
  const row = await designAttempt({ depth: 'brief', model: 'gemini-3.5-flash-lite', ctx: ctxOf(wrong) });
  assert.equal(row.result, 'fail');
  assert.equal(row.step, 'formulas');
  assert.match(row.firstProblem, /velocity/);
  assert.match(row.firstProblem, /got .*expected|expected .*got/i);
});

test('the match to the approved card names what differs: ids, units, a default outside the range, a range too wide or too narrow, a changed fixed value', () => {
  const pinned = referencePlans.tossStandard, same = structuredClone(pinned);
  assert.deepEqual(matchProblems(same, pinned), []);
  const bent = structuredClone(pinned), speed = bent.controls.find(c => c.binding.id === 'launchSpeed');
  Object.assign(speed, { min: 0, max: 20, unit: 'km/h' }); speed.default = 25;
  const problems = matchProblems(bent, pinned);
  assert.ok(problems.some(p => /unit "km\/h"/.test(p)), problems.join('|'));
  assert.ok(problems.some(p => /default 25 is outside/.test(p)), problems.join('|'));
  assert.ok(problems.some(p => /6\.67x as wide|x as wide/.test(p)), problems.join('|'));
  const narrow = structuredClone(pinned), g = narrow.controls.find(c => c.binding.id === 'gravity');
  Object.assign(g, { min: 9, max: 10, default: 9.5 });
  assert.ok(matchProblems(narrow, pinned).some(p => /"gravity" range 9 to 10/.test(p)));
  const fixed = structuredClone(referencePlans.tossOverview); fixed.mode.fixedValues.gravity = 3.7;
  assert.ok(matchProblems(fixed, referencePlans.tossOverview).some(p => /fixed gravity is 3\.7/.test(p)));
});

test('the family arrow oracle exists for the three reference plans (with arrow rows, no numeric rows) and not for a plan off the family', () => {
  for (const depth of DEPTHS) {
    const oracle = verticalThrowArrowOracle(referencePlans[PINNED[depth]]);
    assert.ok(oracle?.arrows?.length > 0 && oracle.expect.length === 0, `${depth}: ${JSON.stringify(oracle)?.slice(0, 120)}`);
    assert.ok(oracle.arrows.some(a => a.id.startsWith('vec.a') && a.dir === 'down'));
  }
  assert.equal(verticalThrowArrowOracle({ depth: 'brief', mode: { kind: 'experiment', fixedValues: {}, timeline: null }, scene: { runtime: { renderer: 'spec' } }, supportingVisuals: [], controls: [] }), null);
});

test('the fill system text carries the teaching guide verbatim, the family description and the keys, and no examples; the model input is the request and the depth only', () => {
  const system = fillSystem('balanced', briefSchema('balanced'));
  assert.ok(system.startsWith(SCENE_TEACHING_GUIDE), 'the guide first, unedited');
  assert.match(system, /Return the brief only/);
  assert.ok(!/for example [^t]/i.test(system.replace(SCENE_TEACHING_GUIDE, '').replace('for example t^2', '')), 'no examples outside the grammar line');
});

test('the report reads rows: pass counts, medians and the top three first problems per model', () => {
  const rows = [
    { model: 'm', depth: 'brief', result: 'pass', msFill: 2000, msTotal: 3000, costUsd: 0.002 }, { model: 'm', depth: 'brief', result: 'fail', msFill: 4000, msTotal: 5000, costUsd: 0.004, firstProblem: 'a' },
    { model: 'm', depth: 'brief', result: 'fail', msFill: 6000, msTotal: 7000, costUsd: 0.006, firstProblem: 'a' }, { model: 'm', depth: 'balanced', result: 'fail', msFill: 1000, msTotal: 1000, costUsd: 0.001, firstProblem: 'b' },
  ];
  const md = reportMarkdown(rows);
  assert.match(md, /\| m \| brief \| 3 \| 1\/3 \| 4\.0 \| 5\.0 \| 0\.0040 \|/);
  assert.match(md, /- 2x a/);
  assert.match(md, /- 1x b/);
});
