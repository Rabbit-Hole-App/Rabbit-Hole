import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FEATURES, PAGE_GROUPS } from './features-data.js';
import { renderCatalogue, visibleFeatures } from './features-catalogue.js';

const pic = (id, mobile = true) => ({ desktop: { src: `${id}-desktop.webp`, w: 1760, h: 1100 }, ...(mobile ? { mobile: { src: `${id}-mobile.webp`, w: 760, h: 980 } } : {}) });

test('the catalogue has the 26 brief entries in order with unique ids', () => {
  assert.equal(FEATURES.length, 26);
  FEATURES.forEach((f, i) => assert.match(f.id, new RegExp(`^${String(i + 1).padStart(2, '0')}-[a-z0-9-]+$`)));
  for (const f of FEATURES) assert.ok(f.title && f.subtitle && f.description && f.alt, f.id);
});

test('production shows only published entries with a picture; preview adds staged ones; no picture is never shown', () => {
  const images = { '01-ai-tutor': pic('01-ai-tutor'), '09-interactive-graphs': pic('09'), '06-notebooks': pic('06', false) };
  const prod = renderCatalogue(FEATURES, images);
  assert.match(prod, /id="ai-tutor"/);
  assert.match(prod, /id="notebooks"/);
  assert.doesNotMatch(prod, /interactive-graphs/); // staged (published: false)
  assert.doesNotMatch(prod, /github-code-graph/); // published, but no picture yet
  assert.match(renderCatalogue(FEATURES, images, { preview: true }), /id="interactive-graphs"/);
  assert.equal(renderCatalogue(FEATURES, {}), '');
});

test('first picture eager, the rest lazy; phone source only where a phone crop exists; copy is escaped', () => {
  const html = renderCatalogue(FEATURES, { '01-ai-tutor': pic('01-ai-tutor'), '06-notebooks': pic('06', false), '04-github-code-graph': pic('04') });
  assert.equal((html.match(/loading="eager"/g) || []).length, 1);
  assert.equal((html.match(/loading="lazy"/g) || []).length, 2);
  assert.equal((html.match(/<source /g) || []).length, 2);
  assert.match(html, /GitHub import &amp; code graph/);
  const tutor = FEATURES.find(f => f.id === '01-ai-tutor');
  assert.ok(html.includes(`alt="${tutor.alt.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`)); // the entry's own alt, escaped
});

test('every entry is framed: Rabbit Hole header, copy before the picture, composite parts captioned in one frame', () => {
  const images = { '01-ai-tutor': pic('01-ai-tutor'), '16-sharing-forking': [{ caption: 'Outgoing link', ...pic('16a', false) }, { caption: 'Backlink', ...pic('16b', false) }] };
  const html = renderCatalogue(FEATURES, images);
  assert.equal((html.match(/<article /g) || []).length, 2);
  assert.equal((html.match(/class="feature-demo"><div class="demo-window"><div class="demo-toolbar" aria-hidden="true"><span class="demo-brand">Rabbit Hole<\/span>/g) || []).length, 2);
  for (const a of html.split('<article ').slice(1)) assert.ok(a.indexOf('feature-copy') < a.indexOf('feature-demo'));
  assert.match(html, /<figcaption>Outgoing link<\/figcaption>.*<figcaption>Backlink<\/figcaption>/);
  assert.doesNotMatch(html, /\d\d \/ \d\d/); // no step counter
});

const PAGE_IDS = PAGE_GROUPS.flatMap(g => g.ids);

test('the page definition: four sections in order, their layouts and entries (owner brief 4-4-1-3)', () => {
  assert.deepEqual(PAGE_GROUPS.map(g => [g.title, g.layout, g.ids.length]), [
    ['Learn from your material.', 'stack', 4], ['Explore ideas in action.', 'stack-mirrored', 4],
    ['Follow the next question.', 'wide', 1], ['Build on what you learn.', 'tiles', 4]]);
  assert.deepEqual(PAGE_IDS, ['01-ai-tutor', '05-pdf-reader', '04-github-code-graph', '07-pin-study', '06-notebooks', '09-interactive-graphs',
    '03-animated-explainer-videos', '10-cad-generation', '11-rabbit-holes', '08-practice', '14-edit-with-ai', '24-comments', '16-sharing-forking']);
  for (const id of PAGE_IDS) assert.ok(FEATURES.some(f => f.id === id), id);
  assert.equal(new Set(PAGE_IDS).size, PAGE_IDS.length);
});

test('each stack section is its own walkthrough: its own steps, --features count, rows from 1, first entry active', () => {
  const all = Object.fromEntries(FEATURES.map(f => [f.id, pic(f.id)]));
  const html = renderCatalogue(FEATURES, all, { preview: true });
  assert.doesNotMatch(html, /features-index|<nav/);
  const stacks = html.split('data-feature-walkthrough').slice(1).map(s => s.split('</section>')[0]);
  assert.equal(stacks.length, 2);
  assert.match(html, /<div class="feature-stack" data-feature-walkthrough style="--features:4">/);
  assert.match(html, /<div class="feature-stack is-mirrored" data-feature-walkthrough style="--features:4">/);
  for (const s of stacks) {
    assert.deepEqual([...s.matchAll(/class="feature-copy" style="grid-row:(\d+)"/g)].map(m => m[1]), ['1', '2', '3', '4']);
    assert.equal((s.match(/data-feature-step/g) || []).length, 4);
    assert.equal((s.match(/is-active/g) || []).length, 1);
  }
  assert.match(html, /<article class="feature is-active" id="ai-tutor"/);
  assert.match(html, /<article class="feature is-active" id="notebooks"/);
  // Rabbit Holes and the collection stay outside the stack logic.
  const rest = html.slice(html.indexOf('data-layout="wide"'));
  assert.doesNotMatch(rest, /data-feature-step|data-feature-walkthrough|is-active/);
  assert.match(rest, /<div class="feature-wide">\n<article class="feature" id="rabbit-holes">/);
  assert.deepEqual([...rest.slice(rest.indexOf('feature-tiles')).matchAll(/<article class="feature" id="([a-z-]+)"/g)].map(m => m[1]), ['practice', 'edit-with-ai', 'comments', 'sharing-forking']);
  assert.equal((html.match(/loading="eager"/g) || []).length, 1);
});

test('the page shows its 13 entries in section order; production drops staged entries and empty sections', () => {
  const all = Object.fromEntries(FEATURES.map(f => [f.id, pic(f.id)]));
  assert.deepEqual(visibleFeatures(FEATURES, all, true).map(f => f.id), PAGE_IDS);
  const prod = visibleFeatures(FEATURES, all, false).map(f => f.id);
  assert.deepEqual(prod, PAGE_IDS.filter(id => FEATURES.find(f => f.id === id).published));
  const preview = renderCatalogue(FEATURES, all, { preview: true });
  assert.deepEqual([...preview.matchAll(/<h2 class="feature-group-title">([^<]+)</g)].map(m => m[1]), PAGE_GROUPS.map(g => g.title));
  assert.doesNotMatch(preview, /id="(bidirectional-links|ask-about-selection|canvas-search)"/);
  // A section whose entries are all staged renders nothing in production, not an empty heading.
  const staged = { '09-interactive-graphs': pic('09'), '03-animated-explainer-videos': pic('03'), '01-ai-tutor': pic('01') };
  const html = renderCatalogue(FEATURES, staged);
  assert.doesNotMatch(html, /Explore ideas in action/);
  assert.match(html, /Learn from your material/);
});
