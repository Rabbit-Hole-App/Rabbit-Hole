import test from 'node:test';
import assert from 'node:assert/strict';
import { cadExpression } from '../src/cad-expression.js';
import { validateDesign } from '../src/cad-contract.js';
import { cadModelRequest, runCadModel } from '../src/cad-model.js';

const parameters = { frame_width:160, frame_depth:120, frame_thickness:8, opening_width:110, opening_depth:80, hole_diameter:4.5 };
const expression = '(frame_width*frame_depth-opening_width*opening_depth)*frame_thickness-4*pi*(hole_diameter/2)*(hole_diameter/2)*frame_thickness';
const design = check => ({ source:'fixture source; never executed', brief:{title:'Frame', units:'mm', parameters, assumptions:[], requirements:[]}, checks:[check] });

test('recorded scanner failure is corrected by independent arithmetic, not measured values or looser tolerance', () => {
  const actual = 82691.06199011843; // Private report and separately verified handwritten STEP.
  const original = {id:'volume', kind:'volume_mm3', value:69172.2, tolerance:150};
  assert.ok(Math.abs(actual - original.value) > original.tolerance);
  const resolved = validateDesign(design({...original, expression}), {requireVolumeExpressions:true}).checks[0];
  assert.ok(Math.abs(resolved.value - (83200 - 162 * Math.PI)) < 1e-9);
  assert.ok(Math.abs(actual - resolved.value) <= original.tolerance);
  assert.equal(resolved.tolerance, 150);
  assert.equal(resolved.expression, undefined, 'executor still receives numeric protocol');
  assert.equal(original.value, 69172.2, 'historical check is not rewritten');
});

test('fresh volume requires expression; legacy numeric design remains unchanged', () => {
  const old = design({kind:'volume_mm3', value:69172.2, tolerance:150});
  assert.deepEqual(validateDesign(old), old);
  assert.throws(() => validateDesign(old, {requireVolumeExpressions:true}), /require.*expression/);
  for (const expression of ['69172.2','pi*10']) assert.throws(() => validateDesign(design({kind:'volume_mm3',expression,tolerance:150}), {requireVolumeExpressions:true}), /Invalid.*expression/);
  assert.equal(validateDesign(design({kind:'solid_count', value:1, tolerance:0}), {requireVolumeExpressions:true}).checks[0].value, 1);
});

test('precedence, grouping, unary signs, decimal/exponent literals and pi are deterministic', () => {
  assert.equal(cadExpression('2+3*4-(8/2)', {}), 10);
  assert.equal(cadExpression('-(2 + 3) * +4 + .5e2', {}), 30);
  assert.equal(cadExpression('pi', {pi:0}), Math.PI);
});

test('units conversion is explicit, never guessed from brief units', () => {
  const value = design({kind:'volume_mm3', expression:'w*d*h*10*10*10', tolerance:0.01});
  value.brief = {...value.brief, units:'cm', parameters:{w:2,d:3,h:4}};
  assert.equal(validateDesign(value, {requireVolumeExpressions:true}).checks[0].value, 24000);
});

test('malformed syntax, property access, calls and nonfinite arithmetic fail closed', () => {
  for (const source of ['', ' ', '1;fetch("x")', 'Math.PI', 'pi()', 'a.b', 'a[0]', '2**3', '2^3', '2 3', '()', '(1', '1)', '1+', 'unknown', '1/0', '1/-0', '1e309', '1e308*10', '1e308*10/10', 'Infinity', 'NaN']) {
    assert.throws(() => cadExpression(source, {}), /Invalid/, source);
  }
});

test('only own finite numeric parameters are accepted; prototype names are forbidden', () => {
  for (const name of [')','*','/']) assert.throws(() => cadExpression(name, {[name]:3}), /Invalid/);
  for (const name of ['constructor','prototype','__proto__']) assert.throws(() => cadExpression(name, JSON.parse(`{"${name}":3}`)), /Invalid/);
  assert.throws(() => cadExpression('inherited', Object.create({inherited:2})), /Invalid/);
  for (const a of [Infinity,NaN,'3',null,[]]) assert.throws(() => cadExpression('a', {a}), /Invalid/);
  const value = design({kind:'volume_mm3', expression:'a', tolerance:0});
  value.brief = {...value.brief, parameters:{a:Infinity}};
  assert.throws(() => validateDesign(value), /finite/);
});

test('length, token and recursion limits bound arithmetic work', () => {
  for (const source of ['1'.repeat(513), '1+'.repeat(65)+'1', '('.repeat(18)+'1'+')'.repeat(18), '-'.repeat(18)+'1']) assert.throws(() => cadExpression(source, {}), /Invalid/);
  assert.equal(cadExpression('('.repeat(16)+'1'+')'.repeat(16), {}), 1);
});

test('fresh provider response uses strict volume policy without retries or real network', async () => {
  const previous = globalThis.fetch;
  let calls = 0;
  let response = design({kind:'volume_mm3', value:69172.2, tolerance:150});
  globalThis.fetch = async () => { calls++; return Response.json({content:[{type:'text',text:JSON.stringify(response)}]}); };
  const env = {SMALL_ENV:'test', CAD_MODEL_ENABLED:'true', CAD_MODEL_API_KEY:'fixture-only', CAD_MODEL_WORKSPACE_ID:'fixture-only'};
  const job = {calls:1,reservedUsd:0.1,limits:{calls:2,usd:0.2},operationKey:'arithmetic-fixture',modelPhase:'generation',owner:{org:'arithmetic-fixture',email:'fixture@example.test'},prompt:'Create a frame'};
  try {
    const prompt = cadModelRequest(job).request.system;
    assert.match(prompt.slice(prompt.lastIndexOf('Trusted check schema:')), /Every fresh volume_mm3 check requires expression/);
    await assert.rejects(runCadModel(env, job, cadModelRequest(job)), /require.*expression/);
    assert.equal(calls, 1);
    response = design({kind:'volume_mm3', expression, tolerance:150});
    const result = await runCadModel(env, job, cadModelRequest(job));
    assert.ok(Math.abs(result.checks[0].value - 82691.06199011845) < 1e-9);
    assert.equal(calls, 2);
  } finally { globalThis.fetch = previous; }
});
