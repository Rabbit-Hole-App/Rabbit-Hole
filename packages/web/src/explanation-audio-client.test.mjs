// The card audio, canvas side (explanation-audio.js): when the script is asked for, how a Play makes the voice, and how the answers land on the card. Pure helpers with a fake `post`;
// nothing is sent anywhere. The pill's states are in explanation-audio.test.mjs; the canvas wiring is checked here by reading its source (the canvas is not mountable in node).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SCRIPT_URL, VOICE_URL, askScript, generateNarration, landNarration, narratable, requestScript, requestVoice, scriptInput } from './explanation-audio.js';

const PROSE = 'A bootstrap sample leaves a row out with chance 0.368, so about 63 percent of the rows are in the sample that is drawn each time.';
const card = (id = 'c1', over = {}) => ({ id, type: 'explanation', title: 'Bootstrap', body: `${PROSE}\n\n\`\`\`rh-diagram\n{"kind":"line"}\n\`\`\``, depth: 'detailed', promptUsed: '/explain why 63 percent?', ...over });
const READY = { status: 'ready', fileRef: { v: 1, source: { id: 'fs_1', rev: 'r' }, meta: { name: 'a.mp3', type: 'audio/mpeg', size: 9 } }, seconds: 90, provider: 'elevenlabs', model: 'eleven_flash_v2_5', voiceId: 'v' };
const SCRIPTED = { script: 'Spoken words here.', transcript: 'Spoken words with $0.368$ here.', seconds_estimate: 70, scriptBy: { provider: 'google', model: 'gemini-3.5-flash-lite' } };
// A fake post: answers by route, records every call.
function fake({ script = SCRIPTED, voice = { narration: READY } } = {}) {
  const calls = [];
  const post = async (path, options) => {
    calls.push({ path, body: JSON.parse(options.body) });
    const answer = path === SCRIPT_URL ? script : voice;
    if (answer instanceof Error) throw answer;
    return answer;
  };
  return { post, calls, scripts: () => calls.filter(c => c.path === SCRIPT_URL), voices: () => calls.filter(c => c.path === VOICE_URL) };
}

test('a card qualifies for a script only when it is a new written Explanation with prose and no narration', () => {
  assert.equal(narratable(card()), true);
  assert.equal(narratable(card('c', { narration: { status: 'ready' } })), false, 'a card that has one is left alone, whatever its status');
  assert.equal(narratable(card('c', { narration: { status: 'error', failed: 'audio' } })), false);
  assert.equal(narratable(card('c', { anchor: { id: 'a' } })), false, 'a topic anchor is not an explanation yet');
  assert.equal(narratable(card('c', { excerpt: { id: 'e' } })), false, 'a PDF excerpt');
  assert.equal(narratable(card('c', { body: 'Too short.' })), false);
  assert.equal(narratable(card('c', { body: '```rh-diagram\n{"kind":"line","title":"a long diagram title that is not prose at all, only a picture and its labels in a fence"}\n```' })), false, 'fences are not prose');
  assert.equal(narratable({ ...card(), type: 'note' }), false);
  assert.equal(narratable(null), false);
});

test('scriptInput: the title, the body with its diagrams, the other sections, the Depth and the learner\'s own words without the command', () => {
  assert.deepEqual(scriptInput(card('c', { more: [{ text: 'Extra one.' }, { text: 'Extra two.' }] })), { title: 'Bootstrap', body: card().body, more: 'Extra one.\n\nExtra two.', depth: 'detailed', question: 'why 63 percent?' });
  assert.deepEqual(Object.keys(scriptInput(card('c', { depth: undefined, promptUsed: undefined }))), ['title', 'body']);
});

test('the script is asked for once per new card, in the owner\'s editable canvas, and the card never waits for it', async () => {
  const f = fake(), asked = new Set(), landed = [];
  let release;
  const slow = (path, options) => new Promise(resolve => { release = () => resolve(SCRIPTED); f.calls.push({ path, body: JSON.parse(options.body) }); });
  const started = askScript({ post: slow, app: 'canvas-1', editable: true, asked, land: n => landed.push(n) }, card('c1'));
  assert.equal(started, true, 'returns at once, with the answer still outstanding: nothing awaits it');
  assert.equal(landed.length, 0);
  assert.equal(askScript({ post: slow, app: 'canvas-1', editable: true, asked, land: n => landed.push(n) }, card('c1')), false, 'the same card is never asked twice');
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].path, SCRIPT_URL);
  assert.deepEqual(f.calls[0].body, { app: 'canvas-1', id: 'c1', ...scriptInput(card('c1')) });
  release(); await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(landed, [{ status: 'script', script: 'Spoken words here.', transcript: 'Spoken words with $0.368$ here.', seconds: 70, scriptBy: SCRIPTED.scriptBy }]);
  assert.equal(askScript({ post: f.post, app: 'canvas-1', editable: true, asked, land() {} }, card('c2')), true, 'another new card asks again');
});

test('a viewer of a shared canvas, a local copy, a card with narration and a canvas with no name never ask', () => {
  const f = fake();
  const ask = (options, c = card()) => askScript({ post: f.post, app: 'canvas-1', editable: true, asked: new Set(), land() {}, ...options }, c);
  assert.equal(ask({ editable: false }), false, 'read-only (a viewer) or a local copy: editable is false');
  assert.equal(ask({ app: null }), false);
  assert.equal(ask({}, card('c', { narration: { status: 'script', script: 'x' } })), false);
  assert.equal(f.calls.length, 0, 'no request was made');
});

test('requestScript: the script and its transcript become a "script" narration; a failure is an "error" naming the script step, never an exception', async () => {
  const ok = await requestScript(fake().post, { app: 'a', block: card() });
  assert.deepEqual([ok.status, ok.script, ok.transcript, ok.seconds], ['script', 'Spoken words here.', 'Spoken words with $0.368$ here.', 70]);
  const noTranscript = await requestScript(fake({ script: { script: 'Only words.' } }).post, { app: 'a', block: card() });
  assert.equal(noTranscript.transcript, 'Only words.', 'the window shows the script when there is no transcript');
  assert.deepEqual(await requestScript(fake({ script: { script: null, outcome: 'too_short', reason: 'The audio script could not be made. Try again.' } }).post, { app: 'a', block: card() }),
    { status: 'error', failed: 'script', code: 'too_short', reason: 'The audio script could not be made. Try again.' });
  const thrown = await requestScript(fake({ script: Object.assign(new Error('HTTP 502'), { status: 502 }) }).post, { app: 'a', block: card() });
  assert.deepEqual([thrown.status, thrown.failed, thrown.code], ['error', 'script', 'request_failed']);
  assert.match(thrown.reason, /Try again\.$/);
});

test('requestVoice sends the script (never the transcript) with the Play as the paid confirmation; a failure is an "error" naming the audio step', async () => {
  const f = fake();
  const block = card('c1', { narration: { status: 'script', script: 'Spoken words here.', transcript: 'Spoken words with $0.368$ here.' } });
  assert.deepEqual(await requestVoice(f.post, { app: 'a', block }), READY);
  assert.deepEqual(f.voices()[0].body, { app: 'a', id: 'c1', script: 'Spoken words here.', confirmed: true });
  const limited = await requestVoice(fake({ voice: Object.assign(new Error('You have made a lot of audio in a short time. Try again later.'), { status: 429, data: { code: 'rate_limited' } }) }).post, { app: 'a', block });
  assert.deepEqual(limited, { status: 'error', failed: 'audio', code: 'rate_limited', reason: 'You have made a lot of audio in a short time. Try again later.' });
  assert.equal((await requestVoice(fake({ voice: {} }).post, { app: 'a', block })).code, 'no_audio');
});

test('first Play with a script: only the voice is made, and the whole narration (script, transcript, file) comes back to save', async () => {
  const f = fake();
  const block = card('c1', { narration: { status: 'script', script: 'Spoken words here.', transcript: 'Spoken words with $0.368$ here.', seconds: 70, scriptBy: SCRIPTED.scriptBy } });
  const made = await generateNarration(f.post, { app: 'a', block });
  assert.equal(f.scripts().length, 0, 'the script was not made again');
  assert.equal(f.voices().length, 1);
  assert.deepEqual([made.status, made.script, made.transcript, made.seconds, made.provider, made.voiceId], ['ready', 'Spoken words here.', 'Spoken words with $0.368$ here.', 90, 'elevenlabs', 'v']);
  assert.equal(made.fileRef.source.id, 'fs_1');
});

test('retry runs only the step that failed: a failed voice keeps the script and asks the voice alone; a failed script asks the script, then the voice', async () => {
  const down = fake({ voice: { narration: { status: 'error', failed: 'audio', code: 'http_503', reason: 'The voice could not be made right now. Try again.' } } });
  const block = card('c1', { narration: { status: 'script', script: 'Spoken words here.', transcript: 'T.' } });
  const failedVoice = await generateNarration(down.post, { app: 'a', block });
  assert.deepEqual([failedVoice.status, failedVoice.failed, failedVoice.script], ['error', 'audio', 'Spoken words here.'], 'the script is kept on the error');
  const healed = fake();
  const retried = await generateNarration(healed.post, { app: 'a', block: { ...block, narration: failedVoice } });
  assert.equal(healed.scripts().length, 0);
  assert.equal(healed.voices().length, 1);
  assert.deepEqual([retried.status, retried.failed, retried.code, retried.reason], ['ready', undefined, undefined, undefined], 'the old failure is gone');
  const noScript = card('c2', { narration: { status: 'error', failed: 'script', code: 'empty', reason: 'x' } });
  const both = fake();
  const made = await generateNarration(both.post, { app: 'a', block: noScript });
  assert.deepEqual(both.calls.map(c => c.path), [SCRIPT_URL, VOICE_URL], 'script first, then its voice');
  assert.equal(both.voices()[0].body.script, 'Spoken words here.');
  assert.equal(made.status, 'ready');
  const stopped = fake({ script: { script: null, outcome: 'empty', reason: 'The audio script could not be made. Try again.' } });
  const none = await generateNarration(stopped.post, { app: 'a', block: card('c3', { narration: { status: 'error', failed: 'script', code: 'empty', reason: 'x' } }) });
  assert.equal(stopped.voices().length, 0, 'no script, no voice');
  assert.deepEqual([none.status, none.failed], ['error', 'script']);
});

test('a second press while the first is generating shares it: one script call, one voice call', async () => {
  const f = fake();
  const block = card('c9');
  const [a, b] = await Promise.all([generateNarration(f.post, { app: 'a', block }), generateNarration(f.post, { app: 'a', block })]);
  assert.equal(a, b);
  assert.deepEqual([f.scripts().length, f.voices().length], [1, 1]);
  await generateNarration(f.post, { app: 'a', block });
  assert.deepEqual([f.scripts().length, f.voices().length], [2, 2], 'a press after it finished is a new request');
});

test('landNarration puts the narration on that Explanation only; with ifNone it never replaces one the card already has; a deleted card is skipped', () => {
  const blocks = [card('a'), card('b', { narration: { status: 'ready' } }), { id: 'n', type: 'note' }];
  assert.deepEqual(landNarration(blocks, 'a', { status: 'script' })[0].narration, { status: 'script' });
  assert.equal(landNarration(blocks, 'b', { status: 'script' }, { ifNone: true })[1].narration.status, 'ready');
  assert.equal(landNarration(blocks, 'b', { status: 'ready', seconds: 5 })[1].narration.seconds, 5, 'a Play saves over the script it started from');
  assert.equal(landNarration(blocks, 'n', { status: 'script' })[2].narration, undefined, 'only an Explanation');
  assert.deepEqual(landNarration(blocks, 'gone', { status: 'script' }), blocks);
  assert.equal(blocks[0].narration, undefined, 'the input is not changed');
});

// The canvas wiring (AdaptiveCanvas.jsx): source reads.
const canvas = readFileSync(new URL('./AdaptiveCanvas.jsx', import.meta.url), 'utf8');
test('the canvas asks from insertBlock, the one way a card is made, after the card is opened; the voice host function exists only where the card can be edited', () => {
  assert.match(canvas, /added = openedExplanation\(added\);[^\n]*\n\s*askNarrationRef\.current\?\.\(added\);/, 'asked as the card is placed; never awaited, so the card is never delayed');
  assert.match(canvas, /askNarrationRef\.current = card => askScript\(\{ post: api, app: appName, editable: !readOnlyRef\.current && !localCopyRef\.current,/);
  assert.match(canvas, /\.\.\.\(canNote \? \{ narrate: id => hostRef\.current\.narrate\(id\) \} : \{\}\)/, 'canNote is !readOnly && !localCopy: a viewer has no narrate');
  assert.match(canvas, /const canAsk = [^\n]*canNote = !readOnly && !localCopy/);
  assert.match(canvas, /generateNarration\(api, \{ app: appName, block: card \}\)/);
  assert.equal((canvas.match(/askNarrationRef\.current\?\./g) || []).length, 1, 'no other place asks: an old card loaded from a saved board is never given a script');
});
