import test from 'node:test';
import assert from 'node:assert/strict';
import { imageExtractionTool, checkImageExtraction } from './inline-image-extraction.js';
import { INLINE_EQUATION_TOOL, checkEquation } from './inline-equation.js';

const source = { blockId: 'image', source: { id: 'original', rev: 'a'.repeat(64) }, coverage: 'whole-image' };
test('image extraction retains the existing equation validator and a separate immutable source receipt', () => {
  const wrapped = imageExtractionTool(INLINE_EQUATION_TOOL);
  assert.equal(wrapped.name, INLINE_EQUATION_TOOL.name);
  assert.deepEqual(wrapped.input_schema.properties.content, INLINE_EQUATION_TOOL.input_schema);
  const out = checkImageExtraction({ content: { latex: 'x^2' }, uncertainties: [{ location: 'exponent', message: 'Could be 2 or 3.' }] }, checkEquation, source);
  assert.equal(out.result.latex, 'x^2');
  assert.deepEqual(out.result.extraction.source, source);
  out.result.extraction.source.source.id = 'changed';
  assert.equal(source.source.id, 'original');
  assert.ok(checkImageExtraction({ content: { latex: '\\htmlClass{bad}{x}' }, uncertainties: [] }, checkEquation, source).error);
});
test('recognition limits reject fabricated fields, missing limits and oversized payloads', () => {
  for (const input of [
    { content: { latex: 'x' } },
    { content: { latex: 'x' }, uncertainties: [], source: { id: 'invented' } },
    { content: { latex: 'x' }, uncertainties: Array(9).fill({ location: 'a', message: 'b' }) },
    { content: { latex: 'x' }, uncertainties: [{ location: 'a', message: 'b', confidence: 1 }] },
    { content: { latex: 'x' }, uncertainties: [{ location: ' ', message: 'b' }] },
    { content: { latex: 'x' }, uncertainties: [{ location: 'a', message: 'b'.repeat(241) }] },
  ]) assert.ok(checkImageExtraction(input, checkEquation, source).error);
});
test('an unreadable diagram can clarify without inventing a graph', () => {
  const question = 'Which direction does the faint arrow point?';
  assert.deepEqual(checkImageExtraction({ clarify: { question } }, () => assert.fail('no diagram required'), source), { result: { kind: 'clarify', question } });
  for (const input of [{ clarify: { question }, content: {} }, { clarify: { question, confidence: 1 } }, { clarify: { question: ' ' } }]) {
    assert.ok(checkImageExtraction(input, () => assert.fail('no content validator'), source).error);
  }
});
