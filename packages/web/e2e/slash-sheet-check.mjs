import { openSlashHelp } from './canvas-menu-helpers.mjs';
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import { DEV_CP } from './dev-cp.mjs';
import { EXAMPLES } from '../src/learn-slash.js';
import { ANIMATION_OPTIONS, BRIEF_COMMANDS, PREVIEWS } from '../src/slash-sheet.js';
import { REMOVED_COMMANDS, SLASH, descFor } from '../src/agent/slash.js';

// View > Slash Commands (owner spec 2026-10-29 sections 7, 8 and 9; src/SlashCommandsSheet.jsx, SlashCommandPreview.jsx, slash-sheet.js):
// opened from View with a Chat draft written, which it keeps; the search is focused and filters by name and title; every listed
// command shows its registry title and description, its example and one preview on the example's subject, fitted to the stage (the
// whole card inside it, no outer scroller) just under its example; the owner's 2026-10-29 examples (C:/s/spec/slash-window/BRIEF-EXAMPLES.md)
// show their real results in the real cards; a generator's View brief switches the same stage to its brief; Use example closes the
// window and prepares the draft, never sending; at 1440x900, 1280x720 and 390x844, light and dark. No model call, search, capture
// or paid request is made. /animation offers a choice of examples (owner 2026-11-02): each option's experience, controls, request and
// brief, the experiments changing their readouts, the game won and lost, all on the local engine with no animation route called.
// usage: node e2e/slash-sheet-check.mjs [screenshot dir]
// A local stack instead: BASE=http://127.0.0.1:<app> SMALL_CP=http://127.0.0.1:<cp> node e2e/slash-sheet-check.mjs [dir] - a fresh
// canvas and a session minted with packages/control-plane/.dev.vars.
const LOCAL = process.env.BASE || null;
if (LOCAL && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(LOCAL)) throw Error('BASE must be a local stack');
const BASE = LOCAL || 'https://small-cp-dev-small-parallel.tryrabbithole.workers.dev';
const SHOTS = process.argv[2] || 'e2e/shots';
mkdirSync(SHOTS, { recursive: true });
let session;
if (LOCAL) {
  const secret = readFileSync(new URL('../../control-plane/.dev.vars', import.meta.url), 'utf8').match(/^TEST_BYPASS_SECRET=(.*)$/m)[1].trim();
  session = (await (await fetch(`${process.env.SMALL_CP}/test/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `slash-sheet-${Date.now().toString(36)}@example.com`, secret }) })).json()).session;
} else {
  const env = Object.fromEntries(readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8').split(/\r?\n/).map(l => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map(([, k, v]) => [k, v.replace(/^"|"$/g, '').trim()]));
  session = (await (await fetch(`${DEV_CP}/test/session`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'slash-sheet' }, body: JSON.stringify({ email: 'yudhisteer.chin@gmail.com', secret: env.RABBIT_HOLE_DEV_TEST_BYPASS }) })).json()).session;
}
let failed = 0, checks = 0;
const ok = (name, condition, extra = '') => { checks += 1; if (!condition) failed += 1; console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`); };
const browser = await chromium.launch();
const canvasName = LOCAL && (await (await fetch(`${BASE}/api/canvases`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: `small_session=${session}` }, body: JSON.stringify({ title: 'Slash sheet check' }) })).json()).name;
const errors = [], live = [];
// Anything that would generate, search, capture, grade, transcribe or save from the window.
const LIVE = /\/api\/(learn\/(artifact|image|video|scene|tts|search|photos|transcribe|coaching|webcard|explain|cad|motion|animation)|ask)\b/;
const VIEWPORTS = [{ width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 390, height: 844 }];
const draftText = 'a question I am still writing';

for (const scheme of ['light', 'dark']) for (const viewport of VIEWPORTS) {
  const tag = `${viewport.width}x${viewport.height}-${scheme}`;
  const context = await browser.newContext({ viewport, colorScheme: scheme });
  await context.addCookies([{ name: 'small_session', value: session, url: BASE }]);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(`${tag}: ${error.message.slice(0, 160)}`));
  page.on('request', request => { if (request.method() !== 'GET' && LIVE.test(new URL(request.url()).pathname)) live.push(`${tag} ${request.method()} ${request.url()}`); });
  await page.goto(LOCAL ? `${BASE}/apps/${canvasName}` : `${BASE}/apps/repo-06745f10-nanogpt?tab=learn&board=sheet-${Date.now().toString(36)}`);
  await page.getByRole('menubar', { name: 'Canvas menu' }).waitFor({ timeout: 60000 });
  const composer = page.locator('[data-chat-pane] [data-chat-composer] textarea').first();
  const hasComposer = await composer.isVisible().catch(() => false);
  if (hasComposer) await composer.fill(draftText);
  await openSlashHelp(page);
  const sheet = page.getByRole('dialog', { name: 'Slash Commands', exact: true });
  const search = sheet.locator('[data-slash-search]');
  ok(`${tag}: View > Slash Commands opens the window with its search focused`, await search.evaluate(node => node === document.activeElement));
  ok(`${tag}: title and subtitle`, (await sheet.locator('h2').innerText()) === 'Slash Commands' && await sheet.getByText('Choose a command to see what it does and try an example.').count() === 1
    && (await search.getAttribute('placeholder')) === 'Find a command');
  const narrow = viewport.width < 900;
  const listed = narrow
    ? await sheet.locator('[data-slash-select] option[data-slash-help]').evaluateAll(nodes => nodes.map(node => node.dataset.slashHelp))
    : await sheet.locator('button[data-slash-help]').evaluateAll(nodes => nodes.map(node => node.dataset.slashHelp));
  const offered = SLASH.map(command => command.name);
  // Owner, 2026-10-30 (docs/superpowers/plans/2026-10-30-animation.md sections 3 and 17): /animation is added, so 17 always offered of 19.
  ok(`${tag}: lists only registry commands, at least the 17 always offered, none removed`, listed.length >= 17 && listed.length <= 19 && listed.every(name => offered.includes(name)) && !listed.some(name => REMOVED_COMMANDS.includes(name)), listed.join(' '));
  const choose = async name => {
    if (narrow) await sheet.locator('[data-slash-select]').selectOption(name);
    else await sheet.locator(`button[data-slash-help="${name}"]`).click();
    await sheet.locator(`[data-slash-pane="${name}"]`).waitFor({ timeout: 10000 });
  };
  if (!narrow) {
    await search.fill('/flash');
    ok(`${tag}: typing filters by name, ignoring the leading /`, (await sheet.locator('button[data-slash-help]').evaluateAll(nodes => nodes.map(node => node.dataset.slashHelp))).join() === 'flashcards');
    await search.press('Enter');
    ok(`${tag}: Enter selects the first match`, await sheet.locator('[data-slash-pane="flashcards"]').count() === 1);
    await search.fill('zzz');
    ok(`${tag}: no match says so`, await sheet.getByText('No commands match').count() === 1);
    await search.press('Escape');
    ok(`${tag}: Esc clears the search and keeps the window open`, (await search.inputValue()) === '' && await sheet.isVisible());
  }
  // Every listed command: its title, description, example and one fitted preview; a generator's brief in the same stage.
  const fit = [];
  for (const name of listed) {
    await choose(name);
    const command = SLASH.find(entry => entry.name === name);
    const pane = sheet.locator(`[data-slash-pane="${name}"]`);
    const copy = (await pane.locator('[data-slash-label]').innerText()) === descFor(command, 'learn') && (await pane.locator('[data-slash-about]').innerText()) === command.about
      && (await pane.locator('[data-slash-example]').innerText()) === EXAMPLES[name];
    ok(`${tag}: /${name} shows its title, description and example`, copy);
    const shown = pane.locator('[data-slash-card], [data-slash-brief], [data-slash-goal], [data-slash-finder], [data-slash-unavailable]').first();
    await shown.waitFor({ timeout: 20000 });
    await page.waitForTimeout(name === 'graph' || name === 'diagram' || name === '3d' || name === 'explain' || name === 'animation' ? 1500 : 400);
    const measure = async () => pane.evaluate(node => {
      const stage = node.querySelector('[data-slash-stage]'), item = stage.firstElementChild;
      const s = stage.getBoundingClientRect(), c = item.getBoundingClientRect(), d = node.closest('[role="dialog"]').getBoundingClientRect();
      const card = stage.querySelector('[data-slash-card]');
      return { stage: `${Math.round(s.width)}x${Math.round(s.height)}`, item: `${Math.round(c.width)}x${Math.round(c.height)}`, gap: Math.round(c.top - s.top), inside: c.left >= s.left - 1 && c.right <= s.right + 1 && c.top >= s.top - 1 && c.bottom <= s.bottom + 1,
        overflow: card?.dataset.slashOverflow === 'true', page: document.scrollingElement.scrollHeight <= innerHeight + 1 && d.bottom <= innerHeight + 1 };
    });
    const result = await measure();
    fit.push(`${name} ${result.item} in ${result.stage}`);
    // A notebook, an article or a captured page scrolls in its own reader (owner, 2026-10-29); every other card shows all it holds.
    // /animation's card too, on a short stage: its scene shrinks and the card scrolls, so its controls are never clipped (asked for below).
    const reader = name === 'notebook' || name === 'wikipedia' || name === 'browser' || name === 'animation';
    ok(`${tag}: /${name} preview fits its stage (whole card, no outer scroll${reader ? '' : ', nothing hidden inside'})`, result.inside && result.page && (reader || !result.overflow), JSON.stringify(result));
    // Owner, 2026-10-29: no empty gap between the example and its preview; the title, description and Use example stay visible.
    ok(`${tag}: /${name} preview starts right under its example`, result.gap <= 2, String(result.gap));
    if (hasComposer) ok(`${tag}: /${name} Use example is visible`, await pane.locator(`[data-slash-use-example="${name}"]`).isVisible());
    // The owner's examples (C:/s/spec/slash-window/BRIEF-EXAMPLES.md): real results in the real cards.
    if (name === 'explain') ok(`${tag}: /explain draws the saved cooling program whole, with Play, the scrubber and the room temperature, Notes closed`,
      await pane.locator('[data-program-frame] svg').count() > 0 && await pane.locator('[data-animation-play]').isVisible() && await pane.locator('input[aria-label="Explanation time"]').isVisible()
      && await pane.locator('[data-input-control="room"]').isVisible() && await pane.locator('[data-program-notes] > ul:not([hidden])').count() === 0
      && await pane.locator('[data-program-card]').getAttribute('data-program-focus') === 'fit');
    if (name === 'image') ok(`${tag}: /photos shows a Pexels cat photo with its photographer, and no Generate offer`,
      await pane.locator('img[src^="https://images.pexels.com/"]').count() === 1 && await pane.getByText(/Photo by .+ on Pexels/).count() === 1
      && !(await pane.locator('[data-image-generate]').isVisible()) && await pane.locator('[data-image-generate-unavailable]').filter({ visible: true }).count() === 0);
    if (name === 'cad') ok(`${tag}: /cad shows the real model in the CAD viewer with its Interact tools`, await pane.locator('[data-cad-viewer]').count() === 1 && await pane.locator('[data-cad-interact]').count() === 1);
    if (name === 'animation') {
      ok(`${tag}: /animation opens on the saved pendulum scene, labelled as an example, with its length control`,
        await pane.locator('[data-animation3d-card][data-animation-experience="experiment"]').count() === 1 && await pane.locator('[data-animation-fixture-note]').isVisible()
        && await pane.locator('input[data-animation-number]').count() === 1 && await pane.locator('[data-animation3d-example]').count() === 0);
      const offered = narrow ? await pane.locator('[data-slash-option-select] option').evaluateAll(nodes => nodes.map(node => node.value)) : await pane.locator('[data-slash-option]').evaluateAll(nodes => nodes.map(node => node.dataset.slashOption));
      ok(`${tag}: /animation offers every example, one choice per scene`, offered.join() === ANIMATION_OPTIONS.map(option => option.id).join(), offered.join());
      const pick = async id => { if (narrow) await pane.locator('[data-slash-option-select]').selectOption(id); else await pane.locator(`[data-slash-option="${id}"]`).click(); };
      const value = id => pane.locator(`[data-animation-readout="${id}"]`).first().getAttribute('data-value').then(Number);
      const set = async (id, to) => { await pane.locator(`[data-animation-number="${id}"]`).fill(String(to)); await page.waitForFunction(([key, want]) => Number(document.querySelector(`[data-animation-number="${key}"]`)?.value) === want, [id, to]); await page.waitForTimeout(400); };
      const settled = () => pane.locator('[data-animation3d-card][data-animation-phase="ready"]').waitFor({ timeout: 20000 });
      for (const option of ANIMATION_OPTIONS) {
        await pick(option.id);
        await pane.locator(`[data-slash-card] [data-animation-badge="${option.kind.toLowerCase()}"]`).waitFor({ timeout: 20000 });
        await settled();
        await page.waitForTimeout(400);
        const inStage = await measure();
        const lines = [await pane.locator('[data-slash-example]').innerText(), await pane.locator('[data-slash-sample]').innerText(), await pane.locator('[data-animation-fixture-note]').innerText()];
        ok(`${tag}: /animation ${option.id}: the request and note are this example's, the card inside its stage`, lines[0] === option.request && lines[1].includes(option.note) && inStage.inside && inStage.page, JSON.stringify(inStage));
        ok(`${tag}: /animation ${option.id}: labelled truthfully`, option.id === 'pendulum' ? /made by \/animation/.test(lines[2]) : /not generated from a request/.test(lines[2]), lines[2]);
        ok(`${tag}: /animation ${option.id}: the choice shows which is selected`, narrow ? (await pane.locator('[data-slash-option-select]').inputValue()) === option.id
          : await pane.locator('[data-slash-option][aria-pressed="true"]').evaluateAll(nodes => nodes.map(node => node.dataset.slashOption).join()) === option.id);
        await page.screenshot({ path: `${SHOTS}/${tag}-animation-${option.id}.png` });
        if (option.id === 'temperature') {
          const start = [await value('topProbability')];
          await set('temperature', 0.1);
          const cold = await value('topProbability');
          await set('temperature', 5);
          const hot = await value('topProbability');
          ok(`${tag}: /animation temperature: low temperature sharpens and high flattens, by the formula`, Math.abs(start[0] - 60.70) < 0.05 && cold > 99.9 && Math.abs(hot - 28.77) < 0.05, `${start} ${cold} ${hot}`);
          await page.screenshot({ path: `${SHOTS}/${tag}-animation-temperature-hot.png` });
        }
        if (option.id === 'gradient') {
          const verdict = () => pane.locator('[data-animation-viewport]').getAttribute('data-animation-frame').then(frame => JSON.parse(frame).nodes.verdict.text);
          const seen = [await verdict()];
          for (const rate of [0.05, 0.55]) { await set('learningRate', rate); seen.push(await verdict()); await page.screenshot({ path: `${SHOTS}/${tag}-animation-gradient-${rate}.png` }); }
          ok(`${tag}: /animation gradient descent: good, slow and diverging`, /^Good/.test(seen[0]) && /^Too slow/.test(seen[1]) && /^Diverging/.test(seen[2]), seen.join(' | '));
          ok(`${tag}: /animation gradient descent: plays its steps`, await pane.locator('[data-animation3d-play]').isVisible());
        }
        if (option.id === 'perceptron') {
          const status = () => pane.locator('[data-animation-game]').getAttribute('data-animation-game');
          const train = async i => { await pane.locator(`[data-animation-action="train${i}"]`).click(); await page.waitForTimeout(150); };
          await pane.locator('[data-animation-hint]').click();
          ok(`${tag}: /animation neuron game: its hint opens`, /Begin with \(1,1\)/.test(await pane.locator('[data-animation-hint-text]').innerText()));
          for (const i of [3, 0, 1, 3, 2]) await train(i);
          await pane.locator('[data-animation-game="won"]').waitFor({ timeout: 5000 });
          ok(`${tag}: /animation neuron game: the five-update route wins`, /All four correct in 5 updates/.test(await pane.locator('[data-animation-outcome]').innerText()));
          await page.screenshot({ path: `${SHOTS}/${tag}-animation-perceptron-won.png` });
          await pane.locator('[data-animation-reset]').click();
          await pane.locator('[data-animation-game="playing"]').waitFor({ timeout: 5000 });
          for (let i = 0; i < 7; i += 1) await train(0);
          await pane.locator('[data-animation-game="lost"]').waitFor({ timeout: 5000 });
          ok(`${tag}: /animation neuron game: seven wasted updates lose`, await status() === 'lost' && /Out of updates/.test(await pane.locator('[data-animation-outcome]').innerText()));
        }
        if (option.id === 'predator-prey') {
          ok(`${tag}: /animation predator and prey: a watch card with Play and no settings`, await pane.locator('[data-animation3d-play]').isVisible() && await pane.locator('[data-animation-parameters]').count() === 0 && Math.abs(await value('prey') - 10) < 1e-6);
          await pane.locator('[data-animation3d-play]').click();
          await page.waitForFunction(() => Number(document.querySelector('[data-animation3d-card]')?.dataset.animationTime) > 1, null, { timeout: 15000 });
          ok(`${tag}: /animation predator and prey: playing moves the populations`, Math.abs(await value('prey') - 10) > 0.1);
          await pane.locator('[data-animation3d-play]').click();
        }
        if (BRIEF_COMMANDS.includes(name)) {
          await pane.locator('[data-slash-view="brief"]').click();
          await pane.locator('[data-slash-brief="animation"]').waitFor({ timeout: 10000 });
          ok(`${tag}: /animation ${option.id}: its brief, Generate disabled`, (await pane.locator('[data-slash-brief="animation"]').innerText()).includes(option.brief.title) && await pane.locator('[data-proposal-generate]').isDisabled());
          await pane.locator('[data-slash-view="result"]').click();
          await settled();
        }
      }
      await pick('pendulum');
      await settled();
      ok(`${tag}: the moon, beam and grid scenes stay out of the choice`, !offered.some(id => /orbit|beam|grid/.test(id)));
    }
    if (name === 'notebook') ok(`${tag}: /notebook opens the notebook card's JupyterLab frame`, await pane.locator('iframe[data-notebook-frame][data-notebook-preview]').count() === 1);
    if (name === 'youtube') ok(`${tag}: /youtube shows the 3Blue1Brown video in YouTube's player`, await pane.locator('iframe[src^="https://www.youtube-nocookie.com/embed/eMlx5fFNoYc"]').count() === 1 && await pane.getByText('Sourced · YouTube · 3Blue1Brown').count() === 1);
    if (name === 'wikipedia') ok(`${tag}: /wikipedia shows the Transformer article's opening and its source`, await pane.getByRole('heading', { name: 'Transformer (deep learning architecture)' }).count() === 1 && await pane.getByRole('link', { name: 'Open on Wikipedia' }).count() === 1);
    if (name === 'browser') ok(`${tag}: /browser shows the saved Illustrated Transformer capture in the webpage card with its source link`,
      /^The Illustrated Transformer/.test(await pane.locator('[data-webcard] h3').innerText()) && await pane.locator('[data-webcard-tile][data-loaded]').count() > 0
      && (await pane.locator('a[data-webcard-source]').getAttribute('href')) === 'https://jalammar.github.io/illustrated-transformer/');
    if (name === 'generate-image') ok(`${tag}: /image shows the saved generated lighthouse image, labelled AI-generated, with no Generate offer`,
      await pane.locator('img[src="/lesson-assets/slash-image-lighthouse-9bffc47d.png"]').count() === 1 && await pane.locator('[data-media-provenance="ai"]').count() === 1 && !(await pane.locator('[data-image-generate]').isVisible()));
    if (name === 'arxiv') ok(`${tag}: /arxiv shows the paper with its authors and abstract opening`, await pane.getByText('Ashish Vaswani, Noam Shazeer, Niki Parmar et al. · arXiv:1706.03762v7').count() === 1 && await pane.getByText(/The dominant sequence transduction models/).count() === 1);
    await page.screenshot({ path: `${SHOTS}/${tag}-${name}.png` });
    if (BRIEF_COMMANDS.includes(name) && PREVIEWS[name].kind !== 'none') {
      await pane.locator('[data-slash-view="brief"]').click();
      await pane.locator(`[data-slash-brief="${name}"]`).waitFor({ timeout: 10000 });
      const brief = await measure();
      ok(`${tag}: /${name} View brief shows its brief in the same stage, Generate disabled`, brief.inside && await pane.locator('[data-slash-card]').count() === 0 && await pane.locator('[data-proposal-generate]').isDisabled(), JSON.stringify(brief));
      await page.screenshot({ path: `${SHOTS}/${tag}-${name}-brief.png` });
      await pane.locator('[data-slash-view="result"]').click();
    }
  }
  console.log(`fit ${tag}: ${fit.join('; ')}`);
  // Use example: the window closes and the example becomes the draft's pill and words, after the draft already written; nothing sent.
  if (hasComposer && listed.includes('quiz')) {
    await choose('quiz');
    await sheet.locator('[data-slash-use-example="quiz"]').click();
    await sheet.waitFor({ state: 'detached', timeout: 5000 });
    const value = await composer.inputValue();
    ok(`${tag}: Use example keeps the written draft, adds the example's words and the quiz pill, and sends nothing`,
      value.startsWith(draftText) && value.endsWith("Newton's second law") && await page.locator('[data-chat-pane] [data-command-pill="quiz"]').count() >= 1, value);
    await page.screenshot({ path: `${SHOTS}/${tag}-use-example.png` });
  } else {
    await page.keyboard.press('Escape');
  }
  await context.close();
}
ok('no page errors and no live request from the window', errors.length === 0 && live.length === 0, `${errors.join(' | ')} ${live.join(' ')}`);
await browser.close();
console.log(`${checks - failed}/${checks} checks passed`);
process.exit(failed ? 1 : 0);
