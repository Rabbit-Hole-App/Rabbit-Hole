// Owner 2026-11-07: the Tutor answers as an LLM. A plan or brief card stands alone (an empty assistant message) or carries the model's own words;
// no server or web file may write the canned "Here is the plan ... Generate makes it." sentences again.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const roots = [fileURLToPath(new URL('../src/', import.meta.url)), fileURLToPath(new URL('../../web/src/', import.meta.url))];
const files = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]);
const canned = /['"`]Here is (the|a|your)( updated| revised)? (plan|brief)\b|Generate makes it\.['"`]/;

test('no source file writes a canned plan or brief lead-in', () => {
  const found = [];
  for (const root of roots) for (const file of files(root).filter(f => /\.(m?js|jsx)$/.test(f) && !/\.test\./.test(f))) {
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (!/^\s*(\/\/|\*|\/\*)/.test(line) && canned.test(line)) found.push(`${relative(root, file).split(sep).join('/')}:${i + 1}: ${line.trim().slice(0, 100)}`);
    });
  }
  assert.deepEqual(found, []);
});
