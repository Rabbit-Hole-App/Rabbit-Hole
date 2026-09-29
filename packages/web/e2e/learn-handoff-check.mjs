import { chromium } from '@playwright/test';

// The Agent Bar handoff into Learn: small.learn.request (sessionStorage, read
// once on mount) and the small:learn-request event, each answered by exactly
// one small:learn-result, also kept at small.learn.result:<id>.

const app = { name: 'nanogpt', org: 'example-team', orgName: 'Example team', kind: 'repository', repo: 'karpathy/nanoGPT', description: '', owner_email: 'b@e.test', deployed_at: '2026-09-08T09:16:00Z', created_at: '2026-09-07T16:20:00Z', visibility: 'domain', members: [], teams: [], observations: [], canEdit: true, email: 'b@e.test', schedule: null, commit_sha: 'abc123' };
const replies = { '/api/apps': { org: app.org, orgName: app.orgName, email: app.email, apps: [app], folders: [] }, '/api/apps/nanogpt': app, '/api/apps/nanogpt/learn-course': { course: null, canAuthor: true }, '/api/repositories/nanogpt': { ...app, status: 'ready' }, '/api/repositories/nanogpt/snapshot': { commit: 'abc123', graph: { nodes: [], edges: [] }, files: [], skipped: [] }, '/api/workspaces': { active: app.org, email: app.email, workspaces: [{ slug: app.org, name: app.orgName, role: 'owner', kind: 'custom' }] } };
const onePagePdf = () => {
  const stream = 'BT /F1 14 Tf 20 150 Td (Attention Is All You Need) Tj ET';
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let body = '%PDF-1.4\n';
  const offsets = objects.map((object, at) => { const offset = body.length; body += `${at + 1} 0 obj\n${object}\nendobj\n`; return offset; });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(body, 'latin1');
};
const PROMPT = 'Explain how softmax turns scores into probabilities';
const BOARD = 'handoff-1';
const KEY = `small.adaptive-canvas:example-team:b@e.test:nanogpt:${BOARD}:s0`;

const searches = [], asks = [];
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1500, height: 950 } });
await context.addInitScript(([prompt, board]) => {
  window.__results = [];
  window.addEventListener('small:learn-result', event => window.__results.push(event.detail));
  if (sessionStorage.getItem('seeded')) return;
  sessionStorage.setItem('seeded', '1');
  // The Agent Bar writes this, then navigates here.
  sessionStorage.setItem('small.learn.request', JSON.stringify({ id: 'teach-1', kind: 'teach', app: 'nanogpt', board, prompt }));
}, [PROMPT, BOARD]);
const page = await context.newPage();
await page.route('**/api/**', route => {
  const request = route.request();
  const url = new URL(request.url());
  if (url.pathname === '/api/learn/search') {
    const source = url.searchParams.get('source'), q = url.searchParams.get('q');
    searches.push(`${source}:${q}`);
    if (q === 'nothing matches this') return route.fulfill({ json: { results: [] } });
    if (source === 'arxiv') return route.fulfill({ json: { results: [{ key: q, title: 'Attention Is All You Need', exact: true, item: { id: q.replace(/^.*\//, ''), title: 'Attention Is All You Need', pdfUrl: `https://arxiv.org/pdf/${q}` } }] } });
    if (source === 'wikipedia') return route.fulfill({ json: { results: [{ key: q, title: q, item: { title: q.replace(/ /g, '_') } }] } });
    const videoId = q.match(/[\w-]{11}$/)?.[0] || 'Ilg3gGewQ5U';
    return route.fulfill({ json: { results: [{ key: videoId, title: 'Backpropagation, intuitively', subtitle: '3Blue1Brown', item: { videoId, title: 'Backpropagation, intuitively', channel: '3Blue1Brown' } }] } });
  }
  if (url.pathname === '/api/learn/paper') return route.fulfill({ status: 200, contentType: 'application/pdf', body: onePagePdf() });
  if (url.pathname === '/api/learn/wiki') {
    const title = url.searchParams.get('title') || 'Softmax_function';
    return route.fulfill({ json: { title, displayTitle: title.replace(/_/g, ' '), html: '<section data-mw-section-id="0"><p>The article text.</p></section>', toc: [], url: `https://en.wikipedia.org/wiki/${title}`, licence: { title: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' } } });
  }
  if (request.method() === 'POST' && /ask|selection/.test(url.pathname)) {
    asks.push(url.pathname);
    return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: 'event: done\ndata: {}\n\n' });
  }
  return route.fulfill({ json: replies[url.pathname] || {} });
});
await page.route('**youtube-nocookie.com/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>player</body></html>' }));
await page.route('**i.ytimg.com/**', route => route.fulfill({ status: 404, body: '' }));
page.on('pageerror', error => console.log('PAGEERROR:', error.message));

let failed = 0;
const ok = (name, condition, extra = '') => { if (!condition) failed += 1; console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`); };
const resultFor = async id => (await page.waitForFunction(id => window.__results.find(result => result.id === id), id, { timeout: 25000 })).jsonValue();
const resultsFor = id => page.evaluate(id => window.__results.filter(result => result.id === id).length, id);
const saved = id => page.evaluate(id => JSON.parse(sessionStorage.getItem(`small.learn.result:${id}`) || 'null'), id);
const send = detail => page.evaluate(detail => window.dispatchEvent(new CustomEvent('small:learn-request', { detail })), detail);
const blocks = async type => { await page.waitForTimeout(900); return page.evaluate(([key, type]) => (JSON.parse(localStorage.getItem(key) || '{}').blocks || []).filter(block => block.type === type), [KEY, type]); };
const composer = page.locator('[data-learn-dock] [data-chat-composer] input:not([type="file"])');
const research = (id, kind, ref, extra = {}) => ({ id, kind: 'research', app: 'nanogpt', board: BOARD, source: { kind, ref }, ...extra });

await page.goto(`http://localhost:5189/apps/nanogpt?tab=learn&board=${BOARD}`);

// --- teach, through the navigation handoff ---
const teach = await resultFor('teach-1');
ok('session handoff: teach is answered after Learn mounts', teach.status === 'prefilled' && teach.kind === 'teach', JSON.stringify(teach));
ok('the result echoes the request id', teach.id === 'teach-1');
ok('the prompt is in the real dock composer', (await composer.inputValue()) === PROMPT);
ok('and the composer has focus, caret at the end', await composer.evaluate((input, prompt) => document.activeElement === input && input.selectionStart === prompt.length, PROMPT));
ok('the pending request was consumed', (await page.evaluate(() => sessionStorage.getItem('small.learn.request'))) === null);
ok('the result is kept for a remounted caller', (await saved('teach-1'))?.status === 'prefilled');
await page.waitForTimeout(1200);
ok('nothing was sent', asks.length === 0 && (await composer.inputValue()) === PROMPT, `asks ${asks.length}`);

// --- teach never overwrites a draft ---
await composer.fill('my own half-written question');
await send({ id: 'teach-2', kind: 'teach', app: 'nanogpt', board: BOARD, prompt: 'Something else' });
const conflict = await resultFor('teach-2');
ok('a draft in the composer refuses teach, saying why', conflict.status === 'rejected' && /draft/i.test(conflict.reason), conflict.reason);
ok('and the draft is untouched', (await composer.inputValue()) === 'my own half-written question');
await composer.fill('');

// --- live teach while Learn is open ---
await send({ id: 'teach-3', kind: 'teach', app: 'nanogpt', board: BOARD, prompt: 'What is a logit?' });
ok('already-open Learn takes the live event', (await resultFor('teach-3')).status === 'prefilled' && (await composer.inputValue()) === 'What is a logit?');
await composer.fill('');
ok('still nothing sent', asks.length === 0);

// --- research: one normal card per source kind ---
await send(research('research-arxiv', 'arxiv', '1706.03762'));
const arxiv = await resultFor('research-arxiv');
const papers = await blocks('paper');
ok('arXiv adds exactly one normal paper card', arxiv.status === 'added' && papers.length === 1 && papers[0].id === arxiv.resourceId && papers[0].paper.id === '1706.03762', JSON.stringify(arxiv));
ok('through the Search lookup', searches.includes('arxiv:1706.03762'));
ok('the card is on the canvas', await page.locator(`[data-block-id="${arxiv.resourceId}"]`).isVisible());
ok('and listed in Files like a manual add', (await page.evaluate(key => localStorage.getItem(key), 'small.adaptive-canvas:example-team:b@e.test:nanogpt:sources'))?.includes('paper:1706.03762'));

await send(research('research-wiki', 'wiki', 'Softmax function'));
const wiki = await resultFor('research-wiki');
const wikis = await blocks('wiki');
ok('Wikipedia adds exactly one normal article card', wiki.status === 'added' && wikis.length === 1 && wikis[0].id === wiki.resourceId && wikis[0].title === 'Softmax_function', JSON.stringify(wiki));

await send(research('research-video', 'youtube', 'https://youtu.be/Ilg3gGewQ5U'));
const video = await resultFor('research-video');
const videos = await blocks('video');
ok('YouTube adds exactly one normal video card', video.status === 'added' && videos.length === 1 && videos[0].id === video.resourceId && videos[0].videoId === 'Ilg3gGewQ5U', JSON.stringify(video));

// --- refusals ---
await send(research('research-pdf', 'pdf', 'https://example.com/paper.pdf'));
const pdf = await resultFor('research-pdf');
ok('a PDF is refused with the reason', pdf.status === 'rejected' && pdf.reason === 'Uploaded PDFs do not have a portable source reference for this handoff. Add/upload the PDF from Learn instead.', pdf.reason);
await send(research('research-none', 'wiki', 'nothing matches this'));
ok('no match is refused, not faked', (await resultFor('research-none')).status === 'rejected' && (await blocks('wiki')).length === 1);
await send({ ...research('research-other-app', 'wiki', 'Logit'), app: 'someone-else' });
ok('a request for another app is refused', (await resultFor('research-other-app')).status === 'rejected');
await send({ ...research('research-other-board', 'wiki', 'Logit'), board: 'another-board' });
ok('a request for another canvas is refused', (await resultFor('research-other-board')).status === 'rejected' && (await blocks('wiki')).length === 1);

// --- one-shot and idempotent ---
const searched = searches.length;
await send(research('research-arxiv', 'arxiv', '1706.03762'));
await page.waitForFunction(() => window.__results.filter(result => result.id === 'research-arxiv').length === 2, null, { timeout: 5000 }).catch(() => {});
ok('a repeated id replays its result', (await resultsFor('research-arxiv')) === 2 && JSON.stringify(await page.evaluate(() => window.__results.filter(result => result.id === 'research-arxiv').at(-1))) === JSON.stringify(arxiv));
ok('and adds nothing twice', (await blocks('paper')).length === 1 && searches.length === searched);
await page.evaluate(detail => { for (let at = 0; at < 3; at += 1) window.dispatchEvent(new CustomEvent('small:learn-request', { detail })); }, research('research-burst', 'wiki', 'Backpropagation'));
await resultFor('research-burst');
await page.waitForTimeout(800);
ok('three deliveries at once add one card and answer once', (await blocks('wiki')).length === 2 && (await resultsFor('research-burst')) === 1);
await send(research('research-next', 'youtube', 'https://youtu.be/aircAruvnKk'));
const next = await resultFor('research-next');
ok('an earlier result does not answer a newer request', next.id === 'research-next' && next.resourceId !== video.resourceId && (await saved('research-next'))?.resourceId === next.resourceId);

// --- the navigation handoff for research, after a reload ---
await page.evaluate(board => sessionStorage.setItem('small.learn.request', JSON.stringify({ id: 'research-nav', kind: 'research', app: 'nanogpt', board, source: { kind: 'wiki', ref: 'Logit' } })), BOARD);
await page.reload();
const navigated = await resultFor('research-nav');
ok('session handoff: research lands after Learn mounts', navigated.status === 'added' && (await blocks('wiki')).some(block => block.id === navigated.resourceId && block.title === 'Logit'));
ok('and the request is gone', (await page.evaluate(() => sessionStorage.getItem('small.learn.request'))) === null);
ok('teach-1 did not run again on reload', (await resultsFor('teach-1')) === 0 && (await composer.inputValue()) === '');

// --- manual Search still adds a card the old way ---
const answered = await page.evaluate(() => window.__results.length);
await page.getByRole('button', { name: 'Search YouTube, arXiv and Wikipedia' }).click();
const bar = page.getByRole('dialog', { name: 'Search' });
await bar.getByRole('combobox', { name: 'Search in' }).selectOption('wikipedia');
await bar.getByRole('textbox').fill('Cross entropy');
await bar.getByRole('textbox').press('Enter');
await bar.getByRole('listbox').waitFor();
await bar.getByRole('textbox').press('Enter');
ok('manual Search still adds an article card', (await blocks('wiki')).some(block => block.title === 'Cross_entropy'));
ok('and answers no handoff', (await page.evaluate(() => window.__results.length)) === answered);

console.log(failed ? `${failed} failed` : 'all green');
await browser.close();
process.exit(failed ? 1 : 0);
