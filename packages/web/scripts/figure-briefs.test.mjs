import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { scrapeSources, sourcePages } from './figure-briefs.mjs';

test('keeps source order, a private exact context manifest, and an index with no artwork or prose', async t => {
  const out = await mkdtemp(join(tmpdir(), 'figure-briefs-'));
  t.after(() => rm(out, { recursive: true, force: true }));
  const page = {
    slug: 'lesson', url: 'https://example.test/lesson', selector: 'article',
  };
  const html = '<meta property="og:title" content="Teaching article">' +
    '<main><img src="/logo.png"><article><h2>First section<a class="headerlink">¶</a>' +
    '<div class="d2l-tabs">Open the notebook</div></h2>' +
    '<p>Before &amp; beside.</p><figure><img src="/figure.svg" alt="Source label">' +
    '<figcaption>Figure caption.</figcaption></figure><p>After.</p>' +
    '<p><image src=" /sequence.gif " alt="Loop"></p>' +
    '<img src="/blocked.png"><img src="/figure.svg"></article></main>';
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>Axis</text><!-- 0.5 --><g></g></svg>';
  const routes = {
    '/robots.txt': ['User-agent: *\nDisallow: /blocked', 'text/plain'],
    '/lesson': [html, 'text/html'],
    '/figure.svg': [svg, 'image/svg+xml'],
    '/sequence.gif': ['GIF89a', 'image/gif'],
  };
  const calls = [];
  let clock = 0;
  await scrapeSources([page], out, {
    fetch: async url => {
      const path = new URL(url).pathname;
      calls.push([path, clock]);
      assert.ok(routes[path], path);
      const [body, type] = routes[path];
      return new Response(body, { headers: { 'Content-Type': type } });
    },
    now: () => clock,
    sleep: async ms => { clock += ms; },
    firstFrame: async (_input, output) => writeFile(output, 'PNG first frame'),
  });
  assert.deepEqual(calls.map(([path]) => path), ['/robots.txt', '/lesson', '/figure.svg', '/sequence.gif']);
  assert.ok(calls.slice(1).every(([, time], index) => time - calls[index][1] >= 1000));
  const saved = await readFile(join(out, 'lesson', '_working', 'manifest.json'), 'utf8').then(JSON.parse);
  assert.equal(saved.title, 'Teaching article');
  assert.deepEqual(saved.figures.map(figure => figure.status), ['downloaded', 'downloaded', 'robots-denied', 'downloaded']);
  assert.deepEqual(saved.figures[0].context, {
    alt: 'Source label', caption: 'Figure caption.', heading: 'First section',
    before: 'Before & beside.', after: 'After.', svgText: ['Axis', '0.5'],
  });
  assert.equal(await readFile(join(out, 'lesson', '01-figure.svg'), 'utf8'), svg);
  assert.equal(await readFile(join(out, 'lesson', '02-sequence.png'), 'utf8'), 'PNG first frame');
  const inventory = await readFile(join(out, 'lesson', 'manifest.json'), 'utf8').then(JSON.parse);
  assert.equal(inventory.figures[2].status, 'robots-denied');
  assert.ok(inventory.figures.every(figure => !Object.hasOwn(figure, 'context')));
});

test('checks robots at a redirect destination and never follows a login redirect', async t => {
  const out = await mkdtemp(join(tmpdir(), 'figure-briefs-'));
  t.after(() => rm(out, { recursive: true, force: true }));
  const calls = [];
  const routes = {
    'https://a.test/robots.txt': () => new Response(null, { status: 404 }),
    'https://a.test/': () => new Response('<article><img src="/asset.svg"><img src="/login"></article>', {
      headers: { 'Content-Type': 'text/html' },
    }),
    'https://a.test/asset.svg': () => Response.redirect('https://b.test/locked.svg'),
    'https://b.test/robots.txt': () => new Response('User-agent: *\nAllow: /\nUser-agent: ChatGPT-User\nDisallow: /locked'),
  };
  await scrapeSources([{ slug: 'a', url: 'https://a.test/', selector: 'article' }], out, {
    fetch: async url => {
      calls.push(url);
      assert.ok(routes[url], url);
      return routes[url]();
    },
    sleep: async () => {},
  });
  assert.deepEqual(calls, Object.keys(routes));
  const inventory = await readFile(join(out, 'a', 'manifest.json'), 'utf8').then(JSON.parse);
  assert.deepEqual(inventory.figures.map(figure => figure.status), ['robots-denied', 'login-wall']);
});

test('pins the 21 lesson pages and begins with the Illustrated Transformer', () => {
  const sources = sourcePages();
  assert.match(sources[0].url, /jalammar.github.io\/illustrated-transformer\/$/);
  const curriculum = sources.filter(page => page.group === 'phase02');
  assert.equal(curriculum.length, 21);
  assert.ok(curriculum.every(page => page.url.includes('/e7db050e64bde3be17a9381476f748da26d85692/')));
  assert.deepEqual(curriculum.map(page => page.lesson), Array.from({ length: 21 }, (_, i) => String(i + 1).padStart(2, '0')));
});
