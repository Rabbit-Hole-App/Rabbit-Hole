// Wiring of the combined Start (docs/features/start-sources.md) that no unit can reach without a browser: the destination page
// registers with the start job, every card kind the job queues has a branch there, and the Start host keeps the dialog out of the
// way once the destination exists. Text checks, so a rename that breaks the hand-off fails here rather than in a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('the destination page attaches to the start job and places each kind of card the job queues', () => {
  const page = read('LearnPage.jsx');
  assert.match(page, /import\('\.\/start-run\.js'\)\.then\(\(\{ startJob \}\) => \{ if \(!gone\) detach = startJob\.attach\(app\.name, item => startPlace\.current\(item\)\); \}\);/);
  assert.match(page, /if \(!learnPreview\) return undefined;\n    let detach = null, gone = false;/); // preview builds only, as the dialog is
  for (const branch of ["item.kind === 'file'", "item.kind === 'overview'", "type === 'webpage'"]) assert.ok(page.includes(branch), branch);
  // a PDF stored as a context document is placed from that copy, never uploaded again; every other file takes the drop road
  assert.match(page, /source: `doc:\$\{item\.doc\.id\}`[^\n]*\{ mode: 'pdf' \}/);
  assert.match(page, /await takeDrop\(\[item\.file\]\);/);
  assert.match(page, /graphCardBlock\(\{ name: item\.repository\.app/);
  assert.match(page, /\{ same: other => sameGraphCard\(other, block\) \}/); // a retry reveals the card, never a twin
  // the canvas hands back a webpage card's id when given a link
  assert.match(read('AdaptiveCanvas.jsx'), /insertWebpage: url => \{ if \(typeof url === 'string' && url\) return addWebpage\(url\);/);
});

test('every kind of item the job queues is one the page places', () => {
  const job = read('start-job.js'), page = read('LearnPage.jsx');
  const queued = [...job.matchAll(/kind: '(file|link|overview)'/g)].map(match => match[1]);
  assert.deepEqual([...new Set(queued)].sort(), ['file', 'link', 'overview']);
  for (const kind of ['file', 'overview']) assert.ok(page.includes(`item.kind === '${kind}'`), kind);
  assert.ok(page.includes('const { type, url } = item.link;')); // the remaining kind
});

test('the host steps the dialog aside once the destination exists and shows a chip until every source is settled', () => {
  const host = read('agent/StartHost.jsx');
  assert.match(host, /const away = draft\.phase === 'starting' && !!draft\.destination;/);
  assert.match(host, /\{path && !away && <StartDialog /);
  assert.match(host, /const chip = !path && draft\.destination && \(draft\.phase === 'starting' \|\| draft\.phase === 'partial'\);/);
  assert.match(host, /setPath\('review'\)/);
});

test('Home and Library open the neutral dialog; only the Repository menu item and a connect link reveal the repository input', () => {
  for (const file of ['Home.jsx', 'App.jsx']) assert.match(read(file), /new CustomEvent\('small:start', \{ detail: \{ path: 'start' \} \}\)/, file);
  const dialog = read('StartDialog.jsx');
  assert.match(dialog, /useState\(initial === 'repository' \? 'repository' : null\)/);
});
