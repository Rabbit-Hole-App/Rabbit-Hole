// The orchestrator's route budget (learn-render motion/spend-bound.mjs routeBudget; docs/features/motion-admission-policy.md) against the CHECKED-IN
// configuration: whenever fly.orchestrator.toml turns MOTION_ROUTE_BUDGET_CHECK on, its job ceiling must carry the budget (else the orchestrator refuses
// to start, and a test fails here first), and the signed maximum charge must still cover the ceiling (motion-credit-disclosure.test.js). Pure: nothing is paid.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PRODUCTION_POLICY } from '../../learn-render/motion/orchestrator.mjs';
import { modelsFor, routeBudget } from '../../learn-render/motion/spend-bound.mjs';

const toml = readFileSync(new URL('../../learn-render/motion/service/fly.orchestrator.toml', import.meta.url), 'utf8').replace(/^\s*#.*$/gm, '');
const setting = name => toml.match(new RegExp(`^\\s*${name}\\s*=\\s*"([^"]*)"`, 'm'))?.[1];

test('when the checked-in orchestrator config turns the route budget check on, its ceiling carries the budget; the check and the ceiling change together', () => {
  const budget = routeBudget(PRODUCTION_POLICY, modelsFor({})).micros;
  assert.equal(budget, 4_811_120, 'the budget is what the policy candidate documents; a change is an owner-visible change');
  const ceiling = setting('MOTION_JOB_CEILING_USD'), check = setting('MOTION_ROUTE_BUDGET_CHECK');
  assert.ok([undefined, '1'].includes(check), `MOTION_ROUTE_BUDGET_CHECK is "1" or absent, got ${check}`);
  if (check === '1') assert.ok(ceiling !== undefined && Math.round(Number(ceiling) * 1e6) >= budget, `route check on, ceiling ${ceiling} below the budget ${budget / 1e6}`);
  // Negative control: the 3.50 ceiling does NOT carry the budget, so a config that turned the check on at 3.50 would fail the line above.
  assert.ok(Math.round(3.5 * 1e6) < budget);
});
