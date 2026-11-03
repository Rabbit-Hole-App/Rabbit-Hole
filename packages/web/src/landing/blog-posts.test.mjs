import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stories, storyCountLabel, renderStoryCards, cover } from './blog-posts.js';

test('the story count label pluralizes from the post count', () => {
  assert.equal(storyCountLabel(0), '0 stories');
  assert.equal(storyCountLabel(1), '1 story');
  assert.equal(storyCountLabel(2), '2 stories');
});

// Owner, 2026-11-02: rabbit-holes-not-courses is the only published story (the earlier a-page-that-teaches sample is removed).
test('the blog publishes one story and renders one card from the same array', () => {
  assert.deepEqual(stories.map(s => s.slug), ['rabbit-holes-not-courses']);
  const html = renderStoryCards(stories);
  assert.equal(html.match(/<li>/g).length, 1);
  assert.match(html, /href="\/blog\?post=rabbit-holes-not-courses"/);
  assert.match(html, /We're building rabbit holes, not courses/);
  assert.match(html, /<time datetime="2026-11-02">2 Nov 2026<\/time><span>5 min read<\/span>/);
  assert.doesNotMatch(html, /Why a landing page should teach you something/);
  assert.equal(storyCountLabel(stories.length), '1 story');
});

test('a hero image fills the whole cover with no label; a post without one keeps the text cover', () => {
  const [post] = stories, plain = { ...post, hero: undefined };
  const html = cover(post);
  assert.match(html, /<div class="hero-wash"><img src="\/landing\/blog\/rabbit-holes-not-courses-hero\.jpg" alt="The White Rabbit, Alice, the Mad Hatter/, 'the post carries its generated hero');
  assert.doesNotMatch(html, /<small|Rabbit Hole \/ Notes|<i><\/i>|<span>/, 'a hero cover is only the image');
  assert.doesNotMatch(cover(plain), /<img/);
  assert.match(cover(plain), /aria-hidden="true"><i><\/i><i><\/i><span>Not courses\.<\/span>/);
  assert.match(cover(plain), /<small>Rabbit Hole \/ Notes<\/small>/);
});
