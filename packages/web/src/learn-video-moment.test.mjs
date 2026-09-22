import { test } from 'node:test';
import assert from 'node:assert/strict';
import { timelineSpan, momentGeometry, seekTo, clock, embedUrl } from './learn-video-moment.js';

test('a known duration is the timeline', () => {
  assert.equal(timelineSpan(252, 338, 900), 900);
});

test('an unknown duration leaves room after the window without inventing an end', () => {
  const span = timelineSpan(252, 338, null);
  assert.ok(span >= 398, 'at least a minute after the window');
  assert.ok(span >= 338 * 1.25, 'and proportionally more for long windows');
});

test('a whole-video moment on an unknown duration still has a bar', () => {
  assert.ok(timelineSpan(0, null, null) >= 60);
});

test('the moment sits where the numbers say, as fractions', () => {
  const geometry = momentGeometry(252, 338, 900);
  assert.ok(Math.abs(geometry.left - 252 / 900) < 1e-9);
  assert.ok(Math.abs(geometry.width - 86 / 900) < 1e-9);
  assert.equal(geometry.known, true);
});

test('a moment with no end runs to the end of the bar', () => {
  const geometry = momentGeometry(300, null, 900);
  assert.ok(Math.abs(geometry.left + geometry.width - 1) < 1e-9);
});

test('a tiny moment is still visible', () => {
  assert.ok(momentGeometry(100, 103, 3600).width >= 0.01);
});

test('a window beyond a wrong duration clamps instead of overflowing the bar', () => {
  const geometry = momentGeometry(500, 700, 600);
  assert.ok(geometry.left <= 1 && geometry.left + geometry.width <= 1 + 1e-9);
});

test('a click on the bar is a start time inside the timeline', () => {
  assert.equal(seekTo(0.5, 252, 338, 900), 450);
  assert.equal(seekTo(0, 252, 338, 900), 0);
  assert.ok(seekTo(1, 252, 338, 900) < 900, 'never seeks to the very end');
  assert.equal(seekTo(-0.2, 0, null, 100), 0);
});

test('clock reads like YouTube reads', () => {
  assert.equal(clock(0), '0:00');
  assert.equal(clock(252), '4:12');
  assert.equal(clock(3599), '59:59');
  assert.equal(clock(3661), '1:01:01');
  assert.equal(clock(-5), '0:00');
  assert.equal(clock('junk'), '0:00');
});

test('the embed URL carries the window and nothing else', () => {
  assert.equal(embedUrl('Ilg3gGewQ5U', 252, 338), 'https://www.youtube-nocookie.com/embed/Ilg3gGewQ5U?start=252&end=338');
  assert.equal(embedUrl('Ilg3gGewQ5U', 0, null), 'https://www.youtube-nocookie.com/embed/Ilg3gGewQ5U');
  assert.equal(embedUrl('Ilg3gGewQ5U', 90, 30), 'https://www.youtube-nocookie.com/embed/Ilg3gGewQ5U?start=90', 'a backwards end is dropped, not sent');
});

test('a non-id never builds an embed URL, whatever localStorage says', () => {
  for (const bad of ['../evil', 'Ilg3gGewQ5U?autoplay=1', '"><script>', '', null]) {
    assert.equal(embedUrl(bad, 0, null), null, String(bad));
  }
});
