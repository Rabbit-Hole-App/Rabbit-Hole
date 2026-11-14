import { test } from 'node:test';
import assert from 'node:assert/strict';
import { curveSliders, INTERACT_FAMILIES } from '../src/interact-families.js';
import { curveBriefs } from '../../web/src/interact-curve-briefs.js';
import { interactFixtures } from '../../web/src/interact-plan-fixtures.js';
import { parseScenePlan } from '../../web/src/interact-plan.js';
import { fillSystem } from '../src/interact-design-fill.js';

const { referenceCapabilities } = await interactFixtures();
test('the registered family owns its flat schema, fill text, independent variable and reference check at every depth', () => {
  assert.equal(INTERACT_FAMILIES.filter(f => f.id === 'curve-sliders').length, 1);
  for (const depth of ['brief', 'balanced', 'detailed']) {
    const m = curveSliders.module, info = m.briefSchema(depth);
    assert.equal(info.parse(curveBriefs[depth]).ok, true);
    assert.deepEqual(info.keys.inputs.map(i => i.id), ['k', ...(depth === 'brief' ? [] : ['x0']), ...(depth === 'detailed' ? ['xMarker'] : [])]);
    const text = fillSystem(depth, info, m);
    assert.match(text, /x is the independent variable over its domain/);
    assert.match(text, /no timeline/);
    for (const name of ['exp', 'log', 'sqrt', 'abs', 'min', 'max']) assert.ok(text.includes(name));
    const plan = m.expandBrief(curveBriefs[depth], depth, { catalogueHash: referenceCapabilities.catalogueHash });
    const checked = parseScenePlan(plan, referenceCapabilities);
    assert.equal(checked.ok, true, JSON.stringify(checked.problems));
    assert.deepEqual(m.referenceCheck(curveBriefs[depth], depth), { ok: true, failures: [] });
  }
});
