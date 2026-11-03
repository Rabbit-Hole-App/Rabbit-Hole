import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stories, storyCountLabel, renderStoryCards, cover } from './blog-posts.js';

test('the story count label pluralizes from the post count', () => {
  assert.equal(storyCountLabel(0), '0 stories');
  assert.equal(storyCountLabel(1), '1 story');
  assert.equal(storyCountLabel(2), '2 stories');
});

// Owner, 2026-10-29: only a-page-that-teaches is published; the five sample stories are removed.
// Owner, 2026-11-02: rabbit-holes-not-courses is published, newest first.
test('the blog publishes two stories and renders two cards from the same array', () => {
  assert.deepEqual(stories.map(s => s.slug), ['rabbit-holes-not-courses', 'a-page-that-teaches']);
  const html = renderStoryCards(stories);
  assert.equal(html.match(/<li>/g).length, 2);
  assert.match(html, /href="\/blog\?post=rabbit-holes-not-courses"/);
  assert.match(html, /We're building rabbit holes, not courses/);
  assert.match(html, /<time datetime="2026-11-02">2 Nov 2026<\/time><span>5 min read<\/span>/);
  assert.match(html, /href="\/blog\?post=a-page-that-teaches"/);
  assert.match(html, /Why a landing page should teach you something/);
  assert.match(html, /<time datetime="2026-09-28">28 Sep 2026<\/time><span>1 min read<\/span>/);
  assert.equal(storyCountLabel(stories.length), '2 stories');
});

test('a hero image renders washed from its slug path; a post without one keeps the text cover', () => {
  const [post] = stories, plain = { ...post, hero: undefined };
  assert.match(cover(post), /<div class="hero-wash"><img src="\/landing\/blog\/rabbit-holes-not-courses-hero\.png" alt="The White Rabbit, Alice/, 'the post carries its generated hero');
  assert.doesNotMatch(cover(plain), /<img/);
  assert.match(cover(plain), /aria-hidden="true"><i><\/i><i><\/i><span>Not courses\.<\/span>/);
  const html = cover({ ...post, hero: 'A faded engraving' });
  assert.match(html, /<div class="hero-wash"><img src="\/landing\/blog\/rabbit-holes-not-courses-hero\.png" alt="A faded engraving"><\/div>/);
  assert.match(html, /<small aria-hidden="true">Rabbit Hole \/ Notes<\/small>/);
  assert.doesNotMatch(html, /<span>Not courses/);
});
