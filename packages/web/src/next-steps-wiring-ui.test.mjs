// Professor Next Steps, the Parallel-owned page wiring (docs/features/professor-next-steps.md §1.4, §1.6, §1.7). The hook card
// (ask.jsx NextStepsCard) is bundled with esbuild and rendered with react-dom/server, as voice-ui.test.mjs renders VoiceMode;
// the page wiring in LearnPage, ask.jsx, SharedBoardPage and AdaptiveCanvas is pinned in source (effects never run here). The
// clicks themselves run in a browser in e2e/next-steps-wiring-check.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const read = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const ask = read('ask.jsx'), page = read('LearnPage.jsx'), shared = read('SharedBoardPage.jsx'), canvas = read('AdaptiveCanvas.jsx');

const dir = mkdtempSync(join(tmpdir(), 'next-steps-wiring-')), outfile = join(dir, 'card.cjs');
// ask.jsx reaches pdf.js through a Vite ?url import, which node has no use for: it becomes an empty string.
const viteUrl = { name: 'vite-url', setup(build) {
  build.onResolve({ filter: /\?url$/ }, args => ({ path: args.path, namespace: 'vite-url' }));
  build.onLoad({ filter: /.*/, namespace: 'vite-url' }, () => ({ contents: 'export default ""' }));
} };
await esbuild.build({
  stdin: { contents: "export { NextStepsCard } from './ask.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent', plugins: [viteUrl], loader: { '.png': 'empty', '.svg': 'empty', '.css': 'empty' },
});
const B = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });

const HOOKS = ['Why does bread rise <faster> in a warm room?', 'What would change if the dough were never kneaded?', 'Where would yeast surprise an expert baker?'];
const set = (status, hooks = HOOKS) => ({ status, reason: null, options: hooks.map((hook, i) => ({ id: `ns_0a0b0c0d.${i + 1}`, hook, selected_next_step: { learning_goal: `secret goal ${i}`, basis: 'nb_x' } })), select: () => ({ ok: false, reason: 'unknown' }) });
const card = steps => B.renderToStaticMarkup(B.createElement(B.NextStepsCard, { steps, onPick: () => {} }));

test('the hook card: exactly the 3 hooks of a ready set, verbatim and in order, under the owner heading; nothing from the step', () => {
  const html = card(set('ready'));
  assert.match(html, /^<section data-next-steps="ready" aria-label="Curious where this goes\?"/);
  assert.match(html, /<h2[^>]*>Curious where this goes\?<\/h2>/);
  const shown = [...html.matchAll(/<button [^>]*data-next-step="([^"]+)"[^>]*>[\s\S]*?<span class="min-w-0">([^<]*)<\/span><\/button>/g)].map(m => [m[1], m[2]]);
  assert.deepEqual(shown, [['ns_0a0b0c0d.1', 'Why does bread rise &lt;faster&gt; in a warm room?'], ['ns_0a0b0c0d.2', HOOKS[1]], ['ns_0a0b0c0d.3', HOOKS[2]]]);
  assert.doesNotMatch(html, /secret goal|nb_x|learning_goal|basis/, 'nothing inside selected_next_step is drawn');
  assert.doesNotMatch(html, /disabled=""/, 'a ready set is clickable');
});

// Owner, 2026-10-08: "if the questions are still being loaded just show the skeleton and a spinner and not the previous
// question" (contract §1.2): loading and stale draw the same skeleton - the header, a spinner, three placeholder rows of an
// option's height - never a hook; unavailable draws nothing.
test('the hook card: loading and stale draw a skeleton with a spinner, never the previous hooks; unavailable or not exactly 3 draws nothing', () => {
  for (const status of ['stale', 'loading']) {
    const html = card(status === 'stale' ? set('stale') : { ...set('loading'), options: [] });
    assert.match(html, new RegExp(`^<section data-next-steps="${status}" data-next-steps-skeleton="true" aria-label="Curious where this goes\\?" aria-busy="true"`), status);
    assert.match(html, /<h2[^>]*>Curious where this goes\?<svg[^>]*animate-spin[^>]*motion-reduce:animate-none/, 'a spinner, still for reduced motion');
    assert.match(html, /<span class="sr-only">Loading suggestions<\/span>/);
    assert.equal((html.match(/data-next-step-placeholder="true"/g) || []).length, 3);
    assert.doesNotMatch(html, /<button|data-next-step="|bread|dough|yeast/, `${status}: never a hook, never a button`);
  }
  // No layout jump: a placeholder row and a hook button are both at least two lines (min-h-14).
  assert.match(ask, /const HOOK_ROW = 'min-h-14 rounded-lg border border-line';/);
  // The skeleton keeps the last set's height, so a stale card does not change size while the next set loads.
  assert.match(ask, /useEffect\(\(\) => \{ if \(steps\?\.status === 'ready' && frame\.current\) height\.current = frame\.current\.offsetHeight; \}\);/);
  assert.match(ask, /aria-busy="true" style=\{height\.current \? \{ minHeight: height\.current \} : undefined\}/);
  assert.match(ask, /className="flex min-h-14 w-full cursor-pointer items-start gap-2 rounded-lg border border-line px-3 py-2/);
  assert.equal(card({ ...set('unavailable'), options: [] }), '', 'unavailable');
  assert.equal(card(set('ready', HOOKS.slice(0, 2))), '', 'never fewer than 3');
  assert.equal(card(null), '', 'not mounted: nothing');
});

test('the hook card click: select() first, then the step once, never the hook as text (contract §1.4, §1.6)', () => {
  // One flight: a refused select() (stale, unknown, busy) hands nothing on; a second click while one runs is ignored.
  assert.match(ask, /const pick = async hook => \{\n\s+if \(working\) return;\n\s+const r = steps\.select\(hook\.id\);\n\s+if \(!r\.ok\) return;\n\s+setWorking\(hook\.id\);\n\s+try \{ await onPick\(r\.selected_next_step, hook\); \} finally \{ setWorking\(null\); \}/);
  // A rendered hook is only ever the Hook's own text, plus (r29) the next-section hook's fixed note.
  assert.match(ask, /<span className="min-w-0">\{hook\.hook\}\{hook\.section && <span data-next-section-note className="block text-xs text-ink-3">\{sectionNote\(hook\.section\)\}<\/span>\}<\/span>/);
});

test('ask.jsx sendStep: Voice on is say with the step, else one askStep turn drawn as a selection chip in the sheet; no typed text, no canvas card', () => {
  assert.match(ask, /const sendStep = async \(step, hook\) => \{\n\s+if \(voice\?\.on\) return voice\.say\('', \{ nextStep: step, selectedAt: new Date\(\)\.toISOString\(\) \}\);\n\s+if \(busy \|\| !tutor\?\.askStep\) return false;/);
  assert.match(ask, /const answer = await tutor\.askStep\(\{ selected_next_step: step, signal: flight\.signal, begin \}\)/);
  assert.match(ask, /setMsgs\(m => \[\.\.\.m, \{ role: 'step', content: hook \}, \{ role: 'assistant', content: '', id: replyId \}\]\);/);
  const body = ask.slice(ask.indexOf('const sendStep = async'), ask.indexOf('if (nextStepRef) nextStepRef.current = sendStep;'));
  assert.doesNotMatch(body, /setInput|send\(|exchange|onExchange|tutor\.ask\(/, 'never the composer, the Learn chat or a canvas card');
  // The chip is a choice, not the learner's bubble.
  assert.match(ask, /\{m\.role === 'step' \? \([\s\S]*?<div data-step-chip title="A next step you chose"/);
});

test('ask.jsx: a hook carried into a new hole opens it once, keyed by opening.key, through sendStep (never typed)', () => {
  assert.match(ask, /if \(!dock \|\| !tutor\?\.opening \|\| openedHole\.current === tutor\.opening\.key \|\| busy\) return;\n\s+openedHole\.current = tutor\.opening\.key;\n[^\n]*\n\s+if \(tutor\.opening\.next_step\) \{ sendStep\(tutor\.opening\.next_step, tutor\.opening\.next_step\.hook\); return; \}/);
});

test('LearnPage: useNextSteps mounts only with Rabbit Hole on and a dock composer, never on a review board, outside the canvas', () => {
  assert.match(page, /const nextStepsHere = learnPreview && \(app\.hosting !== 'aws' \|\| !!app\.app_chat\) && !\(reviewTools && board\);/);
  // The dock is drawn under exactly the same composer condition.
  assert.match(page, /composer=\{\(app\.hosting !== 'aws' \|\| app\.app_chat\) \? <div data-learn-dock/);
  assert.match(page, /<NextStepsHost on=\{nextStepsHere\} tutor=\{tutor\} journey=\{journey\} canvasApi=\{canvasApi\} canvasState=\{canvasState\} record=\{dive\.tree\?\.dive \|\| null\} access=\{askScope\} title=\{app\.title \|\| ''\} graded=\{graded\} canvasVersion=\{canvasVersion\} board=\{boardName\} describe=\{describeBlock\}>\{steps => <AdaptiveCanvas key=\{canvasEpoch\}/);
  assert.match(page, /function NextStepsHost\(\{ on, children, \.\.\.props \}\) \{\n\s+return on \? <NextStepsMounted \{\.\.\.props\}>\{children\}<\/NextStepsMounted> : children\(null\);\n\}\nfunction NextStepsMounted\(\{ children, \.\.\.props \}\) \{\n\s+return children\(useNextSteps\(props\)\);/);
  // Voice Mode's caption keeps the canvas's lower-left stack (tutor.extras stay drawn there while Voice is on); the hook card is
  // the bottom strip's lower right, beside the composer (owner, 2026-10-08).
  assert.match(page, /leftRail=\{voiceOn \? <TutorCaption caption=\{voice\.caption\} state=\{voice\.state\} extras=\{tutor\.extras\} \/> : null\}\n\s+hooks=\{steps \? <NextStepsCard steps=\{steps\} onPick=\{\(step, hook\) => \(step\.section \? journey\?\.nextSection\?\.\(\) : nextStepSend\.current\?\.\(step, hook\.hook\)\)\} \/> : null\}/);
  assert.match(canvas, /<div data-canvas-lower-right className="flex justify-end md:min-w-fit md:flex-1 md:basis-0 max-md:order-1">\n\s+\{hooks && <div data-hooks-slot className="w-\[clamp\(208px,calc\(50cqw-500px\),300px\)\] empty:hidden max-md:w-\[min\(100%,300px\)\]">\{hooks\}<\/div>\}/);
  assert.match(page, /tray=\{journey\.trayProps\} voice=\{voice\} nextStepRef=\{nextStepSend\}/);
  assert.match(canvas, /<div data-left-stack className="absolute bottom-3 left-3 flex w-\[clamp\(208px,calc\(50cqw-500px\),300px\)\] flex-col items-start gap-2 /);
});

test('LearnPage: canvasVersion, graded, /ask and /teach, the repository detach and the block follow-up Tutor (contract §1.7)', () => {
  assert.match(page, /const tutor = useTutor\(\{ app, board: boardName, access: askScope, canvasApi, canvasState, dive, courseCanvas: learnPreview && !board, journey, canvasVersion, repository: repoAttached && canvasRepository\(app\), describe: describeBlock \}\);/);
  // The board revision is mirrored for render at every place the page learns it.
  assert.equal((page.match(/boardVersion\.current = [^;]+; setCanvasVersion\(/g) || []).length, (page.match(/boardVersion\.current = /g) || []).length);
  assert.match(page, /verdict = parseVerdict\(text\);\n\s+setGraded\(count => count \+ 1\);/);
  assert.match(page, /if \(parsed && \['deeper', 'simplify', 'ask', 'teach'\]\.includes\(parsed\.name\)\) tutor\.slash\(parsed\.name, text\.trim\(\)\);/);
  assert.match(page, /onExchange=\{onExchange\} tutor=\{tutor\.active \? tutor : null\} scope=\{askScope\}/);
  assert.match(page, /previous\.attempts === next\.attempts/, 'an attempt reaches the page state, so the basis sees it');
  assert.match(canvas, /const attempts = blocks\.reduce\(\(sum, block\) => sum \+ \(block\.attemptLog\?\.length \|\| 0\), 0\);/);
  assert.match(canvas, /card: JSON\.parse\(cardKey\), content, attempts \}\); \}, \[[^\]]*content, attempts, onState\]\);/);
});

test('SharedBoardPage: the shared hooks start the private hole with the step; stale restarts without it; signed out it waits for this link and hook', () => {
  assert.match(shared, /function SharedNextSteps\(\{ token, card, version, signedIn, startRef \}\) \{\n\s+const steps = useSharedNextSteps\(\{ token, card, version, signedIn \}\);\n\s+return <NextStepsCard steps=\{steps\} onPick=\{\(step, hook\) => startRef\.current\?\.\(card, step, hook\.id\)\} \/>;/);
  assert.match(shared, /hooks=\{<SharedNextSteps token=\{token\} card=\{card\?\.id \|\| null\} version=\{shared\.version\} signedIn=\{!!shared\.viewer\} startRef=\{rabbitStart\} \/>\}/);
  assert.match(shared, /let made = await requestRabbitHole\(token, origin, \{ headers: wsHeaders\(\), step \}\);\n\s+if \(made\.stale\) made = await requestRabbitHole\(token, origin, \{ headers: wsHeaders\(\) \}\);/);
  assert.match(shared, /if \(made\.signIn\) \{\n\s+if \(step\) keepPendingStep\(sessionStorage, token, step\);\n\s+window\.location\.href = resumeHref\(window\.location\.pathname, cardId, step \? hookId : null\);/);
  assert.match(shared, /if \(made\.next_step\) carryStep\(sessionStorage, made\.name, made\.next_step\);\n\s+window\.location\.href = made\.url;/);
  assert.match(shared, /takeResume\(window\.location, window\.history, \{ hook: true \}\)/);
  assert.match(shared, /run\(resume\.origin, resume\.hook \? takePendingStep\(sessionStorage, token, resume\.hook\) : null, resume\.hook\)/);
});

// ---- Report item 3: Tutor-made material reads the selected card as a typed command does (LearnPage passes describeBlock) ----
// useTutor bundled alone (LearningBlocks.jsx cannot load here, so describe is a stand-in with describeBlock's shape). A typed turn
// on a plain canvas with a card selected; its plan makes one free material; the artifact request carries the card as selection
// and context. A fake fetch answers the routes; no network, no model.
const tutorDir = mkdtempSync(join(tmpdir(), 'next-steps-wiring-tutor-')), tutorOut = join(tutorDir, 'tutor.cjs');
await esbuild.build({
  stdin: { contents: "export { useTutor } from './LearnTutor.jsx'; export { materialCommands } from './learn-slash.js'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile: tutorOut, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent',
});
const T = createRequire(import.meta.url)(tutorOut);
rmSync(tutorDir, { recursive: true, force: true });

async function materialTarget(describe) {
  const card = { id: 'q1', type: 'quiz', question: 'What makes dough rise?', options: [{ key: 'A', text: 'Yeast', correct: true }], choice: null };
  const command = T.materialCommands().find(entry => !entry.paid)?.command;
  const calls = [], store = new Map();
  const globals = {
    window: { dispatchEvent: () => true },
    sessionStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    localStorage: { getItem: () => null },
    fetch: async (path, options) => {
      calls.push({ path, body: JSON.parse(options.body) });
      const reply = path === '/api/learn/tutor/plan' ? { strategy: 'none', constraints_add: [], actions: [{ type: 'respond_text', text: 'Here is a card.' }, { type: 'create_material', command, request: 'dough rising' }] }
        : path === '/api/learn/artifact' ? { result: 'artifact', primitive: 'explanation', block: { type: 'explanation', title: 't', body: 'b' } } : {};
      return new Response(JSON.stringify(reply), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  };
  const app = { name: 'canvas-0a0b0c0d', org: 'o', email: 'e@x.com', title: 'Bread' };
  const canvasApi = { current: { blocks: () => [card], block: id => (id === card.id ? card : null), insertBlock: () => 'new', reserve: () => 'slot', release: () => {} } };
  let tutor = null;
  const Page = () => { tutor = T.useTutor({ app, board: 'main', access: { app: app.name }, canvasApi, canvasState: { card: { id: card.id } }, dive: { tree: { path: [{ app: app.name, title: 'Bread' }], dive: null }, suggestionCard: null }, describe }); return null; };
  const saved = Object.fromEntries(Object.keys(globals).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  try {
    T.renderToStaticMarkup(T.createElement(Page));
    assert.ok(command && tutor.active, 'a plain canvas has the Auto Tutor and a free material');
    await tutor.ask({ raw: 'Make me something on this', targetId: card.id });
    for (let i = 0; i < 50 && !calls.some(c => c.path === '/api/learn/artifact'); i++) await new Promise(resolve => setImmediate(resolve));
  } finally {
    for (const [name, descriptor] of Object.entries(saved)) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; }
  }
  const body = calls.find(c => c.path === '/api/learn/artifact').body;
  return { selection: body.selection, context: body.context };
}

test('Tutor-made material: with describe (describeBlock) the selected card travels as a typed command sends it; without, the card text stands in', async () => {
  const described = { kind: 'Quiz', title: 'What makes dough rise?', text: 'Quiz question: What makes dough rise?\nOptions:\nA. Yeast (correct answer)' };
  assert.deepEqual(await materialTarget(block => (block.id === 'q1' ? described : null)), { selection: { kind: 'card', id: 'q1', title: described.title }, context: described.text });
  const fallback = await materialTarget(null);
  assert.equal(fallback.selection.id, 'q1');
  assert.notEqual(fallback.context, described.text, 'cardContext, the pre-wiring text');
  assert.match(page, /journey, canvasVersion, repository: repoAttached && canvasRepository\(app\), describe: describeBlock \}\);/);
});

// ---- Owner decision 3: review boards stay apart from real learner boards; ?board=main is not the learner's main ----
test('a review board named main slugs to review-main, so it never shares the real main board row, journey or Tutor store', () => {
  const boardSlug = new Function(`${page.match(/^const boardSlug = .*$/m)[0]}\nreturn boardSlug;`)();
  for (const name of ['main', 'Main', 'MAIN', ' main ', 'main!']) assert.equal(boardSlug(name), 'review-main', name);
  assert.equal(boardSlug('demo'), 'demo');
  assert.equal(boardSlug('review-main'), 'review-main');
  assert.equal(boardSlug('!!!'), 'test');
  // The slug is the one name every per-board store and route uses: the server row, the journey, the Tutor store, local copies.
  assert.match(page, /const board = named \? boardSlug\(named\) : null;/);
  assert.match(page, /const boardName = board \|\| 'main';/);
  assert.match(page, /const boardPath = `\/api\/learn\/boards\/\$\{encodeURIComponent\(app\.name\)\}\/\$\{encodeURIComponent\(boardName\)\}`;/);
  assert.match(page, /const journey = useJourney\(\{ app, board: boardName,/);
  assert.match(page, /const tutor = useTutor\(\{ app, board: boardName,/);
});

// Owner 2026-10-08 (r29): the next-section hook carries data-next-section and a fixed note saying where it goes, and that it skips
// this section when its evidence is not met; the other hooks are unchanged. The page moves on through the journey for it.
test('r29 the hook card: the next-section hook says Next section, and skips this section when its evidence is not met', () => {
  const withSection = skips => { const s = set('ready'); s.options[2] = { ...s.options[2], section: { id: 's2', title: 'From a score to probability', skips } }; return card(s); };
  const skipping = withSection(true), completing = withSection(false);
  assert.match(skipping, /<button [^>]*data-next-step="ns_0a0b0c0d\.3" data-next-section="s2" aria-label="Where would yeast surprise an expert baker\? \(Next section - skips this section\)"/);
  assert.match(skipping, /<span data-next-section-note="true" class="block text-xs text-ink-3">Next section - skips this section<\/span>/);
  assert.match(completing, /<span data-next-section-note="true" class="block text-xs text-ink-3">Next section<\/span>/);
  assert.equal((skipping.match(/data-next-section=/g) || []).length, 1, 'only that hook');
  assert.doesNotMatch(card(set('ready')), /data-next-section/, 'no section, no note');
});
