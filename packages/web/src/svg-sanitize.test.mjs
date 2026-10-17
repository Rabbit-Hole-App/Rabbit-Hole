import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SvgRefused, looksLikeSvg, sanitizeSvg } from './svg-sanitize.js';

const fx = name => readFileSync(new URL(`./__fixtures__/media/${name}`, import.meta.url), 'utf8');
const refused = (text, pattern) => assert.throws(() => sanitizeSvg(text), error => error instanceof SvgRefused && pattern.test(error.message));

test('a plain drawing keeps its shapes, gradient reference and text', () => {
  const { svg, width, height, removed } = sanitizeSvg(fx('plain.svg'));
  assert.deepEqual([width, height], [200, 100], 'viewBox gives the aspect when width/height are absent');
  assert.deepEqual(removed, []);
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="200" height="100" viewBox="0 0 200 100">/);
  assert.match(svg, /fill="url\(#g\)"/);
  assert.match(svg, /plain &amp; simple/);
});

test('an Illustrator export: declared text entities expand, CDATA style survives, xlink kept for the local use', () => {
  const { svg, width, height } = sanitizeSvg(fx('illustrator.svg'));
  assert.deepEqual([width, height], [120, 80]);
  assert.match(svg, /xmlns:xlink="http:\/\/www\.w3\.org\/1999\/xlink"/);
  assert.match(svg, /style="fill:#E11D48;"/);
  assert.match(svg, /\.st1\{fill:#0EA5E9;\}/);
  assert.match(svg, /<use xlink:href="#dot"/);
  assert.doesNotMatch(svg, /DOCTYPE|ENTITY|<\?xml/);
});

test('an Inkscape file: editor metadata dropped, millimetres become px for the aspect', () => {
  const { svg, width, height, removed } = sanitizeSvg(fx('inkscape.svg'));
  assert.equal(Math.round(width), 189); assert.equal(Math.round(height), 94);
  assert.doesNotMatch(svg, /sodipodi|inkscape/);
  assert.match(svg, /<path style="fill:#16a34a;stroke:#000;stroke-width:0\.5"/);
  assert.ok(removed.includes('editor metadata'));
});

test('a hostile SVG loses every script, handler, link, foreign content and external fetch', () => {
  const { svg, removed } = sanitizeSvg(fx('hostile.svg'));
  assert.doesNotMatch(svg, /evil\.example/, 'no external URL survives anywhere');
  assert.doesNotMatch(svg, /<script|onload|onclick|onmouseover|javascript:|foreignObject|iframe|@import|<set|<a[\s>]/i);
  assert.match(svg, /<use href="#local"\/>/, 'a same-document use stays');
  assert.match(svg, /<image xlink:href="data:image\/png;base64,iVBORw0KGgo="/, 'an embedded raster stays');
  assert.match(svg, /<circle id="local"/, 'a link is unwrapped, its drawing kept');
  assert.match(svg, /circle \{ fill: url\(#ok\) \}/, 'a fragment url() in CSS stays');
  for (const reason of ['script', 'event handler', 'foreignObject', 'external link or resource', 'CSS @import', 'external url() reference', 'link', 'link-rewriting animation']) assert.ok(removed.includes(reason), reason);
});

test('external and nested entities are never expanded', () => {
  refused(fx('xxe.svg'), /entity \(&xxe;\)/);
  refused(fx('laughs.svg'), /entity \(&lol2;\)|entity \(&lol3;\)/);
});

test('not well-formed or not an SVG is refused with a reason, never guessed', () => {
  refused(fx('fake.svg'), /no single <svg> root/);
  refused('<svg xmlns="http://www.w3.org/2000/svg"><g></svg>', /not well-formed/);
  refused('<svg width=10></svg>', /not quoted/);
  refused('<html><svg/></html>', /root element is <html>/);
  refused('<svg>' + '<g>'.repeat(200) + '</g>'.repeat(200) + '</svg>', /nests deeper than 128/);
  refused('<svg>' + '<rect/>'.repeat(20001) + '</svg>', /more than 20,000 elements/);
  refused('x'.repeat(2 * 1024 * 1024 + 1), /over 2 MiB/);
});

test('no width, height or viewBox: the browser default 300 x 150', () => {
  const { width, height, svg } = sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg"><rect width="5" height="5"/></svg>');
  assert.deepEqual([width, height], [300, 150]);
  assert.match(svg, /width="300" height="150"/);
  const percent = sanitizeSvg('<svg width="100%" height="100%" viewBox="0 0 40 10"/>');
  assert.deepEqual([percent.width, percent.height], [40, 10], 'percentages say nothing; the viewBox does');
});

test('the sniff accepts an SVG after a prolog and nothing else', () => {
  assert.ok(looksLikeSvg(fx('illustrator.svg')));
  assert.ok(looksLikeSvg('﻿<svg/>'));
  assert.ok(!looksLikeSvg('<html><svg/></html>'));
  assert.ok(!looksLikeSvg('not an svg'));
});
