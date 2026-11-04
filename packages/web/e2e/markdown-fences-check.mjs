import { chromium } from '@playwright/test';

// Browser acceptance for rich fences in a Markdown file card (Md `fences`; file-text.js textChunks): a ```math and a ```latex fence
// are display math, a ```mermaid fence is the diagram (with its Copy), $$ math is as before, a plain fence stays code, and Show more
// never cuts a fence in two. The real AdaptiveCanvas and FileDocCard in e2e/canvas-editing-harness.html under Vite dev: the stored
// card's original is a routed /api/learn/files/<id>; no server, no model.
// usage: start `npx vite --port 5391 --strictPort --host 127.0.0.1` in packages/web, then node e2e/markdown-fences-check.mjs
const BASE = process.env.HARNESS || 'http://127.0.0.1:5391/e2e/canvas-editing-harness.html';
const total = 8;
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` - ${detail}` : ''}`); };
// The math fence below sits across the 64 KiB chunk boundary: the filler before it is sized so the boundary lands inside it.
const FORMULA = Array.from({ length: 40 }, (_, i) => `a_{${i}} + b_{${i}}`).join(' \\\n');
const head = '# Fences\n\nInline $x^2$ and display:\n\n$$\int_0^1 x\,dx = \tfrac12$$\n\n```math\nE = mc^2\n```\n\n```latex\n\frac{a}{b}\n```\n\n```mermaid\ngraph TD; A-->B\n```\n\n```python\nprint("plain")\n```\n\n';
const filler = 'Filler line, kept plain.\n\n'.repeat(Math.ceil((65536 - head.length - 40) / 26));
const MD = `${head}${filler}\`\`\`math\n${FORMULA}\n\`\`\`\n\nAfter the cut.\n\n${'Tail line.\n\n'.repeat(200)}`;
const ID = `fs_${'3'.repeat(24)}`, REV = 'b'.repeat(64);
const block = { id: 'fences.md', type: 'file', kind: 'markdown', format: 'md', label: 'fences.md', dx: 0, dy: 0, size: MD.length, fileRef: { v: 1, source: { id: ID, rev: REV }, family: 'markdown', meta: { name: 'fences.md', title: 'fences' }, view: {}, derivatives: {}, job: null, doc: null, status: { preview: 'pending', context: 'none' } } };

const browser = await chromium.launch();
const errors = [];
const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
await context.route('**/api/learn/files/**', route => (route.request().method() === 'GET' ? route.fulfill({ status: 200, contentType: 'text/markdown', body: Buffer.from(MD) }) : route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })));
await context.route('**/api/learn/pdf-highlights**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sha256: REV, highlights: [], changed: 0 }) }));
await page.goto(`${BASE}?board=md-fences&scope=canvas-fences`);
await page.evaluate(([key, blocks]) => localStorage.setItem(key, JSON.stringify({ strokes: [], shapes: [], items: [], links: [], groups: [], areas: [], blocks })), ['harness:md-fences', [block]]);
await page.reload();
const text = page.locator('[data-block-id="fences.md"] [data-file-doc-md]');
await text.first().waitFor({ timeout: 60000 });
await page.locator('[data-block-id="fences.md"] [data-md-diagram] svg').first().waitFor({ timeout: 60000 }).catch(() => {});

const math = await text.locator('[data-chat-math="display"]').count();
check('1 a math fence, a latex fence and a $$ block are display math (three formulas before the cut), none shown as code', math >= 3 && await text.locator('[data-code-lang]:text-is("math"), [data-code-lang]:text-is("latex")').count() === 0, `display formulas=${math}`);
check('2 a mermaid fence is a drawn diagram (an svg), with the code block\'s Copy for its source', await text.locator('[data-md-diagram] svg').count() === 1 && await text.locator('[data-md-diagram] [data-code-copy]').count() === 1);
check('3 a plain python fence stays code, with its language and Copy', await text.locator('[data-code-lang]:text-is("python")').count() === 1 && (await text.locator('[data-code-block]:has([data-code-lang]:text-is("python")) pre').innerText()).includes('print("plain")'));
check('4 inline math is still typeset', await text.locator('[data-chat-math="inline"]').count() >= 1);
// The big math fence straddles the first chunk: it is whole, in the first chunk, so Show more is only needed for what follows it.
const whole = await text.locator('[data-chat-math="display"]').last().innerText();
check('5 the fence on the chunk boundary is drawn whole (its last term is there), not cut', whole.includes('a39') || whole.includes('a_{39}') || /39/.test(whole), whole.slice(-40));
check('6 and the text after it needs Show more', await text.getByText('After the cut.').count() === 0 && await page.locator('[data-block-id="fences.md"] [data-file-doc-more]').count() === 1);
await page.locator('[data-block-id="fences.md"] [data-file-doc-more]').click().catch(() => {});
await page.waitForTimeout(300);
check('7 Show more draws the rest, with no formula source left as raw ```math text', (await text.innerText()).includes('After the cut.') && !(await text.innerText()).includes('```'));
check('8 no page errors', errors.length === 0, errors.join(' | '));

await browser.close();
const passed = results.filter(r => r.ok).length;
console.log(`${passed}/${total} checks passed`);
if (passed !== total || results.length !== total) process.exit(1);
