// One submitted / line is exactly one user turn (bug lane 3aba249a, owner 2026-10-26: one /motion showed two identical user
// bubbles). Two paths can record a line's user message: the Chat itself (ask.jsx recordCommand, for a line runLearnCommand runs) and
// the chat route (send -> begin, for a line runLearnCommand answers with { prompt }). answersInChat says which one owns the line.
// This holds it to runLearnCommand for EVERY Learn command in the builds that offer them (Motion on, image generation offered), which
// the older agreement test in chat-output-refs.test.mjs does not (it runs the default build, where /motion and /image are not listed).
import test from 'node:test';
import assert from 'node:assert/strict';
import { answersInChat, EXAMPLES, runLearnCommand } from './learn-slash.js';
import { commandsFor, setImageGeneration } from './agent/slash.js';
import { reviewRequired } from './proposal-capabilities.js';

// briefs: a Chat canvas (simple material commands prepare a brief, material-brief.js).
const canvas = { briefs: true, startCad: async () => ({}), insertNotebook: () => 'n', insertBlock: () => 'b', insertPaper: () => 'p', reserve: () => 'slot:1', release: () => {}, dive: () => ({ notice: null }), openSources: () => ({}) };
const post = async () => ({ result: 'artifact', primitive: 'explanation', block: { type: 'explanation', title: 't', body: 'b' } });
const run = line => runLearnCommand(line, { app: 'demo', canvas, post, openSearch: () => ({ added: false }), motionDev: true }).catch(() => ({}));
// User messages one submission makes: the Chat records the line unless the chat route owns it; the chat route records a { prompt }.
const turns = async line => (answersInChat(line, { motionDev: true }) ? 0 : 1) + ((await run(line)).prompt ? 1 : 0);

test('every Learn command line makes exactly one user turn, with Motion on and image generation offered', async () => {
  setImageGeneration(true);
  try {
    for (const command of commandsFor('learn', { motionDev: true, imageGeneration: true })) {
      for (const line of [EXAMPLES[command.name] || `/${command.name} something`, `/${command.name} 15s explain photosynthesis, 16:9`, `/${command.name}`]) {
        assert.equal(await turns(line), 1, `${line} must be one user turn`);
      }
    }
  } finally { setImageGeneration(false); }
});

test('the owner line /motion 15s explain photosynthesis, 16:9 is the chat route\'s turn alone', async () => {
  const line = '/motion 15s explain photosynthesis, 16:9';
  assert.deepEqual(await run(line), { prompt: '15s explain photosynthesis, 16:9' });
  assert.equal(answersInChat(line, { motionDev: true }), true, 'the Chat must not also record it');
  assert.equal(await turns(line), 1);
});

test('a proposal capability with no words is still one turn: the Chat records it and the command asks for the words', async () => {
  const out = await run('/motion');
  assert.equal(out.prompt, undefined);
  assert.equal(out.keep, '/motion ');
  assert.equal(answersInChat('/motion', { motionDev: true }), false);
});

test('the classification reads the capability declaration, not a list of its own', () => {
  assert.equal(reviewRequired('motion'), true);
  for (const command of commandsFor('learn', { motionDev: true }).filter(entry => reviewRequired(entry.name))) {
    assert.equal(answersInChat(`/${command.name} words`, { motionDev: true }), true, command.name);
  }
});

test('where image generation is off /image is not a command and is recorded as the line the Chat saw', async () => {
  setImageGeneration(false);
  assert.equal(answersInChat('/image a watercolor mountain landscape', { motionDev: true }), false);
  assert.equal((await run('/image a watercolor mountain landscape')).prompt, undefined);
});
