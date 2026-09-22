import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyHref, absoluteUrl, rewriteSrcset } from './learn-wiki-links.js';

test('an internal link navigates in place', () => {
  assert.deepEqual(classifyHref('./Machine_learning'), { kind: 'article', title: 'Machine_learning', anchor: null });
  assert.deepEqual(classifyHref('/wiki/Machine_learning'), { kind: 'article', title: 'Machine_learning', anchor: null });
  assert.deepEqual(classifyHref('https://en.wikipedia.org/wiki/Machine_learning'), { kind: 'article', title: 'Machine_learning', anchor: null });
});

test('a link into another article keeps the section it pointed at', () => {
  assert.deepEqual(classifyHref('./Neural_network#Training'), { kind: 'article', title: 'Neural_network', anchor: 'Training' });
});

test('a link into the article on screen scrolls rather than reloading it', () => {
  assert.deepEqual(classifyHref('./Machine_learning#History', 'Machine_learning'), { kind: 'section', anchor: 'History' });
  assert.deepEqual(classifyHref('#History'), { kind: 'section', anchor: 'History' });
});

test('a citation jump is a scroll, not a navigation', () => {
  assert.deepEqual(classifyHref('#cite_note-turing-4'), { kind: 'reference', anchor: 'cite_note-turing-4' });
  assert.deepEqual(classifyHref('#cite_ref-1'), { kind: 'reference', anchor: 'cite_ref-1' });
});

test('a red link is not a link', () => {
  assert.equal(classifyHref('./Nonexistent?action=edit&redlink=1').kind, 'dead');
  assert.equal(classifyHref('https://en.wikipedia.org/wiki/Nope?action=edit&redlink=1').kind, 'dead');
});

// The whole point of an allowlist: a blocklist that forgot one of these ships
// script execution inside the lesson.
test('a scheme that is not http(s) is refused', () => {
  for (const href of ['javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html,<script>x</script>', 'vbscript:x', 'file:///etc/passwd', 'blob:https://evil/x']) {
    assert.equal(classifyHref(href).kind, 'none', `${href} must not be followable`);
  }
});

test('nothing at all is nothing', () => {
  assert.equal(classifyHref('').kind, 'none');
  assert.equal(classifyHref(null).kind, 'none');
  assert.equal(classifyHref(undefined).kind, 'none');
  assert.equal(classifyHref('#').kind, 'none');
});

test('a file link opens the image, it does not navigate', () => {
  assert.deepEqual(classifyHref('./File:Einstein_1921.jpg'), { kind: 'file', title: 'File:Einstein_1921.jpg' });
  assert.equal(classifyHref('./Image:Old_style.png').kind, 'file');
});

test('other namespaces leave the lesson rather than loading into it', () => {
  assert.deepEqual(classifyHref('./Help:Contents'), { kind: 'external', url: 'https://en.wikipedia.org/wiki/Help%3AContents' });
  assert.equal(classifyHref('./Special:Random').kind, 'external');
  assert.equal(classifyHref('./Wikipedia:Citation_needed').kind, 'external');
  assert.equal(classifyHref('./Category:Machine_learning').kind, 'external');
  assert.equal(classifyHref('./Talk:Machine_learning').kind, 'external');
});

test('a colon that is part of a title is not a namespace', () => {
  assert.deepEqual(classifyHref('./Dune:_Part_Two'), { kind: 'article', title: 'Dune:_Part_Two', anchor: null });
});

test('another site opens in a new tab', () => {
  assert.deepEqual(classifyHref('https://arxiv.org/abs/1706.03762'), { kind: 'external', url: 'https://arxiv.org/abs/1706.03762' });
  assert.equal(classifyHref('//en.wiktionary.org/wiki/learn').kind, 'external');
  assert.equal(classifyHref('https://en.wikipedia.org/w/index.php?title=X').kind, 'external', 'not an article path');
});

test('a protocol-relative wikipedia link is still an article', () => {
  assert.deepEqual(classifyHref('//en.wikipedia.org/wiki/Machine_learning'), { kind: 'article', title: 'Machine_learning', anchor: null });
});

test('a percent-encoded title decodes to the real one', () => {
  assert.equal(classifyHref('./Transformer_%28deep_learning%29').title, 'Transformer_(deep_learning)');
  assert.equal(classifyHref('./Schr%C3%B6dinger_equation').title, 'Schrödinger_equation');
});

test('an image source becomes absolute, or is dropped', () => {
  assert.equal(absoluteUrl('//upload.wikimedia.org/a.png'), 'https://upload.wikimedia.org/a.png');
  assert.equal(absoluteUrl('https://upload.wikimedia.org/a.png'), 'https://upload.wikimedia.org/a.png');
  assert.equal(absoluteUrl('data:image/png;base64,AAA'), null);
  assert.equal(absoluteUrl('javascript:alert(1)'), null);
  assert.equal(absoluteUrl(''), null);
  assert.equal(absoluteUrl(undefined), null);
});

test('every candidate in a srcset is rewritten, not just the first', () => {
  assert.equal(
    rewriteSrcset('//upload.wikimedia.org/a.png 1.5x, //upload.wikimedia.org/b.png 2x'),
    'https://upload.wikimedia.org/a.png 1.5x, https://upload.wikimedia.org/b.png 2x',
  );
});

test('a srcset with nothing usable in it is dropped entirely', () => {
  assert.equal(rewriteSrcset('data:image/png;base64,AAA 2x'), null);
  assert.equal(rewriteSrcset(''), null);
});
