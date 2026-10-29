import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FEATURES } from './features-data.js';
import { layoutsOf, renderCatalogue } from './features-catalogue.js';

const pic = (id, mobile = true) => ({ desktop: { src: `${id}-desktop.webp`, w: 1760, h: 1100 }, ...(mobile ? { mobile: { src: `${id}-mobile.webp`, w: 760, h: 980 } } : {}) });

test('the catalogue has the 26 brief entries in order with unique ids', () => {
  assert.equal(FEATURES.length, 26);
  FEATURES.forEach((f, i) => assert.match(f.id, new RegExp(`^${String(i + 1).padStart(2, '0')}-[a-z0-9-]+$`)));
  for (const f of FEATURES) assert.ok(f.title && f.subtitle && f.description && f.alt && ['full', 'grid'].includes(f.layout), f.id);
});

test('production shows only published entries with a picture; preview adds staged ones; no picture is never shown', () => {
  const images = { '01-ai-tutor': pic('01-ai-tutor'), '02-interactive-explanations': pic('02'), '03-animated-explainer-videos': pic('03', false) };
  const prod = renderCatalogue(FEATURES, images);
  assert.match(prod, /id="ai-tutor"/);
  assert.match(prod, /id="animated-explainer-videos"/);
  assert.doesNotMatch(prod, /interactive-explanations/); // staged (published: false)
  assert.doesNotMatch(prod, /github-code-graph/); // published, but no picture yet
  assert.match(renderCatalogue(FEATURES, images, { preview: true }), /href="#interactive-explanations"/);
  assert.equal(renderCatalogue(FEATURES, {}), '');
});

test('first picture eager, the rest lazy; phone source only where a phone crop exists; copy is escaped', () => {
  const html = renderCatalogue(FEATURES, { '01-ai-tutor': pic('01-ai-tutor'), '03-animated-explainer-videos': pic('03', false), '04-github-code-graph': pic('04') });
  assert.equal((html.match(/loading="eager"/g) || []).length, 1);
  assert.equal((html.match(/loading="lazy"/g) || []).length, 2);
  assert.equal((html.match(/<source /g) || []).length, 2);
  assert.match(html, /GitHub repository import &amp; code graph/);
  assert.match(html, /alt="Tutor discussing a learner's pendulum/);
});

test('a grid entry without a grid partner spans the full width', () => {
  const l = ['grid', 'grid', 'full', 'grid', 'full', 'grid', 'grid', 'grid'].map(layout => ({ layout }));
  assert.deepEqual(layoutsOf(l), ['grid', 'grid', 'full', 'full', 'full', 'grid', 'grid', 'full']);
});
