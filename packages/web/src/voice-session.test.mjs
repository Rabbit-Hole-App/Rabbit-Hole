// Voice Mode's state machine (docs/features/voice-tutor-mvp.md §2, §7): VOICE-02, 05, 07, 09-19, 21, 22
// against the real controller, the fake STT/TTS adapters and a scripted Tutor whose voiceTurn returns
// canned speech. No mic, no network, no paid call.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bargesIn, echoesEnd, createVoiceSession, MIC_REQUIRED, STT_STOPPED, TUTOR_FAILED, TUTOR_TIMEOUT, VAD_SILENCE_MS } from './voice-session.js';
import { createFakeStt } from './voice-stt.js';
import { createFakeTts } from './voice-tts.js';
import { voiceEvent } from './voice-telemetry.js';

const MS = { to_evidence_ready: 3, to_planner_ready: 5, canvas_done: 6 };
// A scripted Tutor: each reply is speech, an Error to throw, or a function of the call.
function scriptedTutor(...replies) {
  const calls = [], canvas = [];
  return {
    calls, canvas,
    voiceTurn: async args => {
      calls.push({ ...args, signal: undefined, aborted: () => args.signal.aborted });
      const reply = replies.shift();
      if (typeof reply === 'function') return reply(args);
      if (reply instanceof Error) throw reply;
      canvas.push(args.turnId); // canvas actions run inside the turn, before it resolves
      return { speech: reply, turnId: args.turnId, ms: MS };
    },
  };
}
// The controller with the fake adapters; every adapter call and telemetry event is recorded.
function rig(tutor, { ttsMs = 5, denyPermission = false } = {}) {
  const calls = [], events = [];
  let session;
  const spy = (name, adapter) => Object.defineProperty(Object.fromEntries(Object.entries(adapter).filter(([, fn]) => typeof fn === 'function').map(([key, fn]) => [key, (...args) => { calls.push(`${name}.${key}`); return fn(...args); }])), 'echoCancelled', { get: () => adapter.echoCancelled });
  const stt = createFakeStt({ onEvent: event => session.sttEvent(event), denyPermission });
  const ttsOptions = { onEvent: event => session.ttsEvent(event), ms: ttsMs };
  const tts = createFakeTts(ttsOptions);
  session = createVoiceSession({ stt: spy('stt', stt), tts: spy('tts', tts), tutor, telemetry: (name, detail) => events.push({ name, ...detail }) });
  const states = [session.state];
  session.subscribe(() => { if (states.at(-1) !== session.state) states.push(session.state); });
  return { session, stt, tts, ttsOptions, calls, events, states, names: () => events.map(event => event.name) };
}
// Resolves when the session reaches a state (or fails after a second).
const until = (session, state) => new Promise((resolve, reject) => {
  if (session.state === state) return resolve();
  const timer = setTimeout(() => { stop(); reject(new Error(`never reached ${state}; at ${session.state}`)); }, 1000);
  const stop = session.subscribe(() => { if (session.state === state) { clearTimeout(timer); stop(); resolve(); } });
});
// One spoken turn: say it, wait for the Tutor's answer to be spoken and listening to resume.
async function turn(r, text) {
  r.stt.say(text);
  await until(r.session, 'thinking');
  await until(r.session, 'listening');
}
const noWords = (r, ...texts) => {
  const seen = JSON.stringify({ events: r.events, caption: r.session.caption, state: r.session.state });
  for (const text of texts) assert.ok(!seen.includes(text), `"${text}" leaked outside voiceTurn`);
};

test('VOICE-02 the mic enters Voice Mode: voice_mode_enter, the STT starts, then listening', async () => {
  const r = rig(scriptedTutor());
  assert.equal(r.session.state, 'off');
  await r.session.enter();
  assert.equal(r.session.state, 'listening');
  assert.deepEqual(r.calls, ['stt.start']);
  assert.equal(r.names()[0], 'voice_mode_enter');
  assert.match(r.events[0].session_id, /^[0-9a-f-]{36}$/);
  await r.session.enter();
  assert.deepEqual(r.calls, ['stt.start'], 'a second click while on starts nothing');
  r.session.exit();
});

test('VOICE-05 the learner\'s words go to tutor.voiceTurn only: never the caption, the state or telemetry', async () => {
  const tutor = scriptedTutor('Row three reads itself and the rows before it.');
  const r = rig(tutor);
  await r.session.enter();
  const words = 'why can row three not see row four';
  await turn(r, words);
  assert.equal(tutor.calls[0].raw, words);
  noWords(r, words);
  r.session.exit();
});

test('VOICE-07 a voice turn is the Tutor turn: one turnId from the commit to the Tutor and to TTS', async () => {
  const tutor = scriptedTutor('Softmax makes them add up to one.');
  const r = rig(tutor);
  await r.session.enter();
  await turn(r, 'why do the weights add up to one');
  const [call] = tutor.calls;
  assert.match(call.turnId, /^[0-9a-f-]{36}$/);
  const ids = new Set(r.events.filter(event => event.turn_id).map(event => event.turn_id));
  assert.deepEqual([...ids], [call.turnId], 'every turn event carries the Tutor turn_id');
  for (const name of ['stt_commit', 'tutor_request_start', 'tts_request_start', 'tts_play_end']) assert.ok(r.names().includes(name), name);
  r.session.exit();
});

test('VOICE-09 a normal question: listening -> thinking -> speaking -> listening, with the derived voice_turn timings', async () => {
  const r = rig(scriptedTutor('Each row keeps the columns up to its own position.'));
  await r.session.enter();
  await turn(r, 'what does the mask keep');
  assert.deepEqual(r.states, ['off', 'listening', 'thinking', 'speaking', 'listening']);
  assert.equal(r.session.caption.current, 'Each row keeps the columns up to its own position.');
  // The mic reopens as the Tutor starts speaking, so the learner can talk over it (barge-in).
  assert.deepEqual(r.calls, ['stt.start', 'stt.pause', 'stt.resume', 'tts.speak', 'stt.resume']);
  for (const name of ['speech_start', 'stt_first_partial', 'speech_end', 'stt_commit', 'tutor_request_start', 'evidence_ready', 'planner_ready', 'canvas_action_visible', 'tts_request_start', 'tts_first_byte', 'tts_play_start', 'tts_play_end', 'voice_listening_resumed', 'voice_turn']) assert.ok(r.names().includes(name), name);
  const { ms } = r.events.find(event => event.name === 'voice_turn');
  assert.equal(ms.speech_end_to_commit, VAD_SILENCE_MS, 'speech_end is the commit minus the VAD window');
  for (const key of ['speech_start_to_first_partial', 'speech_end_to_tutor_speaking', 'speech_end_to_canvas_action', 'tts_request_to_first_byte', 'tts_play_duration', 'speech_end_to_listening_resumed']) assert.equal(typeof ms[key], 'number', key);
  assert.ok(ms.speech_end_to_listening_resumed >= ms.speech_end_to_tutor_speaking);
  r.session.exit();
});

test('VOICE-10 clarification: the Tutor\'s question is spoken, and the learner\'s spoken answer is the next turn', async () => {
  const tutor = scriptedTutor('Which row do you mean, the third or the fourth?', 'Then it reads rows zero to three.');
  const r = rig(tutor);
  await r.session.enter();
  await turn(r, 'what does that row read');
  assert.equal(r.session.caption.current, 'Which row do you mean, the third or the fourth?');
  await turn(r, 'the fourth');
  assert.deepEqual(r.session.caption, { current: 'Then it reads rows zero to three.', previous: 'Which row do you mean, the third or the fourth?', error: null });
  assert.notEqual(tutor.calls[0].turnId, tutor.calls[1].turnId, 'one id per turn');
  r.session.exit();
});

test('VOICE-11 show the implementation: the canvas acts inside the turn, before any speech; no words means no TTS', async () => {
  const seen = [];
  let r;
  const tutor = scriptedTutor(args => { seen.push(r.session.state); return { speech: '', turnId: args.turnId, ms: MS }; });
  r = rig(tutor);
  await r.session.enter();
  await turn(r, 'show me the implementation');
  assert.deepEqual(seen, ['thinking'], 'the canvas acts while thinking');
  assert.ok(!r.calls.includes('tts.speak'), 'nothing to speak, no TTS call and no fallback words');
  assert.equal(r.session.caption.current, '');
  assert.ok(r.names().includes('canvas_action_visible'));
  assert.equal(r.session.state, 'listening');
  r.session.exit();
});

test('VOICE-12 a misconception probe is spoken as the Tutor wrote it', async () => {
  const r = rig(scriptedTutor('If row three could read its next character, what would it learn to predict?'));
  await r.session.enter();
  await turn(r, 'position ninety nine has to see character one hundred');
  assert.equal(r.session.caption.current, 'If row three could read its next character, what would it learn to predict?');
  assert.ok(r.calls.includes('tts.speak'));
  r.session.exit();
});

test('VOICE-13 a quiz question is spoken, then the learner answers it by voice', async () => {
  const tutor = scriptedTutor('Quick check: does row five read row six?', 'Right, never ahead.');
  const r = rig(tutor);
  await r.session.enter();
  await turn(r, 'quiz me');
  await turn(r, 'no it does not');
  assert.equal(tutor.calls.length, 2);
  assert.equal(r.session.caption.current, 'Right, never ahead.');
  r.session.exit();
});

// The suggest_dive -> executeActions -> suggestDive path, with no hole opened, is VOICE-14 in learn-tutor.test.mjs.
test('VOICE-14 a Rabbit Hole suggestion is only spoken: the session makes one voiceTurn call and nothing else', async () => {
  const tutor = scriptedTutor('That needs softmax first. Want to go down a Rabbit Hole on it?');
  const r = rig(tutor);
  await r.session.enter();
  await turn(r, 'why do the weights add up to one');
  assert.equal(r.session.caption.current, 'That needs softmax first. Want to go down a Rabbit Hole on it?');
  assert.deepEqual(tutor.calls.map(call => Object.keys(call).sort()), [['aborted', 'onSpeakable', 'raw', 'signal', 'turnId']], 'one voiceTurn call, nothing else');
  r.session.exit();
});

test('VOICE-15 multi-turn: Voice stays on and listening resumes after every turn until the learner turns it off', async () => {
  const tutor = scriptedTutor('One.', 'Two.', 'Three.');
  const r = rig(tutor);
  await r.session.enter();
  for (const words of ['alpha question', 'beta question', 'gamma question']) {
    await turn(r, words);
    assert.equal(r.session.state, 'listening');
  }
  assert.equal(tutor.calls.length, 3);
  assert.equal(r.names().filter(name => name === 'voice_listening_resumed').length, 3);
  assert.ok(!r.names().includes('voice_mode_exit'));
  assert.ok(!r.states.slice(1).includes('off'), 'never off between turns');
  noWords(r, 'alpha question', 'beta question', 'gamma question');
  r.session.exit();
});

test('VOICE-16 interrupt while speaking: the audio stops at once, listening resumes and Voice stays on', async () => {
  const r = rig(scriptedTutor('A long explanation that the learner cuts short.', 'Short.'), { ttsMs: 10000 });
  await r.session.enter();
  r.stt.say('explain it');
  await until(r.session, 'speaking');
  r.session.interrupt();
  assert.equal(r.session.state, 'listening');
  assert.deepEqual(r.calls.slice(-2), ['tts.stop', 'stt.resume']);
  assert.equal(r.session.caption.current, 'A long explanation that the learner cuts short.', 'the caption stays');
  r.session.interrupt();
  assert.equal(r.session.state, 'listening', 'interrupt only acts while speaking');
  r.ttsOptions.ms = 1;
  await turn(r, 'go on');
  assert.equal(r.session.caption.current, 'Short.');
  r.session.exit();
});

test('VOICE-17 the red mic turns Voice off: TTS and STT stop, voice_mode_exit, off', async () => {
  const r = rig(scriptedTutor('Speaking now.'), { ttsMs: 10000 });
  await r.session.enter();
  r.stt.say('hello');
  await until(r.session, 'speaking');
  r.session.exit();
  assert.equal(r.session.state, 'off');
  assert.ok(r.calls.includes('tts.stop') && r.calls.includes('stt.stop'));
  assert.equal(r.names().at(-1), 'voice_mode_exit');
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(r.session.state, 'off', 'the stopped speech does not resume listening');
  // Only the open mic while speaking resumed STT; the exit stopped it after that.
  assert.equal(r.calls.filter(call => call === 'stt.resume').length, 1);
  assert.ok(r.calls.lastIndexOf('stt.stop') > r.calls.indexOf('stt.resume'));
});

test('VOICE-18 exit while thinking aborts the Tutor turn; its late answer is never spoken', async () => {
  let release;
  const tutor = scriptedTutor(args => new Promise(resolve => { release = () => resolve({ speech: 'Too late.', turnId: args.turnId, ms: MS }); }));
  const r = rig(tutor);
  await r.session.enter();
  r.stt.say('a question');
  await until(r.session, 'thinking');
  r.session.exit();
  assert.equal(tutor.calls[0].aborted(), true, 'the in-flight turn is aborted');
  release();
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(r.session.state, 'off');
  assert.ok(!r.calls.includes('tts.speak'));
  assert.notEqual(r.session.caption.current, 'Too late.');
});

test('VOICE-19b interrupt while thinking: the Tutor turn is cancelled, listening resumes, Voice stays on, the late answer is never spoken', async () => {
  let release;
  const tutor = scriptedTutor(args => new Promise(resolve => { release = () => resolve({ speech: 'Too late.', turnId: args.turnId, ms: MS }); }), 'Next answer.');
  const r = rig(tutor);
  await r.session.enter();
  r.stt.say('a long question');
  await until(r.session, 'thinking');
  r.session.interrupt();
  assert.equal(r.session.state, 'listening', 'Voice stays on and listens again');
  assert.equal(tutor.calls[0].aborted(), true, 'the in-flight turn is aborted');
  assert.ok(r.events.some(event => event.name === 'voice_interrupted' && event.from === 'thinking'));
  release();
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(r.session.state, 'listening');
  assert.ok(!r.calls.includes('tts.speak'), 'the cancelled answer is never spoken');
  assert.notEqual(r.session.caption.current, 'Too late.');
  await turn(r, 'next');
  assert.equal(r.session.caption.current, 'Next answer.', 'the next turn works');
  r.session.exit();
});

test('VOICE-19 microphone permission denied: Voice stays off with the one-line reason', async () => {
  const r = rig(scriptedTutor(), { denyPermission: true });
  await r.session.enter();
  assert.equal(r.session.state, 'off');
  assert.equal(r.session.caption.error, MIC_REQUIRED);
  assert.deepEqual(r.events.filter(event => event.name === 'voice_error').map(event => event.kind), ['permission']);
  assert.ok(!r.states.includes('listening'));
});

test('VOICE-21 an STT failure turns Voice off with its message; nothing is faked', async () => {
  const tutor = scriptedTutor();
  const r = rig(tutor);
  await r.session.enter();
  r.stt.fail('closed');
  assert.equal(r.session.state, 'off');
  assert.equal(r.session.caption.error, STT_STOPPED);
  assert.ok(r.calls.includes('stt.stop'));
  assert.equal(tutor.calls.length, 0, 'no turn is invented');
  assert.deepEqual(r.events.filter(event => event.name === 'voice_error').map(event => event.kind), ['closed']);
});

test('VOICE-22 Tutor failure, Tutor timeout and TTS failure never strand the session: a caption error, then listening', async () => {
  const timeout = Object.assign(new Error('The operation timed out.'), { name: 'TimeoutError' });
  const r = rig(scriptedTutor(new Error('HTTP 502'), timeout, 'The canvas shows it.'));
  await r.session.enter();
  await turn(r, 'first');
  assert.equal(r.session.caption.error, TUTOR_FAILED);
  assert.equal(r.session.state, 'listening');
  await turn(r, 'second');
  assert.equal(r.session.caption.error, TUTOR_TIMEOUT);
  r.ttsOptions.fail = true;
  await turn(r, 'third');
  assert.deepEqual(r.session.caption, { current: 'The canvas shows it.', previous: null, error: null }, 'a TTS failure keeps the caption');
  assert.deepEqual(r.events.filter(event => event.name === 'voice_error').map(event => event.kind), ['tutor', 'tutor_timeout', 'tts']);
  assert.ok(!r.states.slice(1).includes('off'));
  r.session.exit();
});

test('a deliberate Voice OFF clears a turn error, so none lingers over the normal composer', async () => {
  const r = rig(scriptedTutor(new Error('HTTP 502')));
  await r.session.enter();
  await turn(r, 'first');
  assert.equal(r.session.caption.error, TUTOR_FAILED);
  r.session.exit();
  assert.equal(r.session.state, 'off');
  assert.equal(r.session.caption.error, null);
});

test('a commit is heard only while listening, and an empty one is ignored', async () => {
  const tutor = scriptedTutor(args => new Promise(() => {}));
  const r = rig(tutor);
  r.session.sttEvent({ type: 'commit', text: 'while off' });
  await r.session.enter();
  r.session.sttEvent({ type: 'commit', text: '   ' });
  assert.equal(r.session.state, 'listening');
  r.session.sttEvent({ type: 'commit', text: 'one' });
  assert.equal(r.session.state, 'thinking');
  r.session.sttEvent({ type: 'commit', text: 'two' });
  assert.equal(tutor.calls.length, 1, 'a commit while thinking is ignored');
  r.session.exit();
});

test('voiceEvent is safe under node: a performance mark, no window', () => {
  voiceEvent('voice_mode_enter', { session_id: 's' });
  assert.ok(performance.getEntriesByName('rh:voice:voice_mode_enter').length >= 1);
});

test('barge-in: talking over the Tutor stops its audio at once and the learner words are the next turn', async () => {
  const tutor = scriptedTutor('The causal mask sets every later score to minus infinity before softmax.', 'Sure, here is the mask again.');
  const r = rig(tutor, { ttsMs: 10000 });
  await r.session.enter();
  r.stt.say('explain the mask');
  await until(r.session, 'speaking');
  r.stt.say('wait, what about the padding tokens');
  assert.ok(r.names().includes('voice_barge_in'));
  assert.ok(r.calls.includes('tts.stop'), 'the audio stops');
  await until(r.session, 'speaking');
  assert.equal(tutor.calls.length, 2, 'the interruption became the next turn');
  assert.equal(tutor.calls[1].raw, 'wait, what about the padding tokens');
  assert.equal(r.session.caption.current, 'Sure, here is the mask again.');
  r.session.exit();
});

test('barge-in ignores the Tutor own voice and single-word noise', async () => {
  const tutor = scriptedTutor('The causal mask sets every later score to minus infinity before softmax.');
  const r = rig(tutor, { ttsMs: 10000 });
  await r.session.enter();
  r.stt.say('explain the mask');
  await until(r.session, 'speaking');
  r.stt.say('the causal mask sets every later score');
  r.stt.say('uh');
  r.stt.say('softmax');
  assert.equal(r.session.state, 'speaking', 'echo and noise do not interrupt');
  assert.ok(!r.names().includes('voice_barge_in'));
  assert.equal(tutor.calls.length, 1);
  r.session.exit();
});

test('bargesIn judges the newest words: two learner words, or a stop word the Tutor is not saying', () => {
  const spoken = 'Softmax turns the scores into weights that add up to one. Wait for the next row.';
  assert.equal(bargesIn('hold on', spoken), true);
  assert.equal(bargesIn('why does it', spoken), true);
  assert.equal(bargesIn('stop', spoken), true, 'a stop word alone interrupts');
  assert.equal(bargesIn('scores into weights that add up stop', spoken), true, 'a stop word after echo still interrupts');
  assert.equal(bargesIn('wait', spoken), false, 'not when the Tutor is saying it');
  assert.equal(bargesIn('scores into weights that add up', spoken), false, 'the Tutor own words');
  assert.equal(bargesIn('um', spoken), false);
  assert.equal(bargesIn('uh huh okay', spoken), false, 'backchannel filler');
  assert.equal(bargesIn('', spoken), false);
  // A long echo prefix does not dilute the learner words at the end.
  assert.equal(bargesIn('softmax turns the scores into weights that add up to one what about padding', spoken), true);
  // Misheard echo stays the Tutor's: one wrong word, or a split word.
  assert.equal(bargesIn('the casual softmax', 'The causal mask feeds softmax.'), false);
  assert.equal(bargesIn('before soft max', 'The causal mask feeds softmax before.'), false);
});

test('echoesEnd: the end of the reply, three words or the whole short reply, one miss in five', () => {
  const reply = 'Which row do you mean, the third or the fourth?';
  assert.equal(echoesEnd('or the fourth', reply), true);
  assert.equal(echoesEnd('the fourth', reply), false, 'a short answer reusing the last words counts');
  assert.equal(echoesEnd('yes exactly', 'Yes, exactly.'), true, 'all of a short reply');
  assert.equal(echoesEnd('do you mean the third or the forth', reply), true, 'one misheard word');
  assert.equal(echoesEnd('the third one please', reply), false);
});

test('barge-in: the interrupting turn is never dropped as echo, even when it reuses the Tutor words', async () => {
  const speech = 'The causal mask sets every later score to minus infinity before softmax.';
  const tutor = scriptedTutor(speech, 'Right, the mask comes first.');
  const r = rig(tutor, { ttsMs: 10000 });
  await r.session.enter();
  r.stt.say('explain the mask');
  await until(r.session, 'speaking');
  // The learner starts speaking (new speech on the mic); Scribe partials grow and the newest words decide.
  r.session.sttEvent({ type: 'speech_start' });
  r.session.sttEvent({ type: 'partial', text: 'no wait' });
  assert.equal(r.session.state, 'speaking', 'one qualifying partial is not enough');
  r.session.sttEvent({ type: 'partial', text: 'no wait the mask' });
  assert.equal(r.session.state, 'listening');
  r.session.sttEvent({ type: 'commit', text: 'no wait the mask sets every later score to minus infinity' });
  await until(r.session, 'speaking');
  assert.equal(tutor.calls.length, 2);
  assert.equal(tutor.calls[1].raw, 'no wait the mask sets every later score to minus infinity');
  r.session.exit();
});

test('without confirmed echo cancellation the mic waits for the reply to end', async () => {
  const tutor = scriptedTutor('A long explanation.');
  const r = rig(tutor, { ttsMs: 10000 });
  r.stt.echoCancelled = false;
  await r.session.enter();
  r.stt.say('explain');
  await until(r.session, 'speaking');
  r.stt.say('hold on please');
  assert.equal(r.session.state, 'speaking', 'nothing heard while speaking');
  r.session.exit();
});

test('the Tutor voice transcribed just after it stops speaking is not a learner turn', async () => {
  const tutor = scriptedTutor('The causal mask sets every later score to minus infinity before softmax.', 'Next answer.');
  const r = rig(tutor, { ttsMs: 5 });
  await r.session.enter();
  r.stt.say('explain the mask');
  await until(r.session, 'speaking');
  await until(r.session, 'listening');
  r.stt.say('to minus infinity before softmax');
  assert.ok(r.names().includes('voice_echo_ignored'));
  assert.equal(tutor.calls.length, 1, 'no turn from the echo');
  r.stt.say('why minus infinity though');
  await until(r.session, 'speaking');
  assert.equal(tutor.calls.length, 2, 'the learner own words still count');
  r.session.exit();
});

test('early speech: the first validated sentence plays before the plan completes, then the rest of the reply', async () => {
  let release;
  const tutor = scriptedTutor(args => { args.onSpeakable('Softmax turns scores into weights.'); return new Promise(resolve => { release = () => resolve({ speech: 'Softmax turns scores into weights. Each row adds up to one.', turnId: args.turnId, ms: MS }); }); });
  const r = rig(tutor, { ttsMs: 5 });
  await r.session.enter();
  r.stt.say('why do the weights add up to one');
  await until(r.session, 'speaking');
  assert.equal(r.session.caption.current, 'Softmax turns scores into weights.', 'speaking before the plan is complete');
  assert.ok(r.names().includes('first_sentence'));
  release();
  await until(r.session, 'listening');
  assert.equal(r.calls.filter(call => call === 'tts.speak').length, 2, 'the first sentence, then the rest');
  assert.equal(r.session.caption.current, 'Softmax turns scores into weights. Each row adds up to one.');
  const turnEvent = r.events.find(event => event.name === 'voice_turn');
  assert.equal(typeof turnEvent.ms.speech_end_to_first_sentence, 'number');
  r.session.exit();
});

test('early speech: Stop while the first sentence plays cancels the unfinished plan; nothing more is spoken', async () => {
  let release;
  const tutor = scriptedTutor(args => { args.onSpeakable('Here is the idea.'); return new Promise(resolve => { release = () => resolve({ speech: 'Here is the idea. And much more.', turnId: args.turnId, ms: MS }); }); });
  const r = rig(tutor, { ttsMs: 10000 });
  await r.session.enter();
  r.stt.say('explain it');
  await until(r.session, 'speaking');
  r.session.interrupt();
  assert.equal(r.session.state, 'listening', 'Voice stays on');
  assert.equal(tutor.calls[0].aborted(), true, 'the plan request is cancelled');
  release();
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(r.calls.filter(call => call === 'tts.speak').length, 1, 'the rest is never spoken');
  assert.equal(r.session.state, 'listening');
  r.session.exit();
});

test('early speech: a reply without an early sentence speaks as before', async () => {
  const tutor = scriptedTutor('Just one reply.');
  const r = rig(tutor, { ttsMs: 5 });
  await r.session.enter();
  await turn(r, 'hello');
  assert.equal(r.calls.filter(call => call === 'tts.speak').length, 1);
  assert.ok(!r.names().includes('first_sentence'));
  r.session.exit();
});

test('early speech: a plan that fails after its first sentence began stops that audio and shows the error', async () => {
  const tutor = scriptedTutor(args => { args.onSpeakable('Here is the start.'); return new Promise((_, reject) => setTimeout(() => reject(new Error('The tutor returned no turn')), 5)); });
  const r = rig(tutor, { ttsMs: 10000 });
  await r.session.enter();
  r.stt.say('explain it');
  await until(r.session, 'speaking');
  await until(r.session, 'listening');
  assert.ok(r.calls.includes('tts.stop'), 'the unvalidated sentence stops');
  assert.equal(r.session.caption.error, TUTOR_FAILED);
  r.session.exit();
});

test('early speech: two clips in one turn keep the first clip as when the learner first heard the Tutor', async () => {
  const tutor = scriptedTutor(args => { args.onSpeakable('First part.'); return Promise.resolve({ speech: 'First part. Second part.', turnId: args.turnId, ms: MS }); });
  const r = rig(tutor, { ttsMs: 5 });
  await r.session.enter();
  r.stt.say('go');
  await until(r.session, 'speaking');
  await until(r.session, 'listening');
  const starts = r.events.filter(event => event.name === 'tts_play_start').map(event => event.at);
  assert.equal(starts.length, 2, 'two clips');
  const turnEvent = r.events.find(event => event.name === 'voice_turn');
  const firstHeard = r.events.find(event => event.name === 'speech_end').at;
  assert.ok(Math.abs(turnEvent.ms.speech_end_to_tutor_speaking - (starts[0] - firstHeard)) < 1, 'measured to the first clip');
  r.session.exit();
});

test('barge-in needs new speech on the mic: a leftover partial from before the reply never interrupts the Tutor', async () => {
  const tutor = scriptedTutor('The causal mask sets every later score to minus infinity before softmax.');
  const r = rig(tutor, { ttsMs: 10000 });
  await r.session.enter();
  r.stt.say('explain the mask');
  await until(r.session, 'speaking');
  // Scribe delivers the tail of an earlier, split utterance after the mic reopens: partials, no new speech.
  r.session.sttEvent({ type: 'partial', text: 'and why does that matter' });
  r.session.sttEvent({ type: 'partial', text: 'and why does that matter for training' });
  assert.equal(r.session.state, 'speaking', 'the Tutor keeps speaking');
  assert.ok(!r.names().includes('voice_barge_in'));
  // The learner really talks over it: new speech, then words.
  r.session.sttEvent({ type: 'speech_start' });
  r.session.sttEvent({ type: 'partial', text: 'wait hold on' });
  r.session.sttEvent({ type: 'partial', text: 'wait hold on please' });
  assert.equal(r.session.state, 'listening');
  assert.ok(r.names().includes('voice_barge_in'));
  r.session.exit();
});

test('early speech: the continuation is requested while the first sentence still plays (no dead gap)', async () => {
  const tutor = scriptedTutor(args => { args.onSpeakable('First part.'); return Promise.resolve({ speech: 'First part. Second part.', turnId: args.turnId, ms: MS }); });
  const r = rig(tutor, { ttsMs: 30 });
  await r.session.enter();
  r.stt.say('go');
  await until(r.session, 'speaking');
  await new Promise(resolve => setTimeout(resolve, 5));
  const requests = r.events.filter(event => event.name === 'tts_request_start').length;
  const ended = r.events.filter(event => event.name === 'tts_play_end').length;
  assert.equal(requests >= 1 && ended, 0, 'the first sentence is still playing');
  await until(r.session, 'listening');
  const names = r.names();
  const secondRequest = names.indexOf('tts_request_start', names.indexOf('tts_request_start') + 1);
  assert.ok(secondRequest > -1 && secondRequest < names.indexOf('tts_play_end'), 'the continuation was requested before the first sentence ended');
  assert.equal(r.calls.filter(call => call === 'tts.speak').length, 2);
  r.session.exit();
});

test('say(): a Rabbit Hole opening runs as a voice turn - spoken and captioned, flagged opening, no learner speech marks', async () => {
  const tutor = scriptedTutor('Softmax turns scores into weights.');
  const r = rig(tutor, { ttsMs: 5 });
  await r.session.enter();
  assert.equal(r.session.say('Take me into Softmax.', { opening: true }), true);
  await until(r.session, 'speaking');
  await until(r.session, 'listening');
  assert.equal(tutor.calls.length, 1);
  assert.equal(tutor.calls[0].raw, 'Take me into Softmax.');
  assert.equal(tutor.calls[0].opening, true);
  assert.equal(r.session.caption.current, 'Softmax turns scores into weights.');
  assert.ok(!r.names().includes('stt_commit') && !r.names().includes('speech_end'), 'not learner speech');
  assert.ok(r.calls.includes('tts.speak'), 'spoken');
  r.session.exit();
});

test('say(): while Voice Mode is still starting (after a Rabbit Hole move) the opening waits for listening', async () => {
  const tutor = scriptedTutor('Here is the hole.');
  const r = rig(tutor, { ttsMs: 5 });
  const entering = r.session.enter();
  assert.equal(r.session.starting, true);
  assert.equal(r.session.say('Take me into Softmax.', { opening: true }), true, 'queued');
  assert.equal(tutor.calls.length, 0, 'not before listening');
  await entering;
  await until(r.session, 'listening');
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(tutor.calls.length, 1, 'ran once Voice Mode listened');
  r.session.exit();
});

test('say(): off or busy returns false (the caller falls back to the typed path); exit drops a queued opening', async () => {
  const tutor = scriptedTutor('Busy reply.');
  const r = rig(tutor, { ttsMs: 10000 });
  assert.equal(r.session.say('Take me into Softmax.', { opening: true }), false, 'off');
  const entering = r.session.enter();
  r.session.say('Queued opening.', { opening: true });
  r.session.exit();
  await entering;
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(tutor.calls.length, 0, 'the queued opening never ran after exit');
  await r.session.enter();
  r.stt.say('a question');
  await until(r.session, 'speaking');
  assert.equal(r.session.say('Another opening.'), false, 'busy');
  r.session.exit();
});

// Avatar Teacher §4.3 (rabbit-hole-avatar-teacher-v1-spec.md, acceptance 4-7): a clip the learner plays holds the
// Voice loop. The clip player itself is AV5; here the session's half: hold() and its release().
test('AVATAR-4/5 playing a clip while the Tutor speaks: the Tutor stops at once, the mic pauses, Voice stays on (held)', async () => {
  const tutor = scriptedTutor('Softmax turns the scores into weights that add up to one.', 'Next answer.');
  const r = rig(tutor, { ttsMs: 10000 });
  await r.session.enter();
  r.stt.say('why softmax');
  await until(r.session, 'speaking');
  r.calls.length = 0;
  const release = r.session.hold();
  assert.equal(r.session.state, 'held');
  assert.deepEqual(r.calls, ['tts.stop', 'stt.pause']);
  r.stt.say('the teacher in the clip is talking now');
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(tutor.calls.length, 1, 'the clip audio is never transcribed into a turn');
  assert.equal(r.session.state, 'held', 'the stopped reply does not resume listening');
  r.session.interrupt();
  assert.equal(r.session.say('an opening'), false, 'no Tutor turn starts while held');
  assert.equal(r.session.state, 'held');
  assert.ok(r.names().includes('voice_held'));
  noWords(r, 'teacher in the clip');
  release();
  r.session.exit();
});

test('AVATAR-6 the clip ends or is stopped: listening resumes and the next spoken question is a normal turn', async () => {
  const tutor = scriptedTutor('First answer.', 'Second answer.');
  const r = rig(tutor, { ttsMs: 1 });
  await r.session.enter();
  await turn(r, 'first question');
  const release = r.session.hold();
  r.calls.length = 0;
  release();
  assert.equal(r.session.state, 'listening');
  assert.deepEqual(r.calls, ['stt.resume']);
  release();
  assert.deepEqual(r.calls, ['stt.resume'], 'a second release does nothing');
  await turn(r, 'second question');
  assert.equal(tutor.calls.length, 2);
  assert.equal(r.session.caption.current, 'Second answer.');
  r.session.exit();
});

test('AVATAR-7 Voice and clip audio never overlap: a clip played while the Tutor thinks cancels the turn; its late answer is never spoken', async () => {
  let reply;
  const tutor = scriptedTutor(args => new Promise(resolve => { reply = () => resolve({ speech: 'Too late.', turnId: args.turnId, ms: MS }); }));
  const r = rig(tutor);
  await r.session.enter();
  r.stt.say('a question');
  await until(r.session, 'thinking');
  const release = r.session.hold();
  assert.equal(tutor.calls[0].aborted(), true);
  reply();
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.ok(!r.calls.includes('tts.speak'), 'nothing is spoken over the clip');
  assert.equal(r.session.state, 'held');
  release();
  assert.equal(r.session.state, 'listening');
  r.session.exit();
});

test('hold: two clips release in turn, a hold while Voice is starting keeps the mic closed, off or exited is a no-op', async () => {
  const r = rig(scriptedTutor('Answer.'));
  r.session.hold()();
  assert.equal(r.session.state, 'off', 'off: nothing to hold');
  const entering = r.session.enter();
  const early = r.session.hold();
  await entering;
  assert.equal(r.session.state, 'held', 'media started while the mic was opening');
  assert.equal(r.calls.at(-1), 'stt.pause');
  const second = r.session.hold();
  early();
  assert.equal(r.session.state, 'held', 'one clip still plays');
  second();
  assert.equal(r.session.state, 'listening');
  const stale = r.session.hold();
  r.session.exit();
  r.calls.length = 0;
  stale();
  assert.equal(r.session.state, 'off');
  assert.deepEqual(r.calls, [], 'a release after exit never reopens the mic');
});

// Professor Next Steps (contract §1.2, owner eighth message): a hook clicked while Voice is on is the same voice turn - the
// step goes to voiceTurn with no learner words, no speech marks, and the reply is spoken; never a second turn meanwhile.
test('say with a next step: one voice turn with the step and no words, spoken and captioned; busy refuses a second; no step, no words refused', async () => {
  const STEP = { suggestion_id: 'ns_01020304.2', hook: 'Why do some coasts barely see a tide?', learning_goal: 'Explain how basin shape changes tidal range' };
  const tutor = scriptedTutor('A wide basin spreads the water out.');
  const r = rig(tutor, { ttsMs: 20 });
  await r.session.enter();
  assert.equal(r.session.say('', {}), false, 'no words and no step');
  assert.equal(r.session.say('', { nextStep: STEP, selectedAt: '2026-10-06T10:00:05.000Z' }), true);
  assert.equal(r.session.say('', { nextStep: STEP }), false, 'the click turn is running: never a second turn');
  assert.equal(r.session.say('Another opening.', { opening: true }), false);
  await until(r.session, 'speaking');
  await until(r.session, 'listening');
  assert.equal(tutor.calls.length, 1);
  const [call] = tutor.calls;
  assert.deepEqual([call.raw, call.nextStep, call.selectedAt, call.opening], ['', STEP, '2026-10-06T10:00:05.000Z', undefined]);
  assert.equal(r.session.caption.current, 'A wide basin spreads the water out.');
  assert.ok(!r.names().includes('stt_commit') && !r.names().includes('speech_end'), 'not learner speech');
  assert.ok(r.calls.includes('tts.speak'), 'spoken');
  noWords(r, STEP.hook, STEP.learning_goal);
  r.session.exit();
});

test('say with a next step while Voice Mode is still starting waits for listening, then runs once', async () => {
  const STEP = { suggestion_id: 'ns_01020304.1', hook: 'h', learning_goal: 'g' };
  const tutor = scriptedTutor('Here it is.');
  const r = rig(tutor, { ttsMs: 5 });
  const entering = r.session.enter();
  assert.equal(r.session.say('', { nextStep: STEP }), true, 'queued');
  await entering;
  await until(r.session, 'listening');
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(tutor.calls.map(c => c.nextStep), [STEP]);
  r.session.exit();
});

// Task 9 review round 2 (coordinator ruling): while Voice is on a hook click is never sent down the typed path. Speaking:
// it takes the floor like a barge-in. Held by a clip: it waits for the hold to end, then runs once. Thinking: refused.
const CLICK = { suggestion_id: 'ns_0a0b0c0d.3', hook: 'What if the basin had no outlet at all?', learning_goal: 'Explain why a closed basin has no tidal flow' };
test('a hook click while the Tutor speaks interrupts it like a barge-in, then the click turn runs and is spoken; one turn at a time', async () => {
  const tutor = scriptedTutor('The tide rises twice a day because the moon pulls the water.', 'A closed basin never fills or drains.');
  const r = rig(tutor, { ttsMs: 10000 });
  await r.session.enter();
  r.stt.say('why are there two tides');
  await until(r.session, 'speaking');
  r.ttsOptions.ms = 5;
  assert.equal(r.session.say('', { nextStep: CLICK }), true);
  assert.equal(r.session.state, 'thinking', 'the click turn has the floor');
  assert.equal(r.session.say('', { nextStep: CLICK }), false, 'thinking: a second click is refused');
  assert.ok(r.names().includes('voice_interrupted') && r.calls.includes('tts.stop'), 'the old audio stopped');
  await until(r.session, 'speaking');
  await until(r.session, 'listening');
  assert.equal(tutor.calls.length, 2);
  assert.deepEqual([tutor.calls[0].aborted(), tutor.calls[1].nextStep, tutor.calls[1].raw], [true, CLICK, '']);
  assert.equal(r.session.caption.current, 'A closed basin never fills or drains.');
  r.session.exit();
});

test('a hook click while a clip holds Voice waits for the hold to end, then runs exactly once', async () => {
  const tutor = scriptedTutor('A closed basin never fills or drains.');
  const r = rig(tutor, { ttsMs: 5 });
  await r.session.enter();
  const release = r.session.hold();
  assert.equal(r.session.state, 'held');
  assert.equal(r.session.say('', { nextStep: CLICK }), true, 'queued');
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(tutor.calls.length, 0, 'never while the clip plays');
  release();
  await until(r.session, 'speaking');
  await until(r.session, 'listening');
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(tutor.calls.map(c => c.nextStep), [CLICK]);
  r.session.exit();
});

test('a hook click queued while Voice starts survives a hold that arrives before listening, and runs once the hold ends', async () => {
  const tutor = scriptedTutor('Here it is.');
  const r = rig(tutor, { ttsMs: 5 });
  const entering = r.session.enter();
  assert.equal(r.session.say('', { nextStep: CLICK }), true);
  const release = r.session.hold();
  await entering;
  assert.equal(r.session.state, 'held');
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(tutor.calls.length, 0);
  release();
  await until(r.session, 'listening');
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.deepEqual(tutor.calls.map(c => c.nextStep), [CLICK]);
  r.session.exit();
});

test('a hook click is refused while the Tutor thinks, and when Voice is off or has been turned off', async () => {
  let answer;
  const tutor = scriptedTutor(args => new Promise(resolve => { answer = () => resolve({ speech: 'Done.', turnId: args.turnId, ms: MS }); }));
  const r = rig(tutor, { ttsMs: 5 });
  assert.equal(r.session.say('', { nextStep: CLICK }), false, 'off');
  await r.session.enter();
  r.stt.say('a question');
  await until(r.session, 'thinking');
  assert.equal(r.session.say('', { nextStep: CLICK }), false, 'thinking');
  answer();
  await until(r.session, 'listening');
  assert.equal(tutor.calls.length, 1);
  r.session.exit();
  assert.equal(r.session.say('', { nextStep: CLICK }), false, 'turned off');
});
