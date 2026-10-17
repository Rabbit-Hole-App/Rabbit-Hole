import { chromium } from '@playwright/test';
import { readFileSync, openSync, readSync, closeSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { addedBlocks, compactness, expectation, loadFixtures, originalsOf, sha256, sniffs } from './file-import-fixtures.mjs';

// The parameterized file-import check (owner spec 2026-10-16 section 12; docs/features/canvas-file-imports.md): one run over a
// fixture list (Lane 5's C:/s/fi-fixtures/manifest.json) and the capability registry (src/file-capabilities.js, or REGISTRY=<path>).
// Phase 1, no stack: every fixture's bytes match the list; the registry detects its family (or refuses it while the family is
// planned); a shipped family's sniff accepts its fixtures and refuses the mislabelled ones; the video cap admits exactly 50 MiB
// and refuses one byte more. Phase 2, against the LOCAL stack (skipped with OFFLINE=1): each fixture is dropped on a fresh
// canvas per family (ENTRY=upload uses the Upload/Insert picker instead); an offered family makes the registry's card, the
// saved board grows by references and compact metadata only, and the stored original downloads with the fixture's sha256; a
// planned family, an over-the-cap or a mislabelled file adds no card; negative fixtures never run script or fetch another host.
// The check only reads the stack's state and writes its own sessions and canvases. Prints no secrets.
// Usage: [FIXTURES=C:/s/fi-fixtures/manifest.json] [ONLY=<path part|family|role,...>] [OFFLINE=1] [ENTRY=drop|upload]
//        BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 [VARS=<.dev.vars>] node e2e/file-import-check.mjs
const FIXTURES = process.env.FIXTURES || 'C:/s/fi-fixtures/manifest.json';
const registry = await import(pathToFileURL(process.env.REGISTRY || new URL('../src/file-capabilities.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')).href);
const fixtures = loadFixtures(FIXTURES, process.env.ONLY || '');
const results = [];
const check = (name, pass, detail = {}) => { results.push({ name, pass, ...detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${Object.keys(detail).length ? `  ${JSON.stringify(detail)}` : ''}`); };
const head = (file, n = 64) => { const fd = openSync(file, 'r'); const b = Buffer.alloc(n); const read = readSync(fd, b, 0, n, 0); closeSync(fd); return b.subarray(0, read); };

// ---------------------------------------------------------------- phase 1: fixtures against the registry
console.log(`file-import-check: ${fixtures.length} fixtures from ${FIXTURES}`);
for (const fixture of fixtures) {
  const want = expectation(fixture, registry);
  const bytes = readFileSync(fixture.file);
  const problems = [];
  if (bytes.length !== fixture.bytes || sha256(bytes) !== fixture.sha256) problems.push('bytes differ from the fixture list');
  if (!want.known) problems.push(`no registry family "${fixture.family}"`);
  if (want.misdetected) problems.push(`the registry offers it as ${want.detected}, not ${fixture.family}`);
  if (want.offered && !want.byStructure && want.detected !== fixture.family) problems.push(`its family is shipped but the registry does not take .${fixture.ext}`);
  if (!want.offered && want.detected === fixture.family) problems.push('a planned family is offered');
  const sniff = sniffs(registry, fixture, head(fixture.file));
  if (sniff !== null && fixture.attack === 'mislabelled' && sniff) problems.push('the sniff accepts a mislabelled file');
  if (sniff !== null && fixture.attack !== 'mislabelled' && fixture.role !== 'negative' && !sniff) problems.push('the sniff refuses a real file');
  check(`registry  ${fixture.path}`, !problems.length, { family: fixture.family, status: want.offered ? 'shipped' : 'planned', detected: want.detected, sniff, ...(problems.length ? { problems } : {}) });
}
// Every extension the spec lists belongs to exactly one registry family (the picker, drop and server read only the registry).
const SPEC = 'png jpg jpeg webp gif svg mp4 webm mp3 wav ogg m4a flac pdf txt md markdown ipynb py js mjs cjs ts jsx tsx java go rs c h cpp cc cxx hpp cs rb php swift kt kts sh bash sql r jl lua scala html css scss json jsonl yaml yml toml ini xml csv tsv xlsx xls docx doc pptx glb gltf obj fbx stl 3mf step stp ply splat ksplat spz sog'.split(' ');
const owners = ext => registry.FAMILIES.filter(f => f.extensions.includes(ext)).map(f => f.id);
const unowned = SPEC.filter(ext => owners(ext).length !== 1);
check('registry  every spec extension has exactly one family', !unowned.length, unowned.length ? { extensions: Object.fromEntries(unowned.map(ext => [ext, owners(ext)])) } : {});
const boundary = fixtures.filter(f => f.role === 'boundary');
if (boundary.length) {
  const cap = registry.boardFileLimit('video/mp4');
  check('registry  the board file cap admits exactly 50 MiB of video and refuses one byte more', cap.bytes === 50 * registry.MiB && boundary.every(f => (f.bytes <= cap.bytes) === (f.bytes === 50 * registry.MiB)) && !!cap.sniff?.(head(boundary[0].file)),
    { cap: cap.bytes, fixtures: boundary.map(f => [basename(f.path), f.bytes]) });
}

// ---------------------------------------------------------------- phase 2: the local stack
if (process.env.OFFLINE !== '1') {
  const BASE = process.env.BASE || 'http://127.0.0.1:8878';
  const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
  for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('file-import-check runs against the local stack only');
  const ENTRY = process.env.ENTRY === 'upload' ? 'upload' : 'drop';
  const run = Date.now().toString(36).slice(-6);
  const secret = readFileSync(process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
  const session = (await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `fimport-${run}@example.com`, secret, handle: `fimport_${run}` }) })).json()).session;
  const cookie = `small_session=${session}`;
  const api = async (path, init = {}) => { const r = await fetch(`${BASE}${path}`, { ...init, headers: { cookie, ...(init.headers || {}) } }); return r; };
  const board = async name => { const r = await api(`/api/learn/boards/${name}/main`); if (!r.ok) return { text: '{}', state: {} }; const body = await r.json(); const state = typeof body.state === 'string' ? JSON.parse(body.state) : (body.state || {}); return { text: JSON.stringify(state), state }; };
  const until = async (probe, timeout, what) => { const end = Date.now() + timeout; let last; while (Date.now() < end) { last = await probe(); if (last) return last; await new Promise(r => setTimeout(r, 250)); } throw Error(`timed out waiting for ${what}`); };

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  const outside = [];
  // Another host is never contacted by an import: anything not the stack is recorded and refused.
  await context.route(url => !url.href.startsWith(BASE) && !url.href.startsWith(CP), route => { outside.push(route.request().url()); return route.abort(); });
  const page = await context.newPage();
  page.on('pageerror', error => console.log('PAGEERROR:', error.message));
  const canvas = page.locator('[aria-label="Lesson canvas"]');
  const canvases = {};
  const open = async family => {
    if (!canvases[family]) {
      const made = await (await api('/api/canvases', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: `File import ${family} ${run}` }) })).json();
      canvases[family] = made.name;
    }
    if (!page.url().endsWith(`/apps/${canvases[family]}`)) {
      await page.goto(`${BASE}/apps/${canvases[family]}`);
      await canvas.waitFor({ timeout: 60000 });
      await page.waitForFunction(() => document.querySelector('[aria-label="Lesson canvas"] div.touch-none'), null, { timeout: 30000 });
    }
    return canvases[family];
  };
  // A real drop at the canvas centre (or the page's Upload/Insert picker). Files go in through a file input, so a 50 MiB
  // fixture is never copied through page.evaluate.
  const enter = async files => {
    if (ENTRY === 'upload') return page.setInputFiles('input[type="file"][multiple][accept]', files);
    await page.evaluate(() => { if (!document.getElementById('fixture-files')) document.body.append(Object.assign(document.createElement('input'), { type: 'file', multiple: true, id: 'fixture-files', hidden: true })); });
    await page.setInputFiles('#fixture-files', files);
    await page.evaluate(() => {
      const surface = document.querySelector('[aria-label="Lesson canvas"] div.touch-none'), box = surface.getBoundingClientRect();
      const transfer = new DataTransfer(); for (const file of document.getElementById('fixture-files').files) transfer.items.add(file);
      const init = { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 };
      surface.dispatchEvent(new DragEvent('dragover', init)); surface.dispatchEvent(new DragEvent('drop', init));
    });
  };
  const choose = async chooser => {
    if (chooser === 'import') { const dialog = page.getByRole('dialog', { name: 'Add to canvas' }); await dialog.waitFor({ timeout: 15000 }); await dialog.getByRole('button', { name: 'Add to canvas' }).click(); }
    if (chooser === 'pdf') { const dialog = page.locator('[data-pdf-add-dialog] [role="dialog"]'); await dialog.waitFor({ timeout: 20000 }); await dialog.getByRole('button', { name: /^Add/ }).last().click(); }
  };
  const download = async (name, original) => {
    const path = original.via === 'file' ? `/api/learn/files/${original.id}` : `/api/learn/boards/${name}/main/assets/${encodeURIComponent(original.id)}`;
    const r = await api(path);
    return r.ok ? sha256(Buffer.from(await r.arrayBuffer())) : null;
  };
  const FLAGS = ['__htmlRan', '__htmlOnload', '__htmlImg', '__svgOnload', '__svgScript', '__svgLink', '__nbRan'];

  for (const fixture of fixtures) {
    const want = expectation(fixture, registry);
    const label = `stack/${ENTRY}  ${fixture.path}`;
    try {
      const name = await open(fixture.family);
      const before = await board(name);
      outside.length = 0;
      const files = [fixture.file, ...fixture.deps.map(dep => join(FIXTURES.replace(/[\\/][^\\/]+$/, ''), dep))];
      await enter(files);
      if (!want.offered || want.mustRefuse) {
        // Refused: the page names the file in its message and the saved board gains nothing.
        await until(async () => (await page.getByText(basename(fixture.path), { exact: false }).count()) > 0, 15000, `a message naming ${basename(fixture.path)}`);
        const after = await board(name);
        const added = addedBlocks(before.state, after.state);
        check(label, !added.length && !outside.length, { expected: want.offered ? 'refused (over the cap or mislabelled)' : 'refused (planned family)', added: added.map(b => [b.type, b.kind]), outside });
        continue;
      }
      await choose(want.chooser);
      const after = await until(async () => { const b = await board(name); return addedBlocks(before.state, b.state).length ? b : null; }, 60000, 'the saved board to gain the card');
      const added = addedBlocks(before.state, after.state);
      const card = added.find(b => b.type === want.card.type && (!want.card.kind || b.kind === want.card.kind));
      const compact = compactness(before.text, after.text, { sourceBytes: fixture.bytes });
      const originals = card ? originalsOf(card) : [];
      const sums = [];
      for (const original of originals) sums.push(await until(() => download(name, original), 120000, `the stored original ${original.id}`));
      const flags = await page.evaluate(names => names.filter(n => window[n] !== undefined), FLAGS);
      const kept = sums.includes(fixture.sha256);
      check(label, !!card && compact.ok && kept && !flags.length && !outside.length, {
        card: card ? [card.type, card.kind] : added.map(b => [b.type, b.kind]), expected: [want.card.type, want.card.kind],
        board: compact, original: kept ? 'sha256 matches' : { want: fixture.sha256, got: sums }, ...(flags.length ? { ran: flags } : {}), ...(outside.length ? { outside } : {}),
      });
    } catch (error) {
      check(label, false, { error: error.message.split('\n')[0] });
      await page.goto('about:blank').catch(() => {});
    }
  }
  await browser.close();
}

const passed = results.filter(r => r.pass).length;
writeFileSync(process.env.OUT || join(tmpdir(), 'file-import-check.json'), JSON.stringify({ fixtures: FIXTURES, results }, null, 1));
console.log(passed === results.length ? 'PASS' : 'FAIL', `${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
