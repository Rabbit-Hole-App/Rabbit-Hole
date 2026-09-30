import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  wikiTitle, tocFrom, sectionIndex, searchWikipedia, searchWikipediaTitles,
  readWikipedia, fetchWikipediaArticle, validateShowWikipedia, articleUrl,
  SEARCH_WIKIPEDIA_TOOL, READ_WIKIPEDIA_TOOL, SHOW_WIKIPEDIA_TOOL,
} from '../src/learn-wiki.js';

const reply = body => ({ ok: true, status: 200, headers: new Headers(), json: async () => body, text: async () => String(body) });
const fails = status => ({ ok: false, status, headers: new Headers(), json: async () => ({}), text: async () => '' });
// One fetcher over a url -> response map, recording what was actually asked for.
const fetcher = routes => {
  const calls = [];
  const fake = async url => {
    calls.push(url);
    const hit = Object.entries(routes).find(([fragment]) => url.includes(fragment));
    if (!hit) throw new Error(`unexpected fetch ${url}`);
    return typeof hit[1] === 'function' ? hit[1](url) : hit[1];
  };
  fake.calls = calls;
  return fake;
};

const TOC = { parse: { title: 'Machine learning', tocdata: { sections: [
  { index: '1', tocLevel: 1, line: 'History', anchor: 'History' },
  { index: '2', tocLevel: 1, line: 'Approaches', anchor: 'Approaches' },
  { index: '3', tocLevel: 2, line: '<i>Deep</i> learning', anchor: 'Deep_learning' },
] } } };

// --- naming an article ---

test('a display title becomes the wiki key', () => {
  assert.deepEqual(wikiTitle('machine learning'), { title: 'Machine_learning', section: null });
  assert.equal(wikiTitle('Machine_learning').title, 'Machine_learning');
  assert.equal(wikiTitle('  attention   is all you need ').title, 'Attention_is_all_you_need');
});

test('a wikipedia URL is accepted, and its fragment names the section', () => {
  assert.deepEqual(wikiTitle('https://en.wikipedia.org/wiki/Machine_learning'), { title: 'Machine_learning', section: null });
  assert.deepEqual(wikiTitle('https://en.wikipedia.org/wiki/Machine_learning#Deep_learning'), { title: 'Machine_learning', section: 'Deep learning' });
  assert.equal(wikiTitle('https://en.m.wikipedia.org/wiki/Transformer_(deep_learning)').title, 'Transformer_(deep_learning)');
});

test('a link to somewhere else is refused', () => {
  assert.throws(() => wikiTitle('https://example.com/wiki/Machine_learning'), /wikipedia\.org article URL/);
  assert.throws(() => wikiTitle('https://user:pass@en.wikipedia.org/wiki/X'), /wikipedia\.org article URL/);
});

// English only. Reading fr.wikipedia's URL from en.wikipedia would answer from
// a different article with the same spelling, silently.
test('another language is refused, not quietly answered from English', () => {
  assert.throws(() => wikiTitle('https://fr.wikipedia.org/wiki/Apprentissage_automatique'), /English wikipedia\.org/);
  assert.throws(() => wikiTitle('https://de.m.wikipedia.org/wiki/X'), /English wikipedia\.org/);
  assert.equal(wikiTitle('https://en.m.wikipedia.org/wiki/X').title, 'X');
});

test('a colon in a title is not a namespace', () => {
  assert.equal(wikiTitle('Dune: Part Two').title, 'Dune:_Part_Two');
});

test('namespace pages are not lesson sources', () => {
  assert.throws(() => wikiTitle('Special:Random'), /not lesson sources/);
  assert.throws(() => wikiTitle('Category:Machine learning'), /not lesson sources/);
  assert.throws(() => wikiTitle('file:Example.jpg'), /not lesson sources/);
});

test('an empty or oversized title is refused', () => {
  assert.throws(() => wikiTitle('   '), /Name a Wikipedia article/);
  assert.throws(() => wikiTitle(undefined), /Name a Wikipedia article/);
  assert.throws(() => wikiTitle('x'.repeat(256)), /not a Wikipedia article title/);
});

test('the article URL escapes what a title can contain', () => {
  assert.equal(articleUrl('Transformer_(deep_learning)'), 'https://en.wikipedia.org/wiki/Transformer_(deep_learning)');
  assert.equal(articleUrl('Dune:_Part_Two'), 'https://en.wikipedia.org/wiki/Dune%3A_Part_Two');
});

// --- the contents list ---

test('the contents list keeps the index the section endpoint takes', () => {
  assert.deepEqual(tocFrom(TOC), [
    { index: 1, level: 1, title: 'History', anchor: 'History' },
    { index: 2, level: 1, title: 'Approaches', anchor: 'Approaches' },
    { index: 3, level: 2, title: 'Deep learning', anchor: 'Deep_learning' },
  ]);
});

test('an article with no contents is empty, not broken', () => {
  assert.deepEqual(tocFrom({ parse: { tocdata: { sections: [] } } }), []);
  assert.deepEqual(tocFrom({}), []);
  assert.deepEqual(tocFrom(null), []);
});

test('a section is found by heading, by anchor or by number', () => {
  const toc = tocFrom(TOC);
  assert.equal(sectionIndex(toc, 'History'), 1);
  assert.equal(sectionIndex(toc, 'deep learning'), 3);
  assert.equal(sectionIndex(toc, 'Deep_learning'), 3);
  assert.equal(sectionIndex(toc, '2'), 2);
  assert.equal(sectionIndex(toc, 2), 2);
});

test('no section means the introduction', () => {
  assert.equal(sectionIndex(tocFrom(TOC), null), 0);
  assert.equal(sectionIndex(tocFrom(TOC), undefined), 0);
  assert.equal(sectionIndex([], 0), 0);
});

test('a section that does not exist is null, not the nearest match', () => {
  const toc = tocFrom(TOC);
  assert.equal(sectionIndex(toc, 'Ethics'), null);
  assert.equal(sectionIndex(toc, '99'), null);
});

// --- searching ---

test('search returns what a picker needs, with absolute thumbnails', async () => {
  const fake = fetcher({ 'search/title': reply({ pages: [
    { key: 'Albert_Einstein', title: 'Albert Einstein', description: 'German-born physicist', thumbnail: { url: '//upload.wikimedia.org/60px-Einstein.jpg' } },
    { key: 'Machine_learning', title: 'Machine learning', description: null, thumbnail: null },
  ] }) });
  const results = await searchWikipediaTitles('einst', fake);
  assert.equal(results[0].thumbnail, 'https://upload.wikimedia.org/60px-Einstein.jpg');
  assert.equal(results[0].description, 'German-born physicist');
  assert.equal(results[1].thumbnail, null, 'many articles have no image');
  assert.equal(results[1].description, '');
});

test('the model searches full text, the picker searches titles', async () => {
  const fake = fetcher({ 'search/page': reply({ pages: [{ key: 'Machine_learning', title: 'Machine learning' }] }) });
  const results = await searchWikipedia('how do computers learn', fake);
  assert.equal(results[0].url, 'https://en.wikipedia.org/wiki/Machine_learning');
  assert.match(fake.calls[0], /search\/page/);
});

test('a junk search is refused before any request', async () => {
  const fake = fetcher({});
  await assert.rejects(() => searchWikipedia('', fake), /Invalid article search/);
  await assert.rejects(() => searchWikipedia('x'.repeat(201), fake), /Invalid article search/);
  assert.equal(fake.calls.length, 0);
});

// --- reading one section ---

test('reading a section returns its text and the article contents', async () => {
  const fake = fetcher({
    'prop=tocdata': reply(TOC),
    'prop=text': reply({ parse: { text: '<div><h2 id="History">History</h2><p>Arthur Samuel coined the term.</p></div>' } }),
  });
  const read = await readWikipedia('Machine learning', 'History', fake);
  assert.equal(read.section, 1);
  assert.equal(read.sectionTitle, 'History');
  assert.equal(read.text, 'History Arthur Samuel coined the term.');
  assert.equal(read.truncated, false);
  assert.deepEqual(read.toc.map(entry => entry.title), ['History', 'Approaches', 'Deep learning']);
  assert.match(fake.calls[1], /section=1/);
});

// "ML" is a redirect. Without redirects=1 the parse returns the one-line stub
// and the tutor reads nothing about machine learning at all.
test('a redirect title follows through to the real article', async () => {
  const fake = fetcher({ 'prop=tocdata': reply(TOC), 'prop=text': reply({ parse: { text: '<p>Lead.</p>' } }) });
  await readWikipedia('ML', null, fake);
  for (const call of fake.calls) assert.match(call, /redirects=1/, call);
});

test('the picker asks for ten results, as the spec table says', async () => {
  const fake = fetcher({ 'search/title': reply({ pages: [] }) });
  await searchWikipediaTitles('einst', fake);
  assert.match(fake.calls[0], /limit=10/);
});

test('no section reads the introduction', async () => {
  const fake = fetcher({ 'prop=tocdata': reply(TOC), 'prop=text': reply({ parse: { text: '<p>Lead.</p>' } }) });
  const read = await readWikipedia('Machine learning', undefined, fake);
  assert.equal(read.section, 0);
  assert.equal(read.sectionTitle, 'Introduction');
  assert.match(fake.calls[1], /section=0/);
});

test('a URL fragment picks the section when none is given', async () => {
  const fake = fetcher({ 'prop=tocdata': reply(TOC), 'prop=text': reply({ parse: { text: '<p>Deep.</p>' } }) });
  const read = await readWikipedia('https://en.wikipedia.org/wiki/Machine_learning#Deep_learning', undefined, fake);
  assert.equal(read.section, 3);
});

test('an unknown section says what the article does have', async () => {
  const fake = fetcher({ 'prop=tocdata': reply(TOC) });
  await assert.rejects(() => readWikipedia('Machine learning', 'Ethics', fake), /Its sections are: History, Approaches, Deep learning/);
});

test('a missing article is named, not a bare status code', async () => {
  const fake = fetcher({ 'prop=tocdata': reply({ error: { code: 'missingtitle' } }) });
  await assert.rejects(() => readWikipedia('Nonexistent thing', null, fake), /No Wikipedia article called Nonexistent thing/);
});

test('rate limiting says to wait rather than looking broken', async () => {
  const fake = fetcher({ 'prop=tocdata': fails(429) });
  await assert.rejects(() => readWikipedia('Machine learning', null, fake), /rate-limiting.*Wait a minute/);
});

test('a long section is cut, and says it was', async () => {
  const fake = fetcher({ 'prop=tocdata': reply(TOC), 'prop=text': reply({ parse: { text: `<p>${'word '.repeat(4000)}</p>` } }) });
  const read = await readWikipedia('Machine learning', 'History', fake);
  assert.equal(read.text.length, 6000);
  assert.equal(read.truncated, true);
});

// The model quotes this text back to the learner, so a mangled entity is a
// mangled quotation: "don&#39;t" once arrived as "don t".
test('entities decode to characters, not to holes in words', async () => {
  const fake = fetcher({
    'prop=tocdata': reply(TOC),
    'prop=text': reply({ parse: { text: '<p>Samuel didn&#39;t agree &#x2014; Turing &amp; others&nbsp;did.</p>' } }),
  });
  const read = await readWikipedia('Machine learning', 'History', fake);
  assert.equal(read.text, "Samuel didn't agree — Turing & others did.");
});

test('an entity nobody decodes is left as itself, not blanked', async () => {
  const fake = fetcher({ 'prop=tocdata': reply(TOC), 'prop=text': reply({ parse: { text: '<p>caf&eacute; life</p>' } }) });
  assert.equal((await readWikipedia('Machine learning', 'History', fake)).text, 'caf&eacute; life');
});

test('citation markers and markup do not reach the model', async () => {
  const fake = fetcher({
    'prop=tocdata': reply(TOC),
    'prop=text': reply({ parse: { text: '<p>Backprop<sup class="reference">[12]</sup> is <b>key</b>&nbsp;here &amp; now.</p><style>.x{}</style>' } }),
  });
  const read = await readWikipedia('Machine learning', 'History', fake);
  assert.equal(read.text, 'Backprop is key here & now.');
});

// --- the whole article, for the card ---

test('the article carries its licence, for the notice the card must show', async () => {
  const fake = fetcher({
    '/html': { ...reply('<html><body><section data-mw-section-id="0">Lead</section></body></html>'), text: async () => '<html><body><section data-mw-section-id="0">Lead</section></body></html>' },
    '/bare': reply({ title: 'Machine learning', license: { title: 'Creative Commons Attribution-Share Alike 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/deed.en' } }),
  });
  const article = await fetchWikipediaArticle('machine learning', fake);
  assert.equal(article.title, 'Machine_learning');
  assert.equal(article.displayTitle, 'Machine learning');
  assert.match(article.html, /data-mw-section-id="0"/);
  assert.equal(article.licence.url, 'https://creativecommons.org/licenses/by-sa/4.0/deed.en');
});

test('a licence lookup that fails still leaves a compliant notice', async () => {
  const fake = fetcher({ '/html': { ...reply('<html></html>'), text: async () => '<html></html>' }, '/bare': fails(500) });
  const article = await fetchWikipediaArticle('Machine learning', fake);
  assert.match(article.licence.title, /Attribution-Share Alike 4\.0/);
  assert.match(article.licence.url, /^https:\/\/creativecommons\.org\//);
});

test('a licence lookup that throws does not take the article down with it', async () => {
  const fake = fetcher({
    '/html': { ...reply('<html></html>'), text: async () => '<html></html>' },
    '/bare': () => { throw new Error('upstream exploded'); },
  });
  const article = await fetchWikipediaArticle('Machine learning', fake);
  assert.match(article.licence.title, /Attribution-Share Alike 4\.0/);
});

test('the contents list reads either spelling of the level field', () => {
  const legacy = { parse: { tocdata: { sections: [{ index: '1', toclevel: 2, line: 'Deep', anchor: 'Deep' }] } } };
  assert.equal(tocFrom(legacy)[0].level, 2);
});

test('an article too large to open is refused by declared length', async () => {
  const big = { ok: true, status: 200, headers: new Headers({ 'content-length': String(5 * 1024 * 1024) }), text: async () => '' };
  const fake = fetcher({ '/html': big, '/bare': reply({}) });
  await assert.rejects(() => fetchWikipediaArticle('Machine learning', fake), /too large to open/);
});

// --- putting one in front of the learner ---

const readArticles = [{ title: 'Machine_learning', displayTitle: 'Machine learning', toc: tocFrom(TOC) }];

test('showing an article returns what the reader needs', () => {
  assert.deepEqual(validateShowWikipedia({ title: 'Machine learning', section: 'Deep learning' }, readArticles), {
    lang: 'en', title: 'Machine_learning', displayTitle: 'Machine learning',
    section: 3, sectionTitle: 'Deep learning', url: 'https://en.wikipedia.org/wiki/Machine_learning',
  });
});

test('an article it has not read cannot be shown', () => {
  assert.throws(() => validateShowWikipedia({ title: 'Quantum computing' }, readArticles), /Read the article before showing it/);
});

test('a section that does not exist cannot be shown, and says what does', () => {
  assert.throws(() => validateShowWikipedia({ title: 'Machine learning', section: 'Ethics' }, readArticles),
    /No section "Ethics" in Machine learning\. Its sections are: History, Approaches, Deep learning/);
});

test('no section opens at the top', () => {
  const shown = validateShowWikipedia({ title: 'Machine learning' }, readArticles);
  assert.equal(shown.section, 0);
  assert.equal(shown.sectionTitle, null);
});

test('a wikipedia URL is accepted where a title is', () => {
  assert.equal(validateShowWikipedia({ title: 'https://en.wikipedia.org/wiki/Machine_learning' }, readArticles).title, 'Machine_learning');
});

// --- the tools themselves ---

test('every tool refuses arguments it does not define', () => {
  for (const tool of [SEARCH_WIKIPEDIA_TOOL, READ_WIKIPEDIA_TOOL, SHOW_WIKIPEDIA_TOOL]) {
    assert.equal(tool.input_schema.additionalProperties, false, `${tool.name} accepts stray keys`);
    assert.ok(tool.description.length > 40, `${tool.name} needs a description the model can act on`);
  }
});

test('show_wikipedia asks only for what it can verify', () => {
  assert.deepEqual(SHOW_WIKIPEDIA_TOOL.input_schema.required, ['title']);
  assert.deepEqual(Object.keys(SHOW_WIKIPEDIA_TOOL.input_schema.properties).sort(), ['section', 'title']);
});

// The "Part of a series on" sidebar, hatnotes and navboxes read as a wall of
// link text before the article - the model must not read them either.
test('navigation chrome is stripped before the model reads a section', async () => {
  const { stripChrome } = await import('../src/learn-wiki.js');
  const html = '<div class="hatnote navigation-not-searchable">This article is about the smooth approximation.</div>'
    + '<table class="sidebar nomobile"><tbody><tr><td>Part of a series on <table><tr><td>Machine learning</td></tr></table></td></tr></tbody></table>'
    + '<p>The <b>softmax function</b> converts a vector into probabilities.</p>'
    + '<div role="navigation" class="navbox"><div>vte Glossary</div></div>'
    + '<div class="thumb">kept</div>';
  const text = stripChrome(html);
  assert.doesNotMatch(text, /This article is about|Part of a series|Machine learning|vte Glossary/);
  assert.match(text, /softmax function/);
  assert.match(text, /kept/);
});
