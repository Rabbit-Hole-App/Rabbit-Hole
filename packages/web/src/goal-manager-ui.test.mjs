// Progress and goal management presentation (owner, 2026-10-22): GoalManager is bundled with esbuild and rendered with
// react-dom/server, as md-render.test.mjs renders answers; Back, Close, drafts and focus run in a browser
// (e2e/goal-command-check.mjs, e2e/panel-header-check.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const read = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const dir = mkdtempSync(join(tmpdir(), 'goal-manager-')), outfile = join(dir, 'goals.cjs');
await esbuild.build({
  stdin: { contents: "export { default as GoalManager } from './GoalManager.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent', loader: { '.png': 'empty', '.svg': 'empty', '.css': 'empty' },
});
const B = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });
let board = 0;
const render = (goals, activeGoalId = null) => {
  const coaching = { status: 'ready', state: { goals, activeGoalId, revision: 1 }, act: async () => ({}), retry: () => {} };
  return B.renderToStaticMarkup(B.createElement(B.GoalManager, { scope: { app: 'canvas-0a1b2c3d', board: `b${++board}` }, coaching, onBack: () => {} }));
};
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const GOALS = [{ goalId: 'g1', label: 'Read a balance sheet', lifecycle: 'open', revision: 1 }, { goalId: 'g2', label: 'Spanish verbs', lifecycle: 'open', revision: 1 }];

test('Back comes first, left-aligned, in place of Done and the separate "Your learning goals" heading', () => {
  const html = render(GOALS, 'g1');
  assert.doesNotMatch(html, /Your learning goals|data-goal-done|>Done</);
  assert.match(html, /^<div data-goal-manager[^>]*><button[^>]*data-goal-back[^>]*>/, 'Back is the first control');
  const back = html.match(/<button[^>]*data-goal-back[^>]*>[\s\S]*?<\/button>/)[0];
  assert.match(back, /self-start/, 'left-aligned');
  assert.equal(text(back).trim(), 'Back', 'its name is Back; the arrow is decoration');
  assert.match(back, /<svg[^>]*aria-hidden="true"[^>]*lucide-arrow-left|<svg[^>]*lucide-arrow-left[^>]*aria-hidden="true"/);
});

test('Add goal is the house primary button: blue, white text, hover, focus-visible and disabled styles; no ellipsis', () => {
  const html = render(GOALS, 'g1');
  const add = html.match(/<button[^>]*data-goal-add-save[^>]*>[\s\S]*?<\/button>/)[0];
  assert.equal(text(add).trim(), 'Add goal');
  for (const cls of ['bg-primary-fill', 'text-white', 'hover:bg-primary-fill-hover', 'focus-visible:outline-2', 'disabled:opacity-50', 'disabled:cursor-default']) assert.ok(add.includes(cls), cls);
  assert.doesNotMatch(add, /bg-ink/, 'not the old black fill');
  assert.doesNotMatch(text(html), /\.\.\.|…/, 'no ellipsis in the copy');
  // Saving states (busy only while a save is in flight, so read from the source): the same words for add and edit.
  assert.match(read('GoalManager.jsx'), /\{busy\('add'\) \? 'Saving' : 'Add goal'\}/);
  assert.match(read('GoalManager.jsx'), /variant="primary" data-goal-save disabled=\{busy\(`edit:\$\{goal\.goalId\}`\)\}[^>]*>\{busy\(`edit:\$\{goal\.goalId\}`\) \? 'Saving' : 'Save changes'\}/);
});

test('the new goal: a short placeholder, a visible label on the optional outcome, and no "use no AI" line', () => {
  const html = render([], null);
  assert.match(html, /placeholder="Learn logistic regression"/);
  assert.match(html, /<label class="(?![^"]*sr-only)[^"]*" for="goal-new-outcome">What would success look like\? \(optional\)<\/label>/, 'visible, tied to its field');
  assert.doesNotMatch(html, /Saved goals use no AI|use no AI/);
  assert.match(text(html), /A new goal becomes your current goal\./);
  assert.match(html, /data-goal-empty/, 'the empty state');
});

test('the Progress pane: "Progress", "Progress: Learning Goals" while managing, one current indicator, and no skills said plainly', () => {
  const pane = read('LearnProgress.jsx');
  assert.match(pane, /<h2 id="progress-title"[^>]*>\{managing \? 'Progress: Learning Goals' : 'Progress'\}<\/h2>/, 'one header, the existing one');
  assert.match(pane, /<GoalManager [^\n]*onBack=\{\(\) => \{ setManaging\(false\); requestAnimationFrame\(\(\) => heading\.current\?\.focus\(\)\); \}\}/, 'Back returns to the overview, focus on its heading');
  assert.match(pane, /data-progress-close onClick=\{onClose\}/, 'Close closes; neither saves nor discards a draft');
  assert.doesNotMatch(pane, /'Your current goal'/, 'the selector\'s "(current)" is the one indicator');
  assert.match(pane, /\{goal\.label\}\{goal\.active \? ' \(current\)' : ''\}/);
  assert.match(pane, /<span>You are viewing this goal\. Your current goal is \{model\.active\.label\}\.<\/span>/, 'the warning when viewing another goal stays');
  assert.match(pane, /model\.total === 0 && <div data-progress-no-skills[^>]*>\s*<p[^>]*>No skills tracked yet<\/p>/);
  assert.match(pane, /\{model\.total > 0 && <div data-progress-count/, 'no "0 of 0"');
  assert.match(pane, /\{model\.total > 0 && <h3[^>]*>Your skills<\/h3>\}/, 'no empty "Your skills" section');
});
