// Brief 21: a registered family's files must have check-map rows, and the generator writes them. Fails when a family lands without its rows.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registeredFamilies } from '../../packages/web/src/interact-family-registry.js';
import { registerBuiltinFamilies } from '../../packages/web/src/interact-family-index.js';
import { applyFamilyRows, familyRows, missingRows } from './gen-family-check-map.mjs';

registerBuiltinFamilies();
const text = readFileSync(new URL('./check-map.json', import.meta.url), 'utf8'), map = JSON.parse(text);
const stub = { id: 'stub', checkMap: { 'packages/web/src/interact-family-stub.js': ['packages/web/src/interact-family-stub.test.mjs'], 'packages/web/src/interact-templates/stub-one.js': ['packages/web/src/interact-family-stub.test.mjs'] } };

test('every registered family has its rows in check-map.json, exactly as it declares them', () => {
  assert.ok(registeredFamilies().length >= 2);
  assert.deepEqual(missingRows(map), []);
  for (const family of registeredFamilies()) assert.ok(Object.keys(family.checkMap).length, `${family.id} declares rows`);
});

test('a registered family whose files lack rows fails, a family that declares none fails, and the generator adds the rows', () => {
  assert.deepEqual(missingRows(map, [stub]).map(p => [p.path, p.problem]), [
    ['packages/web/src/interact-family-stub.js', 'no row in check-map.json'], ['packages/web/src/interact-templates/stub-one.js', 'no row in check-map.json']]);
  assert.match(missingRows(map, [{ id: 'bare' }])[0].problem, /declares no checkMap rows/);
  const next = applyFamilyRows(text, familyRows([stub])), parsed = JSON.parse(next);
  assert.deepEqual(parsed.mapped['packages/web/src/interact-family-stub.js'], stub.checkMap['packages/web/src/interact-family-stub.js']);
  assert.deepEqual(missingRows(parsed, [stub]), []);
  assert.deepEqual(Object.keys(parsed.mapped).slice(0, -2), Object.keys(map.mapped), 'the existing rows stay in place, the new ones are appended');
  assert.equal(applyFamilyRows(next, familyRows([stub])), next, 'writing the same rows again changes nothing');
  assert.equal(applyFamilyRows(text, familyRows()), text, 'the registered families already hold every row in the file');
});

test('a file with CRLF line endings is edited and written back as CRLF', () => {
  const crlf = text.replace(/\r?\n/g, '\r\n'), next = applyFamilyRows(crlf, familyRows([stub]));
  assert.ok(next.includes('\r\n') && !/[^\r]\n/.test(next));
  assert.deepEqual(missingRows(JSON.parse(next), [stub]), []);
});
