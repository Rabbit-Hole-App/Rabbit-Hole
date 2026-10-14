// Which source each gate stage runs: the candidate's own check, or the harness's rewrite of it. The gate judges the candidate's own
// checks; it rewrites one only while the app has not moved the fix into the check (adapters) or the check cannot take the gate's
// environment (answer-routing).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { prepare, FIXTURE_ADAPTERS, GATE_ENV_MARKER } from './prepare.mjs';
import { SHARDS } from './shards.mjs';

assert.ok(process.env.R36_FIXTURE_SOURCE_ROOT, 'R36_FIXTURE_SOURCE_ROOT must identify the reviewed application checkout');
const fixture = name => readFileSync(join(process.env.R36_FIXTURE_SOURCE_ROOT, 'packages/web/e2e', name), 'utf8');
// The checks the app carries once it has moved the three fixes in: each adapter's output is what the app committed.
const MOVED = ['shared-canvas-ask-check.mjs', 'selected-pill-check.mjs', 'repo-browser-check.mjs'];
const STAGE = { 'shared-canvas-ask-check.mjs': 'sca', 'selected-pill-check.mjs': 'selected-pill', 'repo-browser-check.mjs': 'repo-browser', 'tutor-slice-check.mjs': 'tutor-slice' };
// What the app's answer-routing-check.mjs looks like at 9e2b459e, release/r38-trial and feature/ui-polish-r38: bound to the dev review clone.
const DEV_CLONE_CHECK = "const BASE = process.env.BASE || 'https://rabbit-hole-web-dev-answer-routing.tryrabbithole.workers.dev';\nif (new URL(BASE).hostname !== 'rabbit-hole-web-dev-answer-routing.tryrabbithole.workers.dev') throw Error('Use the answer-routing review clone');\n";
const GATE_CHECK = `const LOCAL_CP_VARS = ${GATE_ENV_MARKER};\nconsole.log('2/2 checks passed');\n`;

function gate({ moved = false, routing, chatPane = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'r36-sources-'));
  const app = join(root, 'app'), e2e = join(app, 'packages/web/e2e');
  mkdirSync(e2e, { recursive: true });
  for (const [name, adapt] of Object.entries(FIXTURE_ADAPTERS)) writeFileSync(join(e2e, name), moved && MOVED.includes(name) ? adapt(fixture(name)) : fixture(name));
  if (routing !== undefined) writeFileSync(join(e2e, 'answer-routing-check.mjs'), routing);
  if (chatPane) { mkdirSync(join(app, 'packages/web/src'), { recursive: true }); writeFileSync(join(app, 'packages/web/src/ChatPane.jsx'), ''); }
  const { gate: dir } = prepare({ app, state: join(root, 'state'), sha: 'a'.repeat(40), tree: 'b'.repeat(40), grant: 'self-test' });
  const int35 = readFileSync(join(dir, 'int35.sh'), 'utf8');
  return { root, e2e, dir, int35, runLine: stage => int35.match(new RegExp(`^run stack\\.sh ${stage} (\\S+)$`, 'm'))?.[1], notes: readFileSync(join(dir, 'adapters.log'), 'utf8') };
}
const done = g => rmSync(g.root, { recursive: true, force: true });

test('answer-routing runs the candidate\'s own check when it takes the gate environment, else the harness template', () => {
  const absent = gate(), dev = gate({ routing: DEV_CLONE_CHECK }), own = gate({ routing: GATE_CHECK });
  try {
    for (const g of [absent, dev]) {
      assert.equal(g.runLine('answer-routing'), 'r36-routing-operator.mjs');
      assert.ok(existsSync(join(g.e2e, 'r36-routing-operator.mjs')), 'the template is copied in');
    }
    assert.match(absent.notes, /^answer-routing: the candidate has no answer-routing-check\.mjs; the harness template runs$/m);
    assert.match(dev.notes, /^answer-routing: the candidate check answer-routing-check\.mjs does not take the gate environment \(no LOCAL_CP_VARS\); the harness template runs$/m);
    assert.equal(own.runLine('answer-routing'), 'answer-routing-check.mjs');
    assert.ok(!existsSync(join(own.e2e, 'r36-routing-operator.mjs')), 'the template is not copied in');
    assert.match(own.notes, /^answer-routing: the candidate check answer-routing-check\.mjs runs as it is$/m);
    // The same environment either way: LOCAL_CP_VARS is exported before the stage, after sketch.
    for (const g of [absent, own]) assert.match(g.int35, /^run stack\.sh sketch [^\n]*\nexport LOCAL_CP_VARS="\$W\/packages\/control-plane\/\.dev\.vars"\nrun stack\.sh answer-routing /m);
    assert.equal(own.int35.match(/^run stack\.sh answer-routing /gm).length, 1);
    const bash = process.env.GATE_BASH || process.env.GIT_BASH_PATH;
    if (bash) for (const g of [absent, own]) assert.equal(spawnSync(bash, ['-n', join(g.dir, 'int35.sh')], { windowsHide: true }).status, 0);
  } finally { [absent, dev, own].forEach(done); }
});

test('a check that already carries its adapter\'s fix runs as the candidate wrote it, and an old one is adapted as before', () => {
  const old = gate(), moved = gate({ moved: true });
  try {
    for (const name of Object.keys(FIXTURE_ADAPTERS)) {
      if (name !== 'tutor-slice-check.mjs') assert.equal(old.runLine(STAGE[name]), `r36-${name}`, `${name}: adapted`);
      else assert.ok(old.int35.includes(`-- e2e/r36-${name}`), `${name}: adapted`);
      assert.ok(existsSync(join(old.e2e, `r36-${name}`)));
      assert.match(old.notes, new RegExp(`^${STAGE[name]}: adapter applied$`, 'm'));
    }
    for (const name of MOVED) {
      assert.equal(moved.runLine(STAGE[name]), name, `${name}: the candidate's own file`);
      assert.ok(!existsSync(join(moved.e2e, `r36-${name}`)), `${name}: no rewritten copy`);
      assert.match(moved.notes, new RegExp(`^${STAGE[name]}: adapter not needed$`, 'm'));
    }
    // tutor-slice's adapter is unchanged: always applied.
    assert.ok(moved.int35.includes('-- e2e/r36-tutor-slice-check.mjs'), 'tutor-slice still runs its rewritten copy');
    assert.ok(existsSync(join(moved.e2e, 'r36-tutor-slice-check.mjs')));
    assert.match(moved.notes, /^tutor-slice: adapter applied$/m);
    // The focused phase runs whichever file each of its two stages runs here.
    const focused = readFileSync(join(moved.dir, 'focused.sh'), 'utf8');
    assert.match(focused, /^run stack\.sh sca shared-canvas-ask-check\.mjs$/m);
    assert.match(focused, /^run stack\.sh selected-pill selected-pill-check\.mjs$/m);
    // Every shard script is still valid bash with the original names in it.
    const bash = process.env.GATE_BASH || process.env.GIT_BASH_PATH;
    if (bash) for (let k = 1; k <= SHARDS.length; k++) assert.equal(spawnSync(bash, ['-n', join(moved.dir, `shard-${k}.sh`)], { windowsHide: true }).status, 0, `shard-${k}`);
  } finally { [old, moved].forEach(done); }
});

// The chat workspace (ChatPane.jsx in the candidate) is judged by answer-routing-chat.mjs; an older candidate keeps answer-routing.mjs.
test('answer-routing picks the chat workspace template when the candidate has the Chat pane', () => {
  const chat = gate({ routing: DEV_CLONE_CHECK, chatPane: true }), dock = gate({ routing: DEV_CLONE_CHECK });
  try {
    assert.equal(chat.runLine('answer-routing'), 'r36-routing-operator.mjs');
    assert.ok(readFileSync(join(chat.e2e, 'r36-routing-operator.mjs'), 'utf8').includes("const pane = page.locator('[data-chat-pane]');"), 'the chat template is copied in');
    assert.match(chat.notes, /^answer-routing: template answer-routing-chat\.mjs$/m);
    assert.ok(readFileSync(join(dock.e2e, 'r36-routing-operator.mjs'), 'utf8').includes("page.locator('[data-learn-dock] [data-chat-composer] input"), 'the dock template is copied in');
    assert.match(dock.notes, /^answer-routing: template answer-routing\.mjs$/m);
  } finally { [chat, dock].forEach(done); }
});
// Owner brief 2026-10-13 and contract B5: one composer, in the Chat pane; answers in its transcript; a card only by Add as card.
test('the chat workspace template drives the Chat pane and asserts answers stay in the transcript until Add as card', () => {
  const text = readFileSync(join(HERE, 'templates/answer-routing-chat.mjs'), 'utf8');
  assert.doesNotMatch(text, /\[data-learn-dock\] \[data-chat-composer\]|data-chat-sheet/, 'no dock composer and no sheet above it');
  assert.match(text, /const pane = page\.locator\('\[data-chat-pane\]'\)/);
  assert.match(text, /check\('no canvas card is created by itself for an answer', await cards\(\) === 0\)/);
  assert.match(text, /locator\('\[data-add-to-canvas\]'\)\.click\(\)/);
  assert.match(text, /a click on Added locates the card and adds no duplicate/);
  // Gate 38576690012: Chat pane turns post to /api/learn/ask; the template answers it in the contract's SSE order (B2).
  assert.match(text, /path === '\/api\/learn\/ask' \|\| path === '\/api\/learn\/tutor\/plan'/);
  assert.ok(text.indexOf("event('chunk'") < text.indexOf("event('answer_meta'") && text.indexOf("event('answer_meta'") < text.indexOf("event('done'"), 'chunk, answer_meta, done');
  assert.match(text, /throw Error\(`Unscripted model-capable request: \$\{path\}`\)/, 'everything else stays a tripwire');
  assert.ok(text.match(/^  check\(/gm).length >= 15);
  assert.ok(text.includes("check('provider tripwire remains empty'"));
});

// The template runs for every candidate until the app's own check takes the gate environment, so it asserts what the release does.
// Owner decision, 2026-10-13 (polish 1f626264): the Card conversation tab and panel are removed; a question about a selected card is
// answered as an ordinary chat card scoped to that card, and the right panel does not open for it.
const HERE = dirname(fileURLToPath(import.meta.url));
const POLISH = '401903a9'; // feature/ui-polish-r38: the app's own rewritten answer-routing-check.mjs
const polishCheck = spawnSync('git', ['show', `${POLISH}:packages/web/e2e/answer-routing-check.mjs`], { cwd: HERE, encoding: 'utf8', maxBuffer: 1 << 26 });
const template = () => readFileSync(join(HERE, 'templates/answer-routing.mjs'), 'utf8').replaceAll('\r\n', '\n');
test('the answer-routing template no longer asserts the Card conversation panel, and says what the release does instead', () => {
  const text = template();
  assert.doesNotMatch(text, /page\.locator\('\[data-card-conversation="/, 'no card conversation panel is looked up');
  assert.doesNotMatch(text, /panel\.isVisible\(\)|opens the right panel without another card|follow-up stays with the same card conversation|restores its conversation|card conversations remain isolated/);
  assert.match(text, /name: 'Card conversation' \}\)\.count\(\) === 0/, 'the tab is asserted absent');
  assert.ok(text.split('conversationUi() === 0').length - 1 >= 4, 'no conversation UI after the answer, the follow-up, a reselect and the clarification');
  assert.match(text, /context\?\.target\?\.description\)\.includes\('Card 0 explains a different idea\.'\)/, 'the question is still scoped to the selected card');
  assert.match(text, /the answer leaves the right panel as it was/);
  // collect and run.mjs want the stage to print at least 15 checks; the tripwire check is the template's own.
  assert.ok(text.match(/^  check\(/gm).length >= 15);
  assert.ok(text.includes("check('provider tripwire remains empty'"));
});
test('the template\'s assertions are, line for line, those of the app\'s rewritten check at 401903a9', { skip: polishCheck.status !== 0 }, () => {
  const between = (text, end) => text.replaceAll('\r\n', '\n').slice(text.indexOf('try {\n'), text.indexOf(end));
  const theirs = between(polishCheck.stdout, '  writeFileSync(`${OUT}/evidence.json`');
  const ours = between(template(), '  const tripwireResponse');
  assert.ok(theirs.length > 4000 && ours.length > 4000);
  assert.equal(ours, theirs, 'everything between try { and the evidence file: the template adds only the environment, the tripwire read and the N/N line');
});

