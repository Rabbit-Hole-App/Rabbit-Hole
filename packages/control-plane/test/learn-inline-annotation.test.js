// Annotation connectors on the server side (docs/features/inline-ai-editor.md §8): the shared-canvas Ask and Tutor read
// a board's words, never its links, so an explanation's arrow cannot become a domain edge there. Passes on 5b3552a5
// too: it pins behaviour the review asked to verify.
import test from 'node:test';
import assert from 'node:assert/strict';
import { boardText, selectedCard } from '../src/learn-shared-ask.js';

test('annotation: the shared Ask board text and selected card ignore links, annotation or not', () => {
  const board = {
    shapes: [{ id: 'n4', kind: 'ellipse', text: '4' }, { id: 'n23', kind: 'ellipse', text: '23' }, { id: 'note1', kind: 'rect', text: 'Node 23 is a child of node 4.', inline: { requestId: 'r1', sources: ['n23'] } }],
    items: [], blocks: [], exchanges: [],
    links: [{ id: 'e4-23', from: 'n4', to: 'n23' }],
  };
  const annotated = { ...board, links: [...board.links, { id: 'a1', from: 'note1', to: 'n23', kind: 'annotation' }] };
  assert.equal(boardText(annotated), boardText(board));
  assert.equal(boardText({ ...board, links: [] }), boardText(board), 'no link of any kind is read');
  assert.deepEqual(selectedCard(annotated, 'n23'), selectedCard(board, 'n23'));
});
