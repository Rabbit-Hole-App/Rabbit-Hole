// Loose glTF + BIN + texture: real source/board/Chat persistence, Add to Chat, delete, reload, Context Add twice, reload.
// FORK=1 repeats as a fork owner; the sources belong to another user. No source reupload.
// Interactive model routes are aborted; automatic next-steps are fixtures, explicitly counted.
// A fixture user message creates the persisted Chat thread without inference.
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { familyOf } from '../src/file-capabilities.js';
import { fileCardFromSource } from '../src/file-to-canvas.js';

const BASE = process.env.BASE || 'http://127.0.0.1:8878', CP = process.env.SMALL_CP || 'http://127.0.0.1:8879', FIX = process.env.FIXTURES || 'C:/s/fi-fixtures';
for (const url of [BASE, CP]) if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw Error('file-context-add-check runs against the local stack only');
const secret = readFileSync(process.env.VARS || new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
const run = Date.now().toString(36).slice(-6);
let { session } = await (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `fca-${run}@example.com`, secret, handle: `fca_${run}` }) })).json();
const auth = { cookie: `small_session=${session}` };
const api = async (path, init = {}) => { const r = await fetch(`${BASE}${path}`, { ...init, headers: { ...auth, 'content-type': 'application/json', ...(init.headers || {}) } }); return { status: r.status, body: await r.json().catch(() => null) }; };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

// What each family's card is on the canvas: the renderer's own marker inside the card.
const FILES = [{ path: 'gltf/separate/cube.gltf', type: 'model/gltf+json', marker: '[data-model-card][data-model-state="ready"]' }];

let failed = 0, steps = 0;
const ok = (name, condition, extra = '') => { steps += 1; if (!condition) failed += 1; console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`); };

const canvas = (await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: `Context add ${run}` }) })).body;
let board = `/api/learn/boards/${canvas.name}/main`;
const EMPTY = { blocks: [], shapes: [], items: [], links: [], strokes: [], exchanges: [] };
const save = async state => api(board, { method: 'PUT', body: JSON.stringify({ state, version: (await api(board)).body?.version }) });
await save(EMPTY);
const cards = [];
for (const [i, f] of FILES.entries()) {
  const bytes = readFileSync(`${FIX}/${f.path}`), name = basename(f.path), fam = familyOf({ name });
  const made = await api('/api/learn/files', { method: 'POST', body: JSON.stringify({ app: canvas.name, board: 'main', name, type: f.type, size: bytes.byteLength, sha256: sha(bytes), family: fam.id }) });
  if (made.body?.upload) {
    const put = await fetch(`${BASE}/api/learn/files/${made.body.source.id}`, { method: 'PUT', headers: { ...auth, 'content-type': f.type }, body: bytes });
    ok(`${name}: stored as a ${fam.id} source`, put.status === 200, String(put.status));
  } else ok(`${name}: stored as a ${fam.id} source`, made.status < 300 && !!made.body?.source, String(made.status));
  const card = fileCardFromSource({ id: made.body.source.id, rev: sha(bytes), name, type: f.type, size: bytes.byteLength }, fam);
  const bundle=[];
  for(const [dep,type] of [['cube.bin','application/octet-stream'],['cube_texture.png','image/png']]) {
    const content=readFileSync(FIX+'/gltf/separate/'+dep),rev=sha(content);
    const made=await api('/api/learn/files',{method:'POST',body:JSON.stringify({app:canvas.name,board:'main',name:dep,type,size:content.length,sha256:rev,family:'model-part'})});
    if(made.body?.upload) {const put=await fetch(BASE+'/api/learn/files/'+made.body.source.id,{method:'PUT',headers:{...auth,'content-type':type},body:content});ok(dep+': stored part',put.ok,String(put.status));}
    bundle.push({path:dep,source:{id:made.body.source.id,rev},family:'model-part'});
  }
  card.fileRef.bundle=bundle;card.fileRef.view={entry:name};
  cards.push({ ...f, name, fam, id: `fca-${i}`, source: made.body.source.id, card: { ...card, id: `fca-${i}`, dx: (i % 2) * 620, dy: Math.floor(i / 2) * 520, w: 520, h: 400 } });
}
ok('the board saves the bundled model', (await save({ ...EMPTY, blocks: cards.map(c => c.card) })).status === 200);


if(process.env.FORK==='1'){
 const sharing=(await api(board+'/share',{method:'POST',body:JSON.stringify({shared:true,view:true})})).body.sharing;
 const viewer=await (await fetch(CP+'/test/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'bundle-fork-'+run+'@example.com',secret,handle:'bf_'+run})})).json();
 session=viewer.session;auth.cookie='small_session='+session;
 const fork=await api('/api/learn/boards/fork',{method:'POST',body:JSON.stringify({source:{token:sharing.view},key:'bundle-'+run})});
 if(fork.status!==201)throw Error('fork refused '+fork.status);
 canvas.name=fork.body.name;board='/api/learn/boards/'+canvas.name+'/main';ok('fork inherits original bundle',true);
}
// A fixture message creates a real persisted thread without a model request. All subsequent attachment state uses normal UI saves.
const thread='canvaschat-'+crypto.randomUUID();
ok('fixture conversation persisted without inference',(await api('/api/learn/chat/threads/'+thread+'/messages',{method:'POST',body:JSON.stringify({app:canvas.name,client_id:'fixture',role:'user',content:'Bundle context acceptance fixture',mode:'ask'})})).status===201);
await api('/api/learn/chat/active',{method:'PUT',body:JSON.stringify({app:canvas.name,thread_id:thread})});
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
const sent = [], uploads = [], errors = [];
for (const route of ['**/api/learn/ask', '**/api/learn/selection', '**/api/learn/tutor/plan', '**/api/learn/artifact', '**/api/learn/home-ask']) await context.route(route, r => { sent.push(r.request().url()); return r.abort(); });
let automaticFixtures=0;
await context.route('**/api/learn/tutor/next-steps',route=>{automaticFixtures++;return route.fulfill({json:{steps:[]}});});
const page = await context.newPage();
page.setDefaultTimeout(15000);
page.on('pageerror', e => errors.push(e.message));
let watching = false;
page.on('request', r => { const u = new URL(r.url()); if (watching && (/^\/api\/learn\/files\/?$/.test(u.pathname) && r.method() === 'POST' || /^\/api\/learn\/files\/fs_/.test(u.pathname) && r.method() === 'PUT' || /\/assets\//.test(u.pathname) && r.method() === 'PUT' || u.pathname === '/api/learn/media')) uploads.push(`${r.method()} ${u.pathname}`); });
const settle = (ms = 400) => page.waitForTimeout(ms);
await page.goto(`${BASE}/apps/${canvas.name}`);
try { await page.locator(`[data-block-id="${cards[0].id}"]`).waitFor({ timeout: 30000 }); }
catch (error) { console.log('INITIAL_PAGE', await page.locator('body').innerText()); console.log('PAGE_ERRORS', JSON.stringify(errors)); await page.screenshot({ path: 'C:/s/spec/fi-bundle-context-initial.png' }); await browser.close(); throw error; }
await settle(2500);

await page.evaluate(() => document.activeElement?.blur());
await page.keyboard.press('Shift+Digit1'); await settle(1500);
const rendered = async c => (await page.locator(`[data-block-id="${c.id}"] ${c.marker}`).count()) > 0;
for (const c of cards) ok(`${c.name}: the ${c.fam.id} card renders as its family's card (${c.marker})`, await rendered(c));

// Add each card to chat (one at a time: select, Add to chat), then remove it from the canvas.
// Pan (wheel over an empty corner of the canvas) until the card's header strip is the topmost element at its own point.
const surfaceBox = async () => page.locator('[data-canvas-surface]').first().boundingBox();
const clickStrip = async id => {
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('Shift+Digit1'); await settle(700);
  const card = page.locator('[data-block-id="' + id + '"]');
  const strip = card.locator('[data-drag-handle], [data-drag-zone]').first();
  if (!(await strip.count())) return false;
  const b = await strip.boundingBox();
  if (!b) return false;
  const x = b.x + b.width / 2, y = b.y + b.height / 2;
  const hit = await page.evaluate(([x, y, id]) => document.elementFromPoint(x, y)?.closest('[data-block-id]')?.dataset.blockId === id, [x,y,id]);
  if (!hit) return false;
  await page.mouse.click(x,y); await settle();
  return await card.getAttribute('aria-current') === 'true';
};

for (const c of cards) {
  await page.locator('[data-panel-tab="chat"]').first().click();
  ok(c.name + ': card selectable', await clickStrip(c.id));
  await page.locator('[data-add-to-chat]:visible').first().click(); await settle(700);
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('Delete'); await settle(900);
  ok(c.name + ': card removed after attaching to chat', await page.locator('[data-block-id="' + c.id + '"]').count() === 0);
}
for(const deadline=Date.now()+10000;;){const state=(await api(board)).body.state;if(!state.blocks.length)break;if(Date.now()>deadline)throw Error('deleted model did not persist');await settle(250);}
for(const deadline=Date.now()+10000;;){const saved=(await api('/api/ask/threads/'+thread)).body;if(saved.contextRefs?.some(ref=>ref.sourceId.includes(cards[0].source)))break;if(Date.now()>deadline)throw Error('file attachment did not persist in Chat');await settle(250);}
await page.reload();await page.locator('[data-canvas-surface]').waitFor();await settle(1800);
ok('after reload the visible card is still deleted',await page.locator('[data-model-card]').count()===0);
const companionToggle = page.locator('[data-panel-companion]').first();
if (await companionToggle.getAttribute('aria-pressed') !== 'true') await companionToggle.click();
await page.locator('[data-companion-view="context"]').click();
console.log('CONTEXT_ROWS', await page.locator('[data-sources-pane]').innerText());
await page.screenshot({ path: 'C:/s/spec/fi-bundle-context-rows.png' });
watching = true;
for (const c of cards) {
  const row = page.locator('[data-material-row]').filter({ has: page.locator('[data-material-name]', { hasText: c.name }) });
  const add = row.locator('[data-material-action="canvas"]');
  await add.click(); await settle(900); await add.click(); await settle(900);
  let matching = [];
  for (const deadline = Date.now() + 10000; Date.now() < deadline;) {
    const saved = (await api(board)).body;
    matching = (saved.state?.blocks || []).filter(b => b.fileRef?.source?.id === c.source);
    if (matching.length && matching[0].id !== c.id) break;
    await settle(250);
  }
  ok(c.name + ': Context Add stores one card after two clicks', matching.length === 1, String(matching.length));
  if (matching.length === 1) c.id = matching[0].id;
  ok(c.name + ': Context restores two dependency references', matching[0]?.fileRef?.bundle?.length===2,JSON.stringify(matching[0]?.fileRef?.bundle));
  await settle(1800);
  ok(c.name + ': correct family renderer after Context Add', await rendered(c));
}
await page.reload(); await page.locator('[data-canvas-surface]').waitFor(); await settle(2500);
await page.evaluate(() => document.activeElement?.blur()); await page.keyboard.press('Shift+Digit1'); await settle(1000);
for (const c of cards) ok(c.name + ': restored card survives reload', await rendered(c));
ok('Context Add never uploads the source again', uploads.length === 0, JSON.stringify(uploads));
ok('no interactive model request attempted', sent.length === 0);
console.log('Automatic next-steps fixture responses:',automaticFixtures);
ok('no browser exceptions', errors.length === 0, JSON.stringify(errors));
await browser.close(); console.log(steps + ' checks, ' + failed + ' failed'); process.exitCode = failed ? 1 : 0;
