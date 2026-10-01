import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

// The NanoGPT course ships in the production build (VITE_RABBIT_HOLE, no VITE_COACHING_DEV). Its lessons
// come from the material-plan review documents, so the REAL LessonPlanPreview is bundled twice, as in
// practice-panel.test.mjs: once as production (no import.meta.env) and once as the dev/review build.
// Production, owner or learner: no review wording, build specs or author notes, and quiz answers only
// after the learner checks one. The review build keeps the answer key for the owner's editor view.
const here = fileURLToPath(new URL('.', import.meta.url));
// Vite's `?raw` (the lesson documents) and `?url` (a pdf.js worker that Md's imports reach) suffixes.
const raw = { name: 'raw', setup(build) {
  build.onResolve({ filter: /\?raw$/ }, args => ({ path: join(args.resolveDir, args.path.slice(0, -4)), namespace: 'raw' }));
  build.onLoad({ filter: /.*/, namespace: 'raw' }, args => ({ contents: readFileSync(args.path, 'utf8'), loader: 'text' }));
  build.onResolve({ filter: /\?url$/ }, args => ({ path: args.path, namespace: 'url' }));
  build.onLoad({ filter: /.*/, namespace: 'url' }, () => ({ contents: '', loader: 'text' }));
} };
const dir = mkdtempSync(join(tmpdir(), 'lesson-plan-preview-'));
const load = async (name, define) => {
  const outfile = join(dir, `${name}.cjs`);
  await esbuild.build({
    stdin: {
      contents: [
        "export { default as LessonPlanPreview, parseQuiz, quizFeedback } from './LessonPlanPreview.jsx';",
        "export { createElement } from 'react';",
        "export { renderToStaticMarkup } from 'react-dom/server';",
      ].join('\n'),
      resolveDir: here,
      loader: 'jsx',
    },
    bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent', plugins: [raw], define, loader: { '.css': 'empty' },
  });
  return createRequire(import.meta.url)(outfile);
};
const production = await load('production', {});
const review = await load('review', { 'import.meta.env': '{"VITE_COACHING_DEV":"true"}' });
rmSync(dir, { recursive: true, force: true });

const render = ({ LessonPlanPreview, createElement, renderToStaticMarkup }, props) =>
  renderToStaticMarkup(createElement(LessonPlanPreview, { onSelect() {}, onBack() {}, edits: {}, ...props }));
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');
const views = [
  { view: 'curriculum' },
  ...[0, 1, 2].map(selected => ({ view: 'plan', selected })),
].flatMap(props => [true, false].map(learnerView => ({ ...props, learnerView })));
const INTERNAL = /material plan|ready for review|review before|draft|rendering or generating|answer key|planned asset|insert the|reuse the|reuse and expand|supporting visual|caption:|alt text|pending testing|objective:|canvas text|drawing sequence|spoken or written|planned evidence|not written yet/i;

test('production, owner or learner, shows no review wording, build specs or author notes', () => {
  for (const props of views) {
    const html = render(production, props);
    assert.doesNotMatch(text(html), INTERNAL, `${JSON.stringify(props)}: ${text(html).match(INTERNAL)?.[0]} in …${text(html).slice(Math.max(0, text(html).search(INTERNAL) - 120), text(html).search(INTERNAL) + 80)}`);
    assert.doesNotMatch(html, /aria-label="(?:Lesson material plan|Quiz answer key|Correct answer)"/, JSON.stringify(props));
  }
  assert.match(text(render(production, { view: 'curriculum', learnerView: true })), /Lesson pages, quiz and flashcards.*Outline only/);
  assert.match(text(render(production, { view: 'plan', selected: 0, learnerView: true })), /Read the lesson pages, then try the quiz, flashcards and optional notebook\..*Play Lesson 1.*Explanation.*Further explanations.*References and further reading/);
});

test('production quiz: choices unchecked, no answer or explanation until the learner checks one', () => {
  for (const [selected, questions] of [[0, 2], [1, 3]]) for (const learnerView of [true, false]) {
    const html = render(production, { view: 'plan', selected, learnerView });
    const quiz = html.slice(html.indexOf('data-plan-activity="quiz"'), html.indexOf('data-plan-activity="cards"'));
    assert.equal((quiz.match(/type="radio"/g) || []).length, questions * 3);
    assert.doesNotMatch(quiz, /checked=""/);
    assert.equal((quiz.match(/<button type="submit" disabled="">Check answer|disabled="" class="[^"]*">Check answer/g) || []).length, questions);
    assert.match(text(quiz), /Before answering:/);
    assert.doesNotMatch(text(quiz), /Why [A-Z] is right|If you chose|Transfer check|Correct\./);
    const cards = html.slice(html.indexOf('data-plan-activity="cards"'), html.indexOf('data-plan-activity="notebook"'));
    assert.match(cards, /<details class="mt-2 text-sm"><summary[^>]*>Show answer<\/summary>/);
    assert.doesNotMatch(cards, /<details class="mt-2 text-sm" open/);
  }
});

test('a checked answer reveals only its own note; the right one reveals the why and the transfer check', () => {
  const plans = ['lesson-01-plan.md', 'lesson-02-plan.md'].map(name => readFileSync(join(here, '../../../docs/courses/nanogpt', name), 'utf8'));
  const questions = plans.flatMap(plan => plan.split(/^## /m).find(part => part.startsWith('Quiz')).split(/^### /m).slice(1));
  assert.equal(questions.length, 5);
  for (const question of questions) {
    const quiz = production.parseQuiz(question);
    assert.ok(quiz, question.slice(0, 40));
    for (const { key } of quiz.choices) {
      const feedback = production.quizFeedback(quiz, key);
      assert.equal(feedback.correct, key === quiz.answer);
      if (key === quiz.answer) {
        assert.match(feedback.text, new RegExp(`^\\*\\*Why ${key} is right:\\*\\* \\S[\\s\\S]*\\*\\*Transfer check:\\*\\* \\S`));
      } else {
        assert.match(feedback.text, new RegExp(`^\\*\\*If you chose ${key}:\\*\\* \\S`));
        assert.doesNotMatch(feedback.text, new RegExp(`Why [A-Z] is right|Transfer check|If you chose (?!${key})`));
      }
      assert.doesNotMatch(feedback.text, /Objective:|Correct:/);
    }
  }
});

test('the review build keeps the answer key and review wording in the owner editor view only', () => {
  const editor = render(review, { view: 'plan', selected: 0, learnerView: false });
  assert.match(editor, /aria-label="Quiz answer key"/);
  assert.match(text(editor), /Draft material plan · review before rendering or generating assets/);
  assert.match(text(editor), /Canvas text.*Assets.*Drawing sequence/);
  const learner = render(review, { view: 'plan', selected: 0, learnerView: true });
  assert.doesNotMatch(text(learner), INTERNAL);
  assert.doesNotMatch(learner, /aria-label="Quiz answer key"/);
});
