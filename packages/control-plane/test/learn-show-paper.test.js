import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHOW_PAPER_TOOL, validateShowPaper } from '../src/arxiv.js';

const read = [{ id: '1706.03762', title: 'Attention Is All You Need', pdfUrl: 'https://arxiv.org/pdf/1706.03762' }];

test('the tool asks for a paper and a page, both required', () => {
  assert.equal(SHOW_PAPER_TOOL.name, 'show_paper');
  assert.deepEqual(SHOW_PAPER_TOOL.input_schema.required, ['id', 'page']);
});

test('showing a paper the agent read returns what the reader needs', () => {
  assert.deepEqual(validateShowPaper({ id: '1706.03762', page: 5 }, read),
    { id: '1706.03762', page: 5, title: 'Attention Is All You Need', pdfUrl: 'https://arxiv.org/pdf/1706.03762' });
});

// The page number has to come from a document it opened, not from a guess.
test('a paper it has not read cannot be shown', () => {
  assert.throws(() => validateShowPaper({ id: '1607.06450', page: 1 }, read), /Read the paper/);
  assert.throws(() => validateShowPaper({ id: '1706.03762', page: 1 }, []), /Read the paper/);
});

test('an unusable id is refused before anything opens', () => {
  for (const id of ['', null, 'not-an-id', 'https://example.test/paper']) {
    assert.throws(() => validateShowPaper({ id, page: 1 }, read), undefined, String(id));
  }
});

test('an arxiv URL is accepted, since that is what a learner pastes', () => {
  assert.equal(validateShowPaper({ id: 'https://arxiv.org/abs/1706.03762', page: 2 }, read).id, '1706.03762');
});

test('the page is bounded the same way paper_context is', () => {
  for (const page of [0, -1, 101, 1.5, '3', undefined]) {
    assert.throws(() => validateShowPaper({ id: '1706.03762', page }, read), /Page must be/, String(page));
  }
});
