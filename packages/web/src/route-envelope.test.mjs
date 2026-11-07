// CHAT.01 / checklist 'Chat entry, routing and drafts': validate the route envelope before taking action. A decision whose route is not a string, or whose capability
// is not a command token, never reaches the command intercept: a plain turn is answered in chat once (answer-only, code malformed), a command turn shows the error.
import test from 'node:test';
import assert from 'node:assert/strict';
import { routeOutcome } from './generation-proposal-chat.js';

for (const [name, decision] of [
  ['route is an object', { route: {} }], ['route is a number', { route: 42 }], ['capability with a path in it', { route: 'capability:../../x', capability: '../../x', flow: 'direct' }],
  ['capability is not a string', { route: 'capability:graph', capability: ['graph'], flow: 'direct' }],
]) {
  test(`malformed envelope (${name}): never a direct command`, () => {
    const plain = routeOutcome(decision, { plain: true });
    assert.equal(plain.direct, undefined, 'no command is run from a malformed decision');
    if (plain.send) assert.deepEqual([plain.answerOnly, plain.failure?.code], [true, 'malformed'], 'a plain turn is answered in chat once');
    else assert.equal(plain.show.kind, 'error');
    const command = routeOutcome(decision, { plain: false });
    assert.equal(command.direct, undefined);
    assert.ok(!command.send, 'a command turn is not sent as an answer');
    assert.equal(command.show.kind, 'error');
  });
}

test('well-formed decisions are unchanged: answer, clarify, direct capability, signed proposal', () => {
  assert.deepEqual(routeOutcome({ route: 'answer' }), { send: true, token: null });
  assert.equal(routeOutcome({ route: 'clarify', clarification: { question: 'Which?', options: ['answer', 'graph'] } }).show.kind, 'clarify');
  assert.deepEqual(routeOutcome({ route: 'capability:graph', capability: 'graph', flow: 'direct', args: 'x' }), { direct: { command: 'graph', args: 'x' } });
  assert.deepEqual(routeOutcome({ route: 'capability:motion', capability: 'motion', flow: 'proposal', token: 't' }), { send: true, token: 't' });
});
