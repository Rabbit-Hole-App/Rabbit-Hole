// Verify the "Sources & evidence" disclosure on a DEPLOYED board, card by card,
// with real clicks in a clean browser: collapsed by default with the declared
// count; opening lists every source under its group; every code citation opens
// the right-side source inspector at its exact revision with exactly its lines
// highlighted (and, given pinned copies, the highlighted text equals the cited
// file's lines at that revision); links carry the right targets; a revision the
// server cannot load shows an honest unavailable state; no chat request is
// made; closing restores the card's collapsed height. Screenshots of each card
// collapsed, open and with its first code source in the inspector go to outDir.
//
// Usage: node e2e/card-sources-check.mjs <deployed-base> <board> <outDir> [pinnedDir]
//   pinnedDir: local copies of the cited repository files at the cited revision
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { BOARDS, BOARD_SEED_VERSIONS } from '../src/demo-scenes.js';
import { groupSources, repositoryUrl, sourceLabel, sourceTarget, validSources } from '../src/card-sources.js';
import { reveal } from './canvas-reveal.mjs';

const [, , base, board, OUT, pinned] = process.argv;
if (!base || !board || !OUT) throw new Error('usage: node e2e/card-sources-check.mjs <deployed-base> <board> <outDir> [pinnedDir]');
mkdirSync(OUT, { recursive: true });
const APP = 'repo-06745f10-nanogpt';
const secret = readFileSync(new URL('../../../.env', import.meta.url), 'utf8').match(/^SMALL_TEST_BYPASS=(.*)$/m)?.[1]?.trim();
const UA = { 'User-Agent': 'small-sources-check' };
const { session } = await (await fetch(`${base}/test/session`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...UA }, body: JSON.stringify({ email: 'yudhisteer.chin@gmail.com', secret }) })).json();
if (!session) throw new Error('no session from deployed worker');

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1720, height: 2400 } }); // taller than any open card; the canvas is panned to each
await context.addCookies([{ name: 'small_session', value: session, domain: new URL(base).hostname, path: '/' }]);
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(e.message));
// A question sent to the tutor: any POST to an ask endpoint.
let chatRequests = 0;
page.on('request', request => { if (request.method() === 'POST' && /\/api\/(?:learn\/ask|repositories\/[^/]+\/ask|ask)(?:$|\?)/.test(request.url())) chatRequests += 1; });

await page.goto(`${base}/apps/${APP}?tab=learn&board=${board}`);
const canvas = page.locator('[aria-label="Lesson canvas"]');
await canvas.waitFor({ timeout: 30000 });
const blocks = BOARDS[board]().filter(block => block.scene); // cards only; section headings carry no scene
await page.getByText(blocks[0].title).first().waitFor({ timeout: 30000 });
const seed = BOARD_SEED_VERSIONS[board];
let seedKey = null;
for (let i = 0; i < 15 && !seedKey; i += 1) { await page.waitForTimeout(400); seedKey = await page.evaluate(v => Object.keys(localStorage).find(k => k.endsWith(v)), `:${board}:s${seed}`); }
if (!seedKey) throw new Error(`seed :${board}:s${seed} not loaded`);
const bundle = await page.evaluate(() => [...document.querySelectorAll('script[src]')].map(s => s.getAttribute('src')).find(src => src.includes('/static/index')));
const panel = page.locator('[aria-label="Repository source"]');
const failures = [];
const fail = message => { failures.push(message); console.log(`  ✗ ${message}`); };
const results = { base, board, bundle, seed, cards: [] };

let order = 0;
for (const block of blocks) {
  order += 1;
  const sources = validSources(block.sources);
  const card = canvas.locator('[data-block-id]:not([data-chat-block])').filter({ hasText: block.title }).first();
  const name = `${String(order).padStart(2, '0')}-${(block.scene?.id || block.title).replace(/^nanogpt-/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`;
  const row = { card: block.title, sources: sources.length, code: 0, codeVerified: 0, links: 0 };
  results.cards.push(row);
  console.log(`${name}: ${sources.length} sources`);
  const details = card.locator('details[data-sources]');
  if (!sources.length) { if (await details.count()) fail(`${name}: disclosure shown without sources`); continue; }
  if (await details.count() !== 1) { fail(`${name}: expected one disclosure, found ${await details.count()}`); continue; }
  await reveal(page, canvas, card);
  if (await details.evaluate(el => el.open)) fail(`${name}: disclosure open by default`);
  const summary = (await card.locator('[data-sources-summary]').innerText()).trim();
  if (summary !== `Sources & evidence (${sources.length})`) fail(`${name}: summary "${summary}"`);
  const collapsed = (await card.boundingBox()).height;
  row.collapsedHeight = Math.round(collapsed);
  await card.screenshot({ path: `${OUT}/${name}__1-collapsed.png` });

  await card.locator('[data-sources-summary]').click();
  await page.waitForTimeout(300);
  if (!(await details.evaluate(el => el.open))) fail(`${name}: summary click did not open`);
  const groups = await card.locator('[data-source-group]').evaluateAll(els => els.map(el => el.dataset.sourceGroup));
  const wantGroups = groupSources(sources).map(group => group.id);
  if (JSON.stringify(groups) !== JSON.stringify(wantGroups)) fail(`${name}: groups ${groups} != ${wantGroups}`);
  const items = await card.locator('[data-source-kind]').count();
  if (items !== sources.length) fail(`${name}: ${items} entries rendered, ${sources.length} declared`);
  row.openHeight = Math.round((await card.boundingBox()).height);
  await reveal(page, canvas, card);
  await card.screenshot({ path: `${OUT}/${name}__2-sources-open.png` });

  let shotCode = true;
  for (const source of sources) {
    const target = sourceTarget(source);
    if (target.open === 'file') {
      row.code += 1;
      const button = card.locator(`[data-source-file="${target.path}:${target.line}-${target.lineEnd}"]`).first();
      if (!(await button.count())) { fail(`${name}: no button for ${sourceLabel(source)}`); continue; }
      await reveal(page, canvas, button);
      await button.click();
      await page.waitForTimeout(200);
      await panel.locator('[data-source-line]').first().waitFor({ timeout: 20000 }).catch(() => {});
      const header = await panel.locator('.font-mono').first().innerText().catch(() => '');
      const commit = await panel.locator('[data-source-commit]').getAttribute('data-source-commit').catch(() => null);
      const lit = await panel.locator('[data-highlighted]').evaluateAll(rows => rows.map(r => Number(r.dataset.sourceLine)));
      const want = Array.from({ length: target.lineEnd - target.line + 1 }, (u, i) => target.line + i);
      const link = await panel.locator('[data-source-open-repository]').getAttribute('href').catch(() => null);
      const problems = [];
      if (!header.startsWith(`${target.path}:${target.line}`)) problems.push(`header "${header}"`);
      if (commit !== target.commit) problems.push(`commit ${commit}`);
      if (JSON.stringify(lit) !== JSON.stringify(want)) problems.push(`highlighted ${lit.join(',')} want ${want.join(',')}`);
      if (link !== repositoryUrl(target)) problems.push(`repository link ${link}`);
      const file = pinned && `${pinned}/${target.path}`;
      if (file && existsSync(file)) {
        // An empty line renders as one space (code.jsx colorLine), so compare without trailing blanks.
        const expected = readFileSync(file, 'utf8').replace(/\r\n/g, '\n').split('\n').slice(target.line - 1, target.lineEnd).map(line => line.trimEnd()).join('\n');
        const shown = (await panel.locator('[data-highlighted] [data-source-text]').evaluateAll(rows => rows.map(r => r.textContent.trimEnd()))).join('\n');
        if (shown !== expected) problems.push('highlighted text differs from the pinned file');
      }
      if (problems.length) fail(`${name}: ${sourceLabel(source)}: ${problems.join('; ')}`);
      else row.codeVerified += 1;
      if (shotCode) {
        shotCode = false;
        const box = await card.boundingBox(), side = await page.locator('aside[aria-label="Learn agent chat"]').boundingBox();
        await page.screenshot({ path: `${OUT}/${name}__3-code-${target.path.replace(/[^a-z0-9]+/gi, '-')}-${target.line}.png`,
          clip: { x: box.x, y: Math.max(0, box.y), width: side.x + side.width - box.x, height: Math.min(1800, box.height) } });
      }
    } else if (target.open !== 'detail') {
      row.links += 1;
      const href = await card.locator(`[data-source-kind="${source.kind}"] a[href="${target.href}"]`).count();
      if (!href) fail(`${name}: no link to ${target.href}`);
    }
  }

  await reveal(page, canvas, card.locator('[data-sources-summary]'));
  await card.locator('[data-sources-summary]').click();
  await page.waitForTimeout(300);
  const closed = (await card.boundingBox()).height;
  if (await details.evaluate(el => el.open)) fail(`${name}: second click did not close`);
  if (Math.abs(closed - collapsed) > 1) fail(`${name}: height ${closed} after closing, ${collapsed} before opening`);
}

// A revision the server cannot load: the inspector says so and shows no code.
const firstCode = blocks.flatMap(block => validSources(block.sources).map(source => ({ block, source }))).find(entry => entry.source.kind === 'code');
if (firstCode) {
  await page.route('**/api/repositories/*/file', route => route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'This repository version is not indexed yet' }) }));
  const card = canvas.locator('[data-block-id]:not([data-chat-block])').filter({ hasText: firstCode.block.title }).first();
  await reveal(page, canvas, card);
  await card.locator('[data-sources-summary]').click();
  const target = sourceTarget(firstCode.source);
  const button = card.locator(`[data-source-file="${target.path}:${target.line}-${target.lineEnd}"]`).first();
  await reveal(page, canvas, button);
  await button.click();
  const alert = panel.locator('[role="alert"]');
  await alert.waitFor({ timeout: 10000 }).catch(() => {});
  const text = await alert.innerText().catch(() => '');
  const rows = await panel.locator('[data-source-line]').count();
  results.unavailable = { text, rows };
  if (!text.startsWith(`Not available at ${target.commit.slice(0, 7)}`) || rows) fail(`unavailable state: "${text}", ${rows} code rows`);
  else console.log(`unavailable revision: "${text}"`);
  await page.screenshot({ path: `${OUT}/zz-unavailable-revision.png`, clip: await page.locator('aside[aria-label="Learn agent chat"]').boundingBox() });
  await page.unroute('**/api/repositories/*/file');
  await card.locator('[data-sources-summary]').click();
}

if (chatRequests) fail(`${chatRequests} chat request(s) made while inspecting sources`);
if (pageErrors.length) fail(`page errors: ${pageErrors.join(' | ')}`);
results.chatRequests = chatRequests; results.pageErrors = pageErrors; results.failures = failures;
writeFileSync(`${OUT}/sources-results.json`, JSON.stringify(results, null, 2));
console.log(`\n${results.cards.length} cards · ${results.cards.reduce((n, c) => n + c.codeVerified, 0)}/${results.cards.reduce((n, c) => n + c.code, 0)} code sources verified · ${failures.length} failure(s) -> ${OUT}`);
await browser.close();
if (failures.length) process.exit(1);
