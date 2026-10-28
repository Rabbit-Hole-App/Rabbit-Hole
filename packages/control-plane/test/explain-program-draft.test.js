// checkProgramDraft on untrusted, wrong-typed model output: every malformed field is a bounded validation problem that names the field path,
// the expected type and the observed type (so the existing repair flow can act on it), and nothing throws. A valid draft still passes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkProgramDraft, PROGRAM_LIMITS } from '../src/explain-program.js';

const SOURCE = 'export function evaluate() { return { frame: { objects: [] }, quantities: {} }; }';
const MANIFEST = { title: 'T', summary: 'S', assumptions: ['a'], description: 'D', duration: 4, readouts: [{ id: 'r', label: 'R' }], capabilities: ['time_playback', 'number_inputs', 'select_inputs'],
  inputs: [{ type: 'number', id: 'x', label: 'X', default: 1, min: 0, max: 2 }, { type: 'select', id: 's', label: 'S', default: 'a', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] }] };
const GOOD = { source: SOURCE, manifest: MANIFEST };
const WRONG = ['text', 7, null, true, [], {}, [1], ['a'], [null], { a: 1 }, NaN, undefined];
const draftWith = (path, value) => {
  const draft = structuredClone(GOOD);
  let at = draft;
  for (const key of path.slice(0, -1)) at = at[key];
  at[path.at(-1)] = value;
  return draft;
};

test('a valid draft passes, and its capabilities are read as a list of strings', () => {
  assert.equal(checkProgramDraft(GOOD).bundle.manifest.capabilities.length, 3);
  assert.ok(PROGRAM_LIMITS.inputs >= 2);
});

test('capabilities that are a string, an object, null, a number or a list of non-strings are validation problems with path, expected and observed type, never a throw', () => {
  const cases = [['text', /manifest\.capabilities: .*expected array, received string/], [{}, /expected array, received object/], [{ a: 1 }, /expected array, received object/], [null, /expected array, received null/],
    [7, /expected array, received number/], [true, /expected array, received boolean/], [[5], /manifest\.capabilities\.0: .*expected string, received number/], [[null], /capabilities\.0: .*expected string, received null/], [[{}], /capabilities\.0: .*expected string, received object/]];
  for (const [value, pattern] of cases) {
    const checked = checkProgramDraft(draftWith(['manifest', 'capabilities'], value));
    assert.equal(checked.bundle, undefined, JSON.stringify(value));
    assert.equal(checked.gap, undefined, `${JSON.stringify(value)} is malformed, not an unsupported capability`);
    assert.match(checked.problems.join(' | '), pattern, JSON.stringify(value));
    assert.ok(checked.problems.every(problem => problem.length <= 400));
  }
  // A genuinely unsupported capability name is still a gap, not a repair.
  assert.equal(checkProgramDraft(draftWith(['manifest', 'capabilities'], ['three_d_world'])).gap.needs[0], 'other');
});

test('every field of the draft, wrong-typed, is a problem or a pass and never a throw', () => {
  const paths = [['source'], ['manifest'], ...Object.keys(MANIFEST).map(key => ['manifest', key]), ...Object.keys(MANIFEST.inputs[0]).map(key => ['manifest', 'inputs', 0, key]), ...Object.keys(MANIFEST.inputs[1]).map(key => ['manifest', 'inputs', 1, key]),
    ['manifest', 'inputs', 1, 'options', 0], ['manifest', 'inputs', 1, 'options', 0, 'value'], ['manifest', 'inputs', 1, 'options', 0, 'label'], ['manifest', 'readouts', 0], ['manifest', 'assumptions', 0], ['manifest', 'capabilities', 0], ...Object.keys(MANIFEST.readouts[0]).map(key => ['manifest', 'readouts', 0, key])];
  let checkedCount = 0;
  for (const path of paths) for (const value of WRONG) {
    const draft = draftWith(path, value);
    assert.doesNotThrow(() => checkProgramDraft(draft), `${path.join('.')} = ${String(JSON.stringify(value))}`);
    const checked = checkProgramDraft(draft);
    assert.ok(checked.bundle || checked.gap || checked.problems?.length, `${path.join('.')} gets a verdict`);
    if (checked.problems) assert.ok(checked.problems.every(problem => typeof problem === 'string' && problem.length <= 400));
    checkedCount++;
  }
  assert.ok(checkedCount > 300);
  for (const draft of WRONG) assert.doesNotThrow(() => checkProgramDraft(draft), `the draft itself: ${String(JSON.stringify(draft))}`);
  assert.deepEqual(checkProgramDraft('text'), { problems: ['the program must be {source, manifest}'] });
});
