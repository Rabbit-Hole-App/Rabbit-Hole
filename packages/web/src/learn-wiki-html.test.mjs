import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dropsEntirely, keepsElement, keepsAttribute, linkAttributes, wikiClass } from './learn-wiki-html.js';

// The policy, not the walk: a DOM is needed to apply it, and the browser check
// covers that. What must hold here is that nothing dangerous is ever named.

test('script-bearing and framing elements are removed outright, not unwrapped', () => {
  for (const tag of ['script', 'style', 'link', 'base', 'meta', 'iframe', 'object', 'embed', 'form', 'svg', 'noscript']) {
    assert.equal(dropsEntirely(tag), true, `${tag} must be removed with its contents`);
    assert.equal(keepsElement(tag), false, `${tag} must never be kept`);
  }
});

test('the elements an article is made of survive', () => {
  for (const tag of ['section', 'p', 'h2', 'ul', 'li', 'table', 'tr', 'td', 'a', 'img', 'figure', 'sup', 'math', 'mfrac']) {
    assert.equal(keepsElement(tag), true, `${tag} is article content`);
  }
});

test('an unknown tag is neither kept nor dropped, so it is unwrapped', () => {
  assert.equal(keepsElement('marquee'), false);
  assert.equal(dropsEntirely('marquee'), false);
});

test('tag matching ignores case, because the parser does not', () => {
  assert.equal(dropsEntirely('SCRIPT'), true);
  assert.equal(keepsElement('SECTION'), true);
});

// The one attribute that survives Wikimedia's own sanitiser and is enough to
// cover our canvas with an editor's markup. No script needed.
test('style is not an allowed attribute', () => {
  assert.equal(keepsAttribute('style'), false);
});

test('no event handler attribute is allowed', () => {
  for (const name of ['onclick', 'onerror', 'onload', 'onmouseover', 'onfocus', 'onanimationstart', 'ONCLICK']) {
    assert.equal(keepsAttribute(name), false, `${name} must be dropped`);
  }
});

test('href never passes through the attribute allowlist', () => {
  assert.equal(keepsAttribute('href'), false, 'the classifier decides what href becomes');
});

test('the attributes an article needs to render survive', () => {
  for (const name of ['id', 'alt', 'colspan', 'rowspan', 'data-mw-section-id']) {
    assert.equal(keepsAttribute(name), true, `${name} is layout, not behaviour`);
  }
});

// This app is Tailwind, so every utility in the bundle is reachable by name.
// Passing an article's own class through would let any editor write
// `class="fixed inset-0 z-50 bg-white"` - permitted by MediaWiki's sanitiser -
// and cover the canvas and composer with their markup, on our origin.
test('class does not pass through the allowlist unchanged', () => {
  assert.equal(keepsAttribute('class'), false);
});

test('every article class is prefixed, so no app utility is reachable by name', () => {
  assert.equal(wikiClass('fixed inset-0 z-50 bg-white'), 'wiki-fixed wiki-inset-0 wiki-z-50 wiki-bg-white');
  assert.equal(wikiClass('infobox biography vcard'), 'wiki-infobox wiki-biography wiki-vcard');
});

test('an empty or missing class prefixes to nothing, not to a bare prefix', () => {
  assert.equal(wikiClass(''), '');
  assert.equal(wikiClass('   '), '');
  assert.equal(wikiClass(null), '');
  assert.equal(wikiClass(undefined), '');
});

// Stripped once, which removed every image in the article and then deleted the
// elements as source-less. Only safe to allow because every other src-bearing
// element is in the drop list.
test('an image keeps the attributes that make it an image', () => {
  assert.equal(keepsAttribute('src'), true);
  assert.equal(keepsAttribute('srcset'), true);
  for (const tag of ['script', 'iframe', 'embed', 'object', 'video', 'audio', 'source', 'track']) {
    assert.equal(dropsEntirely(tag), true, `${tag} may not carry a src into the page`);
  }
});

// --- what a link becomes ---

test('an internal link records where it goes and keeps no href', () => {
  const attributes = linkAttributes('./Neural_network#Training', 'Machine_learning');
  assert.deepEqual(attributes, { role: 'link', tabindex: '0', 'data-wiki': 'article', 'data-wiki-title': 'Neural_network', 'data-wiki-anchor': 'Training' });
  assert.equal('href' in attributes, false, 'a navigable link must not also be followable by the browser');
});

// Stripping href also strips what makes an anchor a link to a screen reader
// and to the keyboard, so every kind we do navigate puts both back.
test('every navigable link stays announced and reachable by keyboard', () => {
  for (const href of ['./Neural_network', '#History', '#cite_note-4', './File:X.jpg']) {
    const attributes = linkAttributes(href, 'Machine_learning');
    assert.equal(attributes.role, 'link', href);
    assert.equal(attributes.tabindex, '0', href);
  }
});

test('a link that goes nowhere is not focusable either', () => {
  assert.equal('tabindex' in linkAttributes('javascript:alert(1)'), false);
  assert.equal('tabindex' in linkAttributes('./Nothing?action=edit&redlink=1'), false);
});

test('a link into the article on screen becomes a scroll', () => {
  assert.equal(linkAttributes('#History', 'Machine_learning')['data-wiki'], 'section');
  assert.equal(linkAttributes('./Machine_learning#History', 'Machine_learning')['data-wiki-anchor'], 'History');
});

test('a citation becomes a scroll to the reference', () => {
  assert.equal(linkAttributes('#cite_note-4')['data-wiki'], 'reference');
});

test('an outside link opens in a new tab and leaks nothing', () => {
  assert.deepEqual(linkAttributes('https://arxiv.org/abs/1706.03762'), {
    'data-wiki': 'external', href: 'https://arxiv.org/abs/1706.03762', target: '_blank', rel: 'noreferrer nofollow',
  });
});

test('a dangerous scheme becomes dead text with no href at all', () => {
  for (const href of ['javascript:alert(1)', 'data:text/html,<script>x</script>', 'vbscript:x', 'blob:https://evil/x']) {
    assert.deepEqual(linkAttributes(href), { 'data-wiki': 'dead' }, href);
  }
});

// The spec allows https only. An http article still resolves, because we
// refetch it over our own route; an http link anywhere else does not.
test('a plaintext link to another site is not handed to the learner', () => {
  assert.deepEqual(linkAttributes('http://attacker.example/x'), { 'data-wiki': 'dead' });
  assert.equal(linkAttributes('http://en.wikipedia.org/wiki/Machine_learning')['data-wiki'], 'article');
});

test('a red link loses its affordance rather than looking broken', () => {
  assert.deepEqual(linkAttributes('./Nothing?action=edit&redlink=1'), { 'data-wiki': 'dead' });
});

test('a file link is marked as an image, not a navigation', () => {
  assert.equal(linkAttributes('./File:Einstein.jpg')['data-wiki'], 'file');
  assert.equal(linkAttributes('./File:Einstein.jpg')['data-wiki-title'], 'File:Einstein.jpg');
});
