import test from 'node:test';
import assert from 'node:assert/strict';
import { WINDOW, inspect, parseArgs, readOnly } from './chat-turn-inspect.mjs';

const T = 'canvaschat-0123abcd-ef01-2345-6789-abcdef012345';
const at = text => Math.floor(Date.parse(`${text.replace(' ', 'T')}Z`) / 1000);
const message = (id, role, content, created_at, meta) => ({ id, role, content, created_at, meta_json: JSON.stringify(meta) });
// A fake D1 that answers by statement and keeps every statement it was given.
const fake = ({ messages, actions = [], attempts = [] }) => {
  const seen = [];
  const run = readOnly(sql => {
    seen.push(sql);
    if (/SELECT DISTINCT m\.thread_id/.test(sql)) return { results: messages.length ? [{ thread_id: T }] : [] };
    if (/FROM threads WHERE/.test(sql)) return { results: [{ id: T, user: 'owner@example.com', scope_ref: 'canvas-1', title: 't', created_at: '2026-10-26 22:50:00' }] };
    if (/FROM messages m LEFT JOIN/.test(sql)) return { results: [...messages].reverse() }; // newest first, as the statement orders them
    if (/FROM usage_actions/.test(sql)) return { results: actions };
    if (/FROM usage_attempts/.test(sql)) return { results: attempts };
    throw new Error(`unexpected statement: ${sql.slice(0, 80)}`);
  });
  return { run, seen };
};
const LINE = '15s explain photosynthesis, 16:9';
const proposal = { proposal: { proposal_id: 'gp-aaaa', version: 1, command: 'motion', sig: 'SECRETSIGNATURE' }, proposalState: { version: 1, sig: 'SECRETSIGNATURE', used: null } };
const ask = { action_id: 'act-00000000-0000-0000-0000-000000000001', user_id: 'u1', feature: 'ask', charge_class: 'would_charge', payer: 'user', status: 'completed', result: 'full', period: '2026-10', started_at: at('2026-10-26 22:54:12'), ended_at: at('2026-10-26 22:54:20') };
const askAttempt = { action_id: ask.action_id, attempt_id: 'a1', kind: 'generation', model: 'm', reserved_micros: 1, cost_micros: 45000, cost_state: 'settled', status: 'settled', refunded_micros: 0 };

test('two user messages of the same words seconds apart are reported as two persisted messages, one proposal, no job, no video charge', () => {
  const { run, seen } = fake({
    messages: [
      message(1, 'user', `/motion ${LINE}`, '2026-10-26 22:54:10', { mode: 'auto', command: 'motion', clientId: 'abc-u' }),
      message(2, 'user', LINE, '2026-10-26 22:54:11', { mode: 'auto', command: 'motion' }),
      message(3, 'assistant', 'Here is a video proposal.', '2026-10-26 22:54:20', proposal),
    ], actions: [ask], attempts: [askAttempt],
  });
  const { lines, facts } = inspect(run, { text: `/motion ${LINE}`, ...WINDOW });
  const out = lines.join('\n');
  assert.deepEqual([facts.duplicateClusters, facts.proposals, facts.usedProposals, facts.videoActions, facts.chargedVideoActions, facts.askActions], [1, 1, 0, 0, 0, 1]);
  assert.match(out, /TWO persisted user messages with the same words: #1 \(saved by the page\) and #2 \(saved by the chat turn\), 1 s apart/);
  assert.match(out, /two persisted user messages\?\s+YES/);
  assert.match(out, /two proposals\?\s+no: 1 distinct/);
  assert.match(out, /two jobs\?\s+no/);
  assert.match(out, /two charges\?\s+no: 0 video action/);
  assert.doesNotMatch(out, /SECRETSIGNATURE/, 'a proposal signature is never printed');
  assert.ok(seen.every(sql => /^\s*SELECT\b/i.test(sql)), 'only SELECT statements were issued');
});

test('one user message is reported as one; the same words sent again ten minutes later are a separate turn, not a duplicate', () => {
  const { run } = fake({ messages: [
    message(2, 'user', LINE, '2026-10-26 22:54:11', { command: 'motion' }),
    message(3, 'assistant', 'p', '2026-10-26 22:54:20', proposal),
    message(4, 'user', LINE, '2026-10-26 23:04:11', { command: 'motion' }),
  ] });
  const { facts, lines } = inspect(run, { thread: T, ...WINDOW });
  assert.equal(facts.duplicateClusters, 0);
  assert.match(lines.join('\n'), /two persisted user messages\?\s+no/);
});

test('a Generate press and a video usage action are counted as the job and the charge', () => {
  const used = { proposal: proposal.proposal, proposalState: { version: 1, sig: 's', used: { version: 1, key: 'press-1' } } };
  const video = { ...ask, action_id: 'act-00000000-0000-0000-0000-000000000002', feature: 'video' };
  const { run } = fake({ messages: [message(2, 'user', LINE, '2026-10-26 22:54:11', {}), message(3, 'assistant', 'p', '2026-10-26 22:54:20', used)],
    actions: [ask, video], attempts: [askAttempt, { ...askAttempt, action_id: video.action_id, attempt_id: 'a2', cost_micros: 1278157 }] });
  const { facts, lines } = inspect(run, { thread: T, ...WINDOW });
  assert.deepEqual([facts.usedProposals, facts.videoActions, facts.chargedVideoActions], [1, 1, 1]);
  assert.match(lines.join('\n'), /GENERATE PRESSED \(key press-1\)/);
  assert.match(lines.join('\n'), /settled 127\.82 credits/);
});

test('nothing found says so instead of answering no', () => {
  assert.match(inspect(fake({ messages: [] }).run, { text: LINE, ...WINDOW }).lines.join('\n'), /nothing found/);
});

test('the runner refuses anything that is not one SELECT', () => {
  const run = readOnly(() => ({ results: [] }));
  for (const sql of ['DELETE FROM messages', 'UPDATE messages SET content = 1', 'SELECT 1; DROP TABLE messages', 'INSERT INTO messages VALUES (1)', 'PRAGMA writable_schema = 1']) assert.throws(() => run(sql), /read-only runner refused/, sql);
  assert.deepEqual(run('SELECT 1'), { results: [] });
});

test('arguments: a thread id is taken out of a URL, one of --thread/--text is required, times need an offset', () => {
  assert.equal(parseArgs(['prod', '--thread', `https://digrabbithole.com/apps/x?chat=${T}&y=1`]).thread, T);
  assert.match(parseArgs(['prod']).error, /exactly one/);
  assert.match(parseArgs(['prod', '--thread', T, '--text', 'x']).error, /exactly one/);
  assert.match(parseArgs(['prod', '--text', 'x', '--from', '2026-10-26T15:54:00']).error, /offset/);
  assert.match(parseArgs(['staging', '--text', 'x']).error, /usage/);
  assert.match(parseArgs(['prod', '--text', 'x', '--apply']).error, /unknown/, 'there is no write mode');
  assert.deepEqual([parseArgs(['prod', '--text', 'x']).from, parseArgs(['prod', '--text', 'x', '--dry-run']).to], [WINDOW.from, WINDOW.to]);
});
