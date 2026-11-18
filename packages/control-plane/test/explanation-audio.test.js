// The card audio: its script route, its voice route, the prompt and the number check (explanation-audio.js, explanation-audio-script.js). Offline: global fetch is a provider double,
// ElevenLabs included, storage is an in-memory D1 and R2, and authorization is injected; no provider is contacted and nothing is paid.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { CHAIN_ENDPOINTS } from '../src/explanation-fast-chain.js';
import { AUDIO_LIMITS, SCRIPT_PATH, VOICE_PATH, VOICE_ID, VOICE_SETTINGS, VOICE_URL, explanationAudioRoute, scriptRequest } from '../src/explanation-audio.js';
import { LENGTH_TARGET_WORDS, cardNumbers, lengthLine, scriptSystem, scriptUser, secondsEstimate, spokenNumbers, splitCard, stripUnsafe } from '../src/explanation-audio-script.js';
import { withUsage, noteUsageIdentity, usageFeature, FEATURES } from '../src/learn-usage.js';
import { rateOf, priceUsage } from '../src/pricing-registry.js';
import { memoryBucket } from './live-storage-spy.js';

const sql = name => readFileSync(new URL(`../learn-migrations/${name}`, import.meta.url), 'utf8');
const KEYS = { SMALL_ENV: 'test', FIREWORKS_API_KEY: 'fw-synthetic', GEMINI_API_KEY: 'gm-synthetic', ELEVENLABS_API_KEY: 'el-synthetic' };
const access = { org: 'org-1', user_id: 'user-1', email: 'owner@example.com' };
const store = { org: 'org-1', email: 'owner@example.com', app: 'canvas-1', boardId: 'board-7' };
const CARD_NUMBERS_TEXT = 'A bootstrap sample leaves a row out with chance 0.368, so about 63 percent of rows are in. The curve is drawn for n from 10 to 1000.';
const BODY = `${CARD_NUMBERS_TEXT}\n\n\`\`\`rh-diagram\n{"kind":"line","title":"Omission by size","axes":{"x":{"label":"Training rows n"}},"series":[{"label":"Omission after n draws","points":[[10,0.349],[100,0.366]]}]}\n\`\`\`\n\nThe limit is one over e.`;
let cardNumber = 0;
const route = (path, body, env = KEYS, deps = { authorize: async () => access, store: async () => store }, init = {}) => explanationAudioRoute(path, new Request(`https://x.test${path}`, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body && typeof body === 'object' && !Array.isArray(body) && !('id' in body) ? { ...body, id: `card-${++cardNumber}` } : body), ...init }), env, deps);
const script = (body = { app: 'canvas-1', title: 'Bootstrap Coverage', body: BODY, depth: 'balanced', question: 'why 63 percent?' }, env, deps, init) => route(SCRIPT_PATH, body, env, deps, init);
// 60 words of safe prose
const SAFE = 'Picture a bag of marbles. You draw one, note it, and put it back. Many draws later, some marbles never showed up at all. That is the whole idea behind the missing rows. People often assume every row gets a turn, and it does not. Notice how the curve flattens as the sample grows, then try a smaller sample and watch the difference.';
const reply = (scriptText, transcript = scriptText, usage = { prompt_tokens: 900, completion_tokens: 600 }) => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ script: scriptText, transcript }) } }], usage });
const MP3 = new Uint8Array(24000).fill(0x55); // 3 seconds at 64 kbps

// Global fetch for one test. Model answers are given in order (the last repeats): an object is a 200 body, a number an HTTP status. ElevenLabs answers with `voice` (bytes) or a status.
function providers(t, { models = [], voice = MP3, delay = 0 } = {}) {
  const sent = [], original = globalThis.fetch, log = console.log, lines = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    sent.push({ url: String(url), body, headers: init.headers });
    if (String(url).startsWith('https://api.elevenlabs.io')) {
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      return typeof voice === 'number' ? Response.json({ detail: 'synthetic' }, { status: voice }) : new Response(voice, { headers: { 'content-type': 'audio/mpeg' } });
    }
    const n = sent.filter(s => !s.url.startsWith('https://api.elevenlabs.io')).length, answer = models[Math.min(n, models.length) - 1];
    return typeof answer === 'number' ? Response.json({ message: 'synthetic failure' }, { status: answer }) : Response.json(answer);
  };
  console.log = line => { try { lines.push(JSON.parse(line)); } catch { /* not ours */ } };
  t.after(() => { globalThis.fetch = original; console.log = log; });
  return { sent, models: () => sent.filter(s => !s.url.startsWith('https://api.elevenlabs.io')), voices: () => sent.filter(s => s.url.startsWith('https://api.elevenlabs.io')), events: () => lines.filter(line => line.event === 'explanation_audio') };
}

// An in-memory D1 with the ledger, usage accounting and file sources, as the route sees it.
function database(t) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  for (const file of ['0016-usage-operations.sql', '0022-usage-accounting.sql', '0027-usage-grants.sql', '0023-file-imports.sql', '0005-shared-canvas-v1.sql']) sqlite.exec(sql(file));
  const LEARN_DB = { prepare: text => { let args = []; const statement = sqlite.prepare(text); return { bind(...values) { args = values; return this; }, first: async () => statement.get(...args) || null, all: async () => ({ results: statement.all(...args) }),
    run: async () => ({ meta: { changes: statement.run(...args).changes } }), runNow: () => ({ meta: { changes: statement.run(...args).changes } }) }; },
    batch: async statements => { sqlite.exec('BEGIN'); try { const out = statements.map(statement => statement.runNow()); sqlite.exec('COMMIT'); return out; } catch (error) { sqlite.exec('ROLLBACK'); throw error; } } };
  return { sqlite, LEARN_DB };
}
const rows = (sqlite, table) => sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all().map(row => ({ ...row }));

// ---- the prompt ----
test('depth drives the length target: Brief 60 to 80 s, Balanced about 90 s, Detailed up to about 2 minutes, and Gemini gets its own higher block', () => {
  assert.match(lengthLine('brief'), /60 to 80 seconds/);
  assert.match(lengthLine('balanced'), /about 90 seconds/);
  assert.match(lengthLine('detailed'), /up to about 2 minutes/);
  for (const depth of ['brief', 'balanced', 'detailed']) {
    const system = scriptSystem(depth), [low, high] = LENGTH_TARGET_WORDS[depth];
    assert.ok(system.includes(lengthLine(depth)) && system.includes(`This card is ${depth}.`));
    assert.ok(!system.includes(lengthLine(depth === 'brief' ? 'detailed' : 'brief')), 'only its own depth line');
    assert.ok(low < high && secondsEstimate('word '.repeat(high)) <= { brief: 80, balanced: 100, detailed: 120 }[depth], 'the top of each range is its own length at the pace of the voice');
  }
  assert.notEqual(lengthLine('balanced', 'gemini'), lengthLine('balanced'));
  assert.match(lengthLine('detailed', 'gemini'), /Include: a fuller second explanation/);
  assert.equal(scriptSystem('nonsense'), scriptSystem('balanced'), 'an unknown depth is Balanced');
  assert.match(scriptUser({ depth: 'detailed', title: 'T', prose: 'P', labels: ['a', 'b'] }), /^Card depth: Detailed\n\nCard title: T\n\nCard text \(what the learner has read\):\nP\n\nLabels of the card's visuals: a \| b/);
});

test('the numbers rule is the owner\'s: only numbers of the card, never compute; the card-example, opening and symbol rules of v1.1 stay; the reply is a script and a separate transcript', () => {
  const system = scriptSystem('balanced');
  assert.match(system, /Use only numbers that appear in the card text or in the labels of its visuals, exactly as written there\. Never compute anything/);
  assert.doesNotMatch(system, /Work out any numbers|trivially simple whole numbers/);
  assert.match(system, /do not replay its example/);
  assert.match(system, /Never start with "The hardest part"/);
  assert.match(system, /STYLE: MIRROR THE CARD/);
  assert.match(system, /\{"script": "\.\.\.", "transcript": "\.\.\."\}/);
  assert.ok(system.includes('as LaTeX between $ signs, for example $x^2/2$ or $0.368$'));
});

test('splitCard: the prose without the fences, the visuals\' own words as labels, and every string and number inside a fence kept for the allowed numbers', () => {
  const card = splitCard(BODY);
  assert.ok(!/rh-diagram|"kind"/.test(card.prose) && /0\.368/.test(card.prose));
  assert.deepEqual(card.labels, ['Omission by size', 'Training rows n', 'Omission after n draws']);
  assert.ok(cardNumbers(card.prose, card.visualText).has(0.349), 'a value written only inside a diagram is a number of the card');
});

// ---- the number check ----
test('spokenNumbers reads digits and spelled-out numbers as the same values; a lone "one" is a word, not a number', () => {
  assert.deepEqual(spokenNumbers('It is 0.368, or 1,000 rows.'), [0.368, 1000]);
  assert.deepEqual(spokenNumbers('The chance is zero point three six eight, near thirty six percent.'), [0.368, 36]);
  assert.deepEqual(spokenNumbers('Twenty five of two hundred and five.'), [25, 205]);
  assert.deepEqual(spokenNumbers('Two thousand five hundred rows.'), [2500]);
  assert.deepEqual(spokenNumbers('twenty-one and one hundred'), [21, 100]);
  assert.deepEqual(spokenNumbers('One idea, and no one knows the point of it. Constructor and valueOf are words.'), []);
  assert.deepEqual(spokenNumbers('three six'), [3, 6], 'two bare units are two numbers');
  assert.deepEqual(spokenNumbers('twenty twenty four'), [20, 24]);
});

test('stripUnsafe: a sentence with a number outside the card is removed from script and transcript; the card\'s numbers, digits or spelled out, stay', () => {
  const allowed = cardNumbers(CARD_NUMBERS_TEXT);
  const spoken = 'The omission chance is zero point three six eight. About sixty three percent of rows are in. Imagine twelve rows instead. The curve flattens past one thousand rows. That is the idea.';
  const written = 'The omission chance is $0.368$. About $63\\%$ of rows are in. Imagine $12$ rows instead. The curve flattens past $1000$ rows. That is the idea.';
  const out = stripUnsafe(spoken, written, allowed);
  assert.equal(out.script, 'The omission chance is zero point three six eight. About sixty three percent of rows are in. The curve flattens past one thousand rows. That is the idea.');
  assert.equal(out.transcript, 'The omission chance is $0.368$. About $63\\%$ of rows are in. The curve flattens past $1000$ rows. That is the idea.');
  assert.equal(out.removed, 1);
  assert.equal(stripUnsafe('Nothing numeric here. Still fine.', 'Nothing numeric here. Still fine.', allowed).removed, 0);
});

test('cardNumbers reads the cards own spelled-out numbers too: a card that says "four strokes" allows the script to say four', () => {
  const allowed = cardNumbers('The engine runs a cycle of four strokes, and one of them makes power. Pressure reaches 9.5 bar.', 'twenty five percent');
  assert.deepEqual([...allowed].sort((a, b) => a - b), [4, 9.5, 25]);
  assert.equal(stripUnsafe('Four strokes repeat. Three strokes would not work.', 'Four strokes repeat. Three strokes would not work.', allowed).script, 'Four strokes repeat.');
});

test('stripUnsafe: a sentence the voice would say is never left in the window and the other way round (paired by position); a script symbol removes its sentence; unequal counts are cut on their own', () => {
  const allowed = new Set([2]);
  // the transcript's LaTeX carries a number the script did not say: both sentences go
  assert.deepEqual(stripUnsafe('Squares grow fast. Keep going.', 'Squares grow like $x^3$. Keep going.', allowed), { script: 'Keep going.', transcript: 'Keep going.', removed: 1 });
  assert.equal(stripUnsafe('It is x = 2 here. Next.', 'It is $x = 2$ here. Next.', allowed).script, 'Next.', 'a symbol in the spoken script');
  const uneven = stripUnsafe('First sentence. A seven here. Third.', 'First sentence. A seven here, with more words. And a fourth one.', allowed);
  assert.equal(uneven.script, 'First sentence. Third.');
  assert.equal(uneven.transcript, 'First sentence. And a fourth one.');
});

// ---- the script route ----
test('one call after delivery on Gemini Flash Lite: depth, the card\'s prose and labels, a script and a separate transcript, the cap; the answer carries the estimate', async t => {
  const seen = providers(t, { models: [reply(SAFE, SAFE.replace('Many draws', 'Many $n$ draws'))] });
  const answer = await script();
  const body = await answer.json();
  assert.equal(answer.status, 200);
  assert.equal(body.script, SAFE);
  assert.equal(body.transcript, SAFE.replace('Many draws', 'Many $n$ draws'));
  assert.equal(body.seconds_estimate, secondsEstimate(SAFE));
  assert.deepEqual(body.scriptBy, { provider: 'google', model: 'gemini-3.5-flash-lite' });
  assert.equal(seen.models().length, 1);
  const [{ url, body: sent, headers }] = seen.models();
  assert.equal(url, CHAIN_ENDPOINTS.google.url, 'Gemini Flash first');
  assert.equal(headers.Authorization, 'Bearer gm-synthetic');
  assert.equal(sent.messages[0].content, scriptSystem('balanced', 'gemini'));
  assert.match(sent.messages[1].content, /^Card depth: Balanced\n\nThe learner's question: why 63 percent\?\n\nCard title: Bootstrap Coverage\n\nCard text/);
  assert.ok(!/rh-diagram|"kind"/.test(sent.messages[1].content), 'no diagram JSON');
  assert.match(sent.messages[1].content, /Labels of the card's visuals: Omission by size \| Training rows n \| Omission after n draws/);
  assert.equal(sent.max_tokens, 3000);
  assert.equal(sent.stream, false);
  assert.deepEqual(Object.keys(sent.response_format.json_schema.schema.properties), ['script', 'transcript']);
});

test('depth reaches the prompt: Detailed asks for up to about two minutes, Brief for 60 to 80 seconds', async t => {
  const seen = providers(t, { models: [reply(SAFE)] });
  await script({ app: 'canvas-1', title: 'T', body: BODY, depth: 'detailed' });
  await script({ app: 'canvas-1', title: 'T', body: BODY, depth: 'brief' });
  assert.match(seen.models()[0].body.messages[0].content, /Detailed: write 320 to 380 words, up to about 2 minutes/);
  assert.match(seen.models()[1].body.messages[0].content, /Brief: write 190 to 240 words, 60 to 80 seconds/);
  assert.equal(scriptRequest({ provider: 'fireworks', model: 'm' }, { depth: 'detailed', title: 'T', prose: 'P', labels: [] }).messages[0].content, scriptSystem('detailed', 'standard'));
});

test('Gemini failing falls to Fireworks; the log carries the provider, counts and outcome, never card text', async t => {
  const seen = providers(t, { models: [500, reply(SAFE)] });
  const answer = await (await script()).json();
  assert.deepEqual(seen.models().map(s => s.url), [CHAIN_ENDPOINTS.google.url, CHAIN_ENDPOINTS.fireworks.url]);
  assert.equal(seen.models()[1].body.model, 'accounts/fireworks/models/gpt-oss-120b');
  assert.equal(seen.models()[1].body.reasoning_effort, 'low');
  assert.equal(seen.models()[1].body.messages[0].content, scriptSystem('balanced', 'standard'), 'Fireworks gets the v1.1 length block');
  assert.equal(answer.scriptBy.provider, 'fireworks');
  const [event] = seen.events();
  assert.deepEqual([event.step, event.outcome, event.provider, event.removed], ['script', 'ok', 'fireworks', 0]);
  assert.ok(event.words > 40 && Number.isFinite(event.ms));
  assert.ok(!JSON.stringify(seen.events()).includes('marbles'), 'no card or script text in a log line');
});

test('an unreadable or empty answer is a failed step (the next provider runs); every step failing leaves the card alone: 200, script null, logged, nothing thrown', async t => {
  const seen = providers(t, { models: [{ choices: [{ message: { content: 'not json' } }] }, reply('')] });
  const body = await (await script()).json();
  assert.equal(seen.models().length, 2);
  assert.deepEqual([body.script, body.outcome], [null, 'empty']);
  const down = providers(t, { models: [500, 503] });
  const answer = await script();
  assert.equal(answer.status, 200);
  assert.equal((await answer.json()).outcome, 'http_503');
  assert.equal(down.events().at(-1).outcome, 'http_503');
});

test('number safety in the route: a sentence with a number outside the card is stripped from script and transcript (no regenerate, no retry); numbers of the card and of its diagram stay', async t => {
  const spoken = `${SAFE} The chance is zero point three six eight, near sixty three percent. Take a sample of twelve rows. The curve reads zero point three four nine at ten rows.`;
  const written = `${SAFE} The chance is $0.368$, near $63\\%$. Take a sample of $12$ rows. The curve reads $0.349$ at $10$ rows.`;
  const seen = providers(t, { models: [reply(spoken, written)] });
  const body = await (await script()).json();
  assert.equal(seen.models().length, 1, 'one call, no retry');
  assert.ok(!/twelve|\$12\$/.test(body.script + body.transcript), 'the invented number is gone from both');
  assert.ok(/zero point three six eight/.test(body.script) && /\$0\.368\$/.test(body.transcript), 'the card\'s own number stays');
  assert.ok(/zero point three four nine/.test(body.script), 'a number written only in the card\'s diagram stays');
  assert.equal(seen.events()[0].removed, 1);
  // a script that is mostly invented numbers is shorter than the floor: no audio worth voicing, still no retry
  providers(t, { models: [reply('Take twelve rows. Then take thirteen. Then fourteen rows more. It ends.')] });
  assert.deepEqual(await (await script()).json(), { script: null, outcome: 'too_short', reason: 'The audio script could not be made. Try again.' });
});

test('a step whose credential is not set is skipped; with none the call is never made; one script per card id, shared by requests in flight', async t => {
  const only = providers(t, { models: [reply(SAFE)] });
  assert.equal((await (await script(undefined, { SMALL_ENV: 'test', GEMINI_API_KEY: 'gm' })).json()).scriptBy.provider, 'google');
  assert.deepEqual(only.models().map(s => s.url), [CHAIN_ENDPOINTS.google.url]);
  const none = providers(t, { models: [reply(SAFE)] });
  assert.equal((await (await script(undefined, { SMALL_ENV: 'test' })).json()).outcome, 'no_credential');
  assert.equal(none.models().length, 0);
  const seen = providers(t, { models: [reply(SAFE)] });
  const same = { app: 'canvas-1', id: 'racing', title: 'T', body: BODY };
  const [a, b] = await Promise.all([script(same), script(same)]);
  assert.equal(seen.models().length, 1);
  assert.deepEqual(await a.json(), await b.json());
  await script({ ...same, title: 'Other title' });
  assert.equal(seen.models().length, 1, 'a later request for the same card returns the kept script');
  assert.equal(seen.events().at(-1).outcome, 'stored');
});

test('the script request is checked before anything is sent: method, origin, shape, size, depth; a refused caller reaches no provider', async t => {
  const seen = providers(t, { models: [reply(SAFE)] });
  assert.equal(await explanationAudioRoute('/api/learn/other', new Request('https://x.test/x', { method: 'POST' }), KEYS), null);
  assert.equal((await explanationAudioRoute(SCRIPT_PATH, new Request(`https://x.test${SCRIPT_PATH}`), KEYS, { authorize: async () => access })).status, 405);
  assert.equal((await script(undefined, KEYS, undefined, { headers: { origin: 'https://evil.test' } })).status, 403);
  const ok = { app: 'canvas-1', title: 'T', body: BODY };
  for (const bad of ['nope', [ok], { ...ok, extra: 1 }, { ...ok, body: '  ' }, { ...ok, body: 'x'.repeat(9001) }, { ...ok, title: 7 }, { ...ok, depth: 'epic' }, { ...ok, id: '../x' }, { app: 'a', title: 'T' }, { ...ok, body: '```rh-diagram\n{}\n```' }]) {
    const answer = await script(typeof bad === 'object' && !Array.isArray(bad) && 'id' in bad ? bad : bad);
    assert.equal(answer.status, 400, JSON.stringify(bad).slice(0, 60));
  }
  const refused = await script(undefined, KEYS, { authorize: async () => Response.json({ error: 'Not found' }, { status: 404 }) });
  assert.equal(refused.status, 404, 'a visitor with no access to the canvas gets no script');
  assert.equal(seen.sent.length, 0);
});

// ---- the voice route ----
const SCRIPT_TEXT = SAFE;
const voiceBody = (extra = {}) => ({ app: 'canvas-1', id: 'card-voice', script: SCRIPT_TEXT, confirmed: true, ...extra });
const voiceEnv = (t, extra = {}) => { const { sqlite, LEARN_DB } = database(t); return { sqlite, env: { ...KEYS, LEARN_DB, LEARN_MEDIA: memoryBucket(), ...extra } }; };

test('first Play: ElevenLabs Flash v2.5 speaks the script (not the transcript) with the chosen voice and settings; the mp3 is kept as a file source of the owner; narration is ready', async t => {
  const seen = providers(t);
  const { sqlite, env } = voiceEnv(t);
  const answer = await route(VOICE_PATH, voiceBody(), env);
  const { narration } = await answer.json();
  assert.equal(answer.status, 200);
  assert.equal(seen.voices().length, 1);
  const [{ url, body, headers }] = seen.voices();
  assert.equal(url, VOICE_URL);
  assert.ok(url.includes(VOICE_ID) && /output_format=mp3_44100_64$/.test(url));
  assert.deepEqual(body, { text: SCRIPT_TEXT, model_id: 'eleven_flash_v2_5', voice_settings: { stability: 0.4, similarity_boost: 0.75, speed: 1.1 } });
  assert.deepEqual(VOICE_SETTINGS, body.voice_settings);
  assert.equal(headers['xi-api-key'], 'el-synthetic');
  assert.deepEqual(Object.keys(narration).sort(), ['fileRef', 'model', 'provider', 'seconds', 'status', 'voiceId']);
  assert.deepEqual([narration.status, narration.provider, narration.model, narration.voiceId, narration.seconds], ['ready', 'elevenlabs', 'eleven_flash_v2_5', VOICE_ID, 3]);
  assert.equal(narration.fileRef.v, 1);
  assert.deepEqual(narration.fileRef.meta, { name: 'explanation-audio.mp3', type: 'audio/mpeg', size: MP3.length });
  const [file] = rows(sqlite, 'file_sources');
  assert.deepEqual([file.id, file.org, file.owner_email, file.app, file.board_id, file.family, file.media_type, file.bytes, file.status], [narration.fileRef.source.id, 'org-1', 'owner@example.com', 'canvas-1', 'board-7', 'audio', 'audio/mpeg', MP3.length, 'stored']);
  assert.equal(narration.fileRef.source.rev, file.sha256);
  const object = await env.LEARN_MEDIA.get(file.r2_key);
  assert.equal(object.size, MP3.length, 'the bytes are in the owner\'s media store');
  assert.equal(seen.events().at(-1).outcome, 'ok');
  assert.ok(!JSON.stringify(seen.events()).includes('marbles'));
});

test('a second call for the same card and script returns the kept file with no provider call; a changed script is a new file', async t => {
  const seen = providers(t);
  const { sqlite, env } = voiceEnv(t);
  const first = (await (await route(VOICE_PATH, voiceBody(), env)).json()).narration;
  const second = (await (await route(VOICE_PATH, voiceBody(), env)).json()).narration;
  assert.deepEqual(second, first);
  assert.equal(seen.voices().length, 1, 'no second provider call, so no second charge');
  assert.equal(seen.events().at(-1).outcome, 'stored');
  const other = (await (await route(VOICE_PATH, voiceBody({ script: `${SCRIPT_TEXT} One more thought.` }), env)).json()).narration;
  assert.notEqual(other.fileRef.source.id, first.fileRef.source.id);
  assert.equal(rows(sqlite, 'file_sources').length, 2);
});

test('a second click while the first is generating is the same request: one provider call, one file, the same answer', async t => {
  const seen = providers(t, { delay: 30 });
  const { sqlite, env } = voiceEnv(t);
  const [a, b] = await Promise.all([route(VOICE_PATH, voiceBody(), env), route(VOICE_PATH, voiceBody(), env)]);
  assert.deepEqual(await a.json(), await b.json());
  assert.equal(seen.voices().length, 1);
  assert.equal(rows(sqlite, 'file_sources').length, 1);
});

test('failure is an answer, never an exception: not configured, provider failure, refused spend, nothing stored; a retry makes the voice', async t => {
  const none = providers(t);
  const { env } = voiceEnv(t);
  const { ELEVENLABS_API_KEY: _key, ...unset } = env;
  const missing = await route(VOICE_PATH, voiceBody(), unset);
  assert.equal(missing.status, 200);
  assert.deepEqual((await missing.json()).narration, { status: 'error', failed: 'audio', code: 'not_configured', reason: 'Audio is not set up on this server yet.' });
  assert.equal(none.voices().length, 0, 'no key, no request');
  const down = providers(t, { voice: 503 });
  const { sqlite, env: working } = voiceEnv(t);
  const failed = (await (await route(VOICE_PATH, voiceBody(), working)).json()).narration;
  assert.deepEqual([failed.status, failed.failed, failed.code], ['error', 'audio', 'http_503']);
  assert.equal(rows(sqlite, 'file_sources').length, 0);
  assert.equal(down.events().at(-1).outcome, 'http_503');
  const healed = providers(t);
  assert.equal((await (await route(VOICE_PATH, voiceBody(), working)).json()).narration.status, 'ready', 'the failed step runs again; nothing else did');
  assert.equal(healed.models().length, 0, 'a retry of the voice does not call the script model');
  const noStore = providers(t);
  const unowned = await (await route(VOICE_PATH, voiceBody(), working, { authorize: async () => access, store: async () => null })).json();
  assert.equal(unowned.narration.code, 'no_storage');
  assert.equal(noStore.voices().length, 0);
});

test('the voice is the learner\'s paid Play: no confirmation, no call; a viewer with no access cannot generate; the request is checked first', async t => {
  const seen = providers(t);
  const { env } = voiceEnv(t);
  const unconfirmed = await route(VOICE_PATH, { ...voiceBody(), confirmed: undefined }, env);
  assert.equal(unconfirmed.status, 428);
  assert.equal((await unconfirmed.json()).needsConfirm, true);
  const viewer = await route(VOICE_PATH, voiceBody(), env, { authorize: async () => Response.json({ error: 'Not found' }, { status: 404 }) });
  assert.equal(viewer.status, 404);
  for (const bad of [{ ...voiceBody(), script: '  ' }, { ...voiceBody(), script: 'x'.repeat(4001) }, { ...voiceBody(), extra: 1 }, { ...voiceBody(), id: 'a b' }, { ...voiceBody(), board: '../x' }]) assert.equal((await route(VOICE_PATH, bad, env)).status, 400, JSON.stringify(bad).slice(0, 50));
  assert.equal(seen.sent.length, 0);
});

test('the guard records usage: the voice is admitted at its characters, charged to the learner, settled; the script is recorded and never charged; both are priced rows of the registry', async t => {
  const seen = providers(t, { models: [{ ...reply(SAFE), model: 'gemini-3.5-flash-lite' }] }); // the provider names the model it served, which is what is priced
  const { sqlite, LEARN_DB } = database(t);
  const base = { ELEVENLABS_API_KEY: 'el', GEMINI_API_KEY: 'gm', LEARN_DB, LEARN_MEDIA: memoryBucket(), USAGE_PLATFORM_DAY_USD: '1', AI_MONTHLY_ALLOWANCE_USD: '50' };
  const as = feature => { const scoped = withUsage(base, { feature }); noteUsageIdentity(scoped, { userId: 'u-alice', email: 'owner@example.com' }); return scoped; };
  const deps = { authorize: async () => access, store: async () => store };
  assert.equal((await route(VOICE_PATH, voiceBody(), as('explanation_audio'), deps)).status, 200);
  assert.equal((await (await script(undefined, as('explanation_script'), deps)).json()).scriptBy.provider, 'google');
  const price = priceUsage({ provider: 'elevenlabs', model: 'eleven_flash_v2_5', quantities: { input_chars: SCRIPT_TEXT.length } });
  assert.equal(price.micros, SCRIPT_TEXT.length * 40, 'USD 0.04 per 1,000 characters is 40 micros a character');
  const attempts = rows(sqlite, 'usage_attempts');
  const voice = attempts.find(a => a.provider === 'elevenlabs'), words = attempts.find(a => a.provider === 'google');
  assert.deepEqual([voice.kind, voice.model, voice.reserved_micros, voice.cost_micros, voice.cost_state, voice.status], ['media', 'eleven_flash_v2_5', price.micros, price.micros, 'settled', 'settled']);
  assert.deepEqual([words.kind, words.model, words.status], ['generation', 'gemini-3.5-flash-lite', 'settled']);
  assert.ok(words.cost_micros > 0 && words.input_tokens === 900 && words.output_tokens === 600);
  const actions = rows(sqlite, 'usage_actions');
  assert.deepEqual(actions.map(a => [a.feature, a.charge_class]).sort(), [['explanation_audio', 'would_charge'], ['explanation_script', 'free']], 'the script is never charged, the voice is the learner\'s');
  assert.deepEqual(rows(sqlite, 'usage_operations').map(o => [o.category, o.status]).sort(), [['explanation_audio', 'settled'], ['explanation_script', 'settled']]);
  assert.equal(seen.voices().length, 1);
  assert.equal(rateOf('elevenlabs', 'eleven_flash_v2_5', 'input_chars').per, 1000);
  assert.equal(priceUsage({ provider: 'elevenlabs', model: 'eleven_flash_v2_5', quantities: { input_chars: 1000 } }).unverified.join(), 'input_chars', 'an estimate row, never presented as measured');
});

test('a refused admission (an exhausted allowance) is an error answer with the person\'s explanation, and the provider is never asked', async t => {
  const seen = providers(t);
  const { LEARN_DB } = database(t);
  const base = { ELEVENLABS_API_KEY: 'el', LEARN_DB, LEARN_MEDIA: memoryBucket(), USAGE_PLATFORM_DAY_USD: '1', AI_MONTHLY_ALLOWANCE_USD: '0.000001' };
  const env = withUsage(base, { feature: 'explanation_audio' }); noteUsageIdentity(env, { userId: 'u-alice', email: 'owner@example.com' });
  const { narration } = await (await route(VOICE_PATH, voiceBody(), env)).json();
  assert.deepEqual([narration.status, narration.failed, narration.code], ['error', 'audio', 'spend_refused']);
  assert.ok(narration.reason.length > 10);
  assert.equal(seen.voices().length, 0);
});

test('per-user rate guard: the hour cap refuses with 429 and a plain sentence; kept files and scripts are not counted', async t => {
  providers(t);
  const { env } = voiceEnv(t, { EXPLANATION_AUDIO_HOUR: '1' });
  const first = await route(VOICE_PATH, voiceBody({ id: 'g-1' }), env);
  assert.equal(first.status, 200);
  const again = await route(VOICE_PATH, voiceBody({ id: 'g-1' }), env);
  assert.equal(again.status, 200, 'the kept file spends no admission');
  const second = await route(VOICE_PATH, voiceBody({ id: 'g-2' }), env);
  assert.equal(second.status, 429);
  assert.deepEqual(await second.json(), { error: 'You have made a lot of audio in a short time. Try again later.', code: 'rate_limited' });
  assert.deepEqual(AUDIO_LIMITS, { EXPLANATION_SCRIPT_HOUR: 60, EXPLANATION_SCRIPT_DAY: 200, EXPLANATION_AUDIO_HOUR: 30, EXPLANATION_AUDIO_DAY: 100 });
});

test('both routes are usage features of their own (script recorded free, voice charged) and the dev worker serves them', () => {
  assert.equal(usageFeature('POST', SCRIPT_PATH), 'explanation_script');
  assert.equal(usageFeature('POST', VOICE_PATH), 'explanation_audio');
  assert.equal(usageFeature('GET', VOICE_PATH), null);
  assert.ok(FEATURES.includes('explanation_script') && FEATURES.includes('explanation_audio'));
  assert.match(readFileSync(new URL('../src/learn-usage.js', import.meta.url), 'utf8'), /const FREE_FEATURES = new Set\([^)]*'explanation_script'/);
  assert.doesNotMatch(readFileSync(new URL('../src/learn-usage.js', import.meta.url), 'utf8').match(/const FREE_FEATURES = new Set\([^)]*\)/)[0], /explanation_audio/);
  assert.match(readFileSync(new URL('../../web/dev-worker.js', import.meta.url), 'utf8'), /if \(audioRoute\(path\)\) return explanationAudioRoute\(path, req, env\);/);
});
