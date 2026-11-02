// The creator-analytics collector's pure rules (publication-analytics.js): one source per arrival, and the active clock.
import test from 'node:test';
import assert from 'node:assert/strict';
import { classifySource, isActive, resourceOf } from './publication-analytics.js';

const origin = 'https://digrabbithole.com';
test('the source comes from the arrival; a referrer path or query never leaves', () => {
  const of = (referrer, search = '') => classifySource({ referrer, origin, search });
  assert.deepEqual(of('https://www.linkedin.com/feed/?x=1'), { source: 'linkedin' });
  assert.deepEqual(of('https://lnkd.in/abc'), { source: 'linkedin' });
  assert.deepEqual(of('', '?utm_source=LinkedIn&utm_campaign=SGD-Post'), { source: 'linkedin', campaign: 'sgd-post' });
  assert.deepEqual(of(`${origin}/explore?q=x`), { source: 'explore' });
  assert.deepEqual(of(`${origin}/library?view=stars`), { source: 'stars' });
  assert.deepEqual(of(`${origin}/@ana?tab=stars`), { source: 'stars' });
  assert.deepEqual(of(`${origin}/@ana`), { source: 'creator_profile' });
  assert.deepEqual(of(`${origin}/library`), { source: 'direct' });
  assert.deepEqual(of('https://News.Example.com/a/b?secret=1'), { source: 'other_referrer', referrer_host: 'news.example.com' });
  assert.deepEqual(of(''), { source: 'direct' });
  assert.deepEqual(of('not a url'), { source: 'direct' });
  assert.deepEqual(of('', '?utm_campaign=has%20space%21'), { source: 'direct' }, 'a tag outside the allowlist is dropped');
});
test('active: visible and an activity signal within 60 seconds; hidden or idle is not', () => {
  assert.equal(isActive({ visible: true, now: 59_999, lastActivity: 0 }), true);
  assert.equal(isActive({ visible: true, now: 60_000, lastActivity: 0 }), false, 'the threshold');
  assert.equal(isActive({ visible: false, now: 1, lastActivity: 0 }), false, 'a background tab');
});
test('a resource key matches the server boardSources key', () => {
  assert.equal(resourceOf({ type: 'video', videoId: 'abc' }), 'video:abc');
  assert.equal(resourceOf({ type: 'paper', paper: { id: '1706.03762' } }), 'paper:1706.03762');
  assert.equal(resourceOf({ type: 'wiki', title: 'Softmax' }), 'wiki:Softmax');
  assert.equal(resourceOf({ type: 'explanation' }), null);
});
