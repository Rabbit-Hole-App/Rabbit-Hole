// Chat generation UX (bugs 1 to 3): what the Chat shows under a command or artifact response, and the generation proposal's status
// drawn from its REAL job. The classification and the status mapping are pure and run directly; ChatMessages and ProposalSlot are
// bundled with esbuild and rendered with react-dom/server (as answer-footer.test.mjs does), with a fake canvas ops standing in for
// LearnPage's. Clicks and the live canvas need a browser: e2e/chat-generation-check.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { responseKind, turnIndex } from './chat-response-kind.js';
import { announcement, cardStatus, elapsedText, imageProposalStatus, madeFromVersion, outputForProposal } from './generation-proposal-status.js';
import { generationState, proposalJobId } from './generation-state.js';
import { outputOf } from './chat-output-refs.js';
import { withoutEnd } from './learn-video-label.js';

const dir = mkdtempSync(join(tmpdir(), 'chat-generation-ux-')), outfile = join(dir, 'bundle.cjs');
const viteUrl = { name: 'vite-url', setup(build) {
  build.onResolve({ filter: /\?url$/ }, args => ({ path: args.path, namespace: 'vite-url' }));
  build.onLoad({ filter: /.*/, namespace: 'vite-url' }, () => ({ contents: 'export default ""' }));
} };
await esbuild.build({
  stdin: { contents: "export { ChatMessages, ProposalSlot } from './ChatMessages.jsx'; export { ChatWorkspace } from './chat-workspace.jsx'; export { default as Card } from './GenerationProposalCard.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent', plugins: [viteUrl], loader: { '.png': 'empty', '.svg': 'empty', '.css': 'empty' },
});
const B = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });
const read = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const soon = Math.floor(Date.now() / 1000) + 3600;
const proposal = (over = {}) => ({ proposal_id: 'gp-0123456789abcdef', version: 1, command: 'motion', title: 'Water cycle', description: 'Sunlight warms the water.', input: { request: '/motion the water cycle', concept: 'Weather' },
  settings: { duration_seconds: 10, audio: false }, usage: { estimate_credits: 100, max_credits: 350, reserve_credits: 896 }, expires_at: soon, ...over });
const meta = (extra = {}) => ({ alternatives: ['812'], feedback: null, contextRefs: [], actions: [{ id: 'a1', capabilityId: 'diagram', label: 'Draw the flow', sourceMessageId: '812', contextRefs: [], args: { subject: 'the flow' }, generationRequired: true, paid: false }],
  followUps: [{ id: 'f1', text: 'Why does it rise?', kind: 'clarify' }], ...extra });
const answer = (over = {}) => ({ role: 'assistant', messageId: '812', status: 'done', content: 'Here is the plan.', meta: meta(), ...over });
const videoBlock = (over = {}) => ({ id: 'card-1', type: 'video', status: 'generating', placementId: 'pl-1', title: 'Water cycle', operation: { op: 'motion_request', request: '/motion the water cycle', proposal: proposal() }, ...over });

// ---- bug 1 and 3: one classification ----

test('responseKind: persisted metadata first, then the existing command parser on the right turn; prose is never read', () => {
  const user = content => ({ role: 'user', content });
  assert.equal(responseKind(answer(), user('What is recursion?')).kind, 'ordinary');
  assert.equal(responseKind(answer(), null).kind, 'ordinary', 'no turn found: ordinary');
  // persisted: a proposal on the answer, outputs on the turn, the command saved on the turn
  assert.deepEqual([responseKind(answer({ meta: meta({ proposal: proposal() }) }), user('hi')).kind, responseKind(answer({ meta: meta({ proposal: proposal() }) }), user('hi')).reason], ['artifact', 'proposal']);
  assert.equal(responseKind(answer({ meta: meta({ proposalConflict: { draft: {} } }) }), user('hi')).kind, 'artifact', 'a refinement that lost to another revision still belongs to the proposal');
  assert.equal(responseKind(answer(), { ...user('make a cad part'), outputs: [{ cardId: 'c1' }] }).reason, 'outputs');
  assert.deepEqual(responseKind(answer(), { ...user('Photosynthesis'), command: 'quiz' }), { kind: 'command', ordinary: false, command: 'quiz', reason: 'command' });
  // an older turn with no saved command: a registered /name at the very start
  for (const name of ['motion', 'image', 'generate-image', 'cad', 'explain', 'video']) assert.equal(responseKind(answer(), user(`/${name} something`)).command, name, name);
  // not a command: prose that mentions one, an unknown /word, a path, the answer's own words
  assert.equal(responseKind(answer({ content: 'Try /motion for a video.' }), user('How do I make a video?')).kind, 'ordinary');
  assert.equal(responseKind(answer(), user('What does /motion do?')).kind, 'ordinary');
  assert.equal(responseKind(answer(), user('/notacommand hello')).kind, 'ordinary');
  assert.equal(responseKind(answer(), user('/usr/bin is a path')).kind, 'ordinary');
  // a chosen next step is not a command
  assert.equal(responseKind(answer(), { role: 'step', content: '/motion this' }).kind, 'ordinary');
});

test('turnIndex: the nearest earlier learner message, across other answers; none before the first', () => {
  const msgs = [{ role: 'user', content: 'a' }, answer(), { role: 'step', content: 'b' }, answer(), { role: 'user', content: 'c' }];
  assert.deepEqual([turnIndex(msgs, 1), turnIndex(msgs, 3), turnIndex(msgs, 0), turnIndex(msgs, 4)], [0, 2, -1, 2]);
});

const transcript = (msgs, props = {}) => B.renderToStaticMarkup(B.createElement(B.ChatMessages, { msgs, learnChat: true, busy: false, onAddToCanvas: () => {}, onRegenerate: () => {}, setInput: () => {}, inputRef: { current: null }, setMsgs: () => {}, setFilePeek: () => {}, setRunPeek: () => {}, ...props }));
const extras = html => ({ explore: /Explore next/.test(html), spacing: /data-answer-suggestions/.test(html), add: />Add as card</.test(html) || />Added</.test(html), regenerate: /Regenerate answer/.test(html), copy: /aria-label="Copy answer"/.test(html), thumbs: /aria-label="Good answer"/.test(html) });

test('an ordinary answer keeps Explore next, Add as card, Copy, Regenerate and the feedback buttons', () => {
  assert.deepEqual(extras(transcript([{ role: 'user', content: 'Why does water rise?' }, answer()])), { explore: true, spacing: true, add: true, regenerate: true, copy: true, thumbs: true });
});

test('a card selected as context does not by itself take them away; neither does prose that mentions /motion', () => {
  const asked = { role: 'user', content: 'Explain this card', refs: [{ sourceId: 'card:1', kind: 'card' }], canvasTarget: { id: 'card-1' } };
  assert.equal(extras(transcript([asked, answer()])).explore, true);
  assert.equal(extras(transcript([{ role: 'user', content: 'How do I use /motion?' }, answer({ content: 'Type /motion and a topic.' })])).add, true);
});

test('a /motion proposal, a saved command turn, an older command line and a turn that made cards: no Explore next, no spacing, no Add as card or Added, no Regenerate; Copy and feedback stay', () => {
  const none = { explore: false, spacing: false, add: false, regenerate: false, copy: true, thumbs: true };
  assert.deepEqual(extras(transcript([{ role: 'user', content: '/motion the water cycle', command: 'motion' }, answer({ meta: meta({ proposal: proposal() }) })])), none);
  assert.deepEqual(extras(transcript([{ role: 'user', content: 'Photosynthesis', command: 'quiz' }, answer()])), none, 'a saved command, however it ended');
  assert.deepEqual(extras(transcript([{ role: 'user', content: '/cad a plate' }, answer()])), none, 'an older turn with no saved command');
  assert.deepEqual(extras(transcript([{ role: 'user', content: 'Make me a diagram', outputs: [{ cardId: 'c1', kind: 'flow' }] }, answer()])), none, 'a completed output');
  // the same answers, viewed as older messages: no collapsed Suggestions toggle either
  const older = transcript([{ role: 'user', content: '/motion the water cycle', command: 'motion' }, answer({ meta: meta({ proposal: proposal() }) }), { role: 'user', content: 'Thanks' }, answer({ messageId: '900', content: 'Welcome.', meta: meta({ alternatives: ['900'] }) })]);
  assert.equal((older.match(/data-answer-suggestions/g) || []).length, 1, 'only the ordinary latest answer has them');
  assert.doesNotMatch(transcript([{ role: 'user', content: '/cad a plate' }, answer(), { role: 'user', content: 'Thanks' }, answer({ messageId: '900', meta: meta({ alternatives: ['900'] }) })]), /Suggestions<\/button>[\s\S]*Add as card[\s\S]*Welcome/);
});

test('the source pins it: one helper feeds Explore next, Add as card and Regenerate', () => {
  const src = read('ChatMessages.jsx');
  assert.match(src, /const kind = responseKind\(m, msgs\[turnIndex\(msgs, i\)\] \?\? null\);/);
  assert.match(src, /onAddAsCard=\{kind\.ordinary && onAddToCanvas && addAsCard\}/);
  assert.match(src, /onRegenerate=\{kind\.ordinary \? onRegenerate : null\}/);
  assert.match(src, /\{prepare && kind\.ordinary && <AnswerSuggestions /);
});

// ---- bug 2: the proposal's status is its job's ----

test('generationState: a stopped card is cancelled, an unconfirmed outcome is unknown, a plain failure stays failed; a restart forgets both', () => {
  assert.equal(generationState(videoBlock({ status: 'failed', stopped: true })).phase, 'cancelled');
  assert.equal(generationState(videoBlock({ status: 'failed', outcomeUnknown: true })).phase, 'unknown');
  assert.equal(generationState(videoBlock({ status: 'failed' })).phase, 'failed');
  assert.equal(generationState(videoBlock({ status: 'generating', stopped: true })).phase, 'running', 'a running card is running whatever it once held');
  assert.deepEqual(withoutEnd({ id: 'a', stopped: true, outcomeUnknown: true, status: 'failed' }), { id: 'a', status: 'failed' });
  assert.equal(proposalJobId(videoBlock()), 'proposal:gp-0123456789abcdef');
  assert.equal(proposalJobId({ type: 'video', operation: { op: 'generate_math_animation' } }), null);
  assert.equal(outputOf(videoBlock()).jobId, 'proposal:gp-0123456789abcdef', 'the saved output names its proposal even when its snapshot is dropped');
});

test('cardStatus: Starting, Queued, Generating, Ready from the real card; the failures say so with no spinner', () => {
  const seen = block => cardStatus({ card: block });
  assert.deepEqual([seen(videoBlock({ status: 'idle', confirmedStart: true })).label, seen(videoBlock({ status: 'queued' })).label, seen(videoBlock({ status: 'generating' })).label, seen(videoBlock({ status: 'ready' })).label], ['Starting', 'Queued', 'Generating', 'Ready']);
  assert.deepEqual([seen(videoBlock({ status: 'queued' })).phase, seen(videoBlock({ status: 'generating' })).phase, seen(videoBlock({ status: 'ready' })).phase], ['queued', 'running', 'done']);
  const running = seen(videoBlock());
  assert.equal(running.spinner, true);
  assert.equal(running.detail, 'Planning, reviewing and rendering', 'the stage is the card\'s own words');
  assert.equal(running.canStop, true, 'a /motion job with a placement can be stopped');
  assert.equal(seen(videoBlock({ placementId: undefined })).canStop, false);
  assert.deepEqual([seen(videoBlock({ placementId: undefined })).label, seen(videoBlock({ placementId: undefined })).phase], ['Starting', 'submitting'], 'the start is not accepted until the job has a placement');
  assert.equal(seen(videoBlock({ placementId: undefined, status: 'failed' })).phase, 'failed', 'a failed start is not starting');
  assert.equal(seen(videoBlock({ status: 'ready' })).spinner, false);
  for (const [over, phase] of [[{ status: 'failed' }, 'failed'], [{ status: 'failed', stopped: true }, 'stopped'], [{ status: 'failed', outcomeUnknown: true }, 'unknown']]) {
    const s = seen(videoBlock(over));
    assert.deepEqual([s.phase, s.spinner, s.active, s.canStop, s.label], [phase, false, false, false, null], phase);
    assert.ok(s.detail.length > 10);
  }
  assert.doesNotMatch(seen(videoBlock({ status: 'failed', outcomeUnknown: true })).detail, /ready|done|success/i, 'an unknown outcome is never success');
  assert.match(seen(videoBlock({ status: 'failed', outcomeUnknown: true })).detail, /not started again/);
  assert.equal(cardStatus({ card: videoBlock({ status: 'failed', proposalRefused: 'proposal_stale' }) }), null, 'a start the server refused is not a job');
  for (const s of [seen(videoBlock({ status: 'idle', confirmedStart: true })), seen(videoBlock({ status: 'queued' })), running, seen(videoBlock({ status: 'ready' }))]) assert.doesNotMatch(`${s.label}${s.detail}`, /\.\.\.|…|%/, 'no ellipsis and no invented percentage');
});

test('cardStatus: the press shows Starting before the card lands; a saved output without its card is checking until the canvas has loaded, then removed', () => {
  const pressed = cardStatus({ pressed: true });
  assert.deepEqual([pressed.phase, pressed.label, pressed.spinner, pressed.canStop], ['submitting', 'Starting', true, false]);
  assert.equal(cardStatus({}), null, 'awaiting confirmation: no status');
  const output = { cardId: 'card-1', jobId: 'proposal:gp-0123456789abcdef', startedAt: '2026-10-25T10:00:00.000Z' };
  assert.deepEqual([cardStatus({ output, loaded: false }).phase, cardStatus({ output, loaded: false }).spinner], ['checking', true]);
  assert.deepEqual([cardStatus({ output, loaded: true }).phase, cardStatus({ output, loaded: true }).spinner, cardStatus({ output, loaded: true }).cardId], ['removed', false, 'card-1']);
  assert.match(cardStatus({ output, loaded: false }).detail, /Checking the status/);
});

test('imageProposalStatus: Starting until the job answers, then its own words; Ready only when it is ready; a failure has no spinner', () => {
  assert.equal(imageProposalStatus({}), null);
  assert.equal(imageProposalStatus({ pressed: true }).label, 'Starting');
  const working = imageProposalStatus({ pressed: true, image: { tone: 'working', text: 'Making your image.', retry: false } });
  assert.deepEqual([working.label, working.spinner, working.detail], ['Generating', true, 'Making your image.']);
  assert.deepEqual([imageProposalStatus({ image: { tone: 'ready', text: 'Added to the canvas.' }, cardId: 'c9' }).label, imageProposalStatus({ image: { tone: 'ready', text: 'x' }, cardId: 'c9' }).cardId], ['Ready', 'c9']);
  // Once settled, the card says what was charged, in credits (never more than the most it could cost, shown before Generate).
  assert.equal(imageProposalStatus({ image: { tone: 'ready', text: 'x', charged: 7 }, cardId: 'c9' }).detail, 'The image is ready on the canvas. Charged 7 AI credits.');
  assert.equal(imageProposalStatus({ image: { tone: 'ready', text: 'x', charged: 1 }, cardId: 'c9' }).detail, 'The image is ready on the canvas. Charged 1 AI credit.');
  assert.equal(imageProposalStatus({ image: { tone: 'ready', text: 'x' }, cardId: 'c9' }).detail, 'The image is ready on the canvas.', 'no charge known: nothing invented');
  const failed = imageProposalStatus({ pressed: true, image: { tone: 'failed', text: 'The image could not be made.' } });
  assert.deepEqual([failed.spinner, failed.label, failed.detail], [false, null, 'The image could not be made.']);
});

test('output lookup and ownership: by the proposal\'s job id, and by the version that made the card', () => {
  const p = proposal(), turn = { role: 'user', outputs: [{ cardId: 'x', jobId: 'other' }, { cardId: 'card-1', jobId: 'proposal:gp-0123456789abcdef' }] };
  assert.equal(outputForProposal(turn, p).cardId, 'card-1');
  assert.equal(outputForProposal({ outputs: [] }, p), null);
  assert.equal(outputForProposal(null, p), null);
  assert.equal(madeFromVersion(videoBlock(), proposal({ version: 1 })), true);
  assert.equal(madeFromVersion(videoBlock(), proposal({ version: 2 })), false, 'a superseded version is not the one that made it');
  assert.equal(madeFromVersion({ snapshot: null }, proposal({ version: 2 })), true, 'a snapshot too large to keep does not say, so it is this one');
});

test('elapsed time is read, the announcement never carries it', () => {
  assert.deepEqual([elapsedText(0), elapsedText(45), elapsedText(60), elapsedText(234), elapsedText(null)], ['0s', '45s', '1m 00s', '3m 54s', '']);
  const running = cardStatus({ card: videoBlock() });
  assert.equal(announcement(running), 'Generating. Planning, reviewing and rendering');
  assert.doesNotMatch(announcement(running), /\d+s|elapsed/);
  assert.equal(announcement(null), '');
  assert.match(announcement(cardStatus({ card: videoBlock({ status: 'ready' }) })), /ready on the canvas/);
});

// ---- the proposal card as ProposalSlot draws it ----

const ops = (over = {}) => ({ insertCard: () => ({ id: 'card-1' }), proposalMade: () => false, proposalCard: () => null, block: () => null, workspace: () => ({ loaded: true }), locate: () => {}, hasBlock: () => true, stopGeneration: async () => {}, ...over });
const slot = (opsFor, { msgs = null, version = 1, outputs = [] } = {}) => {
  const p = proposal({ version });
  const list = msgs ?? [{ role: 'user', content: '/motion the water cycle', command: 'motion', messageId: '700', outputs }, answer({ meta: meta({ proposal: p }) })];
  return B.renderToStaticMarkup(B.createElement(B.ProposalSlot, { m: list[1], i: 1, msgs: list, setMsgs: () => {}, ops: opsFor }));
};
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const generateButton = html => html.match(/<button[^>]*data-proposal-generate[^>]*>([\s\S]*?)<\/button>/);

test('awaiting confirmation: an enabled Generate and no job status', () => {
  const html = slot(ops());
  assert.match(html, /<button[^>]*data-proposal-generate="true"[^>]*>Generate<\/button>/);
  assert.doesNotMatch(generateButton(html)[0], /disabled=""/);
  assert.doesNotMatch(html, /data-proposal-job-status|Added to the canvas|data-proposal-made/);
});

test('a running job: Generating with a spinner, the stage line, a polite announcement without the time, Go to card and Stop; no Added to the canvas', () => {
  const block = videoBlock();
  const html = slot(ops({ proposalCard: () => block, block: () => block, proposalMade: () => true }));
  const button = generateButton(html)[0];
  assert.match(button, /data-proposal-phase="running"/);
  assert.match(button, /aria-busy="true"/);
  assert.match(button, /disabled=""/);
  assert.match(button, /lucide-loader-circle[^>]*animate-spin[^>]*motion-reduce:animate-none|animate-spin[^>]*motion-reduce:animate-none/);
  assert.match(button, /<span>Generating<\/span>/);
  assert.match(html, /data-proposal-job-status="running"/);
  assert.match(html, /role="status" aria-live="polite" data-proposal-announcement="true" class="sr-only">Generating\. Planning, reviewing and rendering</);
  assert.match(html, /data-proposal-job-detail="true" class="shimmer">Planning, reviewing and rendering</);
  assert.match(html, /data-proposal-go-to-card/);
  assert.match(html, /data-proposal-stop="true"[^>]*aria-expanded="false"/);
  assert.doesNotMatch(html, /Added to the canvas|data-proposal-made/);
  assert.doesNotMatch(text(html), /\.\.\.|…/);
});

test('each state: Starting, Queued, Ready (check, no spinner), failed, Stopped and unknown (no spinner, no success), none showing Added to the canvas', () => {
  const at = block => slot(ops({ proposalCard: () => block, block: () => block, proposalMade: () => true }));
  const starting = at(videoBlock({ status: 'idle', confirmedStart: true, placementId: undefined }));
  assert.match(generateButton(starting)[0], /<span>Starting<\/span>/);
  assert.doesNotMatch(starting, /data-proposal-stop/, 'nothing to stop before the job has a placement');
  assert.match(generateButton(at(videoBlock({ status: 'queued' })))[0], /<span>Queued<\/span>/);
  const ready = at(videoBlock({ status: 'ready' }));
  assert.match(generateButton(ready)[0], /lucide-check[\s\S]*<span>Ready<\/span>/);
  assert.doesNotMatch(generateButton(ready)[0], /animate-spin/);
  assert.match(ready, /data-proposal-job-status="done"/);
  assert.match(ready, /data-proposal-go-to-card/);
  assert.doesNotMatch(ready, /data-proposal-stop/);
  for (const [over, phase, words] of [[{ status: 'failed' }, 'failed', /could not be made/], [{ status: 'failed', stopped: true }, 'stopped', /Stopped/], [{ status: 'failed', outcomeUnknown: true }, 'unknown', /could not confirm[\s\S]*not started again/]]) {
    const html = at(videoBlock(over));
    assert.match(html, new RegExp(`data-proposal-job-status="${phase}"`), phase);
    assert.match(text(html), words, phase);
    assert.doesNotMatch(html, /animate-spin|lucide-loader/, `${phase}: no spinner`);
    assert.doesNotMatch(generateButton(html)[0], /<span>(Ready|Generating|Starting|Queued)<\/span>/, `${phase}: not success or running`);
    assert.match(generateButton(html)[0], />Generate<\/button>/, `${phase}: the button keeps its name, greyed`);
    assert.match(generateButton(html)[0], /disabled=""/);
  }
});

test('after a reload: a saved output keeps the proposal made; the canvas not loaded yet says it is checking, never Generate or success', () => {
  const output = { cardId: 'card-1', jobId: 'proposal:gp-0123456789abcdef', startedAt: '2026-10-25T10:00:00.000Z' };
  const checking = slot(ops({ workspace: () => ({ loaded: false }) }), { outputs: [output] });
  assert.match(checking, /data-proposal-job-status="checking"/);
  assert.match(text(checking), /Checking the status of this video/);
  assert.match(generateButton(checking)[0], /disabled=""/, 'never pressable again');
  const live = videoBlock({ status: 'ready' });
  const loaded = slot(ops({ block: () => live }), { outputs: [output] });
  assert.match(loaded, /data-proposal-job-status="done"/, 'a finished job shows Ready after a reload');
  assert.match(slot(ops(), { outputs: [output] }), /data-proposal-job-status="removed"/, 'its card was deleted: said, never started again');
});

test('another thread\'s job never shows on this proposal: the card is found by this proposal id and version only', () => {
  const other = videoBlock({ operation: { op: 'motion_request', request: 'x', proposal: proposal({ proposal_id: 'gp-ffffffffffffffff' }) } });
  const html = slot(ops({ proposalCard: id => (id === 'gp-ffffffffffffffff' ? other : null), block: () => null }));
  assert.doesNotMatch(html, /data-proposal-job-status/);
  assert.match(html, />Generate<\/button>/);
  // a superseded version of a proposal whose newer version made the card: no status here, and it says it was updated
  const block = videoBlock({ operation: { op: 'motion_request', request: 'x', proposal: proposal({ version: 2 }) } });
  const old = slot(ops({ proposalCard: () => block, block: () => block, proposalMade: () => true }), { version: 1 });
  assert.doesNotMatch(old, /data-proposal-job-status|Added to the canvas/);
});

test('a refused start leaves the proposal live: Generate again, no job status', () => {
  const refused = videoBlock({ status: 'failed', proposalRefused: 'proposal_stale' });
  const html = slot(ops({ proposalCard: () => null, block: () => refused }), { outputs: [{ cardId: 'card-1', jobId: 'proposal:gp-0123456789abcdef' }] });
  assert.doesNotMatch(html, /data-proposal-job-status/);
  assert.doesNotMatch(generateButton(html)[0], /disabled=""/);
});

test('the source pins it: Generate keeps the press as an output of its turn, and Stop is the canvas card\'s own stop request', () => {
  const chat = read('ChatMessages.jsx');
  assert.match(chat, /if \(id\) \{ ops\.locate\?\.\(id\); keepOutput\(id\); \}/);
  assert.match(chat, /outputSink\(\{ messageId: Promise\.resolve/);
  assert.match(chat, /ops\.stopGeneration\(status\.cardId\)/);
  const page = read('LearnPage.jsx');
  assert.match(page, /await stopVideo\(app\.name, block\.placementId\);/);
  assert.match(page, /status: 'failed', stopped: true/);
  const blocks = read('LearningBlocks.jsx');
  assert.match(blocks, /await stopVideo\(appName, placement\);[^\n]*stopped: true/);
  const watch = read('ChatOutputs.jsx');
  assert.match(watch, /!entry\.output\.jobId\?\.startsWith\('proposal:'\)/, 'no second banner for a proposal\'s job');
  assert.doesNotMatch(chat + read('GenerationProposalCard.jsx') + read('generation-proposal-status.js'), /setInterval|setTimeout\(\(\) => look/, 'no poll of its own');
});

// ---- the image proposal's card, from the states runImageJob reports (the capability is the server's: a stubbed status stands in for it) ----

test('an image proposal card: Starting, Generating, Ready with Go to card, and a failure with no spinner; no Stop, no video words', () => {
  const imageProposal = proposal({ command: 'generate-image', title: 'A fox', input: { request: '/generate-image a fox', app: 'canvas-abcdef12' }, settings: { model: 'gemini-nano-banana-2.1', aspect_ratio: '1:1', resolution: '1K' } });
  const draw = status => B.renderToStaticMarkup(B.createElement(B.Card, { proposal: imageProposal, active: false, made: false, status, noun: 'image', onGoToCard: () => {}, onStop: () => {}, onGenerate: () => {}, onSettingsChange: () => {} }));
  const button = html => html.match(/<button[^>]*data-proposal-generate[^>]*>([\s\S]*?)<\/button>/)[0];
  const states = [
    [imageProposalStatus({ pressed: true }), 'submitting', 'Starting', true],
    [imageProposalStatus({ pressed: true, image: { tone: 'working', text: 'Making your image.', retry: false } }), 'running', 'Generating', true],
    [imageProposalStatus({ image: { tone: 'ready', text: 'Added to the canvas.' }, cardId: 'img-card' }), 'done', 'Ready', false],
  ];
  for (const [status, phase, words, spinning] of states) {
    const html = draw(status);
    assert.match(button(html), new RegExp(`data-proposal-phase="${phase}".*<span>${words}</span>`, 's'), phase);
    assert.equal(/animate-spin/.test(button(html)), spinning, `${phase} spinner`);
    assert.doesNotMatch(html, /data-proposal-stop|Added to the canvas|Planning, reviewing/, `${phase}: no video stop or copy`);
    assert.doesNotMatch(text(html), /\.\.\.|\u2026|\$/);
  }
  assert.match(draw(states[1][0]), /Making your image\./);
  assert.match(draw(states[2][0]), /data-proposal-go-to-card/);
  assert.match(draw(states[2][0]), /The image is ready on the canvas\./);
  const failed = draw(imageProposalStatus({ pressed: true, image: { tone: 'failed', text: 'The image could not be made. It may have been charged. It was not tried again. Ask for a new image.' } }));
  assert.match(failed, /data-proposal-job-status="failed"/);
  assert.doesNotMatch(failed, /animate-spin|data-proposal-go-to-card/);
  assert.match(button(failed), />Generate<\/button>/);
});

test('the source pins it: an image proposal resumes after a reload by a read, then follows only a job still working', () => {
  const chat = read('ChatMessages.jsx');
  assert.match(chat, /const resumable = cardKind === 'image' && saved && !pressed && proposalActive\(p, msgs\) && imageGenerationOn\(\);/);
  assert.match(chat, /if \(!ended\) runImageJob\(/);
  assert.match(chat, /ops\?\.findCard\?\.\(sameFileCard/);
});

// ---- conversational editing: the card's Edit makes this exact revision the Chat's target (chat-workspace editing) ----
const workspace = (target = null) => {
  const calls = [];
  return { calls, value: { canvas: 'canvas-1', thread: { id: 'canvaschat-1' }, panels: { openChat: () => calls.push(['openChat']) }, composer: { focus: () => calls.push(['focus']) }, openSource: () => {},
    editing: { target, set: next => calls.push(['set', next]), clear: () => calls.push(['clear']) } } };
};
// ProposalSlot inside a Chat workspace; the drawn card's element is returned so its handlers can be pressed.
const inChat = (ws, p, { msgs = null, opsFor = ops({ generation: () => ({ motion: {} }), refineExplain: async () => {} }) } = {}) => {
  const list = msgs ?? [{ role: 'user', content: '/motion the water cycle', command: 'motion', messageId: '700' }, answer({ meta: meta({ proposal: p }) })];
  const i = list.findIndex(m => m.meta?.proposal === p);
  let tree = null;
  const Probe = () => { tree = B.ProposalSlot({ m: list[i], i, msgs: list, setMsgs: () => {}, ops: opsFor }); return tree; };
  const html = B.renderToStaticMarkup(B.createElement(B.ChatWorkspace.Provider, { value: ws.value }, B.createElement(Probe)));
  return { html, card: tree.props.children[0] };
};

test('Edit on a proposal: Edit (never Edit details), it sets this exact revision as the target and opens the composer; nothing saved, sent or generated', () => {
  const ws = workspace(), inserted = [];
  const p = proposal({ version: 2, input: { request: '/motion the water cycle', concept: 'Weather', org: 'w', app: 'canvas-1' } });
  const { html, card } = inChat(ws, p, { opsFor: ops({ generation: () => ({ motion: {} }), insertCard: block => { inserted.push(block); return { id: 'x' }; } }) });
  assert.match(html, /<button[^>]*data-proposal-edit="true"[^>]*>Edit<\/button>/);
  assert.doesNotMatch(html, /Edit details/);
  card.props.onEdit(p);
  assert.deepEqual(ws.calls, [['set', { command: 'motion', proposalId: p.proposal_id, version: 2, messageId: '812', threadId: 'canvaschat-1', canvas: 'canvas-1', title: 'Water cycle', proposal: p }], ['openChat'], ['focus']], 'the draft is untouched: focus, never prepare or setText');
  assert.deepEqual(inserted, [], 'Edit never generates');
});

test('two proposals in one chat: only the targeted revision is highlighted; Generate on it clears the target; another command keeps its own form', () => {
  const a = proposal({ proposal_id: 'gp-aaaaaaaaaaaaaaaa', title: 'Gravity on Earth and Moon' }), b = proposal({ proposal_id: 'gp-bbbbbbbbbbbbbbbb', title: 'Water cycle' });
  const msgs = [{ role: 'user', content: '/motion gravity', command: 'motion', messageId: '700' }, answer({ messageId: '812', meta: meta({ proposal: a }) }),
    { role: 'user', content: '/motion rain', command: 'motion', messageId: '813' }, answer({ messageId: '814', meta: meta({ proposal: b }) })];
  const ws = workspace({ command: 'motion', proposalId: a.proposal_id, version: 1, messageId: '812', title: a.title, proposal: a });
  const first = inChat(ws, a, { msgs }), second = inChat(ws, b, { msgs });
  assert.match(first.html, /data-proposal-targeted="true"/);
  assert.doesNotMatch(second.html, /data-proposal-targeted/, 'the other proposal is not the target');
  const a2 = { ...a, version: 2 };
  assert.doesNotMatch(inChat(ws, a2, { msgs: [...msgs, answer({ messageId: '815', meta: meta({ proposal: a2 }) })] }).html, /data-proposal-targeted/, 'a newer revision is not the one reviewed');
  first.card.props.onGenerate(a);
  assert.deepEqual(ws.calls.at(-1), ['clear'], 'Generate spends the targeted revision');
  // An image proposal (no chat revision) keeps Edit details; so does a Motion proposal with attached references.
  assert.doesNotMatch(inChat(workspace(), proposal({ command: 'generate-image', settings: { model: 'gpt-image-2' } })).html, />Edit<\/button>/);
  assert.doesNotMatch(inChat(workspace(), proposal({ references: [{ id: 'r1', label: 'Notes', kind: 'card', sourceId: 'card:n', revision: 'r', range: null }] })).html, />Edit<\/button>/);
});
