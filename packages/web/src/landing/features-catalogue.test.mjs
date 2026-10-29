import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FEATURES } from './features-data.js';
import { renderCatalogue } from './features-catalogue.js';

const pic = (id, mobile = true) => ({ desktop: { src: `${id}-desktop.webp`, w: 1760, h: 1100 }, ...(mobile ? { mobile: { src: `${id}-mobile.webp`, w: 760, h: 980 } } : {}) });

test('the catalogue has the 26 brief entries in order with unique ids', () => {
  assert.equal(FEATURES.length, 26);
  FEATURES.forEach((f, i) => assert.match(f.id, new RegExp(`^${String(i + 1).padStart(2, '0')}-[a-z0-9-]+$`)));
  for (const f of FEATURES) assert.ok(f.title && f.subtitle && f.description && f.alt, f.id);
});

test('production shows only published entries with a picture; preview adds staged ones; no picture is never shown', () => {
  const images = { '01-ai-tutor': pic('01-ai-tutor'), '02-interactive-explanations': pic('02'), '06-notebooks': pic('06', false) };
  const prod = renderCatalogue(FEATURES, images);
  assert.match(prod, /id="ai-tutor"/);
  assert.match(prod, /id="notebooks"/);
  assert.doesNotMatch(prod, /interactive-explanations/); // staged (published: false)
  assert.doesNotMatch(prod, /github-code-graph/); // published, but no picture yet
  assert.match(renderCatalogue(FEATURES, images, { preview: true }), /href="#interactive-explanations"/);
  assert.equal(renderCatalogue(FEATURES, {}), '');
});

test('first picture eager, the rest lazy; phone source only where a phone crop exists; copy is escaped', () => {
  const html = renderCatalogue(FEATURES, { '01-ai-tutor': pic('01-ai-tutor'), '06-notebooks': pic('06', false), '04-github-code-graph': pic('04') });
  assert.equal((html.match(/loading="eager"/g) || []).length, 1);
  assert.equal((html.match(/loading="lazy"/g) || []).length, 2);
  assert.equal((html.match(/<source /g) || []).length, 2);
  assert.match(html, /GitHub repository import &amp; code graph/);
  assert.match(html, /alt="Tutor discussing a learner's pendulum/);
});

test('every entry is framed: Rabbit Hole header, picture before the copy, composite parts captioned in one frame', () => {
  const images = { '01-ai-tutor': pic('01-ai-tutor'), '12-bidirectional-links': [{ caption: 'Outgoing link', ...pic('12a', false) }, { caption: 'Backlink', ...pic('12b', false) }] };
  const html = renderCatalogue(FEATURES, images);
  assert.equal((html.match(/<article /g) || []).length, 2);
  assert.equal((html.match(/class="feature-demo"><div class="demo-window"><div class="demo-toolbar" aria-hidden="true"><span class="demo-brand">Rabbit Hole<\/span>/g) || []).length, 2);
  for (const a of html.split('<article ').slice(1)) assert.ok(a.indexOf('feature-demo') < a.indexOf('feature-copy'));
  assert.match(html, /<figcaption>Outgoing link<\/figcaption>.*<figcaption>Backlink<\/figcaption>/);
  assert.doesNotMatch(html, /\d\d \/ \d\d/); // no step counter
});
