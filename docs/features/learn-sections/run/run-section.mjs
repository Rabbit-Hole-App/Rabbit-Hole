// One Learn section end to end on a fresh canvas on the owner stack (owner 2026-11-17 16:36), driven headless: the real app, nothing stubbed.
// New canvas of nanoGPT 3adf61e -> Learn from it -> the first option -> Accept the draft as it is -> Build this section on 1.1 -> wait for notes and for every card to stand
// on its slot. Never Arrange, resize or spacing. Times: this script's clock for UI events, and the arrival time of each stack log line (app.log tailed during the run).
// usage (from C:/s/learn-position): node C:/s/spec/sections-evidence/run-section.mjs   (8878 must run with LOCAL_NO_SIGNIN=true: no session needed)
import { chromium } from '@playwright/test';
import { readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';

const BASE = 'http://127.0.0.1:8878', LOG = 'C:/s/spec/owner-local/persist/app.log', OUT = 'C:/s/spec/sections-evidence/run-1117';
mkdirSync(OUT, { recursive: true });
const t0 = Date.now(), at = () => +((Date.now() - t0) / 1000).toFixed(1), events = [], mark = (what, extra = {}) => { const e = { t: at(), what, ...extra }; events.push(e); console.log(JSON.stringify(e)); };
const api = async (path, init = {}) => { const r = await fetch(BASE + path, { ...init, headers: { 'content-type': 'application/json' } }); const d = await r.json().catch(() => ({})); if (!r.ok) throw Error(`${path}: ${r.status} ${d.error || ''}`); return d; };
const sleep = ms => new Promise(done => setTimeout(done, ms));
const waitFor = async (read, what, ms) => { const end = Date.now() + ms; for (;;) { const v = await read().catch(() => null); if (v) return v; if (Date.now() > end) throw Error(`timed out: ${what}`); await sleep(500); } };

// The stack log, tailed: every JSON line with its arrival time on this clock.
const lines = []; let offset = statSync(LOG).size;
const tail = setInterval(() => { try { const size = statSync(LOG).size; if (size <= offset) return; const text = readFileSync(LOG, 'utf8').slice(offset); offset = size; for (const raw of text.split('\n')) { const i = raw.indexOf('{"'); if (i < 0) continue; try { lines.push({ t: at(), ...JSON.parse(raw.slice(i)) }); } catch { /* not JSON */ } } } catch { /* rotated */ } }, 300);

let browser, canvas = null, failure = null;
const blocksSeen = new Map();
try {
  const me = await api('/api/me'); mark('signed in (no sign-in)', { email: me.email });
  if (!(await api('/api/profile')).handle) await api('/api/profile', { method: 'PUT', body: JSON.stringify({ handle: `owner_${Date.now().toString(36)}` }) });
  canvas = process.env.CANVAS || null; // a fresh canvas made by an earlier try (nothing done on it yet)
  if (!canvas) {
    const project = process.env.PROJECT || (await api('/api/repositories', { method: 'POST', body: JSON.stringify({ url: 'https://github.com/karpathy/nanoGPT', branch: 'master', commit: '3adf61e' }) })).name;
    canvas = (await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title: 'nanoGPT section 1.1 (timed run)', project }) })).name;
  }
  mark('canvas', { canvas, url: `${BASE}/apps/${canvas}` });
  await waitFor(async () => { const g = await api(`/api/learn/rehearsal?app=${canvas}&board=main`); if (g.indexing === 'failed') throw Error('indexing failed'); return g.indexing === 'ready'; }, 'indexing', 20 * 60000);
  mark('indexed');
  await waitFor(async () => { const o = await api('/api/learn/rehearsal', { method: 'POST', body: JSON.stringify({ app: canvas, board: 'main', action: 'catalogue' }) }); if (o.catalogue?.status === 'failed') throw Error('catalogue failed'); return o.catalogueDoc?.learn ? o : null; }, 'catalogue', 20 * 60000);
  mark('catalogue ready');

  browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 950 } })).newPage();
  const errors = []; page.on('pageerror', e => { errors.push(e.message.slice(0, 200)); mark('PAGE ERROR', { error: e.message.slice(0, 300) }); });
  page.on('console', m => { const text = m.text(); if (text.includes('learn_section_perform_timeout')) mark('PERFORM TIMEOUT', JSON.parse(text)); else if (m.type() === 'error' && !text.startsWith('Failed to load resource')) mark('console error', { text: text.slice(0, 300) }); });
  page.on('dialog', d => { mark('DIALOG', { type: d.type(), text: d.message().slice(0, 200) }); d.dismiss().catch(() => {}); });
  const msg = key => page.locator(`[data-rehearsal-message="${key}"]`);
  const row = (key, label) => msg(key).locator('[data-choice-list]').getByRole('button', { name: label, exact: true });
  const enabled = async (key, label) => (await row(key, label).count()) && !(await row(key, label).isDisabled());
  await page.goto(`${BASE}/apps/${canvas}`);
  if (!process.env.RESUME) {
  await msg('intake').waitFor({ timeout: 180000 });
  await row('intake', 'Learn from it').click();
  await msg('learn-options').locator('[data-choice-list] button').first().waitFor({ timeout: 60000 });
  const option = (await msg('learn-options').locator('[data-choice-list] button').allInnerTexts())[0];
  await msg('learn-options').locator('[data-choice-list] button').first().click(); mark('learn option', { option });
  await row('learn-depth', 'Standard').waitFor({ timeout: 60000 }); await row('learn-depth', 'Standard').click(); mark('depth Standard (balanced)');
  const TRY = 'Try again'; // SENTENCES.planTryAgain
  const planState = async () => (await enabled('learn-plan', 'Accept')) ? 'draft' : (await enabled('learn-plan', TRY)) ? 'refused' : null;
  let plan = await waitFor(planState, 'the plan draft', 5 * 60000);
  if (plan === 'refused') { mark('plan refused: Try again'); await row('learn-plan', TRY).click(); await sleep(1500); plan = await waitFor(planState, 'the plan draft after Try again', 5 * 60000); }
  if (plan !== 'draft') throw Error('the plan was refused again after one Try again');
  mark('plan drafted');
  await page.screenshot({ path: `${OUT}/plan.png` });
  await row('learn-plan', 'Accept').click(); mark('accept');
  }
  // A refusal: the section's own Try again, pressed at most once in the whole run (Reviewer 19:40; a learner's button, reported as a retry).
  let retried = false;
  const refusedOrReady = async () => (await enabled('learn-section', 'Build this section')) ? 'ready' : (await enabled('learn-section', 'Try again')) ? 'refused' : null;
  let state = await waitFor(refusedOrReady, 'section 1.1 briefed and composed, or refused', 10 * 60000);
  if (state === 'refused') { retried = true; mark('1.1 refused: Try again'); await row('learn-section', 'Try again').click(); await sleep(1500); state = await waitFor(refusedOrReady, 'section 1.1 after Try again', 10 * 60000); }
  if (state !== 'ready') throw Error('section 1.1 refused again after one Try again');
  mark('1.1 ready (brief + compose)');

  // The ink of this canvas, read in the page: every learn card, when first seen and when placed.
  const ink = () => page.evaluate(name => { const key = Object.keys(localStorage).find(k => k.endsWith(`:${name}:ink`)); if (!key) return []; const s = JSON.parse(localStorage.getItem(key)); return (s.blocks || []).filter(b => b.learn).map(b => ({ id: b.id, type: b.type, learn: b.learn })); }, canvas);
  const watch = setInterval(async () => { try { for (const b of await ink()) { const seen = blocksSeen.get(b.id) || { id: b.id, type: b.type, ...b.learn, seen: at() }; if (b.learn.placed && seen.placedAt == null) seen.placedAt = at(); Object.assign(seen, { role: b.learn.role, itemId: b.learn.itemId }); blocksSeen.set(b.id, seen); } } catch { /* page busy */ } }, 400);
  await row('learn-section', 'Build this section').click(); mark('BUILD pressed');
  await waitFor(async () => (await msg('learn-section-making').count()) > 0, 'making started', 60000).catch(() => null);
  const made = async () => { if (await enabled('learn-section', 'Try again')) return 'refused'; return (await msg('learn-section-making').count()) === 0 && (await enabled('learn-section', 'Next section')) ? 'done' : null; };
  // A stall: no new card and no new server line for 90 s -> the page's messages, its learn cards and whether frames still run, then stop.
  let lastChange = Date.now(), lastSeen = '';
  const stall = setInterval(async () => { const key = `${blocksSeen.size}:${[...blocksSeen.values()].filter(b => b.placedAt != null).length}:${lines.length}`; if (key !== lastSeen) { lastSeen = key; lastChange = Date.now(); return; } if (Date.now() - lastChange < 90000) return; clearInterval(stall);
    const dump = await page.evaluate(async () => ({ hidden: document.hidden, frames: await new Promise(r => { let n = 0; const t = Date.now(); const f = () => { n += 1; if (Date.now() - t < 1000) requestAnimationFrame(f); else r(n); }; requestAnimationFrame(f); setTimeout(() => r(n), 2000); }),
      messages: [...document.querySelectorAll('[data-rehearsal-message]')].slice(-4).map(el => ({ key: el.dataset.rehearsalMessage, text: el.textContent.replace(/\s+/g, ' ').trim().slice(0, 200) })) })).catch(e => ({ error: e.message }));
    mark('STALL', { dump, cards: [...blocksSeen.values()] }); stalled = true; });
  let stalled = false;
  let result = await waitFor(async () => (stalled ? 'stalled' : made()), 'the section made', 45 * 60000);
  clearInterval(stall);
  if (result === 'refused' && !retried) { retried = true; mark('make refused: Try again'); await row('learn-section', 'Try again').click(); await sleep(1500); result = await waitFor(made, 'the section made after Try again', 45 * 60000); }
  mark(`making ${result}`);
  await waitFor(async () => { const all = [...blocksSeen.values()].filter(b => b.slot); return all.length && all.every(b => b.placedAt != null) ? true : null; }, 'every slot card placed', 120000).catch(e => mark('position: not every card placed', { error: e.message }));
  mark('position settled', { last_placed: Math.max(0, ...[...blocksSeen.values()].map(b => b.placedAt ?? 0)) });
  await sleep(6000); clearInterval(watch); // the board's debounced save (1.5 s) and its asset sync
  await page.screenshot({ path: `${OUT}/canvas.png` });
  const all = await page.evaluate(name => { const key = Object.keys(localStorage).find(k => k.endsWith(`:${name}:ink`)); const st = key ? JSON.parse(localStorage.getItem(key)) : {}; return (st.blocks || []).map(b => ({ type: b.type, learn: !!b.learn })); }, canvas);
  mark('canvas blocks', { total: all.length, section: all.filter(b => b.learn).length, other: all.filter(b => !b.learn).map(b => b.type) });
  mark('page errors', { errors: errors.slice(0, 10) });
} catch (error) { failure = error.message; mark('FAILED', { error: failure }); }
finally {
  clearInterval(tail); await browser?.close();
  writeFileSync(`${OUT}/run.json`, JSON.stringify({ canvas, url: canvas && `${BASE}/apps/${canvas}`, failure, events, cards: [...blocksSeen.values()], log: lines.filter(l => /learn|artifact|explain|model|code|notebook|wiki|paper|video|interact|diagram|graph/i.test(String(l.event || l.task || l.feature || ''))) }, null, 2));
  console.log(`wrote ${OUT}/run.json`);
}
