// Learn plan -> table of contents (C:/Users/cyudhist/Downloads/learn-plan-toc-spec.md, section 8; the FINAL rules: after Accept the Table of contents is read-only and TocConversation is not mounted,
// there is no "Change the plan" row, an accepted plan is final, 1.1 is the current section and the circles are not clickable). Follows intake-run-or-learn-check.mjs: a saved Learn goal, then the Tutor drafts the
// contents of a short book (message `learn-plan`: a numbered nested list, rows Accept / Change something), the learner edits it in plain words or accepts, and Accept puts it in the contents.
//
// UNRUN (written 2026-11-15, not executed; the owner clicks the same steps on 8878). Claude does not run browser automation (CLAUDE.md, Browser verification).
//
// Needs the server half (POST /api/learn/codebase actions learn_plan and learn_plan_save, packages/control-plane/src/learn-codebase-source-map.js + learn-plan.js) and the browser half
// (TutorRehearsal.jsx plan flow, LearnPage.jsx planDone, TableOfContents.jsx readOnly) of the same stack; another agent was finishing them when this was written, so selectors and shapes were aligned to the
// uncommitted working tree (learn_plan answers {text, proposal: {ops, base, source}, rows, off_plan}; learn_plan_save stores checkpoint.learn.plan {ops, revision, acceptedAt, text}). Re-read both when they land.
//
// It drives the REAL local app on the owner stack (app 127.0.0.1:8878, control plane 8879; the stack has model keys). Nothing is stubbed. SPEND (the owner stack's provider keys):
//   - learn_plan: capped at US$0.10 per call, metered as learn_plan. Per repository at most about 6 calls (the first draft, one edit, one off-plan line, and the server's own re-ask after an invalid draft);
//     nanoGPT makes 3 calls in the normal case, datasette 1.
//   - plus the intake's calls for each picked option (one learn_intro, about a cent) and, only when CANVAS_NANOGPT / CANVAS_DATASETTE are not set, the repositories' import and catalogue
//     (the spec's cap is US$0.50 each; stored catalogues cost nothing: name existing canvases with CANVAS_*).
//   A normal run is well under US$0.60 even with fresh catalogues, and about US$0.40 without; the worst case is bounded by the caps above.
//
// Usage (the owner stack, from packages/web; values are never printed): same variables as intake-run-or-learn-check.mjs:
//   BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 TEST_BYPASS_SECRET=<owner stack secret> node e2e/learn-plan-check.mjs [outDir]
//   (or VARS=<the owner stack .dev.vars>; optional CANVAS_NANOGPT, CANVAS_DATASETTE, COMMIT_NANOGPT, COMMIT_DATASETTE, OUT).
//
// Order: the nanoGPT steps run on ONE fresh canvas in sequence (each continues from the one before; a failed step can fail the next ones with a precondition message), datasette on its own fresh canvas.
// The numbering differs from the brief's list: the reload before Accept is step 2 (right after the first draft, so it does not depend on Keep), Accept is step 5.
//   1 nanoGPT: pick a learn option: ONE learn-plan draft: a title, 4-8 numbered chapters with 2-5 sections each, no file name, path or backtick in a title, rows Accept + Change something, and the
//     contents panel shows the same proposal (the ProposalCard, [data-toc-proposal], "Proposed: N changes", N = chapters + sections)
//   2 nanoGPT: a reload BEFORE Accept shows the same pending draft again, rows live, and the contents' proposal again
//   3 nanoGPT: "I don't want cross-entropy, but how this relates to word2vec": a NEW draft (titles changed, none with "entropy"), a (background) section, rows Accept + Keep the previous draft;
//     Keep restores the previous draft's titles
//   4 nanoGPT: "add a chapter on deploying it to AWS": one answer line, the draft unchanged, a learn:* row (a doc.learn.options label) offered
//   5 nanoGPT: Accept: "Plan accepted · N chapters", the contents list chapters + sections (count and titles equal the draft), the saved plan has acceptedAt, the contents are read-only (no draggable
//     entry, no grip, no edit/delete/more/add buttons, no editor on double-click, circles disabled, no proposal card, no [data-toc-composer], no TocConversation textarea), the first level-2 entry is
//     current (data-active + aria-current), and no "Change the plan" row anywhere
//   6 nanoGPT: a reload AFTER Accept: the same "Plan accepted · N chapters", the contents still read-only with the same entries
//   7 datasette (fresh canvas): the step 1 shape for its structure option, then Accept with the step 5 read-only checks
//   8 wording gate over every plan DOM snapshot: no gate word (nanoGPT|datasette|shakespeare|attention|tokens|word2vec) in a fixed sentence or fixed row label, fixed rows are the fixed set or document-derived,
//     no dollar figure anywhere in the plan or the contents
//   9 no page error and no 5xx from the learn routes during the run
// Heuristics, said plainly: "a title" is a list item's own text (its nested list taken out); document-derived titles may carry domain words, so the gate reads only the fixed strings it can identify
// (rows, the pending line, the accepted line); the one-sentence answer of step 4 is the one new Tutor line after the learner's.
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8878';
const CP = process.env.SMALL_CP || 'http://127.0.0.1:8879';
for (const url of [BASE, CP]) if (!/^http:\/\/127\.0\.0\.1(:\d+)?$/.test(url)) throw Error('learn-plan-check runs against the local stack on 127.0.0.1 only (never localhost)');
const OUT = process.argv[2] || process.env.OUT || 'learn-plan-shots';
mkdirSync(OUT, { recursive: true });
let secret = process.env.TEST_BYPASS_SECRET;
if (!secret) { try { secret = readFileSync(process.env.VARS || 'C:/s/explain-layout-web/packages/control-plane/.dev.vars', 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)?.[1].trim(); } catch { /* named below */ } }
if (!secret) throw Error('set TEST_BYPASS_SECRET, or VARS to the owner stack .dev.vars that holds it (the value is never printed)');
const run = Date.now().toString(36);

// ---------------------------------------------------------------- preflight (before any spend)
const up = await fetch(`${BASE}/sign-in`).then(r => r.status, () => 0);
if (up !== 200) throw Error(`the app on ${BASE} does not answer /sign-in (status ${up}); start the owner stack first`);
const session = (await fetch(`${CP}/test/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `plan-${run}@example.com`, secret }) }).then(r => r.json(), () => ({}))).session;
if (!session) throw Error(`the control plane on ${CP} minted no session (is the owner stack up with TEST_BYPASS_SECRET?)`);
const api = async (path, init = {}) => {
  const r = await fetch(`${BASE}${path}`, { ...init, headers: { cookie: `small_session=${session}`, 'content-type': 'application/json' } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Error(`${init.method || 'GET'} ${path.split('?')[0]}: HTTP ${r.status} ${d.error || ''}`);
  return d;
};
const sleep = ms => new Promise(done => setTimeout(done, ms));
const waitFor = async (read, what, ms = 30000) => { const end = Date.now() + ms; for (;;) { const value = await read().catch(() => null); if (value) return value; if (Date.now() > end) throw Error(`timed out: ${what}`); await sleep(400); } };
const norm = text => String(text ?? '').replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ').trim();
const lc = text => norm(text).toLowerCase();
const noBackground = title => norm(title).replace(/\s*\(background\)\s*$/i, '');

// ---------------------------------------------------------------- the two repositories (as intake-run-or-learn-check.mjs: imported here, or named by CANVAS_*)
const REPOS = {
  nano: { env: 'CANVAS_NANOGPT', url: 'https://github.com/karpathy/nanoGPT', branch: 'master', commit: process.env.COMMIT_NANOGPT || '3adf61e' },
  data: { env: 'CANVAS_DATASETTE', url: 'https://github.com/simonw/datasette', branch: 'main', commit: process.env.COMMIT_DATASETTE || 'e9d45fe' },
};
const made = { canvases: [], projects: [] };
const canvasIn = async (project, title) => { const name = (await api('/api/canvases', { method: 'POST', body: JSON.stringify({ title, project }) })).name; made.canvases.push(name); return name; };
if (!(await api('/api/profile')).handle) await api('/api/profile', { method: 'PUT', body: JSON.stringify({ handle: `plan_${run}` }) });
async function prepare(key) {
  const R = REPOS[key], given = process.env[R.env];
  let project;
  if (given) project = (await api(`/api/learn/codebase?app=${encodeURIComponent(given)}&board=main`)).repository?.app;
  else { project = (await api('/api/repositories', { method: 'POST', body: JSON.stringify({ url: R.url, branch: R.branch, commit: R.commit }) })).name; made.projects.push(project); }
  if (!project) throw Error(`${R.env}: that canvas has no repository`);
  const probe = await canvasIn(project, `Plan ${key} ${run}`);
  await waitFor(async () => { const g = await api(`/api/learn/rehearsal?app=${probe}&board=main`); if (g.indexing === 'failed') throw Error(`${key}: indexing failed`); return g.indexing === 'ready'; }, `${key}: the repository is indexed`, 15 * 60000);
  const doc = await waitFor(async () => { const out = await api('/api/learn/rehearsal', { method: 'POST', body: JSON.stringify({ app: probe, board: 'main', action: 'catalogue' }) }); if (out.catalogue?.status === 'failed') throw Error(`${key}: the catalogue failed`); return out.catalogueDoc?.learn ? out.catalogueDoc : null; }, `${key}: the catalogue document with its learn section`, 10 * 60000);
  const options = doc.learn.options || [];
  assert.ok(options.length >= 1, `${key}: doc.learn.options is empty`);
  console.log(`prepared ${key}: ${options.length} options`);
  return { key, doc, options, name: String(doc.repo || '').split('/').pop(), newCanvas: () => canvasIn(project, `Plan ${key} ${run} ${Math.random().toString(36).slice(2, 6)}`) };
}

let browser, failed = false;
const results = [], seen = [], errors = [], bad = [];
const total = 9;
try {
  const nano = await prepare('nano'), data = await prepare('data');
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message.slice(0, 200)));
  page.on('response', response => { const url = new URL(response.url()); if (url.origin === BASE && response.status() >= 500 && url.pathname.startsWith('/api/learn/')) bad.push(`${response.status()} ${url.pathname}`); });
  const step = async (name, fn) => {
    try { await fn(); results.push(true); console.log(`ok ${results.length}. ${name}`); }
    catch (error) {
      results.push(false); console.log(`FAIL ${results.length}. ${name}: ${error.message.split('\n')[0]}`);
      await page.screenshot({ path: `${OUT}/fail-${results.length}.png` }).catch(() => {});
    }
  };
  const pane = () => page.locator('[data-chat-pane]');
  const field = () => pane().locator('[data-chat-composer] textarea').first();
  const msg = key => page.locator(`[data-rehearsal-message="${key}"]`);
  const rows = key => msg(key).locator('[data-choice-list] button');
  const rowOf = (key, label) => msg(key).locator('[data-choice-list]').getByRole('button', { name: label, exact: true });
  const labelsOf = async key => (await rows(key).allInnerTexts()).map(norm);
  const disabledOf = key => rows(key).evaluateAll(buttons => buttons.map(b => b.disabled));
  const lineKeys = () => page.locator('[data-rehearsal-message^="line-"]').evaluateAll(els => els.map(e => e.dataset.rehearsalMessage));
  const snap = () => page.evaluate(() => ({
    messages: [...document.querySelectorAll('[data-rehearsal-message]')].map(el => {
      const rowsOf = [...el.querySelectorAll('[data-choice-list] button, [data-rehearsal-chip]')].map(b => b.textContent.replace(/\s+/g, ' ').trim());
      const copy = el.cloneNode(true); copy.querySelectorAll('[data-choice-list],[data-rehearsal-chips]').forEach(n => n.remove());
      return { key: el.dataset.rehearsalMessage, text: copy.textContent.replace(/\s+/g, ' ').trim(), rows: rowsOf, pending: !!el.querySelector('[data-rehearsal-pending]') };
    }),
    toc: (document.querySelector('[data-toc]')?.innerText || '').replace(/\s+/g, ' ').trim(),
  }));
  const textOf = async key => norm((await snap()).messages.find(m => m.key === key)?.text);
  const remember = async repo => { seen.push({ repo, ...(await snap()) }); };
  const shot = async name => { await sleep(300); await page.screenshot({ path: `${OUT}/${name}.png` }); };

  // The rendered draft: the first ordered list of the learn-plan message -> [{ title, sections: [title] }] (a list item's own text, its nested list taken out).
  const parseDraft = () => page.evaluate(() => {
    const ol = document.querySelector('[data-rehearsal-message="learn-plan"] ol');
    if (!ol) return null;
    const own = li => { const copy = li.cloneNode(true); copy.querySelectorAll('ol, ul').forEach(n => n.remove()); return copy.textContent.replace(/\s+/g, ' ').trim(); };
    return [...ol.children].filter(li => li.tagName === 'LI').map(li => ({ title: own(li), sections: [...li.querySelectorAll(':scope > ol > li')].map(own) }));
  });
  const titlesOf = draft => draft.flatMap(chapter => [noBackground(chapter.title), ...chapter.sections.map(noBackground)]);
  const sameDraft = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  // The draft is in: no pending line, a list, live rows.
  const draftReady = (ms = 240000) => waitFor(async () => {
    if (await msg('learn-plan').locator('[data-rehearsal-pending]').count()) return null;
    const draft = await parseDraft(), disabled = await disabledOf('learn-plan');
    return draft?.length && disabled.length && disabled.every(d => !d) ? draft : null;
  }, 'the plan draft with live rows', ms);
  // spec section 2 (the handler's rule) read from the rendered draft: 4-8 chapters, 2-5 sections each, no path, file name, flag or backtick in a title
  const BAD_TITLE = /[\/\\`]|\.(?:py|js|ts|md|json|txt|bin|pkl|pt)\b|^--/i;
  const assertShape = draft => {
    assert.ok(draft.length >= 4 && draft.length <= 8, `4-8 chapters (got ${draft.length})`);
    for (const chapter of draft) {
      assert.ok(chapter.sections.length >= 2 && chapter.sections.length <= 5, `2-5 sections under "${chapter.title}" (got ${chapter.sections.length})`);
      for (const title of [chapter.title, ...chapter.sections]) assert.ok(title && !BAD_TITLE.test(title), `a plain title, no file name, path or backtick: "${title}"`);
    }
  };
  const proposalCount = () => page.locator('[data-toc-proposal]').count();
  const assertProposal = async draft => {
    await waitFor(async () => (await proposalCount()) === 1, 'the contents panel shows the pending proposal ([data-toc-proposal])', 30000);
    const text = norm(await page.locator('[data-toc-proposal]').first().innerText());
    const n = Number(/Proposed: (\d+) change/.exec(text)?.[1]);
    assert.equal(n, draft.length + draft.flatMap(c => c.sections).length, 'the proposal carries one op per chapter and section');
  };

  // A fresh canvas of the repository to a picked Learn option: the Tutor's opening (source arrived, owner 2026-11-18 22:15) carries the options as rows.
  const begin = async repo => {
    const canvas = await repo.newCanvas();
    await page.goto(`${BASE}/apps/${canvas}`);
    await pane().waitFor({ state: 'visible', timeout: 60000 });
    await msg('intake').waitFor({ timeout: 120000 });
    return canvas;
  };
  const pick = async (repo, option) => {
    await rowOf('intake', option.label).click();
  };
  const optionOfKind = (repo, kind) => repo.options.find(o => o.kind === kind) || repo.options[0];
  const reloaded = async () => { await page.reload(); await pane().waitFor({ state: 'visible', timeout: 60000 }); await page.locator('[data-toc]').first().waitFor({ state: 'attached', timeout: 60000 }); };
  const savedPlan = (canvas, accepted = false) => waitFor(async () => (await api(`/api/learn/coaching?app=${canvas}&board=main`)).state.activities.map(a => a.checkpoint?.learn?.plan).find(p => p?.ops?.length && (!accepted || p.acceptedAt)), accepted ? 'the accepted plan is saved' : 'the draft is saved', 60000);
  // A typed line while the draft waits: the learner's line, then the draft live again.
  const edit = async words => {
    const before = (await lineKeys()).length;
    await field().fill(words); await field().press('Enter');
    await waitFor(async () => (await lineKeys()).length >= before + 1, `the line "${words}" shows`, 30000);
    await waitFor(async () => { const d = await disabledOf('learn-plan'); return d.length && d.every(x => !x); }, `the draft answers "${words}"`, 240000);
    return before;
  };

  // The contents panel after Accept: entries, titles, read-only, the current section.
  const tocEntries = () => page.evaluate(() => [...document.querySelectorAll('[data-toc-entry]:not([data-roadmap-step])')].map(el => ({
    level: Number(el.dataset.level), active: el.hasAttribute('data-active'),
    current: [...el.querySelectorAll('button')].some(b => b.getAttribute('aria-current') === 'location'),
    title: ([...el.querySelectorAll('button')].find(b => !b.closest('[data-no-drag]'))?.textContent || '').replace(/\s+/g, ' ').trim(),
  })));
  const assertReadOnly = async () => {
    assert.equal(await page.locator('[data-toc-proposal]').count(), 0, 'no proposal card in the contents');
    assert.equal(await page.locator('[data-toc] [data-toc-entry][draggable="true"]').count(), 0, 'no draggable entry');
    assert.equal(await page.locator('[data-toc] svg.cursor-grab').count(), 0, 'no drag grip');
    for (const selector of ['[data-toc-delete]', '[data-toc-more]', '[data-toc-add-link]', '[data-toc] button[aria-label^="Edit "]', '[data-toc] button[aria-label^="Add a "]', '[data-toc-editor]'])
      assert.equal(await page.locator(selector).count(), 0, `no ${selector}`);
    const circles = await page.locator('[data-toc] input[type="checkbox"]').evaluateAll(inputs => inputs.map(i => i.disabled));
    assert.ok(circles.length > 0 && circles.every(Boolean), 'every circle is disabled');
    assert.equal(await page.locator('[data-toc-composer]').count(), 0, 'no composer under the contents');
    assert.equal(await page.locator('textarea[placeholder="Describe your goal or refine the outline"]').count(), 0, 'TocConversation is not mounted');
    const first = page.locator('[data-toc] [data-toc-entry]:not([data-roadmap-step]) button:not([data-no-drag])').first();
    await first.dblclick({ timeout: 5000 }).catch(() => {});
    assert.equal(await page.locator('[data-toc-editor]').count(), 0, 'a double-click opens no editor');
    assert.equal(await page.getByText('Change the plan', { exact: false }).count(), 0, 'no "Change the plan" row anywhere');
  };
  const assertAccepted = async (draft, canvas) => {
    const chapters = draft.length;
    await waitFor(async () => (await textOf('learn-plan')) === `Plan accepted · ${chapters} chapters`, `the message reads "Plan accepted · ${chapters} chapters"`, 30000);
    assert.equal(await rows('learn-plan').count(), 0, 'the accepted message has no rows');
    const entries = await waitFor(async () => { const e = await tocEntries(); return e.length >= chapters + draft.flatMap(c => c.sections).length ? e : null; }, 'the contents list the plan', 30000);
    assert.equal(entries.length, chapters + draft.flatMap(c => c.sections).length, 'chapters + sections in the contents');
    assert.deepEqual(entries.map(e => lc(e.title)), titlesOf(draft).map(lc), 'the contents titles are the draft\'s, in order');
    assert.deepEqual(entries.map(e => e.level), draft.flatMap(c => [1, ...c.sections.map(() => 2)]), 'chapters at level 1, sections at level 2');
    await waitFor(async () => (await tocEntries()).some(e => e.active), 'a current entry', 15000);
    const now = await tocEntries(), active = now.filter(e => e.active);
    assert.equal(active.length, 1, 'one current entry');
    assert.equal(active[0], now.find(e => e.level === 2), 'the first level-2 entry is current (1.1)');
    assert.ok(active[0].current, 'it carries aria-current');
    await assertReadOnly();
    if (canvas) assert.ok((await savedPlan(canvas, true)).acceptedAt, 'the saved plan has acceptedAt');
  };

  // 1
  const canvasA = await nano.newCanvas();
  let first = null;
  await step('1 nanoGPT: a learn option: ONE titled draft, 4-8 chapters of 2-5 sections, plain titles, rows Accept + Change something, the contents show the same proposal', async () => {
    await page.goto(`${BASE}/apps/${canvasA}`);
    await pane().waitFor({ state: 'visible', timeout: 60000 });
    await msg('intake').waitFor({ timeout: 120000 });
    await pick(nano, optionOfKind(nano, 'science'));
    first = await draftReady();
    assert.equal(await msg('learn-plan').count(), 1, 'ONE learn-plan message');
    assertShape(first);
    assert.ok(norm(await msg('learn-plan').locator('strong').first().innerText()), 'the draft has a title');
    const labels = await labelsOf('learn-plan');
    for (const label of ['Accept', 'Change something']) assert.ok(labels.includes(label), `a row "${label}" (got ${labels.join(' | ')})`);
    await assertProposal(first);
    await shot('01-draft');
    await remember(nano);
  });

  // 2
  await step('2 nanoGPT: a reload before Accept shows the pending draft again, rows live, the proposal again', async () => {
    assert.ok(first, 'needs the draft of step 1');
    await savedPlan(canvasA);
    await reloaded();
    const again = await draftReady();
    assert.deepEqual(again, first, 'the same draft after a reload');
    const labels = await labelsOf('learn-plan');
    assert.ok(labels.includes('Accept') && labels.includes('Change something'), `Accept and Change something are back (got ${labels.join(' | ')})`);
    await assertProposal(again);
    await shot('02-reload-pending');
    await remember(nano);
  });

  // 3
  let current = null;
  await step('3 nanoGPT: "I don\'t want cross-entropy, but how this relates to word2vec": a new draft without entropy, a (background) section, Keep restores the previous one', async () => {
    assert.ok(first, 'needs the draft of step 1');
    await edit("I don't want cross-entropy, but how this relates to word2vec");
    const next = await draftReady();
    assert.ok(!sameDraft(next, first), 'a NEW draft (the title set changed)');
    assertShape(next);
    assert.ok(!titlesOf(next).some(title => /entropy/i.test(title)), 'no title contains "entropy"');
    assert.ok(next.some(chapter => chapter.sections.some(section => /\(background\)/i.test(section))), 'a section is marked (background)');
    const labels = await labelsOf('learn-plan');
    for (const label of ['Accept', 'Keep the previous draft']) assert.ok(labels.includes(label), `a row "${label}" (got ${labels.join(' | ')})`);
    await shot('03-edited');
    await remember(nano);
    await rowOf('learn-plan', 'Keep the previous draft').click();
    await waitFor(async () => sameDraft(await parseDraft(), first), 'Keep restores the previous draft\'s titles', 20000);
    current = await parseDraft();
  });

  // 4
  await step('4 nanoGPT: "add a chapter on deploying it to AWS": one answer line, the draft unchanged, a learn:* row (a doc.learn.options label) offered', async () => {
    assert.ok(current, 'needs the restored draft of step 3');
    const before = await edit('add a chapter on deploying it to AWS');
    const keys = await lineKeys();
    assert.equal(keys.length, before + 2, 'the learner\'s line and ONE answer line');
    const answer = await textOf(keys.at(-1));
    assert.ok(answer.length > 0, 'the answer says something');
    assert.deepEqual(await parseDraft(), current, 'the draft is unchanged');
    assert.ok(!titlesOf(current).some(title => /\b(aws|deploy)/i.test(title)), 'no deployment chapter was added');
    const optionLabels = nano.options.map(o => norm(o.label)), offered = [...await labelsOf('learn-plan'), ...await labelsOf(keys.at(-1))];
    assert.ok(offered.some(label => optionLabels.includes(label)), `a learn:* row is offered (rows: ${offered.join(' | ')}; options: ${optionLabels.join(' | ')})`);
    await shot('04-off-plan');
    await remember(nano);
  });

  // 5
  await step('5 nanoGPT: Accept: "Plan accepted · N chapters", the contents list the plan read-only, 1.1 is current, no "Change the plan"', async () => {
    assert.ok(current, 'needs the draft of step 3/4');
    await rowOf('learn-plan', 'Accept').click();
    await assertAccepted(current, canvasA);
    await shot('05-accepted');
    await remember(nano);
  });

  // 6
  await step('6 nanoGPT: a reload after Accept: "Plan accepted · N chapters" again and the contents still read-only', async () => {
    assert.ok(current, 'needs the accepted plan of step 5');
    await reloaded();
    await msg('learn-plan').waitFor({ timeout: 120000 });
    await assertAccepted(current, null);
    await shot('06-reload-accepted');
    await remember(nano);
  });

  // 7
  await step('7 datasette: the draft shape for its structure option, then Accept with the read-only contents', async () => {
    const canvas = await begin(data);
    await pick(data, optionOfKind(data, 'structure'));
    const draft = await draftReady();
    assertShape(draft);
    assert.ok(norm(await msg('learn-plan').locator('strong').first().innerText()), 'the draft has a title');
    const labels = await labelsOf('learn-plan');
    for (const label of ['Accept', 'Change something']) assert.ok(labels.includes(label), `a row "${label}" (got ${labels.join(' | ')})`);
    await assertProposal(draft);
    await remember(data);
    await rowOf('learn-plan', 'Accept').click();
    await assertAccepted(draft, canvas);
    await shot('07-datasette-accepted');
    await remember(data);
  });

  // 8
  await step('8 wording gate: no gate word in a fixed sentence or fixed row, fixed rows are the fixed set or document-derived, no dollar figure', async () => {
    assert.ok(seen.length >= 5, 'snapshots of the earlier steps exist');
    const GATE = /nanogpt|datasette|shakespeare|attention|tokens|word2vec/i, MONEY = /\$\s?\d|\busd\b|\bdollars?\b/i;
    const FIXED_ROWS = new Set(['Accept', 'Change something', 'Keep the previous draft', 'Try again', 'Start without a plan', 'Run it']);
    const problems = [];
    for (const { repo, messages, toc } of seen) {
      const optionLabels = new Set(repo.options.map(o => norm(o.label)));
      if (MONEY.test(toc)) problems.push(`${repo.key}: a dollar figure in the contents`);
      for (const m of messages) {
        if (MONEY.test(`${m.text} ${m.rows.join(' ')}`)) problems.push(`${repo.key} ${m.key}: a dollar figure`);
        for (const label of m.rows) {
          const derived = optionLabels.has(label) || /^Add .+ as background$/.test(label) || repo.doc.routes.some(r => label.startsWith(norm(r.title).replace(/[.\s]+$/, '')));
          if (!FIXED_ROWS.has(label) && label !== 'Something else' && !derived) problems.push(`${repo.key} ${m.key}: an unidentified row "${label}"`);
          if (FIXED_ROWS.has(label) && GATE.test(label)) problems.push(`${repo.key} ${m.key}: a gate word in the fixed row "${label}"`);
        }
        const fixed = m.key === 'learn-plan' && (m.pending || /^Plan accepted/.test(m.text)) ? m.text : ['learn-intro-failed'].includes(m.key) ? m.text : null; // the opening (intake) is the Tutor's own words now, not a fixed sentence
        if (fixed != null) {
          if (GATE.test(fixed)) problems.push(`${repo.key} ${m.key}: a gate word in the fixed sentence "${fixed}"`);
          if (m.key === 'learn-plan' && !m.pending && !/^Plan accepted · \d+ chapters?$/.test(fixed)) problems.push(`${repo.key}: the accepted line reads "${fixed}"`);
          if (m.key === 'learn-plan' && m.pending && fixed !== 'Drafting a plan') problems.push(`${repo.key}: the pending line reads "${fixed}"`);
        }
      }
    }
    assert.deepEqual([...new Set(problems)], []);
  });

  // 9
  await step('9 no page error and no 5xx from the learn routes during the run', async () => {
    assert.deepEqual(errors.filter(e => !/ResizeObserver/.test(e)), []);
    assert.deepEqual([...new Set(bad)], []);
  });
} catch (error) {
  failed = true;
  console.log(`setup failed: ${String(error.message).split('\n')[0]}`);
} finally {
  // Cleanup is this run's own: only the canvases and projects it made; a failure here is shown and does not stop the rest.
  await browser?.close().catch(error => console.log(`cleanup: browser ${error.message.split('\n')[0]}`));
  for (const name of made.canvases) await api(`/api/apps/${name}`, { method: 'DELETE' }).catch(error => console.log(`cleanup: canvas ${name}: ${error.message}`));
  for (const name of made.projects) await api(`/api/repositories/${name}`, { method: 'DELETE' }).catch(error => console.log(`cleanup: project ${name}: ${error.message}`));
}
const passed = results.filter(Boolean).length;
console.log(`${passed}/${total} learn plan checks passed${results.length === total ? '' : ` (ran ${results.length})`}${failed ? '; setup failed' : ''}`);
process.exitCode = passed === total && results.length === total && !failed ? 0 : 1;
