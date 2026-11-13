import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stories, storyCountLabel, renderStoryCards, cover } from './blog-posts.js';

test('the story count label pluralizes from the post count', () => {
  assert.equal(storyCountLabel(0), '0 stories');
  assert.equal(storyCountLabel(1), '1 story');
  assert.equal(storyCountLabel(2), '2 stories');
});

// Owner, 2026-11-02: rabbit-holes-not-courses is the first published story (the earlier a-page-that-teaches sample is removed); 2026-11-13: a placeholder /explain post is listed first.
test('the blog publishes its stories and renders one card each from the same array', () => {
  assert.equal(new Set(stories.map(s => s.slug)).size, stories.length, 'slugs are unique');
  assert.equal(stories.at(-1).slug, 'rabbit-holes-not-courses', 'the first story is the oldest, listed last');
  const html = renderStoryCards(stories);
  assert.equal(html.match(/<li>/g).length, stories.length);
  assert.match(html, /href="\/blog\?post=rabbit-holes-not-courses"/);
  assert.match(html, /We're building rabbit holes, not courses/);
  assert.match(html, /<time datetime="2026-11-02">2 Nov 2026<\/time><span>5 min read<\/span>/);
  assert.doesNotMatch(html, /Why a landing page should teach you something/);
  assert.equal(storyCountLabel(stories.length), `${stories.length} stories`);
});

test('a hero image fills the whole cover with no label; a post without one keeps the text cover', () => {
  const post = stories.find(s => s.slug === 'rabbit-holes-not-courses'), plain = { ...post, hero: undefined };
  const html = cover(post);
  assert.match(html, /<div class="hero-wash"><img src="\/landing\/blog\/rabbit-holes-not-courses-hero\.jpg" alt="The White Rabbit, Alice, the Mad Hatter/, 'the post carries its generated hero');
  assert.doesNotMatch(html, /<small|Rabbit Hole \/ Notes|<i><\/i>|<span>/, 'a hero cover is only the image');
  assert.doesNotMatch(cover(plain), /<img/);
  assert.match(cover(plain), /aria-hidden="true"><i><\/i><i><\/i><span>Not courses\.<\/span>/);
  assert.match(cover(plain), /<small>Rabbit Hole \/ Notes<\/small>/);
});

test('the /explain post has its own hero image and a body', () => {
  const post = stories.find(s => s.slug === 'explain-post');
  assert.match(cover(post), /<img src="\/landing\/blog\/explain-post-hero\.jpg" alt="The White Rabbit on a tree stump/);
  assert.ok(post.body.length > 0);
});

// Owner, 2026-11-13: the number on a card is its place in publication order (the first blog is 01), though the newest is listed first.
test('cards are numbered by publication order, newest listed first', () => {
  const html = renderStoryCards(stories);
  const nums = [...html.matchAll(/blog-card-category"><span>[^<]*<\/span><span aria-hidden="true">(\d\d)</g)].map(m => m[1]);
  assert.deepEqual(nums, stories.map((_, i) => String(stories.length - i).padStart(2, '0')));
  assert.equal(nums.at(-1), '01');
});
