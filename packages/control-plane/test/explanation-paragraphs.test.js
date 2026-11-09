// Owner 2026-11-08: Explanation prose in short paragraphs. The server splits any plain paragraph line over PARAGRAPH_MAX (220) at sentence ends;
// only line breaks are added (same characters, same sentence order), maths is never cut, headings/lists/tables/fences are untouched, and the card's
// P/V pattern still passes the layout check.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { settleExplanationBody, explanationProseChars, explanationProblem, EXPLANATION_GUIDANCE } from '../src/learn-primitives.js';
import { PARAGRAPH_MAX } from '../src/chat-depth.js';

const DIAGRAM = '```rh-diagram\n{"version":1,"diagram":{"kind":"cycle","title":"Loop","steps":["Plan","Do","Check"]}}\n```';
const sentences = [
  'A decision tree asks one question at a time about the data.',
  'Each answer sends a sample down one branch until it reaches a leaf.',
  'The leaf holds the prediction that the tree makes for that sample.',
  'Training chooses each question so the groups below it become purer.',
  'Impurity measures how mixed the classes are inside one group of samples.',
  'A pure group has only one class, so the tree can stop splitting there.',
];
const long = sentences.join(' ');
const paragraphsOf = md => md.split('\n\n').filter(Boolean);
const chars = md => md.replace(/\s+/g, ' ').trim();

test('a long single paragraph becomes short paragraphs of whole sentences, in order, with the same characters', () => {
  assert.ok(long.length > 380 && long.length < 520, String(long.length));
  const out = settleExplanationBody(long);
  const ps = paragraphsOf(out);
  assert.ok(ps.length >= 2 && ps.length <= 3, `${ps.length} paragraphs`);
  for (const p of ps) assert.ok(p.length <= PARAGRAPH_MAX, `${p.length}: ${p}`);
  assert.equal(chars(out), chars(long), 'same characters, only line breaks added');
  assert.equal(ps.join(' '), long, 'same sentence order');
  assert.equal(explanationProseChars({ body: out }), explanationProseChars({ body: long }), 'the budget count does not change');
});

test('an unchanged card is the same string (not re-saved); a short paragraph is untouched', () => {
  const body = `${sentences[0]} ${sentences[1]}\n\n${DIAGRAM}\n\n${sentences[2]}`;
  assert.equal(settleExplanationBody(body), body);
});

test('a single sentence over the limit stays whole; maths with a period inside is never cut', () => {
  const one = `${'This one sentence keeps going with many words about the very same idea '.repeat(5)}and then it ends.`;
  assert.ok(one.length > 300);
  assert.equal(settleExplanationBody(one), one, 'one long sentence stays one paragraph');
  const maths = `The share is $p = 0.5$ for the first class and $q = 1.0 - p$ for the second. ${sentences.join(' ')} The value $H = -0.5 \\ln 0.5 - 0.5 \\ln 0.5$ is the most mixed case.`;
  const out = settleExplanationBody(maths);
  for (const span of maths.match(/\$[^$]*\$/g)) assert.ok(out.includes(span), `maths kept whole: ${span}`);
  assert.equal(chars(out), chars(maths));
  assert.ok(paragraphsOf(out).length >= 2);
});

test('headings, list items, table rows, fences and visuals are untouched', () => {
  const heading = `## ${long}`, item = `- ${long}`, row = `| ${long} | ${long} |`;
  for (const line of [heading, item, row]) assert.equal(settleExplanationBody(line), line, line.slice(0, 20));
  const body = `${long}\n\n${DIAGRAM}\n\n${long}`;
  const out = settleExplanationBody(body);
  assert.ok(out.includes(DIAGRAM), 'the fence is intact');
  assert.equal(out.split(DIAGRAM).length, 2);
});

test('a body with a visual keeps its P/V pattern and passes the layout check', () => {
  const body = `${long}\n\n${DIAGRAM}\n\n${long}`;
  const out = settleExplanationBody(body);
  const card = { title: 'Trees', body: out };
  const problem = explanationProblem(card, 'standard', 'How does a decision tree work?');
  assert.ok(!/layout|marker|prose part|before and after/i.test(String(problem || '')), `layout accepted: ${problem}`);
  for (const p of paragraphsOf(out).filter(p => !p.startsWith('```'))) assert.ok(p.length <= PARAGRAPH_MAX || p.split(/(?<=[.!?])\s+/).length === 1, p);
});

test('the author is asked for short paragraphs', () => {
  assert.ok(EXPLANATION_GUIDANCE.includes('Write prose in short paragraphs of two or three sentences, at most about 220 characters each, separated by a blank line; never one long paragraph.'));
  assert.equal(PARAGRAPH_MAX, 220);
});
