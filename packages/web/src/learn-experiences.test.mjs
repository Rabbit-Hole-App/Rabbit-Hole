// The production allowlist (learn-experiences.js): the approved NanoGPT Tutor is reachable as a product
// experience, and nothing in a URL turns into any other board.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EXPERIENCES, experienceForBoard, experienceHref, experienceOf } from './learn-experiences.js';
import { TUTOR_BOARD } from './learn-tutor-claims.js';
import { BOARDS, BOARD_SEED_VERSIONS } from './demo-scenes.js';
import { holeHref, levelHref } from './dive.js';

const nano = { kind: 'repository', name: 'repo-nanogpt', repo: 'karpathy/nanoGPT' };

test('the allowlist is exactly the approved NanoGPT Tutor', () => {
  assert.deepEqual(Object.keys(EXPERIENCES), ['tutor']);
  assert.equal(EXPERIENCES.tutor.board, TUTOR_BOARD);
  assert.equal(EXPERIENCES.tutor.repo, 'karpathy/nanoGPT');
  assert.ok(Object.isFrozen(EXPERIENCES) && Object.isFrozen(EXPERIENCES.tutor));
  // Same seed and storage namespace as the review board, so both open one canvas.
  assert.equal(EXPERIENCES.tutor.version, BOARD_SEED_VERSIONS[TUTOR_BOARD]);
  assert.equal(EXPERIENCES.tutor.seed, BOARDS[TUTOR_BOARD]);
});

test('the Tutor opens only by its product name, on the NanoGPT repository, in a Rabbit Hole build', () => {
  assert.equal(experienceOf(nano, '?tab=learn&experience=tutor', true), 'tutor');
  assert.equal(experienceOf(nano, '?tab=learn&experience=tutor', false), null);
  assert.equal(experienceOf({ ...nano, repo: 'someone/else' }, '?experience=tutor', true), null);
  assert.equal(experienceOf({ kind: 'canvas', name: 'canvas-0a1b2c3d' }, '?experience=tutor', true), null);
  assert.equal(experienceOf(nano, '?tab=learn', true), null);
});

test('no board name, review board or prototype key becomes an experience', () => {
  for (const name of [TUTOR_BOARD, ...Object.keys(BOARDS), 'nanogpt-deep-dive', 'TUTOR', 'tutor ', 'constructor', '__proto__', 'hasOwnProperty', 'toString'])
    assert.equal(experienceOf(nano, `?experience=${encodeURIComponent(name)}`, true), null, name);
  // ?board= is never read here: the product road ignores it whatever it names.
  assert.equal(experienceOf(nano, `?board=${TUTOR_BOARD}`, true), null);
  assert.equal(experienceOf(nano, '?board=nanogpt-deep-dive&experience=nope', true), null);
});

test('a Rabbit Hole under the Tutor climbs back through the product URL, never ?board=', () => {
  assert.equal(experienceForBoard(TUTOR_BOARD), 'tutor');
  assert.equal(experienceForBoard('nanogpt-deep-dive'), null);
  assert.equal(levelHref({ app: 'repo-nanogpt', board: TUTOR_BOARD }), '/apps/repo-nanogpt?tab=learn&experience=tutor');
  assert.equal(holeHref({ app: 'repo-nanogpt', board: TUTOR_BOARD }, 'canvas-0a1b2c3d'), '/apps/repo-nanogpt?tab=learn&experience=tutor&hole=canvas-0a1b2c3d');
  // Review boards and canvases keep their dev/review URLs.
  assert.equal(levelHref({ app: 'canvas-00000000', board: TUTOR_BOARD }), `/apps/canvas-00000000?board=${TUTOR_BOARD}`);
  assert.equal(levelHref({ app: 'repo-nanogpt', board: 'nanogpt-deep-dive' }), '/apps/repo-nanogpt?tab=learn&board=nanogpt-deep-dive');
  assert.equal(experienceHref('repo-nanogpt', 'tutor'), '/apps/repo-nanogpt?tab=learn&experience=tutor');
  assert.equal(experienceHref('repo-nanogpt', null), '/apps/repo-nanogpt?tab=learn');
});

test('LearnPage keeps ?board= review-only and seeds review boards only in the review build', () => {
  const page = readFileSync(new URL('./LearnPage.jsx', import.meta.url), 'utf8');
  assert.match(page, /const named = hole \|\| experience \|\| !reviewTools \? null : new URLSearchParams\(window\.location\.search\)\.get\('board'\);/);
  assert.match(page, /const board = experience \? EXPERIENCES\[experience\]\.board : named \? boardSlug\(named\) : null;/);
  assert.match(page, /seedBlocks=\{experience \? EXPERIENCES\[experience\]\.seed\(\) : reviewTools && board \? \(BOARDS\[board\]\?\.\(\) \?\? \[\]\) : null\}/);
  assert.match(page, /\{reviewTools && board && !experience && !BOARDS\[board\] && /);
  // The Tutor entry sits beside Practice on the supplied course; inside the Tutor, Back to lesson leaves it.
  assert.match(page, /suppliedCourse && <button type="button" data-learn-tutor/);
  assert.match(page, /navigate\(experienceHref\(app\.name, experience \? null : 'tutor'\)\)/);
});
