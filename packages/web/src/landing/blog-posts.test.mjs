import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stories, storyCountLabel, renderStoryCards } from './blog-posts.js';

test('the story count label pluralizes from the post count', () => {
  assert.equal(storyCountLabel(0), '0 stories');
  assert.equal(storyCountLabel(1), '1 story');
  assert.equal(storyCountLabel(2), '2 stories');
});

// Owner, 2026-10-29: only a-page-that-teaches is published; the five sample stories are removed.
test('the blog publishes one story and renders one card from the same array', () => {
  assert.deepEqual(stories.map(s => s.slug), ['a-page-that-teaches']);
  const html = renderStoryCards(stories);
  assert.equal(html.match(/<li>/g).length, 1);
  assert.match(html, /href="\/blog\?post=a-page-that-teaches"/);
  assert.match(html, /Why a landing page should teach you something/);
  assert.equal(storyCountLabel(stories.length), '1 story');
});
